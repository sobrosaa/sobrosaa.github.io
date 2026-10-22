# Lucas Sobrosa · Portfólio

Um portfólio que funciona como um **editor de motion design**: painel de projeto, viewport da composição, painel de propriedades e uma linha do tempo de verdade. Cada seção do site é uma camada; navegar é mover o cursor de tempo.

Feito em HTML, CSS e JavaScript puros, sem frameworks e sem bibliotecas de animação.

**[Ver o site](https://sobrosaa.github.io)**

## Como usar

| Ação | Como |
| --- | --- |
| Reproduzir / pausar | `Espaço` ou o botão ▶ |
| Quadro a quadro | `←` `→` |
| Próxima / cena anterior | `Shift` + `→` / `←`, rolar o mouse no viewer ou deslizar no celular |
| Ir para uma cena | clicar nas abas, nas composições ou nas camadas |
| Scrub | arrastar na linha do tempo |

## Como funciona

- **Um único relógio.** Existe uma variável `time` em segundos. A função `render(time)` desenha tudo a partir dela: cenas, letras, barras, timecode e o painel de propriedades. Tocar, arrastar ou navegar só muda esse número.
- **Animação declarativa no HTML.** Cada elemento animado diz o tipo e o atraso: `data-a="up" data-d="0.4"`. O JavaScript lê esses atributos e calcula o progresso de cada um.
- **Easing de verdade.** `easeOutBack`, `easeOutExpo` e `easeOutCubic` transformam um progresso linear (0 a 1) em movimento com peso, como as curvas do editor de gráficos do After Effects.
- **Timeline gerada por código.** Camadas, barras, keyframes e marcadores são criados a partir da lista `SCENES`. Os keyframes ficam azuis quando o cursor passa por eles.
- **Painel de propriedades ao vivo.** Posição, escala e opacidade da camada principal são convertidas para pixels de uma composição 1920 × 1080 a cada quadro.
- **Escala com container queries.** Todo o conteúdo da composição usa unidades `cqw`, então escala junto com o viewer. No celular a composição fica vertical (4:5).
- **Acessível.** A timeline é controlável pelo teclado, e `prefers-reduced-motion` desliga as animações.

## Estrutura

```
index.html   estrutura dos painéis e o conteúdo de cada cena
style.css    interface do editor e visual das cenas
script.js    relógio, render, easing, timeline e interações
```

## Rodar localmente

Abra o `index.html` no navegador. Não precisa instalar nada.

## Contato

[LinkedIn](https://www.linkedin.com/in/sobrosa9) · [GitHub](https://github.com/sobrosaa)
