# OdontoGestão 2.0 — colocar no ar (Firebase)

Tudo fica no **Firebase** (servidor em São Paulo): o site, os dados e os logins. O **GitHub** guarda o código em um repositório **privado** e, a cada atualização, publica o site no Firebase sozinho.

- **Computador:** sistema completo, pelo navegador.
- **Celular:** Agenda e Financeiro (o Financeiro só aparece para quem tem permissão). Pode ser instalado como app.
- **Login:** e-mail e senha ou conta Google. Só entra quem o Master cadastrou em **Usuários**.
- **Endereço:** `https://ID-DO-PROJETO.web.app`

Este projeto é **independente** de qualquer outro sistema: use um projeto Firebase **novo**, só para ele.

---

## 1. Criar o projeto no Firebase (≈15 min)

1. Acesse https://console.firebase.google.com → **Criar um projeto** → nome `odontogestao` (pode desativar o Google Analytics).
   Anote o **ID do projeto** que aparece embaixo do nome (ex.: `odontogestao-1a2b3`).
2. **Criação → Authentication → Vamos começar**. Na aba **Método de login**:
   - **E-mail/senha** → Ativar → Salvar.
   - **Google** → Ativar → escolha seu e-mail de suporte → Salvar.
3. Em **Authentication → Modelos** (Templates), clique no lápis e mude o idioma para **Português (Brasil)**.
4. **Criação → Firestore Database → Criar banco de dados** → local **southamerica-east1 (São Paulo)** → **modo de produção**.
5. Engrenagem ⚙️ → **Configurações do projeto** → em "Seus apps" clique no ícone **</>** (Web) → apelido `odontogestao` → marque **"Configurar também o Firebase Hosting"** → **Registrar app** → pode clicar em **Avançar** até o fim (não precisa instalar nada).
6. **Criação → Hosting → Vamos começar** → pode clicar em **Avançar** até o fim.

## 2. Criar a chave de publicação (≈5 min)

Essa chave permite que o GitHub publique o site no Firebase.

1. Abra https://console.cloud.google.com/iam-admin/serviceaccounts e selecione o projeto `odontogestao` no topo.
2. **+ Criar conta de serviço** → nome `publicar-github` → **Criar e continuar**.
3. Em **Papel**, adicione estes 4 (use a caixa de busca):
   - **Administrador do Firebase Hosting** (Firebase Hosting Admin)
   - **Administrador de regras do Firebase** (Firebase Rules Admin)
   - **Usuário da conta de serviço** (Service Account User)
   - **Consumidor do Service Usage** (Service Usage Consumer)
4. **Continuar → Concluir**.
5. Clique na conta criada → aba **Chaves** → **Adicionar chave → Criar nova chave → JSON → Criar**. Um arquivo `.json` é baixado.
6. No GitHub, no repositório **OdontoGestao**: **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: abra o arquivo `.json` no TextEdit, copie **todo** o conteúdo e cole aqui → **Add secret**.
7. Apague o arquivo `.json` do seu computador (ele fica guardado com segurança no GitHub).

> **Não envie esse arquivo para ninguém, nem para o Claude.** Ele dá acesso para publicar no seu projeto.

## 3. Ajustar e publicar

Duas informações ficam no código: o **ID do projeto** (arquivo `.firebaserc`) e o **e-mail do responsável** (arquivo `firestore.rules`, função `emailDoDono`). Esse e-mail é o único que consegue fazer o primeiro acesso e virar Master.

Com os dois preenchidos, cada envio para o GitHub publica o site e as regras de segurança. Para acompanhar: aba **Actions** do repositório (✅ verde = publicado).

## 4. Primeiro acesso (responsável)

1. Na versão anterior (o arquivo `OdontoGestao.html` no iMac), vá em **Configurações → Backup → Exportar backup**.
2. Abra `https://ID-DO-PROJETO.web.app` e entre **com o e-mail do responsável** (botão Google, ou "Primeiro acesso · criar senha" e confirme o e-mail).
3. Na tela "Cadastro da Clínica", clique em **Importar backup da versão anterior** e escolha o arquivo. Pacientes, agenda, financeiro e radiografias vão para a nuvem.
   (Ou preencha os dados da clínica para começar do zero.)
4. Vá em **Usuários** e confira o **e-mail de acesso** de cada pessoa. Quem ficou sem e-mail não consegue entrar.

## 5. Equipe

Cada pessoa abre o endereço e entra com o **e-mail que você cadastrou** para ela:

- conta Google (Gmail): botão **Entrar com Google**;
- outro e-mail: **Primeiro acesso · criar senha** → confirma o link que chega no e-mail → **Já confirmei**.

Para tirar o acesso de alguém, exclua o usuário em **Usuários**. O acesso cai na hora.

## 6. Instalar no celular

- **iPhone (Safari):** abra o endereço → botão **Compartilhar** → **Adicionar à Tela de Início**.
- **Android (Chrome):** menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

## Segurança e cuidados

- O código fica em repositório **privado**; os dados ficam só no Firebase, protegidos por login.
- As permissões (Master, Administrativo, Dentista, Recepcionista) são conferidas **no servidor**, pelas regras do Firestore, e não só na tela.
- Ao clicar em **Sair**, a cópia local dos dados é apagada daquele navegador.
- O plano gratuito do Firebase **não guarda cópias antigas**: faça **Configurações → Backup** pelo menos uma vez por semana e guarde o arquivo fora da nuvem.
- Dados de pacientes são dados de saúde (LGPD): dê acesso só a quem precisa e cada pessoa com o próprio login.
- Radiografias são comprimidas para até ~1 MB cada. O banco gratuito comporta cerca de 1 GB no total.
