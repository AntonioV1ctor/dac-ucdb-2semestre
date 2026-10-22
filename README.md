# Lixeira Inteligente UCDB — Protótipo 3D

Simulação 3D de uma lixeira com sensor de nível: um sensor ultrassônico **HC-SR04** mede a
distância até o lixo, um **Raspberry Pi** envia a leitura por Wi-Fi e um **app no celular**
mostra no mapa do campus se cada lixeira está **Vazia** (verde), **Pela metade** (laranja) ou
**Cheia** (vermelho). Quando a lixeira passa da metade, o app libera o botão **Acionar coleta**.

Feito com HTML, CSS e JavaScript puro + [Three.js](https://threejs.org) (carregado por CDN).
Não precisa instalar nem compilar nada.

## Como usar

| Ação | Como |
| --- | --- |
| Jogar lixo na lixeira | Escolha a lixeira e o tipo de lixo e clique em **Adicionar lixo** (atalho: `Espaço`) |
| Ver o lixo e o sensor por dentro | **Ver por dentro** (atalho: `X`) |
| Ler o app de perto | **Focar no app**, ou clique no celular (atalho: `P`) |
| Acionar a coleta | Toque em **Acionar coleta** na tela do celular 3D (ou no painel, atalho: `C`) |
| Trocar de lixeira | Clique na lixeira ou use `1` / `2` |
| Acelerar as animações | Botão **1× / 2×** |
| Girar e dar zoom na cena | Arraste e use a rolagem do mouse |
| Apresentação automática | **Modo apresentação** (atalho: `M`, sair com `Esc`) |

Faixas de status (iguais às do mapa): até 39% vazia · 40–79% pela metade · 80% ou mais cheia.

### Modo apresentação

Esconde o painel e roda sozinho um roteiro de ~1min30, com legendas embaixo:

1. **Abertura** — a câmera gira até a visão geral.
2. **Componentes** — zoom no sensor HC-SR04, no Arduino, no Raspberry Pi e no app, cada um com
   um balão (ponto + linha + caixa) explicando para que serve.
3. **Descarte** — a mão joga lixo na lixeira A-01 (transparente, dá para ver o lixo subindo).
4. **App** — a câmera fecha no celular enquanto a lixeira enche; ao passar de 80% um dedo
   aperta **Acionar coleta**.
5. **Coleta** — a câmera se afasta e o funcionário troca o saco.
6. **Fim** — o app mostra a lixeira vazia de novo e a câmera volta à visão geral.

Os textos e tempos de cada etapa ficam em [js/presentation.js](js/presentation.js).
Se o seu protótipo liga o sensor direto no Raspberry Pi (sem Arduino), troque
`placaArduino` para `false` em [js/config.js](js/config.js): a placa some da cena e do roteiro.

### Dica para a apresentação

No console do navegador (F12) dá para deixar uma lixeira quase cheia na hora:

```js
lixeira.encher(0, 75)   // lixeira A-01 com 75%
lixeira.encher(1, 90)   // lixeira A-02 com 90%
```

## Rodar no computador

Como o código usa módulos JavaScript, abrir o `index.html` com dois cliques (`file://`)
**não funciona**. Use um servidor local:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Publicar no GitHub Pages

1. Envie os arquivos para um repositório no GitHub (o `index.html` precisa ficar na raiz).
2. No repositório: **Settings → Pages → Build and deployment**.
3. Em **Source** escolha *Deploy from a branch*, selecione a branch `main` e a pasta `/ (root)`.
4. Salve. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Estrutura

```
index.html        página e painel de controles
css/style.css     estilos
js/config.js      ⚙️ configurações: nomes, cores, limites (%), volume de cada lixo, lixeiras do mapa
js/main.js        cena 3D, sensor → Raspberry Pi → app, animações de jogar lixo e de coleta
js/models.js      modelos 3D: lixeira, saco, itens de lixo, mão, suporte, Arduino, Raspberry Pi, celular
js/worker.js      funcionário da limpeza (caminhar, agachar, alcançar objetos)
js/phoneApp.js    app do celular (mapa do campus, contadores, cartões e botão de coleta)
js/presentation.js roteiro do modo apresentação (câmera, legendas e balões)
js/tween.js       mini sistema de animação com async/await
```

Para mudar o nome, a cor ou o rótulo das lixeiras (por exemplo, trocar "METAIS" por
"PLÁSTICOS" em vermelho `0xd42a2a`), edite `js/config.js`.
