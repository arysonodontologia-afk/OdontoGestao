// OdontoGestão · WhatsApp automático (personalização "whatsapp-automatico")
// O aplicativo mantém um resumo da agenda por dia para o Worker (wa/worker.js) enviar os avisos,
// grava a fila de "consulta agendada", aplica as respostas dos pacientes e mostra a configuração.
(function(){
const CHAVE_WA='whatsapp-automatico';
const DIAS_RESUMO=14;
let modelosPed={}, usoMes={}, statusServ=null, cfg=null, cfgLido=false, ouvindo=false, logs=[], respProc=new Set(), ultimos={}, limpezaFeita=false, timerSync=null, urlWebhook='';

function liberado(){ return !!(NUVEM && fichaPers() && temPersonalizacaoChave(CHAVE_WA)); }
window.waLiberado=liberado;
const isoMais=(n)=>{ const d=new Date(hojeISO()+'T12:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const fusoUF={AC:'America/Rio_Branco',AM:'America/Manaus',RR:'America/Boa_Vista',RO:'America/Porto_Velho',MT:'America/Cuiaba',MS:'America/Campo_Grande',PA:'America/Belem',AP:'America/Belem',TO:'America/Araguaina',MA:'America/Fortaleza',PI:'America/Fortaleza',CE:'America/Fortaleza',RN:'America/Fortaleza',PB:'America/Fortaleza',PE:'America/Recife',AL:'America/Maceio',SE:'America/Maceio',BA:'America/Bahia'};
function fusoClinica(){ const uf=((state.clinic&&state.clinic.end&&state.clinic.end.uf)||'').toUpperCase(); return fusoUF[uf]||'America/Sao_Paulo'; }
function fonePac(pc){ return (pc&&(pc.whatsapp||pc.celular||pc.telefone))||''; }
function nomeDent(u){ const n=String(u.nomeCompleto||u.username||'').trim(); return (u.sexo==='F'?'Dra. ':u.sexo==='M'?'Dr. ':'')+n; }

// ---------- início da sessão ----------
window.waIniciar=async function(){
  if(!liberado()) return;
  cfg=await Nuvem.waLer('wa','config'); cfgLido=true;
  try{ const d=await Nuvem.lerPlataforma('wa'); urlWebhook=(d&&d.url)?d.url.replace(/\/$/,'')+'/webhook':''; }catch(e){}
  try{ statusServ=await Nuvem.lerPlataforma('waStatus'); }catch(e){}
  if(!ouvindo){
    ouvindo=true;
    Nuvem.waOuvir('waRespostas',aplicarRespostas);
    const u=currentUser(); if(u && u.tipo==='master'){
      const naTela=()=>{ if(currentTab==='configuracoes' && configSubTab==='whatsapp' && podeAtualizarSozinho()) render(); };
      Nuvem.waOuvir('waLog',l=>{ logs=l.sort((a,b)=>(b.em||0)-(a.em||0)); naTela(); });
      Nuvem.waOuvir('waModelos',l=>{ modelosPed={}; l.forEach(m=>{ modelosPed[m.id]=m; }); naTela(); });
      Nuvem.waOuvir('waUso',l=>{ usoMes={}; l.forEach(m=>{ usoMes[m.id]=m; }); naTela(); if(currentTab==='dashboard' && podeAtualizarSozinho()) render(); });
    }
  }
  if(cfg && cfg.ativo) sincronizarDias(true);
};

// ---------- resumo da agenda por dia (o Worker só lê isto) ----------
function resumoDia(data){
  const itens=(state.agendamentos||[]).filter(a=>a.data===data).map(a=>{ const pc=pacPorId(a.pacienteId);
    return {agId:a.id,horario:a.horario,pacienteNome:a.pacienteNome||'',telefone:fonePac(pc),dentistaId:a.dentistaId||'',dentistaNome:a.dentistaNome||'',motivo:motivoAg(a),status:statusAg(a)}; })
    .sort((x,y)=>x.horario.localeCompare(y.horario));
  const dentistas=(state.users||[]).filter(u=>usuarioAtivo(u)&&ehDentista(u)).map(u=>({id:u.id,nome:nomeDent(u),whatsapp:u.whatsapp||'',recebeAgenda:u.agendaDiaria!==false}));
  return {itens,dentistas};
}
async function sincronizarDias(forcar){
  if(!liberado() || !cfg || !cfg.ativo) return;
  for(let i=0;i<=DIAS_RESUMO;i++){
    const data=isoMais(i), r=resumoDia(data), h=JSON.stringify(r);
    if(ultimos[data]===h) continue;
    try{ await Nuvem.waGravar('waDia',data,Object.assign(r,{atualizadoEm:Date.now()})); ultimos[data]=h; }catch(e){ console.warn('waDia',e); return; }
  }
  if(!limpezaFeita){ limpezaFeita=true; try{ const hoje=hojeISO(); for(let i=1;i<=10;i++){ const d=isoMais(-i); if(d<hoje) await Nuvem.waApagar('waDia',d).catch(()=>{}); } }catch(e){} }
}
window.waAposSalvar=function(){ if(!cfg||!cfg.ativo) return; clearTimeout(timerSync); timerSync=setTimeout(()=>sincronizarDias(false),1500); };

// ---------- confirmação ao marcar ----------
window.waNovaConsulta=function(a){
  if(!liberado()||!cfg||!cfg.ativo||cfg.confirmarAoMarcar===false||!a||a.data<hojeISO()) return;
  const pc=pacPorId(a.pacienteId), tel=fonePac(pc); if(!tel) return;
  Nuvem.waGravar('waFila',uid(),{agId:a.id,data:a.data,horario:a.horario,pacienteNome:a.pacienteNome||'',telefone:tel,dentistaNome:a.dentistaNome||'',motivo:motivoAg(a),criadoEm:Date.now()}).catch(e=>console.warn('waFila',e));
};

// ---------- respostas dos pacientes (botões do lembrete) ----------
async function aplicarRespostas(lista){
  for(const r of lista){
    if(respProc.has(r.id)) continue; respProc.add(r.id);
    const a=(state.agendamentos||[]).find(x=>x.id===r.agId);
    if(a){
      const st=statusAg(a);
      if(r.acao==='confirmar' && (st==='agendado'||st==='nao_vem')) await mudarStatusAg(a.id,'confirmado');
      if(r.acao==='remarcar' && (st==='agendado'||st==='confirmado')) await mudarStatusAg(a.id,'nao_vem');
      a.respostaWhatsApp={acao:r.acao,em:r.em||Date.now()};
    }
    try{ await Nuvem.waApagar('waRespostas',r.id); }catch(e){}
  }
}

// ---------- tela de configuração (Master) ----------
window.waTelaHtml=function(){
  if(!cfgLido){ waIniciar().then(()=>{ if(configSubTab==='whatsapp') render(); }); return '<div class="card"><p class="muted">Carregando…</p></div>'; }
  const c=cfg||{}, sim=c.simulacao!==false, conectado=!!(c.phoneNumberId && c.tokenSalvoEm);
  const dents=(state.users||[]).filter(u=>usuarioAtivo(u)&&ehDentista(u));
  const semZap=dents.filter(u=>u.agendaDiaria!==false && !u.whatsapp).map(u=>nomeDent(u));
  const fmt=t=>t?new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  const TIPO={lembrete:'Lembrete da véspera',agendada:'Consulta agendada',agenda:'Agenda do dentista'};
  const ult=logs.slice(0,30).map(l=>`<li class="wa-log${l.ok?'':' wa-log-erro'}"><div class="wa-log-cab"><strong>${esc(TIPO[l.tipo]||l.tipo)}</strong> <span class="muted">· ${esc(fmt(l.em))} · para ${esc(l.para||'—')} · ${l.simulado?'simulação':l.ok?'enviado':'falhou'}</span></div>
    <div class="wa-bolha">${esc(l.texto||'')}${l.tipo==='lembrete'?'<div class="wa-botoes"><span>Confirmo</span><span>Preciso remarcar</span></div>':''}</div>
    ${l.erro?`<div class="erro-campo">${esc(l.erro)}</div>`:''}
    ${l.simulado&&l.tipo==='lembrete'&&l.agId?`<div class="wa-sim"><span class="muted">Simular a resposta do paciente:</span><button class="btn-s" data-wasim="C|${esc(l.agId)}">Confirmo</button><button class="btn-s" data-wasim="R|${esc(l.agId)}">Preciso remarcar</button></div>`:''}</li>`).join('');
  return `<div class="card wa-cfg">
    <div class="wa-topo"><div><h3 style="margin:0">WhatsApp automático</h3><p class="muted" style="margin:4px 0 0">Avisos enviados pelo número da clínica, com resposta do paciente direto na agenda.</p></div>
      <label class="wa-chave"><input type="checkbox" id="waAtivo" ${c.ativo?'checked':''}> Ligado</label></div>
    <div class="wa-modo"><label><input type="radio" name="waModo" value="sim" ${sim?'checked':''}> <strong>Simulação</strong> <span class="muted">— nada é enviado; as mensagens aparecem abaixo</span></label>
      <label><input type="radio" name="waModo" value="real" ${!sim?'checked':''} ${conectado?'':'disabled'}> <strong>Envio real</strong> <span class="muted">${conectado?'— pelo número conectado':'— conecte o número primeiro'}</span></label></div>
    <h4>Avisos</h4>
    <div class="wa-aviso"><label class="chk-linha"><input type="checkbox" id="waAgendada" ${c.confirmarAoMarcar!==false?'checked':''}> Confirmação assim que a consulta é marcada</label>${linhaModelo('agendada')}</div>
    <div class="wa-aviso"><label class="chk-linha"><input type="checkbox" id="waVespera" ${c.lembreteVespera!==false?'checked':''}> Lembrete na véspera, com os botões "Confirmo" e "Preciso remarcar", às <input type="time" id="waHora" value="${esc(c.lembreteHora||'10:00')}" style="width:auto;display:inline-block;padding:4px 8px;margin:0 4px"></label>${linhaModelo('lembrete')}</div>
    <div class="wa-aviso"><label class="chk-linha"><input type="checkbox" id="waAgDent" ${c.agendaDentista!==false?'checked':''}> Agenda do dia às 07:30 para os dentistas (cada um escolhe no próprio cadastro)</label>${linhaModelo('agenda')}</div>
    ${semZap.length?`<p class="muted" style="font-size:12.5px;margin:4px 0 0">Sem WhatsApp no cadastro (não recebem a agenda): ${esc(semZap.join(', '))}.</p>`:''}
    <p class="muted" style="font-size:12.5px">Horários no fuso da clínica (${esc(fusoClinica().replace('America/',''))}). Quando o paciente toca "Confirmo", a consulta fica confirmada; em "Preciso remarcar", vira "Não vem, contatar" e aparece em Respostas dos pacientes no Painel.</p>
    <h4>Número da clínica</h4>
    <p class="muted" style="font-size:13px;margin-top:0">${conectado?`Conectado (ID do número ${esc(c.phoneNumberId)}) desde ${esc(fmt(c.tokenSalvoEm))}.`:'Ainda não conectado. Enquanto isso, use a simulação.'}</p>
    <details class="wa-conexao"${conectado?'':' open'}><summary>${conectado?'Trocar a conexão':'Conectar pelo painel da Meta (piloto)'}</summary>
      <div class="row"><div><label>ID do número de telefone (Phone number ID)</label><input id="waNumId" inputmode="numeric" value="${esc(c.phoneNumberId||'')}"></div>
      <div><label>ID da conta do WhatsApp Business (opcional)</label><input id="waWaba" inputmode="numeric" value="${esc(c.wabaId||'')}"></div></div>
      <label>Token de acesso permanente (usuário do sistema)</label><input id="waTok" type="password" autocomplete="off" placeholder="${c.tokenSalvoEm?'•••••• (guardado; preencha só para trocar)':'Cole o token aqui'}">
      <p class="muted" style="font-size:12.5px">O token fica guardado de forma que nem o aplicativo consegue ler de volta; só o serviço de envio usa.</p>
      ${urlWebhook?`<p class="muted" style="font-size:12.5px">Webhook para a Meta: <code>${esc(urlWebhook)}</code></p>`:''}
    </details>
    <label style="margin-top:12px">Resposta automática para mensagens escritas <span class="muted">(opcional; use se este número for só de avisos)</span></label>
    <textarea id="waRespTexto" rows="2" maxlength="900" placeholder="Ex.: Este número só envia avisos. Para falar com a recepção: wa.me/5592999999999">${esc(c.respostaTexto||'')}</textarea>
    <p class="muted" style="font-size:12.5px;margin:2px 0 0">Vai no máximo uma vez por dia para cada paciente. Deixe em branco se a recepção atende por este mesmo número.</p>
    <p class="erro-campo" id="waErro" role="alert"></p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn-p" id="waSalvar">Salvar</button></div>
  </div>
  ${consumoHtml(c)}
  <div class="card"><h3 style="margin:0 0 4px">Últimos envios</h3><p class="muted" style="font-size:12.5px;margin:0 0 10px">${statusServ&&statusServ.em?'Última verificação do serviço: '+esc(fmt(statusServ.em))+((statusServ.clinicas||{})[Nuvem.clinicaId()]?' · '+esc(statusServ.clinicas[Nuvem.clinicaId()]):''):'O serviço de envio ainda não fez nenhuma verificação.'}${urlWebhook?` · <a href="${esc(urlWebhook.replace(/\/webhook$/,'/diagnostico'))}" target="_blank" rel="noopener">diagnóstico</a>`:''}</p>${ult?`<ul class="wa-logs">${ult}</ul>`:'<p class="muted">Nenhuma mensagem ainda. Com o WhatsApp ligado, os avisos aparecem aqui em até 5 minutos depois do horário.</p>'}</div>`;
};
// ---------- mensagens personalizadas ----------
const PADRAO={
  lembrete:'Olá, {paciente}! Lembrete da sua consulta na {clinica}: {data}, às {hora}, com {dentista}. Motivo: {motivo}. Você confirma a presença?',
  agendada:'Olá, {paciente}! Sua consulta na {clinica} foi agendada para {data}, às {hora}, com {dentista}. Motivo: {motivo}. Até lá!',
  agenda:'Bom dia, {dentista}! Sua agenda de hoje ({data}) na {clinica}: {lista}. {resumo} Bom trabalho!'};
const CAMPOS={lembrete:['paciente','clinica','data','hora','dentista','motivo'],agendada:['paciente','clinica','data','hora','dentista','motivo'],agenda:['dentista','data','clinica','lista','resumo']};
const ROTULO={paciente:'Nome do paciente',clinica:'Clínica',data:'Data',hora:'Hora',dentista:'Dentista',motivo:'Motivo',lista:'Lista de pacientes',resumo:'Resumo'};
const EXEMPLO={paciente:'Maria',clinica:'Clínica Sorriso',data:'quinta-feira, 12/11/2026',hora:'09:00',dentista:'Dra. Ana',motivo:'Avaliação',lista:'08:00 Rita (Avaliação) · 10:00 Carlos (Restauração) ✓',resumo:'2 atendimentos, 1 confirmado.'};
const NOME_AVISO={lembrete:'Lembrete da véspera',agendada:'Consulta agendada',agenda:'Agenda do dentista'};
function textoAtual(tipo){ const p=((cfg||{}).personal||{})[tipo]; return (p&&p.texto)||PADRAO[tipo]; }
function linhaModelo(tipo){
  const m=modelosPed[tipo], p=((cfg||{}).personal||{})[tipo];
  let st='';
  if(m && m.status==='novo') st='<span class="sit sit-agendado">Enviando para a Meta…</span>';
  else if(m && m.status==='em_analise') st='<span class="sit sit-agendado">Em análise pela Meta</span>';
  else if(m && m.status==='rejeitado') st=`<span class="sit sit-faltou" title="${esc(m.motivo||'')}">Recusada pela Meta</span> <span class="muted" style="font-size:12px">${esc(m.motivo||'')}</span>`;
  else if(p && p.status==='aprovado') st='<span class="sit sit-chegou">Personalizada (aprovada)</span>';
  else if(p && p.status==='simulado') st='<span class="sit sit-agendado">Personalizada (só na simulação)</span>';
  return `<div class="wa-modelo-linha"><button type="button" class="lnk" data-wamodelo="${tipo}">Personalizar mensagem</button>${st}</div>`;
}
function validarTexto(tipo,t){
  if(t.length<20) return 'A mensagem está curta demais.';
  if(t.length>900) return 'A mensagem passou de 900 caracteres.';
  if(/^\s*\{\w+\}/.test(t) || /\{\w+\}\s*[.!?]?\s*$/.test(t)) return 'A Meta não aceita mensagem que começa ou termina com um campo. Coloque um texto antes e depois.';
  if(/\}\s*\{/.test(t)) return 'A Meta não aceita dois campos seguidos. Coloque um texto entre eles.';
  const des=(t.match(/\{(\w+)\}/g)||[]).map(x=>x.slice(1,-1)).filter(k=>!CAMPOS[tipo].includes(k));
  if(des.length) return 'Campo desconhecido: {'+des[0]+'}. Use os botões para inserir os campos.';
  if(/\n{3,}/.test(t)) return 'Use no máximo uma linha em branco seguida.';
  return '';
}
function abrirEditor(tipo){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal wa-editor" role="dialog" aria-label="Personalizar mensagem"><h3 style="margin:0 0 4px">${esc(NOME_AVISO[tipo])}</h3>
    <p class="muted" style="margin:0 0 10px;font-size:13px">Toque num campo para inserir no ponto do cursor. ${tipo==='lembrete'?'Os botões "Confirmo" e "Preciso remarcar" entram sozinhos no fim. ':''}No envio real, a Meta precisa aprovar a mensagem nova (de minutos a algumas horas); até lá vale a anterior.</p>
    <div class="wa-chips">${CAMPOS[tipo].map(k=>`<button type="button" class="btn-s" data-wacampo="${k}">${esc(ROTULO[k])}</button>`).join('')}</div>
    <textarea id="waTexto" rows="5">${esc(textoAtual(tipo))}</textarea>
    <div class="muted" style="font-size:12px;text-align:right" id="waConta"></div>
    <div class="wa-previa"><div class="muted" style="font-size:12px;margin-bottom:4px">Como o paciente vê</div><div class="wa-bolha" id="waPrevia"></div></div>
    <p class="erro-campo" id="waEdErro" role="alert"></p>
    <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:10px"><button class="btn-s" id="waPadrao">Voltar ao padrão</button><span style="display:flex;gap:8px"><button class="btn-s" data-fechar>Cancelar</button><button class="btn-p" id="waEdSalvar">Salvar mensagem</button></span></div></div>`;
  document.body.appendChild(bg);
  const ta=bg.querySelector('#waTexto'), pv=bg.querySelector('#waPrevia'), er=bg.querySelector('#waEdErro');
  if(state.clinic&&state.clinic.nome) EXEMPLO.clinica=state.clinic.nome;
  const atualizar=()=>{ const t=ta.value; pv.innerHTML=esc(t.replace(/\{(\w+)\}/g,(m,k)=>EXEMPLO[k]!==undefined?EXEMPLO[k]:m)).replace(/\n/g,'<br>')+(tipo==='lembrete'?'<div class="wa-botoes"><span>Confirmo</span><span>Preciso remarcar</span></div>':''); bg.querySelector('#waConta').textContent=t.length+' / 900'; er.textContent=t.trim()?validarTexto(tipo,t.trim()):''; };
  ta.addEventListener('input',atualizar); atualizar();
  bg.querySelectorAll('[data-wacampo]').forEach(b=>b.addEventListener('click',()=>{ const k='{'+b.getAttribute('data-wacampo')+'}', i=ta.selectionStart??ta.value.length, j=ta.selectionEnd??i; ta.value=ta.value.slice(0,i)+k+ta.value.slice(j); ta.focus(); ta.selectionStart=ta.selectionEnd=i+k.length; atualizar(); }));
  const fechar=()=>bg.remove();
  bg.querySelector('[data-fechar]').addEventListener('click',fechar);
  bg.querySelector('#waEdSalvar').addEventListener('click',async()=>{
    const t=ta.value.trim().replace(/[ \t]+/g,' '), e=validarTexto(tipo,t); if(e){ er.textContent=e; return; }
    if(t===textoAtual(tipo)){ fechar(); return; }
    try{ await Nuvem.waGravar('waModelos',tipo,{texto:t,status:'novo',pedidoEm:Date.now()}); fechar(); avisarRapido((cfg&&cfg.simulacao!==false)?'Mensagem salva. Já vale na simulação.':'Mensagem enviada para aprovação da Meta.'); render(); }
    catch(x){ er.textContent=Nuvem.mapErro(x); }
  });
  bg.querySelector('#waPadrao').addEventListener('click',async()=>{
    try{ await Nuvem.waGravar('waModelos',tipo,{texto:'',status:'restaurar',pedidoEm:Date.now()}); fechar(); avisarRapido('Mensagem padrão restaurada (vale a partir da próxima verificação do serviço).'); render(); }
    catch(x){ er.textContent=Nuvem.mapErro(x); }
  });
}

// ---------- consumo do mês ----------
const PRECO_EST=0.04;   // R$ por aviso (estimativa da tarifa de Utilidade da Meta no Brasil); a cobrança real vem da Meta
function mesAtual(){ return hojeISO().slice(0,7); }
function projecaoMes(c){
  const hoje=hojeISO(), mes=mesAtual(), fim=new Date(+mes.slice(0,4),+mes.slice(5,7),0).getDate();
  let n=0;
  const fut=(state.agendamentos||[]).filter(a=>a.data>hoje && a.data.slice(0,7)===mes && ['agendado','confirmado'].includes(statusAg(a)));
  if(c.lembreteVespera!==false) n+=fut.filter(a=>statusAg(a)==='agendado').length;
  if(c.agendaDentista!==false){
    const dents=(state.users||[]).filter(u=>usuarioAtivo(u)&&ehDentista(u)&&u.whatsapp&&u.agendaDiaria!==false).map(u=>u.id);
    const dias=new Set(fut.filter(a=>dents.includes(a.dentistaId)).map(a=>a.data+'|'+a.dentistaId)); n+=dias.size;
  }
  return n;
}
function consumoHtml(c){
  const u=usoMes[mesAtual()]||{}, tot=+u.total||0, lim=+c.limiteMensal||0, proj=tot+projecaoMes(c);
  const sim=(+u.sim_lembrete||0)+(+u.sim_agendada||0)+(+u.sim_agenda||0);
  const pct=lim?Math.min(100,Math.round(tot/lim*100)):0;
  const brl=v=>fmtBRL(v);
  return `<div class="card wa-consumo"><h3 style="margin:0 0 4px">Consumo do mês</h3>
    <p class="muted" style="margin:0 0 10px;font-size:13px">A Meta cobra cada aviso enviado no cartão cadastrado na conta Business da clínica. Valores estimados (cerca de ${brl(PRECO_EST)} por aviso); o valor exato aparece na fatura da Meta.</p>
    <div class="wa-numeros">
      <div><span class="muted">Enviados</span><strong>${tot}</strong><span class="muted">≈ ${brl(tot*PRECO_EST)}</span></div>
      <div><span class="muted">Previsão até o fim do mês</span><strong>${proj}</strong><span class="muted">≈ ${brl(proj*PRECO_EST)}</span></div>
      <div><span class="muted">Por tipo</span><span>Lembretes: ${+u.lembrete||0}</span><span>Consultas marcadas: ${+u.agendada||0}</span><span>Agenda dos dentistas: ${+u.agenda||0}</span></div>
    </div>
    ${sim?`<p class="muted" style="font-size:12.5px">Simulados neste mês (não cobrados): ${sim}.</p>`:''}
    <div class="wa-limite"><label>Limite de avisos por mês <span class="muted">(0 = sem limite)</span></label><span style="display:flex;gap:8px;align-items:center"><input id="waLimite" type="number" min="0" step="10" value="${lim}" style="max-width:140px;margin:0"><button class="btn-s" id="waSalvarLim">Salvar limite</button></span>
      ${lim?`<div class="as-barra"><span style="width:${pct}%;${pct>=80?'background:var(--danger,#c0392b)':''}"></span></div><p class="muted" style="font-size:12.5px;margin:4px 0 0">${tot} de ${lim} (${pct}%).${proj>lim?` <strong>A previsão do mês (${proj}) passa do limite</strong>: aumente o limite ou alguns avisos vão pausar.`:''}${pct>=100?' <strong>Limite atingido: os avisos estão pausados.</strong>':pct>=80?' Perto do limite.':''}</p>`:''}
    </div></div>`;
}
window.waAvisoPainel=function(){
  if(!liberado()||!cfg||!cfg.ativo||cfg.simulacao!==false) return '';
  const u=currentUser(); if(!u||u.tipo!=='master') return '';
  const lim=+cfg.limiteMensal||0; if(!lim) return '';
  const tot=+((usoMes[mesAtual()]||{}).total)||0, pct=Math.round(tot/lim*100);
  if(pct<80) return '';
  return `<div class="faixa-plano${pct>=100?' bloqueada':''}" role="status"><div><strong>WhatsApp automático: ${tot} de ${lim} avisos do mês (${Math.min(pct,100)}%).</strong> ${pct>=100?'Os avisos estão pausados até você aumentar o limite.':'Perto do limite mensal.'}</div><button class="lnk-forte" data-waconsumo>Ver consumo</button></div>`;
};
window.waTelaLigar=function(){
  const q=id=>document.getElementById(id); if(!q('waSalvar')) return;
  q('waSalvar').addEventListener('click',async()=>{
    const b=q('waSalvar'), erro=t=>{ q('waErro').textContent=t; };
    const hora=q('waHora').value||'10:00', numId=q('waNumId').value.trim(), tok=q('waTok').value.trim();
    const real=(document.querySelector('[name="waModo"]:checked')||{}).value==='real';
    if(numId && !/^\d{6,25}$/.test(numId)) return erro('O ID do número tem só dígitos (copie do painel da Meta).');
    if(tok && tok.length<30) return erro('O token parece incompleto.');
    const novo=Object.assign({},cfg||{},{ativo:q('waAtivo').checked,simulacao:!real,confirmarAoMarcar:q('waAgendada').checked,lembreteVespera:q('waVespera').checked,lembreteHora:hora,
      agendaDentista:q('waAgDent').checked,limiteMensal:Math.max(0,parseInt(q('waLimite').value,10)||0),respostaTexto:(q('waRespTexto').value||'').trim().slice(0,900),phoneNumberId:numId,wabaId:q('waWaba').value.trim(),fuso:fusoClinica(),nomeClinica:(state.clinic&&state.clinic.nome)||'',atualizadoEm:Date.now()});
    b.disabled=true; b.textContent='Salvando…';
    try{
      if(tok){ await Nuvem.waGravar('waSegredo','token',{token:tok,em:Date.now()}); novo.tokenSalvoEm=Date.now(); }
      if(!numId) novo.tokenSalvoEm=novo.tokenSalvoEm||0;
      await Nuvem.waGravar('wa','config',novo); cfg=novo;
      if(cfg.ativo){ ultimos={}; await sincronizarDias(true); }
      avisarRapido(cfg.ativo?(cfg.simulacao?'WhatsApp automático ligado em simulação.':'WhatsApp automático ligado.'):'WhatsApp automático desligado.'); render();
    }catch(e){ console.error(e); b.disabled=false; b.textContent='Salvar'; erro(Nuvem.mapErro(e)); }
  });
  if(q('waSalvarLim')) q('waSalvarLim').addEventListener('click',()=>q('waSalvar').click());
  document.querySelectorAll('[data-wamodelo]').forEach(x=>x.addEventListener('click',()=>abrirEditor(x.getAttribute('data-wamodelo'))));
  document.querySelectorAll('[data-wasim]').forEach(x=>x.addEventListener('click',async()=>{
    const [ac,agId]=x.getAttribute('data-wasim').split('|'); x.disabled=true;
    try{ await Nuvem.waGravar('waRespostas',uid(),{agId,acao:ac==='C'?'confirmar':'remarcar',telefone:'simulação',em:Date.now()}); avisarRapido(ac==='C'?'Resposta simulada: paciente confirmou.':'Resposta simulada: paciente pediu para remarcar.'); }
    catch(e){ x.disabled=false; avisar(Nuvem.mapErro(e)); }
  }));
};
})();
