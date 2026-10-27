#!/usr/bin/env python3
"""Pedido de publicação feito pelo ambiente de teste (plataforma/publicacao, na produção).
  pedido.py ver        -> imprime 'versao=X' se há pedido pendente (status 'pedido'); senão nada
  pedido.py marcar ST [mensagem]  -> atualiza o status (publicando | publicado | erro)
  pedido.py enviar     -> aplica o envio aos clientes pedido (plataforma/versoes)
A chave da conta de serviço vem em CHAVE (JSON). Projeto: PROJETO (padrão odontogestao-c8218).
"""
import json, os, sys, time
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

PROJ = os.environ.get('PROJETO', 'odontogestao-c8218')
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJ}/databases/(default)/documents'
cred = service_account.Credentials.from_service_account_info(json.loads(os.environ['CHAVE']), scopes=['https://www.googleapis.com/auth/datastore'])
S = AuthorizedSession(cred)

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
def gravar(path, dados, campos=None):
    params = [('updateMask.fieldPaths', c) for c in (campos or dados.keys())]
    r = S.patch(f'{BASE}/{path}', params=params, json={'fields': {k: para(v) for k, v in dados.items()}})
    r.raise_for_status()
def agora(): return int(time.time() * 1000)

acao = sys.argv[1]
p = ler('plataforma/publicacao') or {}
if acao == 'ver':
    if p.get('status') == 'pedido' and p.get('versao'):
        print('versao=' + p['versao'])
elif acao == 'marcar':
    st = sys.argv[2]; msg = sys.argv[3] if len(sys.argv) > 3 else ''
    d = {'status': st, 'erro': msg if st == 'erro' else ''}
    if st in ('publicado', 'erro'): d['concluidoEm'] = agora()
    if st == 'publicando': d['iniciadoEm'] = agora()
    gravar('plataforma/publicacao', d)
elif acao == 'enviar':
    para_q = p.get('enviarPara') or 'ninguem'; v = p.get('versao')
    if para_q == 'ninguem' or not v: sys.exit(0)
    ids = list(p.get('clinicas') or [])
    if para_q == 'todos':
        ids = ['principal']
        tok = None
        while True:
            r = S.get(f'{BASE}/clinicas', params={'pageSize': 300, 'mask.fieldPaths': 'nome', **({'pageToken': tok} if tok else {})}); r.raise_for_status()
            j = r.json(); ids += [d['name'].rsplit('/', 1)[1] for d in j.get('documents', [])]
            tok = j.get('nextPageToken')
            if not tok: break
    pv = ler('plataforma/versoes') or {}
    cl = dict(pv.get('clinicas') or {})
    for i in ids: cl[i] = v
    hist = list(pv.get('hist') or []) + [{'acao': 'envio', 'versao': v, 'clinicas': ids, 'em': agora(), 'por': (p.get('por') or '') + ' (publicação automática)'}]
    gravar('plataforma/versoes', {'clinicas': cl, 'hist': hist[-60:], 'padrao': pv.get('padrao') or v})
    print('enviado para', len(ids), 'cliente(s)')
