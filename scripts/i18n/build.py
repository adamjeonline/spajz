# Gera os arquivos de tradução do app a partir de scripts/i18n/tr/*.txt.
# Uso (na pasta do Boxshelf):  python scripts/i18n/build.py
import os, runpy
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
os.chdir(here)
runpy.run_path(os.path.join(here, 'compile.py'))
d = open(os.path.join(here, 'pt-BR.json'), encoding='utf-8').read()
js = '// Gerado por scripts/i18n/build.py a partir das traduções em scripts/i18n/tr. Não edite à mão.\nwindow.__BS_PT=' + d + ';\n'
for p in ['renderer/i18n-pt-data.js', 'renderer/companion/i18n-pt-data.js']:
    open(os.path.join(root, p), 'w', encoding='utf-8').write(js)
open(os.path.join(root, 'shared/i18n-pt.json'), 'w', encoding='utf-8').write(d)
os.remove(os.path.join(here, 'pt-BR.json'))
print('ok')
