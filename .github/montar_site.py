#!/usr/bin/env python3
"""Monta a pasta publicada (publico/).
- publico/          = versão mais nova (docs/ deste commit)
- publico/v/<ver>/  = versões anteriores publicadas na produção (só na branch main),
                      para cada cliente usar a versão que o administrador liberou
- publico/versoes.json = lista das versões disponíveis
"""
import json, os, shutil, subprocess, sys, tarfile, io

MAX_ANTIGAS = 8
MINIMA = (2, 11, 0)          # versões anteriores a esta não ficam disponíveis
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(raiz)
branch = os.environ.get('GITHUB_REF_NAME', '')
pub = 'publico'
shutil.rmtree(pub, ignore_errors=True)
shutil.copytree('docs', pub)
atual = json.load(open('docs/versao.json'))['versao']
ver = lambda v: tuple(int(x) for x in v.split('.'))
lista = [{'v': atual, 'commit': subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()[:10]}]

if branch == 'main':
    shas = subprocess.run(['git', 'log', '--first-parent', '--format=%H', 'HEAD'], capture_output=True, text=True, check=True).stdout.split()
    vistas = {atual}
    for sha in shas:
        r = subprocess.run(['git', 'show', f'{sha}:docs/versao.json'], capture_output=True, text=True)
        if r.returncode: continue
        try: v = json.loads(r.stdout)['versao']
        except Exception: continue
        if v in vistas or ver(v) < MINIMA: continue
        vistas.add(v)
        dest = os.path.join(pub, 'v', v)
        dados = subprocess.run(['git', 'archive', sha, 'docs'], capture_output=True, check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(dados)) as t:
            for m in t.getmembers():
                if not m.name.startswith('docs/') or m.name == 'docs/': continue
                m.name = m.name[len('docs/'):]
                try: t.extract(m, dest, filter='data')
                except TypeError: t.extract(m, dest)
        # versão anterior: a cada novo acesso volta ao endereço principal, que decide a versão da clínica
        idx = os.path.join(dest, 'index.html')
        h = open(idx, encoding='utf-8').read()
        volta = '<script>(function(){try{var m=/[?&]og_ok=(\\d+)/.exec(location.search);if(m&&Date.now()-(+m[1])<6*3600000)return;}catch(e){}location.replace("/"+location.hash);})();</script>'
        if 'og_ok' not in h:
            h = h.replace('<head>', '<head>' + volta, 1)
            open(idx, 'w', encoding='utf-8').write(h)
        if os.path.exists('docs/config-outro.json'):
            shutil.copy('docs/config-outro.json', os.path.join(dest, 'config-outro.json'))
        lista.append({'v': v, 'commit': sha[:10]})
        print('versão anterior disponível:', v, sha[:10])
        if len(lista) > MAX_ANTIGAS: break

json.dump({'atual': atual, 'versoes': lista}, open(os.path.join(pub, 'versoes.json'), 'w'), ensure_ascii=False)
print('publicado:', atual, '+', len(lista) - 1, 'anteriores')
