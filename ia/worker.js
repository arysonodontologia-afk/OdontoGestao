// OdontoGestão · análise de radiografia com IA (Cloudflare Worker)
//
// Intermediário entre o aplicativo e a API do Claude. Não guarda nada.
//  1. confere o login do Firebase (token do usuário) e o projeto (teste ou produção);
//  2. confere, com o próprio token do usuário, que ele tem acesso ativo à clínica e que
//     a clínica tem a personalização "analise-radiografia" ligada;
//  3. envia a imagem (sem nome nem dados do paciente) ao Claude e devolve achados e traçados.
//
// Variáveis: PROJETOS (ids do Firebase aceitos, separados por vírgula), ORIGENS (sites aceitos),
// MODELO (opcional). Segredo: ANTHROPIC_API_KEY.
// A imagem chega como texto base64 (JPEG) no corpo, e os dados em cabeçalhos: assim o Worker
// não precisa decodificar nada grande (cabe no limite de CPU do plano grátis).

const CHAVE = 'analise-radiografia';
const TITULO = 'Análise de radiografia com IA (apoio ao diagnóstico)';
const MAX_B64 = 6 * 1024 * 1024;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let jwksCache = null, jwksAte = 0;

export default {
  async fetch(req, env) {
    const origem = req.headers.get('Origin') || '';
    const origens = (env.ORIGENS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': origens.includes(origem) ? origem : (origens[0] || '*'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Clinica, X-Tipo, X-Dente, X-Largura, X-Altura',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const resp = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET') return resp(200, { ok: true, servico: 'odontogestao-ia' });
    if (req.method !== 'POST') return resp(405, { erro: 'Método não permitido.' });
    if (origens.length && !origens.includes(origem)) return resp(403, { erro: 'Origem não autorizada.' });
    if (!env.ANTHROPIC_API_KEY) return resp(503, { erro: 'A análise ainda não foi configurada (chave da IA ausente).' });

    // 1) login
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let user;
    try { user = await verificarToken(tok, (env.PROJETOS || '').split(',').map(s => s.trim()).filter(Boolean)); }
    catch (e) { return resp(401, { erro: 'Sessão inválida. Saia e entre de novo no sistema.' }); }

    // 2) clínica, acesso e personalização (lidos com o token do próprio usuário: valem as regras do banco)
    const cid = (req.headers.get('X-Clinica') || '').trim();
    if (!/^[\w-]{1,80}$/.test(cid)) return resp(400, { erro: 'Clínica não informada.' });
    const base = `https://firestore.googleapis.com/v1/projects/${user.aud}/databases/(default)/documents`;
    const hdr = { Authorization: 'Bearer ' + tok };
    const [rf, ra] = await Promise.all([
      fetch(`${base}/clinicas/${cid}`, { headers: hdr }),
      fetch(`${base}/clinicas/${cid}/acessos/${encodeURIComponent(user.email)}`, { headers: hdr }),
    ]);
    if (!rf.ok || !ra.ok) return resp(403, { erro: 'Sem acesso a esta clínica.' });
    const ficha = (await rf.json()).fields || {}, acesso = (await ra.json()).fields || {};
    if (!(acesso.ativo && acesso.ativo.booleanValue === true)) return resp(403, { erro: 'Acesso inativo nesta clínica.' });
    if (!temPersonalizacao(ficha)) return resp(403, { erro: 'A análise com IA não está liberada para esta clínica.' });
    const st = (ficha.status && ficha.status.stringValue) || '';
    if (st === 'suspensa') return resp(403, { erro: 'Clínica em modo de consulta.' });

    // 3) imagem
    const W = parseInt(req.headers.get('X-Largura') || '0', 10), H = parseInt(req.headers.get('X-Altura') || '0', 10);
    if (!(W >= 100 && H >= 100 && W <= 2576 && H <= 2576)) return resp(400, { erro: 'Tamanho de imagem inválido.' });
    const tipo = ({ periapical: 'periapical', interproximal: 'interproximal', panoramica: 'panorâmica' })[req.headers.get('X-Tipo') || ''] || 'periapical';
    const dente = (req.headers.get('X-Dente') || '').replace(/[^0-9]/g, '').slice(0, 2);
    const b64 = await req.text();
    if (!b64 || b64.length > MAX_B64 || b64.indexOf('"') !== -1 || b64.indexOf('\\') !== -1 || b64.indexOf(',') !== -1)
      return resp(400, { erro: 'Imagem inválida ou grande demais.' });

    const modelo = env.MODELO || 'claude-sonnet-5-5';
    const corpo = '{"model":' + JSON.stringify(modelo) + ',"max_tokens":6000,"system":' + JSON.stringify(SISTEMA)
      + ',"tools":[' + JSON.stringify(FERRAMENTA) + '],"tool_choice":{"type":"tool","name":"registrar_analise"}'
      + ',"messages":[{"role":"user","content":[{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"'
      + b64 + '"},"oversized_image":"error"},{"type":"text","text":' + JSON.stringify(pedido(tipo, dente, W, H)) + '}]}]}';

    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': String(env.ANTHROPIC_API_KEY).trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: corpo,
      });
    } catch (e) { return resp(502, { erro: 'Não foi possível falar com a IA. Tente de novo.' }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      console.log('anthropic', r.status, msg.slice(0, 300));
      return resp(502, { erro: r.status === 429 || r.status === 529 ? 'A IA está ocupada. Tente de novo em alguns segundos.' : r.status === 402 || /credit/i.test(msg) ? 'Sem créditos na conta da IA. Avise o suporte do OdontoGestão.' : 'A IA não conseguiu analisar esta imagem.', detalhe: ('HTTP ' + r.status + ': ' + msg).slice(0, 240) });
    }
    const uso = (j.content || []).find(c => c.type === 'tool_use');
    if (!uso) return resp(502, { erro: 'A IA não devolveu uma análise. Tente de novo.' });
    return resp(200, { analise: uso.input, modelo: j.model || modelo, largura: W, altura: H, tokens: j.usage || null });
  },
};

function temPersonalizacao(f) {
  const ativos = ((f.personalizacoes && f.personalizacoes.arrayValue && f.personalizacoes.arrayValue.values) || [])
    .map(v => String(v.integerValue || v.doubleValue || v.stringValue || ''));
  const chaves = (f.personalizacoesChaves && f.personalizacoesChaves.mapValue && f.personalizacoesChaves.mapValue.fields) || {};
  const info = (f.personalizacoesInfo && f.personalizacoesInfo.mapValue && f.personalizacoesInfo.mapValue.fields) || {};
  return ativos.some(n => (chaves[n] && chaves[n].stringValue === CHAVE) || (info[n] && info[n].stringValue === TITULO));
}

// ---------- token do Firebase (RS256, chaves públicas do Google) ----------
function b64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function chaves() {
  if (jwksCache && Date.now() < jwksAte) return jwksCache;
  const r = await fetch(JWKS_URL);
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '');
  jwksCache = j.keys || []; jwksAte = Date.now() + (m ? +m[1] : 3600) * 1000;
  return jwksCache;
}
async function verificarToken(tok, projetos) {
  const partes = tok.split('.');
  if (partes.length !== 3) throw new Error('token');
  const cab = JSON.parse(new TextDecoder().decode(b64url(partes[0])));
  const p = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
  if (cab.alg !== 'RS256') throw new Error('alg');
  const jwk = (await chaves()).find(k => k.kid === cab.kid);
  if (!jwk) throw new Error('kid');
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, b64url(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
  if (!ok) throw new Error('assinatura');
  const agora = Math.floor(Date.now() / 1000);
  if (!projetos.includes(p.aud) || p.iss !== 'https://securetoken.google.com/' + p.aud) throw new Error('projeto');
  if (!(p.exp > agora - 60) || !(p.iat < agora + 300) || !p.sub) throw new Error('validade');
  if (!p.email || p.email_verified !== true) throw new Error('email');
  return { aud: p.aud, email: String(p.email).toLowerCase(), uid: p.sub };
}

// ---------- instruções para a IA ----------
const SISTEMA = `Você é um assistente de apoio à interpretação de radiografias odontológicas, usado por cirurgiões-dentistas dentro de um prontuário eletrônico no Brasil.
Regras:
- Você NÃO faz diagnóstico. Descreva achados radiográficos com linguagem de apoio ("imagem sugestiva de", "área radiolúcida compatível com", "avaliar clinicamente"). O diagnóstico é sempre do profissional.
- Seja conservador: se não houver evidência clara, diga que não é possível afirmar. Prefira "certeza baixa" a omitir um achado relevante, e nunca invente estruturas que não aparecem na imagem.
- Use a numeração dentária FDI (11 a 48) quando conseguir identificar o dente; senão deixe o campo vazio.
- Coordenadas: SEMPRE em pixels da imagem recebida, com origem (0,0) no canto superior esquerdo, x para a direita e y para baixo, dentro dos limites da largura e altura informadas.
- Escreva tudo em português do Brasil, de forma objetiva e técnica.
- Registre o resultado chamando a ferramenta registrar_analise.`;

function pedido(tipo, dente, W, H) {
  const pano = tipo === 'panorâmica';
  return `Radiografia ${tipo}${dente ? `, dente de referência ${dente}` : ''}. A imagem tem ${W} x ${H} pixels.

1. Avalie a qualidade da imagem para interpretação.
2. Liste os achados radiográficos relevantes (cáries, lesões periapicais, perda óssea, reabsorções, fraturas, restaurações, tratamentos endodônticos, pinos, coroas, implantes, cálculo, dentes inclusos etc.). Para cada achado, informe a caixa [x1, y1, x2, y2] em pixels que envolve a região.
3. ${pano ? 'Em panorâmica, trace raízes e condutos SOMENTE dos dentes com achado endodôntico ou periapical relevante (no máximo 6 dentes).' : 'Para cada dente cujas raízes aparecem na imagem, identifique o número de raízes e de condutos radiculares.'}
   - Raiz: trace o CONTORNO de cada raiz como uma sequência de 8 a 16 pontos: começa na junção cemento-esmalte de um lado, desce pela superfície da raiz até o ápice e sobe pelo outro lado até a junção cemento-esmalte.
   - Conduto: trace a LINHA CENTRAL de cada canal radicular visível como uma sequência de 5 a 10 pontos, do orifício na câmara pulpar até o ápice.
   - Se um conduto não for visível com clareza, não trace: explique em "observacao" e informe a quantidade provável com certeza baixa.
4. Escreva um resumo curto e as limitações desta análise.`;
}

const PONTOS = { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, minItems: 2, maxItems: 24 };
const FERRAMENTA = {
  name: 'registrar_analise',
  description: 'Registra a análise de apoio da radiografia: achados, raízes e condutos com coordenadas em pixels.',
  input_schema: {
    type: 'object',
    properties: {
      qualidade_imagem: { type: 'string', description: 'Boa, regular ou ruim, com o motivo em poucas palavras.' },
      resumo: { type: 'string', description: 'Até 3 frases.' },
      achados: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            titulo: { type: 'string' },
            descricao: { type: 'string' },
            dente: { type: 'string', description: 'Número FDI ou vazio.' },
            tipo: { type: 'string', enum: ['carie', 'lesao_periapical', 'perda_ossea', 'reabsorcao', 'fratura', 'restauracao', 'tratamento_endodontico', 'pino_coroa', 'implante', 'calculo', 'incluso', 'outro'] },
            certeza: { type: 'string', enum: ['baixa', 'media', 'alta'] },
            caixa: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: '[x1, y1, x2, y2] em pixels.' },
          },
          required: ['titulo', 'descricao', 'tipo', 'certeza', 'caixa'],
        },
      },
      dentes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dente: { type: 'string', description: 'Número FDI ou vazio.' },
            n_raizes: { type: 'integer' },
            n_condutos: { type: 'integer' },
            certeza: { type: 'string', enum: ['baixa', 'media', 'alta'] },
            observacao: { type: 'string' },
            raizes: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string', description: 'Ex.: mesial, distal, palatina, única.' }, pontos: PONTOS }, required: ['pontos'] } },
            condutos: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string', description: 'Ex.: MV, ML, D, P, único.' }, pontos: PONTOS }, required: ['pontos'] } },
          },
          required: ['n_raizes', 'n_condutos', 'certeza', 'raizes', 'condutos'],
        },
      },
      limitacoes: { type: 'string' },
    },
    required: ['qualidade_imagem', 'resumo', 'achados', 'dentes', 'limitacoes'],
  },
};
