// OdontoGestão · Comissão dos dentistas por percentual (definida pelo Master por especialidade, com exceção por dentista).
// Regra (2.32): comissão pelo VALOR INTEGRAL do procedimento, devida no ATENDIMENTO (evolução confirmada), mesmo que o
// paciente pague parcelado. Valor do procedimento = sua parte no total negociado do orçamento aprovado. O dentista é quem
// confirmou a evolução; os ainda não executados aparecem em "Comissões futuras" no nome do dentista responsável.
// Fechamento diário: gera a despesa "Repasse de comissão" em contas a pagar e marca o item do orçamento (i.comissao).
// Até a 2.31 a comissão era por parcela recebida (e.comissao): o que já foi repassado assim é descontado do item.
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
function execucao(p,recId){
  if(!recId) return null; let r=null;
  (p.evolucao||[]).forEach(e=>{ if(e.confirmado && !e.falta && e.confirmadoPorId && (typeof refsDaEvol==='function'?refsDaEvol(e):(e.procedimentoRefs||[])).includes(recId)) r={quem:e.confirmadoPorId,data:e.data||''}; });
  return r;
}
function executor(p,recId){ const r=execucao(p,recId); return r?r.quem:null; }
function nomeDent(id){ const u=(state.users||[]).find(x=>x.id===id); return u?nomeExibicao(u):'(sem dentista)'; }
// comissões de uma parcela recebida: [{dentId, esp, base, pct, valor, item}]
function calcParcela(e){
  const p=pacPorId(e.pacienteId); if(!p) return [];
  const o=(p.orcamentos||[]).find(x=>x.id===e.orcamentoId); if(!o) return [];
  const itens=o.itens||[]; const tot=itens.reduce((s,i)=>s+(+i.valor||0),0); if(!(tot>0)) return [];
  const bruto=valorQuitado(e), recs=recIdsDoOrc(p,o);
  return itens.map((i,k)=>{ const base=r2(bruto*(+i.valor||0)/tot); const d=executor(p,recs[k])||o.dentistaId||''; const pct=d?pctDe(d,i.especialidade):0;
    return {k, dentId:d, esp:i.especialidade||'', base, pct, valor:r2(base*pct/100), item:i.nome, executado:!!executor(p,recs[k])}; }).filter(x=>x.base>0);
}
// comissão já repassada por parcela (regra antiga) para cada item do orçamento
function legado(p,o){
  const v={}; (state.fluxoFinanceiro||[]).forEach(e=>{ if(e.tipo==='receita' && e.comissao && e.orcamentoId===o.id && e.pacienteId===p.id) calcParcela(e).forEach(x=>{ v[x.k]=r2((v[x.k]||0)+x.valor); }); });
  return v;
}
// comissões dos procedimentos de um orçamento aprovado, pelo valor integral
function itensOrc(p,o){
  const itens=o.itens||[]; const soma=itens.reduce((s,i)=>s+(+i.valor||0),0); if(!(soma>0)) return [];
  const total=o.total!=null?+o.total||0:soma, recs=recIdsDoOrc(p,o), leg=legado(p,o);
  return itens.map((i,k)=>{ const ex=execucao(p,recs[k]); const base=r2(total*(+i.valor||0)/soma); const d=(ex&&ex.quem)||o.dentistaId||''; const pct=d?pctDe(d,i.especialidade):0;
    const cheio=r2(base*pct/100), ja=Math.min(cheio,leg[k]||0);
    return {p,o,i,k, dentId:d, esp:i.especialidade||'', base, pct, cheio, ja, valor:r2(cheio-ja), item:i.nome, executado:!!ex, data:ex?ex.data:''}; }).filter(x=>x.base>0);
}
function orcsAprovados(){ const l=[]; (state.patients||[]).forEach(p=>(p.orcamentos||[]).forEach(o=>{ if(o.status==='aprovado') l.push({p,o}); })); return l; }
// procedimentos atendidos (evolução confirmada) que ainda não entraram em fechamento
function aFechar(ate){
  const c=cfg(); if(!c.ativo) return [];
  const l=[]; orcsAprovados().forEach(({p,o})=>itensOrc(p,o).forEach(x=>{ if(x.executado && !x.i.comissao && x.data>=(c.inicio||'0000') && x.data<=ate && x.valor>0) l.push(x); }));
  return l;
}
window.comissoesAFecharValor=function(){ if(!liberado()||!podeFin()||!cfg().ativo) return 0; return r2(aFechar(addDaysStr(hojeISO(),-1)).reduce((s,x)=>s+(x.dentId?x.valor:0),0)); };
window.comissaoBloqueiaDesfazer=function(e){ if(e && e.comissao){ return 'A comissão desta parcela já entrou no repasse de '+fmtDataBR(e.comissao.ate)+'. Desfaça esse fechamento em Relatórios → Comissões antes de desfazer o pagamento.'; } return ''; };

// ---- Configurações → Comissões (só Master) ----
let dentAberto='';
window.comissaoConfigHtml=function(){
  if(!souMaster()) return '<div class="card"><p class="muted">Só o Master define as comissões.</p></div>';
  const c=cfg(), esps=especialidades(), ds=dentistas();
  return `<div class="card"><h3 style="margin:0 0 4px">Comissão dos dentistas</h3>
    <p class="muted" style="margin:0 0 10px">O dentista recebe a % da especialidade sobre o <strong>valor integral</strong> de cada procedimento do orçamento aprovado, no <strong>atendimento</strong> (evolução confirmada), mesmo que o paciente pague parcelado. A comissão é de quem confirmou a evolução; os procedimentos ainda não feitos aparecem como comissão futura do dentista responsável pelo orçamento. Todo dia você fecha as comissões em <strong>Relatórios → Comissões</strong> e o sistema lança o repasse em contas a pagar.</p>
    <form id="fComis">
    <div class="row"><div><label class="chk-linha" style="margin-top:6px"><input type="checkbox" id="cmAtivo" ${c.ativo?'checked':''} style="width:auto"> Calcular comissões</label></div>
      <div><label for="cmInicio">Contar atendimentos a partir de</label><input id="cmInicio" type="date" value="${esc(c.inicio||hojeISO())}"></div></div>
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
let ateSel='', abertoDet=new Set(), abertoFut=new Set();
// procedimentos de orçamentos aprovados ainda não executados: comissão futura do dentista responsável
function futuras(){ const l=[]; orcsAprovados().forEach(({p,o})=>itensOrc(p,o).forEach(x=>{ if(!x.executado && !x.i.comissao && x.valor>0) l.push(x); })); return l; }
window.repComissoes=function(){
  const c=cfg();
  if(!c.ativo) return repCard('Comissões dos dentistas','As comissões ainda não estão ligadas.',``,'',`<p>${souMaster()?'Defina as % em <strong>Configurações → Comissões</strong> e marque "Calcular comissões".':'Peça ao Master para definir as comissões em Configurações → Comissões.'}</p>`);
  const hoje=hojeISO(), ate=ateSel||hoje;
  const l=aFechar(ate), por={}, semDent=[];
  l.forEach(x=>{ if(!x.dentId){ semDent.push(x); return; } const g=por[x.dentId]||(por[x.dentId]={tot:0,base:0,lin:[]}); g.tot=r2(g.tot+x.valor); g.base=r2(g.base+x.base); g.lin.push(x); });
  const total=r2(Object.values(por).reduce((s,g)=>s+g.tot,0));
  const filtros=`<div><label for="cmAte">Fechar atendimentos até</label><input id="cmAte" type="date" value="${esc(ate)}" max="${hoje}"></div>`;
  const nomeP=x=>esc(x.p.nome||'');
  const valCel=x=>`${fmtMoney(x.valor)}${x.ja>0?` <span class="muted" style="font-size:11.5px">(${fmtMoney(x.cheio)} − ${fmtMoney(x.ja)} já repassado por parcela)</span>`:''}`;
  const blocos=Object.keys(por).sort((a,b)=>nomeDent(a).localeCompare(nomeDent(b))).map(d=>{ const g=por[d];
    return `<details class="cm-dent" ${abertoDet.has(d)?'open':''} data-cmdet="${d}"><summary><strong>${esc(nomeDent(d))}</strong> · ${fmtMoney(g.tot)} <span class="muted">sobre ${fmtMoney(g.base)} em procedimentos</span></summary>
      <div class="overflow"><table><thead><tr><th>Atendido em</th><th>Paciente</th><th>Procedimento</th><th>Especialidade</th><th>Valor do procedimento</th><th>%</th><th>Comissão</th></tr></thead><tbody>
      ${g.lin.sort((a,b)=>a.data.localeCompare(b.data)).map(x=>`<tr><td>${fmtDataBR(x.data)}</td><td>${nomeP(x)}</td><td>${esc(x.item)}</td><td>${esc(x.esp)}</td><td>${fmtMoney(x.base)}</td><td>${pctFmt(x.pct)}</td><td>${valCel(x)}</td></tr>`).join('')}
      <tr class="cm-tot"><td colspan="4">Total</td><td>${fmtMoney(g.base)}</td><td></td><td>${fmtMoney(g.tot)}</td></tr>
      </tbody></table></div></details>`; }).join('');
  const aviso=semDent.length?`<p class="cm-aviso">⚠️ ${semDent.length} procedimento(s) atendido(s) sem dentista definido: ${fmtMoney(r2(semDent.reduce((s,x)=>s+x.base,0)))}. Defina o <strong>dentista responsável</strong> no orçamento do paciente (aba Orçamento) para entrarem na comissão.${[...new Set(semDent.map(x=>x.p))].slice(0,6).map(p=>` ${repPacBtn(p,'orcamento')}`).join('')}</p>`:'';
  const fut=futuras(), porF={};
  fut.forEach(x=>{ if(!x.dentId) return; const g=porF[x.dentId]||(porF[x.dentId]={tot:0,base:0,lin:[]}); g.tot=r2(g.tot+x.valor); g.base=r2(g.base+x.base); g.lin.push(x); });
  const totF=r2(Object.values(porF).reduce((t,g)=>t+g.tot,0)), baseF=r2(Object.values(porF).reduce((t,g)=>t+g.base,0));
  const futHtml=Object.keys(porF).length?`<h4 style="margin:20px 0 4px">Comissões futuras</h4><p class="muted" style="margin:0 0 8px;font-size:13px">Procedimentos de orçamentos aprovados que ainda não foram feitos: é o que cada dentista ainda tem a receber pelo valor integral. Só informativo; entra no fechamento quando a evolução for confirmada (vale para quem confirmar).</p>
    <p style="margin:0 0 8px"><strong>Total a receber pelos dentistas:</strong> ${fmtMoney(totF)} <span class="muted">sobre ${fmtMoney(baseF)} em procedimentos a fazer</span></p>`
    +Object.keys(porF).sort((a,b)=>nomeDent(a).localeCompare(nomeDent(b))).map(d=>{ const g=porF[d];
      return `<details class="cm-dent" ${abertoFut.has(d)?'open':''} data-cmfut="${d}"><summary><strong>${esc(nomeDent(d))}</strong> · ainda a receber ${fmtMoney(g.tot)} <span class="muted">sobre ${fmtMoney(g.base)}</span></summary>
      <div class="overflow"><table><thead><tr><th>Aprovado em</th><th>Paciente</th><th>Procedimento</th><th>Especialidade</th><th>Valor do procedimento</th><th>%</th><th>Comissão</th></tr></thead><tbody>
      ${g.lin.sort((a,b)=>(a.o.dataAprovacao||a.o.data||'').localeCompare(b.o.dataAprovacao||b.o.data||'')).map(x=>`<tr><td>${fmtDataBR(x.o.dataAprovacao||x.o.data)}</td><td>${nomeP(x)}</td><td>${esc(x.item)}</td><td>${esc(x.esp)}</td><td>${fmtMoney(x.base)}</td><td>${pctFmt(x.pct)}</td><td>${valCel(x)}</td></tr>`).join('')}
      <tr class="cm-tot"><td colspan="4">Total</td><td>${fmtMoney(g.base)}</td><td></td><td>${fmtMoney(g.tot)}</td></tr></tbody></table></div></details>`; }).join(''):'';
  const repasses=(state.fluxoFinanceiro||[]).filter(e=>e.repasse).sort((a,b)=>(b.repasse.ate||'').localeCompare(a.repasse.ate||'')||(b.repasse.em||'').localeCompare(a.repasse.em||'')).slice(0,30);
  const hist=repasses.length?`<h4 style="margin:18px 0 6px">Fechamentos anteriores</h4><div class="overflow"><table><thead><tr><th>Até</th><th>Dentista</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>
    ${repasses.map(e=>`<tr><td>${fmtDataBR(e.repasse.ate)}</td><td>${esc(nomeDent(e.repasse.dentistaId))}</td><td>${fmtMoney(e.valor)}</td><td>${e.confirmado?`<span class="badge b-dent">Pago em ${fmtDataBR(e.dataPagamento)}</span>`:'<span class="badge b-harm">A pagar</span>'}</td><td>${e.confirmado?'':`<button class="btn-s peq" data-cmdesf="${e.id}">Desfazer fechamento</button>`}</td></tr>`).join('')}</tbody></table></div>`:'';
  return repCard('Comissões dos dentistas',`Comissão pelo valor integral dos procedimentos atendidos (evolução confirmada), mesmo com o paciente pagando parcelado, pela % de cada especialidade. Feche todos os dias: o sistema lança o repasse de cada dentista em contas a pagar (categoria ${CAT}).`,filtros,
    `<strong>A fechar até ${fmtDataBR(ate)}:</strong> ${fmtMoney(total)} &nbsp;·&nbsp; <strong>Dentistas:</strong> ${Object.keys(por).length} &nbsp;·&nbsp; <strong>Procedimentos:</strong> ${l.length}`,
    aviso+(blocos||'<p class="muted">Nenhuma comissão a fechar até essa data.</p>')+(total>0&&podeFin()?`<div style="margin-top:12px"><button class="btn-p" data-cmfechar>Fechar e lançar repasses (${fmtMoney(total)})</button></div>`:'')+futHtml+hist);
};
window.repComissoesLigar=function(){
  const a=document.getElementById('cmAte'); if(a) a.addEventListener('change',()=>{ ateSel=a.value; render(); });
  document.querySelectorAll('[data-cmfut]').forEach(d=>d.addEventListener('toggle',()=>{ const id=d.getAttribute('data-cmfut'); if(d.open) abertoFut.add(id); else abertoFut.delete(id); }));
  document.querySelectorAll('[data-cmdet]').forEach(d=>d.addEventListener('toggle',()=>{ const id=d.getAttribute('data-cmdet'); if(d.open) abertoDet.add(id); else abertoDet.delete(id); }));
  document.querySelectorAll('[data-cmfechar]').forEach(b=>b.addEventListener('click',()=>{
    const ate=ateSel||hojeISO(), l=aFechar(ate); if(!l.length) return;
    const por={}; l.forEach(x=>{ if(x.dentId) por[x.dentId]=r2((por[x.dentId]||0)+x.valor); });
    const tot=r2(Object.values(por).reduce((s,v)=>s+v,0));
    confirmarAcao(`Fechar as comissões dos atendimentos até ${fmtDataBR(ate)} e lançar ${Object.keys(por).length} repasse(s), total ${fmtMoney(tot)}, em contas a pagar?`,'Fechar',()=>{
      const em=new Date().toISOString(), ids={};
      Object.keys(por).forEach(d=>{ if(!(por[d]>0)) return; const id=uid(); ids[d]=id;
        state.fluxoFinanceiro.push({id,tipo:'despesa',categoria:CAT,label:'Repasse de comissão · '+nomeDent(d)+' · até '+fmtDataBR(ate),fornecedor:nomeDent(d),valor:por[d],vencimento:ate>hojeISO()?hojeISO():ate,confirmado:false,dataPagamento:'',repasse:{dentistaId:d,ate,em}}); });
      l.forEach(x=>{ if(x.dentId && ids[x.dentId]) x.i.comissao={ate,em,dentistaId:x.dentId,valor:x.valor,base:x.base,pct:x.pct,repasse:ids[x.dentId]}; });
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
      (state.patients||[]).forEach(p=>(p.orcamentos||[]).forEach(o=>(o.itens||[]).forEach(i=>{ if(i.comissao&&i.comissao.em===em) delete i.comissao; })));
      saveData(); render(); });
  }));
};
})();
