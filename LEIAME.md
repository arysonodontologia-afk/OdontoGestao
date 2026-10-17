# OdontoGestão 2.0 — colocar no ar (GitHub Pages + Firebase)

O sistema fica hospedado no **GitHub Pages** e os dados e logins ficam no **Firebase** (gratuito neste porte, servidor em São Paulo).

- **Computador:** sistema completo, pelo navegador.
- **Celular:** Agenda e Financeiro (o Financeiro só aparece para quem tem permissão). Pode ser instalado como app.
- **Login:** e-mail e senha ou conta Google. Só entra quem o Master cadastrou em **Usuários**.

> Enquanto o `firebase-config.js` estiver vazio, o sistema abre em **modo demonstração** (dados só no navegador). Serve para ver as telas.

Este projeto é **independente** de qualquer outro sistema: use um projeto Firebase **novo**, só para ele.

---

## 1. Criar o projeto no Firebase (≈15 min)

1. Acesse https://console.firebase.google.com → **Criar um projeto** → nome `odontogestao` (pode desativar o Google Analytics).
2. **Criação → Authentication → Vamos começar**. Na aba **Método de login**:
   - **E-mail/senha** → Ativar → Salvar.
   - **Google** → Ativar → escolha seu e-mail de suporte → Salvar.
3. Ainda em **Authentication → Modelos** (Templates), clique no lápis e mude o idioma para **Português (Brasil)**. Assim os e-mails de confirmação e de "esqueci minha senha" saem em português.
4. **Criação → Firestore Database → Criar banco de dados**:
   - local **southamerica-east1 (São Paulo)**;
   - **modo de produção**.
5. Em **Firestore → Regras**: apague tudo, cole o conteúdo do arquivo `firestore.rules`, **troque `SEU-EMAIL@gmail.com` pelo e-mail do responsável pela clínica** (em minúsculas) e clique em **Publicar**.
   Esse e-mail é o único que consegue fazer o primeiro acesso e virar Master.
6. Engrenagem ⚙️ → **Configurações do projeto** → em "Seus apps" clique no ícone **</>** (Web) → apelido `odontogestao` → **Registrar app**.
   Copie os valores de `firebaseConfig` e cole em `docs/firebase-config.js`, substituindo as aspas vazias.

## 2. Publicar no GitHub

1. Repositório: `OdontoGestao` (o código pode ser público: **nenhum dado de paciente fica no GitHub**, só o programa).
2. **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**, pasta **/docs** → **Save**.
3. Depois de ~1 minuto o endereço fica `https://arysonodontologia-afk.github.io/OdontoGestao/`.
4. De volta ao Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar domínio** → `arysonodontologia-afk.github.io`.

## 3. Primeiro acesso (responsável)

1. Na versão anterior (o arquivo `OdontoGestao.html` no iMac), vá em **Configurações → Backup → Exportar backup**.
2. Abra o endereço do sistema e entre **com o e-mail que você colocou nas regras** (botão Google, ou "Primeiro acesso · criar senha" e confirme o e-mail).
3. Na tela "Cadastro da Clínica", clique em **Importar backup da versão anterior** e escolha o arquivo. Pacientes, agenda, financeiro e radiografias vão para a nuvem.
   (Ou preencha os dados da clínica para começar do zero.)
4. Vá em **Usuários** e confira o **e-mail de acesso** de cada pessoa. Quem ficou sem e-mail não consegue entrar.

## 4. Equipe

Cada pessoa abre o endereço e entra com o **e-mail que você cadastrou** para ela:

- conta Google (Gmail): botão **Entrar com Google**;
- outro e-mail: **Primeiro acesso · criar senha** → confirma o link que chega no e-mail → **Já confirmei**.

Para tirar o acesso de alguém, exclua o usuário em **Usuários**. O acesso cai na hora.

## 5. Instalar no celular

- **iPhone (Safari):** abra o endereço → botão **Compartilhar** → **Adicionar à Tela de Início**.
- **Android (Chrome):** menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

No iPhone, se o login com Google não abrir dentro do app instalado, use e-mail e senha (dá para criar a senha em "Esqueci minha senha", mesmo para quem entrava pelo Google).

## Atualizações

Quando o código mudar, os arquivos novos vão para o GitHub e o sistema pega a versão nova na próxima abertura com internet.

## Segurança e cuidados

- As permissões (Master, Administrativo, Dentista, Recepcionista) são conferidas **no servidor**, pelas regras do Firestore, e não só na tela.
- Ao clicar em **Sair**, a cópia local dos dados é apagada daquele navegador.
- O plano gratuito do Firebase **não guarda cópias antigas**: faça **Configurações → Backup** pelo menos uma vez por semana e guarde o arquivo fora da nuvem.
- Dados de pacientes são dados de saúde (LGPD): dê acesso só a quem precisa e cada pessoa com o próprio login.
- Radiografias são comprimidas para até ~1 MB cada (boa qualidade para visualização). O banco gratuito comporta cerca de 1 GB no total.
