// Configuração do Firebase.
// Hospedado no Firebase Hosting (endereço *.web.app ou *.firebaseapp.com), ela é lida
// automaticamente do próprio projeto — não precisa preencher nada aqui.
// Em outro endereço, cole os valores de "firebaseConfig" abaixo.
// Sem configuração, o sistema abre em MODO DEMONSTRAÇÃO (dados só neste navegador).
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
(function(){
  if(window.FIREBASE_CONFIG.apiKey) return;
  if(!/\.(web\.app|firebaseapp\.com)$/.test(location.hostname)) return;
  try{
    const x=new XMLHttpRequest(); x.open('GET','/__/firebase/init.json',false); x.send();
    if(x.status===200){
      const c=JSON.parse(x.responseText);
      c.authDomain=location.hostname;   // login com Google no mesmo endereço do sistema
      window.FIREBASE_CONFIG=c;
    }
  }catch(e){ console.warn('Não foi possível ler a configuração do Firebase',e); }
})();
