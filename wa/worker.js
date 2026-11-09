// OdontoGestão · WhatsApp automático (Cloudflare Worker)
//
// Avisos (rotina a cada 5 minutos, no fuso de cada clínica):
//  1. confirmação ao marcar a consulta (fila gravada pelo aplicativo em clinicas/{cid}/waFila);
//  2. lembrete na véspera, no horário escolhido pela clínica, com os botões "Confirmo" e "Preciso remarcar";
//  3. agenda do dia às 07:30 para cada dentista que pediu.
// Respostas (webhook da Meta): o toque do paciente vira clinicas/{cid}/waRespostas, que o aplicativo
// aplica na agenda (confirmado ou "não vem, contatar") e mostra no Painel.
//
// O aplicativo mantém um resumo pequeno da agenda por dia (clinicas/{cid}/waDia/{data}); o Worker
// lê só isso, nunca o prontuário. Em "simulação" nada é enviado: o texto vai para waLog.
//
// Segredos: GOOGLE_SA (JSON da conta de serviço com permissão mínima no Firestore),
// WA_VERIFY_TOKEN (texto combinado com a Meta para o webhook), WA_APP_SECRET (segredo do app da Meta).
// Variáveis: PROJETO (id do Firebase), GRAPH (versão da API da Meta).
// O token de cada clínica fica em clinicas/{cid}/waSegredo/token (o aplicativo grava e não consegue ler).

const MODELOS = { lembrete: 'lembrete_consulta', agendada: 'consulta_agendada', agenda: 'agenda_do_dia' };
const FUSO_UF = {
  AC: 'America/Rio_Branco', AM: 'America/Manaus', RR: 'America/Boa_Vista', RO: 'America/Porto_Velho',
  MT: 'America/Cuiaba', MS: 'America/Campo_Grande', PA: 'America/Belem', AP: 'America/Belem',
  TO: 'America/Araguaina', MA: 'America/Fortaleza', PI: 'America/Fortaleza', CE: 'America/Fortaleza',
  RN: 'America/Fortaleza', PB: 'America/Fortaleza', PE: 'America/Recife', AL: 'America/Maceio',
  SE: 'America/Maceio', BA: 'America/Bahia', FN: 'America/Noronha',
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/webhook') {
      if (req.method === 'GET') return verificarWebhook(url, env);
      if (req.method === 'POST') return receberWebhook(req, env, ctx);
    }
    if (url.pathname === '/' && req.method === 'GET') return new Response('odontogestao-wa ok');
    if (url.pathname === '/diagnostico' && req.method === 'GET') return new Response(JSON.stringify(await diagnostico(env), null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    return new Response('não encontrado', { status: 404 });
  },
  async scheduled(evento, env, ctx) {
    if (!env.GOOGLE_SA) { console.log('sem GOOGLE_SA: rotina parada'); return; }
    ctx.waitUntil(rodarRotina(env).catch(e => console.log('rotina', e && e.stack || e)));
  },
};

// =============================== webhook ===============================
function verificarWebhook(url, env) {
  const ok = url.searchParams.get('hub.mode') === 'subscribe' && env.WA_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === String(env.WA_VERIFY_TOKEN).trim();
  return ok ? new Response(url.searchParams.get('hub.challenge') || '') : new Response('proibido', { status: 403 });
}
async function assinaturaOk(corpo, cab, segredo) {
  if (!segredo || !cab || !cab.startsWith('sha256=')) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(segredo).trim()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(corpo)));
  const hex = [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
  const recebido = cab.slice(7).toLowerCase();
  if (recebido.length !== hex.length) return false;
  let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ recebido.charCodeAt(i);
  return d === 0;
}
async function receberWebhook(req, env, ctx) {
  const corpo = await req.text();
  if (!(await assinaturaOk(corpo, req.headers.get('X-Hub-Signature-256') || '', env.WA_APP_SECRET))) return new Response('assinatura inválida', { status: 401 });
  let j; try { j = JSON.parse(corpo); } catch (e) { return new Response('ok'); }
  ctx.waitUntil(processarWebhook(j, env).catch(e => console.log('webhook', e && e.stack || e)));
  return new Response('ok');   // a Meta espera 200 rápido
}
export async function processarWebhook(j, env) {
  const fs = new Firestore(env);
  for (const ent of j.entry || []) for (const ch of ent.changes || []) {
    const v = ch.value || {}, numId = v.metadata && v.metadata.phone_number_id;
    for (const m of v.messages || []) {
      const payload = (m.button && m.button.payload) || (m.interactive && m.interactive.button_reply && m.interactive.button_reply.id) || '';
      const p = /^(C|R)\|([\w-]{1,80})\|([\w-]{1,80})$/.exec(payload);
      if (!p) continue;   // texto livre: a recepção responde pelo WhatsApp da clínica (coexistência)
      const [, acao, cid, agId] = p;
      const cfg = await fs.ler(`clinicas/${cid}/wa/config`);
      if (!cfg || String(cfg.phoneNumberId || '') !== String(numId || '')) continue;   // a resposta tem que vir do número da própria clínica
      await fs.criar(`clinicas/${cid}/waRespostas`, { agId, acao: acao === 'C' ? 'confirmar' : 'remarcar', telefone: m.from || '', em: Date.now(), msgId: m.id || '' });
      const tok = await tokenClinica(fs, cid);
      if (tok && !cfg.simulacao) await enviarTexto(env, cfg.phoneNumberId, tok, m.from,
        acao === 'C' ? 'Obrigado! Sua presença está confirmada. Até lá!' : 'Tudo bem! A clínica vai entrar em contato para remarcar o seu horário.').catch(() => {});
    }
  }
}

// =============================== rotina ===============================
export async function rodarRotina(env, agoraMs = Date.now()) {
  const fs = new Firestore(env);
  const clinicas = await fs.listar('clinicas');
  const res = [];
  for (const [cid, ficha] of clinicas) {
    if (ficha.espelho || !liberada(ficha, agoraMs)) continue;
    try { res.push([cid, await rotinaClinica(fs, env, cid, ficha, agoraMs)]); }
    catch (e) { console.log('clínica', cid, e && e.message); res.push([cid, 'erro: ' + String(e && e.message || e).slice(0, 200)]); }
  }
  // situação da última rodada (sem dados de pacientes), mostrada ao Master na tela do WhatsApp
  const porClinica = {}; for (const [cid, r] of res) porClinica[cid] = Array.isArray(r) ? (r.length ? r.length + ' aviso(s)' : 'nada a enviar agora') : String(r);
  await fs.mesclar('plataforma/waStatus', { em: agoraMs, ok: true, erro: '', clinicas: porClinica }).catch(e => console.log('status', e && e.message));
  return res;
}
// diagnóstico: só contagens e mensagens de erro (nenhum dado de paciente)
async function diagnostico(env) {
  const out = { servico: 'odontogestao-wa', projeto: env.PROJETO || '', temContaServico: !!env.GOOGLE_SA, temVerifyToken: !!env.WA_VERIFY_TOKEN, temAppSecret: !!env.WA_APP_SECRET };
  if (!env.GOOGLE_SA) return out;
  try { const sa = JSON.parse(env.GOOGLE_SA); out.contaServico = String(sa.client_email || '').replace(/^[^@]{0,6}/, '…'); } catch (e) { out.erroContaServico = 'o segredo não é um JSON válido'; return out; }
  const fs = new Firestore(env);
  try { await fs.tok(); out.loginGoogle = 'ok'; } catch (e) { out.loginGoogle = String(e.message || e).slice(0, 300); return out; }
  try {
    const cl = await fs.listar('clinicas'); out.clinicas = cl.length; out.comWhatsApp = [];
    for (const [cid, f] of cl) {
      const cfg = await fs.ler(`clinicas/${cid}/wa/config`); if (!cfg) continue;
      const tz = cfg.fuso || 'America/Sao_Paulo', ag = agoraNoFuso(tz, Date.now()), am = maisDias(ag.data, 1);
      const dia = await fs.ler(`clinicas/${cid}/waDia/${am}`), fila = await fs.listar(`clinicas/${cid}/waFila`);
      out.comWhatsApp.push({ cid, ligado: !!cfg.ativo, simulacao: cfg.simulacao !== false, liberada: liberada(f, Date.now()), espelho: !!f.espelho, horaLocal: `${String(Math.floor(ag.min / 60)).padStart(2, '0')}:${String(ag.min % 60).padStart(2, '0')}`, lembreteHora: cfg.lembreteHora || '', consultasAmanha: ((dia && dia.itens) || []).length, naFila: fila.length });
    }
    const st = await fs.ler('plataforma/waStatus'); out.ultimaRodada = st ? new Date(st.em).toISOString() : 'nenhuma';
  } catch (e) { out.erroFirestore = String(e.message || e).slice(0, 300); }
  return out;
}
function liberada(f, agora) {
  if (f.status === 'ativa') return true;
  if (f.status === 'teste') { const t = typeof f.testeAte === 'string' ? Date.parse(f.testeAte) : +f.testeAte; return !!t && t > agora; }
  return false;
}
function agoraNoFuso(tz, ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + (+p.minute) };
}
function maisDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const hhmm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const dataBR = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaSemana = iso => DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()];
const foneWA = t => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 ? d : ''; };
const limpo = s => String(s == null ? '' : s).replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 300) || '-';

async function rotinaClinica(fs, env, cid, ficha, agoraMs) {
  const cfg = await fs.ler(`clinicas/${cid}/wa/config`);
  if (!cfg || !cfg.ativo) return 'desligado';
  const tz = cfg.fuso || FUSO_UF[String(cfg.uf || '').toUpperCase()] || 'America/Sao_Paulo';
  const ag = agoraNoFuso(tz, agoraMs);
  const nomeClinica = cfg.nomeClinica || ficha.nome || 'clínica';
  const ctx = { fs, env, cid, cfg, nomeClinica, tok: cfg.simulacao ? '' : await tokenClinica(fs, cid) };
  const feito = [];

  // 1) confirmação ao marcar (fila)
  if (cfg.confirmarAoMarcar !== false) {
    for (const [fid, it] of await fs.listar(`clinicas/${cid}/waFila`)) {
      if (it.data >= ag.data && it.telefone) {
        await enviar(ctx, 'agendada', it.telefone, [primeiroNome(it.pacienteNome), nomeClinica, `${diaSemana(it.data)}, ${dataBR(it.data)}`, it.horario, it.dentistaNome, it.motivo], it, null);
        feito.push('agendada:' + it.agId);
      }
      await fs.apagar(`clinicas/${cid}/waFila/${fid}`);
    }
  }

  // 2) lembrete da véspera, a partir do horário escolhido
  const horaLemb = hhmm(cfg.lembreteHora || '10:00');
  if (cfg.lembreteVespera !== false && horaLemb !== null && ag.min >= horaLemb) {
    const amanha = maisDias(ag.data, 1);
    const env1 = (await fs.ler(`clinicas/${cid}/waEnviados/${amanha}`)) || {};
    const dia = await fs.ler(`clinicas/${cid}/waDia/${amanha}`);
    const marcados = {};
    for (const it of (dia && dia.itens) || []) {
      if (it.status !== 'agendado' || !it.telefone || env1['l_' + it.agId]) continue;
      await enviar(ctx, 'lembrete', it.telefone, [primeiroNome(it.pacienteNome), nomeClinica, `${diaSemana(amanha)}, ${dataBR(amanha)}`, it.horario, it.dentistaNome, it.motivo], it, it.agId);
      marcados['l_' + it.agId] = Date.now(); feito.push('lembrete:' + it.agId);
    }
    if (Object.keys(marcados).length) await fs.mesclar(`clinicas/${cid}/waEnviados/${amanha}`, marcados);
  }

  // 3) agenda do dia às 07:30 para os dentistas
  if (cfg.agendaDentista !== false && ag.min >= 7 * 60 + 30 && ag.min < 12 * 60) {
    const env0 = (await fs.ler(`clinicas/${cid}/waEnviados/${ag.data}`)) || {};
    const dia = await fs.ler(`clinicas/${cid}/waDia/${ag.data}`);
    const marcados = {};
    for (const d of (dia && dia.dentistas) || []) {
      if (!d.recebeAgenda || !d.whatsapp || env0['a_' + d.id]) continue;
      const meus = ((dia && dia.itens) || []).filter(i => i.dentistaId === d.id && i.status !== 'cancelado').sort((a, b) => a.horario.localeCompare(b.horario));
      if (!meus.length) continue;
      const lista = meus.map(i => `${i.horario} ${primeiroNome(i.pacienteNome)} (${i.motivo})${i.status === 'confirmado' ? ' ✓' : ''}`).join(' · ');
      const conf = meus.filter(i => i.status === 'confirmado').length;
      await enviar(ctx, 'agenda', d.whatsapp, [nomeCurto(d.nome), dataBR(ag.data), nomeClinica, lista, `${meus.length} atendimento${meus.length > 1 ? 's' : ''}, ${conf} confirmado${conf === 1 ? '' : 's'}.`], { dentistaId: d.id }, null);
      marcados['a_' + d.id] = Date.now(); feito.push('agenda:' + d.id);
    }
    if (Object.keys(marcados).length) await fs.mesclar(`clinicas/${cid}/waEnviados/${ag.data}`, marcados);
  }
  return feito;
}
const primeiroNome = n => (String(n || '').trim().split(/\s+/)[0] || '');
const nomeCurto = n => { const p = String(n || '').trim().split(/\s+/); return /^dra?\.?$/i.test(p[0] || '') ? `${p[0]} ${p[1] || ''}`.trim() : (p[0] || ''); };

const TEXTOS = {
  lembrete: p => `Olá, ${p[0]}! Lembrete da sua consulta na ${p[1]}: ${p[2]}, às ${p[3]}, com ${p[4]}. Motivo: ${p[5]}. Você confirma a presença?`,
  agendada: p => `Olá, ${p[0]}! Sua consulta na ${p[1]} foi agendada para ${p[2]}, às ${p[3]}, com ${p[4]}. Motivo: ${p[5]}. Até lá!`,
  agenda: p => `Bom dia, ${p[0]}! Sua agenda de hoje (${p[1]}) na ${p[2]}: ${p[3]}. ${p[4]}`,
};
async function enviar(ctx, tipo, fone, params, item, agIdBotoes) {
  const para = foneWA(fone);
  const ps = params.map(limpo);
  const texto = TEXTOS[tipo](ps);
  const log = { tipo, para: para ? para.slice(0, 4) + '•••' + para.slice(-4) : '', texto, em: Date.now(), agId: (item && item.agId) || '', simulado: !!ctx.cfg.simulacao || !ctx.tok, ok: true, erro: '' };
  if (!para) { log.ok = false; log.erro = 'telefone inválido'; }
  else if (!log.simulado) {
    const comp = [{ type: 'body', parameters: ps.map(t => ({ type: 'text', text: t })) }];
    if (agIdBotoes) {
      comp.push({ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `C|${ctx.cid}|${agIdBotoes}` }] });
      comp.push({ type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `R|${ctx.cid}|${agIdBotoes}` }] });
    }
    const r = await fetch(`https://graph.facebook.com/${ctx.env.GRAPH || 'v21.0'}/${ctx.cfg.phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + ctx.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'template', template: { name: (ctx.cfg.modelos && ctx.cfg.modelos[tipo]) || MODELOS[tipo], language: { code: 'pt_BR' }, components: comp } }),
    }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: String(e) } }) }));
    if (!r.ok) { const j = await r.json().catch(() => ({})); log.ok = false; log.erro = ((j.error && j.error.message) || ('HTTP ' + r.status)).slice(0, 200); }
  }
  await ctx.fs.criar(`clinicas/${ctx.cid}/waLog`, log);
  return log;
}
async function enviarTexto(env, numId, tok, para, texto) {
  return fetch(`https://graph.facebook.com/${env.GRAPH || 'v21.0'}/${numId}/messages`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto } }),
  });
}
async function tokenClinica(fs, cid) { const s = await fs.ler(`clinicas/${cid}/waSegredo/token`); return (s && String(s.token || '').trim()) || ''; }

// =============================== Firestore (REST com conta de serviço) ===============================
let tokCache = null, tokAte = 0;
export class Firestore {
  constructor(env) { this.env = env; this.base = `https://firestore.googleapis.com/v1/projects/${env.PROJETO}/databases/(default)/documents`; }
  async tok() {
    if (tokCache && Date.now() < tokAte) return tokCache;
    const sa = JSON.parse(this.env.GOOGLE_SA);
    const agora = Math.floor(Date.now() / 1000);
    const b64u = o => btoa(typeof o === 'string' ? o : String.fromCharCode(...new Uint8Array(o))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const cab = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const corpo = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }));
    const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    const chave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(cab + '.' + corpo));
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + cab + '.' + corpo + '.' + b64u(sig) });
    const j = await r.json();
    if (!j.access_token) throw new Error('login do Google falhou: ' + JSON.stringify(j).slice(0, 200));
    tokCache = j.access_token; tokAte = Date.now() + 50 * 60 * 1000;
    return tokCache;
  }
  async req(metodo, caminho, corpo, params) {
    const u = new URL(this.base + (caminho ? '/' + caminho : ''));
    for (const [k, v] of params || []) u.searchParams.append(k, v);
    const r = await fetch(u.toString(), { method: metodo, headers: { Authorization: 'Bearer ' + await this.tok(), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Firestore ${metodo} ${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  async ler(caminho) { const j = await this.req('GET', caminho); return j ? de({ mapValue: { fields: j.fields || {} } }) : null; }
  async listar(col) {
    const out = []; let tok = null;
    do {
      const j = await this.req('GET', col, null, [['pageSize', '300'], ...(tok ? [['pageToken', tok]] : [])]);
      for (const d of (j && j.documents) || []) out.push([d.name.split('/').pop(), de({ mapValue: { fields: d.fields || {} } })]);
      tok = j && j.nextPageToken;
    } while (tok);
    return out;
  }
  async mesclar(caminho, dados) { return this.req('PATCH', caminho, { fields: para(dados).mapValue.fields }, Object.keys(dados).map(k => ['updateMask.fieldPaths', '`' + k + '`'])); }
  async criar(col, dados) { return this.req('POST', col, { fields: para(dados).mapValue.fields }); }
  async apagar(caminho) { return this.req('DELETE', caminho); }
}
function de(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(de);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = de(x); return o; }
  return null;
}
function para(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(para) } };
  const f = {}; for (const [k, v] of Object.entries(x)) f[k] = para(v); return { mapValue: { fields: f } };
}
