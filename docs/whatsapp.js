// OdontoGestão · WhatsApp automático (personalização "whatsapp-automatico")
// O aplicativo mantém um resumo da agenda por dia para o Worker (wa/worker.js) enviar os avisos,
// grava a fila de "consulta agendada", aplica as respostas dos pacientes e mostra a configuração.
(function(){
const CHAVE_WA='whatsapp-automatico';
const DIAS_RESUMO=14;
let cfg=null, cfgLido=false, ouvindo=false, logs=[], respProc=new Set(), ultimos={}, limpezaFeita=false, timerSync=null, urlWebhook='';

function liberado(){ return !!(NUVEM && fichaClinica() && temPersonalizacaoChave(CHAVE_WA)); }
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
  if(!ouvindo){
    ouvindo=true;
    Nuvem.waOuvir('waRespostas',aplicarRespostas);
    const u=currentUser(); if(u && u.tipo==='master') Nuvem.waOuvir('waLog',l=>{ logs=l.sort((a,b)=>(b.em||0)-(a.em||0)); if(currentTab==='configuracoes' && configSubTab==='whatsapp' && podeAtualizarSozinho()) render(); });
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
  if(!liberado() || !cfg || !cfg.ativo || Nuvem.emEspelho()) return;
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
    <label class="chk-linha"><input type="checkbox" id="waAgendada" ${c.confirmarAoMarcar!==false?'checked':''}> Confirmação assim que a consulta é marcada</label>
    <label class="chk-linha"><input type="checkbox" id="waVespera" ${c.lembreteVespera!==false?'checked':''}> Lembrete na véspera, com os botões "Confirmo" e "Preciso remarcar", às <input type="time" id="waHora" value="${esc(c.lembreteHora||'10:00')}" style="width:auto;display:inline-block;padding:4px 8px;margin:0 4px"></label>
    <label class="chk-linha"><input type="checkbox" id="waAgDent" ${c.agendaDentista!==false?'checked':''}> Agenda do dia às 07:30 para os dentistas (cada um escolhe no próprio cadastro)</label>
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
    <p class="erro-campo" id="waErro" role="alert"></p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn-p" id="waSalvar">Salvar</button></div>
  </div>
  <div class="card"><h3 style="margin:0 0 8px">Últimos envios</h3>${ult?`<ul class="wa-logs">${ult}</ul>`:'<p class="muted">Nenhuma mensagem ainda. Com o WhatsApp ligado, os avisos aparecem aqui em até 5 minutos depois do horário.</p>'}</div>`;
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
      agendaDentista:q('waAgDent').checked,phoneNumberId:numId,wabaId:q('waWaba').value.trim(),fuso:fusoClinica(),nomeClinica:(state.clinic&&state.clinic.nome)||'',atualizadoEm:Date.now()});
    b.disabled=true; b.textContent='Salvando…';
    try{
      if(tok){ await Nuvem.waGravar('waSegredo','token',{token:tok,em:Date.now()}); novo.tokenSalvoEm=Date.now(); }
      if(!numId) novo.tokenSalvoEm=novo.tokenSalvoEm||0;
      await Nuvem.waGravar('wa','config',novo); cfg=novo;
      if(cfg.ativo){ ultimos={}; await sincronizarDias(true); }
      avisarRapido(cfg.ativo?(cfg.simulacao?'WhatsApp automático ligado em simulação.':'WhatsApp automático ligado.'):'WhatsApp automático desligado.'); render();
    }catch(e){ console.error(e); b.disabled=false; b.textContent='Salvar'; erro(Nuvem.mapErro(e)); }
  });
  document.querySelectorAll('[data-wasim]').forEach(x=>x.addEventListener('click',async()=>{
    const [ac,agId]=x.getAttribute('data-wasim').split('|'); x.disabled=true;
    try{ await Nuvem.waGravar('waRespostas',uid(),{agId,acao:ac==='C'?'confirmar':'remarcar',telefone:'simulação',em:Date.now()}); avisarRapido(ac==='C'?'Resposta simulada: paciente confirmou.':'Resposta simulada: paciente pediu para remarcar.'); }
    catch(e){ x.disabled=false; avisar(Nuvem.mapErro(e)); }
  }));
};
})();
