const KEY='odontoGestaoData';            // formato antigo (localStorage) — usado só para migrar
const APP_VERSION='2.0.1';
const NUVEM=!!(window.Nuvem && window.Nuvem.ativa);   // true quando firebase-config.js está preenchido
const DB_NAME='odontoGestaoDB';
function estadoVazio(){ return {clinic:null, users:[], patients:[], meta:{}}; }
let state=estadoVazio();
let storageMode='boot';                   // 'boot' | 'idb' | 'ls'
let saveErro=null, storagePersistido=null;
let dbPromise=null;
function abrirDB(){
  if(dbPromise) return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB){ reject(new Error('IndexedDB indisponível')); return; }
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{ const db=req.result; db.createObjectStore('kv'); db.createObjectStore('imagens',{keyPath:'id'}); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('Banco de dados bloqueado por outra aba'));
  });
  return dbPromise;
}
function idbTx(store,mode,fn){
  return abrirDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode);
    let result;
    const r=fn(tx.objectStore(store));
    if(r) r.onsuccess=()=>{ result=r.result; };
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error('Transação abortada'));
  }));
}
const idbGet=(store,key)=>idbTx(store,'readonly',st=>st.get(key));
const idbPut=(store,val,key)=>idbTx(store,'readwrite',st=>key===undefined?st.put(val):st.put(val,key));
const idbDel=(store,key)=>idbTx(store,'readwrite',st=>st.delete(key));
const idbClear=(store)=>idbTx(store,'readwrite',st=>st.clear());
const idbAll=(store)=>idbTx(store,'readonly',st=>st.getAll());
const idbKeys=(store)=>idbTx(store,'readonly',st=>st.getAllKeys());

function atualizarBannerSalvar(){
  let b=document.getElementById('saveBanner');
  if(!saveErro){ if(b) b.remove(); return; }
  if(!b){
    b=document.createElement('div'); b.id='saveBanner';
    b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:60;background:#b91c1c;color:#fff;padding:12px 16px;font-size:14px;text-align:center';
    document.body.appendChild(b);
  }
  b.textContent=NUVEM?('⚠️ ATENÇÃO: '+saveErro):('⚠️ ATENÇÃO: não foi possível salvar as últimas alterações ('+saveErro+'). Exporte um backup agora (Configurações → Backup) e libere espaço no navegador.');
}
let saveChain=Promise.resolve();
function saveData(){
  if(NUVEM){
    try{ Nuvem.salvar(state); }
    catch(e){ console.error(e); saveErro='falha ao preparar o envio para a nuvem ('+e.message+')'; atualizarBannerSalvar(); }
    return;
  }
  if(storageMode==='idb'){
    saveChain=saveChain
      .then(()=>idbPut('kv',state,'state'))
      .then(()=>{ if(saveErro){ saveErro=null; atualizarBannerSalvar(); } })
      .catch(e=>{
        console.error(e);
        saveErro=(e&&e.name==='QuotaExceededError')?'armazenamento cheio':'falha ao gravar no navegador';
        atualizarBannerSalvar();
      });
  } else if(storageMode==='ls'){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }
    catch(e){ console.error(e); saveErro='armazenamento cheio'; atualizarBannerSalvar(); }
  }
}
window.addEventListener('beforeunload',e=>{ if((!NUVEM && saveErro) || (NUVEM && Nuvem.pendentes()>0)){ e.preventDefault(); e.returnValue=''; } });

function dataUrlToBlob(dataUrl){
  const parts=dataUrl.split(',');
  const mime=(parts[0].match(/data:([^;]+)/)||[])[1]||'image/jpeg';
  const bin=atob(parts[1]); const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
async function migrarDoLocalStorage(){
  let raw=null; try{ raw=localStorage.getItem(KEY); }catch(e){}
  if(!raw) return null;
  const st=JSON.parse(raw);
  for(const p of (st.patients||[])){
    const ex=p.exames; if(!ex) continue;
    for(const lista of [ex.panoramicas||[], ex.periapicais||[]]){
      for(const it of lista){
        if(it.imagemData){
          const blob=dataUrlToBlob(it.imagemData);
          const id=uid();
          await idbPut('imagens',{id,blob,mime:blob.type});
          it.imagemId=id; delete it.imagemData;
        }
      }
    }
  }
  return st;
}
async function carregarDados(){
  try{
    await abrirDB();
    let st=await idbGet('kv','state');
    if(!st){
      st=await migrarDoLocalStorage();
      if(st) await idbPut('kv',st,'state');
    }
    state=st||estadoVazio();
    storageMode='idb';
    try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().then(r=>{ storagePersistido=r; }).catch(()=>{}); }catch(_){}
  }catch(e){
    console.error(e);
    storageMode='ls';
    saveErro='modo limitado: este navegador não oferece armazenamento seguro — não use com dados reais';
    try{ const r=localStorage.getItem(KEY); state=r?JSON.parse(r):estadoVazio(); }catch(_){ state=estadoVazio(); }
    setTimeout(atualizarBannerSalvar,0);
  }
  state.users=state.users||[]; state.patients=state.patients||[]; state.meta=state.meta||{};
}

// ---------- imagens (radiografias) guardadas como arquivos no banco do navegador ----------
const urlCache={};
async function salvarImagem(file){
  if(NUVEM) return Nuvem.salvarImagem(file);
  const id=uid();
  await idbPut('imagens',{id,blob:file,mime:file.type||'image/jpeg'});
  return id;
}
async function urlDaImagem(id){
  if(NUVEM) return Nuvem.urlDaImagem(id);
  if(urlCache[id]) return urlCache[id];
  const rec=await idbGet('imagens',id);
  if(!rec) return '';
  urlCache[id]=URL.createObjectURL(rec.blob);
  return urlCache[id];
}
async function removerImagem(id){
  if(!id) return;
  if(NUVEM){ Nuvem.removerImagem(id); return; }
  try{ await idbDel('imagens',id); if(urlCache[id]){ URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; } }catch(e){ console.error(e); }
}
function imagensDoPaciente(p){
  const ex=p.exames||{};
  return [...(ex.panoramicas||[]),...(ex.periapicais||[])].map(x=>x.imagemId).filter(Boolean);
}
function imgAttr(x){ return x.imagemId?`data-imgid="${x.imagemId}"`:`src="${x.imagemData||''}"`; }
function hidratarImagens(){
  document.querySelectorAll('img[data-imgid]').forEach(async img=>{
    const url=await urlDaImagem(img.getAttribute('data-imgid'));
    if(url) img.src=url;
  });
}

// ---------- backup ----------
function fmtDataHoraBR(iso){ try{ return new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }catch(e){ return iso; } }
function baixarBlob(blob,nome){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function exportarBackup(senha){
  state.meta=state.meta||{}; state.meta.ultimoBackup=new Date().toISOString();
  saveData();
  const imgs=NUVEM?await Nuvem.todasImagens():await idbAll('imagens');
  const header={app:'OdontoGestao',formato:1,versaoApp:APP_VERSION,geradoEm:state.meta.ultimoBackup,state,
    imagens:imgs.map(i=>({id:i.id,mime:i.mime||i.blob.type,size:i.blob.size}))};
  const enc=new TextEncoder();
  const hb=enc.encode(JSON.stringify(header));
  const len=new Uint8Array(4); new DataView(len.buffer).setUint32(0,hb.length,true);
  let blob=new Blob([enc.encode('ODB1'),len,hb,...imgs.map(i=>i.blob)],{type:'application/octet-stream'});
  if(senha) blob=await cifrarBlob(blob,senha);
  const d=new Date(); const pad=n=>String(n).padStart(2,'0');
  baixarBlob(blob,`odontogestao-backup-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${senha?'-protegido':''}.odb`);
}
async function lerBackup(file){
  if(file.size<8) throw new Error('arquivo de backup inválido');
  const head=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(String.fromCharCode(...head.slice(0,4))!=='ODB1') throw new Error('este não é um arquivo de backup do OdontoGestão');
  const hlen=new DataView(head.buffer).getUint32(4,true);
  if(8+hlen>file.size) throw new Error('arquivo de backup incompleto');
  const header=JSON.parse(new TextDecoder().decode(new Uint8Array(await file.slice(8,8+hlen).arrayBuffer())));
  if(header.app!=='OdontoGestao' || !header.state || !Array.isArray(header.state.users) || !Array.isArray(header.state.patients)) throw new Error('conteúdo do backup não reconhecido');
  let off=8+hlen; const imgs=[];
  for(const im of (header.imagens||[])){ imgs.push({id:im.id,blob:file.slice(off,off+im.size,im.mime),mime:im.mime}); off+=im.size; }
  if(off!==file.size) throw new Error('arquivo de backup incompleto ou corrompido');
  return {header,imgs};
}
async function restaurarBackup(file){
  const {header,imgs}=await lerBackup(file);          // valida tudo antes de mexer nos dados atuais
  if(NUVEM) return restaurarBackupNuvem(header,imgs);
  for(const im of imgs) await idbPut('imagens',im);
  state=header.state; state.meta=state.meta||{};
  ensureProcedimentos();
  await migrarSenhas();
  await idbPut('kv',state,'state');
  const manter=new Set(imgs.map(i=>i.id));
  for(const k of await idbKeys('imagens')){ if(!manter.has(k)) await idbDel('imagens',k); }
  Object.keys(urlCache).forEach(k=>{ URL.revokeObjectURL(urlCache[k]); delete urlCache[k]; });
  session=null; try{ sessionStorage.removeItem('odontoSession'); }catch(e){}
  patientDetailId=null; currentTab='dashboard';
  view=state.clinic?(state.users.length?'login':'setupUser'):'setupClinic';
  render();
  avisar('Backup restaurado com sucesso. Entre novamente com seu usuário e senha.');
}
// ---------- senhas: nunca guardadas em texto; PBKDF2-SHA-256 com sal individual ----------
const SHA_K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256Js(data){
  const l=data.length, padLen=((l+9+63)>>6)<<6, m=new Uint8Array(padLen); m.set(data); m[l]=0x80;
  const dv=new DataView(m.buffer); dv.setUint32(padLen-8,Math.floor(l/0x20000000)); dv.setUint32(padLen-4,(l<<3)>>>0);
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w=new Uint32Array(64);
  for(let off=0;off<padLen;off+=64){
    for(let i=0;i<16;i++) w[i]=dv.getUint32(off+i*4);
    for(let i=16;i<64;i++){ const x=w[i-15], y=w[i-2];
      const s0=((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3), s1=((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0; }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let i=0;i<64;i++){
      const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)), ch=(e&f)^(~e&g), t1=(h+S1+ch+SHA_K[i]+w[i])>>>0;
      const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)), maj=(a&b)^(a&c)^(b&c), t2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
  }
  const out=new Uint8Array(32), od=new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i)=>od.setUint32(i*4,v)); return out;
}
function hmacSha256Js(key,msg){
  if(key.length>64) key=sha256Js(key);
  const ip=new Uint8Array(64+msg.length), op=new Uint8Array(96);
  for(let i=0;i<64;i++){ const k=i<key.length?key[i]:0; ip[i]=k^0x36; op[i]=k^0x5c; }
  ip.set(msg,64); op.set(sha256Js(ip),64); return sha256Js(op);
}
function pbkdf2Js(pass,salt,iter){
  const first=new Uint8Array(salt.length+4); first.set(salt); first[salt.length+3]=1;
  let u=hmacSha256Js(pass,first); const t=u.slice();
  for(let i=1;i<iter;i++){ u=hmacSha256Js(pass,u); for(let j=0;j<32;j++) t[j]^=u[j]; }
  return t;
}
const temCripto=()=>!!(window.crypto && crypto.subtle);
function bytesParaHex(buf){ return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
function hexParaBytes(h){ const a=new Uint8Array(h.length/2); for(let i=0;i<a.length;i++) a[i]=parseInt(h.substr(i*2,2),16); return a; }
async function pbkdf2Senha(senha,salt,iter){
  const pass=new TextEncoder().encode(senha);
  if(temCripto()){
    const km=await crypto.subtle.importKey('raw',pass,'PBKDF2',false,['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},km,256));
  }
  await new Promise(r=>setTimeout(r,30));
  return pbkdf2Js(pass,salt,iter);
}
async function hashSenha(senha){
  const salt=crypto.getRandomValues(new Uint8Array(16)), iter=temCripto()?100000:30000;
  return {senhaSalt:bytesParaHex(salt), senhaHash:bytesParaHex(await pbkdf2Senha(senha,salt,iter)), senhaIter:iter};
}
function iguaisTexto(a,b){ if(a.length!==b.length) return false; let r=0; for(let i=0;i<a.length;i++) r|=a.charCodeAt(i)^b.charCodeAt(i); return r===0; }
async function verificarSenha(u,senha){
  if(u.senhaHash) return iguaisTexto(bytesParaHex(await pbkdf2Senha(senha,hexParaBytes(u.senhaSalt),u.senhaIter||100000)),u.senhaHash);
  return u.password!==undefined && iguaisTexto(String(u.password),senha);
}
async function migrarSenhas(){
  if(NUVEM) return;
  let mudou=false;
  for(const u of state.users){ if(u.password!==undefined && !u.senhaHash){ Object.assign(u,await hashSenha(String(u.password))); delete u.password; mudou=true; } }
  if(mudou) saveData();
}

// ---------- backup protegido por senha (AES-256-GCM em blocos, chave derivada por PBKDF2) ----------
const CRIPTO_BLOCO=4*1024*1024;
function u32bytes(n){ const b=new Uint8Array(4); new DataView(b.buffer).setUint32(0,n,false); return b; }
async function chaveDaSenha(senha,salt,iter){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(senha),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function ivDoBloco(prefixo,i){ const iv=new Uint8Array(12); iv.set(prefixo,0); new DataView(iv.buffer).setUint32(8,i,false); return iv; }
function adDoBloco(i,ultimo){ const ad=new Uint8Array(5); new DataView(ad.buffer).setUint32(0,i,false); ad[4]=ultimo?1:0; return ad; }
async function cifrarBlob(plano,senha){
  if(!temCripto()) throw new Error('este navegador não permite criptografar o backup (use o Google Chrome)');
  const salt=crypto.getRandomValues(new Uint8Array(16)), prefixo=crypto.getRandomValues(new Uint8Array(8)), iter=200000;
  const chave=await chaveDaSenha(senha,salt,iter);
  const n=Math.max(1,Math.ceil(plano.size/CRIPTO_BLOCO));
  const partes=[new TextEncoder().encode('ODB2'),salt,prefixo,u32bytes(iter),u32bytes(CRIPTO_BLOCO)];
  for(let i=0;i<n;i++){
    const buf=await plano.slice(i*CRIPTO_BLOCO,(i+1)*CRIPTO_BLOCO).arrayBuffer();
    const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:ivDoBloco(prefixo,i),additionalData:adDoBloco(i,i===n-1)},chave,buf));
    partes.push(u32bytes(ct.length),ct);
  }
  return new Blob(partes,{type:'application/octet-stream'});
}
async function decifrarBlob(arq,senha){
  if(!temCripto()) throw new Error('este navegador não permite abrir backups protegidos por senha (use o Google Chrome)');
  const cab=new Uint8Array(await arq.slice(0,36).arrayBuffer());
  if(cab.length<36 || String.fromCharCode(...cab.slice(0,4))!=='ODB2') throw new Error('arquivo de backup protegido inválido');
  const salt=cab.slice(4,20), prefixo=cab.slice(20,28), iter=new DataView(cab.buffer).getUint32(28,false);
  const chave=await chaveDaSenha(senha,salt,iter);
  const partes=[]; let off=36, i=0;
  while(off<arq.size){
    const lb=new Uint8Array(await arq.slice(off,off+4).arrayBuffer()); if(lb.length<4) throw new Error('arquivo de backup incompleto');
    const len=new DataView(lb.buffer).getUint32(0,false); off+=4;
    if(off+len>arq.size) throw new Error('arquivo de backup incompleto');
    const ct=await arq.slice(off,off+len).arrayBuffer(); off+=len;
    try{ partes.push(await crypto.subtle.decrypt({name:'AES-GCM',iv:ivDoBloco(prefixo,i),additionalData:adDoBloco(i,off>=arq.size)},chave,ct)); }
    catch(e){ throw new Error('senha incorreta ou arquivo de backup corrompido'); }
    i++;
  }
  if(i===0) throw new Error('arquivo de backup incompleto');
  return new Blob(partes);
}
function pedirTexto(titulo,opc){
  opc=opc||{};
  return new Promise(resolve=>{
    const bg=document.createElement('div'); bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="text-align:left;max-width:440px;width:100%"><p style="margin-top:0">${esc(titulo)}</p>${opc.multilinha?'<textarea class="ta" rows="4" data-pt></textarea>':`<input data-pt type="${opc.tipo||'text'}" autocomplete="off">`}<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end"><button class="btn-s" data-pt-no>Cancelar</button><button class="btn-p" data-pt-ok>${esc(opc.rotuloOk||'OK')}</button></div></div>`;
    document.body.appendChild(bg);
    const campo=bg.querySelector('[data-pt]'); campo.value=opc.valor||''; campo.focus();
    const fechar=v=>{ if(bg.parentNode) bg.parentNode.removeChild(bg); resolve(v); };
    bg.querySelector('[data-pt-no]').addEventListener('click',()=>fechar(null));
    bg.querySelector('[data-pt-ok]').addEventListener('click',()=>fechar(campo.value));
    campo.addEventListener('keydown',e=>{ if(e.key==='Enter' && !opc.multilinha){ e.preventDefault(); fechar(campo.value); } });
  });
}
function confirmarAcao(message,labelSim,onSim){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal"><p>${esc(message)}</p><div style="margin-top:16px;display:flex;gap:8px;justify-content:center"><button class="btn-s" data-ca="nao">Cancelar</button><button class="btn-d" data-ca="sim">${esc(labelSim)}</button></div></div>`;
  document.body.appendChild(bg);
  const fechar=()=>{ if(bg.parentNode) bg.parentNode.removeChild(bg); };
  bg.querySelector('[data-ca="nao"]').addEventListener('click',fechar);
  bg.querySelector('[data-ca="sim"]').addEventListener('click',()=>{ fechar(); onSim(); });
}
function lembreteBackupHtml(){
  const u=currentUser(); if(!u) return '';
  const perms=Object.assign(defaultPerms(u.tipo),u.permissions||{});
  if(!perms.usuarios || !state.patients.length) return '';
  const ult=state.meta&&state.meta.ultimoBackup;
  const dias=ult?Math.floor((Date.now()-new Date(ult).getTime())/86400000):null;
  if(ult && dias<7) return '';
  return `<div class="card" style="border-color:#d97706;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
    <span>💾 ${ult?'Seu último backup foi há '+dias+' dia(s).':'Você ainda não fez nenhum backup.'} Faça um backup para não perder os dados.</span>
    <button class="btn-p" id="btnGoBackup">Fazer backup agora</button></div>`;
}
function renderBackup(){
  const ult=state.meta&&state.meta.ultimoBackup;
  const dias=ult?Math.floor((Date.now()-new Date(ult).getTime())/86400000):null;
  return `<div class="card"><h3>Backup dos dados</h3>
  <p class="muted">${NUVEM?'Os dados ficam na nuvem (Firebase, servidor em São Paulo) e aparecem em todos os computadores e celulares. O backup gera um arquivo com TUDO (pacientes, radiografias, agenda, financeiro) para você guardar fora da nuvem.':'Os dados ficam guardados neste computador, dentro do navegador. O backup gera um arquivo com TUDO (pacientes, radiografias, agenda, financeiro) para você guardar em outro lugar.'}</p>
  <p><strong>Último backup:</strong> ${ult?esc(fmtDataHoraBR(ult))+' ('+(dias===0?'hoje':'há '+dias+' dia(s)')+')':'<span style="color:#dc2626;font-weight:700">nunca feito</span>'}</p>
  <div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:10px 0">
    <label style="display:flex;gap:8px;align-items:flex-start;color:var(--text);font-size:14px;margin:0"><input type="checkbox" id="bkCripto" style="width:auto;margin-top:3px" ${temCripto()?'checked':'disabled'}><span><strong>Proteger o backup com senha (recomendado)</strong> — sem a senha, ninguém consegue ler o arquivo.${temCripto()?'':' <em>Este navegador não permite criptografar; use o Google Chrome.</em>'}</span></label>
    <div id="bkSenhaBox" style="display:${temCripto()?'block':'none'}">
      <div class="row"><div><label>Senha do backup (mínimo 8 caracteres)</label><input type="password" id="bkSenha1" autocomplete="new-password"></div>
      <div><label>Repita a senha</label><input type="password" id="bkSenha2" autocomplete="new-password"></div></div>
      <p class="muted" style="margin:8px 0 0">⚠️ Anote essa senha em lugar seguro. Se ela for esquecida, o backup <strong>não pode ser aberto</strong> e não existe recuperação.</p>
    </div>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button id="btnExportBackup" class="btn-p">⬇️ Exportar backup</button>
    ${!NUVEM || (currentUser()&&currentUser().tipo==='master')?'<button id="btnImportBackup" class="btn-s">⬆️ Importar backup</button>':''}
    <input type="file" id="fileImportBackup" accept=".odb" style="display:none">
  </div></div>
  <div class="card"><h4 style="margin:0 0 8px 0">Estado do armazenamento</h4><div id="storageInfo" class="muted">Calculando…</div></div>
  <div class="card"><h4 style="margin:0 0 8px 0">Boas práticas</h4>
  <ul style="margin:0;padding-left:20px;line-height:1.7;font-size:14px">
    ${NUVEM?`<li>A nuvem gratuita do Firebase não guarda cópias antigas: faça um backup <strong>pelo menos uma vez por semana</strong> e guarde fora da nuvem (HD externo, pendrive).</li>
    <li>Antes de qualquer atualização grande do sistema, exporte um backup.</li>
    <li>Cada pessoa usa o próprio login. Nunca compartilhe e-mail e senha.</li>
    <li>Ao terminar o dia em computador compartilhado, clique em <strong>Sair</strong>: a cópia local dos dados é apagada daquele navegador.</li>
    <li>Importar um backup substitui os dados de <strong>toda a clínica</strong>, em todos os aparelhos.</li>`:`<li>Faça backup ao fim de cada dia de trabalho (no mínimo uma vez por semana) e guarde cópias <strong>fora do iMac</strong> (HD externo e/ou nuvem).</li>
    <li>Antes de instalar qualquer atualização do sistema, exporte um backup.</li>
    <li>Use sempre o mesmo navegador e o mesmo arquivo, e evite abrir o sistema em duas abas ao mesmo tempo.</li>
    <li>Ative o FileVault e use senha no macOS — o login do sistema não substitui a proteção do computador.</li>
    <li>De tempos em tempos, teste a restauração do backup.</li>`}
  </ul></div>`;
}
async function atualizarInfoArmazenamento(){
  const el=document.getElementById('storageInfo'); if(!el) return;
  if(NUVEM){
    const nImg=state.patients.reduce((n,p)=>n+imagensDoPaciente(p).length,0);
    el.innerHTML=`Versão do sistema: <strong>${APP_VERSION}</strong><br>Pacientes: <strong>${state.patients.length}</strong> · Radiografias: <strong>${nImg}</strong><br>Armazenamento: <strong>nuvem (Firebase · São Paulo)</strong><br>Conectado como: <strong>${esc(Nuvem.meuEmail())}</strong>`;
    return;
  }
  let uso='', prot='indisponível';
  try{
    if(navigator.storage&&navigator.storage.estimate){ const e=await navigator.storage.estimate(); uso=`${(e.usage/1048576).toFixed(1)} MB em uso de ${(e.quota/1048576).toFixed(0)} MB disponíveis`; }
    if(navigator.storage&&navigator.storage.persisted){ prot=(await navigator.storage.persisted())?'sim':'não solicitada/negada'; }
  }catch(e){}
  let nImg=0; try{ nImg=(await idbKeys('imagens')).length; }catch(e){}
  const el2=document.getElementById('storageInfo'); if(!el2) return;
  el2.innerHTML=`Versão do sistema: <strong>${APP_VERSION}</strong><br>Pacientes: <strong>${state.patients.length}</strong> · Radiografias: <strong>${nImg}</strong><br>Armazenamento: <strong>${uso||'não informado pelo navegador'}</strong><br>Proteção contra limpeza automática pelo navegador: <strong>${prot}</strong><br>Modo de gravação: <strong>${storageMode==='idb'?'banco do navegador (IndexedDB)':'limitado (localStorage)'}</strong>`;
}
let session = null;
try{ if(!NUVEM) session = JSON.parse(sessionStorage.getItem('odontoSession')||'null'); }catch(e){}
let view = 'setupClinic';
let currentTab = 'dashboard';
let editingUserId = null, editingPatientId = null, patientForm = null;
let patientDetailId = null, patientDetailTab = 'dados';
let anamneseOpenId = null;
let docFormType=null, docOpenId=null, exameOpenId=null;
function ensureAnamneses(p){
  if(!p.anamneses){
    p.anamneses = p.anamnese ? [{id:uid(), tipo:'odontologica', dataPreenchimento:hojeISO(), dados:p.anamnese, finalizado:true}] : [];
    delete p.anamnese;
    saveData();
  }
}
function addAnamnese(p, tipo){
  ensureAnamneses(p);
  const rec={id:uid(), tipo, dataPreenchimento:hojeISO(), dados: tipo==='odontologica'?defaultAnamnese():{}, finalizado:false};
  p.anamneses.push(rec); saveData();
  return rec;
}
function fieldRow(label,value){
  return `<div style="margin-bottom:10px"><div class="muted" style="font-size:12px">${label}</div><div>${esc(value)||'-'}</div></div>`;
}

const TOOTH_SHAPES={
  incisor:'M9 4 L21 4 L19.5 30 Q15 37 10.5 30 Z',
  canine:'M15 2 L23 9 L20 32 Q15 39 10 32 L7 9 Z',
  premolar:'M7 8 Q15 1 23 8 L21 31 Q15 38 9 31 Z',
  molar:'M4 9 Q6 2 11 5 Q15 1 19 5 Q24 2 26 9 L24 31 Q15 39 6 31 Z'
};
const PERM_UPPER=[{n:18,t:'molar'},{n:17,t:'molar'},{n:16,t:'molar'},{n:15,t:'premolar'},{n:14,t:'premolar'},{n:13,t:'canine'},{n:12,t:'incisor'},{n:11,t:'incisor'},
  {n:21,t:'incisor'},{n:22,t:'incisor'},{n:23,t:'canine'},{n:24,t:'premolar'},{n:25,t:'premolar'},{n:26,t:'molar'},{n:27,t:'molar'},{n:28,t:'molar'}];
const PERM_LOWER=[{n:48,t:'molar'},{n:47,t:'molar'},{n:46,t:'molar'},{n:45,t:'premolar'},{n:44,t:'premolar'},{n:43,t:'canine'},{n:42,t:'incisor'},{n:41,t:'incisor'},
  {n:31,t:'incisor'},{n:32,t:'incisor'},{n:33,t:'canine'},{n:34,t:'premolar'},{n:35,t:'premolar'},{n:36,t:'molar'},{n:37,t:'molar'},{n:38,t:'molar'}];
const DECID_UPPER=[{n:55,t:'molar'},{n:54,t:'molar'},{n:53,t:'canine'},{n:52,t:'incisor'},{n:51,t:'incisor'},
  {n:61,t:'incisor'},{n:62,t:'incisor'},{n:63,t:'canine'},{n:64,t:'molar'},{n:65,t:'molar'}];
const DECID_LOWER=[{n:85,t:'molar'},{n:84,t:'molar'},{n:83,t:'canine'},{n:82,t:'incisor'},{n:81,t:'incisor'},
  {n:71,t:'incisor'},{n:72,t:'incisor'},{n:73,t:'canine'},{n:74,t:'molar'},{n:75,t:'molar'}];

let odontoSetupMode=null, odontoSetupMap={}, odontoToothOpenNum=null;
function procEhRealizado(pp){ return pp.status==='Concluído' || pp.status==='Realizado anteriormente'; }
function statusProcBadge(status){
  if(status==='Concluído') return '<span class="badge b-adm">Concluído</span>';
  if(status==='Realizado anteriormente') return '<span class="badge b-adm">Realizado anteriormente</span>';
  return '<span class="badge b-red">A executar</span>';
}
function toothIconCell(t, flip, rec){
  const status=rec&&rec.status;
  const hasProc=rec&&rec.procedimentos&&rec.procedimentos.length;
  let overlay='', cls='';
  if(status==='ausente') overlay='<div class="tooth-overlay">A</div>';
  else if(status==='extraido') overlay='<div class="tooth-overlay">X</div>';
  else if(hasProc){
    const feitos=rec.procedimentos.filter(procEhRealizado).length;
    const aExecutar=rec.procedimentos.length-feitos;
    overlay=(feitos?`<div class="tooth-badge tooth-badge-blue">${feitos}</div>`:'')+(aExecutar?`<div class="tooth-badge tooth-badge-red">${aExecutar}</div>`:'');
    cls=aExecutar?' tooth-red':' tooth-blue';
  }
  return `<button class="tooth-btn${cls}" data-tooth="${t.n}" title="Dente ${t.n}"><svg viewBox="0 0 30 40" ${flip?'style="transform:scaleY(-1)"':''}><path d="${TOOTH_SHAPES[t.t]}"/></svg>${overlay}</button>`;
}
function toothNumCell(t){ return `<div class="tooth-num-cell">${t.n}</div>`; }
function archRow(teeth, mid, cellFn){
  let html='';
  teeth.forEach((t,i)=>{ if(i===mid) html+='<div class="odonto-gap"></div>'; html+=cellFn(t); });
  return html;
}
function renderOdontogramChart(title, upper, lower, mid, dentesMap){
  dentesMap=dentesMap||{};
  return `<div class="card"><h4>${title}</h4>
  <div class="odonto-row">${archRow(upper,mid,t=>toothIconCell(t,true,dentesMap[t.n]))}</div>
  <div class="odonto-row odonto-nums">${archRow(upper,mid,toothNumCell)}</div>
  <div class="odonto-sep"></div>
  <div class="odonto-row odonto-nums">${archRow(lower,mid,toothNumCell)}</div>
  <div class="odonto-row">${archRow(lower,mid,t=>toothIconCell(t,false,dentesMap[t.n]))}</div>
  </div>`;
}
function allTeethNumbers(p){
  const age=calcAge(p.nascimento);
  let list=[...PERM_UPPER,...PERM_LOWER].map(t=>t.n);
  if(age!==null && age<13) list=list.concat([...DECID_UPPER,...DECID_LOWER].map(t=>t.n));
  return list;
}
function renderOdontoAsk(){
  return `<div class="card"><h3>Odontograma</h3>
  <p>Paciente possui perda ou ausência de algum dos dentes?</p>
  <div style="display:flex;gap:10px"><button id="btnOdontoSim" class="btn-p">Sim</button><button id="btnOdontoNao" class="btn-s">Não</button></div>
  </div>`;
}
function renderOdontoMarking(p){
  const age=calcAge(p.nascimento);
  const dentesMap={};
  Object.keys(odontoSetupMap).forEach(n=>{ dentesMap[n]={status:odontoSetupMap[n]}; });
  let html=`<div class="card"><h3>Marcar dentes ausentes / com extração anterior</h3>
  <p class="muted">Clique no dente para marcar: 1º clique = Ausente (A), 2º clique = Extração anterior (X), 3º clique = remover a marcação.</p></div>`;
  html+=renderOdontogramChart('Odontograma Permanente', PERM_UPPER, PERM_LOWER, 8, dentesMap);
  if(age!==null && age<13) html+=renderOdontogramChart('Odontograma Decíduo', DECID_UPPER, DECID_LOWER, 5, dentesMap);
  html+=`<div class="card"><p class="muted">🔵 A = Ausente &nbsp;·&nbsp; 🔵 X = Extração anterior</p>
  <button id="btnConfirmMark" class="btn-p">Confirmar marcações</button> <button id="btnCancelMark" class="btn-s">Cancelar</button></div>`;
  return html;
}
function renderToothPanel(p,n){
  if(!n) return '';
  const rec=(p.odonto.dentes||{})[n];
  const restricted = !!(rec && rec.status);
  const procs=state.procedimentos.filter(pr=>(pr.escopo||'dente')==='dente' && (!restricted || grupoPermiteDenteAusente(pr.especialidade)));
  const added=(rec&&rec.procedimentos)||[];
  const addedRows=added.map((pp,i)=>{
    return `<tr><td>${esc(pp.nome)}</td><td>${statusProcBadge(pp.status)}</td><td>${fmtMoney(pp.valor)}</td><td>${pp.tempoMin} min</td><td><button class="btn-d" data-rmtoothproc="${i}">Remover</button></td></tr>`;
  }).join('');
  return `<div class="card"><h4>Dente ${n} ${restricted?`<span class="badge b-harm">${rec.status==='ausente'?'Ausente':'Extração anterior'}</span>`:''}</h4>
  ${restricted?`<p class="muted">Dente marcado como ${rec.status==='ausente'?'ausente':'com extração anterior'} — somente procedimentos de Prótese/Implante podem ser lançados aqui.</p>`:''}
  <label>Adicionar procedimento a este dente</label>
  <select id="toothProcSel">${procs.length?procs.map(pr=>`<option value="${pr.id}">${pr.especialidade} — ${pr.nome} (${fmtMoney(pr.valor)})</option>`).join(''):'<option value="">Nenhum procedimento disponível</option>'}</select>
  <label style="margin-top:8px">Situação do procedimento</label>
  <select id="toothProcSit"><option value="Planejado">A executar (marca em vermelho)</option><option value="Realizado anteriormente">Já realizado anteriormente (marca em azul)</option></select>
  <button id="btnAddToothProc" class="btn-s" style="margin-top:8px" ${procs.length?'':'disabled'}>+ Adicionar</button>
  <div class="overflow" style="margin-top:12px"><table><thead><tr><th>Procedimento</th><th>Status</th><th>Valor</th><th>Tempo</th><th></th></tr></thead>
  <tbody>${addedRows||'<tr><td colspan="5" class="muted">Nenhum procedimento adicionado</td></tr>'}</tbody></table></div>
  <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
  ${restricted?`<button class="btn-d" id="btnRemoveMark">Remover marcação (volta ao normal)</button>`:''}
  <button class="btn-s" id="btnCloseTooth">Fechar</button></div>
  </div>`;
}
function renderGeraisSection(p){
  const procsArcada=state.procedimentos.filter(pr=>pr.escopo==='arcada'||pr.escopo==='geral');
  const gerais=p.odonto.gerais||[];
  const rows=gerais.map((g,i)=>{
    return `<tr><td>${esc(g.nome)}</td><td>${arcoLabel(g.arco)}</td><td>${statusProcBadge(g.status)}</td><td>${fmtMoney(g.valor)}</td><td>${g.tempoMin} min</td><td><button class="btn-d" data-rmgeral="${i}">Remover</button></td></tr>`;
  }).join('');
  return `<div class="card"><h3>Procedimentos Gerais (por arcada ou sem dente específico)</h3>
  <p class="muted">Procedimentos que não são lançados em um dente específico: por arcada (prótese total, profilaxia, raspagem) ou gerais (harmonização orofacial, radiografia panorâmica, consultas). Nos gerais, a arcada é ignorada.</p>
  <div class="row">
    <div><label>Procedimento</label><select id="geralProcSel">${procsArcada.map(pr=>`<option value="${pr.id}">${pr.especialidade} — ${pr.nome} (${fmtMoney(pr.valor)})${pr.escopo==='geral'?' · geral':''}</option>`).join('')}</select></div>
    <div><label>Arcada (só para procedimentos por arcada)</label><select id="geralArco"><option value="superior">Superior</option><option value="inferior">Inferior</option><option value="ambos">Ambas</option></select></div>
    <div><label>Situação</label><select id="geralProcSit"><option value="Planejado">A executar (vermelho)</option><option value="Realizado anteriormente">Já realizado anteriormente (azul)</option></select></div>
  </div>
  <button id="btnAddGeral" class="btn-s" style="margin-top:8px">+ Adicionar</button>
  <div class="overflow" style="margin-top:12px"><table><thead><tr><th>Procedimento</th><th>Arcada</th><th>Status</th><th>Valor</th><th>Tempo</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="5" class="muted">Nenhum procedimento geral adicionado</td></tr>'}</tbody></table></div>
  </div>`;
}
function planoRank(esp){ const g=(state.grupos||[]).find(x=>x.nome===esp); return (g && g.planoOrdem!=null)?g.planoOrdem:99; }
function grupoPermiteDenteAusente(nome){ const g=(state.grupos||[]).find(x=>x.nome===nome); return !!(g && g.permiteDenteAusente); }
function arcoLabel(a){ return a==='ambos'?'Ambas':a==='superior'?'Superior':a==='inferior'?'Inferior':'—'; }
function collectPlanoItems(p){
  const items=[];
  const dentes=(p.odonto&&p.odonto.dentes)||{};
  Object.keys(dentes).forEach(n=>{
    (dentes[n].procedimentos||[]).forEach(pp=>{
      if(pp.status==='Realizado anteriormente') return;
      items.push({id:pp.id, ref:'Dente '+n, nome:pp.nome, especialidade:pp.especialidade||'-', obs:pp.obs||'', valor:pp.valor||0, incluido:pp.incluirOrcamento!==false, status:pp.status||'Planejado'});
    });
  });
  ((p.odonto&&p.odonto.gerais)||[]).forEach(g=>{
    if(g.status==='Realizado anteriormente') return;
    items.push({id:g.id, ref:(g.arco?'Arcada '+arcoLabel(g.arco):'Geral'), nome:g.nome, especialidade:g.especialidade||'-', obs:g.obs||'', valor:g.valor||0, incluido:g.incluirOrcamento!==false, status:g.status||'Planejado'});
  });
  return items;
}
function findProcedimentoRecordById(p,id){
  const dentes=(p.odonto&&p.odonto.dentes)||{};
  for(const n in dentes){ const rec=(dentes[n].procedimentos||[]).find(pp=>pp.id===id); if(rec) return rec; }
  return ((p.odonto&&p.odonto.gerais)||[]).find(g=>g.id===id);
}
function getPlanoOrder(p, items){
  p.planoTratamento=p.planoTratamento||[];
  let order=p.planoTratamento.filter(id=>items.some(it=>it.id===id));
  const existingIds=new Set(order);
  const novos=items.filter(it=>!existingIds.has(it.id));
  novos.sort((a,b)=>planoRank(a.especialidade)-planoRank(b.especialidade));
  order=order.concat(novos.map(it=>it.id));
  p.planoTratamento=order;
  return order;
}
function renderPlanoTratamento(p){
  const items=collectPlanoItems(p);
  if(!items.length){
    return `<div class="card"><h3>Plano de Tratamento</h3><p class="muted">Nenhum procedimento lançado ainda. Adicione procedimentos pelo Odontograma (por dente ou por arcada) para que apareçam aqui.</p></div>`;
  }
  const order=getPlanoOrder(p, items);
  saveData();
  const byId={}; items.forEach(it=>byId[it.id]=it);
  const rows=order.map((id,i)=>{
    const it=byId[id];
    return `<tr>
      <td><input type="checkbox" data-planochk="${id}" ${it.incluido?'checked':''} title="Incluir no Orçamento"></td>
      <td>${i+1}</td><td>${esc(it.especialidade)}</td><td>${esc(it.nome)}</td><td>${esc(it.ref)}</td>
      <td>${statusProcBadge(it.status)}</td>
      <td><input type="text" data-planobs="${id}" value="${esc(it.obs)}" placeholder="Ex: face Ocluso-Distal (OD)" style="min-width:220px"></td>
      <td class="actions">
        <button class="btn-s" data-planoup="${id}" ${i===0?'disabled':''}>↑</button>
        <button class="btn-s" data-planodown="${id}" ${i===order.length-1?'disabled':''}>↓</button>
      </td></tr>`;
  }).join('');
  return `<div class="card"><h3>Plano de Tratamento</h3>
  <p class="muted">Ordem sugerida por especialidade: <strong>Periodontia → Cirurgia → Endodontia → Dentística → Prótese</strong> → demais especialidades ao final. Use as setas para reordenar conforme a conduta do profissional. Use a Observação para detalhar o procedimento, ex: "Restauração no dente 34 — Ocluso-Distal (OD)" ou "Restauração no dente 21 — incisal". O status "Concluído" é marcado automaticamente quando a evolução do atendimento é confirmada.</p>
  <div class="overflow"><table><thead><tr><th>Incluir no Orçamento</th><th>#</th><th>Grupo</th><th>Procedimento</th><th>Referência</th><th>Status</th><th>Observação</th><th></th></tr></thead>
  <tbody>${rows}</tbody></table></div>
  <p class="muted" style="margin-top:10px">Marque quais procedimentos devem entrar no Orçamento. Ao confirmar, é gerado um documento do plano e um Orçamento automático com os itens marcados.</p>
  <div style="margin-top:10px"><button id="btnConfirmPlano" class="btn-p">Confirmar Plano de Tratamento</button></div>
  </div>`;
}
function renderOrcamento(p){
  const orcs=(p.orcamentos||[]).slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  if(!orcs.length){
    return `<div class="card"><h3>Orçamento</h3><p class="muted">Nenhum orçamento gerado ainda. Confirme o Plano de Tratamento, marcando os procedimentos desejados, para gerar um orçamento automaticamente.</p></div>`;
  }
  const podeFin=permsDe(currentUser()).financeiro;
  return orcs.map(o=>{
    const aprovado=o.status==='aprovado';
    const rows=o.itens.map(it=>`<tr><td>${esc(it.especialidade)}</td><td>${esc(it.nome)}</td><td>${esc(it.ref)}</td><td>${fmtMoney(it.valor)}</td></tr>`).join('');
    return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <h3 style="margin:0">Orçamento — ${esc(fmtDataBR(o.data))} <span class="badge ${aprovado?'b-dent':'b-recep'}">${aprovado?'Aprovado':'Pendente'}</span></h3>
    <div>${podeFin?`${aprovado?'':`<button class="btn-p" data-approveorc="${o.id}">Aprovar</button> `}<button class="btn-d" data-delorc="${o.id}">Excluir</button>`:'<span class="muted">Aprovação pelo administrativo</span>'}</div>
    </div>
    <div class="overflow"><table><thead><tr><th>Grupo</th><th>Procedimento</th><th>Referência</th><th>Valor</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="4" class="muted">Nenhum item</td></tr>'}</tbody></table></div>
    <p style="margin-top:12px"><strong>Total do Orçamento:</strong> ${fmtMoney(o.total)}</p>
    ${aprovado?'<p class="muted">Este orçamento já está disponível na aba Financeiro.</p>':''}
    </div>`;
  }).join('');
}
function addDaysStr(dateStr, days){
  const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+days); return isoLocal(d);
}
let agendaViewMode='dia', agendaViewDate=hojeISO();
function fmtDiaSemana(dateStr){ const dias=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']; return dias[new Date(dateStr+'T00:00:00').getDay()]; }
function weekDates(dateStr){
  const d=new Date(dateStr+'T00:00:00'); const day=d.getDay(); const diff=day===0?-6:1-day;
  const monday=new Date(d); monday.setDate(d.getDate()+diff);
  const arr=[]; for(let i=0;i<7;i++){ const dt=new Date(monday); dt.setDate(monday.getDate()+i); arr.push(isoLocal(dt)); }
  return arr;
}
function monthDays(yearMonth){
  const [y,m]=yearMonth.split('-').map(Number);
  const firstDay=new Date(y,m-1,1); const daysInMonth=new Date(y,m,0).getDate();
  const startWeekday=(firstDay.getDay()+6)%7;
  const days=[]; for(let i=0;i<startWeekday;i++) days.push(null);
  for(let d=1; d<=daysInMonth; d++) days.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  return days;
}
function shiftMonth(yearMonth, delta){
  let [y,m]=yearMonth.split('-').map(Number); m+=delta;
  while(m<1){m+=12;y--;} while(m>12){m-=12;y++;}
  return `${y}-${String(m).padStart(2,'0')}`;
}
function procedimentoChecksHtml(pacienteId, selectedIds){
  selectedIds=selectedIds||[];
  const p=state.patients.find(x=>x.id===pacienteId);
  if(!p) return '<p class="muted" style="margin:4px 0">Selecione o paciente primeiro</p>';
  const items=collectPlanoItems(p).filter(it=>it.status!=='Concluído'||selectedIds.includes(it.id));
  if(!items.length) return '<p class="muted" style="margin:4px 0">Nenhum procedimento pendente no plano de tratamento deste paciente</p>';
  return items.map(it=>`<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;color:var(--text);font-size:14px"><input type="checkbox" data-agproc="${it.id}" data-aglabel="${esc(it.nome+' ('+it.ref+')')}" ${selectedIds.includes(it.id)?'checked':''} style="width:auto;margin-top:3px"><span>${esc(it.especialidade)} — ${esc(it.nome)} (${esc(it.ref)})</span></label>`).join('');
}
const AG_PALETTE=[['#ede9fe','#6d28d9'],['#dbeafe','#1d4ed8'],['#dcfce7','#15803d'],['#fef3c7','#b45309'],['#fce7f3','#be185d'],['#e0f2fe','#0369a1']];
function dentistColor(id){
  let h=0; for(const c of (id||'')) h=(h*31+c.charCodeAt(0))%AG_PALETTE.length;
  return AG_PALETTE[h];
}
function hhmmParaMin(h){ const t=(h||'0:0').split(':').map(Number); return (t[0]||0)*60+(t[1]||0); }
function minParaHHMM(m){ const pd=n=>String(n).padStart(2,'0'); return pd(Math.floor(m/60)%24)+':'+pd(m%60); }
function duracaoAgendamento(a,paciente){
  if(a.tipo==='procedimento' && a.procedimentoRefs && a.procedimentoRefs.length && paciente){
    const t=a.procedimentoRefs.reduce((sum,id)=>{ const r=findProcedimentoRecordById(paciente,id); return sum+((r&&r.tempoMin)||0); },0);
    if(t>0) return t;
  }
  return 30;
}
function duracaoDe(a){ return a.duracaoMin || duracaoAgendamento(a, state.patients.find(x=>x.id===a.pacienteId)); }
function conflitosAgenda(novo){
  const ini=hhmmParaMin(novo.horario), fim=ini+(novo.duracaoMin||30);
  return (state.agendamentos||[]).filter(x=>x.id!==novo.id && x.data===novo.data && statusAg(x)!=='cancelado' && (x.dentistaId===novo.dentistaId || x.pacienteId===novo.pacienteId))
    .filter(x=>{ const i2=hhmmParaMin(x.horario), f2=i2+duracaoDe(x); return ini<f2 && i2<fim; });
}
function statusAg(a){ return a.status||'agendado'; }
function evolDoAgendamento(a){ const pc=pacPorId(a.pacienteId); return pc?(pc.evolucao||[]).find(e=>e.agendamentoId===a.id):null; }
function statusAgExib(a){
  const st=statusAg(a); if(st==='cancelado'||st==='faltou') return st;
  const ev=evolDoAgendamento(a); if(ev && ev.confirmado && !ev.falta) return 'atendido';
  return st;
}
const AG_STATUS={agendado:['Agendado','b-recep'],confirmado:['Confirmado','b-dent'],atendido:['Atendido','b-adm'],faltou:['Faltou','b-red'],cancelado:['Cancelado','b-cinza'],nao_vem:['Respondeu NÃO — contatar','b-red']};
function agBadge(a){ const st=statusAgExib(a); return `<span class="badge ${AG_STATUS[st][1]}">${AG_STATUS[st][0]}</span>`; }
function textoFaltaPadrao(){ return 'Paciente não compareceu ao atendimento agendado.'; }
function garantirEvolucao(a){
  const pc=pacPorId(a.pacienteId); if(!pc) return null;
  pc.evolucao=pc.evolucao||[];
  let ev=pc.evolucao.find(e=>e.agendamentoId===a.id);
  if(!ev){
    ev={id:uid(),agendamentoId:a.id,data:a.data,hora:a.horario,procedimentoNome:a.procedimentoNome,dentistaNome:a.dentistaNome,procedimentoRef:a.procedimentoRef,procedimentoRefs:a.procedimentoRefs,observacao:'',confirmado:false,confirmadoEm:''};
    pc.evolucao.push(ev);
  }
  return ev;
}
function removerEvolucaoPendente(a){
  const pc=pacPorId(a.pacienteId); if(!pc||!pc.evolucao) return;
  pc.evolucao=pc.evolucao.filter(e=>!(e.agendamentoId===a.id && !e.confirmado));
}
function criarAviso(a,tipo){
  state.avisos=state.avisos||[];
  if(state.avisos.some(v=>v.agendamentoId===a.id && v.tipo===tipo && (tipo==='nao'?!v.tratado:!v.lido))) return;
  state.avisos.push({id:uid(),tipo,agendamentoId:a.id,dentistaId:a.dentistaId,pacienteNome:a.pacienteNome,data:a.data,horario:a.horario,em:new Date().toISOString(),lido:false,tratado:false});
}
function resolverAvisos(agId,tipo){ (state.avisos||[]).forEach(v=>{ if(v.agendamentoId===agId && (!tipo||v.tipo===tipo)){ v.tratado=true; v.lido=true; } }); }
function avisosPendentes(u){
  const hoje=hojeISO();
  return (state.avisos||[]).filter(v=>{
    if(u.tipo==='dentista' && v.dentistaId!==u.id) return false;
    const a=(state.agendamentos||[]).find(x=>x.id===v.agendamentoId); if(!a) return false;
    if(v.tipo==='nao') return !v.tratado && statusAg(a)==='nao_vem';
    return !v.lido && a.data>=hoje && statusAg(a)==='confirmado';
  }).sort((x,y)=>(y.em||'').localeCompare(x.em||''));
}
function bellHtml(u){
  const n=avisosPendentes(u).length;
  return `<button class="btn-s" data-dashgo="inicio" title="Respostas dos pacientes" style="margin-left:10px">🔔${n?' <strong style="color:#dc2626">'+n+'</strong>':''}</button>`;
}
function abrirWhatsApp(pc,msg,aoAbrir){
  const fone=telefoneWhatsApp(pc&&pc.telefone);
  if(!fone){ avisar('Este paciente não tem telefone cadastrado.'); return; }
  const w=window.open('https://wa.me/'+fone+'?text='+encodeURIComponent(msg),'_blank');
  if(w){ try{ w.opener=null; }catch(e){} if(aoAbrir) aoAbrir(); }
  else mostrarMensagem('O navegador bloqueou a abertura do WhatsApp. Copie a mensagem e envie para '+(pc.telefone||fone)+':',msg,aoAbrir);
}
function mensagemContatoNao(a,pc){
  const c=state.clinic||{}, dt=new Date(a.data+'T00:00:00');
  const dm=dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}), sem=dt.toLocaleDateString('pt-BR',{weekday:'long'});
  return `Olá, ${(pc.nome||'').split(' ')[0]}! Aqui é da ${c.nome||'clínica'}. Vimos que você não poderá comparecer ao seu atendimento do dia ${dm} (${sem}), às ${a.horario}. Podemos remarcar? Me diga quais dias e horários ficam melhores para você.`;
}
function avisosHtml(u){
  const lista=avisosPendentes(u); if(!lista.length) return '';
  const linhas=lista.map(v=>{
    const a=(state.agendamentos||[]).find(x=>x.id===v.agendamentoId);
    const dm=fmtDataBR(a.data)+' ('+fmtDiaSemana(a.data).toLowerCase()+') às '+esc(a.horario);
    if(v.tipo==='nao') return `<div class="aviso aviso-nao"><div><strong>⚠️ ${esc(a.pacienteNome)} respondeu NÃO</strong> — atendimento de ${dm} com ${esc(a.dentistaNome)}.<div class="muted">O dentista deve entrar em contato com o paciente.</div></div>
      <div class="actions"><button class="btn-p" data-avzap="${a.id}">💬 Falar com o paciente</button> <button class="btn-s" data-avremarcar="${a.id}">Remarcar</button> <button class="btn-s" data-avcancelar="${a.id}">Cancelar consulta</button> <button class="btn-s" data-avresolvido="${v.id}">Já resolvido</button></div></div>`;
    return `<div class="aviso aviso-sim"><div><strong>✔ ${esc(a.pacienteNome)} confirmou presença</strong> — ${dm} com ${esc(a.dentistaNome)}.</div><div class="actions"><button class="btn-s" data-avok="${v.id}">OK</button></div></div>`;
  }).join('');
  return `<div class="card"><h3 style="margin:0 0 10px 0">🔔 Respostas dos pacientes (${lista.length})</h3>${linhas}</div>`;
}
async function mudarStatusAg(id,novo){
  const a=(state.agendamentos||[]).find(x=>x.id===id); if(!a) return;
  const ant=statusAg(a); if(novo===ant) return;
  const ev=evolDoAgendamento(a);
  if(ev && ev.confirmado){
    avisar(ev.falta?'A falta deste atendimento já foi confirmada no prontuário e não pode ser alterada aqui.':'Este atendimento já tem evolução confirmada no prontuário; não é possível mudar o status.');
    render(); return;
  }
  if(novo==='cancelado'){
    const motivo=await pedirTexto('Motivo do cancelamento (opcional):',{rotuloOk:'Cancelar agendamento'});
    if(motivo===null){ render(); return; }
    a.status='cancelado'; a.motivoCancelamento=motivo.trim(); a.canceladoEm=new Date().toISOString();
    removerEvolucaoPendente(a); resolverAvisos(a.id);
  } else if(novo==='faltou'){
    a.status='faltou'; resolverAvisos(a.id,'nao');
    const e=garantirEvolucao(a);
    if(e){ e.falta=true; if(!(e.observacao||'').trim()) e.observacao=textoFaltaPadrao(); }
  } else {
    if(ant==='faltou' && ev && ev.falta){ ev.falta=false; if(ev.observacao===textoFaltaPadrao()) ev.observacao=''; }
    if(ant==='cancelado'){ garantirEvolucao(a); delete a.motivoCancelamento; delete a.canceladoEm; }
    a.status=novo;
    if(novo==='confirmado') criarAviso(a,'sim');
    if(novo==='nao_vem') criarAviso(a,'nao'); else resolverAvisos(a.id,'nao');
  }
  saveData(); render();
}
function telefoneWhatsApp(tel){ let d=(tel||'').replace(/\D/g,''); if(!d) return ''; if(d.length<=11) d='55'+d; return d; }
function mensagemLembrete(a,pc){
  const c=state.clinic||{};
  const dt=new Date(a.data+'T00:00:00');
  const dm=dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}), sem=dt.toLocaleDateString('pt-BR',{weekday:'long'});
  const oque=a.tipo==='avaliacao'?'da sua avaliação':'do seu atendimento';
  return `Olá, ${(pc.nome||'').split(' ')[0]}! Aqui é da ${c.nome||'clínica'}. Lembramos ${oque} com ${a.dentistaNome} no dia ${dm} (${sem}), às ${a.horario}. Podemos confirmar sua presença? Responda SIM para confirmar ou nos avise se precisar remarcar.`;
}
function mostrarMensagem(titulo,texto,onMarcar){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal" style="text-align:left;max-width:460px;width:100%"><p style="margin-top:0"><strong>${esc(titulo)}</strong></p><textarea class="ta" rows="6" readonly data-msg></textarea><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn-s" data-msg-copiar>Copiar mensagem</button>${onMarcar?'<button class="btn-s" data-msg-marcar>Marcar como enviado</button>':''}<button class="btn-p" data-msg-fechar>Fechar</button></div></div>`;
  document.body.appendChild(bg);
  const ta=bg.querySelector('[data-msg]'); ta.value=texto;
  const fechar=()=>{ if(bg.parentNode) bg.parentNode.removeChild(bg); };
  bg.querySelector('[data-msg-fechar]').addEventListener('click',fechar);
  bg.querySelector('[data-msg-copiar]').addEventListener('click',async()=>{ try{ await navigator.clipboard.writeText(texto); }catch(e){ ta.select(); try{ document.execCommand('copy'); }catch(_){} } });
  const m=bg.querySelector('[data-msg-marcar]'); if(m) m.addEventListener('click',()=>{ fechar(); onMarcar(); });
}
function enviarLembrete(a){
  const pc=pacPorId(a.pacienteId); if(!pc){ avisar('Paciente não encontrado.'); return; }
  const fone=telefoneWhatsApp(pc.telefone);
  if(!fone){ avisar('Este paciente não tem telefone cadastrado.'); return; }
  const msg=mensagemLembrete(a,pc);
  abrirWhatsApp(pc,msg,()=>{ a.lembreteEnviadoEm=new Date().toISOString(); saveData(); render(); });
}
function agStatusSelect(a){
  const atual=statusAg(a), travado=statusAgExib(a)==='atendido';
  return `<select class="ag-status-sel" data-agstatus="${a.id}" ${travado?'disabled title="Atendimento já registrado no prontuário"':''}>${[['agendado','Agendado'],['confirmado','Confirmado'],['nao_vem','Respondeu NÃO'],['faltou','Faltou'],['cancelado','Cancelado']].map(([v,t])=>`<option value="${v}" ${atual===v?'selected':''}>${t}</option>`).join('')}</select>`;
}
function agendaCardsList(list){
  if(!list.length) return '<p class="muted">Nenhum atendimento agendado</p>';
  return list.map(a=>{
    const [bg,fg]=dentistColor(a.dentistaId);
    const st=statusAgExib(a), rem=(a.remarcacoes||[]).length;
    const extra=[
      rem?`<span title="${esc((a.remarcacoes||[]).map(r=>'antes: '+fmtDataBR(r.deData)+' '+r.deHorario).join('; '))}">↻ remarcado${rem>1?' ('+rem+'x)':''}</span>`:'',
      a.lembreteEnviadoEm?`<span>💬 lembrete enviado ${esc(fmtDataHoraBR(a.lembreteEnviadoEm))}</span>`:'',
      st==='cancelado'&&a.motivoCancelamento?`<span>Motivo: ${esc(a.motivoCancelamento)}</span>`:''
    ].filter(Boolean).join(' · ');
    return `<div class="ag-card${st==='cancelado'?' ag-cancelado':''}" style="border-left:4px solid ${fg}">
      <div class="ag-time">${esc(a.horario)}<div style="font-size:11px;font-weight:400;color:var(--muted)">até ${minParaHHMM(hhmmParaMin(a.horario)+duracaoDe(a))}</div></div>
      <div class="ag-info">
        <div class="ag-pac">${esc(a.pacienteNome)} ${agBadge(a)}</div>
        <div class="ag-proc">${esc(a.procedimentoNome)}</div>
        ${extra?`<div class="ag-extra muted">${extra}</div>`:''}
      </div>
      <span class="ag-dentista" style="background:${bg};color:${fg}">${esc(a.dentistaNome)}</span>
      <div class="ag-card-actions">
        ${agStatusSelect(a)}
        ${(st==='agendado'||st==='confirmado')?`<button class="btn-s" data-agwpp="${a.id}" title="Enviar lembrete por WhatsApp">💬</button>`:''}
        <button class="btn-s" data-editag="${a.id}" title="Editar / remarcar">✎</button>
        <button class="btn-d" data-delag="${a.id}" title="Excluir">✕</button>
      </div>
    </div>`;
  }).join('');
}
let agendaLembData='';
function renderAgendaLembretes(){
  if(!agendaLembData) agendaLembData=addDaysStr(hojeISO(),1);
  const lista=(state.agendamentos||[]).filter(a=>a.data===agendaLembData && (statusAgExib(a)==='agendado'||statusAgExib(a)==='confirmado'||statusAgExib(a)==='nao_vem')).sort((x,y)=>x.horario.localeCompare(y.horario));
  const enviados=lista.filter(a=>a.lembreteEnviadoEm).length;
  const rows=lista.map(a=>{
    const pc=pacPorId(a.pacienteId);
    return `<tr><td>${esc(a.horario)}</td><td>${esc(a.pacienteNome)}</td><td>${esc((pc&&pc.telefone)||'—')}</td><td>${esc(a.dentistaNome)}</td><td>${agStatusSelect(a)}</td>
    <td>${statusAg(a)==='agendado'?`<button class="btn-s" data-agresp="${a.id}|sim">✔ Sim</button> <button class="btn-s" data-agresp="${a.id}|nao">✖ Não</button>`:(statusAg(a)==='confirmado'?'<span class="badge b-dent">Respondeu SIM</span>':'<span class="badge b-red">Respondeu NÃO</span>')}</td>
    <td>${a.lembreteEnviadoEm?'<span class="muted">✔ '+esc(fmtDataHoraBR(a.lembreteEnviadoEm))+'</span> ':''}<button class="btn-${a.lembreteEnviadoEm?'s':'p'}" data-agwpp="${a.id}">${a.lembreteEnviadoEm?'Reenviar':'💬 Enviar'}</button></td></tr>`;
  }).join('');
  return `<div class="card">
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn-s" id="agLembPrev">←</button><input type="date" id="agLembData" value="${agendaLembData}"><button class="btn-s" id="agLembNext">→</button>
  </div>
  <h3 style="margin:14px 0 4px 0">Lembretes — ${fmtDiaSemana(agendaLembData)}, ${fmtDataBR(agendaLembData)}</h3>
  <p class="muted" style="margin:0 0 12px">O botão abre o WhatsApp com a mensagem de confirmação já pronta (você só aperta enviar). Quando o paciente responder, toque em <strong>✔ Sim</strong> (o sistema confirma e avisa o dentista) ou em <strong>✖ Não</strong> (o sistema avisa o dentista para entrar em contato). ${lista.length} atendimento(s) · ${enviados} lembrete(s) enviado(s).</p>
  ${lista.length?`<div class="overflow"><table><thead><tr><th>Horário</th><th>Paciente</th><th>Telefone</th><th>Dentista</th><th>Situação</th><th>Resposta do paciente</th><th>Lembrete</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhum atendimento a lembrar neste dia.</p>'}
  </div>`;
}
function renderAgendaPrincipal(){
  const viewBar=`<div class="tabs">
    <button data-agview="dia" class="${agendaViewMode==='dia'?'active':''}">Dia</button>
    <button data-agview="semana" class="${agendaViewMode==='semana'?'active':''}">Semana</button>
    <button data-agview="mes" class="${agendaViewMode==='mes'?'active':''}">Mês</button>
    <button data-agview="lembretes" class="${agendaViewMode==='lembretes'?'active':''}">💬 Lembretes</button>
  </div>`;
  let body='';
  if(agendaViewMode==='dia') body=renderAgendaDia();
  else if(agendaViewMode==='semana') body=renderAgendaSemana();
  else if(agendaViewMode==='lembretes') body=renderAgendaLembretes();
  else body=renderAgendaMes();
  return `<div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
  <h2 style="margin:0">Agenda</h2><button id="btnNewAgendamento" class="btn-p">+ Novo Agendamento</button></div>
  <div id="agendaFormArea"></div>
  ${viewBar}${body}`;
}
function renderAgendaDia(){
  const list=(state.agendamentos||[]).filter(a=>a.data===agendaViewDate).sort((a,b)=>a.horario.localeCompare(b.horario));
  const d=new Date(agendaViewDate+'T00:00:00');
  const dataFmt=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  return `<div class="card">
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn-s" id="agPrevDia">←</button>
    <input type="date" id="agDataDia" value="${agendaViewDate}">
    <button class="btn-s" id="agNextDia">→</button>
  </div>
  <h3 style="margin:14px 0 4px 0">${fmtDiaSemana(agendaViewDate)}</h3>
  <p class="muted" style="margin:0 0 14px 0">${dataFmt} &nbsp;·&nbsp; ${list.filter(a=>statusAg(a)!=='cancelado').length} atendimento${list.filter(a=>statusAg(a)!=='cancelado').length===1?'':'s'}</p>
  ${agendaCardsList(list)}
  </div>`;
}
function renderAgendaSemana(){
  const week=weekDates(agendaViewDate);
  const nav=`<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
  <button class="btn-s" id="agPrevSemana">← Semana anterior</button>
  <strong>${week[0]} a ${week[6]}</strong>
  <button class="btn-s" id="agNextSemana">Próxima semana →</button>
  </div></div>`;
  const dias=week.map(dt=>{
    const list=(state.agendamentos||[]).filter(a=>a.data===dt).sort((a,b)=>a.horario.localeCompare(b.horario));
    const hoje=dt===hojeISO();
    return `<div class="card" style="${hoje?'border-color:var(--primary)':''}">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
      <h4 style="margin:0">${fmtDiaSemana(dt)} <span class="muted" style="font-weight:400">— ${dt}</span></h4>
      ${list.filter(a=>statusAg(a)!=='cancelado').length?`<span class="muted">${list.filter(a=>statusAg(a)!=='cancelado').length} atend.</span>`:''}
    </div>
    ${agendaCardsList(list)}</div>`;
  }).join('');
  return nav+dias;
}
function renderAgendaMes(){
  const month=agendaViewDate.slice(0,7);
  const days=monthDays(month);
  const counts={};
  (state.agendamentos||[]).forEach(a=>{ if(a.data && a.data.slice(0,7)===month && statusAg(a)!=='cancelado') counts[a.data]=(counts[a.data]||0)+1; });
  const cells=days.map(d=>{
    if(!d) return `<div class="mes-cell mes-empty"></div>`;
    const n=counts[d]||0;
    return `<button class="mes-cell" data-gotodia="${d}"><div class="mes-num">${parseInt(d.slice(8),10)}</div>${n?`<div class="mes-count">${n} atend.</div>`:''}</button>`;
  }).join('');
  const nav=`<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
  <button class="btn-s" id="agPrevMes">← Mês anterior</button>
  <input type="month" id="agMesInput" value="${month}">
  <button class="btn-s" id="agNextMes">Próximo mês →</button>
  </div></div>`;
  return nav+`<div class="card"><div class="mes-grid-head">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=>`<div>${d}</div>`).join('')}</div>
  <div class="mes-grid">${cells}</div></div>`;
}
function openAgendamentoForm(a){
  const isNew=!a;
  const dentistas=state.users.filter(u=>u.tipo==='dentista');
  document.getElementById('agendaFormArea').innerHTML=`<div class="card">
  <h4>${isNew?'Novo Agendamento':'Editar Agendamento'}</h4>
  <form id="fAgendamento">
  <label>Paciente</label>
  <select id="agPaciente" required>
    <option value="">Selecione</option>
    ${state.patients.map(p=>`<option value="${p.id}" ${a&&a.pacienteId===p.id?'selected':''}>${esc(p.nome)}</option>`).join('')}
  </select>
  <div class="row">
    <div><label>Data</label><input type="date" id="agDataForm" value="${a?a.data:agendaViewDate}" required></div>
    <div><label>Horário</label><input type="time" id="agHorarioForm" value="${a?a.horario:''}" required></div>
    <div><label>Dentista</label><select id="agDentista" required>${dentistaOptionsHtml(a?a.dentistaId:'', false)}</select></div>
  </div>
  ${semDentistaAviso()}
  <label>Tipo de atendimento</label>
  <select id="agTipo">
    <option value="avaliacao" ${(!a||a.tipo==='avaliacao')?'selected':''}>Avaliação</option>
    <option value="procedimento" ${a&&a.tipo==='procedimento'?'selected':''}>Procedimento do Plano de Tratamento</option>
  </select>
  <div id="agProcWrap" style="display:${a&&a.tipo==='procedimento'?'block':'none'}">
    <label>Procedimentos do plano (marque um ou mais)</label>
    <div id="agProcedimento">${a&&a.pacienteId?procedimentoChecksHtml(a.pacienteId,a.procedimentoRefs||(a.procedimentoRef?[a.procedimentoRef]:[])):'<p class="muted" style="margin:4px 0">Selecione o paciente primeiro</p>'}</div>
  </div>
  <label>Observação</label><input id="agObs" value="${esc(a?a.observacao:'')}">
  <div style="margin-top:14px"><button class="btn-p">Salvar</button> <button type="button" id="btnCancelAg" class="btn-s">Cancelar</button></div>
  </form></div>`;
  document.getElementById('agPaciente').addEventListener('change', e=>{
    const sel=document.getElementById('agProcedimento');
    if(sel) sel.innerHTML=procedimentoChecksHtml(e.target.value,[]);
  });
  document.getElementById('agTipo').addEventListener('change', e=>{
    document.getElementById('agProcWrap').style.display=e.target.value==='procedimento'?'block':'none';
    if(e.target.value==='procedimento'){
      const pid=document.getElementById('agPaciente').value;
      document.getElementById('agProcedimento').innerHTML=procedimentoChecksHtml(pid,[]);
    }
  });
  document.getElementById('btnCancelAg').addEventListener('click',()=>{ document.getElementById('agendaFormArea').innerHTML=''; });
  document.getElementById('fAgendamento').addEventListener('submit', ev=>{
    ev.preventDefault();
    const pacienteId=document.getElementById('agPaciente').value;
    const paciente=state.patients.find(x=>x.id===pacienteId);
    const dentistaId=document.getElementById('agDentista').value;
    const dentista=state.users.find(x=>x.id===dentistaId);
    const tipo=document.getElementById('agTipo').value;
    let procedimentoNome='Avaliação', procedimentoRefs=[];
    if(tipo==='procedimento'){
      const checks=[...document.querySelectorAll('#agProcedimento [data-agproc]:checked')];
      if(!checks.length){ avisar('Selecione ao menos um procedimento do plano de tratamento.'); return; }
      procedimentoRefs=checks.map(c=>c.getAttribute('data-agproc'));
      procedimentoNome=checks.map(c=>c.getAttribute('data-aglabel')).join(' + ');
    }
    const data={
      id: isNew?uid():a.id,
      pacienteId, pacienteNome: paciente?paciente.nome:'',
      dentistaId, dentistaNome: dentista?dentista.nomeCompleto:'',
      data: document.getElementById('agDataForm').value,
      horario: document.getElementById('agHorarioForm').value,
      tipo, procedimentoNome, procedimentoRefs, procedimentoRef:procedimentoRefs[0]||null,
      observacao: document.getElementById('agObs').value
    };
    data.duracaoMin=duracaoAgendamento(data,paciente);
    const conflitos=conflitosAgenda(data);
    const gravar=()=>{
      state.agendamentos=state.agendamentos||[];
      if(!isNew && (a.data!==data.data || a.horario!==data.horario)){
        data.remarcacoes=[...(a.remarcacoes||[]),{deData:a.data,deHorario:a.horario,paraData:data.data,paraHorario:data.horario,em:new Date().toISOString()}];
        data.status='agendado'; data.lembreteEnviadoEm=''; data.motivoCancelamento=''; resolverAvisos(data.id);
      }
      if(isNew) state.agendamentos.push(data); else Object.assign(a,data);
      if(paciente && (isNew || statusAg(a)!=='cancelado' || data.remarcacoes)){
        paciente.evolucao=paciente.evolucao||[];
        let evol=paciente.evolucao.find(e=>e.agendamentoId===data.id);
        if(evol && evol.confirmado && evol.falta && data.remarcacoes){ evol.agendamentoId=null; evol=null; }
        if(evol){
          if(!evol.confirmado){
            if(data.remarcacoes && evol.falta){ evol.falta=false; if(evol.observacao===textoFaltaPadrao()) evol.observacao=''; }
            evol.data=data.data; evol.hora=data.horario; evol.procedimentoNome=data.procedimentoNome; evol.dentistaNome=data.dentistaNome; evol.procedimentoRef=data.procedimentoRef; evol.procedimentoRefs=data.procedimentoRefs;
          }
        } else {
          paciente.evolucao.push({id:uid(), agendamentoId:data.id, data:data.data, hora:data.horario,
            procedimentoNome:data.procedimentoNome, dentistaNome:data.dentistaNome, procedimentoRef:data.procedimentoRef, procedimentoRefs:data.procedimentoRefs,
            observacao:'', confirmado:false, confirmadoEm:''});
        }
      }
      saveData();
      agendaViewDate=data.data; agendaViewMode='dia';
      document.getElementById('agendaFormArea').innerHTML='';
      render();
    };
    if(conflitos.length){
      const det=conflitos.map(x=>`${x.dentistaId===data.dentistaId?'Dentista ocupado':'Paciente já agendado'}: ${x.horario}–${minParaHHMM(hhmmParaMin(x.horario)+duracaoDe(x))} (${x.pacienteNome}, ${x.dentistaNome})`).join('; ');
      confirmarAcao('Conflito de horário! '+det+'. Deseja agendar mesmo assim (encaixe)?','Agendar mesmo assim',gravar);
    } else gravar();
  });
}
function calcParcelas(o){
  const pag=o.pagamento||{};
  const base=o.dataAprovacao||o.data;
  const intervalo=parseInt(pag.intervaloDias)||30;
  const total=o.total||0;
  let list=[];
  if(pag.condicao==='parcelado_sem'){
    const n=Math.max(parseInt(pag.numParcelas)||1,1);
    const valorParcela=Math.round((total/n)*100)/100;
    for(let i=0;i<n;i++){
      const valor = i===n-1 ? Math.round((total - valorParcela*(n-1))*100)/100 : valorParcela;
      list.push({label:'Parcela '+(i+1), valor, vencimento:addDaysStr(base,i*intervalo)});
    }
  } else if(pag.condicao==='parcelado_com'){
    const entrada=parseFloat(pag.valorEntrada)||0;
    const n=Math.max(parseInt(pag.numParcelas)||1,1);
    const saldo=Math.max(total-entrada,0);
    const valorParcela=Math.round((saldo/n)*100)/100;
    list.push({label:'Entrada', valor:entrada, vencimento:base});
    for(let i=0;i<n;i++){
      const valor = i===n-1 ? Math.round((saldo - valorParcela*(n-1))*100)/100 : valorParcela;
      list.push({label:'Parcela '+(i+1), valor, vencimento:addDaysStr(base,(i+1)*intervalo)});
    }
  } else {
    list.push({label:'Pagamento único', valor:total, vencimento:base});
  }
  return list;
}
function parcelasPagasDoOrc(o){ return (state.fluxoFinanceiro||[]).filter(e=>e.orcamentoId===o.id && e.confirmado); }
function generateFluxo(p,o){
  // Parcelas já pagas são preservadas; só as pendentes são recalculadas sobre o saldo restante.
  const pagas=parcelasPagasDoOrc(o);
  const totalPago=Math.round(pagas.reduce((s,e)=>s+(e.valor||0),0)*100)/100;
  state.fluxoFinanceiro=(state.fluxoFinanceiro||[]).filter(e=>e.orcamentoId!==o.id || e.confirmado);
  let novas=calcParcelas(o).filter(pc=>!pagas.some(e=>e.label===pc.label));
  const saldo=Math.round(((o.total||0)-totalPago)*100)/100;
  if(saldo<=0) novas=[];
  else if(pagas.length && novas.length){
    const vp=Math.round((saldo/novas.length)*100)/100;
    novas=novas.map((pc,i)=>Object.assign({},pc,{valor: i===novas.length-1 ? Math.round((saldo-vp*(novas.length-1))*100)/100 : vp}));
  }
  novas.forEach(pc=>{
    state.fluxoFinanceiro.push({id:uid(), pacienteId:p.id, pacienteNome:p.nome, orcamentoId:o.id, label:pc.label, valor:pc.valor, vencimento:pc.vencimento, tipo:'receita', confirmado:false, dataPagamento:''});
  });
  o.fluxoGerado=true; o.fluxoGeradoEm=hojeISO();
  saveData();
}
let financeiroSubTab='fluxo';
let fluxoViewMode='dia';
let fluxoViewDate=hojeISO();
let fluxoPeriodoInicio=hojeISO();
let fluxoPeriodoFim=hojeISO();
let fluxoMesRef=hojeISO().slice(0,7);
function getFluxoEntriesForView(){
  const all=state.fluxoFinanceiro||[];
  if(fluxoViewMode==='dia') return all.filter(e=>e.vencimento===fluxoViewDate);
  if(fluxoViewMode==='periodo') return all.filter(e=>e.vencimento>=fluxoPeriodoInicio && e.vencimento<=fluxoPeriodoFim);
  return all.filter(e=>e.vencimento && e.vencimento.slice(0,7)===fluxoMesRef);
}
function ensureFluxoTipos(){
  (state.fluxoFinanceiro||[]).forEach(e=>{
    if(!e.tipo) e.tipo='receita';
    if(e.confirmado===undefined){ e.confirmado=e.status==='pago'; e.dataPagamento=e.dataPagamento||(e.confirmado?e.vencimento:''); }
  });
}
const CATEGORIAS_DESPESA=['Instalações','Contas e Utilidades','Pessoal','Materiais e Insumos','Serviços','Impostos e Taxas','Marketing','Outros'];
function seedDespesasCatalogo(){
  return [
    {id:uid(),categoria:'Instalações',nome:'Aluguel'},
    {id:uid(),categoria:'Instalações',nome:'Condomínio'},
    {id:uid(),categoria:'Instalações',nome:'IPTU'},
    {id:uid(),categoria:'Instalações',nome:'Manutenção Predial'},
    {id:uid(),categoria:'Contas e Utilidades',nome:'Energia Elétrica'},
    {id:uid(),categoria:'Contas e Utilidades',nome:'Água e Esgoto'},
    {id:uid(),categoria:'Contas e Utilidades',nome:'Internet'},
    {id:uid(),categoria:'Contas e Utilidades',nome:'Telefone'},
    {id:uid(),categoria:'Pessoal',nome:'Salários'},
    {id:uid(),categoria:'Pessoal',nome:'Pró-labore'},
    {id:uid(),categoria:'Pessoal',nome:'FGTS / INSS'},
    {id:uid(),categoria:'Pessoal',nome:'Comissões'},
    {id:uid(),categoria:'Materiais e Insumos',nome:'Materiais Odontológicos'},
    {id:uid(),categoria:'Materiais e Insumos',nome:'Materiais de Escritório'},
    {id:uid(),categoria:'Materiais e Insumos',nome:'Materiais de Limpeza'},
    {id:uid(),categoria:'Materiais e Insumos',nome:'EPIs'},
    {id:uid(),categoria:'Serviços',nome:'Contabilidade'},
    {id:uid(),categoria:'Serviços',nome:'Laboratório Protético'},
    {id:uid(),categoria:'Serviços',nome:'Manutenção de Equipamentos'},
    {id:uid(),categoria:'Serviços',nome:'Softwares e Sistemas'},
    {id:uid(),categoria:'Impostos e Taxas',nome:'Simples Nacional'},
    {id:uid(),categoria:'Impostos e Taxas',nome:'Taxas de Cartão'},
    {id:uid(),categoria:'Impostos e Taxas',nome:'Anuidade CRO'},
    {id:uid(),categoria:'Marketing',nome:'Redes Sociais / Publicidade'},
    {id:uid(),categoria:'Marketing',nome:'Site'},
    {id:uid(),categoria:'Outros',nome:'Despesas Diversas'},
  ];
}
function ensureDespesasCatalogo(){ if(NUVEM && !(currentUser() && permsDe(currentUser()).financeiro)) return; if(!state.despesasCatalogo || !state.despesasCatalogo.length){ state.despesasCatalogo=seedDespesasCatalogo(); saveData(); } }
function renderFinanceiroPrincipal(){
  const subTabs=[{id:'fluxo', label:'💵 Fluxo Financeiro'},{id:'lancardespesa', label:'➕ Lançar Despesa'}];
  const bar=subTabs.map(t=>`<button data-finsub="${t.id}" class="${financeiroSubTab===t.id?'active':''}">${t.label}</button>`).join('');
  let body='';
  if(financeiroSubTab==='lancardespesa') body=renderLancarDespesa();
  else body=renderFluxoFinanceiro();
  return `<h2 style="margin:0 0 10px 0">Financeiro</h2><div class="tabs">${bar}</div>${body}`;
}
let configSubTab='clinica';
function permsDe(u){ return Object.assign(defaultPerms(u.tipo), u.permissions||{}); }
function isoLocal(d){ const pd=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${pd(d.getMonth()+1)}-${pd(d.getDate())}`; }
function hojeISO(){ return isoLocal(new Date()); }
function agoraHHMM(){ const d=new Date(); const pd=n=>String(n).padStart(2,'0'); return pd(d.getHours())+':'+pd(d.getMinutes()); }
function diasEntre(a,b){ return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000); }
function pacPorId(id){ return state.patients.find(x=>x.id===id); }
function resumoExclusaoPaciente(p){
  const itens=[]; const add=(n,um,pl)=>{ if(n) itens.push(n+' '+(n===1?um:pl)); };
  add((p.anamneses||[]).length,'anamnese','anamneses');
  add((p.examesClinicos||[]).length,'exame clínico','exames clínicos');
  add((p.evolucao||[]).length,'evolução','evoluções');
  add(imagensDoPaciente(p).length,'radiografia','radiografias');
  add((p.orcamentos||[]).length,'orçamento','orçamentos');
  add((p.documentos||[]).length,'documento','documentos');
  add((state.agendamentos||[]).filter(a=>a.pacienteId===p.id).length,'agendamento','agendamentos');
  return {itens, fin:(state.fluxoFinanceiro||[]).filter(e=>e.pacienteId===p.id).length};
}
let relatorioTab='inadimplencia', repFluxoHorizonte=90, repOrcDias=0, repEvolDentista='', repRetornoMeses=6, repRetornoNunca=false;
function repPacBtn(p,tab){ return `<button class="btn-s" data-reppac="${p.id}" data-reptab="${tab}" style="font-weight:600">${esc(p.nome)}</button>`; }
const RELATORIOS=[
  {id:'inadimplencia', label:'⏰ Inadimplência', perm:'financeiro', fn:()=>repInadimplencia()},
  {id:'fluxoprojetado', label:'📈 Fluxo de caixa projetado', perm:'financeiro', fn:()=>repFluxoProjetado()},
  {id:'orcpendentes', label:'📝 Orçamentos pendentes', perm:'pacientes', fn:()=>repOrcPendentes()},
  {id:'tratabertos', label:'🦷 Tratamentos em aberto', perm:'pacientes', fn:()=>repTratAbertos()},
  {id:'evolpendentes', label:'✅ Evoluções pendentes', perm:'pacientes', fn:()=>repEvolPendentes()},
  {id:'semretorno', label:'📞 Pacientes sem retorno', perm:'pacientes', fn:()=>repSemRetorno()},
  {id:'faltas', label:'🚫 Faltas e cancelamentos', perm:'pacientes', fn:()=>repFaltas()},
];
function renderRelatorios(){
  const perms=permsDe(currentUser());
  const lista=RELATORIOS.filter(r=>perms[r.perm]);
  if(!lista.length) return `<div class="card"><h2>Relatórios</h2><p class="muted">Você não tem permissão para nenhum relatório.</p></div>`;
  if(!lista.find(r=>r.id===relatorioTab)) relatorioTab=lista[0].id;
  const bar=lista.map(r=>`<button data-reptabsel="${r.id}" class="${relatorioTab===r.id?'active':''}">${r.label}</button>`).join('');
  return `<h2 style="margin:0 0 10px 0">Relatórios</h2><div class="tabs">${bar}</div>${lista.find(r=>r.id===relatorioTab).fn()}`;
}
function repCard(titulo,descricao,filtros,resumo,tabela){
  return `<div class="card"><h3 style="margin:0 0 6px 0">${titulo}</h3>
  <p class="muted" style="margin:0 0 12px">${descricao}</p>
  ${filtros?`<div class="row" style="margin-bottom:8px">${filtros}</div>`:''}
  <p>${resumo}</p>${tabela}</div>`;
}
function repInadimplencia(){
  ensureFluxoTipos();
  const hoje=hojeISO();
  const itens=(state.fluxoFinanceiro||[]).filter(e=>e.tipo==='receita' && !e.confirmado && e.vencimento && e.vencimento<hoje)
    .map(e=>({e, dias:diasEntre(e.vencimento,hoje), pac:pacPorId(e.pacienteId)})).sort((a,b)=>b.dias-a.dias);
  const total=itens.reduce((sum,x)=>sum+(x.e.valor||0),0);
  const nPac=new Set(itens.map(x=>x.e.pacienteId||x.e.pacienteNome)).size;
  const rows=itens.map(({e,dias,pac})=>`<tr><td>${pac?repPacBtn(pac,'financeiro'):esc(e.pacienteNome||'-')}</td><td>${pac?esc(pac.telefone||'-'):'-'}</td>
    <td>${esc(e.label)}</td><td>${fmtDataBR(e.vencimento)}</td><td><span class="badge ${dias>30?'b-red':'b-recep'}">${dias} dia(s)</span></td><td>${fmtMoney(e.valor)}</td></tr>`).join('');
  return repCard('Contas a receber vencidas','Parcelas cujo vencimento já passou e cujo pagamento ainda não foi confirmado no Fluxo Financeiro. Clique no nome para abrir o financeiro do paciente.','',
    `<strong>Total em atraso:</strong> <span style="color:#dc2626;font-weight:700">${fmtMoney(total)}</span> &nbsp;·&nbsp; <strong>Pacientes:</strong> ${nPac} &nbsp;·&nbsp; <strong>Parcelas:</strong> ${itens.length}`,
    itens.length?`<div class="overflow"><table><thead><tr><th>Paciente</th><th>Telefone</th><th>Parcela</th><th>Vencimento</th><th>Atraso</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhuma parcela vencida em aberto.</p>');
}
function repFluxoProjetado(){
  ensureFluxoTipos();
  const hoje=hojeISO();
  const pend=(state.fluxoFinanceiro||[]).filter(e=>!e.confirmado && e.vencimento);
  const faixas=[{rot:'Vencidas e ainda não confirmadas', ok:d=>d<0}];
  const rotulos=['Próximos 30 dias','De 31 a 60 dias','De 61 a 90 dias'];
  for(let i=0;i<repFluxoHorizonte/30;i++) faixas.push({rot:rotulos[i], ok:d=>d>=i*30 && d<(i+1)*30});
  let acum=0, totEnt=0, totSai=0;
  const cor=v=>`color:${v<0?'#dc2626':'#16a34a'};font-weight:700`;
  const rows=faixas.map(f=>{
    const itens=pend.filter(e=>f.ok(diasEntre(hoje,e.vencimento)));
    const ent=itens.filter(e=>e.tipo==='receita').reduce((sum,e)=>sum+(e.valor||0),0);
    const sai=itens.filter(e=>e.tipo==='despesa').reduce((sum,e)=>sum+(e.valor||0),0);
    acum+=ent-sai; totEnt+=ent; totSai+=sai;
    return `<tr><td>${f.rot}</td><td>${fmtMoney(ent)}</td><td>${fmtMoney(sai)}</td><td style="${cor(ent-sai)}">${fmtMoney(ent-sai)}</td><td style="${cor(acum)}">${fmtMoney(acum)}</td></tr>`;
  }).join('');
  const filtros=`<div><label>Horizonte</label><select id="repFluxoHor">${[30,60,90].map(n=>`<option value="${n}" ${repFluxoHorizonte===n?'selected':''}>${n} dias</option>`).join('')}</select></div>`;
  return repCard('Fluxo de caixa projetado','Soma dos lançamentos ainda NÃO confirmados (receitas a receber e despesas a pagar) por faixa de vencimento. Não considera o saldo atual em caixa ou no banco.',filtros,
    `<strong>Entradas previstas:</strong> ${fmtMoney(totEnt)} &nbsp;·&nbsp; <strong>Saídas previstas:</strong> ${fmtMoney(totSai)} &nbsp;·&nbsp; <strong>Saldo projetado:</strong> <span style="${cor(totEnt-totSai)}">${fmtMoney(totEnt-totSai)}</span>`,
    `<div class="overflow"><table><thead><tr><th>Período</th><th>Entradas previstas</th><th>Saídas previstas</th><th>Saldo do período</th><th>Saldo acumulado</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function repOrcPendentes(){
  const hoje=hojeISO(); const itens=[];
  state.patients.forEach(p=>(p.orcamentos||[]).forEach(o=>{ if(o.status!=='aprovado'){ const dias=diasEntre(o.data,hoje); if(dias>=repOrcDias) itens.push({p,o,dias}); } }));
  itens.sort((a,b)=>b.dias-a.dias);
  const total=itens.reduce((sum,x)=>sum+(x.o.total||0),0);
  const rows=itens.map(({p,o,dias})=>`<tr><td>${repPacBtn(p,'orcamento')}</td><td>${esc(p.telefone||'-')}</td><td>${fmtDataBR(o.data)}</td>
    <td><span class="badge ${dias>15?'b-red':'b-recep'}">${dias} dia(s)</span></td><td>${(o.itens||[]).length}</td><td>${fmtMoney(o.total)}</td></tr>`).join('');
  const filtros=`<div><label>Sem resposta há mais de</label><select id="repOrcDiasSel">${[[0,'Todos'],[7,'7 dias'],[15,'15 dias'],[30,'30 dias']].map(([v,t])=>`<option value="${v}" ${repOrcDias===v?'selected':''}>${t}</option>`).join('')}</select></div>`;
  return repCard('Orçamentos pendentes de resposta','Orçamentos gerados que ainda não foram aprovados. É a lista de quem a recepção deve procurar.',filtros,
    `<strong>Orçamentos:</strong> ${itens.length} &nbsp;·&nbsp; <strong>Valor parado:</strong> ${fmtMoney(total)}`,
    itens.length?`<div class="overflow"><table><thead><tr><th>Paciente</th><th>Telefone</th><th>Data do orçamento</th><th>Sem resposta há</th><th>Procedimentos</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhum orçamento pendente com esse filtro.</p>');
}
function repTratAbertos(){
  const linhas=[];
  state.patients.forEach(p=>{
    const abertos=collectPlanoItems(p).filter(it=>it.status!=='Concluído');
    if(abertos.length) linhas.push({p,abertos,valor:abertos.reduce((sum,it)=>sum+(it.valor||0),0)});
  });
  linhas.sort((a,b)=>b.valor-a.valor);
  const totVal=linhas.reduce((sum,l)=>sum+l.valor,0), totProc=linhas.reduce((sum,l)=>sum+l.abertos.length,0);
  const rows=linhas.map(({p,abertos,valor})=>`<tr><td>${repPacBtn(p,'planotratamento')}</td><td>${esc(p.telefone||'-')}</td><td>${abertos.length}</td>
    <td style="min-width:240px">${abertos.map(it=>esc(it.nome)+' <span class="muted">('+esc(it.ref)+')</span>').join('; ')}</td><td>${fmtMoney(valor)}</td><td>${fmtDataBR(ultimaConsultaConfirmada(p))||'-'}</td></tr>`).join('');
  return repCard('Tratamentos em aberto por paciente','Procedimentos do plano de tratamento que ainda estão "A executar", com o valor em aberto. Serve para reativar pacientes e planejar a agenda.','',
    `<strong>Pacientes:</strong> ${linhas.length} &nbsp;·&nbsp; <strong>Procedimentos:</strong> ${totProc} &nbsp;·&nbsp; <strong>Valor em aberto:</strong> ${fmtMoney(totVal)}`,
    linhas.length?`<div class="overflow"><table><thead><tr><th>Paciente</th><th>Telefone</th><th>Qtd.</th><th>Procedimentos pendentes</th><th>Valor</th><th>Última consulta</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhum tratamento em aberto.</p>');
}
function repEvolPendentes(){
  const hoje=hojeISO(), agora=agoraHHMM(); const itens=[];
  state.patients.forEach(p=>(p.evolucao||[]).forEach(e=>{
    if(e.confirmado) return;
    if(!(e.data<hoje || (e.data===hoje && (e.hora||'')<=agora))) return;
    if(repEvolDentista && e.dentistaNome!==repEvolDentista) return;
    itens.push({p,e,dias:diasEntre(e.data,hoje)});
  }));
  itens.sort((a,b)=>(a.e.data+(a.e.hora||'')).localeCompare(b.e.data+(b.e.hora||'')));
  const rows=itens.map(({p,e,dias})=>`<tr><td>${fmtDataBR(e.data)} ${esc(e.hora||'')}</td><td>${repPacBtn(p,'evolucao')}</td><td>${esc(e.procedimentoNome)}</td><td>${esc(e.dentistaNome)}</td>
    <td><span class="badge ${dias>2?'b-red':'b-recep'}">${dias===0?'hoje':dias+' dia(s)'}</span></td></tr>`).join('');
  const dents=state.users.filter(u=>u.tipo==='dentista');
  const filtros=`<div><label>Dentista</label><select id="repEvolDent"><option value="">Todos</option>${dents.map(d=>`<option value="${esc(d.nomeCompleto)}" ${repEvolDentista===d.nomeCompleto?'selected':''}>${esc(d.nomeCompleto)}</option>`).join('')}</select></div>`;
  return repCard('Evoluções pendentes de confirmação','Atendimentos que já aconteceram, mas cuja evolução ainda não foi confirmada pelo dentista. O prontuário só fica completo depois da confirmação.',filtros,
    `<strong>Pendentes:</strong> ${itens.length}`,
    itens.length?`<div class="overflow"><table><thead><tr><th>Atendimento</th><th>Paciente</th><th>Procedimento</th><th>Dentista</th><th>Há</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhuma evolução pendente. Prontuários em dia.</p>');
}
let repFaltasDias=90;
function repFaltas(){
  const hoje=hojeISO(), ini=addDaysStr(hoje,-repFaltasDias);
  const lista=(state.agendamentos||[]).filter(a=>a.data>=ini && a.data<=hoje);
  let atend=0,falt=0,canc=0,semDesfecho=0; const por={};
  lista.forEach(a=>{
    const st=statusAgExib(a);
    if(st==='atendido') atend++; else if(st==='faltou') falt++; else if(st==='cancelado') canc++; else if(a.data<hoje) semDesfecho++;
    if(st==='faltou'||st==='cancelado'){
      const k=a.pacienteId; por[k]=por[k]||{pac:pacPorId(k),nome:a.pacienteNome,falt:0,canc:0,ult:''};
      if(st==='faltou') por[k].falt++; else por[k].canc++;
      if(a.data>por[k].ult) por[k].ult=a.data;
    }
  });
  const taxa=(atend+falt)?Math.round(falt/(atend+falt)*100):0;
  const linhas=Object.values(por).sort((x,y)=>(y.falt-x.falt)||(y.canc-x.canc));
  const rows=linhas.map(l=>`<tr><td>${l.pac?repPacBtn(l.pac,'evolucao'):esc(l.nome)}</td><td>${esc((l.pac&&l.pac.telefone)||'-')}</td>
    <td>${l.falt?'<span class="badge b-red">'+l.falt+'</span>':'0'}</td><td>${l.canc}</td><td>${fmtDataBR(l.ult)}</td></tr>`).join('');
  const filtros=`<div><label>Período</label><select id="repFaltasSel">${[30,90,180].map(n=>`<option value="${n}" ${repFaltasDias===n?'selected':''}>Últimos ${n} dias</option>`).join('')}</select></div>`;
  return repCard('Faltas e cancelamentos','Acompanha quem falta ou desmarca, para contato e para entender o impacto na agenda. A taxa de falta considera as faltas sobre (atendidos + faltas).',filtros,
    `<strong>Atendidos:</strong> ${atend} &nbsp;·&nbsp; <strong>Faltas:</strong> ${falt} (taxa ${taxa}%) &nbsp;·&nbsp; <strong>Cancelamentos:</strong> ${canc}`+(semDesfecho?`<br><span class="muted">${semDesfecho} atendimento(s) do período já passaram sem desfecho registrado (nem atendido, nem falta, nem cancelado).</span>`:''),
    linhas.length?`<div class="overflow"><table><thead><tr><th>Paciente</th><th>Telefone</th><th>Faltas</th><th>Cancelamentos</th><th>Última ocorrência</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhuma falta ou cancelamento no período.</p>');
}
function repSemRetorno(){
  const hoje=hojeISO();
  const comFuturo=new Set((state.agendamentos||[]).filter(a=>a.data>=hoje && statusAg(a)!=='cancelado').map(a=>a.pacienteId));
  const itens=[];
  state.patients.forEach(p=>{
    if(comFuturo.has(p.id)) return;
    const ult=ultimaConsultaConfirmada(p);
    if(!ult){ if(repRetornoNunca) itens.push({p,ult:'',meses:null}); return; }
    const meses=Math.floor(diasEntre(ult,hoje)/30.44);
    if(meses>=repRetornoMeses) itens.push({p,ult,meses});
  });
  itens.sort((a,b)=>(b.meses===null?-1:b.meses)-(a.meses===null?-1:a.meses));
  const rows=itens.map(({p,ult,meses})=>`<tr><td>${repPacBtn(p,'dados')}</td><td>${esc(p.telefone||'-')}</td><td>${ult?fmtDataBR(ult):'nenhuma'}</td>
    <td>${meses===null?'-':meses+' mês(es)'}</td><td>${collectPlanoItems(p).filter(it=>it.status!=='Concluído').length}</td></tr>`).join('');
  const filtros=`<div><label>Sem consulta há pelo menos</label><select id="repRetMeses">${[3,6,12].map(n=>`<option value="${n}" ${repRetornoMeses===n?'selected':''}>${n} meses</option>`).join('')}</select></div>
    <div style="display:flex;align-items:flex-end"><label style="display:flex;gap:8px;align-items:center;color:var(--text);font-size:14px;margin:0"><input type="checkbox" id="repRetNunca" ${repRetornoNunca?'checked':''} style="width:auto"> Incluir quem nunca teve consulta confirmada</label></div>`;
  return repCard('Pacientes sem retorno','Pacientes sem consulta confirmada há muito tempo e sem nenhum agendamento futuro. Lista para entrar em contato (recall).',filtros,
    `<strong>Pacientes:</strong> ${itens.length}`,
    itens.length?`<div class="overflow"><table><thead><tr><th>Paciente</th><th>Telefone</th><th>Última consulta</th><th>Sem retorno há</th><th>Tratamentos em aberto</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhum paciente nessa condição.</p>');
}
let tabFiltroGrupo='', tabBusca='';
function tabelaValoresPrintHtml(blocos){
  const c=state.clinic||{};
  const corpo=blocos.map(b=>`<h3>${esc(b.nome)}</h3><table class="tv"><thead><tr><th>Procedimento</th><th>Cobrança</th><th>Tempo</th><th class="v">Valor</th></tr></thead><tbody>${b.itens.map(pr=>`<tr><td>${esc(pr.nome)}</td><td>${escopoLabel(pr.escopo)}</td><td>${pr.tempoMin} min</td><td class="v">${fmtMoney(pr.valor)}</td></tr>`).join('')}</tbody></table>`).join('');
  return `<div class="print-tabela"><div class="pt-head"><div class="pt-clinic">${esc(c.nome||'')}</div><div>Tabela de Valores — atualizada em ${fmtDataBR(hojeISO())}</div></div>${corpo}</div>`;
}
function renderTabelaValores(){
  ensureProcedimentos();
  const blocos=state.grupos.filter(g=>!tabFiltroGrupo||g.nome===tabFiltroGrupo)
    .map(g=>({nome:g.nome, itens:filtrarProcedimentos(g.nome,tabBusca).slice().sort((x,y)=>x.nome.localeCompare(y.nome,'pt-BR'))}))
    .filter(b=>b.itens.length);
  printSheetHtml=blocos.length?tabelaValoresPrintHtml(blocos):'';
  const total=blocos.reduce((sum,b)=>sum+b.itens.length,0);
  const cards=blocos.map(b=>`<div class="card"><h3 style="margin:0 0 8px 0">${esc(b.nome)}</h3>
    <div class="overflow"><table class="tv"><thead><tr><th>Procedimento</th><th>Cobrança</th><th>Tempo</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${b.itens.map(pr=>`<tr><td>${esc(pr.nome)}</td><td>${escopoLabel(pr.escopo)}</td><td>${pr.tempoMin} min</td><td style="text-align:right;white-space:nowrap;font-weight:600">${fmtMoney(pr.valor)}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
  return `<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><h2 style="margin:0">Tabela de Valores</h2>
    <button id="btnPrintTabela" class="btn-p" ${blocos.length?'':'disabled'}>🖨️ Imprimir</button></div>
  <p class="muted" style="margin:8px 0">Consulta dos valores dos procedimentos da clínica. "Por dente" e "por arcada" indicam a unidade da cobrança. A impressão sai com o que estiver filtrado na tela.</p>
  <div class="row"><div><label>Grupo</label><select id="tabGrupoSel"><option value="">Todos os grupos</option>${state.grupos.map(g=>`<option value="${esc(g.nome)}" ${tabFiltroGrupo===g.nome?'selected':''}>${esc(g.nome)}</option>`).join('')}</select></div>
  <div><label>Buscar procedimento</label><input id="tabBusca" type="search" placeholder="Ex: limpeza, canal, toxina" value="${esc(tabBusca)}"></div></div>
  <p class="muted" style="margin:8px 0 0">${total} procedimento(s)</p></div>
  ${cards||'<div class="card"><p class="muted">Nenhum procedimento encontrado.</p></div>'}`;
}
function renderConfiguracoesPrincipal(){
  const u=currentUser(); const perms=Object.assign(defaultPerms(u.tipo), u.permissions||{});
  const subTabs=[{id:'clinica', label:'🏥 Clínica'}];
  if(perms.procedimentos) subTabs.push({id:'procedimentos', label:'🦷 Procedimentos'});
  subTabs.push({id:'tipodespesas', label:'🧾 Tipo de Despesas'});
  if(perms.usuarios) subTabs.push({id:'backup', label:'💾 Backup'});
  if(!subTabs.find(t=>t.id===configSubTab)) configSubTab='clinica';
  const bar=subTabs.map(t=>`<button data-consub="${t.id}" class="${configSubTab===t.id?'active':''}">${t.label}</button>`).join('');
  let body='';
  if(configSubTab==='clinica') body=renderClinica();
  else if(configSubTab==='procedimentos') body=renderProcedimentos();
  else if(configSubTab==='tipodespesas') body=renderTiposDespesa();
  else if(configSubTab==='backup') body=renderBackup();
  return `<h2 style="margin:0 0 10px 0">Configurações</h2><div class="tabs">${bar}</div>${body}`;
}
function renderTiposDespesa(){
  ensureDespesasCatalogo();
  const groups=CATEGORIAS_DESPESA.map(cat=>{
    const items=state.despesasCatalogo.filter(d=>d.categoria===cat);
    const rows=items.map(d=>`<tr><td>${esc(d.nome)}</td><td class="actions">
      <button class="btn-s" data-edittipodesp="${d.id}">Editar</button>
      <button class="btn-d" data-deltipodesp="${d.id}">Excluir</button></td></tr>`).join('');
    return `<div class="card"><h3>${cat}</h3>
    <div class="overflow"><table><thead><tr><th>Tipo de despesa</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="2" class="muted">Nenhum tipo cadastrado</td></tr>'}</tbody></table></div></div>`;
  }).join('');
  return `<div class="card" style="display:flex;justify-content:space-between;align-items:center">
  <div><h3 style="margin:0">Tipos de Despesa</h3><p class="muted" style="margin:4px 0 0">Cadastre os tipos de despesa comuns da clínica, por categoria. Ao lançar uma despesa no Fluxo Financeiro, você escolhe o tipo e informa manualmente a empresa/pessoa, valor e vencimento.</p></div>
  <button id="btnNewTipoDesp" class="btn-p">+ Novo Tipo</button></div>
  <div id="tipoDespFormArea"></div>
  ${groups}`;
}
function openTipoDespForm(d){
  const isNew=!d;
  document.getElementById('tipoDespFormArea').innerHTML=`<div class="card">
  <h4>${isNew?'Novo Tipo de Despesa':'Editar Tipo de Despesa'}</h4>
  <form id="fTipoDesp">
  <label>Categoria</label><select id="tdCategoria">${CATEGORIAS_DESPESA.map(c=>`<option ${d&&d.categoria===c?'selected':''}>${c}</option>`).join('')}</select>
  <label>Nome da despesa</label><input id="tdNome" value="${esc(d?d.nome:'')}" required placeholder="Ex: Aluguel, Energia Elétrica">
  <div style="margin-top:12px"><button class="btn-p">Salvar</button> <button type="button" id="btnCancelTipoDesp" class="btn-s">Cancelar</button></div>
  </form></div>`;
  document.getElementById('btnCancelTipoDesp').addEventListener('click',()=>{ document.getElementById('tipoDespFormArea').innerHTML=''; });
  document.getElementById('fTipoDesp').addEventListener('submit', ev=>{
    ev.preventDefault();
    const data={id:isNew?uid():d.id, categoria:tdCategoria.value, nome:tdNome.value.trim()};
    if(isNew) state.despesasCatalogo.push(data); else Object.assign(d,data);
    saveData(); document.getElementById('tipoDespFormArea').innerHTML=''; render();
  });
}
function renderFluxoFinanceiro(){
  ensureFluxoTipos();
  const viewBar=`<div class="tabs">
    <button data-fluxoview="dia" class="${fluxoViewMode==='dia'?'active':''}">Dia</button>
    <button data-fluxoview="periodo" class="${fluxoViewMode==='periodo'?'active':''}">Período</button>
    <button data-fluxoview="mes" class="${fluxoViewMode==='mes'?'active':''}">Mês</button>
  </div>`;
  let filterRow='';
  if(fluxoViewMode==='dia'){
    filterRow=`<div class="row"><div><label>Data</label><input type="date" id="fluxoDataDia" value="${fluxoViewDate}"></div></div>`;
  } else if(fluxoViewMode==='periodo'){
    filterRow=`<div class="row"><div><label>De</label><input type="date" id="fluxoPerIni" value="${fluxoPeriodoInicio}"></div>
    <div><label>Até</label><input type="date" id="fluxoPerFim" value="${fluxoPeriodoFim}"></div></div>`;
  } else {
    filterRow=`<div class="row"><div><label>Mês</label><input type="month" id="fluxoMes" value="${fluxoMesRef}"></div></div>`;
  }
  const entries=getFluxoEntriesForView().slice().sort((a,b)=>(a.vencimento||'').localeCompare(b.vencimento||''));
  const entradaReal=entries.filter(e=>e.tipo==='receita'&&e.confirmado).reduce((s,e)=>s+(e.valor||0),0);
  const entradaPrevista=entries.filter(e=>e.tipo==='receita'&&!e.confirmado).reduce((s,e)=>s+(e.valor||0),0);
  const saidaReal=entries.filter(e=>e.tipo==='despesa'&&e.confirmado).reduce((s,e)=>s+(e.valor||0),0);
  const saidaPendente=entries.filter(e=>e.tipo==='despesa'&&!e.confirmado).reduce((s,e)=>s+(e.valor||0),0);
  const saldoRealizado=entradaReal-saidaReal;
  const rows=entries.map(e=>{
    const despesa=e.tipo==='despesa';
    const situacao=e.confirmado?'Realizado':(despesa?'Pendente':'Entrada Prevista');
    const situacaoClass=e.confirmado?'b-dent':(despesa?'b-harm':'b-recep');
    const pagCell=e.confirmado
      ? `${esc(e.dataPagamento)} <button class="btn-s" data-undoconf="${e.id}">Desfazer</button>`
      : `<input type="date" data-pagdata="${e.id}" value="${esc(e.dataPagamento||'')}" style="width:140px;display:inline-block"> <button class="btn-p" data-confpag="${e.id}">Confirmar</button>`;
    return `<tr><td>${esc(e.vencimento)}</td>
    <td><span class="badge ${despesa?'b-harm':'b-dent'}">${despesa?'Saída':'Entrada'}</span></td>
    <td>${esc(despesa?(e.fornecedor||'-'):e.pacienteNome)}</td>
    <td>${esc(e.label)}</td><td>${fmtMoney(e.valor)}</td>
    <td><span class="badge ${situacaoClass}">${situacao}</span></td>
    <td>${pagCell}</td>
    <td>${despesa?`<button class="btn-d" data-delfluxo="${e.id}">Excluir</button>`:''}</td></tr>`;
  }).join('');
  return `<div class="card">${viewBar}${filterRow}</div>
  <div class="card">
  <h3 style="margin:0 0 10px 0">Lançamentos</h3>
  ${entries.length?`<div class="overflow"><table><thead><tr><th>Vencimento</th><th>Tipo</th><th>Paciente/Fornecedor</th><th>Descrição</th><th>Valor</th><th>Situação</th><th>Pagamento</th><th></th></tr></thead>
  <tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhum lançamento neste período.</p>'}
  </div>
  <div class="card"><h3 style="margin:0 0 8px 0">Resumo</h3>
  <p><strong>Entrada Realizada:</strong> ${fmtMoney(entradaReal)} &nbsp;·&nbsp; <strong>Entrada Prevista:</strong> ${fmtMoney(entradaPrevista)}</p>
  <p><strong>Saída Realizada:</strong> ${fmtMoney(saidaReal)} &nbsp;·&nbsp; <strong>Despesa Pendente:</strong> ${fmtMoney(saidaPendente)}</p>
  <p><strong>Saldo Realizado:</strong> <span style="color:${saldoRealizado<0?'#dc2626':'#16a34a'};font-weight:700">${fmtMoney(saldoRealizado)}</span></p>
  </div>`;
}
function renderLancarDespesa(){
  ensureDespesasCatalogo();
  return `<div class="card"><h3>Lançar Nova Despesa</h3>
  <form id="fDespesa">
  <label>Tipo de despesa</label>
  <select id="dpTipo">${CATEGORIAS_DESPESA.map(cat=>{
    const opts=state.despesasCatalogo.filter(d=>d.categoria===cat).map(d=>`<option value="${d.id}">${esc(d.nome)}</option>`).join('');
    return opts?`<optgroup label="${cat}">${opts}</optgroup>`:'';
  }).join('')}</select>
  <div class="row">
    <div><label>Empresa / Pessoa (fornecedor)</label><input id="dpFornecedor" placeholder="Ex: nome da empresa de energia"></div>
    <div><label>Valor (R$)</label><input id="dpValor" type="number" step="0.01" min="0" required></div>
    <div><label>Vencimento</label><input id="dpVencimento" type="date" required></div>
  </div>
  <div style="margin-top:12px"><button class="btn-p">Salvar Despesa</button></div>
  </form></div>`;
}
function renderFinanceiro(p){
  const aprovados=(p.orcamentos||[]).filter(o=>o.status==='aprovado').slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  if(!aprovados.length){
    return `<div class="card"><h3>Financeiro</h3><p class="muted">Nenhum orçamento aprovado ainda. Aprove um orçamento na aba Orçamento para defini-lo aqui.</p></div>`;
  }
  return aprovados.map(o=>{
    const pag=o.pagamento||{};
    const comEntrada=pag.condicao==='parcelado_com';
    const parcelado=comEntrada||pag.condicao==='parcelado_sem';
    const parcelas=calcParcelas(o);
    const parcRows=parcelas.map(pc=>`<tr><td>${pc.label}</td><td>${fmtMoney(pc.valor)}</td><td>${pc.vencimento}</td></tr>`).join('');
    return `<div class="card">
    <h3>Orçamento aprovado — ${esc(o.data)}</h3>
    <p><strong>Valor total:</strong> ${fmtMoney(o.total)} &nbsp;·&nbsp; <strong>Aprovado em:</strong> ${esc(o.dataAprovacao||o.data)}</p>
    <div class="row">
      <div><label>Condição de pagamento</label>
        <select data-finfield="condicao" data-orcid="${o.id}">
          <option value="avista" ${(!pag.condicao||pag.condicao==='avista')?'selected':''}>À vista</option>
          <option value="parcelado_sem" ${pag.condicao==='parcelado_sem'?'selected':''}>Parcelado sem entrada</option>
          <option value="parcelado_com" ${comEntrada?'selected':''}>Parcelado com entrada</option>
        </select></div>
      <div><label>Forma de pagamento</label>
        <select data-finfield="forma" data-orcid="${o.id}">
          <option value="" ${!pag.forma?'selected':''}>Selecione</option>
          <option value="Dinheiro" ${pag.forma==='Dinheiro'?'selected':''}>Dinheiro</option>
          <option value="Pix" ${pag.forma==='Pix'?'selected':''}>Pix</option>
          <option value="Cartão de Débito" ${pag.forma==='Cartão de Débito'?'selected':''}>Cartão de Débito</option>
          <option value="Cartão de Crédito" ${pag.forma==='Cartão de Crédito'?'selected':''}>Cartão de Crédito</option>
          <option value="Boleto" ${pag.forma==='Boleto'?'selected':''}>Boleto</option>
        </select></div>
      ${comEntrada?`<div><label>Valor da entrada (R$)</label><input type="number" step="0.01" min="0" data-finfield="valorEntrada" data-orcid="${o.id}" value="${esc(pag.valorEntrada||'')}"></div>`:''}
      ${parcelado?`<div><label>${comEntrada?'Nº de parcelas (saldo restante)':'Número de parcelas'}</label><input type="number" min="1" data-finfield="numParcelas" data-orcid="${o.id}" value="${esc(pag.numParcelas||'')}"></div>`:''}
      ${parcelado?`<div><label>Intervalo entre parcelas</label><select data-finfield="intervaloDias" data-orcid="${o.id}">
        <option value="15" ${pag.intervaloDias==='15'?'selected':''}>A cada 15 dias</option>
        <option value="30" ${(!pag.intervaloDias||pag.intervaloDias==='30')?'selected':''}>A cada 30 dias</option>
      </select></div>`:''}
    </div>
    <label>Observações financeiras</label><input type="text" data-finfield="obs" data-orcid="${o.id}" value="${esc(pag.obs||'')}" placeholder="Ex: desconto combinado, forma de cobrança etc.">
    <div class="overflow" style="margin-top:14px"><table><thead><tr><th>Parcela</th><th>Valor</th><th>Vencimento</th></tr></thead>
    <tbody>${parcRows}</tbody></table></div>
    <div style="margin-top:14px">${o.fluxoGerado?`<span class="muted">Fluxo gerado em ${esc(o.fluxoGeradoEm)} — já está no Financeiro do consultório.</span> <button class="btn-s" data-genfluxo="${o.id}" style="margin-left:8px">Atualizar Fluxo</button>`:`<button class="btn-p" data-genfluxo="${o.id}">Gerar Fluxo</button>`}</div>
    </div>`;
  }).join('');
}
function renderEvolucao(p){
  p.evolucao=p.evolucao||[];
  if(!p.evolucao.length){
    return `<div class="card"><h3>Evolução</h3><p class="muted">Nenhuma evolução registrada ainda. Uma entrada é criada automaticamente a cada agendamento deste paciente (avaliação ou procedimento do plano de tratamento).</p></div>`;
  }
  const list=p.evolucao.slice().sort((a,b)=>(b.data+b.hora).localeCompare(a.data+a.hora));
  const eu=currentUser(), ehDentista=!!eu && eu.tipo==='dentista';
  const items=list.map(e=>{
    if(e.confirmado){
      return `<div class="card">
      <p style="margin:0"><strong>${esc(e.data)} ${esc(e.hora)}</strong> — ${esc(e.procedimentoNome)} ${e.falta?'<span class="badge b-red">Falta</span> ':''}<span class="badge b-dent">Confirmado</span></p>
      <p class="muted" style="margin:4px 0">Dentista: ${esc(e.dentistaNome)}</p>
      ${e.observacao?`<p style="margin:6px 0">${esc(e.observacao)}</p>`:''}
      <p class="muted" style="font-size:12px;margin:4px 0 0">Confirmado em ${esc(fmtDataBR(e.confirmadoEm))}${e.confirmadoPorNome?' por '+esc(e.confirmadoPorNome)+(e.confirmadoPorCro?' — CRO '+esc(e.confirmadoPorCro):''):''}</p>
      </div>`;
    }
    return `<div class="card">
    <p style="margin:0"><strong>${esc(e.data)} ${esc(e.hora)}</strong> — ${esc(e.procedimentoNome)} ${e.falta?'<span class="badge b-red">Falta</span> ':''}<span class="badge b-recep">Pendente de confirmação</span></p>
    <p class="muted" style="margin:4px 0 10px">Dentista: ${esc(e.dentistaNome)}</p>
    <label>Observação do dentista</label>
    <textarea data-evolobs="${e.id}" rows="3" style="width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px;font-family:inherit">${esc(e.observacao)}</textarea>
    <div style="margin-top:10px">${ehDentista?`<button class="btn-p" data-confevol="${e.id}">Confirmar Evolução</button>`:'<span class="muted">Somente um dentista pode confirmar a evolução.</span>'}</div>
    </div>`;
  }).join('');
  return `<h3 style="margin:0 0 10px 0">Evolução</h3>${items}`;
}
function openImageViewer(src, title){
  const bg=document.createElement('div');
  bg.className='img-modal-bg';
  bg.innerHTML=`<div class="img-modal"><h4 style="margin:0 0 10px 0">${esc(title)}</h4><img src="${src}"><button class="btn-s" id="btnCloseImgModal" style="margin-top:12px">Fechar</button></div>`;
  document.body.appendChild(bg);
  bg.addEventListener('click', e=>{ if(e.target===bg) document.body.removeChild(bg); });
  document.getElementById('btnCloseImgModal').addEventListener('click',()=>{ document.body.removeChild(bg); });
}
const EXAME_CLINICO_GRUPOS=[
  {titulo:'Exame físico geral', campos:[
    {id:'fc', label:'Frequência cardíaca (BPM)', type:'number'},
    {id:'pa', label:'Pressão arterial (mmHg)', type:'text', ph:'Ex: 120 x 80'},
    {id:'biotipo', label:'Biotipo', type:'text'},
    {id:'deambulacao', label:'Deambulação', type:'text'},
    {id:'estadoEmocional', label:'Estado emocional', type:'text'},
    {id:'simetria', label:'Simetria facial', type:'select', options:['Simétrica','Assimétrica']},
    {id:'ganglionar', label:'Alteração ganglionar', type:'select', options:['Não','Sim']},
    {id:'ganglionarCadeia', label:'Cadeia ganglionar', type:'text'},
    {id:'ganglionarNatureza', label:'Natureza da alteração', type:'text'},
  ]},
  {titulo:'Exame loco-regional', campos:[
    {id:'extraoral', label:'Extraoral (face, pele, lábios, ATM, linfonodos, simetria)', type:'textarea'},
    {id:'intraoral', label:'Intraoral (mucosa, língua, palato, assoalho, gengiva, orofaringe)', type:'textarea'},
  ]},
  {titulo:'Exame dental e oclusão', campos:[
    {id:'dentes', label:'Exame dental descritivo (numeração FDI): cáries, ausências, restaurações existentes (faces e material), próteses, implantes, tratamentos endodônticos', type:'textarea'},
    {id:'oclusao', label:'Padrão de oclusão (classificação, guia anterior, lateralidade, interferências, DTM)', type:'textarea'},
  ]},
  {titulo:'Diagnóstico', campos:[
    {id:'diagnostico', label:'Diagnóstico', type:'textarea'},
  ]},
];
function exameCampoHtml(c, dados){
  const v=dados[c.id]!==undefined?dados[c.id]:'';
  if(c.type==='textarea') return `<div style="flex:1 1 100%"><label>${esc(c.label)}</label><textarea class="ta" rows="3" data-ex="${c.id}">${esc(v)}</textarea></div>`;
  if(c.type==='select') return `<div><label>${esc(c.label)}</label><select data-ex="${c.id}">${c.options.map(o=>`<option ${v===o?'selected':''}>${o}</option>`).join('')}</select></div>`;
  return `<div><label>${esc(c.label)}</label><input data-ex="${c.id}" type="${c.type==='number'?'number':'text'}" value="${esc(v)}" placeholder="${esc(c.ph||'')}"></div>`;
}
function renderExameClinico(p){
  p.examesClinicos=p.examesClinicos||[];
  if(exameOpenId){
    const ex=p.examesClinicos.find(e=>e.id===exameOpenId);
    if(ex) return ex.finalizado ? renderExameClinicoView(ex) : renderExameClinicoForm(ex);
    exameOpenId=null;
  }
  const list=p.examesClinicos.slice().sort((a,b)=>((b.data||'')+(b.hora||'')).localeCompare((a.data||'')+(a.hora||'')));
  const rows=list.map(e=>`<tr><td>${esc(e.data)} ${esc(e.hora)}</td>
    <td>${e.dentistaNome?esc(e.dentistaNome)+' — CRO '+esc(e.dentistaCro):'-'}</td>
    <td><span class="badge ${e.finalizado?'b-dent':'b-recep'}">${e.finalizado?'Finalizado':'Rascunho'}</span></td>
    <td class="actions"><button class="btn-s" data-viewexame="${e.id}">${e.finalizado?'Visualizar':'Continuar preenchimento'}</button>
    <button class="btn-d" data-delexame="${e.id}">Excluir</button></td></tr>`).join('');
  return `<div class="card"><h3>Exame Clínico</h3>
  <p class="muted">Exame físico (geral e loco-regional), exame dental, oclusão e diagnóstico, conforme o Manual do Prontuário do Paciente do CFO. Cada exame fica registrado com data, hora, nome e CRO do dentista e, depois de salvo, só pode ser visualizado.</p>
  <button class="btn-p" id="btnNewExame">+ Novo Exame Clínico</button></div>
  <div class="card"><h4 style="margin:0 0 10px 0">Exames clínicos registrados</h4>
  ${list.length?`<div class="overflow"><table><thead><tr><th>Data / hora</th><th>Dentista</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhum exame clínico registrado ainda.</p>'}</div>`;
}
function renderExameClinicoForm(ex){
  const dentistas=state.users.filter(u=>u.tipo==='dentista');
  const grupos=EXAME_CLINICO_GRUPOS.map(g=>`<div class="section-title">${g.titulo}</div><div class="row">${g.campos.map(c=>exameCampoHtml(c, ex.dados||{})).join('')}</div>`).join('');
  return `<div class="card"><h3>Exame Clínico</h3>
  ${semDentistaAviso()}
  <form id="fExame">
  <div class="row">
    <div><label>Dentista responsável</label><select id="exDentista" required>${dentistaOptionsHtml(ex.dentistaId)}</select></div>
    <div><label>Data</label><input type="date" id="exData" value="${esc(ex.data)}" required></div>
    <div><label>Hora</label><input type="time" id="exHora" value="${esc(ex.hora)}" required></div>
  </div>
  ${grupos}
  <p class="muted" style="margin-top:12px">⚠️ Após salvar, este exame clínico vira um documento e não poderá mais ser editado — apenas visualizado.</p>
  <div style="margin-top:12px"><button class="btn-p">Salvar Exame Clínico</button> <button type="button" id="btnBackExame" class="btn-s">Voltar</button></div>
  </form></div>`;
}
function renderExameClinicoView(ex){
  const d=ex.dados||{};
  const grupos=EXAME_CLINICO_GRUPOS.map(g=>{
    const boxes=g.campos.map(c=>{
      const val=d[c.id]||'';
      if(c.type==='textarea') return `<div class="info-box" style="grid-column:1/-1"><div class="info-label">${esc(c.label)}</div><div class="info-value" style="white-space:pre-wrap;font-weight:500">${esc(val)||'-'}</div></div>`;
      return infoBox(c.label, val);
    }).join('');
    return `<div class="section-title">${g.titulo}</div><div class="info-grid">${boxes}</div>`;
  }).join('');
  return `<div class="card"><h3 style="margin-top:0">Exame Clínico</h3>
  <p class="muted">${esc(ex.data)} às ${esc(ex.hora)} · Dentista: <strong>${esc(ex.dentistaNome)}</strong> — CRO ${esc(ex.dentistaCro)} · Documento finalizado (somente leitura)</p>
  ${grupos}
  <div style="margin-top:16px"><button class="btn-s" id="btnBackExame">Voltar</button></div></div>`;
}
function renderDocumentacao(p){
  p.documentos=p.documentos||[];
  if(docOpenId){
    const doc=p.documentos.find(d=>d.id===docOpenId);
    if(doc) return renderDocumentoView(p,doc);
    docOpenId=null;
  }
  if(docFormType) return renderDocumentoForm(p, docFormType);
  const list=p.documentos.slice().sort((a,b)=>(b.criadoEm||'').localeCompare(a.criadoEm||''));
  const rows=list.map(d=>`<tr><td>${fmtDataBR(d.data)}</td><td>${d.tipo==='atestado'?'Atestado Odontológico':'Declaração de Comparecimento'}</td>
    <td class="actions"><button class="btn-s" data-viewdoc="${d.id}">Ver / Imprimir</button><button class="btn-d" data-deldoc="${d.id}">Excluir</button></td></tr>`).join('');
  return `<div class="card"><h3>Documentação</h3>
  <p class="muted">Gere documentos padronizados conforme o modelo do CFO.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn-p" data-newdoc="atestado">+ Atestado Odontológico</button>
    <button class="btn-p" data-newdoc="declaracao">+ Declaração de Comparecimento</button>
  </div>
  </div>
  <div class="card"><h4 style="margin:0 0 10px 0">Documentos gerados</h4>
  ${list.length?`<div class="overflow"><table><thead><tr><th>Data</th><th>Tipo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Nenhum documento gerado ainda.</p>'}
  </div>`;
}
function fmtDataBR(iso){
  if(!iso) return '';
  const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`;
}
function dentistaOptionsHtml(selectedId, comCro){
  if(comCro===undefined) comCro=true;
  const dentistas=state.users.filter(u=>u.tipo==='dentista');
  const u=currentUser();
  const sel=selectedId||(u&&u.tipo==='dentista'?u.id:'');
  return '<option value="">Selecione</option>'+dentistas.map(d=>`<option value="${d.id}" ${sel===d.id?'selected':''}>${esc(d.nomeCompleto)}${comCro?' — CRO '+esc(d.cro):''}</option>`).join('');
}
function semDentistaAviso(){
  if(state.users.some(u=>u.tipo==='dentista')) return '';
  return '<div style="border:1px solid #dc2626;border-radius:8px;padding:10px 12px;margin:10px 0"><p style="margin:0;color:#b91c1c;font-size:14px"><strong>Nenhum dentista cadastrado.</strong> Cadastre um usuário do tipo Dentista, com o CRO, em Usuários para poder usar esta função.</p></div>';
}
function renderDocumentoForm(p, tipo){
  const isAtestado=tipo==='atestado';
  return `<div class="card"><h3>${isAtestado?'Gerar Atestado Odontológico':'Gerar Declaração de Comparecimento'}</h3>
  <p class="muted">Paciente: <strong>${esc(p.nome)}</strong>${p.rg?' · RG '+esc(p.rg):''}${p.cpf?' · CPF '+esc(p.cpf):''}</p>
  ${semDentistaAviso()}
  <form id="fDoc">
  <div class="row">
    <div><label>Dentista responsável</label><select id="docDentista" required>${dentistaOptionsHtml('')}</select></div>
    <div><label>Data do atendimento</label><input type="date" id="docData" value="${hojeISO()}" required></div>
  </div>
  <div class="row">
    <div><label>Finalidade (o CFO orienta não usar "para os devidos fins")</label>
      <select id="docFinalidade" required><option value="">Selecione</option><option value="trabalhistas">Trabalhistas</option><option value="escolares">Escolares</option><option value="desportivos">Desportivos</option></select></div>
    <div><label>Apresentação junto a (opcional)</label><input type="text" id="docApresentacao" placeholder="Ex: à Empresa Tal / à Escola Tal"></div>
  </div>
  ${isAtestado?`
  <div class="row">
    <div><label>Afastamento / repouso</label><input type="number" min="1" id="docQtd" required></div>
    <div><label>Unidade</label><select id="docUnidade"><option value="dias">Dia(s)</option><option value="horas">Hora(s)</option></select></div>
  </div>
  <div class="row">
    <div><label>CID-11 (opcional)</label><input type="text" id="docCid" placeholder="Ex: DA08.0"></div>
    <div><label>CID autorizado por</label><input type="text" id="docCidAut" value="${esc(p.nome)}"></div>
  </div>
  <p class="muted" style="margin:4px 0 0">Informe o CID somente se o paciente (ou responsável legal) solicitou e autorizou a menção, conforme orienta o CFO. Sem CID, o atestado não revela diagnóstico nem tratamento.</p>`:''}
  <div class="row">
    <div><label>Horário de início (opcional)</label><input type="time" id="docEntrada"></div>
    <div><label>Horário de término (opcional)</label><input type="time" id="docSaida"></div>
    <div><label>Local — cidade/UF (opcional)</label><input type="text" id="docLocal" placeholder="Ex: Manaus/AM"></div>
  </div>
  <div style="margin-top:14px"><button class="btn-p">Gerar Documento</button> <button type="button" id="btnCancelDoc" class="btn-s">Cancelar</button></div>
  </form></div>`;
}
function renderDocumentoView(p, d){
  const c=state.clinic||{};
  const ident=[]; if(p.rg) ident.push('RG nº '+esc(p.rg)); if(p.cpf) ident.push('CPF/MF nº '+esc(p.cpf));
  const identTxt=ident.length?', '+ident.join(' / '):'';
  const fin=d.finalidade?'para fins '+esc(d.finalidade)+(d.apresentacao?', de apresentação junto '+esc(d.apresentacao):''):'';
  const abertura=fin?', '+fin+' e':',';
  let horario='';
  if(d.horarioEntrada && d.horarioSaida) horario=`, no horário das ${esc(d.horarioEntrada)} às ${esc(d.horarioSaida)} horas`;
  else if(d.horarioEntrada) horario=`, a partir das ${esc(d.horarioEntrada)} horas`;
  const dataAt=fmtDataBR(d.data);
  let corpo='';
  if(d.tipo==='atestado'){
    const qtd=d.quantidade||d.diasAtestado||'';
    const un=d.unidade||'dias';
    const afast = un==='horas'
      ? `necessitando de <strong>${esc(qtd)} hora(s)</strong> de repouso, a contar do término do atendimento`
      : `necessitando de <strong>${esc(qtd)} dia(s)</strong> de afastamento de suas atividades, a partir de ${dataAt}`;
    corpo=`<p>Atesto${abertura} a pedido do(a) interessado(a)${d.cid?', inclusive com menção de CID por este(a) solicitada':''}, que o(a) paciente <strong>${esc(p.nome)}</strong>${identTxt}, esteve sob meus cuidados profissionais em ${dataAt}${horario}, ${afast}.</p>
    ${d.cid?`<p>CID-11 nº <strong>${esc(d.cid)}</strong> — autorizado por: <strong>${esc(d.cidAutorizadoPor||'')}</strong></p>`:''}`;
  } else {
    corpo=`<p>Declaro${abertura} a pedido do(a) interessado(a), que o(a) paciente <strong>${esc(p.nome)}</strong>${identTxt}, compareceu a este consultório odontológico, onde esteve sob meus cuidados profissionais para atendimento odontológico, em ${dataAt}${horario}.</p>`;
  }
  const local=d.local?esc(d.local)+', ':'';
  const titulo=d.tipo==='atestado'?'Atestado Odontológico':'Declaração de Comparecimento';
  const via=(label, comCiente)=>`<div class="via"><div class="via-label">${label}</div>
    <div class="doc-head"><div class="doc-clinic">${esc(c.nome)}</div>
    <div class="doc-sub">${esc(c.endereco)}${c.telefone?' · '+esc(c.telefone):''}${c.email?' · '+esc(c.email):''}</div></div>
    <div class="doc-title">${titulo}</div>
    <div class="doc-body">${corpo}</div>
    <p class="doc-date">${local}${fmtDataBR(d.criadoEm||d.data)}</p>
    <div class="doc-sign"><div class="sign-line"></div><div><strong>${esc(d.dentistaNome)}</strong></div>
    <div class="doc-sub">Cirurgião-dentista — CRO ${esc(d.dentistaCro)}</div></div>
    ${comCiente?'<p class="doc-ciente">Ciente / De acordo: ______________________________ (assinatura do paciente)</p>':''}
  </div>`;
  const sheet=`<div class="a4-sheet">${via('Via do paciente', false)}<div class="corte"><span>✂ corte aqui ✂</span></div>${via('Via do consultório — arquivo', true)}</div>`;
  printSheetHtml=sheet;
  return `<div class="card">
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
    <button class="btn-p" id="btnPrintDoc">🖨️ Imprimir (A4 — 2 vias)</button>
    <button class="btn-s" id="btnBackDoc">Voltar</button>
  </div>
  <p class="muted" style="margin:0 0 14px">Folha A4 com duas vias idênticas: corte na linha tracejada. Uma via fica com o paciente e a outra é arquivada no consultório, já com o "Ciente / De acordo" do paciente. Se a janela de impressão não abrir, use Ctrl+P (⌘+P).</p>
  ${sheet}
  </div>`;
}
function handleFileToDataUrl(file, cb){
  const reader=new FileReader();
  reader.onload=()=>cb(reader.result);
  reader.readAsDataURL(file);
}
function renderExames(p){
  p.exames=p.exames||{panoramicas:[],periapicais:[]};
  const momentos=[{id:'inicio',label:'Início do tratamento'},{id:'meio',label:'Meio do tratamento'},{id:'fim',label:'Fim do tratamento'}];
  const panoCards=momentos.map(m=>{
    const existing=p.exames.panoramicas.find(x=>x.momento===m.id);
    return `<div style="flex:1;min-width:200px">
      <h4 style="margin:0 0 8px 0">${m.label}</h4>
      ${existing?`<img ${imgAttr(existing)} class="zoom-img" data-viewpano="${existing.id}" style="max-width:100%;border-radius:8px;border:1px solid var(--border)">
      <p class="muted" style="font-size:12px;margin:6px 0">Enviada em ${esc(existing.dataUpload)}</p>
      <button class="btn-d" data-delpano="${existing.id}">Remover</button>`
      :`<input type="file" accept="image/*" data-panoupload="${m.id}">`}
    </div>`;
  }).join('');
  const periList=p.exames.periapicais.slice().sort((a,b)=>(b.dataUpload||'').localeCompare(a.dataUpload||''));
  const periRows=periList.map(x=>`<div class="card" style="display:flex;gap:12px;align-items:center">
    <img ${imgAttr(x)} class="zoom-img" data-viewperi="${x.id}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
    <div style="flex:1"><strong>Dente ${esc(x.dente)}</strong><p class="muted" style="margin:4px 0">Enviada em ${esc(x.dataUpload)}</p></div>
    <button class="btn-d" data-delperi="${x.id}">Remover</button>
  </div>`).join('');
  return `<div class="card"><h3>Radiografias Panorâmicas</h3>
  <p class="muted">Até 3 panorâmicas por paciente — início, meio e fim do tratamento.</p>
  <div class="row">${panoCards}</div></div>
  <div class="card"><h3>Radiografias Periapicais</h3>
  <p class="muted">Sem limite — cada imagem deve ser identificada pelo número do dente.</p>
  <div class="row">
    <div><label>Dente</label><select id="periDente">${allTeethNumbers(p).map(n=>`<option>${n}</option>`).join('')}</select></div>
    <div><label>Arquivo da radiografia</label><input type="file" accept="image/*" id="periFile"></div>
  </div>
  <button id="btnAddPeri" class="btn-p" style="margin-top:10px">+ Adicionar Periapical</button>
  </div>
  ${periList.length?`<div style="display:flex;flex-direction:column;gap:10px">${periRows}</div>`:'<div class="card"><p class="muted">Nenhuma radiografia periapical adicionada ainda.</p></div>'}`;
}
function renderOdontograma(p){
  ensureProcedimentos();
  if(!p.odonto){
    return odontoSetupMode==='marking' ? renderOdontoMarking(p) : renderOdontoAsk();
  }
  if(odontoSetupMode==='marking') return renderOdontoMarking(p);
  const age=calcAge(p.nascimento);
  const dentesMap=p.odonto.dentes||{};
  let html=`<div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
  <h4 style="margin:0;font-weight:500">Legenda: <span style="color:#1d4ed8;font-weight:700">A</span> = Ausente &nbsp;·&nbsp; <span style="color:#1d4ed8;font-weight:700">X</span> = Extração anterior &nbsp;·&nbsp; <span style="color:#dc2626;font-weight:700">Vermelho</span> = a executar &nbsp;·&nbsp; <span style="color:#1d4ed8;font-weight:700">Azul</span> = realizado (anterior ou concluído)</h4>
  <button id="btnEditMarks" class="btn-s">Editar ausências/extrações</button></div>`;
  html+=renderOdontogramChart('Odontograma Permanente', PERM_UPPER, PERM_LOWER, 8, dentesMap);
  if(age!==null && age<13){
    html+=renderOdontogramChart('Odontograma Decíduo', DECID_UPPER, DECID_LOWER, 5, dentesMap);
  }
  html+='<p class="muted">Dentes marcados como Ausente/Extração só aceitam procedimentos de Prótese/Implante. O dente fica em <strong style="color:#dc2626">vermelho</strong> enquanto houver procedimento a executar e em <strong style="color:#1d4ed8">azul</strong> quando tudo já foi realizado (anteriormente ou com a evolução confirmada); os números nos selos indicam a quantidade de cada tipo. Procedimentos já realizados anteriormente não entram no Plano de Tratamento nem no Orçamento.</p>';
  html+=`<div id="toothInfo">${renderToothPanel(p, odontoToothOpenNum)}</div>`;
  html+=renderGeraisSection(p);
  return html;
}
const harmQuestions=[
  {id:'objetivo', label:'Objetivo da consulta', type:'text'},
  {id:'tratamentoEstetico', label:'Já realizou tratamento estético anteriormente?', type:'ynd', detailLabel:'Qual(is) e quando?'},
  {id:'cirurgiaHarmonizacao', label:'Já realizou cirurgia/procedimento de harmonização facial?', type:'ynd', detailLabel:'Qual(is) e quando?'},
  {id:'medicacaoContinua', label:'Usa medicação de uso contínuo ou controlado?', type:'ynd', detailLabel:'Qual(is)?'},
  {id:'tratamentoMedico', label:'Está sob tratamento médico atualmente?', type:'ynd', detailLabel:'Para qual condição?'},
  {id:'fumante', label:'É fumante ou ex-fumante?', type:'ynd', detailLabel:'Frequência / há quanto tempo parou?'},
  {id:'atividadeFisica', label:'Pratica atividade física regularmente?', type:'ynd', detailLabel:'Qual(is) e frequência?'},
  {id:'gestante', label:'Está gestante ou amamentando?', type:'select', options:['Não','Sim','Não se aplica']},
  {id:'habitosAlimentares', label:'Como avalia seus hábitos alimentares?', type:'select', options:['Ótimos','Bons','Regulares','Ruins']},
  {id:'contraceptivo', label:'Utiliza método contraceptivo?', type:'yn'},
  {id:'cicloMenstrual', label:'Seu ciclo menstrual é regular?', type:'select', options:['Não','Sim','Não se aplica']},
  {id:'reposicaoHormonal', label:'Faz ou já fez reposição hormonal?', type:'yn'},
  {id:'drogasIlicitas', label:'Faz uso de drogas ilícitas?', type:'yn'},
  {id:'traumaEmocional', label:'Passou por trauma emocional importante recentemente?', type:'yn'},
  {id:'anabolizantes', label:'Utiliza ou já utilizou anabolizantes?', type:'ynd', detailLabel:'Qual(is) e quando?'},
  {id:'alcool', label:'Faz uso frequente de bebidas alcoólicas?', type:'ynd', detailLabel:'Frequência e quantidade?'},
  {id:'variacaoPeso', label:'Perda/ganho de peso significativo recente (+5kg em 3 meses)?', type:'ynd', detailLabel:'Quantos kg e motivo?'},
  {id:'alergias', label:'Possui alergia a medicamentos, anestésicos, cosméticos ou alimentos?', type:'ynd', detailLabel:'Especifique'},
  {id:'acidosPele', label:'Utiliza ou já utilizou ácidos na pele?', type:'ynd', detailLabel:'Qual(is) e quando?'},
  {id:'rotinaPele', label:'Possui rotina de cuidados com a pele do rosto?', type:'ynd', detailLabel:'Descreva brevemente'},
  {id:'exposicaoSolar', label:'Exposição solar diária/frequente', type:'select', options:['Baixa','Moderada','Alta']},
  {id:'protetorSolar', label:'Utiliza protetor solar regularmente?', type:'yn'},
  {id:'doencaPele', label:'Possui doença de pele diagnosticada (acne, rosácea, dermatite)?', type:'ynd', detailLabel:'Qual(is)?'},
  {id:'alteracaoVascular', label:'Observa alguma alteração vascular na pele?', type:'ynd', detailLabel:'Descreva'},
  {id:'manchasPele', label:'Possui manchas na pele?', type:'ynd', detailLabel:'Onde e há quanto tempo?'},
  {id:'formacaoSolida', label:'Apresenta formação sólida na pele (nódulos, verrugas, cistos, cicatrizes)?', type:'ynd', detailLabel:'Descreva'},
  {id:'infectocontagiosa', label:'Foi diagnosticado com doença infectocontagiosa (hepatite, HIV)?', type:'ynd', detailLabel:'Qual?'},
  {id:'historicoAcne', label:'Tem histórico familiar de acne relevante?', type:'yn'},
  {id:'hematomas', label:'Percebe o surgimento de hematomas com facilidade?', type:'yn'},
  {id:'varizes', label:'Possui varizes ou microvarizes?', type:'yn'},
  {id:'queloides', label:'Tem predisposição à formação de queloides?', type:'yn'},
  {id:'cicatrizacao', label:'Tem histórico de hemorragia ou dificuldade de cicatrização?', type:'yn'},
  {id:'doencaCronica', label:'Possui doença crônica (diabetes, hipertensão, renal, hepática, autoimune)?', type:'ynd', detailLabel:'Qual(is) e faz acompanhamento?'},
  {id:'roacutan', label:'Utiliza ou utilizou Roacutan (Isotretinoína)?', type:'ynd', detailLabel:'Quando terminou o tratamento?'},
  {id:'desmaios', label:'Já teve desmaios, tonturas frequentes ou convulsões?', type:'ynd', detailLabel:'Relate brevemente'},
  {id:'protese', label:'Possui prótese metálica ou implante no corpo/face?', type:'ynd', detailLabel:'Onde?'},
  {id:'traumaFace', label:'Sofreu trauma ou fratura na face?', type:'ynd', detailLabel:'Quando e qual tratamento?'},
  {id:'cardiovascular', label:'Possui doença cardiovascular (arritmia, pressão alta)?', type:'ynd', detailLabel:'Qual(is)?'},
  {id:'respiratoria', label:'Tem ou teve distúrbios respiratórios significativos (asma grave, bronquite crônica)?', type:'ynd', detailLabel:'Qual(is)?'},
  {id:'expectativa', label:'Qual sua principal expectativa quanto ao tratamento?', type:'text'},
  {id:'satisfacao', label:'Nível de satisfação com a aparência atual (0 a 5)', type:'scale'},
  {id:'outrasInfo', label:'Algo mais importante a informar sobre saúde/hábitos?', type:'text'},
];
function questionField(q,val){
  val=val||{}; const v=val[q.id];
  if(q.type==='text') return `<label>${q.label}</label><input data-q="${q.id}" value="${esc(v)}">`;
  if(q.type==='scale') return `<label>${q.label}</label><input data-q="${q.id}" type="number" min="0" max="5" value="${esc(v)}">`;
  if(q.type==='select') return `<label>${q.label}</label><select data-q="${q.id}">${q.options.map(o=>`<option ${v===o?'selected':''}>${o}</option>`).join('')}</select>`;
  if(q.type==='yn') return `<label>${q.label}</label><select data-q="${q.id}"><option ${(!v||v==='Não')?'selected':''}>Não</option><option ${v==='Sim'?'selected':''}>Sim</option></select>`;
  if(q.type==='ynd') return `<label>${q.label}</label><select data-q="${q.id}"><option ${(!v||v==='Não')?'selected':''}>Não</option><option ${v==='Sim'?'selected':''}>Sim</option></select>
    <input data-q="${q.id}_det" placeholder="${esc(q.detailLabel)}" value="${esc(val[q.id+'_det'])}" style="margin-top:6px">`;
  return '';
}
function defaultAnamnese(){
  return {tratamentoMedico:'Não',tratamentoQual:'',medicamentosContinuos:'',
    alergiaMedicamentos:'',alergiaAnestesico:'Não',alergiaAnestesicoDetalhe:'',alergiaLatex:'Não',
    docDiabetes:false,docHipertensao:false,docCardiopatia:false,docRenal:false,docHepatite:false,
    docHiv:false,docRespiratoria:false,docCoagulacao:false,docEpilepsia:false,docOsteoporose:false,
    docCancer:false,docOutras:'',
    gestante:'Não',gestanteMeses:'',amamentando:'Não',fumante:'Não',etilista:'Não',
    reacaoAnestesia:'Não',reacaoAnestesiaDetalhe:'',sangramentoGengival:'Não',bruxismo:'Não',
    ultimaVisita:'',escovacaoDiaria:'',fioDental:'Não',observacoes:''};
}

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function esc(s){ return (s||'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function avisar(message){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal"><p>${esc(message)}</p><div style="margin-top:16px"><button id="avOk" class="btn-p">OK</button></div></div>`;
  document.body.appendChild(bg);
  document.getElementById('avOk').addEventListener('click',()=>{ document.body.removeChild(bg); });
}
function customConfirm(message, onYes){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal"><p>${esc(message)}</p>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
      <button id="ccYes" class="btn-d">Excluir</button>
      <button id="ccNo" class="btn-s">Cancelar</button>
    </div></div>`;
  document.body.appendChild(bg);
  document.getElementById('ccYes').addEventListener('click',()=>{ document.body.removeChild(bg); onYes(); });
  document.getElementById('ccNo').addEventListener('click',()=>{ document.body.removeChild(bg); });
}
function defaultPerms(tipo){
  if(tipo==='master') return {usuarios:true,pacientes:true,clinica:true,procedimentos:true,financeiro:true};
  if(tipo==='administrativo') return {usuarios:true,pacientes:true,clinica:false,procedimentos:true,financeiro:true};
  if(tipo==='dentista') return {usuarios:false,pacientes:true,clinica:false,procedimentos:true,financeiro:false};
  return {usuarios:false,pacientes:true,clinica:false,procedimentos:false,financeiro:false};
}
// Grupos (antes chamados de "especialidades"): nome, posição na ordem sugerida do plano (null = no final), aceita dente ausente
const GRUPOS_PADRAO=[
  ["Dentística",3,false],["Cirurgia",1,false],["Endodontia",2,false],["Periodontia",0,false],["Ortodontia",null,false],["Prótese",4,true],
  ["Implantodontia",null,true],["Odontopediatria",null,false],["Harmonização Orofacial (HOF)",null,false],["Estomatologia",null,false],
  ["DTM e Dor Orofacial",null,false],["Radiologia e Imaginologia",null,false],["Odontogeriatria",null,false],["Odontologia Hospitalar",null,false],
  ["Odontologia do Esporte",null,false],["Odontologia do Trabalho",null,false],["Odontologia Legal",null,false],["Pacientes com Necessidades Especiais",null,false],
  ["Ortopedia Funcional dos Maxilares",null,false],["Patologia Oral e Maxilofacial",null,false],["Prótese Bucomaxilofacial",null,true],["Saúde Coletiva",null,false],
  ["Acupuntura",null,false],["Homeopatia",null,false]
];
// [grupo, procedimento, valor (fictício), tempo em min, cobrança: dente | arcada | geral]
const PROCS_V2=[
  ["Dentística","Restauração em Resina Composta (3 ou mais faces)",280,60,"dente"],
  ["Dentística","Restauração em Ionômero de Vidro",130,30,"dente"],
  ["Dentística","Reconstrução de Coroa com Pino de Fibra",450,75,"dente"],
  ["Dentística","Clareamento Caseiro (por arcada)",350,30,"arcada"],
  ["Dentística","Clareamento de Dente Desvitalizado",250,45,"dente"],
  ["Dentística","Remoção de Manchas / Microabrasão",200,40,"dente"],
  ["Dentística","Fechamento de Diastema com Resina",380,60,"dente"],
  ["Dentística","Polimento e Ajuste de Restauração",80,20,"dente"],
  ["Cirurgia","Exodontia de Dente Incluso / Impactado",600,75,"dente"],
  ["Cirurgia","Exodontia de Resto Radicular",220,40,"dente"],
  ["Cirurgia","Apicectomia com Obturação Retrógrada",700,75,"dente"],
  ["Cirurgia","Alveoloplastia",350,45,"dente"],
  ["Cirurgia","Remoção de Cisto / Lesão Odontogênica",900,90,"geral"],
  ["Cirurgia","Frenectomia Labial",350,45,"geral"],
  ["Cirurgia","Exposição Cirúrgica de Dente Incluso",800,75,"dente"],
  ["Cirurgia","Drenagem de Abscesso",250,30,"geral"],
  ["Cirurgia","Remoção de Sutura",60,15,"geral"],
  ["Endodontia","Pulpotomia",200,40,"dente"],
  ["Endodontia","Pulpectomia (Urgência Endodôntica)",250,45,"dente"],
  ["Endodontia","Curativo de Demora / Medicação Intracanal",120,30,"dente"],
  ["Endodontia","Remoção de Pino / Núcleo Intrarradicular",300,45,"dente"],
  ["Periodontia","Aumento de Coroa Clínica",600,75,"dente"],
  ["Periodontia","Cunha Distal",450,60,"dente"],
  ["Periodontia","Gengivectomia",450,50,"dente"],
  ["Periodontia","Cobertura de Recessão Gengival",800,90,"dente"],
  ["Periodontia","Manutenção Periodontal",200,40,"geral"],
  ["Periodontia","Controle de Biofilme / Orientação de Higiene",100,30,"geral"],
  ["Ortodontia","Aparelho Ortodôntico Estético (Cerâmico / Safira)",1800,90,"arcada"],
  ["Ortodontia","Alinhadores Transparentes (planejamento + 1ª etapa)",3500,60,"arcada"],
  ["Ortodontia","Colagem / Recolagem de Braquete",80,20,"dente"],
  ["Ortodontia","Remoção do Aparelho Ortodôntico",250,45,"arcada"],
  ["Ortodontia","Expansor Palatino / Disjuntor",900,60,"arcada"],
  ["Ortodontia","Ajuste de Contenção",80,20,"arcada"],
  ["Prótese","Coroa Provisória",150,45,"dente"],
  ["Prótese","Núcleo Metálico Fundido",350,60,"dente"],
  ["Prótese","Coroa de Zircônia",1400,90,"dente"],
  ["Prótese","Faceta / Laminado de Porcelana",1500,90,"dente"],
  ["Prótese","Prótese Fixa (ponte) — por elemento",1000,90,"dente"],
  ["Prótese","Reembasamento de Prótese (por arcada)",300,45,"arcada"],
  ["Prótese","Conserto de Prótese (por arcada)",180,40,"arcada"],
  ["Implantodontia","Implante Unitário (cirurgia)",2800,90,"dente"],
  ["Implantodontia","Enxerto Ósseo / Biomaterial",1800,75,"dente"],
  ["Implantodontia","Levantamento de Seio Maxilar",3500,120,"geral"],
  ["Implantodontia","Mini-implante",1500,60,"dente"],
  ["Implantodontia","Protocolo sobre Implantes (por arcada)",12000,180,"arcada"],
  ["Implantodontia","Reabertura e Instalação de Cicatrizador",350,30,"dente"],
  ["Implantodontia","Manutenção de Implante",250,40,"dente"],
  ["Odontopediatria","Consulta e Condicionamento Odontopediátrico",150,30,"geral"],
  ["Odontopediatria","Aplicação Tópica de Flúor",90,20,"geral"],
  ["Odontopediatria","Selante de Fóssulas e Fissuras",120,20,"dente"],
  ["Odontopediatria","Restauração em Dente Decíduo",140,30,"dente"],
  ["Odontopediatria","Pulpotomia em Dente Decíduo",220,40,"dente"],
  ["Odontopediatria","Exodontia de Dente Decíduo",120,20,"dente"],
  ["Odontopediatria","Mantenedor de Espaço",450,45,"arcada"],
  ["Odontopediatria","Profilaxia Infantil",100,25,"geral"],
  ["Harmonização Orofacial (HOF)","Toxina Botulínica — Terço Superior",1200,40,"geral"],
  ["Harmonização Orofacial (HOF)","Toxina Botulínica — Três Terços (Full Face)",2200,50,"geral"],
  ["Harmonização Orofacial (HOF)","Preenchimento Labial (Ácido Hialurônico)",1500,45,"geral"],
  ["Harmonização Orofacial (HOF)","Preenchimento de Sulco Nasogeniano",1400,45,"geral"],
  ["Harmonização Orofacial (HOF)","Preenchimento de Malar / Mento",1600,50,"geral"],
  ["Harmonização Orofacial (HOF)","Bioestimulador de Colágeno (por sessão)",2500,60,"geral"],
  ["Harmonização Orofacial (HOF)","Skinbooster (Hidratação Profunda)",1100,45,"geral"],
  ["Harmonização Orofacial (HOF)","Bichectomia",2000,60,"geral"],
  ["Harmonização Orofacial (HOF)","Fios de PDO (por região)",1800,60,"geral"],
  ["Harmonização Orofacial (HOF)","Enzimas para Papada (por sessão)",900,40,"geral"],
  ["Harmonização Orofacial (HOF)","Rinomodelação",1500,45,"geral"],
  ["Harmonização Orofacial (HOF)","PRF / PRP (agregados leucoplaquetários autólogos)",1000,60,"geral"],
  ["Estomatologia","Consulta Estomatológica / Exame de Mucosa",250,40,"geral"],
  ["Estomatologia","Biópsia Incisional",450,45,"geral"],
  ["Estomatologia","Citologia Esfoliativa",200,30,"geral"],
  ["Estomatologia","Laserterapia em Lesões Orais",300,30,"geral"],
  ["DTM e Dor Orofacial","Avaliação de DTM",250,45,"geral"],
  ["DTM e Dor Orofacial","Placa Miorrelaxante (Placa Oclusal)",900,60,"arcada"],
  ["DTM e Dor Orofacial","Ajuste de Placa Oclusal",100,25,"arcada"],
  ["DTM e Dor Orofacial","Fotobiomodulação / Laserterapia (por sessão)",180,30,"geral"],
  ["DTM e Dor Orofacial","Toxina Botulínica para Bruxismo (masseter)",1100,40,"geral"],
  ["Radiologia e Imaginologia","Radiografia Periapical",40,10,"dente"],
  ["Radiologia e Imaginologia","Radiografia Interproximal (Bite-wing)",50,10,"geral"],
  ["Radiologia e Imaginologia","Radiografia Panorâmica",120,15,"geral"],
  ["Radiologia e Imaginologia","Telerradiografia + Traçado Cefalométrico",180,20,"geral"],
  ["Radiologia e Imaginologia","Tomografia Computadorizada (Cone Beam)",350,20,"geral"],
  ["Radiologia e Imaginologia","Escaneamento Intraoral",200,20,"geral"],
  ["Odontogeriatria","Avaliação Odontogeriátrica",200,40,"geral"],
  ["Odontogeriatria","Higienização de Prótese + Orientação",100,30,"geral"],
  ["Odontogeriatria","Atendimento Domiciliar (visita)",400,60,"geral"],
  ["Odontologia Hospitalar","Avaliação Odontológica Hospitalar (à beira do leito)",350,45,"geral"],
  ["Odontologia Hospitalar","Higiene Oral em Paciente Internado",200,30,"geral"],
  ["Odontologia Hospitalar","Adequação do Meio Bucal (pré-cirúrgico / oncológico)",500,60,"geral"],
  ["Odontologia do Esporte","Protetor Bucal Esportivo Personalizado",350,45,"arcada"],
  ["Odontologia do Esporte","Avaliação Odontológica do Atleta",250,40,"geral"],
  ["Odontologia do Trabalho","Exame Odontológico Ocupacional",150,30,"geral"],
  ["Odontologia do Trabalho","Atestado de Saúde Bucal (admissional / periódico)",100,20,"geral"],
  ["Odontologia Legal","Perícia / Laudo Odontolegal",900,90,"geral"],
  ["Odontologia Legal","Parecer Técnico",500,60,"geral"],
  ["Odontologia Legal","Relatório / Documentação Odontolegal",300,40,"geral"],
  ["Pacientes com Necessidades Especiais","Consulta e Condicionamento (PNE)",250,60,"geral"],
  ["Pacientes com Necessidades Especiais","Atendimento sob Sedação Consciente",900,90,"geral"],
  ["Pacientes com Necessidades Especiais","Profilaxia / Higiene (PNE)",180,45,"geral"],
  ["Ortopedia Funcional dos Maxilares","Avaliação Ortopédica Funcional",250,45,"geral"],
  ["Ortopedia Funcional dos Maxilares","Aparelho Ortopédico Funcional",1200,60,"arcada"],
  ["Ortopedia Funcional dos Maxilares","Ativação / Ajuste de Aparelho Ortopédico",120,25,"arcada"],
  ["Patologia Oral e Maxilofacial","Biópsia de Lesão",450,45,"geral"],
  ["Patologia Oral e Maxilofacial","Análise Histopatológica (laudo)",350,20,"geral"],
  ["Patologia Oral e Maxilofacial","Acompanhamento de Lesão (proservação)",150,30,"geral"],
  ["Prótese Bucomaxilofacial","Prótese Obturadora (palato)",3000,120,"arcada"],
  ["Prótese Bucomaxilofacial","Obturador Provisório / Cirúrgico",1200,75,"arcada"],
  ["Prótese Bucomaxilofacial","Prótese Facial / Epítese",4500,150,"geral"],
  ["Saúde Coletiva","Palestra / Ação Educativa em Saúde Bucal",300,60,"geral"],
  ["Saúde Coletiva","Triagem / Levantamento Epidemiológico",150,30,"geral"],
  ["Saúde Coletiva","Escovação Supervisionada / Orientação de Higiene",80,20,"geral"],
  ["Acupuntura","Sessão de Acupuntura (DTM / dor orofacial)",180,40,"geral"],
  ["Acupuntura","Auriculoterapia",120,30,"geral"],
  ["Homeopatia","Consulta Homeopática",220,45,"geral"],
  ["Homeopatia","Retorno / Acompanhamento Homeopático",120,30,"geral"]
];
function criarGrupo(nome,planoOrdem,permiteDenteAusente){ return {id:uid(), nome, planoOrdem:(planoOrdem===undefined?null:planoOrdem), permiteDenteAusente:!!permiteDenteAusente}; }
function nomesGrupos(){ ensureProcedimentos(); return state.grupos.map(g=>g.nome); }
function seedProcedimentos(){
  return [
    {id:uid(),especialidade:'Dentística',nome:'Restauração em Resina Composta (1 face)',valor:150,tempoMin:30,escopo:'dente'},
    {id:uid(),especialidade:'Dentística',nome:'Restauração em Resina Composta (2 faces)',valor:200,tempoMin:45,escopo:'dente'},
    {id:uid(),especialidade:'Dentística',nome:'Clareamento Dental (por arcada)',valor:350,tempoMin:60,escopo:'arcada'},
    {id:uid(),especialidade:'Dentística',nome:'Faceta de Resina Direta',valor:400,tempoMin:90,escopo:'dente'},
    {id:uid(),especialidade:'Cirurgia',nome:'Extração Dentária Simples',valor:180,tempoMin:30,escopo:'dente'},
    {id:uid(),especialidade:'Cirurgia',nome:'Extração de Terceiro Molar (Siso)',valor:450,tempoMin:60,escopo:'dente'},
    {id:uid(),especialidade:'Cirurgia',nome:'Biópsia Oral',valor:300,tempoMin:40,escopo:'dente'},
    {id:uid(),especialidade:'Cirurgia',nome:'Frenectomia Lingual',valor:350,tempoMin:45,escopo:'dente'},
    {id:uid(),especialidade:'Endodontia',nome:'Tratamento de Canal - Unirradicular',valor:500,tempoMin:60,escopo:'dente'},
    {id:uid(),especialidade:'Endodontia',nome:'Tratamento de Canal - Birradicular',valor:650,tempoMin:75,escopo:'dente'},
    {id:uid(),especialidade:'Endodontia',nome:'Tratamento de Canal - Multirradicular',valor:800,tempoMin:90,escopo:'dente'},
    {id:uid(),especialidade:'Endodontia',nome:'Retratamento Endodôntico',valor:900,tempoMin:90,escopo:'dente'},
    {id:uid(),especialidade:'Periodontia',nome:'Profilaxia / Limpeza (por arcada)',valor:120,tempoMin:30,escopo:'arcada'},
    {id:uid(),especialidade:'Periodontia',nome:'Raspagem e Alisamento Radicular (por arcada)',valor:220,tempoMin:50,escopo:'arcada'},
    {id:uid(),especialidade:'Periodontia',nome:'Profilaxia + Raspagem e Alisamento Radicular (por arcada)',valor:300,tempoMin:70,escopo:'arcada'},
    {id:uid(),especialidade:'Periodontia',nome:'Cirurgia Periodontal (Gengivoplastia)',valor:500,tempoMin:60,escopo:'dente'},
    {id:uid(),especialidade:'Periodontia',nome:'Enxerto Gengival',valor:700,tempoMin:90,escopo:'dente'},
    {id:uid(),especialidade:'Ortodontia',nome:'Instalação de Aparelho Ortodôntico Fixo',valor:1200,tempoMin:90,escopo:'arcada'},
    {id:uid(),especialidade:'Ortodontia',nome:'Manutenção Mensal do Aparelho',valor:150,tempoMin:30,escopo:'arcada'},
    {id:uid(),especialidade:'Ortodontia',nome:'Instalação de Contenção Ortodôntica',valor:300,tempoMin:40,escopo:'arcada'},
    {id:uid(),especialidade:'Ortodontia',nome:'Documentação Ortodôntica (fotos/moldagem/RX)',valor:250,tempoMin:45,escopo:'arcada'},
    {id:uid(),especialidade:'Prótese',nome:'Prótese Total Removível (por arcada)',valor:1500,tempoMin:120,escopo:'arcada'},
    {id:uid(),especialidade:'Prótese',nome:'Prótese Parcial Removível (por arcada)',valor:1200,tempoMin:90,escopo:'arcada'},
    {id:uid(),especialidade:'Prótese',nome:'Coroa Protética em Porcelana',valor:900,tempoMin:90,escopo:'dente'},
    {id:uid(),especialidade:'Prótese',nome:'Prótese sobre Implante',valor:2000,tempoMin:120,escopo:'dente'},
  ];
}
function ensureProcedimentos(){
  if(NUVEM && !(currentUser() && permsDe(currentUser()).procedimentos)) return;
  let mudou=false;
  state.meta=state.meta||{};
  if(!state.procedimentos || !state.procedimentos.length){ state.procedimentos=seedProcedimentos(); mudou=true; }
  state.procedimentos.forEach(pr=>{ if(!pr.escopo){ pr.escopo='dente'; mudou=true; } });
  if(!Array.isArray(state.grupos)){ state.grupos=[]; mudou=true; }
  if((state.meta.catalogoVersao||1)<2){
    GRUPOS_PADRAO.forEach(([nome,ord,aus])=>{ if(!state.grupos.some(g=>normTxt(g.nome)===normTxt(nome))) state.grupos.push(criarGrupo(nome,ord,aus)); });
    const existentes=new Set(state.procedimentos.map(pr=>normTxt(pr.nome)));
    PROCS_V2.forEach(([grupo,nome,valor,tempoMin,escopo])=>{
      if(!existentes.has(normTxt(nome))){ state.procedimentos.push({id:uid(),especialidade:grupo,nome,valor,tempoMin,escopo}); existentes.add(normTxt(nome)); }
    });
    state.meta.catalogoVersao=2; mudou=true;
  }
  state.procedimentos.forEach(pr=>{ if(!state.grupos.some(g=>g.nome===pr.especialidade)){ state.grupos.push(criarGrupo(pr.especialidade,null,false)); mudou=true; } });
  if(mudou) saveData();
}
function fmtMoney(v){ return 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function tipoLabel(t){ return {master:'Master',administrativo:'Administrativo',dentista:'Dentista',recepcionista:'Recepcionista'}[t]||t; }
function badgeClass(t){ return {master:'b-master',administrativo:'b-adm',dentista:'b-dent',recepcionista:'b-recep'}[t]||''; }


// =====================================================================
// NUVEM: login (e-mail/senha e Google), primeiro acesso e sincronização
// =====================================================================
let nuvemAcesso=null, nuvemMsg='', nuvemErro='', nuvemInfo='', nuvemModo='entrar', nuvemFluxo=0;
function normEmail(e){ return String(e||'').trim().toLowerCase(); }
function emailValido(e){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
const MQ_CEL=window.matchMedia?window.matchMedia('(max-width: 820px)'):{matches:false};
const MODULOS_CELULAR=['agenda','financeiro'];
function modoCelular(){ return !!MQ_CEL.matches; }
try{ MQ_CEL.addEventListener('change',()=>{ if(view==='home') render(); }); }catch(e){}

const G_ICON='<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function telaNuvem(conteudo){
  return `<div class="login-wrap"><div class="login-card">
    <div class="login-marca"><span class="login-logo">🦷</span><div><div class="login-nome">OdontoGestão</div><div class="muted">Sistema da clínica</div></div></div>
    ${conteudo}</div></div>`;
}
function msgsNuvem(){
  return `${nuvemErro?`<div class="login-erro">${esc(nuvemErro)}</div>`:''}${nuvemInfo?`<div class="login-info">${esc(nuvemInfo)}</div>`:''}`;
}
function renderTelaNuvem(){
  if(view==='nuvemCarregando') return telaNuvem(`<p class="muted" style="text-align:center;margin:24px 0">${esc(nuvemMsg||'Carregando…')}</p>`);
  if(view==='nuvemVerificar'){
    const em=Nuvem.meuEmail();
    return telaNuvem(`<h3>Confirme seu e-mail</h3>
      <p>Enviamos um link de confirmação para <strong>${esc(em)}</strong>. Abra seu e-mail (veja também o Spam), clique no link e volte aqui.</p>
      ${msgsNuvem()}
      <button class="btn-p login-btn" id="nvJaConfirmei">Já confirmei</button>
      <div class="login-links"><button class="lnk" id="nvReenviar">Reenviar e-mail</button><button class="lnk" id="nvSair">Usar outra conta</button></div>`);
  }
  if(view==='nuvemSemAcesso'){
    const em=Nuvem.meuEmail();
    return telaNuvem(`<h3>Acesso não liberado</h3>
      ${nuvemErro?msgsNuvem():`<p>O e-mail <strong>${esc(em)}</strong> não está cadastrado neste sistema.</p><p class="muted">Peça ao responsável pela clínica para cadastrar este e-mail em <strong>Usuários</strong>. Depois é só entrar de novo.</p>`}
      <button class="btn-p login-btn" id="nvTentar">Tentar de novo</button>
      <div class="login-links"><button class="lnk" id="nvSair">Usar outra conta</button></div>`);
  }
  if(view==='nuvemPerfil'){
    const em=Nuvem.meuEmail(); const au=Nuvem.usuarioAuth();
    return telaNuvem(`<h3>Seus dados</h3>
      <p class="muted">Você é o responsável (Master) do sistema. Complete seu cadastro.</p>
      <form id="fPerfilMaster">
        <label>E-mail de acesso</label><input value="${esc(em)}" disabled>
        <label>Nome completo</label><input id="pmNome" value="${esc((au&&au.displayName)||'')}" required>
        <label>Telefone / WhatsApp</label><input id="pmTel" required>
        ${msgsNuvem()}
        <button class="btn-p login-btn">Concluir</button>
      </form>`);
  }
  // nuvemLogin
  if(nuvemModo==='esqueci') return telaNuvem(`<h3>Esqueci minha senha</h3>
    <p class="muted">Digite seu e-mail. Enviaremos um link para você criar uma nova senha.</p>
    <form id="fNvEsqueci"><label>E-mail</label><input id="nvEmail" type="email" autocomplete="email" required>
    ${msgsNuvem()}<button class="btn-p login-btn">Enviar link</button></form>
    <div class="login-links"><button class="lnk" data-nvmodo="entrar">Voltar para o login</button></div>`);
  if(nuvemModo==='criar') return telaNuvem(`<h3>Primeiro acesso</h3>
    <p class="muted">Use o <strong>mesmo e-mail</strong> que a clínica cadastrou para você e escolha uma senha.</p>
    <form id="fNvCriar"><label>E-mail</label><input id="nvEmail" type="email" autocomplete="email" required>
    <label>Senha (mínimo 6 caracteres)</label><input id="nvSenha" type="password" autocomplete="new-password" required>
    <label>Repita a senha</label><input id="nvSenha2" type="password" autocomplete="new-password" required>
    ${msgsNuvem()}<button class="btn-p login-btn">Criar senha</button></form>
    <div class="login-links"><button class="lnk" data-nvmodo="entrar">Já tenho senha</button></div>`);
  return telaNuvem(`
    <button class="btn-google login-btn" id="nvGoogle">${G_ICON}<span>Entrar com Google</span></button>
    <div class="login-ou"><span>ou</span></div>
    <form id="fNvEntrar"><label>E-mail</label><input id="nvEmail" type="email" autocomplete="email" required>
    <label>Senha</label><input id="nvSenha" type="password" autocomplete="current-password" required>
    ${msgsNuvem()}<button class="btn-p login-btn">Entrar</button></form>
    <div class="login-links"><button class="lnk" data-nvmodo="esqueci">Esqueci minha senha</button><button class="lnk" data-nvmodo="criar">Primeiro acesso · criar senha</button></div>`);
}
function bindNuvemEvents(){
  const q=id=>document.getElementById(id);
  document.querySelectorAll('[data-nvmodo]').forEach(b=>b.addEventListener('click',()=>{ nuvemModo=b.getAttribute('data-nvmodo'); nuvemErro=''; nuvemInfo=''; render(); }));
  const ocupado=(form,on)=>{ if(form){ const b=form.querySelector('button.btn-p'); if(b) b.disabled=on; } };
  if(q('nvGoogle')) q('nvGoogle').addEventListener('click',async()=>{
    nuvemErro=''; nuvemInfo='';
    try{ await Nuvem.entrarGoogle(); }catch(e){ nuvemErro=Nuvem.mapErro(e); render(); }
  });
  const fE=q('fNvEntrar');
  if(fE) fE.addEventListener('submit',async ev=>{
    ev.preventDefault(); nuvemErro=''; nuvemInfo=''; ocupado(fE,true);
    try{ await Nuvem.entrarEmail(q('nvEmail').value,q('nvSenha').value); }
    catch(e){ ocupado(fE,false); nuvemErro=Nuvem.mapErro(e); render(); }
  });
  const fC=q('fNvCriar');
  if(fC) fC.addEventListener('submit',async ev=>{
    ev.preventDefault(); nuvemErro=''; nuvemInfo='';
    const em=normEmail(q('nvEmail').value), s1=q('nvSenha').value, s2=q('nvSenha2').value;
    if(!emailValido(em)){ nuvemErro='Digite um e-mail válido.'; render(); return; }
    if(s1.length<6){ nuvemErro='A senha precisa ter pelo menos 6 caracteres.'; render(); return; }
    if(s1!==s2){ nuvemErro='As duas senhas não conferem.'; render(); return; }
    ocupado(fC,true);
    try{ await Nuvem.criarConta(em,s1); }
    catch(e){ ocupado(fC,false); nuvemErro=Nuvem.mapErro(e); render(); }
  });
  const fR=q('fNvEsqueci');
  if(fR) fR.addEventListener('submit',async ev=>{
    ev.preventDefault(); nuvemErro=''; nuvemInfo='';
    const em=normEmail(q('nvEmail').value);
    try{ await Nuvem.redefinirSenha(em); nuvemModo='entrar'; nuvemInfo='Se este e-mail tiver cadastro, você vai receber o link em instantes (veja também o Spam).'; }
    catch(e){ nuvemErro=Nuvem.mapErro(e); }
    render();
  });
  if(q('nvJaConfirmei')) q('nvJaConfirmei').addEventListener('click',async()=>{
    nuvemErro=''; nuvemInfo='';
    try{ const ok=await Nuvem.verificarDeNovo(); if(ok) aoMudarLogin(Nuvem.usuarioAuth()); else { nuvemErro='Ainda não recebemos a confirmação. Clique no link do e-mail e tente de novo.'; render(); } }
    catch(e){ nuvemErro=Nuvem.mapErro(e); render(); }
  });
  if(q('nvReenviar')) q('nvReenviar').addEventListener('click',async()=>{
    nuvemErro=''; nuvemInfo='';
    try{ await Nuvem.reenviarVerificacao(); nuvemInfo='E-mail reenviado.'; }catch(e){ nuvemErro=Nuvem.mapErro(e); }
    render();
  });
  if(q('nvSair')) q('nvSair').addEventListener('click',()=>Nuvem.sair(true));
  if(q('nvTentar')) q('nvTentar').addEventListener('click',()=>{ nuvemErro=''; aoMudarLogin(Nuvem.usuarioAuth()); });
  const fP=q('fPerfilMaster');
  if(fP) fP.addEventListener('submit',ev=>{
    ev.preventDefault();
    const em=Nuvem.meuEmail();
    const u={id:nuvemAcesso.userId, tipo:'master', username:em.split('@')[0], nomeCompleto:q('pmNome').value.trim(),
      telefone:q('pmTel').value.trim(), email:em, cro:'', permissions:defaultPerms('master')};
    if(!u.nomeCompleto){ nuvemErro='Informe seu nome.'; render(); return; }
    state.users=state.users.filter(x=>x.id!==u.id && normEmail(x.email)!==em);
    state.users.unshift(u); session=u.id; saveData();
    try{ ensureProcedimentos(); }catch(e){ console.error(e); }
    nuvemErro=''; view='home'; currentTab=modoCelular()?'agenda':'dashboard'; render();
  });
}
async function bootNuvem(){
  view='nuvemCarregando'; nuvemMsg='Conectando…'; render();
  try{
    await Nuvem.iniciar({
      estado:()=>state, onAuth:aoMudarLogin, acessosDesejados,
      onErroLogin:m=>{ nuvemErro=m; if(view==='nuvemLogin') render(); },
      onRemoto:aoMudarRemoto, onStatus:atualizarStatusNuvem, onErro:aoErroNuvem,
      onAcessoMudou, onAlertaTamanho:l=>console.warn('Documentos perto do limite:',l),
    });
  }catch(e){
    console.error(e);
    document.getElementById('app').innerHTML=telaNuvem(`<h3>Sem conexão</h3><p>Não foi possível carregar o sistema. Verifique a internet e recarregue a página.</p><p class="muted">${esc(e.message||e)}</p><button class="btn-p login-btn" onclick="location.reload()">Recarregar</button>`);
  }
}
async function aoMudarLogin(u){
  const meu=++nuvemFluxo;
  if(!u){ session=null; nuvemAcesso=null; view='nuvemLogin'; render(); return; }
  if(!u.emailVerified){ view='nuvemVerificar'; render(); return; }
  view='nuvemCarregando'; nuvemMsg='Verificando acesso…'; nuvemErro=''; render();
  try{
    let ac=await Nuvem.carregarAcesso();
    if(!ac) ac=await Nuvem.criarDono();          // só dá certo para o e-mail do responsável (regras)
    if(meu!==nuvemFluxo) return;
    if(!ac || ac.ativo!==true){ nuvemErro=''; view='nuvemSemAcesso'; render(); return; }
    nuvemAcesso=ac; session=ac.userId;
    nuvemMsg='Carregando dados da clínica…'; render();
    const st=await Nuvem.conectar(ac);
    if(meu!==nuvemFluxo) return;
    state=st;
    ['users','patients','agendamentos','fluxoFinanceiro','despesasCatalogo','avisos','procedimentos','grupos'].forEach(k=>{ if(!Array.isArray(state[k])) state[k]=[]; });
    state.meta=state.meta||{};
    if(!state.clinic){
      if(ac.tipo!=='master'){ nuvemErro='A clínica ainda não foi configurada pelo responsável. Tente mais tarde.'; view='nuvemSemAcesso'; }
      else view='setupClinic';
    } else if(!currentUser()){
      if(ac.tipo==='master') view='nuvemPerfil';
      else { nuvemErro='Seu acesso existe, mas o cadastro de usuário não foi encontrado. Fale com o responsável pela clínica.'; view='nuvemSemAcesso'; }
    } else {
      try{ ensureProcedimentos(); }catch(e){ console.error(e); }
      view='home'; currentTab=modoCelular()?'agenda':'dashboard';
    }
    render();
  }catch(e){
    console.error(e);
    if(meu!==nuvemFluxo) return;
    nuvemErro='Não foi possível carregar: '+Nuvem.mapErro(e); view='nuvemSemAcesso'; render();
  }
}
function acessosDesejados(){
  const m=new Map();
  (state.users||[]).forEach(u=>{
    const e=normEmail(u.email); if(!e || !emailValido(e) || m.has(e)) return;
    m.set(e,{userId:u.id, tipo:u.tipo, perms:permsDe(u), ativo:true});
  });
  return m;
}
function podeAtualizarSozinho(){
  if(view!=='home') return false;
  if(document.querySelector('.modal-bg,.img-modal-bg')) return false;
  const a=document.activeElement;
  if(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
  if(document.querySelector('#app form')) return false;
  return true;
}
function aoMudarRemoto(){
  if(view!=='home') return;
  if(podeAtualizarSozinho()){ const y=window.scrollY; render(); window.scrollTo(0,y); return; }
  if(document.getElementById('pilulaAtualizar')) return;
  const b=document.createElement('button'); b.id='pilulaAtualizar'; b.className='pilula-atualizar';
  b.textContent='🔄 Há alterações de outro usuário — atualizar tela';
  b.addEventListener('click',()=>{ const y=window.scrollY; render(); window.scrollTo(0,y); });
  document.body.appendChild(b);
}
let ultimoStatusNuvem={p:0,on:true};
function textoStatusNuvem(){
  const {p,on}=ultimoStatusNuvem;
  if(!on) return ['📴 Sem internet — as alterações serão enviadas quando voltar','st-off'];
  if(p>0) return ['⏳ Salvando…','st-pend'];
  return ['☁️ Salvo na nuvem','st-ok'];
}
function atualizarStatusNuvem(p,on){
  ultimoStatusNuvem={p,on};
  const el=document.getElementById('nuvemStatus'); if(!el) return;
  const [t,c]=textoStatusNuvem(); el.textContent=t; el.className='nuvem-status '+c;
}
function statusNuvemHtml(){ if(!NUVEM) return ''; const [t,c]=textoStatusNuvem(); return `<span id="nuvemStatus" class="nuvem-status ${c}">${t}</span>`; }
let ultimoAvisoErro=0;
function aoErroNuvem(e){
  const c=e&&e.code;
  if(c==='permission-denied'){
    if(Date.now()-ultimoAvisoErro>3000){ ultimoAvisoErro=Date.now(); avisar('Você não tem permissão para fazer esta alteração. Ela foi desfeita.'); }
    return;
  }
  saveErro='não foi possível salvar na nuvem: '+Nuvem.mapErro(e)+'. Não feche o sistema e chame o suporte se continuar.';
  atualizarBannerSalvar();
}
function onAcessoMudou(novo,ant){
  if(novo && ant && novo.ativo===true && novo.tipo===ant.tipo && JSON.stringify(permsDe({tipo:novo.tipo,permissions:novo.perms}))===JSON.stringify(permsDe({tipo:ant.tipo,permissions:ant.perms}))){
    if(novo.userId!==session){ session=novo.userId; nuvemAcesso=novo; }
    return;
  }
  avisar('Seu acesso foi alterado pelo responsável. O sistema vai recarregar.');
  setTimeout(()=>location.reload(),2500);
}
function mostrarProgresso(titulo){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal"><p style="margin-top:0"><strong>${esc(titulo)}</strong></p><p class="muted" data-prog>Preparando…</p><p class="muted">Não feche esta janela.</p></div>`;
  document.body.appendChild(bg);
  const f=t=>{ const el=bg.querySelector('[data-prog]'); if(el) el.textContent=t; };
  f.fechar=()=>{ if(bg.parentNode) bg.parentNode.removeChild(bg); };
  return f;
}
async function restaurarBackupNuvem(header,imgs){
  const prog=mostrarProgresso('Importando backup para a nuvem');
  try{
    const meu=Nuvem.meuEmail();
    const novo=header.state;
    novo.users=(novo.users||[]).map(u=>{ const c=Object.assign({},u); delete c.senhaHash; delete c.senhaSalt; delete c.senhaIter; delete c.password; c.email=normEmail(c.email); return c; });
    let eu=novo.users.find(u=>u.email===meu) || novo.users.find(u=>u.tipo==='master');
    if(!eu){ const atual=currentUser(); eu=Object.assign({cro:'',telefone:''},atual||{id:session,nomeCompleto:meu,username:meu.split('@')[0]}); novo.users.unshift(eu); }
    eu.tipo='master'; eu.email=meu; eu.permissions=defaultPerms('master');
    const vistos=new Set([meu]);
    novo.users.forEach(u=>{ if(u===eu) return; if(u.email && (vistos.has(u.email) || !emailValido(u.email))) u.email=''; if(u.email) vistos.add(u.email); });
    await Nuvem.enviarImagensBackup(imgs,(i,n)=>prog(`Enviando radiografias: ${i} de ${n}`));
    prog('Enviando os dados…');
    state=novo; state.meta=state.meta||{};
    ['users','patients','agendamentos','fluxoFinanceiro','despesasCatalogo','avisos','procedimentos','grupos'].forEach(k=>{ if(!Array.isArray(state[k])) state[k]=[]; });
    session=eu.id;
    try{ ensureProcedimentos(); }catch(e){ console.error(e); }
    saveData();
    await Nuvem.aguardarEnvio();
    await Nuvem.apagarImagensExceto(new Set(imgs.map(i=>i.id)));
    prog.fechar();
    patientDetailId=null; currentTab='dashboard'; view='home'; render();
    const semEmail=state.users.filter(u=>!u.email).length;
    avisar('Backup importado para a nuvem.'+(semEmail?` ${semEmail} usuário(s) ficaram sem e-mail de acesso: cadastre o e-mail deles em Usuários para que possam entrar.`:' Confira os e-mails de acesso em Usuários.'));
  }catch(e){ prog.fechar(); throw e; }
}

let printSheetHtml='';
function render(){
  const app=document.getElementById('app');
  printSheetHtml='';
  const pil=document.getElementById('pilulaAtualizar'); if(pil) pil.remove();
  if(NUVEM && view.indexOf('nuvem')===0) app.innerHTML=renderTelaNuvem();
  else if(view==='setupClinic') app.innerHTML=renderSetupClinic();
  else if(view==='setupUser') app.innerHTML=renderSetupUser();
  else if(view==='login') app.innerHTML=renderLogin();
  else app.innerHTML=renderApp();
  const pa=document.getElementById('printArea'); if(pa) pa.innerHTML=printSheetHtml;
  if(NUVEM) bindNuvemEvents();
  bindEvents();
  hidratarImagens();
  if(document.getElementById('storageInfo')) atualizarInfoArmazenamento();
}

function renderSetupClinic(){
  return `<div class="wrap"><div class="card center">
  <h2>Cadastro da Clínica</h2>
  <p class="muted">Antes de começar, informe os dados da clínica. Eles servirão de base para documentos futuros.</p>
  <form id="fClinic">
    <label>Nome da clínica</label><input name="nome" required>
    <label>Endereço</label><input name="endereco" required>
    <label>Telefone</label><input name="telefone" required>
    <label>Email</label><input type="email" name="email" required>
    <button class="btn-p" style="width:100%;margin-top:16px">Salvar e continuar</button>
  </form>
  ${NUVEM?`<div class="login-ou"><span>ou</span></div>
  <p class="muted">Já usava a versão anterior neste computador? Exporte o backup nela (Configurações → Backup) e importe aqui: pacientes, agenda, financeiro e radiografias vão para a nuvem.</p>
  <button id="btnImportBackup" class="btn-s" style="width:100%">⬆️ Importar backup da versão anterior</button>
  <input type="file" id="fileImportBackup" accept=".odb" style="display:none">`:''}
  </div></div>`;
}

function renderSetupUser(){
  return `<div class="wrap"><div class="card center">
  <h2>Criar usuário Master</h2>
  <p class="muted">Este será o administrador com acesso total ao sistema.</p>
  ${userFormFields('master', {}, true)}
  <button id="btnCreateMaster" class="btn-p" style="width:100%;margin-top:16px">Criar usuário Master</button>
  </div></div>`;
}

function renderLogin(){
  return `<div class="wrap"><div class="card center">
  <h2>${esc(state.clinic.nome)}</h2>
  <p class="muted">Acesse o sistema</p>
  <form id="fLogin">
    <label>Usuário</label><input name="username" required>
    <label>Senha</label><input type="password" name="password" required>
    <div id="loginErr" style="color:var(--danger);font-size:13px;margin-top:6px"></div>
    <button class="btn-p" style="width:100%;margin-top:16px">Entrar</button>
  </form>
  </div></div>`;
}

function currentUser(){ return state.users.find(u=>u.id===session); }

function menuItems(){
  const u=currentUser(); const p=Object.assign(defaultPerms(u.tipo), u.permissions||{});
  return [
    {id:'dashboard', label:'🏠 Dashboard', enabled:true},
    {id:'usuarios', label:'👤 Usuários', enabled:p.usuarios},
    {id:'pacientes', label:'🧑‍⚕️ Pacientes', enabled:p.pacientes},
    {id:'agenda', label:'📅 Agenda', enabled:true},
    {id:'tabelavalores', label:'💲 Tabela de Valores', enabled:true},
    {id:'financeiro', label:'💰 Financeiro', enabled:p.financeiro},
    {id:'estoque', label:'📦 Estoque', enabled:true, stub:true},
    {id:'relatorios', label:'📊 Relatórios', enabled:true},
    {id:'configuracoes', label:'⚙️ Configurações', enabled:true},
  ];
}

function renderApp(){
  const u=currentUser();
  if(!u){
    if(NUVEM){ view=(nuvemAcesso&&nuvemAcesso.tipo==='master')?'nuvemPerfil':'nuvemSemAcesso'; return renderTelaNuvem(); }
    session=null; sessionStorage.removeItem('odontoSession'); view='login'; return renderLogin();
  }
  const cel=modoCelular();
  const items=menuItems().filter(i=>i.enabled && (!cel || MODULOS_CELULAR.includes(i.id)));
  if(!items.find(i=>i.id===currentTab)) currentTab=items[0].id;
  const sidebar=items.map(i=>`<button data-tab="${i.id}" class="${currentTab===i.id?'active':''} ${i.stub?'stub':''}">${i.label}</button>`).join('');
  let content='';
  if(currentTab==='dashboard') content=renderDashboard();
  else if(currentTab==='usuarios') content=renderUsuarios();
  else if(currentTab==='pacientes') content = patientDetailId ? renderPatientDetail(patientDetailId) : renderPacientes();
  else if(currentTab==='financeiro') content=renderFinanceiroPrincipal();
  else if(currentTab==='agenda') content=renderAgendaPrincipal();
  else if(currentTab==='tabelavalores') content=renderTabelaValores();
  else if(currentTab==='relatorios') content=renderRelatorios();
  else if(currentTab==='configuracoes') content=renderConfiguracoesPrincipal();
  else content=renderStub(items.find(i=>i.id===currentTab)?.label||'');

  const demo=(!NUVEM && /^https?:/.test(location.protocol))?'<div class="demo-banner">⚠️ Modo demonstração: a nuvem ainda não foi configurada (firebase-config.js). Os dados ficam só neste navegador.</div>':'';
  if(cel){
    const icone={agenda:'📅',financeiro:'💰'};
    const nav=items.map(i=>`<button data-tab="${i.id}" class="${currentTab===i.id?'active':''}"><span class="cel-ico">${icone[i.id]||'•'}</span>${esc(i.label.replace(/^\S+\s/,''))}</button>`).join('');
    return `<div class="cel-layout">${demo}
      <div class="topbar cel-top">
        <div class="cel-quem"><strong>${esc(state.clinic.nome)}</strong><div class="muted">${esc(u.nomeCompleto)} · ${tipoLabel(u.tipo)}</div></div>
        <button id="btnLogout" class="btn-s">Sair</button>
      </div>
      ${NUVEM?`<div class="cel-status">${statusNuvemHtml()}</div>`:''}
      <div class="wrap">${currentTab==='agenda'?avisosHtml(u):''}${content}</div>
      <nav class="cel-nav">${nav}</nav>
    </div>`;
  }
  return `${demo}<div class="layout">
    <div class="sidebar">
      <div style="padding:8px 12px 16px;font-weight:700">🦷 OdontoGestão</div>
      ${sidebar}
      <div style="padding:16px 12px 0;font-size:11px;color:var(--muted)">Versão ${APP_VERSION}</div>
    </div>
    <div class="main">
      <div class="topbar">
        <div><strong>${esc(state.clinic.nome)}</strong></div>
        <div class="topbar-dir">${statusNuvemHtml()} ${esc(u.nomeCompleto)} <span class="badge ${badgeClass(u.tipo)}">${tipoLabel(u.tipo)}</span>
          ${bellHtml(u)}<button id="btnLogout" class="btn-s" style="margin-left:10px">Sair</button></div>
      </div>
      <div class="wrap">${lembreteBackupHtml()}${content}</div>
    </div>
  </div>`;
}

function renderStub(label){
  return `<div class="card"><h2>${label}</h2><p class="muted">⚙️ Esta ferramenta ainda está em fase de produção. Em breve estará disponível.</p></div>`;
}

function nomeSaudacao(n){ const t=(n||'').trim().split(/\s+/); return (/^(dra?|prof|profa)\.?$/i.test(t[0]) && t[1]) ? t[0]+' '+t[1] : (t[0]||''); }
function renderDashboard(){
  const u=currentUser(), perms=permsDe(u), hoje=hojeISO(), agora=agoraHHMM();
  const agHoje=(state.agendamentos||[]).filter(a=>a.data===hoje && statusAg(a)!=='cancelado').sort((x,y)=>x.horario.localeCompare(y.horario));
  const prox=agHoje.find(a=>a.horario>=agora && statusAg(a)!=='faltou');
  const cards=[];
  const card=(rot,num,sub,go,ruim)=>`<button class="dash-card" data-dashgo="${go}"><div class="dash-rot">${rot}</div><div class="dash-num" style="color:${ruim?'#dc2626':'#16a34a'}">${num}</div><div class="dash-sub">${sub}</div></button>`;
  cards.push(card('Atendimentos hoje',agHoje.length,prox?'Próximo: '+esc(prox.horario)+' — '+esc(prox.pacienteNome):(agHoje.length?'Todos os de hoje já passaram':'Nenhum agendado'),'agenda',false));
  if(perms.pacientes){
    let evs=[]; state.patients.forEach(p=>(p.evolucao||[]).forEach(e=>{ if(!e.confirmado && (e.data<hoje || (e.data===hoje && (e.hora||'')<=agora))) evs.push(e); }));
    if(u.tipo==='dentista') evs=evs.filter(e=>e.dentistaNome===u.nomeCompleto);
    cards.push(card('Evoluções a confirmar',evs.length,evs.length?(u.tipo==='dentista'?'suas, aguardando confirmação':'aguardando confirmação do dentista'):'prontuários em dia','rel:evolpendentes',evs.length>0));
    let n=0, val=0; state.patients.forEach(p=>(p.orcamentos||[]).forEach(o=>{ if(o.status!=='aprovado' && diasEntre(o.data,hoje)>=7){ n++; val+=o.total||0; } }));
    cards.push(card('Orçamentos sem resposta (+7 dias)',n,n?fmtMoney(val)+' parados':'nenhum parado','rel:orcpendentes',n>0));
  }
  if(perms.financeiro){
    ensureFluxoTipos();
    const venc=(state.fluxoFinanceiro||[]).filter(e=>e.tipo==='receita' && !e.confirmado && e.vencimento && e.vencimento<hoje);
    cards.push(card('Parcelas vencidas',venc.length,venc.length?fmtMoney(venc.reduce((sum,e)=>sum+(e.valor||0),0))+' em atraso':'nenhuma em atraso','rel:inadimplencia',venc.length>0));
  }
  const lista=agHoje.map(a=>`<div class="ag-card" style="margin-bottom:6px"><div class="ag-time">${esc(a.horario)}</div><div class="ag-info"><div class="ag-pac">${esc(a.pacienteNome)} ${agBadge(a)}</div><div class="ag-proc">${esc(a.procedimentoNome)}</div></div><span class="ag-dentista" style="background:${dentistColor(a.dentistaId)[0]};color:${dentistColor(a.dentistaId)[1]}">${esc(a.dentistaNome)}</span></div>`).join('');
  let dataFmt=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'}); dataFmt=dataFmt.charAt(0).toUpperCase()+dataFmt.slice(1);
  return `<div class="card"><h2 style="margin:0">Olá, ${esc(nomeSaudacao(u.nomeCompleto))}</h2><p class="muted" style="margin:4px 0 0">${dataFmt}</p></div>
  ${avisosHtml(u)}
  <div class="dash-grid">${cards.join('')}</div>
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px"><h3 style="margin:0">Agenda de hoje</h3><button class="btn-s" data-dashgo="agenda">Abrir agenda</button></div>
  ${lista||'<p class="muted">Nenhum atendimento agendado para hoje.</p>'}</div>
  <p class="muted">${state.patients.length} paciente(s) · ${state.users.length} usuário(s) cadastrado(s)</p>`;
}

function userFormFields(tipo, u, isNew){
  u=u||{};
  return `<div id="userFieldsWrap">
  ${isNew?`<label>Tipo de usuário</label>
  <select id="fTipo">
    <option value="administrativo" ${tipo==='administrativo'?'selected':''}>Administrativo</option>
    <option value="dentista" ${tipo==='dentista'?'selected':''}>Dentista</option>
    <option value="recepcionista" ${tipo==='recepcionista'?'selected':''}>Recepcionista</option>
  </select>`:''}
  ${NUVEM?'':`<div class="row">
    <div><label>Nome de usuário</label><input id="fUsername" value="${esc(u.username)}" required></div>
    <div><label>Senha${u.id?' (deixe em branco para manter)':' (mínimo 6 caracteres)'}</label><input id="fPassword" type="password" autocomplete="new-password" ${u.id?'':'required'}></div>
  </div>`}
  <label>Nome completo</label><input id="fNomeCompleto" value="${esc(u.nomeCompleto)}" required>
  <div class="row">
    <div><label>Telefone / WhatsApp</label><input id="fTelefone" value="${esc(u.telefone)}" required></div>
    <div><label>${NUVEM?'E-mail de acesso (login)':'Email'}</label><input id="fEmail" type="email" value="${esc(u.email)}" required ${NUVEM&&emailTravado(u)?'readonly title="Somente o Master altera o e-mail de acesso"':''}></div>
  </div>
  ${NUVEM?'<p class="muted" style="margin:6px 0 0">A pessoa entra com este e-mail: pelo botão <strong>Entrar com Google</strong> (se for uma conta Google) ou em <strong>Primeiro acesso · criar senha</strong>.</p>':''}
  <div id="croWrap" style="display:${tipo==='dentista'?'block':'none'}">
    <label>CRO (ex: 10101-AM)</label><input id="fCro" value="${esc(u.cro)}">
  </div>
  </div>`;
}

// Na nuvem: o e-mail é o login. Ninguém troca o próprio; só o Master troca o de quem já tem.
function emailTravado(u){ if(!u || !u.id) return false; const eu=currentUser(); if(!eu) return false; if(u.id===eu.id) return true; return eu.tipo!=='master' && !!normEmail(u.email); }
// Só o Master edita o Master; ninguém exclui a si mesmo nem o Master.
function podeEditarUsuario(alvo){ const eu=currentUser(); return !!eu && (alvo.tipo!=='master' || eu.tipo==='master'); }
function podeExcluirUsuario(alvo){ const eu=currentUser(); return !!eu && alvo.tipo!=='master' && alvo.id!==eu.id; }
function renderUsuarios(){
  const rows=state.users.map(u=>`<tr>
    <td>${esc(u.nomeCompleto)}<div class="muted">${NUVEM?(u.email?esc(u.email):'<span style="color:#dc2626">sem e-mail de acesso</span>'):'@'+esc(u.username)}</div></td>
    <td><span class="badge ${badgeClass(u.tipo)}">${tipoLabel(u.tipo)}</span></td>
    <td>${esc(u.telefone)}</td>
    <td>${esc(u.cro||'-')}</td>
    <td class="actions">
      ${podeEditarUsuario(u)?`<button class="btn-s" data-edituser="${u.id}">Editar</button>`:'<span class="muted">Somente o Master</span>'}
      ${podeExcluirUsuario(u)?`<button class="btn-d" data-deluser="${u.id}">Excluir</button>`:''}
    </td></tr>`).join('');
  return `<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center"><h2>Usuários</h2>
  <button id="btnNewUser" class="btn-p">+ Novo usuário</button></div>
  ${NUVEM?'<p class="muted" style="margin-top:0">Para dar acesso a alguém, cadastre o usuário com o e-mail dele. Para tirar o acesso, exclua o usuário.</p>':''}
  <div class="overflow"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Telefone</th><th>CRO</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="5" class="muted">Nenhum usuário cadastrado</td></tr>'}</tbody></table></div>
  </div>
  <div id="userFormArea"></div>`;
}

function openUserForm(u){
  if(u && !podeEditarUsuario(u)){ avisar('Somente o usuário Master pode editar o Master.'); return; }
  editingUserId = u? u.id : null;
  const isNew=!u;
  const tipo = u? u.tipo : 'administrativo';
  const perms = u? Object.assign(defaultPerms(u.tipo), u.permissions||{}) : defaultPerms(tipo);
  const isMaster = currentUser().tipo==='master';
  document.getElementById('userFormArea').innerHTML = `<div class="card">
    <h3>${isNew?'Novo usuário':'Editar usuário'}</h3>
    <form id="fUser">${userFormFields(tipo, u||{}, isNew)}
    ${isMaster && u ? `<label>Permissões (editável pelo Master)</label>
      <div class="perm">
        <label><input type="checkbox" id="pUsuarios" ${perms.usuarios?'checked':''}> Usuários</label>
        <label><input type="checkbox" id="pPacientes" ${perms.pacientes?'checked':''}> Pacientes</label>
        <label><input type="checkbox" id="pClinica" ${perms.clinica?'checked':''}> Editar Clínica</label>
        <label><input type="checkbox" id="pProcedimentos" ${perms.procedimentos?'checked':''}> Procedimentos</label>
        <label><input type="checkbox" id="pFinanceiro" ${perms.financeiro?'checked':''}> Financeiro</label>
      </div>`:''}
    <div style="margin-top:16px"><button class="btn-p">Salvar</button> <button type="button" id="btnCancelUser" class="btn-s">Cancelar</button></div>
    </form></div>`;
  const tipoSel=document.getElementById('fTipo');
  if(tipoSel) tipoSel.addEventListener('change',e=>{
    document.getElementById('croWrap').style.display = e.target.value==='dentista' ? 'block':'none';
  });
  document.getElementById('btnCancelUser').addEventListener('click',()=>{ document.getElementById('userFormArea').innerHTML=''; });
  document.getElementById('fUser').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const tipoVal = isNew ? document.getElementById('fTipo').value : u.tipo;
    const cro = document.getElementById('fCro') ? document.getElementById('fCro').value.trim() : '';
    if(tipoVal==='dentista' && !/^\d{3,6}-[A-Za-z]{2}$/.test(cro)){
      avisar('Informe um CRO válido, ex: 10101-AM'); return;
    }
    const data = {
      id: isNew? uid() : u.id,
      tipo: tipoVal,
      username: NUVEM ? ((u&&u.username)||normEmail(document.getElementById('fEmail').value).split('@')[0]) : document.getElementById('fUsername').value.trim(),
      nomeCompleto: document.getElementById('fNomeCompleto').value.trim(),
      telefone: document.getElementById('fTelefone').value.trim(),
      email: document.getElementById('fEmail').value.trim(),
      cro: tipoVal==='dentista'? cro : '',
      permissions: isNew ? defaultPerms(tipoVal) : (isMaster ? {
        usuarios: document.getElementById('pUsuarios').checked,
        pacientes: document.getElementById('pPacientes').checked,
        clinica: document.getElementById('pClinica').checked,
        procedimentos: document.getElementById('pProcedimentos').checked,
        financeiro: document.getElementById('pFinanceiro').checked,
      } : u.permissions)
    };
    if(NUVEM){
      const em=normEmail(data.email);
      if(!emailValido(em)){ avisar('Informe um e-mail de acesso válido.'); return; }
      if(state.users.some(x=>x.id!==data.id && normEmail(x.email)===em)){ avisar('Já existe outro usuário com este e-mail.'); return; }
      if(u && emailTravado(u) && em!==normEmail(u.email)){ avisar('Somente o Master pode alterar o e-mail de acesso.'); return; }
      data.email=em;
    }
    const novaSenha=NUVEM?'':document.getElementById('fPassword').value;
    if(isNew && !novaSenha && !NUVEM){ avisar('Informe a senha.'); return; }
    if(novaSenha && novaSenha.length<6){ avisar('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if(novaSenha) Object.assign(data, await hashSenha(novaSenha));
    if(isNew) state.users.push(data);
    else { Object.assign(u, data); if(novaSenha) delete u.password; }
    saveData();
    document.getElementById('userFormArea').innerHTML='';
    render();
  });
}

function ultimaConsultaConfirmada(p){
  const list=(p.evolucao||[]).filter(e=>e.confirmado && e.data);
  if(!list.length) return '';
  return list.reduce((max,e)=> e.data>max?e.data:max, list[0].data);
}
function calcAge(dob){
  if(!dob) return null;
  const b=new Date(dob+'T00:00:00');
  if(isNaN(b)) return null;
  const t=new Date();
  let age=t.getFullYear()-b.getFullYear();
  const m=t.getMonth()-b.getMonth();
  if(m<0 || (m===0 && t.getDate()<b.getDate())) age--;
  return age;
}
let buscaPaciente='';
function normTxt(t){ return (t||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function renderPacientes(){
  const q=normTxt(buscaPaciente.trim()); const qDig=buscaPaciente.replace(/\D/g,'');
  const todos=state.patients.slice().sort((x,y)=>(x.nome||'').localeCompare(y.nome||'','pt-BR'));
  const lista=q? todos.filter(p=>normTxt(p.nome).includes(q) || (qDig && ((p.cpf||'').replace(/\D/g,'').includes(qDig) || (p.telefone||'').replace(/\D/g,'').includes(qDig)))) : todos;
  const rows=lista.map(p=>{
    const age=calcAge(p.nascimento);
    return `<tr>
    <td><button class="btn-s" data-openpatient="${p.id}" style="font-weight:600">${esc(p.nome)}${age!==null?' <span class="muted">('+age+' anos)</span>':''}${temAlertaPaciente(p)?' <span title="Possui alertas de atenção" style="color:#dc2626">⚠️</span>':''}</button></td>
    <td>${esc(ultimaConsultaConfirmada(p))||'-'}</td>
    <td class="actions">
    <button class="btn-s" data-editpatient="${p.id}">Editar</button>
    <button class="btn-d" data-delpatient="${p.id}">Excluir</button></td></tr>`;}).join('');
  const vazio=todos.length?`Nenhum paciente encontrado para "${esc(buscaPaciente)}"`:'Nenhum paciente cadastrado';
  return `<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center"><h2>Pacientes</h2>
  <button id="btnNewPatient" class="btn-p">+ Novo paciente</button></div>
  <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
    <input id="buscaPaciente" type="search" placeholder="Buscar por nome, CPF ou telefone" value="${esc(buscaPaciente)}" style="max-width:360px">
    <span class="muted">${lista.length} de ${todos.length} paciente(s)</span>
  </div>
  <div class="overflow"><table><thead><tr><th>Nome</th><th>Última consulta confirmada</th><th></th></tr></thead>
  <tbody>${rows||`<tr><td colspan="3" class="muted">${vazio}</td></tr>`}</tbody></table></div>
  </div><div id="patientFormArea"></div>`;
}
function ultimaAnamneseFinalizada(p,tipo){
  const l=(p.anamneses||[]).filter(r=>r.tipo===tipo && r.finalizado);
  l.sort((x,y)=>(y.dataPreenchimento||'').localeCompare(x.dataPreenchimento||''));
  return l[0]||null;
}
function alertasPaciente(p){
  const out=[]; const add=t=>{ if(t && !out.includes(t)) out.push(t); };
  const od=ultimaAnamneseFinalizada(p,'odontologica');
  if(od){
    const a=od.dados||{};
    if((a.alergiaMedicamentos||'').trim()) add('Alergia a medicamentos: '+a.alergiaMedicamentos.trim());
    if(a.alergiaAnestesico==='Sim') add('Reação a anestésico'+(a.alergiaAnestesicoDetalhe?': '+a.alergiaAnestesicoDetalhe:''));
    if(a.alergiaLatex==='Sim') add('Alergia a látex');
    [['docDiabetes','Diabetes'],['docHipertensao','Hipertensão'],['docCardiopatia','Cardiopatia'],['docRenal','Problema renal'],['docHepatite','Hepatite'],['docHiv','HIV/AIDS'],['docRespiratoria','Doença respiratória/asma'],['docCoagulacao','Distúrbio de coagulação'],['docEpilepsia','Epilepsia'],['docOsteoporose','Osteoporose/bisfosfonatos'],['docCancer','Câncer/quimioterapia']].forEach(([k,l])=>{ if(a[k]) add(l); });
    if((a.docOutras||'').trim()) add(a.docOutras.trim());
    if(a.gestante==='Sim') add('Gestante'+(a.gestanteMeses?' ('+a.gestanteMeses+' meses)':''));
    if(a.amamentando==='Sim') add('Amamentando');
    if(a.tratamentoMedico==='Sim') add('Em tratamento médico'+(a.tratamentoQual?': '+a.tratamentoQual:''));
    if((a.medicamentosContinuos||'').trim()) add('Medicação contínua: '+a.medicamentosContinuos.trim());
  }
  const hof=ultimaAnamneseFinalizada(p,'harmonizacao');
  if(hof){
    const d=hof.dados||{};
    const sim=(k,rot)=>{ if(d[k]==='Sim') add(rot+(d[k+'_det']?': '+d[k+'_det']:'')); };
    sim('alergias','Alergia'); sim('medicacaoContinua','Medicação contínua'); sim('tratamentoMedico','Em tratamento médico');
    sim('doencaCronica','Doença crônica'); sim('cardiovascular','Doença cardiovascular'); sim('respiratoria','Distúrbio respiratório');
    sim('infectocontagiosa','Doença infectocontagiosa'); sim('desmaios','Desmaios/convulsões'); sim('roacutan','Uso de Roacutan (isotretinoína)'); sim('protese','Prótese metálica/implante');
    if(d.gestante==='Sim') add('Gestante ou amamentando');
    if(d.queloides==='Sim') add('Tendência a queloides');
    if(d.cicatrizacao==='Sim') add('Hemorragia/dificuldade de cicatrização');
    if(d.hematomas==='Sim') add('Hematomas com facilidade');
  }
  return out;
}
function temAlertaPaciente(p){ return alertasPaciente(p).length>0 || !!(p.alertaManual||'').trim(); }
function bannerAtencao(p){
  const alertas=alertasPaciente(p), manual=(p.alertaManual||'').trim();
  const od=ultimaAnamneseFinalizada(p,'odontologica'), hof=ultimaAnamneseFinalizada(p,'harmonizacao');
  const btn=`<button class="btn-s" data-editalerta style="margin-top:8px;padding:5px 10px;font-size:12px">✎ ${manual?'Editar':'Adicionar'} alerta manual</button>`;
  if(!od && !hof && !manual){
    return `<div class="alerta-aviso"><strong>Anamnese ainda não preenchida:</strong> alergias e condições de saúde deste paciente não estão registradas. ${btn}</div>`;
  }
  if(!alertas.length && !manual){
    return `<div class="muted" style="margin-bottom:12px;font-size:13px">✔ Anamnese preenchida: nenhuma condição de atenção registrada. ${btn}</div>`;
  }
  const fontes=[od?'anamnese odontológica de '+fmtDataBR(od.dataPreenchimento):'',hof?'anamnese de harmonização de '+fmtDataBR(hof.dataPreenchimento):''].filter(Boolean).join(' e ');
  return `<div class="alerta-box"><h4>⚠️ ATENÇÃO</h4>
    ${alertas.map(t=>`<span class="alerta-chip">${esc(t)}</span>`).join('')}${manual?`<span class="alerta-chip manual">${esc(manual)}</span>`:''}
    ${fontes?`<div class="alerta-fonte">Conforme ${fontes}.</div>`:''}${btn}</div>`;
}
function renderPatientDetail(id){
  const p=state.patients.find(x=>x.id===id);
  if(!p){ patientDetailId=null; return renderPacientes(); }
  const tabs=[
    {id:'dados', label:'🪪 Dados Pessoais'},
    {id:'anamnese', label:'📝 Anamnese'},
    {id:'odontograma', label:'🦷 Odontograma'},
    {id:'exameclinico', label:'🔍 Exame Clínico'},
    {id:'planotratamento', label:'🗂️ Plano de Tratamento'},
    {id:'evolucao', label:'📈 Evolução'},
    {id:'exames', label:'🩻 Exames'},
    {id:'documentacao', label:'📄 Documentação'},
    {id:'orcamento', label:'💵 Orçamento'},
    {id:'financeiro', label:'💰 Financeiro'},
  ];
  const podeFin=permsDe(currentUser()).financeiro;
  if(patientDetailTab==='financeiro' && !podeFin) patientDetailTab='dados';
  const tabBar=tabs.filter(t=>t.id!=='financeiro'||podeFin).map(t=>`<button data-opentab="${t.id}" class="${patientDetailTab===t.id?'active':''}">${t.label}</button>`).join('');
  let body='';
  if(patientDetailTab==='dados') body=renderDadosPessoais(p);
  else if(patientDetailTab==='anamnese') body=renderAnamneseTab(p);
  else if(patientDetailTab==='odontograma') body=renderOdontograma(p);
  else if(patientDetailTab==='planotratamento') body=renderPlanoTratamento(p);
  else if(patientDetailTab==='orcamento') body=renderOrcamento(p);
  else if(patientDetailTab==='financeiro') body=renderFinanceiro(p);
  else if(patientDetailTab==='evolucao') body=renderEvolucao(p);
  else if(patientDetailTab==='exames') body=renderExames(p);
  else if(patientDetailTab==='documentacao') body=renderDocumentacao(p);
  else if(patientDetailTab==='exameclinico') body=renderExameClinico(p);
  else body=renderStub(tabs.find(t=>t.id===patientDetailTab)?.label||'');
  const age=calcAge(p.nascimento);
  return `<div class="card" style="display:flex;justify-content:space-between;align-items:center">
    <div><button id="btnBackPatients" class="btn-s">← Voltar</button></div>
    <div style="text-align:right"><strong>Prontuário Odontológico — ${esc(p.nome)}</strong><div class="muted">${age!==null?age+' anos':''}</div></div>
  </div>
  ${bannerAtencao(p)}
  <div class="tabs">${tabBar}</div>
  ${body}`;
}

function infoBox(label,value){
  return `<div class="info-box"><div class="info-label">${esc(label)}</div><div class="info-value">${esc(value)||'-'}</div></div>`;
}
function renderDadosPessoais(p){
  return `<div class="card"><h3 style="margin-top:0">Dados Pessoais</h3>
  <div class="section-title">Identificação</div>
  <div class="info-grid">
    ${infoBox('Nome completo', p.nome)}
    ${infoBox('Data de nascimento', fmtDataBR(p.nascimento))}
    ${infoBox('CPF', p.cpf)}
    ${infoBox('RG', p.rg)}
    ${infoBox('Sexo', p.sexo)}
    ${infoBox('Estado civil', p.estadoCivil)}
    ${infoBox('Profissão', p.profissao)}
  </div>
  <div class="section-title">Contato</div>
  <div class="info-grid">
    ${infoBox('Telefone / WhatsApp', p.telefone)}
    ${infoBox('Email', p.email)}
    ${infoBox('Endereço completo', p.endereco)}
  </div>
  <div class="section-title">Outras informações</div>
  <div class="info-grid">
    ${infoBox('Convênio', p.convenio)}
    ${infoBox('Responsável (se menor)', p.responsavel)}
    ${infoBox('Contato de emergência', p.contatoEmergencia)}
    ${infoBox('Última consulta confirmada', fmtDataBR(ultimaConsultaConfirmada(p)))}
  </div>
  <div style="margin-top:18px"><button id="btnEditPatientData" class="btn-p">Editar dados cadastrais</button></div>
  </div><div id="patientFormArea"></div>`;
}

function renderAnamneseTab(p){
  ensureAnamneses(p);
  if(anamneseOpenId){
    const rec=p.anamneses.find(r=>r.id===anamneseOpenId);
    if(rec){
      if(rec.finalizado) return rec.tipo==='odontologica' ? renderAnamneseOdontoView(rec) : renderHarmonizacaoView(rec);
      return rec.tipo==='odontologica' ? renderAnamneseOdonto(rec) : renderHarmonizacao(rec);
    }
    anamneseOpenId=null;
  }
  return renderAnamneseList(p);
}

function renderAnamneseList(p){
  const list=(p.anamneses||[]).slice().sort((x,y)=>(y.dataPreenchimento||'').localeCompare(x.dataPreenchimento||''));
  const rows=list.map(r=>`<tr>
    <td>${esc(r.dataPreenchimento)}</td>
    <td><span class="badge ${r.tipo==='odontologica'?'b-dent':'b-harm'}">${r.tipo==='odontologica'?'Odontológica':'Harmonização Facial'}</span></td>
    <td class="actions"><button class="btn-s" data-viewanamnese="${r.id}">${r.finalizado?'Visualizar':'Continuar preenchimento'}</button>
    <button class="btn-d" data-delanamnese="${r.id}">Excluir</button></td></tr>`).join('');
  return `<div class="card"><h3>Anamneses do paciente</h3>
  <div class="overflow"><table><thead><tr><th>Data</th><th>Tipo</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="3" class="muted">Nenhuma anamnese preenchida ainda</td></tr>'}</tbody></table></div>
  <p class="muted" style="margin-top:14px">Escolha o tipo para preencher uma nova anamnese. Todas ficam salvas no histórico do paciente.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn-p" data-newanamnese="odontologica">+ Nova Anamnese Odontológica</button>
    <button class="btn-p" data-newanamnese="harmonizacao">+ Nova Anamnese de Harmonização Facial</button>
  </div></div>`;
}

function renderAnamneseOdonto(rec){
  const a = Object.assign(defaultAnamnese(), rec.dados||{});
  return `<div class="card"><h3>Anamnese Odontológica</h3><p class="muted">Preenchida em ${esc(rec.dataPreenchimento)}</p>
  <form id="fAnamnese">
  <div class="row">
    <div><label>Está em tratamento médico atualmente?</label><select id="anTratamento"><option ${a.tratamentoMedico==='Não'?'selected':''}>Não</option><option ${a.tratamentoMedico==='Sim'?'selected':''}>Sim</option></select></div>
    <div><label>Qual?</label><input id="anTratamentoQual" value="${esc(a.tratamentoQual)}"></div>
  </div>
  <label>Medicamentos de uso contínuo</label><input id="anMedicamentos" value="${esc(a.medicamentosContinuos)}">
  <div class="row">
    <div><label>Alergia a medicamentos</label><input id="anAlergiaMed" value="${esc(a.alergiaMedicamentos)}"></div>
    <div><label>Já teve reação a anestésico odontológico?</label><select id="anAlergiaAnest"><option ${a.alergiaAnestesico==='Não'?'selected':''}>Não</option><option ${a.alergiaAnestesico==='Sim'?'selected':''}>Sim</option></select></div>
    <div><label>Alergia a látex</label><select id="anAlergiaLatex"><option ${a.alergiaLatex==='Não'?'selected':''}>Não</option><option ${a.alergiaLatex==='Sim'?'selected':''}>Sim</option></select></div>
  </div>
  <label>Detalhe da reação a anestésico (se houver)</label><input id="anAlergiaAnestDet" value="${esc(a.alergiaAnestesicoDetalhe)}">
  <label>Possui alguma das condições abaixo?</label>
  <div class="perm">
    <label><input type="checkbox" id="docDiabetes" ${a.docDiabetes?'checked':''}> Diabetes</label>
    <label><input type="checkbox" id="docHipertensao" ${a.docHipertensao?'checked':''}> Hipertensão</label>
    <label><input type="checkbox" id="docCardiopatia" ${a.docCardiopatia?'checked':''}> Cardiopatia</label>
    <label><input type="checkbox" id="docRenal" ${a.docRenal?'checked':''}> Problema renal</label>
    <label><input type="checkbox" id="docHepatite" ${a.docHepatite?'checked':''}> Hepatite</label>
    <label><input type="checkbox" id="docHiv" ${a.docHiv?'checked':''}> HIV/AIDS</label>
    <label><input type="checkbox" id="docRespiratoria" ${a.docRespiratoria?'checked':''}> Doença respiratória/Asma</label>
    <label><input type="checkbox" id="docCoagulacao" ${a.docCoagulacao?'checked':''}> Distúrbio de coagulação</label>
    <label><input type="checkbox" id="docEpilepsia" ${a.docEpilepsia?'checked':''}> Epilepsia</label>
    <label><input type="checkbox" id="docOsteoporose" ${a.docOsteoporose?'checked':''}> Osteoporose/Bisfosfonatos</label>
    <label><input type="checkbox" id="docCancer" ${a.docCancer?'checked':''}> Câncer/Quimioterapia</label>
  </div>
  <label>Outras condições</label><input id="docOutras" value="${esc(a.docOutras)}">
  <div class="row">
    <div><label>Gestante</label><select id="anGestante"><option ${a.gestante==='Não'?'selected':''}>Não</option><option ${a.gestante==='Sim'?'selected':''}>Sim</option></select></div>
    <div><label>Se sim, quantos meses?</label><input id="anGestanteMeses" value="${esc(a.gestanteMeses)}"></div>
    <div><label>Amamentando</label><select id="anAmamentando"><option ${a.amamentando==='Não'?'selected':''}>Não</option><option ${a.amamentando==='Sim'?'selected':''}>Sim</option></select></div>
  </div>
  <div class="row">
    <div><label>Fumante</label><select id="anFumante"><option ${a.fumante==='Não'?'selected':''}>Não</option><option ${a.fumante==='Sim'?'selected':''}>Sim</option></select></div>
    <div><label>Etilista</label><select id="anEtilista"><option ${a.etilista==='Não'?'selected':''}>Não</option><option ${a.etilista==='Sim'?'selected':''}>Sim</option></select></div>
  </div>
  <div class="row">
    <div><label>Sangramento gengival espontâneo</label><select id="anSangramento"><option ${a.sangramentoGengival==='Não'?'selected':''}>Não</option><option ${a.sangramentoGengival==='Sim'?'selected':''}>Sim</option></select></div>
    <div><label>Bruxismo</label><select id="anBruxismo"><option ${a.bruxismo==='Não'?'selected':''}>Não</option><option ${a.bruxismo==='Sim'?'selected':''}>Sim</option></select></div>
    <div><label>Usa fio dental</label><select id="anFioDental"><option ${a.fioDental==='Não'?'selected':''}>Não</option><option ${a.fioDental==='Sim'?'selected':''}>Sim</option></select></div>
  </div>
  <div class="row">
    <div><label>Última visita ao dentista</label><input id="anUltimaVisita" type="date" value="${esc(a.ultimaVisita)}"></div>
    <div><label>Frequência de escovação diária</label><input id="anEscovacao" value="${esc(a.escovacaoDiaria)}" placeholder="ex: 3x ao dia"></div>
  </div>
  <label>Observações gerais</label><input id="anObservacoes" value="${esc(a.observacoes)}">
  <p class="muted" style="margin-top:8px">⚠️ Após salvar, esta anamnese vira um documento e não poderá mais ser editada — apenas visualizada.</p>
  <div style="margin-top:16px"><button class="btn-p">Salvar Anamnese</button> <button type="button" id="btnBackAnamnese" class="btn-s">Voltar</button></div>
  </form></div>`;
}

function renderHarmonizacao(rec){
  const dados=rec.dados||{};
  const fields=harmQuestions.map(q=>`<div style="margin-bottom:10px">${questionField(q,dados)}</div>`).join('');
  return `<div class="card"><h3>Anamnese - Harmonização Facial</h3><p class="muted">Preenchida em ${esc(rec.dataPreenchimento)}</p>
  <form id="fHarm">${fields}
  <p class="muted" style="margin-top:8px">⚠️ Após salvar, esta anamnese vira um documento e não poderá mais ser editada — apenas visualizada.</p>
  <div style="margin-top:16px"><button class="btn-p">Salvar Anamnese</button> <button type="button" id="btnBackAnamnese" class="btn-s">Voltar</button></div>
  </form></div>`;
}

function renderAnamneseOdontoView(rec){
  const a=Object.assign(defaultAnamnese(), rec.dados||{});
  const doencas=[['docDiabetes','Diabetes'],['docHipertensao','Hipertensão'],['docCardiopatia','Cardiopatia'],['docRenal','Problema renal'],['docHepatite','Hepatite'],['docHiv','HIV/AIDS'],['docRespiratoria','Doença respiratória/Asma'],['docCoagulacao','Distúrbio de coagulação'],['docEpilepsia','Epilepsia'],['docOsteoporose','Osteoporose/Bisfosfonatos'],['docCancer','Câncer/Quimioterapia']]
    .filter(d=>a[d[0]]).map(d=>d[1]).join(', ')||'Nenhuma';
  return `<div class="card"><h3>Anamnese Odontológica</h3><p class="muted">Preenchida em ${esc(rec.dataPreenchimento)} · Documento finalizado (somente leitura)</p>
  ${fieldRow('Está em tratamento médico atualmente?', a.tratamentoMedico+(a.tratamentoQual?' — '+a.tratamentoQual:''))}
  ${fieldRow('Medicamentos de uso contínuo', a.medicamentosContinuos)}
  ${fieldRow('Alergia a medicamentos', a.alergiaMedicamentos)}
  ${fieldRow('Já teve reação a anestésico odontológico?', a.alergiaAnestesico+(a.alergiaAnestesicoDetalhe?' — '+a.alergiaAnestesicoDetalhe:''))}
  ${fieldRow('Alergia a látex', a.alergiaLatex)}
  ${fieldRow('Condições de saúde relevantes', doencas)}
  ${fieldRow('Outras condições', a.docOutras)}
  ${fieldRow('Gestante', a.gestante+(a.gestanteMeses?' — '+a.gestanteMeses+' meses':''))}
  ${fieldRow('Amamentando', a.amamentando)}
  ${fieldRow('Fumante', a.fumante)}
  ${fieldRow('Etilista', a.etilista)}
  ${fieldRow('Sangramento gengival espontâneo', a.sangramentoGengival)}
  ${fieldRow('Bruxismo', a.bruxismo)}
  ${fieldRow('Usa fio dental', a.fioDental)}
  ${fieldRow('Última visita ao dentista', a.ultimaVisita)}
  ${fieldRow('Frequência de escovação diária', a.escovacaoDiaria)}
  ${fieldRow('Observações gerais', a.observacoes)}
  <div style="margin-top:16px"><button type="button" id="btnBackAnamnese" class="btn-s">Voltar</button></div>
  </div>`;
}

function renderHarmonizacaoView(rec){
  const dados=rec.dados||{};
  const rows=harmQuestions.map(q=>{
    let val=dados[q.id]||'-';
    if(q.type==='ynd' && dados[q.id]==='Sim' && dados[q.id+'_det']) val+=' — '+dados[q.id+'_det'];
    return fieldRow(q.label, val);
  }).join('');
  return `<div class="card"><h3>Anamnese - Harmonização Facial</h3><p class="muted">Preenchida em ${esc(rec.dataPreenchimento)} · Documento finalizado (somente leitura)</p>
  ${rows}
  <div style="margin-top:16px"><button type="button" id="btnBackAnamnese" class="btn-s">Voltar</button></div>
  </div>`;
}

function openPatientForm(p){
  editingPatientId = p? p.id : null;
  const d = p || {};
  document.getElementById('patientFormArea').innerHTML = `<div class="card">
  <h3>${p?'Editar paciente':'Novo paciente'}</h3>
  <form id="fPatient">
  <div class="row">
    <div><label>Nome completo</label><input id="pNome" value="${esc(d.nome)}" required></div>
    <div><label>Data de nascimento</label><input id="pNasc" type="date" value="${esc(d.nascimento)}" required></div>
  </div>
  <div class="row">
    <div><label>CPF</label><input id="pCpf" value="${esc(d.cpf)}" required></div>
    <div><label>RG</label><input id="pRg" value="${esc(d.rg)}"></div>
    <div><label>Sexo</label><select id="pSexo">
      <option ${d.sexo==='Feminino'?'selected':''}>Feminino</option>
      <option ${d.sexo==='Masculino'?'selected':''}>Masculino</option>
      <option ${d.sexo==='Outro'?'selected':''}>Outro</option></select></div>
  </div>
  <div class="row">
    <div><label>Estado civil</label><input id="pEstadoCivil" value="${esc(d.estadoCivil)}"></div>
    <div><label>Profissão</label><input id="pProfissao" value="${esc(d.profissao)}"></div>
  </div>
  <label>Endereço completo</label><input id="pEndereco" value="${esc(d.endereco)}">
  <div class="row">
    <div><label>Telefone / WhatsApp</label><input id="pTelefone" value="${esc(d.telefone)}" required></div>
    <div><label>Email</label><input id="pEmail" type="email" value="${esc(d.email)}"></div>
  </div>
  <div class="row">
    <div><label>Convênio</label><input id="pConvenio" value="${esc(d.convenio)}"></div>
    <div><label>Responsável (se menor)</label><input id="pResponsavel" value="${esc(d.responsavel)}"></div>
  </div>
  <label>Contato de emergência (nome e telefone)</label><input id="pEmergencia" value="${esc(d.contatoEmergencia)}">
  <p class="muted" style="margin-top:8px">A anamnese odontológica completa fica disponível na ficha do paciente (aba Anamnese) depois de salvo.</p>
  <div style="margin-top:16px"><button class="btn-p">Salvar</button> <button type="button" id="btnCancelPatient" class="btn-s">Cancelar</button></div>
  </form></div>`;
  document.getElementById('btnCancelPatient').addEventListener('click',()=>{ document.getElementById('patientFormArea').innerHTML=''; });
  document.getElementById('fPatient').addEventListener('submit', ev=>{
    ev.preventDefault();
    const data={
      id: p? p.id: uid(),
      nome: pNome.value.trim(), nascimento: pNasc.value, cpf: pCpf.value.trim(), rg: pRg.value.trim(),
      sexo: pSexo.value, estadoCivil: pEstadoCivil.value, profissao: pProfissao.value,
      endereco: pEndereco.value, telefone: pTelefone.value, email: pEmail.value,
      convenio: pConvenio.value, responsavel: pResponsavel.value, contatoEmergencia: pEmergencia.value,
    };
    if(!p) { data.anamneses=[]; data.ultimaConsultaConfirmada=''; }
    if(p) Object.assign(p, data); else state.patients.push(data);
    saveData();
    document.getElementById('patientFormArea').innerHTML='';
    render();
  });
}

let procFiltroGrupo='', procBusca='';
function escopoLabel(e){ return e==='arcada'?'por arcada':e==='geral'?'geral':'por dente'; }
function filtrarProcedimentos(grupo,busca){
  const q=normTxt((busca||'').trim());
  return state.procedimentos.filter(pr=>(!grupo||pr.especialidade===grupo) && (!q||normTxt(pr.nome).includes(q)));
}
function renderProcedimentos(){
  ensureProcedimentos();
  const buscando=!!procBusca.trim();
  const cards=state.grupos.filter(g=>!procFiltroGrupo||g.nome===procFiltroGrupo).map(g=>{
    const items=filtrarProcedimentos(g.nome,procBusca);
    if(buscando && !items.length) return '';
    const total=state.procedimentos.filter(pr=>pr.especialidade===g.nome).length;
    const rows=items.map(pr=>`<tr><td>${esc(pr.nome)}</td><td>${escopoLabel(pr.escopo)}</td><td>${fmtMoney(pr.valor)}</td><td>${pr.tempoMin} min</td>
      <td class="actions"><button class="btn-s" data-editproc="${pr.id}">Editar</button> <button class="btn-d" data-delproc="${pr.id}">Excluir</button></td></tr>`).join('');
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0">${esc(g.nome)} <span class="muted" style="font-weight:400;font-size:13px">(${total})</span></h3>
      <div class="actions"><button class="btn-s" data-editgrupo="${g.id}">Editar grupo</button> <button class="btn-d" data-delgrupo="${g.id}">Excluir grupo</button></div></div>
      <div class="overflow" style="margin-top:8px"><table><thead><tr><th>Procedimento</th><th>Cobrança</th><th>Valor</th><th>Tempo</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="5" class="muted">Nenhum procedimento neste grupo ainda</td></tr>'}</tbody></table></div></div>`;
  }).join('');
  return `<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><h2 style="margin:0">Procedimentos</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button id="btnNewGrupo" class="btn-s">+ Novo Grupo</button><button id="btnNewProc" class="btn-p">+ Novo Procedimento</button></div></div>
  <p class="muted" style="margin:8px 0">Os procedimentos ficam organizados em <strong>grupos</strong> (as especialidades da Odontologia, incluindo HOF). Os valores e tempos cadastrados aqui são exemplos — ajuste para a realidade da sua clínica. A recepção consulta os valores no menu <strong>Tabela de Valores</strong>.</p>
  <div class="row"><div><label>Grupo</label><select id="procGrupoSel"><option value="">Todos os grupos (${state.grupos.length})</option>${state.grupos.map(g=>`<option value="${esc(g.nome)}" ${procFiltroGrupo===g.nome?'selected':''}>${esc(g.nome)}</option>`).join('')}</select></div>
  <div><label>Buscar procedimento</label><input id="procBusca" type="search" placeholder="Ex: toxina, implante, canal" value="${esc(procBusca)}"></div></div></div>
  <div id="procFormArea"></div>
  ${cards||'<div class="card"><p class="muted">Nenhum procedimento encontrado.</p></div>'}`;
}
function mostrarFormProc(){ try{ document.getElementById('procFormArea').scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){} }
function openProcForm(pr){
  const isNew=!pr;
  const sel=pr?pr.especialidade:(procFiltroGrupo||state.grupos[0].nome);
  document.getElementById('procFormArea').innerHTML=`<div class="card">
  <h3>${isNew?'Novo Procedimento':'Editar Procedimento'}</h3>
  <form id="fProc">
  <label>Grupo</label><select id="prEsp">${nomesGrupos().map(e=>`<option ${sel===e?'selected':''}>${esc(e)}</option>`).join('')}</select>
  <label>Nome do procedimento</label><input id="prNome" value="${esc(pr?pr.nome:'')}" required>
  <div class="row">
    <div><label>Valor (R$)</label><input id="prValor" type="number" step="0.01" min="0" value="${pr?pr.valor:''}" required></div>
    <div><label>Tempo de execução (min)</label><input id="prTempo" type="number" min="1" value="${pr?pr.tempoMin:''}" required></div>
    <div><label>Cobrança / lançamento</label><select id="prEscopo">
      <option value="dente" ${(!pr||pr.escopo==='dente')?'selected':''}>Por dente</option>
      <option value="arcada" ${pr&&pr.escopo==='arcada'?'selected':''}>Por arcada</option>
      <option value="geral" ${pr&&pr.escopo==='geral'?'selected':''}>Geral (sem dente nem arcada)</option></select></div>
  </div>
  <div style="margin-top:16px"><button class="btn-p">Salvar</button> <button type="button" id="btnCancelProc" class="btn-s">Cancelar</button></div>
  </form></div>`;
  mostrarFormProc();
  document.getElementById('btnCancelProc').addEventListener('click',()=>{ document.getElementById('procFormArea').innerHTML=''; });
  document.getElementById('fProc').addEventListener('submit', ev=>{
    ev.preventDefault();
    const data={
      id: isNew?uid():pr.id,
      especialidade: prEsp.value,
      nome: prNome.value.trim(),
      valor: parseFloat(prValor.value)||0,
      tempoMin: parseInt(prTempo.value)||0,
      escopo: prEscopo.value
    };
    if(isNew) state.procedimentos.push(data); else Object.assign(pr,data);
    saveData(); document.getElementById('procFormArea').innerHTML=''; render();
  });
}
function renomearGrupoEmTudo(antigo,novo){
  state.procedimentos.forEach(pr=>{ if(pr.especialidade===antigo) pr.especialidade=novo; });
  state.patients.forEach(pc=>{
    const o=pc.odonto; if(!o) return;
    Object.values(o.dentes||{}).forEach(d=>(d.procedimentos||[]).forEach(pp=>{ if(pp.especialidade===antigo) pp.especialidade=novo; }));
    (o.gerais||[]).forEach(gg=>{ if(gg.especialidade===antigo) gg.especialidade=novo; });
  });
}
function openGrupoForm(g){
  const isNew=!g;
  document.getElementById('procFormArea').innerHTML=`<div class="card">
  <h3>${isNew?'Novo Grupo':'Editar Grupo'}</h3>
  <form id="fGrupo">
  <label>Nome do grupo</label><input id="grNome" value="${esc(g?g.nome:'')}" required placeholder="Ex: Implantodontia">
  <label style="display:flex;gap:8px;align-items:flex-start;color:var(--text);font-size:14px;margin-top:12px"><input type="checkbox" id="grAusente" style="width:auto;margin-top:3px" ${g&&g.permiteDenteAusente?'checked':''}><span>Procedimentos deste grupo podem ser lançados em dente <strong>ausente ou com extração anterior</strong> (ex.: prótese, implante)</span></label>
  <div style="margin-top:16px"><button class="btn-p">Salvar</button> <button type="button" id="btnCancelGrupo" class="btn-s">Cancelar</button></div>
  </form></div>`;
  mostrarFormProc();
  document.getElementById('btnCancelGrupo').addEventListener('click',()=>{ document.getElementById('procFormArea').innerHTML=''; });
  document.getElementById('fGrupo').addEventListener('submit', ev=>{
    ev.preventDefault();
    const nome=grNome.value.trim(); if(!nome) return;
    if(state.grupos.some(x=>(!g||x.id!==g.id) && normTxt(x.nome)===normTxt(nome))){ avisar('Já existe um grupo com esse nome.'); return; }
    if(isNew){ state.grupos.push(criarGrupo(nome,null,grAusente.checked)); }
    else {
      const antigo=g.nome; g.nome=nome; g.permiteDenteAusente=grAusente.checked;
      if(antigo!==nome){ renomearGrupoEmTudo(antigo,nome); if(procFiltroGrupo===antigo) procFiltroGrupo=nome; }
    }
    saveData(); document.getElementById('procFormArea').innerHTML=''; render();
  });
}

function renderClinica(){
  const c=state.clinic; const canEdit = currentUser().tipo==='master';
  return `<div class="card"><h2>Dados da Clínica</h2>
  <form id="fClinicEdit">
  <label>Nome</label><input id="cNome" value="${esc(c.nome)}" ${canEdit?'':'disabled'}>
  <label>Endereço</label><input id="cEndereco" value="${esc(c.endereco)}" ${canEdit?'':'disabled'}>
  <div class="row">
    <div><label>Telefone</label><input id="cTelefone" value="${esc(c.telefone)}" ${canEdit?'':'disabled'}></div>
    <div><label>Email</label><input id="cEmail" value="${esc(c.email)}" ${canEdit?'':'disabled'}></div>
  </div>
  ${canEdit?'<button class="btn-p" style="margin-top:14px">Salvar</button>':'<p class="muted" style="margin-top:10px">Somente o usuário Master pode editar os dados da clínica.</p>'}
  </form></div>`;
}

function bindEvents(){
  const fClinic=document.getElementById('fClinic');
  if(fClinic) fClinic.addEventListener('submit',e=>{
    e.preventDefault();
    state.clinic={nome:fClinic.nome.value.trim(),endereco:fClinic.endereco.value.trim(),telefone:fClinic.telefone.value.trim(),email:fClinic.email.value.trim()};
    saveData();
    if(NUVEM){ view=currentUser()?'home':'nuvemPerfil'; if(view==='home') try{ ensureProcedimentos(); }catch(err){ console.error(err); } }
    else view='setupUser';
    render();
  });
  const btnMaster=document.getElementById('btnCreateMaster');
  if(btnMaster) btnMaster.addEventListener('click',async()=>{
    const master={id:uid(),tipo:'master',username:fUsername.value.trim(),
      nomeCompleto:fNomeCompleto.value.trim(),telefone:fTelefone.value.trim(),email:fEmail.value.trim(),
      cro:'', permissions:defaultPerms('master')};
    const senha=fPassword.value;
    if(!master.username||!senha||!master.nomeCompleto){avisar('Preencha todos os campos obrigatórios.');return;}
    if(senha.length<6){ avisar('A senha precisa ter pelo menos 6 caracteres.'); return; }
    Object.assign(master, await hashSenha(senha));
    state.users.push(master); saveData(); view='login'; render();
  });
  const fLogin=document.getElementById('fLogin');
  if(fLogin) fLogin.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=fLogin.querySelector('button'); btn.disabled=true;
    const nome=fLogin.username.value.trim(), senha=fLogin.password.value;
    let u=null;
    for(const x of state.users.filter(x=>x.username===nome)){ if(await verificarSenha(x,senha)){ u=x; break; } }
    btn.disabled=false;
    if(!u){ document.getElementById('loginErr').textContent='Usuário ou senha inválidos.'; return; }
    if(u.password!==undefined && !u.senhaHash){ Object.assign(u,await hashSenha(senha)); delete u.password; saveData(); }
    session=u.id; try{sessionStorage.setItem('odontoSession',JSON.stringify(session));}catch(e){}
    view='home'; currentTab='dashboard'; render();
  });
  const btnLogout=document.getElementById('btnLogout');
  if(btnLogout) btnLogout.addEventListener('click',async()=>{
    if(NUVEM){
      const r=await Nuvem.sair(false);
      if(r==='pendente') confirmarAcao('Algumas alterações ainda não chegaram à nuvem (verifique a internet). Se sair agora, elas podem se perder. Sair mesmo assim?','Sair mesmo assim',()=>Nuvem.sair(true));
      return;
    }
    session=null; sessionStorage.removeItem('odontoSession'); view='login'; render();
  });

  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
    currentTab=b.getAttribute('data-tab'); patientDetailId=null; render();
  }));

  const btnNewUser=document.getElementById('btnNewUser');
  if(btnNewUser) btnNewUser.addEventListener('click',()=>openUserForm(null));
  document.querySelectorAll('[data-edituser]').forEach(b=>b.addEventListener('click',()=>{
    openUserForm(state.users.find(u=>u.id===b.getAttribute('data-edituser')));
  }));
  document.querySelectorAll('[data-deluser]').forEach(b=>b.addEventListener('click',()=>{
    const alvo=state.users.find(u=>u.id===b.getAttribute('data-deluser'));
    if(!alvo || !podeExcluirUsuario(alvo)){ avisar('Este usuário não pode ser excluído.'); return; }
    customConfirm('Excluir este usuário?', ()=>{ state.users=state.users.filter(u=>u.id!==alvo.id); saveData(); render(); });
  }));

  const btnNewPatient=document.getElementById('btnNewPatient');
  if(btnNewPatient) btnNewPatient.addEventListener('click',()=>openPatientForm(null));
  document.querySelectorAll('[data-editpatient]').forEach(b=>b.addEventListener('click',()=>{
    openPatientForm(state.patients.find(p=>p.id===b.getAttribute('data-editpatient')));
  }));
  document.querySelectorAll('[data-delpatient]').forEach(b=>b.addEventListener('click',()=>{
    const pid=b.getAttribute('data-delpatient');
    const pac=state.patients.find(p=>p.id===pid); if(!pac) return;
    const r=resumoExclusaoPaciente(pac);
    const msg=`Excluir "${pac.nome}"? Serão apagados definitivamente: ${r.itens.join(', ')||'apenas o cadastro'}.`+
      (r.fin?` Os ${r.fin} lançamento(s) financeiro(s) dele permanecem no fluxo de caixa.`:'')+
      ` Prontuários têm prazo legal de guarda: exclua apenas cadastros feitos por engano. Na dúvida, cancele e exporte um backup antes.`;
    confirmarAcao(msg,'Excluir definitivamente',()=>{
      imagensDoPaciente(pac).forEach(removerImagem);
      state.agendamentos=(state.agendamentos||[]).filter(a=>a.pacienteId!==pid);
      state.patients=state.patients.filter(p=>p.id!==pid); saveData(); render();
    });
  }));
  document.querySelectorAll('[data-openpatient]').forEach(b=>b.addEventListener('click',()=>{
    patientDetailId=b.getAttribute('data-openpatient'); patientDetailTab='dados'; anamneseOpenId=null; docFormType=null; docOpenId=null; exameOpenId=null;
    odontoSetupMode=null; odontoSetupMap={}; odontoToothOpenNum=null; render();
  }));
  const btnNewExame=document.getElementById('btnNewExame');
  if(btnNewExame) btnNewExame.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    p.examesClinicos=p.examesClinicos||[];
    const rec={id:uid(), data:hojeISO(), hora:new Date().toTimeString().slice(0,5),
      dentistaId:'', dentistaNome:'', dentistaCro:'', finalizado:false, dados:{}};
    p.examesClinicos.push(rec); saveData(); exameOpenId=rec.id; render();
  });
  document.querySelectorAll('[data-viewexame]').forEach(b=>b.addEventListener('click',()=>{
    exameOpenId=b.getAttribute('data-viewexame'); render();
  }));
  document.querySelectorAll('[data-delexame]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Excluir este exame clínico?', ()=>{
      const p=state.patients.find(x=>x.id===patientDetailId);
      p.examesClinicos=p.examesClinicos.filter(e=>e.id!==b.getAttribute('data-delexame'));
      saveData(); render();
    });
  }));
  const btnBackExame=document.getElementById('btnBackExame');
  if(btnBackExame) btnBackExame.addEventListener('click',()=>{ exameOpenId=null; render(); });
  const fExame=document.getElementById('fExame');
  if(fExame) fExame.addEventListener('submit', ev=>{
    ev.preventDefault();
    const p=state.patients.find(x=>x.id===patientDetailId);
    const ex=p.examesClinicos.find(e=>e.id===exameOpenId);
    const dentista=state.users.find(u=>u.id===document.getElementById('exDentista').value);
    if(!dentista){ avisar('Selecione o dentista responsável.'); return; }
    const dados={};
    fExame.querySelectorAll('[data-ex]').forEach(el=>{ dados[el.getAttribute('data-ex')]=el.value; });
    ex.dados=dados; ex.dentistaId=dentista.id; ex.dentistaNome=dentista.nomeCompleto; ex.dentistaCro=dentista.cro;
    ex.data=document.getElementById('exData').value; ex.hora=document.getElementById('exHora').value;
    ex.finalizado=true; saveData(); exameOpenId=null; render();
  });
  document.querySelectorAll('[data-newdoc]').forEach(b=>b.addEventListener('click',()=>{
    docFormType=b.getAttribute('data-newdoc'); render();
  }));
  const btnCancelDoc=document.getElementById('btnCancelDoc');
  if(btnCancelDoc) btnCancelDoc.addEventListener('click',()=>{ docFormType=null; render(); });
  const fDoc=document.getElementById('fDoc');
  if(fDoc) fDoc.addEventListener('submit', ev=>{
    ev.preventDefault();
    const p=state.patients.find(x=>x.id===patientDetailId);
    const dentista=state.users.find(x=>x.id===docDentista.value);
    if(!dentista){ avisar('Selecione o dentista responsável.'); return; }
    const doc={
      id:uid(), tipo:docFormType, data:docData.value,
      dentistaId:dentista.id, dentistaNome:dentista.nomeCompleto, dentistaCro:dentista.cro,
      finalidade:docFinalidade.value, apresentacao:docApresentacao.value.trim(),
      horarioEntrada:docEntrada.value, horarioSaida:docSaida.value, local:docLocal.value.trim(),
      criadoEm:hojeISO()
    };
    if(docFormType==='atestado'){
      doc.quantidade=docQtd.value; doc.unidade=docUnidade.value;
      doc.cid=docCid.value.trim(); doc.cidAutorizadoPor=docCidAut.value.trim();
      if(doc.cid && !doc.cidAutorizadoPor){ avisar('Informe quem autorizou a menção do CID.'); return; }
      if(!doc.cid) doc.cidAutorizadoPor='';
    }
    p.documentos=p.documentos||[];
    p.documentos.push(doc);
    saveData();
    docFormType=null; docOpenId=doc.id;
    render();
  });
  document.querySelectorAll('[data-viewdoc]').forEach(b=>b.addEventListener('click',()=>{
    docOpenId=b.getAttribute('data-viewdoc'); render();
  }));
  const btnPrintDoc=document.getElementById('btnPrintDoc');
  if(btnPrintDoc) btnPrintDoc.addEventListener('click',()=>{
    try{ window.print(); }catch(e){ avisar('Não foi possível abrir a impressão. Use Ctrl+P (⌘+P) para imprimir esta página.'); }
  });
  const btnBackDoc=document.getElementById('btnBackDoc');
  if(btnBackDoc) btnBackDoc.addEventListener('click',()=>{ docOpenId=null; render(); });
  document.querySelectorAll('[data-deldoc]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Excluir este documento?', ()=>{
      const p=state.patients.find(x=>x.id===patientDetailId);
      p.documentos=p.documentos.filter(d=>d.id!==b.getAttribute('data-deldoc'));
      saveData(); render();
    });
  }));
  document.querySelectorAll('[data-viewpano]').forEach(img=>img.addEventListener('click',async()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const ex=p.exames.panoramicas.find(x=>x.id===img.getAttribute('data-viewpano'));
    if(ex){
      const lbl={inicio:'Início do tratamento',meio:'Meio do tratamento',fim:'Fim do tratamento'}[ex.momento]||'Panorâmica';
      const url=ex.imagemId?await urlDaImagem(ex.imagemId):ex.imagemData;
      if(url) openImageViewer(url, 'Panorâmica — '+lbl);
    }
  }));
  document.querySelectorAll('[data-viewperi]').forEach(img=>img.addEventListener('click',async()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const ex=p.exames.periapicais.find(x=>x.id===img.getAttribute('data-viewperi'));
    if(ex){
      const url=ex.imagemId?await urlDaImagem(ex.imagemId):ex.imagemData;
      if(url) openImageViewer(url, 'Periapical — Dente '+ex.dente);
    }
  }));
  document.querySelectorAll('[data-panoupload]').forEach(inp=>inp.addEventListener('change',async()=>{
    const momento=inp.getAttribute('data-panoupload');
    const file=inp.files[0]; if(!file) return;
    try{
      const imagemId=await salvarImagem(file);
      const p=state.patients.find(x=>x.id===patientDetailId);
      p.exames=p.exames||{panoramicas:[],periapicais:[]};
      const antigos=p.exames.panoramicas.filter(x=>x.momento===momento);
      p.exames.panoramicas=p.exames.panoramicas.filter(x=>x.momento!==momento);
      p.exames.panoramicas.push({id:uid(), momento, dataUpload:hojeISO(), imagemId});
      saveData(); render();
      antigos.forEach(a=>removerImagem(a.imagemId));
    }catch(e){ console.error(e); avisar('Não foi possível guardar a imagem (armazenamento cheio ou bloqueado). Exporte um backup e libere espaço no computador.'); }
  }));
  document.querySelectorAll('[data-delpano]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Remover esta radiografia panorâmica?', ()=>{
      const p=state.patients.find(x=>x.id===patientDetailId);
      const rem=p.exames.panoramicas.filter(x=>x.id===b.getAttribute('data-delpano'));
      p.exames.panoramicas=p.exames.panoramicas.filter(x=>x.id!==b.getAttribute('data-delpano'));
      saveData(); render();
      rem.forEach(x=>removerImagem(x.imagemId));
    });
  }));
  const btnAddPeri=document.getElementById('btnAddPeri');
  if(btnAddPeri) btnAddPeri.addEventListener('click',async()=>{
    const file=document.getElementById('periFile').files[0];
    if(!file){ avisar('Selecione um arquivo de imagem.'); return; }
    const dente=document.getElementById('periDente').value;
    try{
      const imagemId=await salvarImagem(file);
      const p=state.patients.find(x=>x.id===patientDetailId);
      p.exames=p.exames||{panoramicas:[],periapicais:[]};
      p.exames.periapicais.push({id:uid(), dente, dataUpload:hojeISO(), imagemId});
      saveData(); render();
    }catch(e){ console.error(e); avisar('Não foi possível guardar a imagem (armazenamento cheio ou bloqueado). Exporte um backup e libere espaço no computador.'); }
  });
  document.querySelectorAll('[data-delperi]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Remover esta radiografia periapical?', ()=>{
      const p=state.patients.find(x=>x.id===patientDetailId);
      const rem=p.exames.periapicais.filter(x=>x.id===b.getAttribute('data-delperi'));
      p.exames.periapicais=p.exames.periapicais.filter(x=>x.id!==b.getAttribute('data-delperi'));
      saveData(); render();
      rem.forEach(x=>removerImagem(x.imagemId));
    });
  }));
  document.querySelectorAll('[data-editalerta]').forEach(b=>b.addEventListener('click',async()=>{
    const pc=state.patients.find(x=>x.id===patientDetailId); if(!pc) return;
    const t=await pedirTexto('Alerta manual (aparece em vermelho no topo do prontuário). Deixe vazio para remover.',{multilinha:true,valor:pc.alertaManual||'',rotuloOk:'Salvar'});
    if(t!==null){ pc.alertaManual=t.trim(); saveData(); render(); }
  }));
  document.querySelectorAll('[data-dashgo]').forEach(b=>b.addEventListener('click',()=>{
    const g=b.getAttribute('data-dashgo'); patientDetailId=null;
    if(g==='agenda'){ currentTab='agenda'; agendaViewMode='dia'; agendaViewDate=hojeISO(); }
    else if(g==='inicio'){ currentTab='dashboard'; }
    else if(g.startsWith('rel:')){ currentTab='relatorios'; relatorioTab=g.slice(4); }
    render();
  }));
  document.querySelectorAll('[data-reptabsel]').forEach(b=>b.addEventListener('click',()=>{ relatorioTab=b.getAttribute('data-reptabsel'); render(); }));
  document.querySelectorAll('[data-reppac]').forEach(b=>b.addEventListener('click',()=>{
    currentTab='pacientes'; patientDetailId=b.getAttribute('data-reppac'); patientDetailTab=b.getAttribute('data-reptab')||'dados';
    anamneseOpenId=null; docFormType=null; docOpenId=null; exameOpenId=null; odontoSetupMode=null; odontoSetupMap={}; odontoToothOpenNum=null;
    render();
  }));
  const repSel=(id,fn)=>{ const el=document.getElementById(id); if(el) el.addEventListener('change',()=>{ fn(el); render(); }); };
  repSel('repFluxoHor',el=>{ repFluxoHorizonte=parseInt(el.value,10); });
  repSel('repOrcDiasSel',el=>{ repOrcDias=parseInt(el.value,10); });
  repSel('repEvolDent',el=>{ repEvolDentista=el.value; });
  repSel('repRetMeses',el=>{ repRetornoMeses=parseInt(el.value,10); });
  repSel('repFaltasSel',el=>{ repFaltasDias=parseInt(el.value,10); });
  const repNunca=document.getElementById('repRetNunca');
  if(repNunca) repNunca.addEventListener('change',()=>{ repRetornoNunca=repNunca.checked; render(); });
  const buscaPac=document.getElementById('buscaPaciente');
  if(buscaPac) buscaPac.addEventListener('input',()=>{
    const pos=buscaPac.selectionStart; buscaPaciente=buscaPac.value; render();
    const n=document.getElementById('buscaPaciente'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} }
  });
  const bkChk=document.getElementById('bkCripto');
  if(bkChk) bkChk.addEventListener('change',()=>{ document.getElementById('bkSenhaBox').style.display=bkChk.checked?'block':'none'; });
  const btnExportBackup=document.getElementById('btnExportBackup');
  if(btnExportBackup) btnExportBackup.addEventListener('click',async()=>{
    let senha=null;
    if(bkChk && bkChk.checked){
      const s1=document.getElementById('bkSenha1').value, s2=document.getElementById('bkSenha2').value;
      if(s1.length<8){ avisar('A senha do backup precisa ter pelo menos 8 caracteres.'); return; }
      if(s1!==s2){ avisar('As duas senhas do backup não conferem.'); return; }
      senha=s1;
    }
    try{ await exportarBackup(senha); render(); }catch(e){ console.error(e); avisar('Não foi possível gerar o backup: '+e.message); }
  });
  const btnImportBackup=document.getElementById('btnImportBackup'), fileImportBackup=document.getElementById('fileImportBackup');
  if(btnImportBackup && fileImportBackup){
    btnImportBackup.addEventListener('click',()=>fileImportBackup.click());
    fileImportBackup.addEventListener('change',async()=>{
      const f=fileImportBackup.files[0]; if(!f) return;
      fileImportBackup.value='';
      let protegido=false;
      try{ protegido=String.fromCharCode(...new Uint8Array(await f.slice(0,4).arrayBuffer()))==='ODB2'; }catch(e){}
      confirmarAcao(NUVEM?'Importar este backup vai SUBSTITUIR todos os dados da clínica na nuvem (pacientes, agenda, financeiro e radiografias), em todos os computadores e celulares. Se houver algo que você não quer perder, cancele e exporte um backup antes. Continuar?':'Importar este backup vai SUBSTITUIR todos os dados atuais deste computador (pacientes, agenda, financeiro e radiografias). Se houver algo que você não quer perder, cancele e exporte um backup antes. Continuar?','Substituir tudo',async()=>{
        try{
          let arq=f;
          if(protegido){
            const senha=await pedirTexto('Este backup é protegido por senha. Digite a senha do backup:',{tipo:'password',rotuloOk:'Abrir backup'});
            if(senha===null) return;
            arq=await decifrarBlob(f,senha);
          }
          await restaurarBackup(arq);
        }catch(e){ console.error(e); avisar('Não foi possível importar: '+e.message); }
      });
    });
  }
  const btnGoBackup=document.getElementById('btnGoBackup');
  if(btnGoBackup) btnGoBackup.addEventListener('click',()=>{ currentTab='configuracoes'; configSubTab='backup'; patientDetailId=null; render(); });
  document.querySelectorAll('[data-evolobs]').forEach(ta=>ta.addEventListener('change',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const e=p.evolucao.find(x=>x.id===ta.getAttribute('data-evolobs'));
    if(e){ e.observacao=ta.value; saveData(); }
  }));
  document.querySelectorAll('[data-confevol]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const e=p.evolucao.find(x=>x.id===b.getAttribute('data-confevol'));
    const eu=currentUser();
    if(!eu || eu.tipo!=='dentista'){ avisar('Somente um dentista pode confirmar a evolução.'); return; }
    if(e && !e.confirmado){
      const ta=document.querySelector(`[data-evolobs="${e.id}"]`); if(ta) e.observacao=ta.value;
      e.confirmado=true; e.confirmadoEm=hojeISO(); e.confirmadoEmHora=new Date().toISOString();
      e.confirmadoPorId=eu.id; e.confirmadoPorNome=eu.nomeCompleto; e.confirmadoPorCro=eu.cro||'';
      const refs=e.falta?[]:(e.procedimentoRefs||(e.procedimentoRef?[e.procedimentoRef]:[]));
      refs.forEach(id=>{
        const rec=findProcedimentoRecordById(p, id);
        if(rec) rec.status='Concluído';
      });
      saveData(); render();
    }
  }));
  const btnEditPatientData=document.getElementById('btnEditPatientData');
  if(btnEditPatientData) btnEditPatientData.addEventListener('click',()=>{
    openPatientForm(state.patients.find(p=>p.id===patientDetailId));
  });
  const btnOdontoSim=document.getElementById('btnOdontoSim');
  if(btnOdontoSim) btnOdontoSim.addEventListener('click',()=>{ odontoSetupMode='marking'; odontoSetupMap={}; render(); });
  const btnOdontoNao=document.getElementById('btnOdontoNao');
  if(btnOdontoNao) btnOdontoNao.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    p.odonto={dentes:{},gerais:[]}; saveData(); render();
  });
  const btnEditMarks=document.getElementById('btnEditMarks');
  if(btnEditMarks) btnEditMarks.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    odontoSetupMap={};
    Object.keys(p.odonto.dentes||{}).forEach(n=>{ if(p.odonto.dentes[n].status) odontoSetupMap[n]=p.odonto.dentes[n].status; });
    odontoSetupMode='marking'; odontoToothOpenNum=null; render();
  });
  const btnConfirmMark=document.getElementById('btnConfirmMark');
  if(btnConfirmMark) btnConfirmMark.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    if(!p.odonto) p.odonto={dentes:{},gerais:[]};
    allTeethNumbers(p).forEach(n=>{
      const newStatus=odontoSetupMap[n];
      const existing=p.odonto.dentes[n];
      if(newStatus){ p.odonto.dentes[n]=Object.assign({procedimentos:[]},existing||{},{status:newStatus}); }
      else if(existing){ delete existing.status; if(!existing.procedimentos||!existing.procedimentos.length) delete p.odonto.dentes[n]; }
    });
    saveData(); odontoSetupMode=null; odontoSetupMap={}; render();
  });
  const btnCancelMark=document.getElementById('btnCancelMark');
  if(btnCancelMark) btnCancelMark.addEventListener('click',()=>{ odontoSetupMode=null; odontoSetupMap={}; render(); });
  document.querySelectorAll('.tooth-btn').forEach(b=>b.addEventListener('click',()=>{
    const n=b.getAttribute('data-tooth');
    if(odontoSetupMode==='marking'){
      const cur=odontoSetupMap[n];
      if(!cur) odontoSetupMap[n]='ausente'; else if(cur==='ausente') odontoSetupMap[n]='extraido'; else delete odontoSetupMap[n];
      render();
    } else {
      odontoToothOpenNum=n; render();
    }
  }));
  const btnCloseTooth=document.getElementById('btnCloseTooth');
  if(btnCloseTooth) btnCloseTooth.addEventListener('click',()=>{ odontoToothOpenNum=null; render(); });
  const btnRemoveMark=document.getElementById('btnRemoveMark');
  if(btnRemoveMark) btnRemoveMark.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const rec=p.odonto.dentes[odontoToothOpenNum];
    if(rec){ delete rec.status; if(!rec.procedimentos||!rec.procedimentos.length) delete p.odonto.dentes[odontoToothOpenNum]; }
    saveData(); render();
  });
  const btnAddToothProc=document.getElementById('btnAddToothProc');
  if(btnAddToothProc) btnAddToothProc.addEventListener('click',()=>{
    const sel=document.getElementById('toothProcSel');
    if(!sel.value) return;
    const pr=state.procedimentos.find(x=>x.id===sel.value);
    const p=state.patients.find(x=>x.id===patientDetailId);
    const n=odontoToothOpenNum;
    p.odonto.dentes[n]=p.odonto.dentes[n]||{procedimentos:[]};
    p.odonto.dentes[n].procedimentos=p.odonto.dentes[n].procedimentos||[];
    p.odonto.dentes[n].procedimentos.push({id:uid(),procId:pr.id,nome:pr.nome,especialidade:pr.especialidade,valor:pr.valor,tempoMin:pr.tempoMin,status:(document.getElementById('toothProcSit')||{}).value||'Planejado'});
    saveData(); render();
  });
  document.querySelectorAll('[data-rmtoothproc]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const rec=p.odonto.dentes[odontoToothOpenNum];
    rec.procedimentos.splice(parseInt(b.getAttribute('data-rmtoothproc')),1);
    if(!rec.status && !rec.procedimentos.length) delete p.odonto.dentes[odontoToothOpenNum];
    saveData(); render();
  }));
  const btnAddGeral=document.getElementById('btnAddGeral');
  if(btnAddGeral) btnAddGeral.addEventListener('click',()=>{
    const sel=document.getElementById('geralProcSel');
    if(!sel.value) return;
    const pr=state.procedimentos.find(x=>x.id===sel.value);
    const p=state.patients.find(x=>x.id===patientDetailId);
    p.odonto.gerais=p.odonto.gerais||[];
    p.odonto.gerais.push({id:uid(),procId:pr.id,nome:pr.nome,especialidade:pr.especialidade,valor:pr.valor,tempoMin:pr.tempoMin,arco:(pr.escopo==='geral'?'':document.getElementById('geralArco').value),status:(document.getElementById('geralProcSit')||{}).value||'Planejado'});
    saveData(); render();
  });
  document.querySelectorAll('[data-delorc]').forEach(b=>b.addEventListener('click',()=>{
    if(!permsDe(currentUser()).financeiro){ avisar('Você não tem permissão para excluir orçamentos.'); return; }
    const p=state.patients.find(x=>x.id===patientDetailId);
    const o=p.orcamentos.find(x=>x.id===b.getAttribute('data-delorc')); if(!o) return;
    const pagas=parcelasPagasDoOrc(o);
    if(pagas.length){ avisar(`Este orçamento tem ${pagas.length} parcela(s) já paga(s) no Fluxo Financeiro e não pode ser excluído. Para corrigir, desfaça os pagamentos no Financeiro antes.`); return; }
    const pend=(state.fluxoFinanceiro||[]).filter(e=>e.orcamentoId===o.id).length;
    customConfirm(pend?`Excluir este orçamento? As ${pend} parcela(s) pendente(s) dele também serão removidas do Fluxo Financeiro.`:'Excluir este orçamento?', ()=>{
      state.fluxoFinanceiro=(state.fluxoFinanceiro||[]).filter(e=>e.orcamentoId!==o.id);
      p.orcamentos=p.orcamentos.filter(x=>x.id!==o.id);
      saveData(); render();
    });
  }));
  document.querySelectorAll('[data-approveorc]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    if(!permsDe(currentUser()).financeiro){ avisar('Você não tem permissão para aprovar orçamentos.'); return; }
    const o=p.orcamentos.find(x=>x.id===b.getAttribute('data-approveorc'));
    o.status='aprovado'; o.aprovadoPorId=currentUser().id; o.aprovadoPorNome=currentUser().nomeCompleto;
    o.dataAprovacao=hojeISO();
    saveData(); render();
  }));
  document.querySelectorAll('[data-finfield]').forEach(el=>el.addEventListener('change',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const o=p.orcamentos.find(x=>x.id===el.getAttribute('data-orcid'));
    o.pagamento=o.pagamento||{};
    o.pagamento[el.getAttribute('data-finfield')]=el.value;
    saveData();
    render();
  }));
  document.querySelectorAll('[data-genfluxo]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const o=p.orcamentos.find(x=>x.id===b.getAttribute('data-genfluxo'));
    if(!permsDe(currentUser()).financeiro){ avisar('Você não tem permissão para o financeiro.'); return; }
    const pagas=parcelasPagasDoOrc(o);
    if(pagas.length){
      const totPago=pagas.reduce((s,e)=>s+(e.valor||0),0);
      confirmarAcao(`Este orçamento já tem ${pagas.length} parcela(s) paga(s), somando ${fmtMoney(totPago)}. Elas serão mantidas e apenas o saldo de ${fmtMoney((o.total||0)-totPago)} será redistribuído nas parcelas pendentes. Continuar?`,'Atualizar Fluxo',()=>{ generateFluxo(p,o); render(); });
      return;
    }
    generateFluxo(p,o); render();
  }));
  document.querySelectorAll('[data-confpag]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.getAttribute('data-confpag');
    const input=document.querySelector(`[data-pagdata="${id}"]`);
    if(!input || !input.value){ avisar('Informe a data de pagamento antes de confirmar.'); return; }
    const e=state.fluxoFinanceiro.find(x=>x.id===id);
    e.dataPagamento=input.value; e.confirmado=true;
    saveData(); render();
  }));
  document.querySelectorAll('[data-undoconf]').forEach(b=>b.addEventListener('click',()=>{
    const e=state.fluxoFinanceiro.find(x=>x.id===b.getAttribute('data-undoconf'));
    e.confirmado=false;
    saveData(); render();
  }));
  document.querySelectorAll('[data-finsub]').forEach(b=>b.addEventListener('click',()=>{
    financeiroSubTab=b.getAttribute('data-finsub'); render();
  }));
  const btnNewAgendamento=document.getElementById('btnNewAgendamento');
  if(btnNewAgendamento) btnNewAgendamento.addEventListener('click',()=>openAgendamentoForm(null));
  document.querySelectorAll('[data-agresp]').forEach(b=>b.addEventListener('click',()=>{
    const [id,v]=b.getAttribute('data-agresp').split('|'); mudarStatusAg(id, v==='sim'?'confirmado':'nao_vem');
  }));
  document.querySelectorAll('[data-avzap]').forEach(b=>b.addEventListener('click',()=>{
    const a=(state.agendamentos||[]).find(x=>x.id===b.getAttribute('data-avzap')); if(!a) return;
    const pc=pacPorId(a.pacienteId); if(!pc){ avisar('Paciente não encontrado.'); return; }
    abrirWhatsApp(pc,mensagemContatoNao(a,pc),null);
  }));
  document.querySelectorAll('[data-avremarcar]').forEach(b=>b.addEventListener('click',()=>{
    const a=(state.agendamentos||[]).find(x=>x.id===b.getAttribute('data-avremarcar')); if(!a) return;
    currentTab='agenda'; agendaViewMode='dia'; agendaViewDate=a.data; patientDetailId=null; render(); openAgendamentoForm(a);
  }));
  document.querySelectorAll('[data-avcancelar]').forEach(b=>b.addEventListener('click',()=>mudarStatusAg(b.getAttribute('data-avcancelar'),'cancelado')));
  document.querySelectorAll('[data-avresolvido]').forEach(b=>b.addEventListener('click',()=>{
    const v=(state.avisos||[]).find(x=>x.id===b.getAttribute('data-avresolvido')); if(v){ v.tratado=true; v.lido=true; saveData(); render(); }
  }));
  document.querySelectorAll('[data-avok]').forEach(b=>b.addEventListener('click',()=>{
    const v=(state.avisos||[]).find(x=>x.id===b.getAttribute('data-avok')); if(v){ v.lido=true; saveData(); render(); }
  }));
  document.querySelectorAll('[data-agwpp]').forEach(b=>b.addEventListener('click',()=>{
    const a=(state.agendamentos||[]).find(x=>x.id===b.getAttribute('data-agwpp')); if(a) enviarLembrete(a);
  }));
  document.querySelectorAll('[data-agstatus]').forEach(sel=>sel.addEventListener('change',()=>mudarStatusAg(sel.getAttribute('data-agstatus'),sel.value)));
  const agLembData_=document.getElementById('agLembData');
  if(agLembData_) agLembData_.addEventListener('change',()=>{ agendaLembData=agLembData_.value||agendaLembData; render(); });
  const agLembPrev=document.getElementById('agLembPrev'), agLembNext=document.getElementById('agLembNext');
  if(agLembPrev) agLembPrev.addEventListener('click',()=>{ agendaLembData=addDaysStr(agendaLembData,-1); render(); });
  if(agLembNext) agLembNext.addEventListener('click',()=>{ agendaLembData=addDaysStr(agendaLembData,1); render(); });
  document.querySelectorAll('[data-editag]').forEach(b=>b.addEventListener('click',()=>{
    openAgendamentoForm((state.agendamentos||[]).find(a=>a.id===b.getAttribute('data-editag')));
  }));
  document.querySelectorAll('[data-delag]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Excluir este agendamento? Para manter o histórico (faltas e cancelamentos), prefira mudar a situação para Cancelado.', ()=>{
      const ag=state.agendamentos.find(a=>a.id===b.getAttribute('data-delag'));
      if(ag) removerEvolucaoPendente(ag);
      state.avisos=(state.avisos||[]).filter(v=>v.agendamentoId!==b.getAttribute('data-delag'));
      state.agendamentos=state.agendamentos.filter(a=>a.id!==b.getAttribute('data-delag'));
      saveData(); render();
    });
  }));
  document.querySelectorAll('[data-agview]').forEach(b=>b.addEventListener('click',()=>{
    agendaViewMode=b.getAttribute('data-agview'); render();
  }));
  document.querySelectorAll('[data-gotodia]').forEach(b=>b.addEventListener('click',()=>{
    agendaViewDate=b.getAttribute('data-gotodia'); agendaViewMode='dia'; render();
  }));
  const agPrevDia=document.getElementById('agPrevDia');
  if(agPrevDia) agPrevDia.addEventListener('click',()=>{ agendaViewDate=addDaysStr(agendaViewDate,-1); render(); });
  const agNextDia=document.getElementById('agNextDia');
  if(agNextDia) agNextDia.addEventListener('click',()=>{ agendaViewDate=addDaysStr(agendaViewDate,1); render(); });
  const agDataDia=document.getElementById('agDataDia');
  if(agDataDia) agDataDia.addEventListener('change',()=>{ agendaViewDate=agDataDia.value; render(); });
  const agPrevSemana=document.getElementById('agPrevSemana');
  if(agPrevSemana) agPrevSemana.addEventListener('click',()=>{ agendaViewDate=addDaysStr(agendaViewDate,-7); render(); });
  const agNextSemana=document.getElementById('agNextSemana');
  if(agNextSemana) agNextSemana.addEventListener('click',()=>{ agendaViewDate=addDaysStr(agendaViewDate,7); render(); });
  const agPrevMes=document.getElementById('agPrevMes');
  if(agPrevMes) agPrevMes.addEventListener('click',()=>{ agendaViewDate=shiftMonth(agendaViewDate.slice(0,7),-1)+'-01'; render(); });
  const agNextMes=document.getElementById('agNextMes');
  if(agNextMes) agNextMes.addEventListener('click',()=>{ agendaViewDate=shiftMonth(agendaViewDate.slice(0,7),1)+'-01'; render(); });
  const agMesInput=document.getElementById('agMesInput');
  if(agMesInput) agMesInput.addEventListener('change',()=>{ agendaViewDate=agMesInput.value+'-01'; render(); });
  document.querySelectorAll('[data-fluxoview]').forEach(b=>b.addEventListener('click',()=>{
    fluxoViewMode=b.getAttribute('data-fluxoview'); render();
  }));
  const fluxoDataDia=document.getElementById('fluxoDataDia');
  if(fluxoDataDia) fluxoDataDia.addEventListener('change',()=>{ fluxoViewDate=fluxoDataDia.value; render(); });
  const fluxoPerIni=document.getElementById('fluxoPerIni');
  if(fluxoPerIni) fluxoPerIni.addEventListener('change',()=>{ fluxoPeriodoInicio=fluxoPerIni.value; render(); });
  const fluxoPerFim=document.getElementById('fluxoPerFim');
  if(fluxoPerFim) fluxoPerFim.addEventListener('change',()=>{ fluxoPeriodoFim=fluxoPerFim.value; render(); });
  const fluxoMes=document.getElementById('fluxoMes');
  if(fluxoMes) fluxoMes.addEventListener('change',()=>{ fluxoMesRef=fluxoMes.value; render(); });
  document.querySelectorAll('[data-consub]').forEach(b=>b.addEventListener('click',()=>{
    configSubTab=b.getAttribute('data-consub'); render();
  }));
  const btnNewTipoDesp=document.getElementById('btnNewTipoDesp');
  if(btnNewTipoDesp) btnNewTipoDesp.addEventListener('click',()=>openTipoDespForm(null));
  document.querySelectorAll('[data-edittipodesp]').forEach(b=>b.addEventListener('click',()=>{
    openTipoDespForm(state.despesasCatalogo.find(d=>d.id===b.getAttribute('data-edittipodesp')));
  }));
  document.querySelectorAll('[data-deltipodesp]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Excluir este tipo de despesa?', ()=>{
      state.despesasCatalogo=state.despesasCatalogo.filter(d=>d.id!==b.getAttribute('data-deltipodesp'));
      saveData(); render();
    });
  }));
  const fDespesa=document.getElementById('fDespesa');
  if(fDespesa) fDespesa.addEventListener('submit', ev=>{
    ev.preventDefault();
    const tipo=state.despesasCatalogo.find(d=>d.id===dpTipo.value);
    state.fluxoFinanceiro=state.fluxoFinanceiro||[];
    state.fluxoFinanceiro.push({id:uid(), tipo:'despesa', categoria:tipo?tipo.categoria:'', fornecedor:dpFornecedor.value.trim(), label:tipo?tipo.nome:'',
      valor:parseFloat(dpValor.value)||0, vencimento:dpVencimento.value, confirmado:false, dataPagamento:''});
    saveData(); financeiroSubTab='fluxo'; render();
  });
  document.querySelectorAll('[data-delfluxo]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Excluir esta despesa?', ()=>{
      state.fluxoFinanceiro=state.fluxoFinanceiro.filter(x=>x.id!==b.getAttribute('data-delfluxo'));
      saveData(); render();
    });
  }));
  document.querySelectorAll('[data-planochk]').forEach(inp=>inp.addEventListener('change',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const rec=findProcedimentoRecordById(p, inp.getAttribute('data-planochk'));
    if(rec){ rec.incluirOrcamento=inp.checked; saveData(); }
  }));
  const btnConfirmPlano=document.getElementById('btnConfirmPlano');
  if(btnConfirmPlano) btnConfirmPlano.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const items=collectPlanoItems(p);
    const order=getPlanoOrder(p, items);
    const byId={}; items.forEach(it=>byId[it.id]=it);
    const itensSnapshot=order.map(id=>byId[id]);
    p.planosConfirmados=p.planosConfirmados||[];
    const planoDoc={id:uid(), data:hojeISO(), itens:itensSnapshot};
    p.planosConfirmados.push(planoDoc);
    const incluidos=itensSnapshot.filter(it=>it.incluido);
    const total=incluidos.reduce((s,it)=>s+(it.valor||0),0);
    p.orcamentos=p.orcamentos||[];
    p.orcamentos.push({id:uid(), data:planoDoc.data, planoId:planoDoc.id, status:'pendente',
      itens:incluidos.map(it=>({nome:it.nome,especialidade:it.especialidade,ref:it.ref,valor:it.valor})), total});
    saveData();
    patientDetailTab='orcamento';
    render();
  });
  document.querySelectorAll('[data-planobs]').forEach(inp=>inp.addEventListener('change',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const rec=findProcedimentoRecordById(p, inp.getAttribute('data-planobs'));
    if(rec){ rec.obs=inp.value; saveData(); }
  }));
  document.querySelectorAll('[data-planoup]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const arr=p.planoTratamento; const i=arr.indexOf(b.getAttribute('data-planoup'));
    if(i>0){ [arr[i-1],arr[i]]=[arr[i],arr[i-1]]; saveData(); render(); }
  }));
  document.querySelectorAll('[data-planodown]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const arr=p.planoTratamento; const i=arr.indexOf(b.getAttribute('data-planodown'));
    if(i<arr.length-1){ [arr[i+1],arr[i]]=[arr[i],arr[i+1]]; saveData(); render(); }
  }));
  document.querySelectorAll('[data-rmgeral]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    p.odonto.gerais.splice(parseInt(b.getAttribute('data-rmgeral')),1);
    saveData(); render();
  }));
  const btnBackPatients=document.getElementById('btnBackPatients');
  if(btnBackPatients) btnBackPatients.addEventListener('click',()=>{ patientDetailId=null; anamneseOpenId=null; render(); });
  document.querySelectorAll('[data-opentab]').forEach(b=>b.addEventListener('click',()=>{
    patientDetailTab=b.getAttribute('data-opentab'); anamneseOpenId=null; docFormType=null; docOpenId=null; exameOpenId=null;
    odontoSetupMode=null; odontoSetupMap={}; odontoToothOpenNum=null; render();
  }));
  document.querySelectorAll('[data-newanamnese]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.patients.find(x=>x.id===patientDetailId);
    const rec=addAnamnese(p, b.getAttribute('data-newanamnese'));
    anamneseOpenId=rec.id; render();
  }));
  document.querySelectorAll('[data-viewanamnese]').forEach(b=>b.addEventListener('click',()=>{
    anamneseOpenId=b.getAttribute('data-viewanamnese'); render();
  }));
  document.querySelectorAll('[data-delanamnese]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Excluir esta anamnese?', ()=>{
      const p=state.patients.find(x=>x.id===patientDetailId);
      p.anamneses=p.anamneses.filter(r=>r.id!==b.getAttribute('data-delanamnese'));
      saveData(); render();
    });
  }));
  const btnBackAnamnese=document.getElementById('btnBackAnamnese');
  if(btnBackAnamnese) btnBackAnamnese.addEventListener('click',()=>{ anamneseOpenId=null; render(); });
  const fAnamnese=document.getElementById('fAnamnese');
  if(fAnamnese) fAnamnese.addEventListener('submit', ev=>{
    ev.preventDefault();
    const p=state.patients.find(x=>x.id===patientDetailId);
    const rec=p.anamneses.find(r=>r.id===anamneseOpenId);
    rec.dados={
      tratamentoMedico:anTratamento.value, tratamentoQual:anTratamentoQual.value,
      medicamentosContinuos:anMedicamentos.value, alergiaMedicamentos:anAlergiaMed.value,
      alergiaAnestesico:anAlergiaAnest.value, alergiaAnestesicoDetalhe:anAlergiaAnestDet.value,
      alergiaLatex:anAlergiaLatex.value,
      docDiabetes:docDiabetes.checked, docHipertensao:docHipertensao.checked, docCardiopatia:docCardiopatia.checked,
      docRenal:docRenal.checked, docHepatite:docHepatite.checked, docHiv:docHiv.checked,
      docRespiratoria:docRespiratoria.checked, docCoagulacao:docCoagulacao.checked, docEpilepsia:docEpilepsia.checked,
      docOsteoporose:docOsteoporose.checked, docCancer:docCancer.checked, docOutras:docOutras.value,
      gestante:anGestante.value, gestanteMeses:anGestanteMeses.value, amamentando:anAmamentando.value,
      fumante:anFumante.value, etilista:anEtilista.value,
      sangramentoGengival:anSangramento.value, bruxismo:anBruxismo.value, fioDental:anFioDental.value,
      ultimaVisita:anUltimaVisita.value, escovacaoDiaria:anEscovacao.value, observacoes:anObservacoes.value
    };
    rec.finalizado=true;
    saveData(); anamneseOpenId=null; render();
  });
  const fHarm=document.getElementById('fHarm');
  if(fHarm) fHarm.addEventListener('submit', ev=>{
    ev.preventDefault();
    const p=state.patients.find(x=>x.id===patientDetailId);
    const rec=p.anamneses.find(r=>r.id===anamneseOpenId);
    const dados={};
    fHarm.querySelectorAll('[data-q]').forEach(el=>{ dados[el.getAttribute('data-q')]=el.value; });
    rec.dados=dados;
    rec.finalizado=true;
    saveData(); anamneseOpenId=null; render();
  });

  const bindBusca=(id,setter)=>{
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener('input',()=>{
      const pos=el.selectionStart; setter(el.value); render();
      const n=document.getElementById(id); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} }
    });
  };
  bindBusca('procBusca',v=>{ procBusca=v; });
  bindBusca('tabBusca',v=>{ tabBusca=v; });
  const selProcGrupo=document.getElementById('procGrupoSel');
  if(selProcGrupo) selProcGrupo.addEventListener('change',()=>{ procFiltroGrupo=selProcGrupo.value; render(); });
  const selTabGrupo=document.getElementById('tabGrupoSel');
  if(selTabGrupo) selTabGrupo.addEventListener('change',()=>{ tabFiltroGrupo=selTabGrupo.value; render(); });
  const btnPrintTabela=document.getElementById('btnPrintTabela');
  if(btnPrintTabela) btnPrintTabela.addEventListener('click',()=>{
    try{ window.print(); }catch(e){ avisar('Não foi possível abrir a impressão. Use Ctrl+P (⌘+P) para imprimir esta página.'); }
  });
  const btnNewProc=document.getElementById('btnNewProc');
  if(btnNewProc) btnNewProc.addEventListener('click',()=>openProcForm(null));
  const btnNewGrupo=document.getElementById('btnNewGrupo');
  if(btnNewGrupo) btnNewGrupo.addEventListener('click',()=>openGrupoForm(null));
  document.querySelectorAll('[data-editproc]').forEach(b=>b.addEventListener('click',()=>{
    openProcForm(state.procedimentos.find(pr=>pr.id===b.getAttribute('data-editproc')));
  }));
  document.querySelectorAll('[data-editgrupo]').forEach(b=>b.addEventListener('click',()=>{
    openGrupoForm(state.grupos.find(g=>g.id===b.getAttribute('data-editgrupo')));
  }));
  document.querySelectorAll('[data-delproc]').forEach(b=>b.addEventListener('click',()=>{
    customConfirm('Excluir este procedimento?', ()=>{ state.procedimentos=state.procedimentos.filter(pr=>pr.id!==b.getAttribute('data-delproc')); saveData(); render(); });
  }));
  document.querySelectorAll('[data-delgrupo]').forEach(b=>b.addEventListener('click',()=>{
    const g=state.grupos.find(x=>x.id===b.getAttribute('data-delgrupo')); if(!g) return;
    const n=state.procedimentos.filter(pr=>pr.especialidade===g.nome).length;
    if(n){ avisar(`O grupo "${g.nome}" ainda tem ${n} procedimento(s). Exclua ou mova esses procedimentos para outro grupo (pelo botão Editar) antes de excluir o grupo.`); return; }
    customConfirm(`Excluir o grupo "${g.nome}"?`, ()=>{ state.grupos=state.grupos.filter(x=>x.id!==g.id); if(procFiltroGrupo===g.nome) procFiltroGrupo=''; saveData(); render(); });
  }));
  const fClinicEdit=document.getElementById('fClinicEdit');
  if(fClinicEdit && currentUser().tipo==='master') fClinicEdit.addEventListener('submit',e=>{
    e.preventDefault();
    state.clinic={nome:cNome.value.trim(),endereco:cEndereco.value.trim(),telefone:cTelefone.value.trim(),email:cEmail.value.trim()};
    saveData(); avisar('Dados da clínica atualizados.'); render();
  });
}

async function boot(){
  if(NUVEM) return bootNuvem();
  document.getElementById('app').innerHTML='<div class="wrap"><div class="card center"><p class="muted">Carregando…</p></div></div>';
  await carregarDados();
  try{ ensureProcedimentos(); }catch(e){ console.error(e); }
  try{ await migrarSenhas(); }catch(e){ console.error(e); }
  view = state.clinic ? (state.users.length? 'login':'setupUser') : 'setupClinic';
  if(view==='login' && session && state.users.find(u=>u.id===session)) view='home';
  render();
}
boot();
