// =====================================================================
// OdontoGestão — Agenda do dia para o dentista (INSTALAÇÃO FUTURA)
// ---------------------------------------------------------------------
// Roda de hora em hora no minuto 30. Para cada clínica liberada, vê se já
// são 07:30 no fuso dela; se sim, monta a agenda de cada dentista ativo que
// marcou "Receber a agenda do dia às 07:30" e envia:
//   1) notificação do app (Firebase Cloud Messaging), para os aparelhos que
//      o dentista autorizou (clinicas/{cid}/dispositivos/{token});
//   2) WhatsApp (API oficial da Meta), se WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID
//      estiverem configurados, com o modelo aprovado "agenda_do_dia".
// Cada envio é registrado em clinicas/{cid}/envios/{data}, para não repetir.
// Nada aqui está publicado ainda: depende do plano Blaze (ver LEIAME.md).
// =====================================================================
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');          // token permanente da Meta
const WHATSAPP_NUMERO_ID = defineString('WHATSAPP_NUMERO_ID', { default: '' }); // Phone number ID
const MODELO = defineString('WHATSAPP_MODELO', { default: 'agenda_do_dia' });
const HORA_ENVIO = 7;   // 07:30 no fuso da clínica (a função roda no minuto 30)

// fuso por UF (Brasil não tem horário de verão desde 2019)
const FUSO_UF = {
  AC: 'America/Rio_Branco', AM: 'America/Manaus', RR: 'America/Boa_Vista', RO: 'America/Porto_Velho',
  MT: 'America/Cuiaba', MS: 'America/Campo_Grande', PA: 'America/Belem', AP: 'America/Belem',
  TO: 'America/Araguaina', MA: 'America/Fortaleza', PI: 'America/Fortaleza', CE: 'America/Fortaleza',
  RN: 'America/Fortaleza', PB: 'America/Fortaleza', PE: 'America/Recife', AL: 'America/Maceio',
  SE: 'America/Maceio', BA: 'America/Bahia', FN: 'America/Noronha',
};
const fusoDe = c => FUSO_UF[((c && c.end && c.end.uf) || '').toUpperCase()] || 'America/Sao_Paulo';

function agoraNoFuso(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: +p.hour % 24 };
}
const dataBR = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const soDig = v => String(v || '').replace(/\D/g, '');
const foneWA = t => { let d = soDig(t); if (d && d.length <= 11) d = '55' + d; return d; };
const STATUS = { agendado: 'Sem confirmação', confirmado: 'Confirmado', chegou: 'Na clínica', atendido: 'Atendido' };

function liberada(f) {
  if (!f) return true;                       // clínica antiga, sem ficha
  if (f.status === 'ativa') return true;
  if (f.status === 'teste') { const t = f.testeAte && (f.testeAte.toMillis ? f.testeAte.toMillis() : +f.testeAte); return !!t && t > Date.now(); }
  return false;
}
async function lerBaldes(cid, nome) {
  const s = await db.collection(`clinicas/${cid}/${nome}`).get();
  const out = [];
  s.forEach(d => { const i = (d.data() || {}).i || {}; for (const id in i) { try { const o = JSON.parse(i[id].d); o.id = o.id || id; out.push(o); } catch (e) { } } });
  return out;
}
const nomeDentista = u => { const n = String(u.nomeCompleto || '').trim(); return (u.sexo === 'F' ? 'Dra. ' : u.sexo === 'M' ? 'Dr. ' : '') + n; };
const ehDentista = u => u && !u.inativo && (u.tipo === 'dentista' || (u.tipo === 'master' && String(u.cro || '').trim() && u.atende !== false));

function textoAgenda(u, lista, data, clinica) {
  const cab = `Bom dia, ${nomeDentista(u).split(' ').slice(0, 2).join(' ')}! Sua agenda de hoje, ${dataBR(data)}, na ${clinica}:`;
  if (!lista.length) return null;
  const linhas = lista.map(a => `${a.horario} · ${a.pacienteNome || 'Paciente'} · ${a.procedimentoNome || 'Avaliação'} · ${STATUS[a.status || 'agendado'] || 'Sem confirmação'}`);
  const conf = lista.filter(a => ['confirmado', 'chegou'].includes(a.status)).length;
  return { cab, linhas, resumo: `${lista.length} atendimento(s), ${conf} confirmado(s).` };
}

async function enviarPush(cid, userId, t) {
  const s = await db.collection(`clinicas/${cid}/dispositivos`).where('userId', '==', userId).get();
  const tokens = s.docs.map(d => d.id);
  if (!tokens.length) return 0;
  const r = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: 'Agenda de hoje · ' + t.resumo, body: t.linhas.slice(0, 6).join('\n') + (t.linhas.length > 6 ? `\n+${t.linhas.length - 6} atendimento(s)` : '') },
    webpush: { fcmOptions: { link: '/?aba=agenda' } },
  });
  // aparelhos que saíram (token inválido) são removidos
  await Promise.all(r.responses.map((x, i) => (!x.success && /registration-token-not-registered|invalid-argument/.test((x.error && x.error.code) || '')) ? db.doc(`clinicas/${cid}/dispositivos/${tokens[i]}`).delete() : null));
  return r.successCount;
}
async function enviarWhatsApp(u, t) {
  const token = WHATSAPP_TOKEN.value(), numId = WHATSAPP_NUMERO_ID.value();
  const para = foneWA(u.whatsapp);
  if (!token || !numId || !para) return false;
  // modelo "agenda_do_dia" (categoria Utilidade), com 3 variáveis: {{1}} saudação, {{2}} lista, {{3}} resumo
  const r = await fetch(`https://graph.facebook.com/v21.0/${numId}/messages`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'template',
      template: { name: MODELO.value(), language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [
        { type: 'text', text: t.cab }, { type: 'text', text: t.linhas.join(' | ').slice(0, 1000) }, { type: 'text', text: t.resumo }] }] } }),
  });
  return r.ok;
}

exports.agendaDiaria = onSchedule({ schedule: '30 * * * *', timeZone: 'UTC', region: 'southamerica-east1', secrets: [WHATSAPP_TOKEN], memory: '256MiB' }, async () => {
  const clinicas = await db.collection('clinicas').listDocuments();
  for (const ref of clinicas) {
    const cid = ref.id;
    try {
      const ficha = (await ref.get()).data();
      if (ficha && ficha.espelho) continue;             // bases espelho do teste não recebem
      if (!liberada(ficha)) continue;
      const cfg = await db.doc(`clinicas/${cid}/config/clinica`).get();
      const clinica = cfg.exists ? JSON.parse(cfg.data().d || '{}') : {};
      const { data, hora } = agoraNoFuso(fusoDe(clinica));
      if (hora !== HORA_ENVIO) continue;
      const marca = db.doc(`clinicas/${cid}/envios/${data}`);
      if ((await marca.get()).exists) continue;          // já enviado hoje
      await marca.set({ iniciadoEm: admin.firestore.FieldValue.serverTimestamp() });
      const us = (await db.collection(`clinicas/${cid}/usuarios`).get()).docs.map(d => Object.assign({ id: d.id }, d.data()));
      const ags = (await lerBaldes(cid, 'agendamentos')).filter(a => a.data === data && !['cancelado', 'faltou', 'nao_vem'].includes(a.status));
      const res = {};
      for (const u of us.filter(ehDentista)) {
        if (u.agendaDiaria === false) continue;
        const t = textoAgenda(u, ags.filter(a => a.dentistaId === u.id).sort((x, y) => String(x.horario).localeCompare(String(y.horario))), data, clinica.nome || 'clínica');
        if (!t) continue;                                 // agenda vazia: não envia
        const push = await enviarPush(cid, u.id, t).catch(e => { console.error(cid, u.id, e); return 0; });
        const wa = await enviarWhatsApp(u, t).catch(e => { console.error(cid, u.id, e); return false; });
        res[u.id] = { push, whatsapp: wa, atendimentos: t.linhas.length };
      }
      await marca.set({ concluidoEm: admin.firestore.FieldValue.serverTimestamp(), res }, { merge: true });
    } catch (e) { console.error('clínica', cid, e); }
  }
});
