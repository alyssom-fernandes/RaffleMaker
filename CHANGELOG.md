# Changelog

Registro das mudanças do RaffleMaker, por versão. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). As datas são as dos
commits; o repositório não tem tags.

## [3.0.0] - não lançada

A primeira versão com o nome RaffleMaker: o repositório `rifa` foi renomeado em
2026-10-28. A data entra aqui no dia da publicação.

### Adicionado
- Demonstração em `?demo=1`: uma rifa fictícia que existe só na memória. Ela
  nunca lê nem grava os dados salvos; o backup, a planilha e o PNG saem com
  "demonstração" no nome, e o painel de verdade recusa restaurar esse backup.
- Prêmios editáveis: nome, marca ou doador e foto de cada um dos 4 prêmios. As
  fotos ficam no aparelho (IndexedDB) e vão junto no backup, que passa à
  versão 3 quando há foto. Sem prêmios salvos, o painel segue com os 4 prêmios
  da rifa original.
- Tema claro e escuro, que segue o aparelho até alguém escolher.
- Resumo com a barra de pagos, falta pagar e livres, e a arte dentro de um
  celular, com a moldura do Status.
- Nome RaffleMaker no cabeçalho, ícone de bilhete, rodapé "AFN SYSTEMS |
  RaffleMaker" e assinatura no Sobre.
- Testes: `node --test` para as funções puras do painel e do motor da arte e
  para a CSP, e um teste no navegador com Playwright (`tests/e2e.py`). Os dois
  rodam a cada envio (GitHub Actions).
- Content-Security-Policy por meta, com o script inline liberado pelo hash.
- `scripts/miniaturas.py`, que refaz as miniaturas dos modelos, e
  `scripts/telas.py`, que refaz as imagens do README e da prévia de link.
- README em inglês e em português, LICENSE (MIT), este CHANGELOG, `.mailmap`,
  página 404, prévia de link (`og.png`) e Dependabot mensal para as GitHub
  Actions.

### Alterado
- Num aparelho sem dados, a causa começa vazia, e a arte esconde o bloco da
  causa até alguém escrever uma.
- As miniaturas dos modelos mostram a causa da demonstração.

### Corrigido
- No celular, com um comprador em "Falta pagar", a tabela de compradores
  alargava a página (417 px numa tela de 390 px).

## [2.0.0] - 2026-10-28

### Adicionado
- 10 modelos de arte (Cartela, Pôster, Bento, Vitrine, Capa, Jornal, Embarque,
  Solidária, Blocos e Cinema), cada um num HTML de 1080 × 1920 preenchido por
  `arte/motor.js`, com a prévia ao vivo no painel.
- Causa (até 120 caracteres), frase do rodapé (até 90), valor do número (até
  R$ 9.999,99) e quantidade de números (300, 400 ou 500).
- PNG desenhado por `arte/svgshot.js`, que transforma a arte num SVG sem
  `foreignObject`.
- No celular, a imagem abre numa tela com Compartilhar e Baixar.

### Alterado
- Backup na versão 2. Nos dados da 1.0, a frase com "em prol" vira a causa.

## [1.0.0] - 2026-10-27

Primeira versão, publicada como `rifa` nos commits "Publica o painel da rifa" e
"Adiciona campo de frase personalizada na arte".

### Adicionado
- Painel num `index.html`: grade de 300 números (Shift + clique seleciona uma
  sequência), venda com nome, WhatsApp, pagamento e observação, busca por nome
  ou número e tabela de compradores com "marcar pago" e link do WhatsApp.
- Resumo com os números vendidos, o arrecadado e o que falta receber.
- Arte do story em 4 modelos (Cartela, Pôster, Bento e Vitrine), com os números
  vendidos marcados (todos com nome ou só os pagos), baixada em PNG.
- Salvamento automático no navegador, backup em arquivo, restauração e
  planilha para o Excel.
- Frase personalizada na arte, ao lado do "Boa sorte!".

[3.0.0]: https://github.com/alyssom-fernandes/RaffleMaker/compare/9c6a735...HEAD
[2.0.0]: https://github.com/alyssom-fernandes/RaffleMaker/compare/4d6a2a6...9c6a735
[1.0.0]: https://github.com/alyssom-fernandes/RaffleMaker/commits/4d6a2a6
