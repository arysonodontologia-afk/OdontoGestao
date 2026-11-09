// OdontoGestão · análise de radiografia com IA (personalização "analise-radiografia")
// Apoio ao diagnóstico: a IA sugere achados e traça raízes (linha contínua) e condutos (tracejado);
// o dentista confere, corrige o traçado e salva junto com a radiografia. Nada aqui é diagnóstico.
(function(){
const CHAVE_IA='analise-radiografia';
const COR={raiz:'#F5B400',conduto:'#E5484D',achado:'#3E9BFF'};
const NOME_TIPO={carie:'Cárie',lesao_periapical:'Lesão periapical',perda_ossea:'Perda óssea',reabsorcao:'Reabsorção',fratura:'Fratura',restauracao:'Restauração',tratamento_endodontico:'Tratamento endodôntico',pino_coroa:'Pino / coroa',implante:'Implante',calculo:'Cálculo',incluso:'Dente incluso',outro:'Outro'};
const CERTEZA={baixa:'certeza baixa',media:'certeza média',alta:'certeza alta'};
let iaUrl=null, iaUrlLida=false;

async function urlIA(){
  if(iaUrlLida) return iaUrl;
  try{ const d=await Nuvem.lerPlataforma('ia'); iaUrl=(d&&d.url)||null; }catch(e){ iaUrl=null; }
  iaUrlLida=true; return iaUrl;
}
function iaLiberada(){
  if(!NUVEM || !fichaPers() || !temPersonalizacaoChave(CHAVE_IA)) return false;
  const u=currentUser(); return !!u && (u.tipo==='master' || ehDentista(u));
}
window.iaLiberada=iaLiberada;
window.iaPreparar=()=>{ if(iaLiberada()) urlIA(); };

// tamanho que o Claude (resolução alta) aceita sem redimensionar: coordenadas batem com a imagem enviada
function tamanhoIA(w,h,maxEdge=2576,maxTokens=4784){
  const fits=(a,b)=>Math.ceil(a/28)*28<=maxEdge && Math.ceil(b/28)*28<=maxEdge && Math.ceil(a/28)*Math.ceil(b/28)<=maxTokens;
  const par=v=>{ const f=Math.floor(v); return v-f!==0.5?Math.round(v):(f%2===0?f:f+1); };
  if(fits(w,h)) return [w,h];
  if(h>w){ const [b,a]=tamanhoIA(h,w,maxEdge,maxTokens); return [a,b]; }
  const ar=w/h; let lo=1, hi=w;
  while(lo+1<hi){ const mid=Math.floor((lo+hi)/2); if(fits(mid,Math.max(par(mid/ar),1))) lo=mid; else hi=mid; }
  return [lo,Math.max(par(lo/ar),1)];
}
window.tamanhoIA=tamanhoIA;
async function prepararImagem(url){
  const img=await new Promise((ok,erro)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>erro(new Error('Não foi possível abrir a imagem.')); i.src=url; });
  let w=img.naturalWidth, h=img.naturalHeight;
  const lim=2000; if(Math.max(w,h)>lim){ const k=lim/Math.max(w,h); w=Math.round(w*k); h=Math.round(h*k); }
  [w,h]=tamanhoIA(w,h);
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,w,h); g.drawImage(img,0,0,w,h);
  const data=c.toDataURL('image/jpeg',0.9);
  return {b64:data.slice(data.indexOf(',')+1), w, h};
}

function itemDe(p,tipo,id){ const ex=p.exames||{}; return (tipo==='panoramica'?ex.panoramicas:ex.periapicais||[]).find(x=>x.id===id); }
function tracosDe(an){
  const t=[];
  (an.dentes||[]).forEach(d=>{
    (d.raizes||[]).forEach(r=>{ if((r.pontos||[]).length>=2) t.push({id:uid(),tipo:'raiz',dente:d.dente||'',nome:r.nome||'',pontos:r.pontos}); });
    (d.condutos||[]).forEach(r=>{ if((r.pontos||[]).length>=2) t.push({id:uid(),tipo:'conduto',dente:d.dente||'',nome:r.nome||'',pontos:r.pontos}); });
  });
  return t;
}

// ---------- pedir a análise ----------
async function analisar(p,tipo,id){
  const it=itemDe(p,tipo,id); if(!it) return;
  if(clinicaBloqueada()){ avisarBloqueio(); return; }
  state.meta=state.meta||{};
  if(!state.meta.iaCiente){
    const ok=await new Promise(res=>{
      const m=document.createElement('div'); m.className='modal-bg';
      m.innerHTML=`<div class="modal" role="dialog" aria-label="Análise com IA" style="text-align:left;max-width:520px"><h3 style="margin:0 0 8px">Análise com IA: apoio ao diagnóstico</h3>
        <p>A radiografia é enviada <strong>sem o nome nem os dados do paciente</strong> para a IA da Anthropic (Claude), que devolve sugestões de achados e o traçado aproximado de raízes e condutos.</p>
        <p>O resultado pode conter erros. <strong>O diagnóstico e a conduta são sempre do cirurgião-dentista.</strong></p>
        <p class="muted">Use com o consentimento do paciente para o uso de ferramentas de IA no atendimento.</p>
        <label style="display:flex;gap:8px;align-items:flex-start;font-weight:400;margin-top:10px"><input type="checkbox" data-ciente style="margin-top:3px"> A clínica está ciente e se responsabiliza pelo consentimento dos pacientes.</label>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button class="btn-s" data-c="nao">Cancelar</button><button class="btn-p" data-c="sim" disabled>Analisar</button></div></div>`;
      document.body.appendChild(m);
      m.querySelector('[data-ciente]').addEventListener('change',e=>{ m.querySelector('[data-c="sim"]').disabled=!e.target.checked; });
      m.querySelector('[data-c="nao"]').addEventListener('click',()=>{ m.remove(); res(false); });
      m.querySelector('[data-c="sim"]').addEventListener('click',()=>{ m.remove(); res(true); });
    });
    if(!ok) return;
    state.meta.iaCiente={por:(currentUser()||{}).id||'',em:new Date().toISOString()}; saveData();
  }
  const url=await urlIA();
  if(!url){ avisar('A análise com IA ainda não foi configurada nesta plataforma. Avise o suporte do OdontoGestão.'); return; }
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML='<div class="modal" role="dialog" aria-label="Analisando radiografia" style="text-align:center"><div class="ia-girando" aria-hidden="true"></div><h3 style="margin:10px 0 4px">Analisando a radiografia…</h3><p class="muted" style="margin:0">Isso leva de 20 a 60 segundos. Não feche esta janela.</p></div>';
  document.body.appendChild(bg);
  try{
    const src=it.imagemId?await urlDaImagem(it.imagemId):it.imagemData;
    const im=await prepararImagem(src);
    const tok=await Nuvem.tokenId();
    const r=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+tok,'Content-Type':'text/plain','X-Clinica':Nuvem.clinicaId(),'X-Tipo':tipo,'X-Dente':String(it.dente||''),'X-Largura':String(im.w),'X-Altura':String(im.h)},body:im.b64});
    const j=await r.json().catch(()=>({}));
    if(!r.ok || !j.analise) throw new Error((j.erro||('Falha na análise ('+r.status+').'))+(j.detalhe?' Detalhe técnico: '+j.detalhe:''));
    it.analiseIA={em:new Date().toISOString(),por:(currentUser()||{}).id||'',modelo:j.modelo||'',largura:im.w,altura:im.h,resultado:j.analise,tracos:tracosDe(j.analise),editado:false};
    saveData(); bg.remove(); abrirAnalise(p,tipo,id);
  }catch(e){ console.error(e); bg.remove(); avisar(e.message||'Não foi possível analisar a radiografia.'); }
}

// ---------- ver e corrigir ----------
function caminho(pts){ return (pts||[]).map((q,i)=>(i?'L':'M')+(+q[0]).toFixed(1)+' '+(+q[1]).toFixed(1)).join(' '); }
async function abrirAnalise(p,tipo,id){
  const it=itemDe(p,tipo,id); if(!it||!it.analiseIA) return;
  const a=it.analiseIA, an=a.resultado||{}, W=a.largura, H=a.altura;
  let tracos=JSON.parse(JSON.stringify(a.tracos||[]));
  let ver={achados:true,raiz:true,conduto:true}, modo='ver', novo=null, sel=null, arrasto=null, mudou=false;
  const pode=iaLiberada();
  const src=it.imagemId?await urlDaImagem(it.imagemId):it.imagemData;
  const achados=(an.achados||[]);
  const bg=document.createElement('div'); bg.className='modal-bg ia-bg';
  bg.innerHTML=`<div class="modal ia-modal" role="dialog" aria-label="Análise da radiografia com IA">
    <div class="ia-topo"><div><h3 style="margin:0">Análise da radiografia · ${tipo==='panoramica'?'Panorâmica':'Periapical, dente '+esc(it.dente||'')}</h3>
      <p class="muted" style="margin:2px 0 0;font-size:12.5px">Gerada por IA em ${fmtDataHoraBR(a.em)}${a.editado?' · traçado corrigido pelo profissional':''}. Sugestões para apoio: o diagnóstico é do cirurgião-dentista.</p></div>
      <button class="btn-s" data-ia="fechar">Fechar</button></div>
    <div class="ia-corpo">
      <div class="ia-imagem"><div class="ia-quadro"><img src="${src}" alt="Radiografia" draggable="false"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-ia="svg"></svg></div>
        <div class="ia-camadas">
          <label><input type="checkbox" data-camada="achados" checked> <span class="ia-leg ia-leg-achado"></span>Achados</label>
          <label><input type="checkbox" data-camada="raiz" checked> <span class="ia-leg ia-leg-raiz"></span>Raízes</label>
          <label><input type="checkbox" data-camada="conduto" checked> <span class="ia-leg ia-leg-conduto"></span>Condutos</label>
        </div>
        ${pode?`<div class="ia-ferr" role="toolbar" aria-label="Editar traçado">
          <button class="btn-s" data-modo="ver">Selecionar / mover</button>
          <button class="btn-s" data-modo="raiz">+ Raiz</button>
          <button class="btn-s" data-modo="conduto">+ Conduto</button>
          <button class="btn-s" data-ia="concluir" hidden>Concluir linha</button>
          <button class="btn-d" data-ia="apagar" hidden>Apagar linha</button>
        </div><p class="muted ia-dica" data-ia="dica"></p>`:''}
      </div>
      <div class="ia-lado">
        <div class="ia-bloco"><strong>Resumo</strong><p>${esc(an.resumo||'—')}</p><p class="muted" style="font-size:12.5px">Qualidade da imagem: ${esc(an.qualidade_imagem||'—')}</p></div>
        <div class="ia-bloco"><strong>Raízes e condutos</strong><div data-ia="contagem"></div></div>
        <div class="ia-bloco"><strong>Achados sugeridos</strong>${achados.length?`<ol class="ia-achados">${achados.map((x,i)=>`<li data-achado="${i}"><span class="ia-num">${i+1}</span><div><b>${esc(x.titulo||NOME_TIPO[x.tipo]||'Achado')}</b>${x.dente?` · dente ${esc(x.dente)}`:''} <span class="muted">(${esc(CERTEZA[x.certeza]||'')})</span><br><span>${esc(x.descricao||'')}</span></div></li>`).join('')}</ol>`:'<p class="muted">Nenhum achado relevante sugerido.</p>'}</div>
        ${an.limitacoes?`<div class="ia-bloco"><strong>Limitações</strong><p class="muted">${esc(an.limitacoes)}</p></div>`:''}
        <div class="ia-acoes">${pode?'<button class="btn-p" data-ia="salvar" disabled>Salvar traçado</button><button class="btn-s" data-ia="refazer">Analisar de novo</button>':''}</div>
      </div>
    </div></div>`;
  document.body.appendChild(bg);
  const q=s=>bg.querySelector(s), svg=q('[data-ia="svg"]');
  const escala=()=>{ const r=svg.getBoundingClientRect(); return W/Math.max(1,r.width); };
  const ponto=ev=>{ const r=svg.getBoundingClientRect(); return [Math.max(0,Math.min(W,(ev.clientX-r.left)*W/r.width)),Math.max(0,Math.min(H,(ev.clientY-r.top)*H/r.height))]; };
  function contagem(){
    const por={};
    tracos.forEach(t=>{ const k=t.dente||'—'; por[k]=por[k]||{raiz:0,conduto:0}; por[k][t.tipo]++; });
    const linhas=(an.dentes||[]).map(d=>{ const k=d.dente||'—', tr=por[k]||{raiz:0,conduto:0};
      return `<li>Dente ${esc(d.dente||'?')}: <b>${d.n_raizes}</b> ${d.n_raizes===1?'raiz':'raízes'} e <b>${d.n_condutos}</b> conduto${d.n_condutos===1?'':'s'} <span class="muted">(${esc(CERTEZA[d.certeza]||'')}; traçado: ${tr.raiz} ${tr.raiz===1?'raiz':'raízes'}, ${tr.conduto} conduto${tr.conduto===1?'':'s'})</span>${d.observacao?`<br><span class="muted">${esc(d.observacao)}</span>`:''}</li>`; }).join('');
    q('[data-ia="contagem"]').innerHTML=linhas?`<ul class="ia-lista">${linhas}</ul>`:'<p class="muted">Nenhum dente com raízes visíveis para traçar.</p>';
  }
  function desenhar(){
    const k=escala(), sw=(2.2*k).toFixed(2), r=(5*k).toFixed(2), fs=(13*k).toFixed(1);
    let h='';
    if(ver.achados) achados.forEach((x,i)=>{ const c=x.caixa||[]; if(c.length!==4) return;
      const [x1,y1,x2,y2]=[Math.min(c[0],c[2]),Math.min(c[1],c[3]),Math.max(c[0],c[2]),Math.max(c[1],c[3])];
      h+=`<g class="ia-achado"><rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" fill="none" stroke="${COR.achado}" stroke-width="${sw}" stroke-dasharray="${(4*k).toFixed(1)} ${(3*k).toFixed(1)}" rx="${(3*k).toFixed(1)}"/><circle cx="${x1}" cy="${y1}" r="${(9*k).toFixed(1)}" fill="${COR.achado}"/><text x="${x1}" y="${(y1+4.5*k).toFixed(1)}" font-size="${fs}" text-anchor="middle" fill="#fff" font-weight="700">${i+1}</text></g>`; });
    tracos.forEach(t=>{ if(!ver[t.tipo]) return;
      const s=sel===t.id;
      h+=`<path d="${caminho(t.pontos)}" fill="none" stroke="${COR[t.tipo]}" stroke-width="${s?(3.6*k).toFixed(2):sw}" stroke-linecap="round" stroke-linejoin="round" ${t.tipo==='conduto'?`stroke-dasharray="${(7*k).toFixed(1)} ${(5*k).toFixed(1)}"`:''} data-traco="${t.id}" class="ia-traco"/>`;
      if(s && modo==='ver') t.pontos.forEach((pt,i)=>{ h+=`<circle cx="${pt[0]}" cy="${pt[1]}" r="${r}" fill="#fff" stroke="${COR[t.tipo]}" stroke-width="${sw}" data-ponto="${i}" class="ia-ponto"/>`; });
    });
    if(novo && novo.pontos.length) h+=`<path d="${caminho(novo.pontos)}" fill="none" stroke="${COR[novo.tipo]}" stroke-width="${sw}" ${novo.tipo==='conduto'?`stroke-dasharray="${(7*k).toFixed(1)} ${(5*k).toFixed(1)}"`:''}/>`+novo.pontos.map(pt=>`<circle cx="${pt[0]}" cy="${pt[1]}" r="${r}" fill="${COR[novo.tipo]}"/>`).join('');
    svg.innerHTML=h;
    svg.style.cursor=modo==='ver'?'default':'crosshair';
    if(pode){
      bg.querySelectorAll('[data-modo]').forEach(b=>b.classList.toggle('ativo',b.getAttribute('data-modo')===modo));
      q('[data-ia="concluir"]').hidden=!(novo&&novo.pontos.length>=2);
      q('[data-ia="apagar"]').hidden=!(sel&&modo==='ver');
      q('[data-ia="salvar"]').disabled=!mudou;
      q('[data-ia="dica"]').textContent=modo==='ver'?(sel?'Arraste os pontos brancos para ajustar a linha, ou apague a linha selecionada.':'Toque numa linha para selecionar e ajustar.'):`Toque na imagem para marcar os pontos da ${modo==='raiz'?'raiz (contorno, do colo ao ápice e de volta)':'linha do conduto (da entrada ao ápice)'}; depois "Concluir linha".`;
    }
    contagem();
  }
  function concluir(){
    if(novo && novo.pontos.length>=2){ tracos.push({id:uid(),tipo:novo.tipo,dente:it.dente||'',nome:'',pontos:novo.pontos.map(x=>[+x[0].toFixed(1),+x[1].toFixed(1)])}); mudou=true; }
    novo=null; modo='ver'; desenhar();
  }
  const fechar=()=>{ if(mudou && !confirm('Sair sem salvar as correções do traçado?')) return; bg.remove(); window.removeEventListener('resize',desenhar); };
  q('[data-ia="fechar"]').addEventListener('click',fechar);
  bg.addEventListener('click',e=>{ if(e.target===bg) fechar(); });
  bg.querySelectorAll('[data-camada]').forEach(c=>c.addEventListener('change',()=>{ ver[c.getAttribute('data-camada')]=c.checked; desenhar(); }));
  if(pode){
    bg.querySelectorAll('[data-modo]').forEach(b=>b.addEventListener('click',()=>{ if(novo&&novo.pontos.length>=2) concluir(); modo=b.getAttribute('data-modo'); sel=null; novo=modo==='ver'?null:{tipo:modo,pontos:[]}; if(modo!=='ver') ver[modo]=true; bg.querySelectorAll('[data-camada]').forEach(c=>{ c.checked=ver[c.getAttribute('data-camada')]; }); desenhar(); }));
    q('[data-ia="concluir"]').addEventListener('click',concluir);
    q('[data-ia="apagar"]').addEventListener('click',()=>{ tracos=tracos.filter(t=>t.id!==sel); sel=null; mudou=true; desenhar(); });
    svg.addEventListener('pointerdown',ev=>{
      const alvo=ev.target;
      if(modo!=='ver'){ ev.preventDefault(); novo.pontos.push(ponto(ev)); desenhar(); return; }
      if(alvo.hasAttribute('data-ponto') && sel){ ev.preventDefault(); arrasto={i:+alvo.getAttribute('data-ponto')}; svg.setPointerCapture(ev.pointerId); return; }
      const tid=alvo.getAttribute('data-traco'); sel=tid||null; desenhar();
    });
    svg.addEventListener('pointermove',ev=>{ if(!arrasto) return; const t=tracos.find(x=>x.id===sel); if(!t) return; const pt=ponto(ev); t.pontos[arrasto.i]=[+pt[0].toFixed(1),+pt[1].toFixed(1)]; mudou=true; desenhar(); });
    svg.addEventListener('pointerup',()=>{ arrasto=null; });
    q('[data-ia="salvar"]').addEventListener('click',()=>{
      if(novo&&novo.pontos.length>=2) concluir();
      a.tracos=tracos; a.editado=true; a.editadoPor=(currentUser()||{}).id||''; a.editadoEm=new Date().toISOString();
      saveData(); mudou=false; avisarRapido('Traçado salvo na radiografia.'); bg.remove(); render();
    });
    q('[data-ia="refazer"]').addEventListener('click',()=>{ if(mudou && !confirm('Analisar de novo descarta as correções não salvas. Continuar?')) return; bg.remove(); analisar(p,tipo,id); });
  }
  bg.querySelectorAll('[data-achado]').forEach(li=>li.addEventListener('mouseenter',()=>{ const g=svg.querySelectorAll('.ia-achado')[+li.getAttribute('data-achado')]; if(g) g.classList.add('ia-destaque'); }));
  bg.querySelectorAll('[data-achado]').forEach(li=>li.addEventListener('mouseleave',()=>svg.querySelectorAll('.ia-destaque').forEach(g=>g.classList.remove('ia-destaque'))));
  const img=q('.ia-quadro img'); if(img.complete) desenhar(); else img.addEventListener('load',desenhar);
  window.addEventListener('resize',desenhar);
}

// botões nas radiografias (chamado pelo app depois de desenhar a aba Exames)
window.iaBotoes=function(x){
  if(!iaLiberada()) return '';
  return x.analiseIA?`<button class="btn-s ia-btn" data-iaver="${x.id}">🔍 Ver análise IA</button>`:`<button class="btn-s ia-btn" data-ianova="${x.id}">🔍 Analisar com IA</button>`;
};
window.iaLigar=function(p){
  document.querySelectorAll('[data-ianova],[data-iaver]').forEach(b=>b.addEventListener('click',e=>{
    e.preventDefault(); e.stopPropagation();
    const id=b.getAttribute('data-ianova')||b.getAttribute('data-iaver');
    const tipo=(p.exames.panoramicas||[]).some(x=>x.id===id)?'panoramica':'periapical';
    if(b.hasAttribute('data-ianova')) analisar(p,tipo,id); else abrirAnalise(p,tipo,id);
  }));
};
window.iaAbrirAnalise=abrirAnalise;
})();
