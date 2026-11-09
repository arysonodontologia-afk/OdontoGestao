#!/usr/bin/env python3
"""Grava em plataforma/<DOC> (padrão: ia) o endereço de um Worker do Cloudflare (lido pelo aplicativo)."""
import json, os, sys, time
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
url = os.environ.get('URL_IA', '').strip()
if not url.startswith('https://'): print('Sem URL do Worker; nada gravado.'); sys.exit(0)
proj = os.environ['PROJETO']
doc = os.environ.get('DOC', 'ia')
cred = service_account.Credentials.from_service_account_info(json.loads(os.environ['CHAVE']), scopes=['https://www.googleapis.com/auth/datastore'])
s = AuthorizedSession(cred)
r = s.patch(f'https://firestore.googleapis.com/v1/projects/{proj}/databases/(default)/documents/plataforma/{doc}',
            params=[('updateMask.fieldPaths', 'url'), ('updateMask.fieldPaths', 'atualizadoEm')],
            json={'fields': {'url': {'stringValue': url}, 'atualizadoEm': {'integerValue': str(int(time.time() * 1000))}}})
r.raise_for_status(); print(f'plataforma/{doc} =', url)
