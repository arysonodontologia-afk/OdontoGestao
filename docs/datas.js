// =====================================================================
// OdontoGestão — datas sempre no padrão dd/mm/aaaa
// • Todo <input type="date"> vira um campo dd/mm/aaaa (com máscara e um
//   botão de calendário). O .value do campo continua lendo e gravando no
//   formato interno aaaa-mm-dd, então o resto do sistema não muda.
// • Rede de segurança: qualquer data aaaa-mm-dd que apareça como texto na
//   tela é mostrada como dd/mm/aaaa.
// =====================================================================
(function(){
  const ISO=/^(\d{4})-(\d{2})-(\d{2})$/;
  const VD=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  const nat=el=>VD.get.call(el);
  const isoParaBR=v=>{ const m=ISO.exec(v||''); return m?`${m[3]}/${m[2]}/${m[1]}`:''; };
  function brParaISO(v){
    const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v||''); if(!m) return '';
    const d=+m[1], mo=+m[2], y=+m[3], dt=new Date(y,mo-1,d);
    if(y<1900||y>2200||dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const mascara=v=>{ const d=String(v||'').replace(/\D/g,'').slice(0,8); return d.length>4?d.slice(0,2)+'/'+d.slice(2,4)+'/'+d.slice(4):d.length>2?d.slice(0,2)+'/'+d.slice(2):d; };
  const ICO='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';

  function conferir(el){
    const t=nat(el), iso=brParaISO(t);
    let msg='';
    if(t && !iso) msg='Data inválida. Use dd/mm/aaaa.';
    else if(iso && el.dataset.brMin && iso<el.dataset.brMin) msg='A data precisa ser a partir de '+isoParaBR(el.dataset.brMin)+'.';
    else if(iso && el.dataset.brMax && iso>el.dataset.brMax) msg='A data precisa ser até '+isoParaBR(el.dataset.brMax)+'.';
    el.setCustomValidity(msg);
    return !t || (iso && !msg);
  }
  function campo(el){
    if(el.dataset.br) return;
    el.dataset.br='1';
    const ini=nat(el)||el.getAttribute('value')||'';
    if(el.getAttribute('min')) el.dataset.brMin=el.getAttribute('min');
    if(el.getAttribute('max')) el.dataset.brMax=el.getAttribute('max');
    el.removeAttribute('min'); el.removeAttribute('max');
    el.type='text';
    el.setAttribute('inputmode','numeric'); el.setAttribute('maxlength','10'); el.setAttribute('autocomplete','off');
    if(!el.getAttribute('placeholder')) el.setAttribute('placeholder','dd/mm/aaaa');
    el.classList.add('data-br');
    Object.defineProperty(el,'value',{configurable:true,
      get(){ return brParaISO(nat(this)); },
      set(v){ v=v==null?'':String(v); VD.set.call(this, ISO.test(v)?isoParaBR(v):(ISO.test(v.slice(0,10))?isoParaBR(v.slice(0,10)):v)); conferir(this); }});
    Object.defineProperty(el,'valueAsDate',{configurable:true,get(){ const v=this.value; return v?new Date(v+'T00:00:00'):null; }});
    VD.set.call(el,isoParaBR(ini));
    // caixa + calendário nativo transparente por cima do ícone
    const box=document.createElement('span'); box.className='data-br-box';
    if(el.style.width){ box.style.width=el.style.width; box.style.display='inline-block'; el.style.width='100%'; }
    if(el.style.display==='inline-block'){ box.style.display='inline-block'; el.style.display=''; }
    el.parentNode.insertBefore(box,el); box.appendChild(el);
    const ico=document.createElement('span'); ico.className='data-br-ico'; ico.innerHTML=ICO; box.appendChild(ico);
    const cal=document.createElement('input'); cal.type='date'; cal.className='data-br-cal'; cal.tabIndex=-1;
    cal.setAttribute('aria-label','Abrir calendário');
    if(el.dataset.brMin) cal.min=el.dataset.brMin; if(el.dataset.brMax) cal.max=el.dataset.brMax;
    box.appendChild(cal);
    const sinc=()=>{ cal.disabled=el.disabled||el.readOnly; try{ VD.set.call(cal,el.value||''); }catch(e){} };
    sinc();
    cal.addEventListener('pointerdown',sinc);
    cal.addEventListener('focus',sinc);
    cal.addEventListener('click',()=>{ sinc(); if(cal.disabled) return; try{ cal.showPicker&&cal.showPicker(); }catch(e){} });
    cal.addEventListener('change',()=>{
      const v=nat(cal); if(!v) return;
      el.value=v;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    el.addEventListener('input',()=>{
      const t=nat(el), m=mascara(t);
      if(m!==t) VD.set.call(el,m);
      conferir(el);
      if(m.length===10 && brParaISO(m) && el.dataset.brUlt!==m){ el.dataset.brUlt=m; el.dispatchEvent(new Event('change',{bubbles:true})); }
    });
    el.addEventListener('focus',()=>{ el.dataset.brUlt=nat(el); });
  }
  // não deixa um texto incompleto chegar aos "change" do sistema como data vazia
  document.addEventListener('change',e=>{
    const el=e.target;
    if(!(el && el.dataset && el.dataset.br==='1')) return;
    if(!conferir(el)){ e.stopImmediatePropagation(); try{ el.reportValidity(); }catch(x){} }
    else if(e.isTrusted && el.dataset.brUlt===nat(el)) e.stopImmediatePropagation();   // já avisado ao completar
  },true);

  const PULA={SCRIPT:1,STYLE:1,TEXTAREA:1,INPUT:1,SELECT:1,OPTION:1,CODE:1,PRE:1};
  const RX=/(^|[^\d\/-])(\d{4})-(\d{2})-(\d{2})(?![\dT:\/-])/g;
  function textos(raiz){
    if(!raiz) return;
    if(raiz.nodeType===3){ trocar(raiz); return; }
    if(raiz.nodeType!==1 || PULA[raiz.nodeName] || raiz.isContentEditable) return;
    const w=document.createTreeWalker(raiz,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
      for(let p=n.parentNode;p&&p!==raiz.parentNode;p=p.parentNode){ if(PULA[p.nodeName]||p.isContentEditable) return NodeFilter.FILTER_REJECT; }
      return /\d{4}-\d{2}-\d{2}/.test(n.data)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP; }});
    const l=[]; while(w.nextNode()) l.push(w.currentNode); l.forEach(trocar);
  }
  function trocar(n){
    if(!/\d{4}-\d{2}-\d{2}/.test(n.data)) return;
    const p=n.parentNode; if(p && (PULA[p.nodeName]||p.isContentEditable)) return;
    const v=n.data.replace(RX,(t,a,y,m,d)=>(+m>=1&&+m<=12&&+d>=1&&+d<=31)?a+d+'/'+m+'/'+y:t);
    if(v!==n.data) n.data=v;
  }
  function varrer(raiz){
    if(raiz.nodeType===1){
      if(raiz.matches && raiz.matches('input[type=date]:not(.data-br-cal)')) campo(raiz);
      raiz.querySelectorAll && raiz.querySelectorAll('input[type=date]:not(.data-br-cal)').forEach(campo);
    }
    textos(raiz);
  }
  function iniciar(){
    varrer(document.body);
    new MutationObserver(ms=>{ ms.forEach(m=>m.addedNodes.forEach(varrer)); }).observe(document.body,{childList:true,subtree:true});
  }
  window.DatasBR={isoParaBR,brParaISO,mascara,varrer};
  if(document.body) iniciar(); else document.addEventListener('DOMContentLoaded',iniciar);
})();
