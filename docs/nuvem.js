// =====================================================================
// OdontoGestão — camada de nuvem (Firebase Authentication + Firestore)
// ---------------------------------------------------------------------
// • Login por e-mail/senha ou Google; só entra quem o Master cadastrou.
// • Cada clínica tem seus dados em clinicas/{id}/... no Firestore (São Paulo).
//   O índice membros/{e-mail} diz em qual clínica cada pessoa entra.
// • Coleções grandes são guardadas em "baldes": cada documento reúne
//   vários itens (pacientes, agendamentos...). Isso reduz muito o número
//   de leituras cobradas a cada abertura do sistema. Cada item é gravado
//   como um campo próprio do balde, então duas pessoas editando itens
//   diferentes ao mesmo tempo não se sobrescrevem.
// • Usuários e acessos ficam um por documento, porque as regras de
//   segurança do servidor precisam ler os campos deles.
// =====================================================================
(function(){
'use strict';
const CFG = window.FIREBASE_CONFIG || {};
const ATIVA = !!(CFG.apiKey && CFG.projectId);
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
let CLINICA = 'principal';                 // clínica original (sem ficha de plano)
// administrador da plataforma: o mesmo e-mail das regras do Firestore (só muda o que aparece na tela;
// quem garante o acesso são as regras)
const ADMIN_EMAIL = window.ODONTO_ADMIN_EMAIL || 'aryson.odontologia@gmail.com';
const PROJETO_PRODUCAO = 'odontogestao-c8218';

// Número de baldes por coleção. NÃO altere depois que houver dados.
const COLS = {
  patients:         {nome:'pacientes',     baldes:32, perm:'pacientes'},
  agendamentos:     {nome:'agendamentos',  baldes:16, perm:null},
  fluxoFinanceiro:  {nome:'fluxo',         baldes:8,  perm:'financeiro'},
  avisos:           {nome:'avisos',        baldes:4,  perm:null},
  despesasCatalogo: {nome:'despesas',      baldes:1,  perm:'financeiro'},
  procedimentos:    {nome:'procedimentos', baldes:2,  perm:null},
  grupos:           {nome:'grupos',        baldes:1,  perm:null},
};
const LIMITE_BALDE = 1000*1000;     // limite do Firestore: ~1 MB por documento
const ALERTA_BALDE = 800*1000;
const LIMITE_IMG   = 990*1000;      // imagem comprimida (data URL) por documento

let A=null, F=null, app=null, auth=null, db=null;
let hooks={}, usuario=null, acesso=null, souMaster=false, pronto=false;
let pendentes=0, unsubs=[];
const srv={}, conhecidos={}, lidos={};
const srvUsers=new Map(), srvAc=new Map(), srvCfg={};
const cacheImg={};

// ---------- utilidades ----------
const normEmail = e => String(e||'').trim().toLowerCase();
function canon(v){
  if(v===null || typeof v!=='object') return JSON.stringify(v===undefined?null:v);
  if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
  return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
}
function balde(id,n){
  let h=2166136261;
  for(let i=0;i<id.length;i++){ h^=id.charCodeAt(i); h=Math.imul(h,16777619); }
  return 'b'+String((h>>>0)%n).padStart(2,'0');
}
function novoId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
const ref    = (...p)=>F.doc(db,'clinicas',CLINICA,...p);
const colRef = n=>F.collection(db,'clinicas',CLINICA,n);
function limparUsuario(u){
  const c=JSON.parse(JSON.stringify(u||{}));
  delete c.senhaHash; delete c.senhaSalt; delete c.senhaIter; delete c.password; delete c._p;
  if(c.email!==undefined) c.email=normEmail(c.email);
  return c;
}
function meuEmail(){ return usuario?normEmail(usuario.email):''; }

const ERROS={
  'auth/invalid-credential':'E-mail ou senha incorretos.',
  'auth/wrong-password':'E-mail ou senha incorretos.',
  'auth/user-not-found':'E-mail ou senha incorretos.',
  'auth/invalid-email':'E-mail inválido.',
  'auth/missing-password':'Digite a senha.',
  'auth/email-already-in-use':'Este e-mail já tem cadastro. Use "Entrar". Se ele entra pelo Google, use o botão do Google ou "Esqueci minha senha" para criar uma senha.',
  'auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests':'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed':'Sem conexão com a internet.',
  'auth/popup-closed-by-user':'O login com Google foi fechado antes de terminar.',
  'auth/cancelled-popup-request':'O login com Google foi fechado antes de terminar.',
  'auth/unauthorized-domain':'Este endereço ainda não foi autorizado no Firebase (LEIAME, passo "Domínios autorizados").',
  'auth/operation-not-allowed':'Este tipo de login não está ativado no Firebase (LEIAME, passo 1).',
  'auth/user-disabled':'Esta conta foi desativada.',
  'auth/requires-recent-login':'Por segurança, saia e entre de novo antes de fazer isso.',
  'permission-denied':'Sem permissão para esta operação.',
  'unavailable':'Sem conexão com o servidor. Verifique a internet.',
  'failed-precondition':'O navegador bloqueou o banco local. Feche outras abas do sistema e recarregue.',
  'invalid-argument':'Um registro ficou grande demais para a nuvem.',
  'resource-exhausted':'O limite gratuito do Firebase foi atingido hoje.',
};
function mapErro(e){
  const c=(e&&e.code)||'';
  if(ERROS[c]) return ERROS[c];
  return 'Erro: '+((e&&e.message)||String(e));
}

// ---------- inicialização ----------
async function carregarSDK(publico){
  const [mApp,mAuth,mFs]=await Promise.all([
    import(SDK+'firebase-app.js'), import(SDK+'firebase-auth.js'), import(SDK+'firebase-firestore.js')]);
  A=mAuth; F=mFs;
  app=mApp.initializeApp(CFG);
  auth=A.getAuth(app); auth.languageCode='pt-BR';
  try{
    // página pública do paciente: nada fica guardado no aparelho dele
    db=publico?F.initializeFirestore(app,{localCache:F.memoryLocalCache()})
      :F.initializeFirestore(app,{localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})});
  }catch(e){
    console.warn('Cache local indisponível; usando só memória.',e);
    db=F.initializeFirestore(app,{localCache:F.memoryLocalCache()});
  }
}
async function iniciar(h){
  hooks=h||{};
  await carregarSDK();
  A.getRedirectResult(auth).catch(e=>{ if(hooks.onErroLogin) hooks.onErroLogin(mapErro(e)); });
  A.onAuthStateChanged(auth,u=>{ usuario=u; if(hooks.onAuth) hooks.onAuth(u); });
  window.addEventListener('online',status); window.addEventListener('offline',status);
}

// ---------- formulários enviados ao paciente (anamnese e termo) ----------
let formularios=[];
function tokenNovo(){ const b=crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
const ms=v=>v&&v.toMillis?v.toMillis():(typeof v==='number'?v:0);
// devolve o código na hora (o WhatsApp precisa abrir no mesmo clique); a gravação segue em segundo plano
function criarFormulario(dados,dias){
  const token=tokenNovo();
  const doc=Object.assign({},dados,{status:'pendente',criadoEm:F.serverTimestamp(),criadoPor:meuEmail(),
    expiraEm:F.Timestamp.fromMillis(Date.now()+(dias||7)*86400000)});
  acompanhar(F.setDoc(ref('formularios',token),doc));
  return token;
}
function apagarFormulario(token){ acompanhar(F.deleteDoc(ref('formularios',token))); }
function ouvirFormularios(){
  return primeiraVez('formularios','formularios',(fim,erro)=>F.onSnapshot(colRef('formularios'),OPC,snap=>{
    formularios=snap.docs.map(d=>{ const x=d.data(); return Object.assign({},x,{token:d.id,expiraEm:ms(x.expiraEm),criadoEm:ms(x.criadoEm)||Date.now(),respondidoEm:ms(x.respondidoEm)}); });
    const st=hooks.estado(); if(st) st.formularios=formularios;
    if(!lidos.formularios){ if(!soCache(snap)) fim(); return; }
    if(snap.docChanges().length && hooks.onRemoto) hooks.onRemoto('formularios');
  },erro));
}
// página pública
async function iniciarPublico(cid){ await carregarSDK(true); if(cid) CLINICA=String(cid).replace(/[^\w-]/g,''); }
async function lerFormularioPublico(token){
  try{ const s=await F.getDocFromServer(ref('formularios',token)); if(!s.exists()) return null; const x=s.data(); return Object.assign({},x,{expiraEm:ms(x.expiraEm)}); }
  catch(e){ if(e && e.code==='permission-denied') return null; throw e; }
}
async function responderFormularioPublico(token,resp){
  await F.updateDoc(ref('formularios',token),{status:'respondido',respostas:resp.respostas||{},assinatura:resp.assinatura,
    nomeAssinante:resp.nomeAssinante||'',docAssinante:resp.docAssinante||'',dispositivo:resp.dispositivo||'',respondidoEm:F.serverTimestamp()});
}

// ---------- login ----------
async function entrarGoogle(){
  const prov=new A.GoogleAuthProvider(); prov.setCustomParameters({prompt:'select_account'});
  try{ await A.signInWithPopup(auth,prov); }
  catch(e){
    if(e && (e.code==='auth/popup-blocked' || e.code==='auth/operation-not-supported-in-this-environment')){ await A.signInWithRedirect(auth,prov); return; }
    throw e;
  }
}
const entrarEmail = (email,senha)=>A.signInWithEmailAndPassword(auth,normEmail(email),senha);
async function criarConta(email,senha){
  const cred=await A.createUserWithEmailAndPassword(auth,normEmail(email),senha);
  try{ await A.sendEmailVerification(cred.user); }catch(e){ console.warn(e); }
}
async function reenviarVerificacao(){ if(usuario) await A.sendEmailVerification(usuario); }
async function verificarDeNovo(){
  if(!usuario) return false;
  await usuario.reload(); usuario=auth.currentUser;
  if(usuario && usuario.emailVerified){ await usuario.getIdToken(true); return true; }
  return false;
}
const redefinirSenha = email=>A.sendPasswordResetEmail(auth,normEmail(email));

async function sair(forcar){
  if(db && !forcar && pendentes>0){
    try{ await Promise.race([F.waitForPendingWrites(db), new Promise((_,r)=>setTimeout(()=>r(new Error('pendente')),6000))]); }
    catch(e){ return 'pendente'; }
  }
  unsubs.forEach(f=>{ try{ f(); }catch(_){} }); unsubs=[];
  try{ await A.signOut(auth); }catch(e){ console.error(e); }
  // apaga a cópia local dos dados deste navegador (segurança em computador compartilhado)
  try{ await F.terminate(db); await F.clearIndexedDbPersistence(db); }catch(e){ console.warn(e); }
  location.reload();
  return 'ok';
}

// ---------- clínica de cada pessoa ----------
let ficha=null, unFicha=null;
const fichaLimpa=x=>x?Object.assign({},x,{testeAte:ms(x.testeAte),criadaEm:ms(x.criadaEm),ativadaEm:ms(x.ativadaEm)}):null;
const ESPELHO_KEY='odonto-espelho';
function espelhoEscolhido(){ try{ return sessionStorage.getItem(ESPELHO_KEY)||''; }catch(e){ return ''; } }
function entrarEspelho(cid){ try{ if(cid) sessionStorage.setItem(ESPELHO_KEY,cid); else sessionStorage.removeItem(ESPELHO_KEY); }catch(e){} location.reload(); }
let emEspelho=false;
async function descobrirClinica(){
  const esp=espelhoEscolhido();
  if(esp && ambienteTeste() && meuEmail()===ADMIN_EMAIL){ CLINICA=esp; emEspelho=true; return esp; }
  let cid='principal';
  try{
    let s; try{ s=await F.getDocFromServer(F.doc(db,'membros',meuEmail())); }catch(e){ s=await F.getDoc(F.doc(db,'membros',meuEmail())); }
    if(s.exists() && s.data().cid) cid=String(s.data().cid);
  }catch(e){ console.warn('Índice de clínicas indisponível; usando a clínica principal.',e); }
  CLINICA=cid; return cid;
}
async function lerFicha(){
  try{ const s=await F.getDoc(F.doc(db,'clinicas',CLINICA)); ficha=s.exists()?fichaLimpa(s.data()):null; }
  catch(e){ ficha=null; }
  return ficha;
}
function ouvirFicha(){
  if(unFicha) return;
  unFicha=F.onSnapshot(F.doc(db,'clinicas',CLINICA),s=>{
    const nova=s.exists()?fichaLimpa(s.data()):null;
    if(JSON.stringify(nova)!==JSON.stringify(ficha)){ ficha=nova; if(hooks.onFicha) hooks.onFicha(ficha); }
  },e=>console.warn(e));
  unsubs.push(()=>{ unFicha(); unFicha=null; });
}
const souAdmin=()=>!!usuario && usuario.emailVerified && meuEmail()===ADMIN_EMAIL;
const ambienteTeste=()=>!!CFG.projectId && CFG.projectId!==PROJETO_PRODUCAO;

// índice e-mail -> clínica, gravado junto com os acessos
function idxOp(email,del){ return del?{r:F.doc(db,'membros',email),del:true}:{r:F.doc(db,'membros',email),d:{cid:CLINICA}}; }
async function reindexar(emails){
  // um por vez: se um e-mail já pertence a outra clínica, os demais seguem
  const r=await Promise.allSettled([...new Set(emails.filter(Boolean).map(normEmail))].map(e=>F.setDoc(F.doc(db,'membros',e),{cid:CLINICA})));
  return r.filter(x=>x.status==='rejected').length;
}

// 'livre' | 'aqui' | 'outra' — antes de cadastrar um e-mail num usuário
async function situacaoEmail(email){
  try{ const s=await F.getDoc(F.doc(db,'membros',normEmail(email))); if(!s.exists()) return 'livre'; return s.data().cid===CLINICA?'aqui':'outra'; }
  catch(e){ if(e && e.code==='permission-denied') return 'outra'; return 'livre'; }
}

// ---------- sugestões de melhoria (cada clínica na sua base) ----------
let sugestoes=[];
const sugLimpa=(d,cid)=>{ const x=d.data(); return Object.assign({},x,{id:d.id,cid:cid||CLINICA,criadoEm:ms(x.criadoEm)||Date.now(),respondidoEm:ms(x.respondidoEm)}); };
function ouvirSugestoes(){
  unsubs.push(F.onSnapshot(colRef('sugestoes'),s=>{
    sugestoes=s.docs.map(d=>sugLimpa(d)).sort((a,b)=>b.criadoEm-a.criadoEm);
    const st=hooks.estado(); if(st) st.sugestoes=sugestoes;
    if(pronto && hooks.onRemoto) hooks.onRemoto('sugestoes');
  },e=>console.warn('sugestões',e)));
}
function enviarSugestao(d){
  return F.setDoc(F.doc(colRef('sugestoes')),{texto:String(d.texto||'').slice(0,1990),categoria:d.categoria||'',autorNome:d.autorNome||'',autorEmail:meuEmail(),
    clinicaNome:d.clinicaNome||'',status:'recebida',resposta:'',criadoEm:F.serverTimestamp()});
}
function dbDe(amb){ return amb==='outro'&&T&&T.db?T.db:db; }
function apagarSugestao(id,cid,amb){ return F.deleteDoc(F.doc(dbDe(amb),'clinicas',cid||CLINICA,'sugestoes',id)); }
// administrador: sugestões de todas as clínicas
async function listarSugestoes(cids,amb){
  const base=dbDe(amb);
  const r=await Promise.allSettled(cids.map(cid=>F.getDocs(F.collection(base,'clinicas',cid,'sugestoes')).then(s=>s.docs.map(d=>Object.assign(sugLimpa(d,cid),{amb:amb||'aqui'})))));
  const l=r.filter(x=>x.status==='fulfilled').flatMap(x=>x.value).sort((a,b)=>b.criadoEm-a.criadoEm);
  // número sequencial de cada sugestão (S-1, S-2...), dado na primeira vez que o administrador vê
  const sem=l.filter(x=>!x.numero).sort((a,b)=>a.criadoEm-b.criadoEm);
  if(sem.length){
    try{
      const rc=F.doc(base,'plataforma','contadorSugestoes');
      const ini=await F.runTransaction(base,async t=>{ const s=await t.get(rc); const u=(s.exists()&&+s.data().ultimo)||0; t.set(rc,{ultimo:u+sem.length}); return u+1; });
      await Promise.allSettled(sem.map((x,i)=>{ x.numero=ini+i; return F.updateDoc(F.doc(base,'clinicas',x.cid,'sugestoes',x.id),{numero:x.numero}); }));
    }catch(e){ console.warn('numeração das sugestões',e); }
  }
  return l;
}
function responderSugestao(cid,id,mud,amb){
  const d=Object.assign({},mud); if('resposta' in d) d.respondidoEm=F.serverTimestamp();
  return F.updateDoc(F.doc(dbDe(amb),'clinicas',cid,'sugestoes',id),d);
}
// ---------- ponte entre os ambientes (só o administrador) ----------
// O teste lê a produção (clientes reais: versão, personalizações e sugestões) e a produção lê o teste.
// A configuração do outro projeto é gerada na publicação (config-outro.json).
let T=null;
async function ponteOutro(){
  if(T) return T;
  let cfg=window.ODONTO_CFG_OUTRO;
  if(!cfg){ const r=await fetch('config-outro.json',{cache:'no-store'}); if(!r.ok) throw new Error('Configuração do outro ambiente indisponível (publique de novo).'); cfg=await r.json(); }
  const mApp=await import(SDK+'firebase-app.js');
  const app2=mApp.initializeApp(cfg,'outro-ambiente');
  const auth2=A.getAuth(app2); auth2.languageCode='pt-BR';
  let db2; try{ db2=F.initializeFirestore(app2,{localCache:F.memoryLocalCache()}); }catch(e){ db2=F.getFirestore(app2); }
  T={auth:auth2,db:db2,user:null};
  await new Promise(r=>{ let feito=false; A.onAuthStateChanged(auth2,u=>{ T.user=u; if(!feito){ feito=true; r(); } }); setTimeout(()=>{ if(!feito){ feito=true; r(); } },4000); });
  return T;
}
async function outroConectado(){ try{ const t=await ponteOutro(); return !!(t.user && normEmail(t.user.email)===ADMIN_EMAIL); }catch(e){ return false; } }
async function conectarOutro(){
  const t=await ponteOutro(); const prov=new A.GoogleAuthProvider(); prov.setCustomParameters({prompt:'select_account',login_hint:ADMIN_EMAIL});
  const c=await A.signInWithPopup(t.auth,prov); t.user=(c&&c.user)||t.auth.currentUser;
  if(!t.user || normEmail(t.user.email)!==ADMIN_EMAIL){ try{ await A.signOut(t.auth); }catch(_){} t.user=null; throw new Error('Entre com '+ADMIN_EMAIL+'.'); }
}
async function clinicasOutro(){ const t=await ponteOutro(); const s=await F.getDocs(F.collection(t.db,'clinicas')); return s.docs.map(d=>Object.assign(fichaLimpa(d.data()),{id:d.id})); }
async function atualizarClinicaOutro(cid,mud){ const t=await ponteOutro(); await F.updateDoc(F.doc(t.db,'clinicas',cid),mud); }
async function salvarVitrineOutro(v){ const t=await ponteOutro(); if(t.user) await F.setDoc(F.doc(t.db,'plataforma','vitrine'),v); }
// vitrine (planos e melhorias previstas que as clínicas veem)
async function lerVitrine(){ try{ const s=await F.getDoc(F.doc(db,'plataforma','vitrine')); return s.exists()?s.data():null; }catch(e){ return null; } }
function salvarVitrine(v){ return F.setDoc(F.doc(db,'plataforma','vitrine'),v); }

// ---------- plataforma (somente o administrador) ----------
async function listarClinicas(){
  const s=await F.getDocs(F.collection(db,'clinicas'));
  return s.docs.map(d=>Object.assign(fichaLimpa(d.data()),{id:d.id}));
}
async function criarEspelho(f){
  const cid='espelho-'+String(f.id).replace(/[^\w-]/g,'').slice(0,40);
  await F.setDoc(F.doc(db,'clinicas',cid),{nome:'Teste · '+(f.nome||f.id),donoEmail:ADMIN_EMAIL,espelho:true,origem:{cid:f.id,nome:f.nome||''},
    plano:f.plano||'completo',modulos:f.modulos||{},dentistasExtras:+f.dentistasExtras||0,personalizacoes:f.personalizacoes||[],personalizacoesInfo:f.personalizacoesInfo||{},
    personalizacoesHist:f.personalizacoesHist||[],status:'ativa',criadaEm:F.serverTimestamp(),sincronizadoEm:F.serverTimestamp()},{merge:true});
  return cid;
}
async function sincronizarEspelho(cid,f){
  await F.updateDoc(F.doc(db,'clinicas',cid),{nome:'Teste · '+(f.nome||f.id),origem:{cid:f.id,nome:f.nome||''},plano:f.plano||'completo',modulos:f.modulos||{},dentistasExtras:+f.dentistasExtras||0,personalizacoes:f.personalizacoes||[],
    personalizacoesInfo:f.personalizacoesInfo||{},personalizacoesHist:f.personalizacoesHist||[],sincronizadoEm:F.serverTimestamp()});
}
async function criarClinica(dados){
  const cid=(dados.slug||'clinica')+'-'+novoId().slice(-5);
  const dono=normEmail(dados.donoEmail);
  const ex=await F.getDoc(F.doc(db,'membros',dono));
  if(ex.exists()){ const e=new Error('Este e-mail já está ligado a outra clínica ('+ex.data().cid+').'); e.code='email-em-uso'; throw e; }
  const wb=F.writeBatch(db);
  wb.set(F.doc(db,'clinicas',cid),{nome:dados.nome,donoEmail:dono,plano:dados.plano,modulos:dados.modulos||{},dentistasExtras:+dados.dentistasExtras||0,
    status:'teste',testeAte:F.Timestamp.fromMillis(Date.now()+(+dados.dias||30)*86400000),criadaEm:F.serverTimestamp(),obs:dados.obs||'',contato:dados.contato||''});
  wb.set(F.doc(db,'membros',dono),{cid});
  await wb.commit();
  return cid;
}
async function atualizarClinica(cid,mud){
  const d=Object.assign({},mud);
  if(typeof d.testeAte==='number') d.testeAte=F.Timestamp.fromMillis(d.testeAte);
  if(d.status==='ativa' && !d.ativadaEm) d.ativadaEm=F.serverTimestamp();
  await F.updateDoc(F.doc(db,'clinicas',cid),d);   // update troca o campo inteiro (módulos desmarcados somem)
}
function ouvirRoadmap(cb){
  const un=F.onSnapshot(F.collection(db,'roadmap'),s=>cb(s.docs.map(d=>Object.assign({},d.data(),{id:d.id}))),e=>{ console.error(e); cb(null,e); });
  unsubs.push(un); return un;
}
function salvarItemRoadmap(it){ const c=Object.assign({},it); const id=c.id||novoId(); delete c.id; c.atualizadoEm=Date.now(); if(!c.criadoEm) c.criadoEm=Date.now(); return F.setDoc(F.doc(db,'roadmap',id),c).then(()=>id); }
// números sequenciais das melhorias (#1, #2...): o contador nunca volta
async function numerarRoadmap(ids){
  const rc=F.doc(db,'plataforma','contador');
  const ini=await F.runTransaction(db,async t=>{ const s=await t.get(rc); const u=(s.exists()&&+s.data().ultimo)||0; t.set(rc,{ultimo:u+ids.length}); return u+1; });
  const wb=F.writeBatch(db); ids.forEach((id,i)=>wb.set(F.doc(db,'roadmap',id),{numero:ini+i},{merge:true})); await wb.commit();
  return ini;
}
function apagarItemRoadmap(id){ return F.deleteDoc(F.doc(db,'roadmap',id)); }
async function semearRoadmap(itens){
  const wb=F.writeBatch(db); itens.forEach(it=>{ const c=Object.assign({criadoEm:Date.now(),atualizadoEm:Date.now()},it); wb.set(F.doc(db,'roadmap',novoId()),c); }); await wb.commit();
}

// ---------- acesso ----------
async function carregarAcesso(){
  await descobrirClinica();
  const r=ref('acessos',meuEmail());
  let s;
  try{ s=await F.getDocFromServer(r); }catch(e){ s=await F.getDoc(r); }   // sem internet: cópia local
  return s.exists()?s.data():null;
}
// Primeiro acesso do responsável (o e-mail dele está nas regras do Firestore).
async function criarDono(){
  const r=ref('acessos',meuEmail());
  const ac={userId:novoId(), tipo:'master', ativo:true,
    perms:{usuarios:true,pacientes:true,clinica:true,procedimentos:true,financeiro:true}};
  try{
    // transação: se o acesso já existir no servidor, usa o existente (nunca sobrescreve)
    return await F.runTransaction(db,async t=>{ const s=await t.get(r); if(s.exists()) return s.data(); t.set(r,ac); return ac; });
  }catch(e){ if(e && e.code==='permission-denied') return null; throw e; }
}

// Lê os dados da clínica direto do servidor (ignora a cópia local do aparelho).
async function lerClinicaServidor(){
  try{
    const s=await F.getDocFromServer(ref('config','clinica'));
    if(!s.exists() || !s.data().d) return null;
    srvCfg.clinica=s.data().d; return JSON.parse(s.data().d);
  }catch(e){ if(e && e.code==='permission-denied') return null; throw e; }
}

// ---------- leitura em tempo real ----------
// Só considera uma coleção "carregada" quando a resposta vem do servidor.
// (Num aparelho novo, a primeira resposta pode vir vazia da memória local.)
// Sem internet, aceita a cópia local depois de alguns segundos.
const soCache=snap=>snap.metadata.fromCache && navigator.onLine!==false;
const OPC={includeMetadataChanges:true};
function primeiraVez(nome,key,assinar){
  return new Promise(res=>{
    let feito=false;
    const fim=()=>{ if(!feito){ feito=true; lidos[key]=true; clearTimeout(t); res(); } };
    const t=setTimeout(()=>{ if(!feito){ console.warn('Usando a cópia local de '+nome+' (servidor demorou)'); fim(); } },12000);
    const un=assinar(fim,err=>{
      console.error('Falha ao ler '+nome,err);
      if(hooks.onErro && pronto) hooks.onErro(err);
      fim();
    });
    unsubs.push(un);
  });
}
function ouvirBaldes(key){
  const c=COLS[key]; const m=srv[key]=new Map(); conhecidos[key]=new Set();
  return primeiraVez(c.nome,key,(fim,erro)=>F.onSnapshot(colRef(c.nome),OPC,snap=>{
    const mudados=new Set(), removidos=new Set();
    snap.docChanges().forEach(ch=>{
      const b=ch.doc.id;
      const itens=ch.type==='removed'?{}:((ch.doc.data()||{}).i||{});
      for(const id in itens){
        const v=itens[id]; if(!v || typeof v.d!=='string') continue;
        conhecidos[key].add(id);
        const ant=m.get(id);
        if(!ant || ant.s!==v.d){ m.set(id,{s:v.d,p:v.p||0,b}); mudados.add(id); }
      }
      for(const [id,v] of m) if(v.b===b && !(id in itens)){ m.delete(id); removidos.add(id); }
    });
    if(!lidos[key]){ if(!soCache(snap)) fim(); return; }
    if(mudados.size||removidos.size) aplicar(key,mudados,removidos);
  },erro));
}
function ouvirUsuarios(){
  return primeiraVez('usuarios','users',(fim,erro)=>F.onSnapshot(colRef('usuarios'),OPC,snap=>{
    const mudados=new Set(), removidos=new Set();
    snap.docChanges().forEach(ch=>{
      const id=ch.doc.id;
      if(ch.type==='removed'){ if(srvUsers.has(id)){ srvUsers.delete(id); removidos.add(id); } return; }
      const d=ch.doc.data()||{}; const p=d._p||0; const u=limparUsuario(d); u.id=id; const s=canon(u);
      if(srvUsers.get(id)!==s){ srvUsers.set(id,s); posUsers.set(id,p); mudados.add(id); }
    });
    if(!lidos.users){ if(!soCache(snap)) fim(); return; }
    if(mudados.size||removidos.size) aplicar('users',mudados,removidos);
  },erro));
}
const posUsers=new Map();
function ouvirAcessos(){
  return primeiraVez('acessos','acessos',(fim,erro)=>F.onSnapshot(colRef('acessos'),OPC,snap=>{
    snap.docChanges().forEach(ch=>{
      if(ch.type==='removed') srvAc.delete(ch.doc.id); else srvAc.set(ch.doc.id,canon(ch.doc.data()));
    });
    if(!lidos.acessos && !soCache(snap)) fim();
  },erro));
}
function ouvirConfig(){
  return primeiraVez('config','config',(fim,erro)=>F.onSnapshot(colRef('config'),OPC,snap=>{
    let mudou=false;
    snap.docChanges().forEach(ch=>{
      const id=ch.doc.id; const s=ch.type==='removed'?null:((ch.doc.data()||{}).d||null);
      if(srvCfg[id]!==s){ srvCfg[id]=s; mudou=true;
        if(lidos.config){ const st=hooks.estado(); if(id==='clinica') st.clinic=s?JSON.parse(s):null; if(id==='meta') st.meta=s?JSON.parse(s):{}; }
      }
    });
    if(!lidos.config){ if(!soCache(snap)) fim(); return; }
    if(mudou && hooks.onRemoto) hooks.onRemoto();
  },erro));
}
function ouvirMeuAcesso(){
  let primeiro=true;
  unsubs.push(F.onSnapshot(ref('acessos',meuEmail()),s=>{
    if(primeiro){ primeiro=false; return; }
    if(s.metadata.hasPendingWrites) return;
    const novo=s.exists()?s.data():null;
    if(hooks.onAcessoMudou) hooks.onAcessoMudou(novo,acesso);
    if(novo) acesso=novo;
  },e=>console.error(e)));
}

// Aplica no estado do app as mudanças que vieram da nuvem (de outro usuário,
// ou o servidor desfazendo uma gravação recusada), mantendo os mesmos objetos.
function posicao(key,id){
  if(key==='users') return posUsers.has(id)?posUsers.get(id):1e9;
  const v=srv[key] && srv[key].get(id); return v?v.p:1e9;
}
function aplicar(key,mudados,removidos){
  const st=hooks.estado(); if(!st) return;
  let arr=Array.isArray(st[key])?st[key]:[];
  const porId=new Map(arr.map(o=>[String(o&&o.id),o]));
  for(const id of mudados){
    let novo;
    if(key==='users'){ novo=JSON.parse(srvUsers.get(id)); }
    else { const v=srv[key].get(id); if(!v) continue; novo=JSON.parse(v.s); }
    const ex=porId.get(id);
    if(ex){ for(const k of Object.keys(ex)) delete ex[k]; Object.assign(ex,novo); }
    else { arr.push(novo); porId.set(id,novo); }
  }
  if(removidos.size) arr=arr.filter(o=>!removidos.has(String(o&&o.id)));
  arr.sort((a,b)=>posicao(key,String(a.id))-posicao(key,String(b.id)));
  st[key]=arr;
  if(hooks.onRemoto) hooks.onRemoto(key);
}

async function conectar(ac){
  acesso=ac; souMaster=ac.tipo==='master';
  await lerFicha(); ouvirFicha();
  const pode=p=>souMaster || !!(ac.perms&&ac.perms[p]);
  const t=[ouvirConfig(),ouvirUsuarios()];
  if(pode('usuarios')) t.push(ouvirAcessos());
  for(const key in COLS){ const c=COLS[key]; if(!c.perm || pode(c.perm)) t.push(ouvirBaldes(key)); }
  if(pode('pacientes')) t.push(ouvirFormularios());
  ouvirSugestoes();
  ouvirMeuAcesso();
  await Promise.all(t);
  const st={clinic:srvCfg.clinica?JSON.parse(srvCfg.clinica):null, meta:srvCfg.meta?JSON.parse(srvCfg.meta):{}};
  st.users=[...srvUsers.keys()].sort((a,b)=>posicao('users',a)-posicao('users',b)).map(id=>JSON.parse(srvUsers.get(id)));
  for(const key in COLS){
    const m=srv[key];
    st[key]=m?[...m.entries()].sort((a,b)=>a[1].p-b[1].p).map(([,v])=>JSON.parse(v.s)):[];
  }
  st.formularios=formularios; st.sugestoes=sugestoes;
  pronto=true; status();
  return st;
}

// Volta o estado do app para o que está na nuvem (clínica em modo de consulta)
function restaurar(st){
  if(!pronto || !st) return;
  st.clinic=srvCfg.clinica?JSON.parse(srvCfg.clinica):null; st.meta=srvCfg.meta?JSON.parse(srvCfg.meta):{};
  st.users=[...srvUsers.keys()].sort((a,b)=>posicao('users',a)-posicao('users',b)).map(id=>JSON.parse(srvUsers.get(id)));
  for(const key in COLS){ const m=srv[key]; if(m) st[key]=[...m.entries()].sort((a,b)=>a[1].p-b[1].p).map(([,v])=>JSON.parse(v.s)); }
}

// ---------- gravação: compara com o que está na nuvem e envia só o que mudou ----------
function podeMexerAcesso(email,obj){
  if(email===meuEmail() && !souMaster) return false;
  if(souMaster) return true;
  const ant=srvAc.get(email);
  if(obj && obj.tipo==='master') return false;
  if(ant && JSON.parse(ant).tipo==='master') return false;
  return true;
}
function salvar(st){
  if(!pronto || !st) return;
  const ops=[]; const avisosTam=[];
  // configuração (clínica e meta)
  for(const [k,id] of [['clinic','clinica'],['meta','meta']]){
    if(st[k]==null) continue;
    const s=JSON.stringify(st[k]);
    if(srvCfg[id]!==s){ ops.push({r:ref('config',id),d:{d:s}}); srvCfg[id]=s; }
  }
  // usuários
  if(lidos.users){
    const vistos=new Set();
    (st.users||[]).forEach((u,i)=>{
      if(!u) return; if(!u.id) u.id=novoId();
      const id=String(u.id); vistos.add(id);
      const c=limparUsuario(u); c.id=id; const s=canon(c);
      if(srvUsers.get(id)!==s){ ops.push({r:ref('usuarios',id),d:Object.assign({},c,{_p:i})}); srvUsers.set(id,s); posUsers.set(id,i); }
    });
    for(const id of [...srvUsers.keys()]) if(!vistos.has(id)){ ops.push({r:ref('usuarios',id),del:true}); srvUsers.delete(id); }
  }
  // coleções em baldes
  for(const key in COLS){
    if(!lidos[key]) continue;
    const c=COLS[key], m=srv[key], vistos=new Set(), porBalde={};
    (st[key]||[]).forEach((it,i)=>{
      if(!it || typeof it!=='object') return; if(it.id==null) it.id=novoId();
      const id=String(it.id); if(vistos.has(id)) return; vistos.add(id);
      const s=JSON.stringify(it); const ant=m.get(id);
      if(!ant || ant.s!==s){
        const b=ant?ant.b:balde(id,c.baldes);
        (porBalde[b]=porBalde[b]||{})[id]={d:s,p:i};
        m.set(id,{s,p:i,b}); conhecidos[key].add(id);
      }
    });
    for(const [id,v] of [...m]) if(!vistos.has(id)){ (porBalde[v.b]=porBalde[v.b]||{})[id]=F.deleteField(); m.delete(id); }
    for(const b in porBalde){
      let tam=0; for(const [,v] of m) if(v.b===b) tam+=v.s.length+40;
      if(tam>ALERTA_BALDE) avisosTam.push(c.nome+'/'+b+' ('+Math.round(tam/1000)+' KB)');
      ops.push({r:ref(c.nome,b),d:{i:porBalde[b]},merge:true});
    }
  }
  // acessos (derivados do cadastro de usuários)
  if(lidos.acessos && hooks.acessosDesejados){
    const des=hooks.acessosDesejados();
    for(const [e,o] of des){
      const s=canon(o);
      if(srvAc.get(e)!==s && podeMexerAcesso(e,o)){ ops.push({r:ref('acessos',e),d:o}); if(!srvAc.has(e)) ops.push(idxOp(e)); srvAc.set(e,s); }
    }
    for(const [e,s] of [...srvAc]){
      if(!des.has(e) && e!==meuEmail() && podeMexerAcesso(e,JSON.parse(s))){ ops.push({r:ref('acessos',e),del:true}); ops.push(idxOp(e,true)); srvAc.delete(e); }
    }
  }
  if(avisosTam.length && hooks.onAlertaTamanho) hooks.onAlertaTamanho(avisosTam);
  enviar(ops);
}
function enviar(ops){
  for(let i=0;i<ops.length;i+=400){
    const wb=F.writeBatch(db);
    ops.slice(i,i+400).forEach(o=>{ if(o.del) wb.delete(o.r); else if(o.merge) wb.set(o.r,o.d,{merge:true}); else wb.set(o.r,o.d); });
    acompanhar(wb.commit());
  }
}
function acompanhar(prom){
  pendentes++; status();
  return prom.then(()=>{ pendentes--; status(); }).catch(e=>{ pendentes--; status(); console.error(e); if(hooks.onErro) hooks.onErro(e); });
}
function status(){ if(hooks.onStatus) hooks.onStatus(pendentes, navigator.onLine!==false); }
async function aguardarEnvio(){ await F.waitForPendingWrites(db); }

// ---------- imagens (radiografias) ----------
function carregarImg(src){
  return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('arquivo de imagem inválido')); i.src=src; });
}
async function comprimir(blob){
  const url=URL.createObjectURL(blob);
  try{
    const img=await carregarImg(url);
    const W=img.naturalWidth, H=img.naturalHeight;
    let lado=Math.min(2800,Math.max(W,H)), q=0.92;
    for(let t=0;t<16;t++){
      const e=Math.min(1,lado/Math.max(W,H)), w=Math.max(1,Math.round(W*e)), h=Math.max(1,Math.round(H*e));
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      const cx=cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,w,h); cx.drawImage(img,0,0,w,h);
      const d=cv.toDataURL('image/jpeg',q);
      if(d.length<=LIMITE_IMG) return d;
      if(q>0.72) q-=0.06; else lado=Math.round(lado*0.85);
    }
    throw new Error('não foi possível reduzir a imagem para caber na nuvem');
  } finally { URL.revokeObjectURL(url); }
}
async function salvarImagem(file){
  const d=await comprimir(file); const id=novoId();
  cacheImg[id]=d;
  acompanhar(F.setDoc(ref('imagens',id),{d,em:Date.now(),por:meuEmail()}));
  return id;
}
async function urlDaImagem(id){
  if(!id) return '';
  if(cacheImg[id]) return cacheImg[id];
  try{ const s=await F.getDoc(ref('imagens',id)); if(!s.exists()) return ''; cacheImg[id]=s.data().d||''; return cacheImg[id]; }
  catch(e){ console.error(e); return ''; }
}
function removerImagem(id){ if(!id) return; delete cacheImg[id]; acompanhar(F.deleteDoc(ref('imagens',id))); }
function dataUrlParaBlob(d){
  const [cab,b64]=d.split(','); const mime=(cab.match(/data:([^;]+)/)||[])[1]||'image/jpeg';
  const bin=atob(b64||''); const a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i);
  return new Blob([a],{type:mime});
}
async function todasImagens(){
  const s=await F.getDocs(colRef('imagens'));
  return s.docs.map(d=>{ const blob=dataUrlParaBlob(d.data().d||''); return {id:d.id,blob,mime:blob.type}; });
}
async function enviarImagensBackup(imgs,progresso){
  let n=0;
  for(const im of imgs){
    n++; if(progresso) progresso(n,imgs.length);
    const d=await comprimir(im.blob); cacheImg[im.id]=d;
    await F.setDoc(ref('imagens',im.id),{d,em:Date.now(),por:meuEmail()});
  }
}
async function apagarImagensExceto(manter){
  const s=await F.getDocs(colRef('imagens'));
  const ops=s.docs.filter(d=>!manter.has(d.id)).map(d=>({r:d.ref,del:true}));
  enviar(ops);
}

window.Nuvem={
  ativa:ATIVA, iniciar, entrarGoogle, entrarEmail, criarConta, reenviarVerificacao, verificarDeNovo,
  redefinirSenha, sair, carregarAcesso, criarDono, conectar, lerClinicaServidor,
  criarFormulario, apagarFormulario, iniciarPublico, lerFormularioPublico, responderFormularioPublico, salvar, aguardarEnvio,
  salvarImagem, urlDaImagem, removerImagem, todasImagens, enviarImagensBackup, apagarImagensExceto,
  meuEmail, mapErro, normEmail, pendentes:()=>pendentes,
  clinicaId:()=>CLINICA, ficha:()=>ficha, souAdmin, ambienteTeste, projeto:()=>CFG.projectId||'', reindexar, situacaoEmail, restaurar, enviarSugestao, apagarSugestao, listarSugestoes, responderSugestao, outroConectado, conectarOutro, clinicasOutro, atualizarClinicaOutro, salvarVitrineOutro, criarEspelho, sincronizarEspelho, entrarEspelho, emEspelho:()=>emEspelho, espelhoEscolhido, lerVitrine, salvarVitrine,
  listarClinicas, criarClinica, atualizarClinica, ouvirRoadmap, numerarRoadmap, salvarItemRoadmap, apagarItemRoadmap, semearRoadmap,
  usuarioAuth:()=>usuario, provedores:()=>usuario?usuario.providerData.map(p=>p.providerId):[],
};
})();
