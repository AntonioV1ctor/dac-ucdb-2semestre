// Configurações do protótipo — edite aqui sem precisar mexer no resto do código.
export const CONFIG = {
  // Faixas de status (em %), iguais à legenda do mapa da UCDB
  limites: {
    metade: 40, // 40–79% → Pela metade (laranja)
    cheia: 80,  // 80% ou mais → Cheia (vermelho)
  },

  // Profundidade útil da lixeira medida pelo sensor ultrassônico (cm)
  profundidadeCm: 58,

  // Intervalo entre leituras do sensor (segundos)
  leituraSensorSeg: 1.2,

  // true: sensor → Arduino → (USB) → Raspberry Pi
  // false: sensor ligado direto nos pinos GPIO do Raspberry Pi
  placaArduino: true,

  // As duas lixeiras físicas do protótipo (com sensor)
  lixeiras: [
    {
      id: 'A-01',
      nome: 'Papéis',
      rotulo: 'PAPÉIS',
      cor: 0x1f6fd6,
      local: 'Bloco A · Corredor da ala norte',
      x: -0.3,
      mapa: [0.252, 0.632], // posição no mapa (0–1)
    },
    {
      id: 'A-02',
      nome: 'Metais',
      rotulo: 'METAIS',
      cor: 0xf4c41a,
      local: 'Bloco A · Corredor da ala norte',
      x: 0.3,
      mapa: [0.300, 0.628],
    },
  ],

  // Tipos de lixo e quanto (em %) cada um ocupa da lixeira
  itens: {
    papel: { nome: 'Papel', volume: 8 },
    lata: { nome: 'Lata', volume: 10 },
    casca: { nome: 'Casca de fruta', volume: 9 },
  },

  // Demais lixeiras do campus (dados de exemplo, só aparecem no mapa do app)
  outrasLixeiras: [
    { id: 'B-01', p: [0.246, 0.179], fill: 18 },
    { id: 'B-04', p: [0.383, 0.179], fill: 25 },
    { id: 'B-05', p: [0.256, 0.318], fill: 55 },
    { id: 'B-03', p: [0.319, 0.298], fill: 88 },
    { id: 'B-02', p: [0.269, 0.445], fill: 63 },
    { id: 'A-04', p: [0.338, 0.743], fill: 47 },
    { id: 'A-06', p: [0.416, 0.835], fill: 84 },
    { id: 'A-05', p: [0.293, 0.901], fill: 12 },
    { id: 'A-07', p: [0.248, 0.760], fill: 30 },
    { id: 'C-02', p: [0.864, 0.518], fill: 96 },
    { id: 'C-01', p: [0.741, 0.585], fill: 58 },
    { id: 'C-03', p: [0.817, 0.668], fill: 52 },
    { id: 'C-05', p: [0.883, 0.656], fill: 20 },
    { id: 'C-04', p: [0.750, 0.787], fill: 71 },
    { id: 'C-06', p: [0.873, 0.784], fill: 9 },
  ],
};

export function statusOf(fill01) {
  const pct = fill01 * 100;
  if (pct >= CONFIG.limites.cheia) return 'cheia';
  if (pct >= CONFIG.limites.metade) return 'metade';
  return 'vazia';
}

export const STATUS = {
  vazia: { label: 'Vazia', color: '#22a35a', soft: '#e3f4ea', hex: 0x22a35a },
  metade: { label: 'Pela metade', color: '#f0a51a', soft: '#fdf1d8', hex: 0xf0a51a },
  cheia: { label: 'Cheia', color: '#d6322f', soft: '#fbe3e2', hex: 0xd6322f },
};
