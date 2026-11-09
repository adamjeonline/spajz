# Tradução para o português

O Boxshelf continua com os textos em inglês no código. A tradução é aplicada enquanto a tela é desenhada:

- `renderer/i18n.js` troca os textos da interface (texto, dicas, campos, canvas e alertas) e também roda na
  página do celular (`renderer/companion/`).
- `shared/i18n-main.js` traduz as janelas do sistema (abrir arquivo, salvar, perguntas e erros).
- O dicionário fica em `renderer/i18n-pt-data.js` e `shared/i18n-pt.json`, gerados por `build.py`.

## Corrigir ou adicionar uma tradução

1. As traduções ficam em `tr/*.txt`, uma por linha: `número|texto em português`. O número é a posição do texto em
   inglês em `keys.json`. Para um texto que não está lá, use `extra.txt`: `=texto em inglês|texto em português`.
2. Partes que mudam ficam iguais ao código, por exemplo `${n}`. Para singular e plural:
   `[[${n===1?"":"s"}|jogo|jogos]]`.
3. Rode `python scripts/i18n/build.py`.

## Depois de atualizar o código do Boxshelf

`node scripts/i18n/extract.js . <arquivos .js>` lista os textos novos (precisa do pacote `acorn`).

Para voltar ao inglês num computador: no console do app, `localStorage.setItem('bs.lang','en')`, ou a variável de
ambiente `BS_LANG=en` para as janelas do sistema.
