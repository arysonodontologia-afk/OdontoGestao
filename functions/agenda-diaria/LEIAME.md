# Agenda do dia para o dentista (07:30) — INSTALAÇÃO FUTURA

Status: **pronta, aguardando contratação** (quadro de Implementação, no ambiente de teste).
Esta pasta **não é publicada** pelo GitHub Actions (o deploy usa só `hosting,firestore:rules`).

## O que faz
Todo dia às **07:30 no fuso da clínica** (pela UF do cadastro), cada dentista ativo que marcou
"Receber a agenda do dia às 07:30" recebe a agenda: horário, paciente, tratamento e se está confirmado.
Agenda vazia não gera envio. Bases espelho do teste e clínicas suspensas/vencidas não recebem.

Canais:
1. **Notificação do app** (grátis, Firebase Cloud Messaging) — aparelhos autorizados em `clinicas/{cid}/dispositivos/{token}`.
2. **WhatsApp do dentista** (API oficial da Meta, ~US$ 0,0068 por mensagem no Brasil) — campo `whatsapp` do cadastro do dentista (já existe desde a 2.10.2).

## Para instalar
1. **Firebase → plano Blaze** nos projetos `odontogestao-teste` e `odontogestao-c8218` (Uso e faturamento → Modificar plano). Para este volume o custo esperado é zero ou centavos.
2. **Notificação**: Firebase → Configurações do projeto → Cloud Messaging → Certificados push da Web → *Gerar par de chaves*. Me passar a chave pública (VAPID) para ligar no app:
   - botão "Receber a agenda no celular" na tela do dentista (pede permissão; no iPhone só com o app instalado na Tela de Início, iOS 16.4+);
   - `firebase-messaging-sw.js` e gravação do token em `clinicas/{cid}/dispositivos/{token}` (`userId`, `criadoEm`, `aparelho`);
   - regra do Firestore: o próprio usuário grava/apaga o seu dispositivo.
3. **WhatsApp (opcional)**: conta Meta Business verificada, número do OdontoGestão na API e modelo **`agenda_do_dia`** (categoria Utilidade, pt_BR) com o corpo:
   `{{1}}` / `{{2}}` / `{{3}}` (saudação, lista e resumo). Depois:
   `firebase functions:secrets:set WHATSAPP_TOKEN` e `WHATSAPP_NUMERO_ID` nos parâmetros.
4. Incluir `"functions": [{"source": "functions/agenda-diaria", "codebase": "agenda-diaria"}]` no `firebase.json`,
   acrescentar `functions` no `--only` do workflow, publicar no **teste**, validar com uma base espelho
   (temporariamente sem o filtro de espelho) e só então aprovar para produção.
