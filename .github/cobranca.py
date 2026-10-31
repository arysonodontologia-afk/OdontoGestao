#!/usr/bin/env python3
"""Cobrança automática da assinatura pelo Mercado Pago (sem Cloud Functions).

Roda pela rotina do GitHub. Em cada execução:
 1. garante um plano de assinatura no Mercado Pago para cada preço possível
    (plano + módulos + dentistas extras) e guarda os links em plataforma/precosMP;
 2. lê os pedidos das clínicas (clinicas/{cid}/cobranca/pedido); quando a clínica
    voltou do pagamento com o código da assinatura, confere no Mercado Pago:
      autorizada e em dia      -> ficha ativa, com o plano pago
      pagamento com problema   -> aviso na clínica; depois de DIAS_TOLERANCIA, modo de consulta
      cancelada ou pausada     -> idem
 O valor pago é sempre recalculado aqui: a clínica não consegue pagar menos do que o plano.

Variáveis: CHAVE (JSON da conta de serviço), PROJETO, MP_TOKEN, SITE (endereço do sistema).
Os preços abaixo precisam ser os mesmos de PLANOS/MODULOS em docs/app.js.
"""
import itertools, json, os, sys, time
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

PLANOS = {   # centavos; recursos já incluídos no plano
    'essencial': (4990, set()),
    'clinico':   (7990, {'prontuario', 'formularios'}),
    'completo':  (11990, {'prontuario', 'formularios', 'financeiro'}),
}
NOMES = {'essencial': 'Essencial', 'clinico': 'Clínico', 'completo': 'Completo'}
MODULOS = {'prontuario': 3990, 'financeiro': 4990, 'formularios': 1990}
DENTISTA_EXTRA = 1990
MAX_EXTRAS = 5
DIAS_TOLERANCIA = 5

TOKEN = os.environ.get('MP_TOKEN', '').strip()
if not TOKEN:
    print('Sem MP_TOKEN: cobrança automática desligada neste ambiente.'); sys.exit(0)
PROJ = os.environ.get('PROJETO', 'odontogestao-c8218')
SITE = os.environ.get('SITE', 'https://odontogestao-c8218.web.app').rstrip('/')
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJ}/databases/(default)/documents'
cred = service_account.Credentials.from_service_account_info(json.loads(os.environ['CHAVE']), scopes=['https://www.googleapis.com/auth/datastore'])
S = AuthorizedSession(cred)
MP = requests.Session(); MP.headers.update({'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'})
API = 'https://api.mercadopago.com'

# ---------- Firestore (REST) ----------
def de(v):
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return v['doubleValue']
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    if 'timestampValue' in v: return v['timestampValue']
    if 'arrayValue' in v: return [de(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v: return {k: de(x) for k, x in v['mapValue'].get('fields', {}).items()}
    return None
def para(x):
    if x is None: return {'nullValue': None}
    if isinstance(x, bool): return {'booleanValue': x}
    if isinstance(x, int): return {'integerValue': str(x)}
    if isinstance(x, float): return {'doubleValue': x}
    if isinstance(x, str): return {'stringValue': x}
    if isinstance(x, list): return {'arrayValue': {'values': [para(i) for i in x]}}
    if isinstance(x, dict): return {'mapValue': {'fields': {k: para(v) for k, v in x.items()}}}
    return {'stringValue': str(x)}
def ler(path):
    r = S.get(f'{BASE}/{path}')
    if r.status_code == 404: return None
    r.raise_for_status()
    return {k: de(v) for k, v in r.json().get('fields', {}).items()}
def gravar(path, dados):
    params = [('updateMask.fieldPaths', c) for c in dados.keys()]
    r = S.patch(f'{BASE}/{path}', params=params, json={'fields': {k: para(v) for k, v in dados.items()}})
    r.raise_for_status()
def gravar_ts(path, campo):   # data do servidor (para as regras, que comparam com request.time)
    r = S.post(f'{BASE}:commit', json={'writes': [{'transform': {'document': f'projects/{PROJ}/databases/(default)/documents/{path}',
        'fieldTransforms': [{'fieldPath': campo, 'setToServerValue': 'REQUEST_TIME'}]}}]})
    r.raise_for_status()
def clinicas():
    ids, tok = [], None
    while True:
        r = S.get(f'{BASE}/clinicas', params={'pageSize': 300, **({'pageToken': tok} if tok else {})}); r.raise_for_status()
        j = r.json()
        for d in j.get('documents', []):
            ids.append((d['name'].rsplit('/', 1)[1], {k: de(v) for k, v in d.get('fields', {}).items()}))
        tok = j.get('nextPageToken')
        if not tok: return ids
def agora(): return int(time.time() * 1000)

# ---------- preços ----------
def preco(plano, modulos, extras):
    base, inclui = PLANOS[plano]
    return base + sum(MODULOS[m] for m in modulos if m in MODULOS and m not in inclui) + int(extras) * DENTISTA_EXTRA
def combinacoes():
    for plano, (_, inclui) in PLANOS.items():
        livres = [m for m in MODULOS if m not in inclui]
        for n in range(len(livres) + 1):
            for mods in itertools.combinations(livres, n):
                for ex in range(MAX_EXTRAS + 1):
                    yield plano, mods, ex
def descricao(plano, mods, ex):
    t = 'OdontoGestão · plano ' + NOMES[plano]
    if mods: t += ' + ' + ', '.join(sorted(mods))
    if ex: t += f' + {ex} dentista(s) extra'
    return t

def garantir_planos():
    tab = ler('plataforma/precosMP') or {}
    links = dict(tab.get('links') or {})
    novos = 0
    for plano, mods, ex in combinacoes():
        c = str(preco(plano, mods, ex))
        if c in links and links[c].get('site') == SITE: continue
        corpo = {'reason': descricao(plano, mods, ex) if c not in links else f'OdontoGestão · assinatura de R$ {int(c)/100:.2f}'.replace('.', ','),
                 'auto_recurring': {'frequency': 1, 'frequency_type': 'months', 'transaction_amount': int(c) / 100, 'currency_id': 'BRL'},
                 'back_url': SITE + '/?assinatura=mp'}
        r = MP.post(f'{API}/preapproval_plan', json=corpo, headers={'X-Idempotency-Key': f'odontogestao-{PROJ}-plano-{c}-{SITE}'})
        if r.status_code >= 300:
            print('::warning::não foi possível criar o plano de', c, r.status_code, r.text[:300]); continue
        j = r.json()
        links[c] = {'id': j.get('id', ''), 'link': j.get('init_point', ''), 'site': SITE}
        novos += 1
        if novos % 10 == 0: gravar('plataforma/precosMP', {'links': links, 'atualizadoEm': agora()})   # não recria se a rotina parar no meio
    if novos or not tab:
        gravar('plataforma/precosMP', {'links': links, 'atualizadoEm': agora()})
    print('planos no Mercado Pago:', len(links), f'({novos} novos)')
    return links

# ---------- assinaturas ----------
DONOS = {}   # código da assinatura -> clínica que já usa (uma assinatura paga uma clínica só)
def conferir(cid, ficha, links):
    ped = ler(f'clinicas/{cid}/cobranca/pedido')
    ass = dict(ficha.get('assinatura') or {})
    pid = (ped or {}).get('preapprovalId') or ass.get('id')
    if ped and not ped.get('preapprovalId') and ped.get('status') == 'novo':
        c = str(preco(ped.get('plano', 'completo'), [k for k, v in (ped.get('modulos') or {}).items() if v], ped.get('dentistasExtras') or 0))
        if c in links and ped.get('link') != links[c]['link']:
            gravar(f'clinicas/{cid}/cobranca/pedido', {'link': links[c]['link']})
    if not pid: return
    r = MP.get(f'{API}/preapproval/{pid}')
    if r.status_code == 404:
        if ped and ped.get('preapprovalId') == pid:
            gravar(f'clinicas/{cid}/cobranca/pedido', {'status': 'erro', 'erro': 'Assinatura não encontrada no Mercado Pago.'})
        return
    r.raise_for_status(); mp = r.json()
    st = mp.get('status', '')
    def recusar(msg):
        print(f'::warning::{cid}: assinatura {pid}: {msg}')
        if ped and ped.get('preapprovalId') == pid:
            gravar(f'clinicas/{cid}/cobranca/pedido', {'status': 'erro', 'erro': msg + ' Fale com o suporte.'})
    planos_nossos = {v.get('id') for v in links.values()}
    if mp.get('preapproval_plan_id') not in planos_nossos:
        return recusar('Esta assinatura não é de um plano do OdontoGestão.')
    if DONOS.get(pid, cid) != cid:
        return recusar('Esta assinatura já está ligada a outra clínica.')
    valor = round(float((mp.get('auto_recurring') or {}).get('transaction_amount') or 0) * 100)
    sem = ((mp.get('summarized') or {}).get('semaphore') or '').lower()
    # o que foi pago define o plano; se veio de um pedido, o valor tem que bater com ele
    fonte = ped if (ped and ped.get('preapprovalId') == pid) else ass
    plano = fonte.get('plano') or ficha.get('plano') or 'completo'
    mods = {k: True for k, v in (fonte.get('modulos') or {}).items() if v}
    ex = int(fonte.get('dentistasExtras') or 0)
    esperado = preco(plano, mods, ex)
    if valor != esperado:
        print(f'::warning::{cid}: assinatura {pid} de {valor} centavos, plano pede {esperado}')
        if ped and ped.get('preapprovalId') == pid:
            gravar(f'clinicas/{cid}/cobranca/pedido', {'status': 'erro', 'erro': 'O valor pago não corresponde ao plano escolhido. Fale com o suporte.'})
        return
    nova = {'origem': 'mp', 'id': pid, 'status': st, 'plano': plano, 'modulos': mods, 'dentistasExtras': ex, 'valor': valor,
            'proxima': mp.get('next_payment_date') or '', 'conferidoEm': agora(), 'desde': ass.get('desde') or agora(),
            'problemaDesde': ass.get('problemaDesde') or 0}
    em_dia = st == 'authorized' and sem != 'red'
    mud = {}
    DONOS.setdefault(pid, cid)
    if em_dia:
        nova['problemaDesde'] = 0
        mud = {'status': 'ativa', 'plano': plano, 'modulos': mods, 'dentistasExtras': ex}
        if ficha.get('status') != 'ativa' and not ficha.get('ativadaEm'): gravar_ts(f'clinicas/{cid}', 'ativadaEm')
    elif st in ('authorized', 'paused', 'cancelled'):
        if not nova['problemaDesde']: nova['problemaDesde'] = agora()
        if agora() - nova['problemaDesde'] > DIAS_TOLERANCIA * 86400000 and ficha.get('status') == 'ativa':
            mud = {'status': 'suspensa', 'motivo': 'pagamento'}
    # 'pending': a clínica ainda não terminou o pagamento; nada muda
    gravar(f'clinicas/{cid}', dict(mud, assinatura=nova))
    if ped and ped.get('preapprovalId') == pid:
        gravar(f'clinicas/{cid}/cobranca/pedido', {'status': 'confirmada' if em_dia else ('aguardando' if st == 'pending' else 'problema'), 'erro': '', 'conferidoEm': agora()})
    print(f'{cid}: {st} {sem or "-"} -> {mud.get("status", "sem mudança")}')

links = garantir_planos()
erros = 0
todas = clinicas()
for cid, ficha in todas:   # quem já tem assinatura confirmada fica com ela
    a = ficha.get('assinatura') or {}
    if a.get('origem') == 'mp' and a.get('id'): DONOS.setdefault(a['id'], cid)
for cid, ficha in todas:
    if ficha.get('espelho'): continue
    try: conferir(cid, ficha, links)
    except Exception as e:
        erros += 1; print(f'::warning::{cid}: {e}')
print('pronto', '(com avisos)' if erros else '')
