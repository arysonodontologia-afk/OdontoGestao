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
      window.FIREBASE_CONFIG=JSON.parse(x.responseText);   // authDomain = ID.firebaseapp.com (aceito pelo Google)
    }
  }catch(e){ console.warn('Não foi possível ler a configuração do Firebase',e); }
})();
