// OdontoGestão · Comissão dos dentistas por percentual (definida pelo Master por especialidade, com exceção por dentista).
// Regra: comissão sobre o RECEBIDO (valor cheio pago pelo paciente, sem descontar taxas), na proporção dos procedimentos
// do orçamento. O dentista de cada procedimento é quem confirmou a evolução que o executou; enquanto ninguém executou,
// vale o dentista responsável pelo orçamento. Fechamento diário: gera a despesa "Repasse de comissão" em contas a pagar.
(function(){
'use strict';
const CAT='Pessoal';
function cfg(){ const c=(state.meta&&state.meta.comissoes)||{}; return {padrao:c.padrao||{}, dentistas:c.dentistas||{}, inicio:c.inicio||'', ativo:!!c.ativo}; }
function liberado(){ return typeof temRecurso==='function' && temRecurso('financeiro'); }
function souMaster(){ const u=currentUser(); return !!u && u.tipo==='master'; }
function podeFin(){ const u=currentUser(); return !!u && !!permsDe(u).financeiro; }
function especialidades(){ return [...new Set((state.procedimentos||[]).map(p=>p.especialidade).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')); }
function dentistas(){ return (state.users||[]).filter(u=>!u.inativo && ehDentista(u)).sort((a,b)=>nomeExibicao(a).localeCompare(nomeExibicao(b))); }
const pctFmt=v=>(+v||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
function pctDe(dentId,esp){ const c=cfg(); const ex=(c.dentistas[dentId]||{})[esp]; if(ex!=null && ex!=='') return +ex||0; return +(c.padrao[esp]||0); }
window.comissaoPct=pctDe;

// ---- quem fez cada procedimento do orçamento ----
function recIdsDoOrc(p,o){
  if((o.itens||[]).every(i=>i.recId)) return o.itens.map(i=>i.recId);
  const pl=(p.planosConfirmados||[]).find(x=>x.id===o.planoId); const inc=pl?(pl.itens||[]).filter(it=>it&&it.incluido!==false):[];
  return (o.itens||[]).map((i,k)=>i.recId || (inc.length===(o.itens||[]).length?inc[k].id:((inc.find(r=>r.nome===i.nome)||{}).id||null)));
}
function executor(p,recId){
  if(!recId) return null; let quem=null;
  (p.evolucao||[]).forEach(e=>{ if(e.confirmado && !e.falta && e.confirmadoPorId && (typeof refsDaEvol==='function'?refsDaEvol(e):(e.procedimentoRefs||[])).includes(recId)) quem=e.confirmadoPorId; });
  return quem;
}
function nomeDent(id){ const u=(state.users||[]).find(x=>x.id===id); return u?nomeExibicao(u):'(sem dentista)'; }
// comissões de uma parcela recebida: [{dentId, esp, base, pct, valor, item}]
function calcParcela(e){
  const p=pacPorId(e.pacienteId); if(!p) return [];
  const o=(p.orcamentos||[]).find(x=>x.id===e.orcamentoId); if(!o) return [];
  const itens=o.itens||[]; const tot=itens.reduce((s,i)=>s+(+i.valor||0),0); if(!(tot>0)) return [];
  const bruto=valorQuitado(e), recs=recIdsDoOrc(p,o);
  return itens.map((i,k)=>{ const base=r2(bruto*(+i.valor||0)/tot); const d=executor(p,recs[k])||o.dentistaId||''; const pct=d?pctDe(d,i.especialidade):0;
    return {dentId:d, esp:i.especialidade||'', base, pct, valor:r2(base*pct/100), item:i.nome, executado:!!executor(p,recs[k])}; }).filter(x=>x.base>0);
}
// parcelas recebidas que ainda não entraram em fechamento
function aFechar(ate){
  const c=cfg(); if(!c.ativo) return [];
  return (state.fluxoFinanceiro||[]).filter(e=>e.tipo==='receita' && e.confirmado && !e.aporte && e.orcamentoId && !e.comissao && (e.dataPagamento||'')>=(c.inicio||'0000') && (e.dataPagamento||'')<=ate)
    .map(e=>({e, linhas:calcParcela(e)})).filter(x=>x.linhas.length);
}
window.comissoesAFecharValor=function(){ if(!liberado()||!podeFin()||!cfg().ativo) return 0; return r2(aFechar(addDaysStr(hojeISO(),-1)).reduce((s,x)=>s+x.linhas.reduce((t,l)=>t+l.valor,0),0)); };
window.comissaoBloqueiaDesfazer=function(e){ if(e && e.comissao){ return 'A comissão desta parcela já entrou no repasse de '+fmtDataBR(e.comissao.ate)+'. Desfaça esse fechamento em Relatórios → Comissões antes de desfazer o pagamento.'; } return ''; };

// ---- Configurações → Comissões (só Master) ----
let dentAberto='';
window.comissaoConfigHtml=function(){
  if(!souMaster()) return '<div class="card"><p class="muted">Só o Master define as comissões.</p></div>';
  const c=cfg(), esps=especialidades(), ds=dentistas();
  return `<div class="card"><h3 style="margin:0 0 4px">Comissão dos dentistas</h3>
    <p class="muted" style="margin:0 0 10px">O dentista recebe a % da especialidade sobre o que o paciente <strong>pagou</strong> (valor cheio, sem descontar taxas), na proporção de cada procedimento do orçamento. O procedimento conta para quem confirmou a evolução que o executou; antes disso, para o dentista responsável pelo orçamento. Todo dia você fecha as comissões em <strong>Relatórios → Comissões</strong> e o sistema lança o repasse em contas a pagar.</p>
    <form id="fComis">
    <div class="row"><div><label class="chk-linha" style="margin-top:6px"><input type="checkbox" id="cmAtivo" ${c.ativo?'checked':''} style="width:auto"> Calcular comissões</label></div>
      <div><label for="cmInicio">Contar pagamentos a partir de</label><input id="cmInicio" type="date" value="${esc(c.inicio||hojeISO())}"></div></div>
    <h4 style="margin:14px 0 6px">% padrão por especialidade</h4>
    <div class="overflow"><table class="cm-t"><thead><tr><th>Especialidade</th><th>% padrão</th></tr></thead><tbody>
      ${esps.map(es=>`<tr><td>${esc(es)}</td><td><input data-cmpad="${esc(es)}" inputmode="decimal" value="${c.padrao[es]!=null?esc(String(c.padrao[es]).replace('.',',')):''}" placeholder="0" style="width:90px" aria-label="% padrão de ${esc(es)}"> %</td></tr>`).join('')}
    </tbody></table></div>
    <h4 style="margin:16px 0 6px">Exceções por dentista <span class="muted" style="font-weight:400;font-size:12.5px">(em branco = usa a % padrão)</span></h4>
    ${ds.length?ds.map(d=>{ const ex=c.dentistas[d.id]||{}; const n=Object.keys(ex).filter(k=>ex[k]!==''&&ex[k]!=null).length;
      return `<details class="cm-dent" ${dentAberto===d.id?'open':''} data-cmdent="${d.id}"><summary><strong>${esc(nomeExibicao(d))}</strong> <span class="muted">${n?n+' exceç'+(n===1?'ão':'ões'):'usa a tabela padrão'}</span></summary>
        <div class="overflow"><table class="cm-t"><tbody>${esps.map(es=>`<tr><td>${esc(es)}</td><td><input data-cmex="${d.id}" data-esp="${esc(es)}" inputmode="decimal" value="${ex[es]!=null&&ex[es]!==''?esc(String(ex[es]).replace('.',',')):''}" placeholder="${esc(String(c.padrao[es]||0).replace('.',','))}" style="width:90px" aria-label="% de ${esc(nomeExibicao(d))} em ${esc(es)}"> %</td></tr>`).join('')}</tbody></table></div></details>`; }).join(''):'<p class="muted">Nenhum dentista cadastrado em Usuários.</p>'}
    <div style="margin-top:14px"><button class="btn-p">Salvar comissões</button></div></form></div>`;
};
window.comissaoConfigLigar=function(){
  const f=document.getElementById('fComis'); if(!f) return;
  f.querySelectorAll('[data-cmdent]').forEach(d=>d.addEventListener('toggle',()=>{ if(d.open) dentAberto=d.getAttribute('data-cmdent'); }));
  f.addEventListener('submit',ev=>{ ev.preventDefault();
    const num=v=>{ const t=String(v||'').trim(); if(!t) return null; const n=lerValor(t); return isFinite(n)?Math.max(0,Math.min(100,n)):null; };
    const padrao={}; f.querySelectorAll('[data-cmpad]').forEach(i=>{ const n=num(i.value); if(n!=null) padrao[i.getAttribute('data-cmpad')]=n; });
    const dents={}; f.querySelectorAll('[data-cmex]').forEach(i=>{ const n=num(i.value); if(n==null) return; const d=i.getAttribute('data-cmex'); (dents[d]=dents[d]||{})[i.getAttribute('data-esp')]=n; });
    state.meta=state.meta||{}; state.meta.comissoes={ativo:document.getElementById('cmAtivo').checked, inicio:document.getElementById('cmInicio').value||hojeISO(), padrao, dentistas:dents};
    saveData(); render(); avisarRapido('Comissões salvas.'); });
};

// ---- Relatórios → Comissões (fechamento diário) ----
let ateSel='', abertoDet=new Set();
window.repComissoes=function(){
  const c=cfg();
  if(!c.ativo) return repCard('Comissões dos dentistas','As comissões ainda não estão ligadas.',``,'',`<p>${souMaster()?'Defina as % em <strong>Configurações → Comissões</strong> e marque "Calcular comissões".':'Peça ao Master para definir as comissões em Configurações → Comissões.'}</p>`);
  const hoje=hojeISO(), ate=ateSel||hoje;
  const l=aFechar(ate), por={}, semDent=[];
  l.forEach(({e,linhas})=>linhas.forEach(x=>{ if(!x.dentId){ semDent.push({e,x}); return; } const g=por[x.dentId]||(por[x.dentId]={tot:0,base:0,lin:[]}); g.tot=r2(g.tot+x.valor); g.base=r2(g.base+x.base); g.lin.push({e,x}); }));
  const total=r2(Object.values(por).reduce((s,g)=>s+g.tot,0));
  const filtros=`<div><label for="cmAte">Fechar recebimentos até</label><input id="cmAte" type="date" value="${esc(ate)}" max="${hoje}"></div>`;
  const blocos=Object.keys(por).sort((a,b)=>nomeDent(a).localeCompare(nomeDent(b))).map(d=>{ const g=por[d];
    return `<details class="cm-dent" ${abertoDet.has(d)?'open':''} data-cmdet="${d}"><summary><strong>${esc(nomeDent(d))}</strong> · ${fmtMoney(g.tot)} <span class="muted">sobre ${fmtMoney(g.base)} recebidos</span></summary>
      <div class="overflow"><table><thead><tr><th>Pago em</th><th>Paciente</th><th>Procedimento</th><th>Especialidade</th><th>Base</th><th>%</th><th>Comissão</th></tr></thead><tbody>
      ${g.lin.sort((a,b)=>a.e.dataPagamento.localeCompare(b.e.dataPagamento)).map(({e,x})=>`<tr><td>${fmtDataBR(e.dataPagamento)}</td><td>${esc((pacPorId(e.pacienteId)||{}).nome||e.pacienteNome||'')}</td><td>${esc(x.item)}${x.executado?'':' <span class="muted" style="font-size:11.5px">(responsável)</span>'}</td><td>${esc(x.esp)}</td><td>${fmtMoney(x.base)}</td><td>${pctFmt(x.pct)}</td><td>${fmtMoney(x.valor)}</td></tr>`).join('')}
      </tbody></table></div></details>`; }).join('');
  const aviso=semDent.length?`<p class="cm-aviso">⚠️ ${semDent.length} procedimento(s) recebido(s) sem dentista definido: ${fmtMoney(r2(semDent.reduce((s,y)=>s+y.x.base,0)))}. Defina o <strong>dentista responsável</strong> no orçamento do paciente (aba Orçamento) para entrarem na comissão.${[...new Set(semDent.map(y=>y.e.pacienteId))].slice(0,6).map(pid=>{ const p=pacPorId(pid); return p?` ${repPacBtn(p,'orcamento')}`:''; }).join('')}</p>`:'';
  const repasses=(state.fluxoFinanceiro||[]).filter(e=>e.repasse).sort((a,b)=>(b.repasse.ate||'').localeCompare(a.repasse.ate||'')||(b.repasse.em||'').localeCompare(a.repasse.em||'')).slice(0,30);
  const hist=repasses.length?`<h4 style="margin:18px 0 6px">Fechamentos anteriores</h4><div class="overflow"><table><thead><tr><th>Até</th><th>Dentista</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>
    ${repasses.map(e=>`<tr><td>${fmtDataBR(e.repasse.ate)}</td><td>${esc(nomeDent(e.repasse.dentistaId))}</td><td>${fmtMoney(e.valor)}</td><td>${e.confirmado?`<span class="badge b-dent">Pago em ${fmtDataBR(e.dataPagamento)}</span>`:'<span class="badge b-harm">A pagar</span>'}</td><td>${e.confirmado?'':`<button class="btn-s peq" data-cmdesf="${e.id}">Desfazer fechamento</button>`}</td></tr>`).join('')}</tbody></table></div>`:'';
  return repCard('Comissões dos dentistas',`Comissão sobre o que os pacientes pagaram (valor cheio), pela % de cada especialidade. Feche todos os dias: o sistema lança o repasse de cada dentista em contas a pagar (categoria ${CAT}).`,filtros,
    `<strong>A fechar até ${fmtDataBR(ate)}:</strong> ${fmtMoney(total)} &nbsp;·&nbsp; <strong>Dentistas:</strong> ${Object.keys(por).length} &nbsp;·&nbsp; <strong>Pagamentos:</strong> ${l.length}`,
    aviso+(blocos||'<p class="muted">Nenhuma comissão a fechar até essa data.</p>')+(total>0&&podeFin()?`<div style="margin-top:12px"><button class="btn-p" data-cmfechar>Fechar e lançar repasses (${fmtMoney(total)})</button></div>`:'')+hist);
};
window.repComissoesLigar=function(){
  const a=document.getElementById('cmAte'); if(a) a.addEventListener('change',()=>{ ateSel=a.value; render(); });
  document.querySelectorAll('[data-cmdet]').forEach(d=>d.addEventListener('toggle',()=>{ const id=d.getAttribute('data-cmdet'); if(d.open) abertoDet.add(id); else abertoDet.delete(id); }));
  document.querySelectorAll('[data-cmfechar]').forEach(b=>b.addEventListener('click',()=>{
    const ate=ateSel||hojeISO(), l=aFechar(ate); if(!l.length) return;
    const por={}; l.forEach(({linhas})=>linhas.forEach(x=>{ if(x.dentId) por[x.dentId]=r2((por[x.dentId]||0)+x.valor); }));
    const tot=r2(Object.values(por).reduce((s,v)=>s+v,0));
    confirmarAcao(`Fechar as comissões recebidas até ${fmtDataBR(ate)} e lançar ${Object.keys(por).length} repasse(s), total ${fmtMoney(tot)}, em contas a pagar?`,'Fechar',()=>{
      const em=new Date().toISOString(), ids={};
      Object.keys(por).forEach(d=>{ if(!(por[d]>0)) return; const id=uid(); ids[d]=id;
        state.fluxoFinanceiro.push({id,tipo:'despesa',categoria:CAT,label:'Repasse de comissão · '+nomeDent(d)+' · até '+fmtDataBR(ate),fornecedor:nomeDent(d),valor:por[d],vencimento:ate>hojeISO()?hojeISO():ate,confirmado:false,dataPagamento:'',repasse:{dentistaId:d,ate,em}}); });
      l.forEach(({e,linhas})=>{ const v={}; linhas.forEach(x=>{ if(x.dentId) v[x.dentId]=r2((v[x.dentId]||0)+x.valor); });
        if(!Object.keys(v).length) return; e.comissao={ate,em,valores:v,repasses:Object.keys(v).map(d=>ids[d]).filter(Boolean)}; });
      saveData(); render(); avisarRapido('Repasses lançados em contas a pagar.'); });
  }));
  document.querySelectorAll('[data-cmdesf]').forEach(b=>b.addEventListener('click',()=>{
    const r=(state.fluxoFinanceiro||[]).find(x=>x.id===b.getAttribute('data-cmdesf')); if(!r||r.confirmado) return;
    const em=r.repasse.em;
    const irmaos=(state.fluxoFinanceiro||[]).filter(x=>x.repasse&&x.repasse.em===em);
    if(irmaos.some(x=>x.confirmado)){ avisar('Algum repasse deste fechamento já foi pago. Desfaça o pagamento dele antes.'); return; }
    confirmarAcao(`Desfazer o fechamento de ${fmtDataBR(r.repasse.ate)}? Os ${irmaos.length} repasse(s) saem de contas a pagar e as comissões voltam para "a fechar".`,'Desfazer',()=>{
      const set=new Set(irmaos.map(x=>x.id));
      state.fluxoFinanceiro=state.fluxoFinanceiro.filter(x=>!set.has(x.id));
      state.fluxoFinanceiro.forEach(x=>{ if(x.comissao&&x.comissao.em===em) delete x.comissao; });
      saveData(); render(); });
  }));
};
})();
