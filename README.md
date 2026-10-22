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
