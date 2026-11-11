# Diagnóstico de login de UM usuário, sem expor dados pessoais no log (o repositório é público).
# Recebe o SHA-256 do e-mail (HASH) e mostra só se existe conta, provedores, acesso e cadastro na clínica.
import os, json, hashlib
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
P = os.environ['PROJETO']; H = os.environ['HASH'].strip().lower()
cred = service_account.Credentials.from_service_account_info(json.loads(os.environ['CHAVE']), scopes=['https://www.googleapis.com/auth/cloud-platform'])
S = AuthorizedSession(cred)
h = lambda e: hashlib.sha256(str(e or '').strip().lower().encode()).hexdigest()
FS = f'https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents'
def listar(caminho):
    out, tok = [], None
    while True:
        r = S.get(f'{FS}/{caminho}', params={'pageSize': 300, **({'pageToken': tok} if tok else {})})
        if r.status_code != 200: print('  (não consegui listar', caminho.split('/')[-1], r.status_code, ')'); return out
        j = r.json(); out += j.get('documents', []); tok = j.get('nextPageToken')
        if not tok: return out
def val(v):
    if v is None: return None
    for k in ('stringValue','booleanValue','integerValue','doubleValue','timestampValue'):
        if k in v: return v[k]
    if 'mapValue' in v: return {k: val(x) for k, x in v['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in v: return [val(x) for x in v['arrayValue'].get('values', [])]
    return None
print('== Conta de login (Firebase Authentication)')
r = S.get(f'https://identitytoolkit.googleapis.com/v1/projects/{P}/accounts:batchGet', params={'maxResults': 1000})
if r.status_code != 200: print('  sem permissão para ler contas:', r.status_code)
else:
    us = [u for u in r.json().get('users', []) if h(u.get('email')) == H]
    print('  contas com esse e-mail:', len(us))
    for u in us: print('  provedores:', [p.get('providerId') for p in u.get('providerUserInfo', [])], '| e-mail verificado:', u.get('emailVerified', False), '| desativada:', u.get('disabled', False))
print('== Índice membros')
ms = [d for d in listar('membros') if h(d['name'].split('/')[-1]) == H]
print('  encontrado:', len(ms))
for d in ms:
    f = {k: val(x) for k, x in d.get('fields', {}).items()}; print('  campos:', sorted(f.keys()), '| clínica principal:', f.get('cid') == 'principal' or f.get('clinica') == 'principal')
cids = set()
for d in ms:
    f = {k: val(x) for k, x in d.get('fields', {}).items()}
    for k in ('cid','clinica','clinicaId'):
        if f.get(k): cids.add(f[k])
cids.add('principal')
for cid in cids:
    print(f'== Clínica {"principal" if cid=="principal" else "(outra)"}')
    ac = [d for d in listar(f'clinicas/{cid}/acessos') if h(d['name'].split('/')[-1]) == H]
    print('  acesso:', len(ac))
    for d in ac:
        f = {k: val(x) for k, x in d.get('fields', {}).items()}
        print('  ativo:', f.get('ativo'), '| tipo:', f.get('tipo'), '| tem userId:', bool(f.get('userId')), '| senhaInicialEm:', bool(f.get('senhaInicialEm')))
    n = 0
    for d in listar(f'clinicas/{cid}/usuarios'):
        for k, x in d.get('fields', {}).items():
            vv = val(x)
            txt = json.dumps(vv)
            try:
                itens = vv if isinstance(vv, dict) else {}
                for _, it in itens.items():
                    dd = it.get('d') if isinstance(it, dict) else it
                    u = json.loads(dd) if isinstance(dd, str) else dd
                    if isinstance(u, dict) and h(u.get('email')) == H:
                        n += 1; print('  cadastro em Usuários: tipo', u.get('tipo'), '| inativo:', bool(u.get('inativo')), '| e-mail com espaço/maiúscula:', u.get('email') != str(u.get('email')).strip().lower())
            except Exception as e: pass
    print('  cadastros em Usuários com esse e-mail:', n)
