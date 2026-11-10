// OdontoGestão · Relatório "Comparativo anual": entradas, saídas, resultado, clientes e produção ano a ano.
// Regime de caixa: entradas e saídas contam na data do pagamento (ou do vencimento, se o lançamento antigo não tiver data de pagamento).
(function(){
'use strict';
const ANO_INICIAL=2021;
const CORES=['#2a78d6','#e8833a','#2e9e6a','#9b59b6','#d64550','#7a8794','#c9a227','#16a3b8'];
const MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let anosSel=null, metricaMes='entradas', abertoCat=true;

const dataCaixa=e=>(e.dataPagamento||e.vencimento||'');
const pct=(a,b)=>b?((a-b)/Math.abs(b)*100):null;
// variação: o texto mostra a mudança real; a cor diz se foi bom (verde) ou ruim (vermelho). inv = indicador em que subir é ruim
function fmtVar(v,inv){ if(v==null||!isFinite(v)) return '<span class="muted">—</span>'; const s=(v>0?'+':'')+v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'; const bom=inv?-v:v; return `<span class="cmp-var ${bom>0.05?'sobe':bom<-0.05?'desce':''}">${s}</span>`; }
const moeda=v=>fmtMoney(v||0).replace(/,00$/,'');
const inteiro=v=>(Math.round(v||0)).toLocaleString('pt-BR');
const pctFmt=v=>v==null||!isFinite(v)?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';

function anosDisponiveis(){
  const atual=+hojeISO().slice(0,4); let min=ANO_INICIAL;
  (state.fluxoFinanceiro||[]).forEach(e=>{ const y=+dataCaixa(e).slice(0,4); if(y && y<min && y>2000) min=y; });
  const l=[]; for(let y=min;y<=atual;y++) l.push(y); return l;
}

// ---- cálculo por ano (e por mês) ----
function calcular(){
  const hoje=hojeISO(), A={};
  const novoAno=()=>({ent:0,bruto:0,taxas:0,sai:0,aporteEnt:0,aporteSai:0,vencAberto:0,cat:{},forma:{},pagantes:new Set(),atendidos:new Set(),novos:0,atend:0,faltas:0,orcGer:0,orcAprov:0,orcValAprov:0,orcValGer:0,esp:{},mes:Array.from({length:12},()=>({ent:0,sai:0,pac:new Set(),atend:0}))});
  const ano=y=>A[y]||(A[y]=novoAno());
  (state.fluxoFinanceiro||[]).forEach(e=>{
    const d=dataCaixa(e); if(!d) return; const y=+d.slice(0,4), m=+d.slice(5,7)-1; if(!y||m<0||m>11) return;
    if(!e.confirmado){ if(e.tipo==='receita'&&!e.aporte&&e.vencimento&&e.vencimento<hoje) ano(+e.vencimento.slice(0,4)).vencAberto+=(+e.valor||0); return; }
    const a=ano(y);
    if(e.aporte){ if(e.tipo==='receita') a.aporteEnt+=(+e.valor||0); else a.aporteSai+=(+e.valor||0); return; }
    if(e.tipo==='receita'){ const v=+e.valor||0, b=valorQuitado(e); a.ent+=v; a.bruto+=b; a.taxas+=(+e.taxaValor||0); a.mes[m].ent+=v;
      const f=e.forma||(e.importado?'Sistema anterior':'Não informada'); a.forma[f]=(a.forma[f]||0)+b;
      if(e.pacienteId){ a.pagantes.add(e.pacienteId); a.mes[m].pac.add(e.pacienteId); } }
    else if(e.tipo==='despesa'){ const v=+e.valor||0; a.sai+=v; a.mes[m].sai+=v; const c=e.categoria||'Outros'; a.cat[c]=(a.cat[c]||0)+v; }
  });
  // clientes e produção
  const primeiro={};
  const marca=(pid,d)=>{ if(pid&&d&&(!primeiro[pid]||d<primeiro[pid])) primeiro[pid]=d; };
  (state.patients||[]).forEach(p=>{
    (p.evolucao||[]).forEach(e=>{ if(!e.data) return; marca(p.id,e.data); const y=+e.data.slice(0,4), m=+e.data.slice(5,7)-1; if(!e.confirmado) return; const a=ano(y);
      if(e.falta) a.faltas++; else { a.atend++; a.atendidos.add(p.id); if(m>=0&&m<12) a.mes[m].atend++; } });
    (p.orcamentos||[]).forEach(o=>{ if(!o.data) return; marca(p.id,o.data); const a=ano(+o.data.slice(0,4)); a.orcGer++; a.orcValGer+=(+o.total||0);
      if(o.status==='aprovado'){ const da=(o.aprovadoEm||o.data); const b=ano(+da.slice(0,4)); b.orcAprov++; b.orcValAprov+=(+o.total||0);
        const tot=(o.itens||[]).reduce((s,i)=>s+(+i.valor||0),0)||1; (o.itens||[]).forEach(i=>{ const k=i.especialidade||'Outros'; b.esp[k]=(b.esp[k]||0)+(+o.total||0)*((+i.valor||0)/tot); }); } });
    if(p.cadastradoEm) marca(p.id,p.cadastradoEm.slice(0,10));
  });
  (state.agendamentos||[]).forEach(a=>marca(a.pacienteId,a.data));
  (state.fluxoFinanceiro||[]).forEach(e=>{ if(e.tipo==='receita'&&e.pacienteId) marca(e.pacienteId,dataCaixa(e)); });
  Object.values(primeiro).forEach(d=>{ const y=+String(d).slice(0,4); if(y) ano(y).novos++; });
  // pacientes atendidos = atendidos na evolução OU que pagaram no ano (dados antigos podem não ter evolução)
  Object.keys(A).forEach(y=>{ const a=A[y]; a.ativos=new Set([...a.atendidos,...a.pagantes]); });
  return A;
}

function linhas(A,anos){
  const g=(y,f)=>{ const a=A[y]; return a?f(a):0; };
  const L=[
    {sec:'Financeiro (regime de caixa)'},
    {rot:'Entradas recebidas',f:a=>a.ent,fmt:moeda,dica:'Valor líquido que entrou (depois das taxas de cartão)'},
    {rot:'Faturamento bruto',f:a=>a.bruto,fmt:moeda,dica:'O que os pacientes pagaram, antes das taxas'},
    {rot:'Taxas de cartão',f:a=>a.taxas,fmt:moeda,inv:true},
    {rot:'Saídas pagas',f:a=>a.sai,fmt:moeda,inv:true},
    {rot:'Resultado (entradas − saídas)',f:a=>a.ent-a.sai,fmt:moeda,forte:true},
    {rot:'Margem',f:a=>a.ent?(a.ent-a.sai)/a.ent*100:null,fmt:pctFmt,semVar:true},
    {rot:'Parcelas vencidas não pagas',f:a=>a.vencAberto,fmt:moeda,inv:true,dica:'Parcelas com vencimento no ano que continuam em aberto'},
    {sec:'Clientes'},
    {rot:'Pacientes ativos',f:a=>a.ativos?a.ativos.size:0,fmt:inteiro,dica:'Atendidos (evolução) ou que fizeram pagamento no ano'},
    {rot:'Pacientes novos',f:a=>a.novos,fmt:inteiro,dica:'Primeiro registro do paciente na clínica foi nesse ano'},
    {rot:'Pacientes que pagaram',f:a=>a.pagantes.size,fmt:inteiro},
    {rot:'Ticket médio por paciente',f:a=>a.pagantes.size?a.bruto/a.pagantes.size:0,fmt:moeda,dica:'Faturamento bruto ÷ pacientes que pagaram'},
    {sec:'Produção'},
    {rot:'Atendimentos realizados',f:a=>a.atend,fmt:inteiro},
    {rot:'Faltas',f:a=>a.faltas,fmt:inteiro,inv:true},
    {rot:'Taxa de faltas',f:a=>(a.atend+a.faltas)?a.faltas/(a.atend+a.faltas)*100:null,fmt:pctFmt,semVar:true},
    {rot:'Orçamentos gerados',f:a=>a.orcGer,fmt:inteiro},
    {rot:'Orçamentos aprovados',f:a=>a.orcAprov,fmt:inteiro},
    {rot:'Conversão de orçamentos',f:a=>a.orcGer?a.orcAprov/a.orcGer*100:null,fmt:pctFmt,semVar:true},
    {rot:'Valor aprovado (vendido)',f:a=>a.orcValAprov,fmt:moeda},
  ];
  return L.map(l=>l.sec?l:Object.assign({},l,{vals:anos.map(y=>g(y,l.f))}));
}

function tabelaHtml(L,anos){
  return `<div class="overflow"><table class="cmp-t cmp-ind"><thead><tr><th></th>${anos.map((y,i)=>`<th>${y}${i?'<div class="muted" style="font-weight:400;font-size:11px">vs '+anos[i-1]+'</div>':''}</th>`).join('')}</tr></thead><tbody>
    ${L.map(l=>l.sec?`<tr class="cmp-sec"><td colspan="${anos.length+1}">${esc(l.sec)}</td></tr>`:`<tr class="${l.forte?'cmp-forte':''}"><td>${esc(l.rot)}${l.dica?`<div class="muted" style="font-size:11.5px">${esc(l.dica)}</div>`:''}</td>${l.vals.map((v,i)=>{ let vr=''; if(i&&!l.semVar){ const p=pct(v,l.vals[i-1]); vr=p==null?'':`<div>${fmtVar(p,l.inv)}</div>`; }
      return `<td>${v==null?'—':l.fmt(v)}${vr}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
function quebraHtml(titulo,A,anos,campo,limite){
  const chaves={}; anos.forEach(y=>{ const o=(A[y]||{})[campo]||{}; Object.keys(o).forEach(k=>{ chaves[k]=(chaves[k]||0)+o[k]; }); });
  let ks=Object.keys(chaves).sort((a,b)=>chaves[b]-chaves[a]); if(!ks.length) return '';
  const tot=anos.map(y=>Object.values((A[y]||{})[campo]||{}).reduce((s,v)=>s+v,0));
  return `<h4 style="margin:18px 0 6px">${titulo}</h4><div class="overflow"><table class="cmp-t"><thead><tr><th></th>${anos.map(y=>`<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${ks.slice(0,limite||40).map(k=>`<tr><td>${esc(k)}</td>${anos.map((y,i)=>{ const v=((A[y]||{})[campo]||{})[k]||0; return `<td>${v?moeda(v):'<span class="muted">—</span>'}${v&&tot[i]?`<div class="muted" style="font-size:11px">${pctFmt(v/tot[i]*100)} do ano</div>`:''}</td>`; }).join('')}</tr>`).join('')}
    <tr class="cmp-forte"><td>Total</td>${tot.map(v=>`<td>${moeda(v)}</td>`).join('')}</tr></tbody></table></div>`;
}

// ---- gráficos (SVG simples) ----
function barrasAnuais(A,anos){
  const W=640,H=230,pl=58,pb=28,pt=12, ser=[['ent','Entradas','var(--primary)'],['sai','Saídas','#e8833a'],['res','Resultado','#2e9e6a']];
  const val=(y,k)=>{ const a=A[y]; if(!a) return 0; return k==='res'?a.ent-a.sai:a[k]; };
  const vs=anos.flatMap(y=>ser.map(s=>val(y,s[0]))); const max=Math.max(1,...vs), min=Math.min(0,...vs);
  const esc_=v=>pt+(H-pt-pb)*(max-v)/(max-min); const gw=(W-pl-10)/anos.length, bw=Math.min(26,(gw-14)/3);
  const ticks=[min,0,max/2,max].filter((v,i,a)=>a.indexOf(v)===i);
  return `<svg viewBox="0 0 ${W} ${H}" class="cmp-graf" role="img" aria-label="Entradas, saídas e resultado por ano">
    ${ticks.map(t=>`<line x1="${pl}" x2="${W-6}" y1="${esc_(t)}" y2="${esc_(t)}" class="cmp-grade"/><text x="${pl-6}" y="${esc_(t)+4}" text-anchor="end" class="cmp-eixo">${abrev(t)}</text>`).join('')}
    ${anos.map((y,i)=>{ const x0=pl+i*gw+(gw-bw*3-4)/2; return ser.map((s,j)=>{ const v=val(y,s[0]), y1=esc_(Math.max(v,0)), y2=esc_(Math.min(v,0)); return `<rect x="${x0+j*(bw+2)}" y="${y1}" width="${bw}" height="${Math.max(1,y2-y1)}" rx="2" fill="${s[2]}"><title>${y} · ${s[1]}: ${fmtMoney(v)}</title></rect>`; }).join('')+`<text x="${pl+i*gw+gw/2}" y="${H-8}" text-anchor="middle" class="cmp-eixo">${y}</text>`; }).join('')}
  </svg><div class="cmp-leg">${ser.map(s=>`<span><i style="background:${s[2]}"></i>${s[1]}</span>`).join('')}</div>`;
}
function abrev(v){ const a=Math.abs(v); const s=a>=1e6?(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi':a>=1e3?(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil':Math.round(v).toLocaleString('pt-BR'); return s; }
const METRICAS={entradas:['Entradas recebidas',mm=>mm.ent,true],saidas:['Saídas pagas',mm=>mm.sai,true],resultado:['Resultado',mm=>mm.ent-mm.sai,true],pacientes:['Pacientes que pagaram',mm=>mm.pac.size,false],atendimentos:['Atendimentos realizados',mm=>mm.atend,false]};
function linhasMensais(A,anos){
  const [rot,f,din]=METRICAS[metricaMes]; const W=640,H=230,pl=58,pb=28,pt=12;
  const serie=anos.map(y=>(A[y]?A[y].mes:Array.from({length:12},()=>({ent:0,sai:0,pac:new Set(),atend:0}))).map(f));
  const vs=serie.flat(); const max=Math.max(1,...vs), min=Math.min(0,...vs);
  const X=m=>pl+(W-pl-14)*m/11, Y=v=>pt+(H-pt-pb)*(max-v)/(max-min);
  const fmt=v=>din?fmtMoney(v):inteiro(v);
  return `<svg viewBox="0 0 ${W} ${H}" class="cmp-graf" role="img" aria-label="${esc(rot)} mês a mês por ano">
    ${[min,(max+min)/2,max].map(t=>`<line x1="${pl}" x2="${W-6}" y1="${Y(t)}" y2="${Y(t)}" class="cmp-grade"/><text x="${pl-6}" y="${Y(t)+4}" text-anchor="end" class="cmp-eixo">${din?abrev(t):inteiro(t)}</text>`).join('')}
    ${MESES.map((m,i)=>`<text x="${X(i)}" y="${H-8}" text-anchor="middle" class="cmp-eixo">${m}</text>`).join('')}
    ${serie.map((s,k)=>`<polyline fill="none" stroke="${CORES[k%CORES.length]}" stroke-width="${k===serie.length-1?2.6:1.8}" points="${s.map((v,i)=>X(i)+','+Y(v)).join(' ')}"/>${s.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${CORES[k%CORES.length]}"><title>${MESES[i]}/${anos[k]}: ${fmt(v)}</title></circle>`).join('')}`).join('')}
  </svg><div class="cmp-leg">${anos.map((y,k)=>`<span><i style="background:${CORES[k%CORES.length]}"></i>${y}</span>`).join('')}</div>`;
}
function tabelaMensal(A,anos){
  const [rot,f,din]=METRICAS[metricaMes]; const fmt=v=>din?fmtMoney(v):inteiro(v);
  const serie=anos.map(y=>(A[y]?A[y].mes:Array.from({length:12},()=>({ent:0,sai:0,pac:new Set(),atend:0}))).map(f));
  return `<div class="overflow"><table class="cmp-t cmp-mes"><thead><tr><th>${esc(rot)}</th>${anos.map(y=>`<th>${y}</th>`).join('')}</tr></thead><tbody>${MESES.map((m,i)=>`<tr><td>${m}</td>${serie.map(s=>`<td>${s[i]?fmt(s[i]):'<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}<tr class="cmp-forte"><td>Ano</td>${serie.map(s=>`<td>${fmt(metricaMes==='pacientes'?0:s.reduce((a,b)=>a+b,0)).replace(/^0$/,'—')}</td>`).join('')}</tr></tbody></table></div>`;
}

window.repComparativo=function(){
  const todos=anosDisponiveis();
  if(!anosSel) anosSel=todos.slice();
  const anos=todos.filter(y=>anosSel.includes(y));
  const A=calcular(), L=linhas(A,anos);
  const filtros=`<div style="flex:1 1 100%"><label>Anos no comparativo</label><div class="cmp-anos">${todos.map(y=>`<label class="chk-linha"><input type="checkbox" data-cmpano="${y}" ${anosSel.includes(y)?'checked':''} style="width:auto"> ${y}</label>`).join('')}<button class="btn-s peq" data-cmpcsv>Baixar planilha (CSV)</button></div></div>`;
  if(!anos.length) return repCard('Comparativo anual','Marque pelo menos um ano.',filtros,'','');
  const ult=anos[anos.length-1], pen=anos[anos.length-2], a=A[ult]||{}, b=pen?A[pen]||{}:null;
  const parcial=ult===+hojeISO().slice(0,4)?' <span class="muted">(até hoje)</span>':'';
  const resumo=`<strong>${ult}${parcial}:</strong> entradas ${moeda(a.ent)} · saídas ${moeda(a.sai)} · resultado <strong style="color:${(a.ent||0)-(a.sai||0)>=0?'var(--ok)':'var(--danger)'}">${moeda((a.ent||0)-(a.sai||0))}</strong>${b?` &nbsp;·&nbsp; entradas ${fmtVar(pct(a.ent||0,b.ent||0))} vs ${pen}`:''}`;
  const corpo=`<div class="cmp-graficos"><div class="cmp-bloco"><h4>Entradas, saídas e resultado por ano</h4>${barrasAnuais(A,anos)}</div>
      <div class="cmp-bloco"><h4>Mês a mês <select id="cmpMetrica" aria-label="Indicador mês a mês" style="width:auto;display:inline-block;margin-left:6px">${Object.keys(METRICAS).map(k=>`<option value="${k}" ${metricaMes===k?'selected':''}>${METRICAS[k][0]}</option>`).join('')}</select></h4>${linhasMensais(A,anos)}</div></div>
    <details class="cmp-det"><summary>Ver a tabela mês a mês (${esc(METRICAS[metricaMes][0].toLowerCase())})</summary>${tabelaMensal(A,anos)}</details>
    <h4 style="margin:18px 0 6px">Indicadores ano a ano</h4>${tabelaHtml(L,anos)}
    ${quebraHtml('Saídas por categoria',A,anos,'cat')}
    ${quebraHtml('Entradas por forma de pagamento (valor pago pelo paciente)',A,anos,'forma')}
    ${quebraHtml('Vendas por especialidade (orçamentos aprovados)',A,anos,'esp')}
    <p class="muted" style="font-size:12.5px;margin-top:14px">Regime de caixa: cada lançamento conta no ano em que foi pago. Aportes e devoluções de aporte não entram como entrada nem saída. Dados importados do sistema anterior entram normalmente; anos sem evolução registrada mostram os pacientes pelos pagamentos.</p>`;
  return repCard('Comparativo anual','Entradas, saídas, clientes e produção da clínica, ano a ano, desde '+todos[0]+'. A variação mostra o quanto cada ano mudou em relação ao anterior (em verde quando melhorou).',filtros,resumo,corpo);
};
window.repComparativoLigar=function(){
  document.querySelectorAll('[data-cmpano]').forEach(c=>c.addEventListener('change',()=>{ const y=+c.getAttribute('data-cmpano'); anosSel=c.checked?anosSel.concat([y]).sort():anosSel.filter(x=>x!==y); render(); }));
  const m=document.getElementById('cmpMetrica'); if(m) m.addEventListener('change',()=>{ metricaMes=m.value; render(); });
  document.querySelectorAll('[data-cmpcsv]').forEach(b=>b.addEventListener('click',baixarCsv));
};
function baixarCsv(){
  const todos=anosDisponiveis(), anos=todos.filter(y=>(anosSel||todos).includes(y)), A=calcular(), L=linhas(A,anos);
  const num=v=>v==null||!isFinite(v)?'':(Math.round(v*100)/100).toString().replace('.',',');
  const q=t=>'"'+String(t).replace(/"/g,'""')+'"';
  const out=[['Indicador'].concat(anos).map(q).join(';')];
  L.forEach(l=>{ if(l.sec) out.push(q(l.sec)); else out.push([q(l.rot)].concat(l.vals.map(num)).join(';')); });
  [['Saídas por categoria','cat'],['Entradas por forma de pagamento','forma'],['Vendas por especialidade','esp']].forEach(([t,c])=>{
    const ks=new Set(); anos.forEach(y=>Object.keys((A[y]||{})[c]||{}).forEach(k=>ks.add(k))); if(!ks.size) return;
    out.push(''); out.push(q(t)); [...ks].sort().forEach(k=>out.push([q(k)].concat(anos.map(y=>num(((A[y]||{})[c]||{})[k]||0))).join(';'))); });
  out.push(''); out.push(q('Mês a mês: entradas recebidas')); MESES.forEach((m,i)=>out.push([q(m)].concat(anos.map(y=>num(A[y]?A[y].mes[i].ent:0))).join(';')));
  out.push(''); out.push(q('Mês a mês: saídas pagas')); MESES.forEach((m,i)=>out.push([q(m)].concat(anos.map(y=>num(A[y]?A[y].mes[i].sai:0))).join(';')));
  const blob=new Blob(['﻿'+out.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='comparativo-anual-'+hojeISO()+'.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
})();
