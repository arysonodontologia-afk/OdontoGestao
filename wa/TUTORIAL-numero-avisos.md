# Tutorial — número próprio só para avisos (chip novo + conta Meta "OdontoGestão")

Decisão (10/11/2026): os avisos automáticos saem por um **chip novo** cadastrado na API oficial da Meta, num
portfólio empresarial **OdontoGestão**. O WhatsApp do consultório, (92) 98589-6681, fica intocado. Quem escreve
no número de avisos recebe resposta automática apontando para a recepção. No começo, o número atende só a
Clínica Dra. Dora Leal (configuração por clínica, que já existe). Depois ele vira o número central para todas as bases.

Como funcionam as respostas: **Confirmo** marca a consulta como Confirmada sozinho. **Preciso remarcar** marca
"Não vem, contatar" e cai em *Respostas dos pacientes* no Painel, para a recepção remarcar. Texto livre recebe a
resposta automática. As respostas entram na agenda quando o app está aberto em algum aparelho da clínica.

## 1. Chip
- Pré-pago (Vivo, Claro ou TIM), ativado num celular qualquer. Confirme que recebe SMS.
- **Não instale o WhatsApp nesse número.**
- Mantenha a recarga em dia; se a operadora cancelar o número, os avisos param.

## 2. Conta na Meta
- Entre com o **seu próprio perfil do Facebook** (um perfil por pessoa; perfil falso pode ser bloqueado junto com tudo).
- A restrição da conta de anúncios normalmente não afeta o WhatsApp. Se bloquear, uma pessoa de confiança cria o portfólio e te adiciona como administrador.
- Opcional: e-mail só para isso (ex.: odontogestao.avisos@gmail.com).

## 3. Portfólio empresarial "OdontoGestão"
business.facebook.com → nome do portfólio (canto superior esquerdo) → **Criar um portfólio empresarial**: nome
**OdontoGestão**, seu nome, e-mail comercial. Confirme o e-mail.

## 4. App de desenvolvedor
developers.facebook.com → **Começar** (confirmar telefone e e-mail) → **Meus apps → Criar app**:
nome **OdontoGestão Avisos**, caso de uso **"Conectar-se com clientes pelo WhatsApp"**, portfólio **OdontoGestão**.
O número de teste que a Meta cria pode ser ignorado.

## 5. Adicionar o número do chip
WhatsApp → **Configuração da API → Adicionar número de telefone**:
- Nome de exibição: **OdontoGestão Avisos** (fica "pendente" até a Meta revisar; é normal).
- Categoria: Medicina e saúde. Descrição: "Avisos automáticos de consultas das clínicas odontológicas."
- Número com DDD; código por SMS. Se pedir **PIN de 6 dígitos**, crie e anote em lugar seguro.
- Copie e guarde: **Identificação do número de telefone** e **Identificação da conta do WhatsApp Business**.

## 6. Perfil do número
Gerenciador do WhatsApp → Telefones → (número) → Perfil: foto (logo OdontoGestão), recado "Avisos automáticos.
Para falar com a clínica, use o telefone da clínica.", site (opcional).

## 7. Forma de pagamento
Gerenciador do WhatsApp → Configurações → Pagamentos: cartão, moeda **BRL**. Cerca de R$ 0,04 por aviso.

## 8. Token permanente
business.facebook.com → Configurações → Usuários → **Usuários do sistema → Adicionar** (nome OdontoGestao, função
Administrador) → **Atribuir ativos**: app OdontoGestão Avisos e conta do WhatsApp, ambos com controle total →
**Gerar token**: validade **Nunca**, permissões **whatsapp_business_messaging** e **whatsapp_business_management**.
O token não vai para ninguém; só é colado no OdontoGestão (passo 11).

## 9. Segredos no GitHub (Settings → Secrets and variables → Actions)
| Nome | Onde pegar |
|---|---|
| `WA_APP_SECRET` | Meta: Configurações do app → Básico → Chave secreta do aplicativo |
| `WA_VERIFY_TOKEN` | senha inventada (ex.: odonto-webhook-2026); anotar |
| `FIREBASE_WA_SA` | Google Cloud do projeto odontogestao-c8218: IAM → Contas de serviço → Criar → papel "Usuário do Cloud Datastore" → Chaves → JSON. Colar o conteúdo e apagar o arquivo. |

**Parar aqui e avisar o Claude**, que reativa o serviço `wa-worker.yml` na produção (`gh workflow run wa-worker.yml --ref main`).

## 10. Webhook (depois do passo 9 confirmado)
App da clínica: Configurações → 💬 WhatsApp automático → copiar o endereço que termina em **/webhook**.
Meta: WhatsApp → Configuração → Webhook → Editar: URL = esse endereço; token = `WA_VERIFY_TOKEN` → Verificar e
salvar → Campos do webhook → **Assinar `messages`**.

## 11. Ligar no OdontoGestão (Clínica Dra. Dora Leal)
Configurações → WhatsApp automático: ID do número, ID da conta (WABA), token. Resposta automática: "Este número
só envia avisos. Para falar com a clínica, chame no WhatsApp (92) 98589-6681." Horário do lembrete da véspera.
Dentistas que recebem a agenda das 7h30 (com WhatsApp no cadastro). Deixar em **Simulação** e salvar.
As 3 mensagens vão sozinhas para a Meta aprovar (de minutos a horas).

## 12. Publicar o app na Meta
Configurações do app → Básico: URL da Política de Privacidade
`https://odontogestao-c8218.web.app/privacidade.html`, ícone, categoria Saúde → **Modo do app: Ativo**.

## 13. Teste real
Paciente de teste com o celular pessoal → mensagens aprovadas → **Envio real** → marcar consulta (aviso em até
5 min) → testar lembrete (consulta para amanhã, horário do lembrete alguns minutos à frente) → tocar **Confirmo**
e ver a agenda mudar para Confirmada.

## 14. Avisar os pacientes
Aviso na recepção ou no Instagram: "Nossos lembretes de consulta agora chegam pelo WhatsApp OdontoGestão Avisos,
(92) 9XXXX-XXXX. Salve o contato!"

## Depois
Sem verificação da empresa: cerca de 250 pessoas diferentes por dia. Quando outras clínicas usarem o número:
verificação da empresa na Meta + adaptar o sistema para o número central atender todas as bases (franquia de avisos por plano).
