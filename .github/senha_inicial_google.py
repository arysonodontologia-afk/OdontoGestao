# Libera UMA vez a senha inicial (123456) numa conta Google já existente, para o primeiro acesso.
# No primeiro acesso o aplicativo tira essa senha e a pessoa passa a entrar só pelo Google.
# Recebe o SHA-256 do e-mail (HASH); não imprime dados pessoais (o repositório é público).
import os, json, hashlib
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
P = os.environ['PROJETO']; H = os.environ['HASH'].strip().lower()
cred = service_account.Credentials.from_service_account_info(json.loads(os.environ['CHAVE']), scopes=['https://www.googleapis.com/auth/cloud-platform'])
S = AuthorizedSession(cred)
h = lambda e: hashlib.sha256(str(e or '').strip().lower().encode()).hexdigest()
r = S.get(f'https://identitytoolkit.googleapis.com/v1/projects/{P}/accounts:batchGet', params={'maxResults': 1000})
r.raise_for_status()
us = [u for u in r.json().get('users', []) if h(u.get('email')) == H]
if len(us) != 1: raise SystemExit(f'esperava 1 conta com esse e-mail, achei {len(us)}')
u = us[0]
r = S.post(f'https://identitytoolkit.googleapis.com/v1/projects/{P}/accounts:update', json={'localId': u['localId'], 'password': '123456', 'emailVerified': True})
print('resultado:', r.status_code, 'ok' if r.status_code == 200 else r.text[:200])
r = S.get(f'https://identitytoolkit.googleapis.com/v1/projects/{P}/accounts:batchGet', params={'maxResults': 1000})
u2 = [x for x in r.json().get('users', []) if h(x.get('email')) == H][0]
print('provedores agora:', [p.get('providerId') for p in u2.get('providerUserInfo', [])], '| tem senha:', 'passwordHash' in u2)
