# WhatsApp automático (Cloudflare Worker `odontogestao-wa`)

Personalização **"WhatsApp automático"** (chave `whatsapp-automatico`). Avisos saem pelo **número da própria clínica**
(API oficial da Meta, WhatsApp Cloud API). Com a **coexistência**, a recepção continua usando o WhatsApp Business no celular.

## O que faz
| Aviso | Quando | Modelo da Meta |
|---|---|---|
| Consulta agendada | até 5 min depois de marcar (ou remarcar) | `consulta_agendada` |
| Lembrete da véspera, com **Confirmo** / **Preciso remarcar** | no horário escolhido pela clínica (padrão 10:00), para quem ainda não confirmou | `lembrete_consulta` |
| Agenda do dia do dentista | 07:30, para quem marcou no cadastro e tem WhatsApp | `agenda_do_dia` |

Resposta do paciente: **Confirmo** → consulta confirmada; **Preciso remarcar** → "Não vem, contatar". As duas aparecem em
*Respostas dos pacientes* no Painel. Texto livre do paciente não recebe resposta automática (a recepção responde pelo app).

## Dados
- O aplicativo grava `clinicas/{cid}/waDia/{data}` (só horário, nome, telefone, dentista, motivo e situação dos próximos 14 dias)
  e `waFila` (consulta recém-marcada). O Worker **não lê o prontuário**.
- Token da Meta: `clinicas/{cid}/waSegredo/token` — o Master grava; o aplicativo não consegue ler (regras do Firestore).
- Envios e simulações: `waLog`. Respostas: `waRespostas` (o aplicativo aplica na agenda e apaga).

## Segredos no GitHub (Settings → Secrets → Actions)
| Segredo | O que é |
|---|---|
| `FIREBASE_WA_SA_TESTE` / `FIREBASE_WA_SA` | JSON de uma conta de serviço **só para isto**, papel **Cloud Datastore User**, nos projetos de teste / produção |
| `WA_VERIFY_TOKEN` | um texto qualquer combinado com a Meta na configuração do webhook |
| `WA_APP_SECRET` | "Chave secreta do aplicativo" do app da Meta (Configurações do app → Básico) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | já cadastrados |

## Modelos para criar na Meta (categoria **Utilidade**, idioma **Português (BR)**)
Parâmetros não podem ter quebra de linha (o Worker já remove).

**`lembrete_consulta`** — corpo:
`Olá, {{1}}! Lembrete da sua consulta na {{2}}: {{3}}, às {{4}}, com {{5}}. Motivo: {{6}}. Você confirma a presença?`
Botões de resposta rápida: `Confirmo` e `Preciso remarcar` (nessa ordem).

**`consulta_agendada`** — corpo:
`Olá, {{1}}! Sua consulta na {{2}} foi agendada para {{3}}, às {{4}}, com {{5}}. Motivo: {{6}}. Até lá!`

**`agenda_do_dia`** — corpo:
`Bom dia, {{1}}! Sua agenda de hoje ({{2}}) na {{3}}: {{4}}. {{5}}`

Exemplos para a aprovação: Maria · Clínica Sorriso · quinta-feira, 12/11/2026 · 09:00 · Dra. Ana · Avaliação.

## Piloto (antes do Tech Provider)
1. App da Meta "OdontoGestão" (tipo Empresa) com o produto WhatsApp; número da clínica conectado.
2. Webhook: URL mostrada em Configurações → WhatsApp automático (`…/webhook`), token = `WA_VERIFY_TOKEN`; assinar `messages`.
3. Usuário do sistema com permissões `whatsapp_business_messaging` e `whatsapp_business_management` → token permanente.
4. Na clínica: Configurações → WhatsApp automático → ID do número + token → Simulação → validar → Envio real.

## Limites
Plano grátis do Cloudflare: 10 ms de CPU e 50 chamadas externas por execução — basta para o piloto (até ~20 avisos por rodada).
Com várias clínicas: Workers Paid (US$ 5/mês).
