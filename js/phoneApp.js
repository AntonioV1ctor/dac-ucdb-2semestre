// App do celular: desenhado num <canvas> que vira a textura da tela do celular 3D.
import * as THREE from 'three';
import { CONFIG, STATUS, statusOf } from './config.js';

const W = 720;
const H = 1540;
const C = {
  bg: '#f3f5f8', card: '#ffffff', ink: '#14243a', muted: '#6b7787', line: '#e3e8ee',
  navy: '#12355b', map: '#e6ece3', block: '#dbe5f1', blockLine: '#8fa3bd',
  green: '#cfe3c4', road: '#ffffff', avenue: '#f3cf7a',
};
const FONT = 'Manrope, "Segoe UI", Arial, sans-serif';

function font(g, weight, size) {
  g.font = `${weight} ${size}px ${FONT}`;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
const hhmm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Campus simplificado (coordenadas 0–1), baseado no mapa da UCDB
const COMB = [
  [0, 0, 0.45, 0.17], [0.03, 0.36, 0.42, 0.3], [0.05, 0.82, 0.42, 0.18],
  [0.45, 0, 0.12, 1], [0.57, 0.03, 0.43, 0.16], [0.57, 0.7, 0.43, 0.15], [0.6, 0.33, 0.28, 0.2],
];
const BLOCKS = [
  { name: 'Bloco B', box: [0.21, 0.13, 0.23, 0.35], label: [0.215, 0.1] },
  { name: 'Bloco A', box: [0.235, 0.58, 0.225, 0.35], label: [0.105, 0.56] },
  { name: 'Bloco C', box: [0.70, 0.49, 0.23, 0.34], label: [0.70, 0.455] },
];
const OTHERS = [
  [0.455, 0.1, 0.205, 0.07], [0.455, 0.19, 0.21, 0.1], [0.46, 0.31, 0.2, 0.07],
  [0.70, 0.01, 0.08, 0.38], [0.79, 0.08, 0.15, 0.25], [0.55, 0.47, 0.06, 0.11],
  [0.62, 0.68, 0.07, 0.12], [0.02, 0.68, 0.13, 0.22],
];
const PARKING = [[0.08, 0.5], [0.13, 0.06], [0.18, 0.06], [0.185, 0.56], [0.12, 0.64]];
const GREEN = [[0.465, 0.49], [0.53, 0.46], [0.56, 0.6], [0.605, 0.68], [0.56, 0.74], [0.545, 0.88], [0.48, 0.91], [0.465, 0.75]];
const ROADS = [
  [[0.13, 0.07], [0.93, 0.02]], [[0.24, 0.99], [1.0, 0.95]], [[0.325, 0.03], [0.37, 1.0]],
  [[0.675, 0.0], [0.685, 0.64]], [[0.04, 0.69], [0.24, 0.5]], [[0.95, 0.04], [0.97, 0.95]],
  [[0.6, 0.62], [0.95, 0.6]],
];

export class PhoneApp {
  constructor(onCollect) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.onCollect = onCollect;
    this.aspect = W / H;

    const now = Date.now();
    this.live = CONFIG.lixeiras.map((cfg) => ({
      cfg, fill: 0, dist: CONFIG.profundidadeCm, state: 'idle', updatedAt: now,
      lastCollect: null, flash: 0,
    }));
    this.banner = null;
    this.hits = [];
    this.time = 0;
    this.acc = 1;
  }

  // Nova leitura do sensor chegou (via Raspberry Pi → Wi-Fi)
  receive(i, fill, distCm) {
    const b = this.live[i];
    const before = statusOf(b.fill);
    b.fill = fill;
    b.dist = distCm;
    b.updatedAt = Date.now();
    b.flash = 1;
    const after = statusOf(fill);
    if (after !== before && b.state === 'idle') {
      if (after === 'cheia') {
        this.notify('cheia', `Lixeira ${b.cfg.id} cheia (${Math.round(fill * 100)}%)`, 'Toque para acionar a coleta', () => this.onCollect(i));
      } else if (after === 'metade') {
        this.notify('metade', `Lixeira ${b.cfg.id} pela metade`, 'A coleta já pode ser acionada', () => this.onCollect(i));
      }
    }
    this.acc = 1;
  }

  setState(i, state) {
    this.live[i].state = state;
    this.acc = 1;
  }

  finishCollect(i) {
    const b = this.live[i];
    b.state = 'idle';
    b.lastCollect = new Date();
    b.fill = 0;
    b.dist = CONFIG.profundidadeCm;
    b.flash = 1;
    this.notify('vazia', `Coleta concluída · ${b.cfg.id}`, 'Saco trocado, lixeira vazia', null);
  }

  notify(status, title, text, action) {
    this.banner = { status, title, text, action, t: 0, life: 4.5 };
    this.acc = 1;
  }

  update(dt) {
    this.time += dt;
    for (const b of this.live) b.flash = Math.max(0, b.flash - dt * 1.2);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.life) this.banner = null;
    }
    this.acc += dt;
    if (this.acc >= 1 / 24) {
      this.acc = 0;
      this.draw();
      this.texture.needsUpdate = true;
    }
  }

  // u,v = coordenadas de textura do ponto tocado na tela 3D
  hitTest(u, v) {
    const x = u * W, y = (1 - v) * H;
    for (let k = this.hits.length - 1; k >= 0; k--) {
      const h = this.hits[k];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  }

  // Centro (em coordenadas de textura) de um botão desenhado, ex.: 'collect-0'
  regionCenter(id) {
    const h = this.hits.find((k) => k.id === id);
    return h ? { u: (h.x + h.w / 2) / W, v: 1 - (h.y + h.h / 2) / H } : null;
  }

  // Toque com efeito visual (usado pelo dedo no modo apresentação)
  tap(u, v) {
    this.ripple = { x: u * W, y: (1 - v) * H, t: 0 };
    this.acc = 1;
    return this.click(u, v);
  }

  click(u, v) {
    const h = this.hitTest(u, v);
    if (h) {
      h.action();
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */

  draw() {
    const g = this.g;
    this.hits = [];
    g.save();
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle';

    this.drawStatusBar(g);

    // Cabeçalho
    rr(g, 32, 96, 78, 78, 22);
    g.fillStyle = C.navy;
    g.fill();
    this.drawTrashGlyph(g, 71, 135, '#fff');
    g.fillStyle = C.ink;
    font(g, 800, 36);
    g.textAlign = 'left';
    g.fillText('Lixeiras UCDB', 128, 120);
    font(g, 500, 22);
    g.fillStyle = C.muted;
    g.fillText('Campus Tamandaré', 128, 156);
    const liveX = 128 + g.measureText('Campus Tamandaré').width + 18;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    g.fillStyle = `rgba(214,50,47,${0.25 + pulse * 0.35})`;
    g.beginPath();
    g.arc(liveX + 7, 156, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d6322f';
    g.beginPath();
    g.arc(liveX + 7, 156, 6, 0, Math.PI * 2);
    g.fill();
    font(g, 700, 20);
    g.fillText('AO VIVO', liveX + 24, 157);

    // Contadores
    const all = [
      ...this.live.map((b) => statusOf(b.fill)),
      ...CONFIG.outrasLixeiras.map((o) => statusOf(o.fill / 100)),
    ];
    const tiles = ['cheia', 'metade', 'vazia'];
    tiles.forEach((st, i) => {
      const x = 32 + i * 226, y = 200, w = 208, h = 112;
      rr(g, x, y, w, h, 22);
      g.fillStyle = C.card;
      g.fill();
      g.strokeStyle = C.line;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = STATUS[st].color;
      g.beginPath();
      g.arc(x + 26, y + 32, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C.muted;
      font(g, 600, 20);
      g.fillText(st === 'cheia' ? 'Cheias' : st === 'metade' ? 'Pela metade' : 'Vazias', x + 42, y + 33);
      g.fillStyle = C.ink;
      font(g, 800, 46);
      g.fillText(String(all.filter((s) => s === st).length), x + 22, y + 80);
    });

    // Mapa
    const cy = 332;
    rr(g, 24, cy, 672, 438, 26);
    g.fillStyle = C.card;
    g.fill();
    g.fillStyle = C.ink;
    font(g, 700, 25);
    g.fillText('Mapa do campus', 50, cy + 38);
    g.textAlign = 'right';
    g.fillStyle = C.muted;
    font(g, 500, 20);
    g.fillText(`${all.length} lixeiras monitoradas`, 670, cy + 38);
    g.textAlign = 'left';
    this.drawMap(g, 44, cy + 66, 632, 316);
    // Legenda
    let lx = 50;
    for (const st of ['vazia', 'metade', 'cheia']) {
      this.drawMarker(g, lx + 10, cy + 412, 18, st);
      g.fillStyle = C.muted;
      font(g, 500, 19);
      const t = STATUS[st].label;
      g.fillText(t, lx + 28, cy + 413);
      lx += 28 + g.measureText(t).width + 34;
    }

    // Lixeiras com sensor
    g.fillStyle = C.ink;
    font(g, 800, 27);
    g.fillText('Lixeiras com sensor', 32, 812);
    g.fillStyle = C.muted;
    font(g, 500, 19);
    g.textAlign = 'right';
    g.fillText('HC-SR04 · Raspberry Pi', 690, 813);
    g.textAlign = 'left';
    this.live.forEach((b, i) => this.drawCard(g, b, i, 842 + i * 318));

    // Barra inicial
    rr(g, W / 2 - 110, H - 26, 220, 9, 5);
    g.fillStyle = C.ink;
    g.fill();

    if (this.banner) this.drawBanner(g);
    if (this.ripple) {
      const r = this.ripple;
      r.t = this.time - (r.start ??= this.time);
      const k = Math.min(1, r.t / 0.6);
      g.fillStyle = `rgba(255,255,255,${0.45 * (1 - k)})`;
      g.beginPath();
      g.arc(r.x, r.y, 18 + k * 140, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(20,36,58,${0.25 * (1 - k)})`;
      g.beginPath();
      g.arc(r.x, r.y, 26 * (1 - k * 0.5), 0, Math.PI * 2);
      g.fill();
      if (k >= 1) this.ripple = null;
    }
    g.restore();
  }

  drawStatusBar(g) {
    g.fillStyle = C.ink;
    font(g, 700, 26);
    g.textAlign = 'left';
    g.fillText(hhmm(new Date()), 58, 46);
    rr(g, W / 2 - 92, 20, 184, 48, 24);
    g.fillStyle = '#000';
    g.fill();
    g.fillStyle = C.ink;
    for (let i = 0; i < 4; i++) {
      rr(g, W - 200 + i * 11, 54 - (i + 1) * 6.5, 7, (i + 1) * 6.5, 2);
      g.fill();
    }
    g.strokeStyle = C.ink;
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(W - 136, 55, 6 + i * 7, -Math.PI * 0.75, -Math.PI * 0.25);
      g.stroke();
    }
    rr(g, W - 106, 34, 46, 23, 7);
    g.lineWidth = 2.5;
    g.stroke();
    rr(g, W - 102, 38, 32, 15, 4);
    g.fill();
    rr(g, W - 57, 41, 4, 9, 2);
    g.fill();
  }

  drawTrashGlyph(g, cx, cy, color) {
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx - 16, cy - 12);
    g.lineTo(cx + 16, cy - 12);
    g.moveTo(cx - 6, cy - 12);
    g.lineTo(cx - 5, cy - 18);
    g.lineTo(cx + 5, cy - 18);
    g.lineTo(cx + 6, cy - 12);
    g.moveTo(cx - 12, cy - 12);
    g.lineTo(cx - 10, cy + 18);
    g.lineTo(cx + 10, cy + 18);
    g.lineTo(cx + 12, cy - 12);
    g.moveTo(cx - 4, cy - 5);
    g.lineTo(cx - 4, cy + 11);
    g.moveTo(cx + 4, cy - 5);
    g.lineTo(cx + 4, cy + 11);
    g.stroke();
  }

  drawMarker(g, x, y, size, st, outline = '#fff') {
    const s = STATUS[st];
    rr(g, x - size / 2, y - size / 2, size, size, size * 0.24);
    g.fillStyle = s.color;
    g.fill();
    g.strokeStyle = outline;
    g.lineWidth = Math.max(2, size * 0.12);
    g.stroke();
    // Ícone ✓ – !
    g.strokeStyle = g.fillStyle = '#fff';
    g.lineWidth = Math.max(2, size * 0.13);
    g.lineCap = 'round';
    g.beginPath();
    const k = size * 0.22;
    if (st === 'vazia') {
      g.moveTo(x - k, y);
      g.lineTo(x - k * 0.25, y + k * 0.75);
      g.lineTo(x + k, y - k * 0.7);
      g.stroke();
    } else if (st === 'metade') {
      g.moveTo(x - k, y);
      g.lineTo(x + k, y);
      g.stroke();
    } else {
      g.moveTo(x, y - k);
      g.lineTo(x, y + k * 0.25);
      g.stroke();
      g.beginPath();
      g.arc(x, y + k * 0.85, g.lineWidth * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawMap(g, mx, my, mw, mh) {
    const P = (p) => [mx + p[0] * mw, my + p[1] * mh];
    const poly = (pts) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
      g.closePath();
    };
    const rect = ([x, y, w, h]) => {
      g.beginPath();
      g.rect(mx + x * mw, my + y * mh, w * mw, h * mh);
    };

    g.save();
    rr(g, mx, my, mw, mh, 18);
    g.clip();
    g.fillStyle = C.map;
    g.fillRect(mx, my, mw, mh);

    g.strokeStyle = C.road;
    g.lineCap = 'round';
    g.lineWidth = 6;
    for (const [a, b] of ROADS) {
      g.beginPath();
      g.moveTo(...P(a));
      g.lineTo(...P(b));
      g.stroke();
    }
    g.strokeStyle = C.avenue;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(...P([0.0, 0.62]));
    g.lineTo(...P([0.105, 0.0]));
    g.stroke();

    poly(PARKING);
    g.fillStyle = '#dde1e6';
    g.fill();
    g.strokeStyle = '#c5ccd4';
    g.lineWidth = 1.5;
    g.stroke();
    poly(GREEN);
    g.fillStyle = C.green;
    g.fill();

    for (const o of OTHERS) {
      rect(o);
      g.fillStyle = '#fff';
      g.fill();
      g.strokeStyle = '#d3d9e0';
      g.stroke();
    }
    for (const b of BLOCKS) {
      const [bx, by, bw, bh] = b.box;
      g.fillStyle = C.block;
      g.strokeStyle = C.blockLine;
      g.lineWidth = 1.5;
      for (const [x, y, w, h] of COMB) {
        rect([bx + x * bw, by + y * bh, w * bw, h * bh]);
        g.fill();
      }
      for (const [x, y, w, h] of COMB) {
        rect([bx + x * bw, by + y * bh, w * bw, h * bh]);
        g.stroke();
      }
      g.fillStyle = C.navy;
      font(g, 800, 17);
      g.textAlign = 'left';
      g.fillText(b.name, ...P(b.label));
    }

    // Textos do mapa
    g.fillStyle = '#7c6a3a';
    font(g, 600, 12);
    g.save();
    g.translate(...P([0.04, 0.3]));
    g.rotate(-1.4);
    g.fillText('Av. Tamandaré', 0, 0);
    g.restore();
    g.fillStyle = '#7d8794';
    g.save();
    g.translate(...P([0.14, 0.42]));
    g.rotate(-Math.PI / 2);
    g.fillText('Estacionamento', 0, 0);
    g.restore();
    g.fillStyle = '#4c6b3c';
    g.fillText('Área verde', ...P([0.47, 0.68]));
    g.fillStyle = C.navy;
    g.beginPath();
    g.arc(...P([0.04, 0.69]), 5, 0, Math.PI * 2);
    g.fill();
    font(g, 700, 12);
    g.fillText('Entrada', ...P([0.055, 0.66]));

    // Marcadores (quadradinhos)
    for (const o of CONFIG.outrasLixeiras) {
      this.drawMarker(g, ...P(o.p), 17, statusOf(o.fill / 100));
    }
    this.live.forEach((b, i) => {
      const [x, y] = P(b.cfg.mapa);
      const st = statusOf(b.fill);
      const t = (this.time * 0.8 + i * 0.5) % 1;
      g.strokeStyle = STATUS[st].color;
      g.globalAlpha = 1 - t;
      g.lineWidth = 3;
      const s = 24 + t * 30;
      rr(g, x - s / 2, y - s / 2, s, s, 7);
      g.stroke();
      g.globalAlpha = 1;
      this.drawMarker(g, x, y, 25, st, C.navy);

      // Etiqueta "A-01 · 45%"
      const label = `${b.cfg.id} · ${Math.round(b.fill * 100)}%`;
      font(g, 700, 15);
      const tw = g.measureText(label).width + 18;
      const ty = i === 0 ? y - 44 : y + 22;
      const tx = i === 0 ? x - tw + 14 : x - 14;
      rr(g, tx, ty, tw, 26, 7);
      g.fillStyle = C.ink;
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'left';
      g.fillText(label, tx + 9, ty + 14);
    });
    g.restore();
  }

  drawCard(g, b, i, y) {
    const st = statusOf(b.fill);
    const S = STATUS[st];
    rr(g, 24, y, 672, 300, 26);
    g.fillStyle = C.card;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = b.flash > 0 ? `rgba(18,53,91,${b.flash * 0.6})` : C.line;
    g.stroke();

    this.drawMarker(g, 66, y + 46, 34, st);
    g.textAlign = 'left';
    g.fillStyle = C.ink;
    font(g, 800, 30);
    g.fillText(`${b.cfg.id} · ${b.cfg.nome}`, 98, y + 40);
    g.fillStyle = C.muted;
    font(g, 500, 20);
    g.fillText(b.cfg.local, 98, y + 74);

    // Chip de status
    let chip = S.label, chipBg = S.soft, chipFg = S.color;
    if (b.state === 'collecting') [chip, chipBg, chipFg] = ['Em coleta', '#e3ebf5', C.navy];
    if (b.state === 'queued') [chip, chipBg, chipFg] = ['Na fila', '#e3ebf5', C.navy];
    font(g, 700, 20);
    const cw = g.measureText(chip).width + 30;
    rr(g, 672 - cw, y + 24, cw, 38, 19);
    g.fillStyle = chipBg;
    g.fill();
    g.fillStyle = chipFg;
    g.fillText(chip, 672 - cw + 15, y + 44);

    // Porcentagem + leitura do sensor
    g.fillStyle = C.ink;
    font(g, 800, 74);
    g.fillText(`${Math.round(b.fill * 100)}%`, 46, y + 140);
    g.textAlign = 'right';
    g.fillStyle = C.muted;
    font(g, 500, 19);
    const ago = Math.max(0, Math.round((Date.now() - b.updatedAt) / 1000));
    g.fillText(`Sensor · atualizado há ${ago}s`, 672, y + 118);
    g.fillStyle = C.ink;
    font(g, 700, 23);
    g.fillText(`${b.dist.toFixed(0)} cm até o lixo`, 672, y + 150);
    g.textAlign = 'left';

    // Barra de ocupação
    rr(g, 46, y + 184, 626, 16, 8);
    g.fillStyle = '#e8ecf1';
    g.fill();
    if (b.fill > 0.005) {
      rr(g, 46, y + 184, Math.max(16, 626 * b.fill), 16, 8);
      g.fillStyle = S.color;
      g.fill();
    }
    for (const lim of [CONFIG.limites.metade, CONFIG.limites.cheia]) {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(46 + 626 * (lim / 100) - 1.5, y + 184, 3, 16);
    }

    // Botão / rodapé
    const by = y + 220, bh = 62;
    if (b.state === 'collecting' || b.state === 'queued') {
      rr(g, 46, by, 626, bh, 18);
      g.fillStyle = '#e8edf3';
      g.fill();
      const a = this.time * 6;
      g.strokeStyle = C.navy;
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(110, by + bh / 2, 13, a, a + Math.PI * 1.4);
      g.stroke();
      g.fillStyle = C.navy;
      font(g, 700, 23);
      g.fillText(b.state === 'collecting' ? 'Coleta em andamento…' : 'Aguardando equipe de coleta…', 140, by + bh / 2 + 1);
    } else if (st !== 'vazia') {
      const pressable = 0.5 + 0.5 * Math.sin(this.time * 5);
      rr(g, 46, by, 626, bh, 18);
      g.fillStyle = st === 'cheia' ? '#c62d2a' : C.navy;
      g.fill();
      if (st === 'cheia') {
        g.strokeStyle = `rgba(214,50,47,${0.2 + pressable * 0.3})`;
        g.lineWidth = 6;
        rr(g, 43, by - 3, 632, bh + 6, 21);
        g.stroke();
      }
      this.drawTruck(g, 236, by + bh / 2);
      g.fillStyle = '#fff';
      font(g, 800, 25);
      g.fillText('Acionar coleta', 276, by + bh / 2 + 1);
      this.hits.push({ id: `collect-${i}`, x: 46, y: by, w: 626, h: bh, action: () => this.onCollect(i) });
    } else {
      g.fillStyle = C.muted;
      font(g, 500, 21);
      const last = b.lastCollect ? `hoje, ${hhmm(b.lastCollect)}` : 'ontem, 18:10';
      g.fillText(`Última coleta: ${last}`, 46, by + 22);
      g.fillText('Coleta disponível a partir de 40%', 46, by + 52);
    }
  }

  drawTruck(g, x, y) {
    g.fillStyle = '#fff';
    rr(g, x - 16, y - 12, 22, 18, 3);
    g.fill();
    rr(g, x + 7, y - 6, 12, 12, 3);
    g.fill();
    for (const cx of [x - 8, x + 12]) {
      g.beginPath();
      g.arc(cx, y + 9, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawBanner(g) {
    const b = this.banner;
    const inT = Math.min(1, b.t / 0.35), outT = Math.min(1, (b.life - b.t) / 0.35);
    const k = Math.min(inT, outT);
    const y = -130 + (84 + 130) * (1 - Math.pow(1 - k, 3));
    g.save();
    g.shadowColor = 'rgba(20,36,58,0.25)';
    g.shadowBlur = 30;
    g.shadowOffsetY = 8;
    rr(g, 24, y, 672, 110, 26);
    g.fillStyle = '#fff';
    g.fill();
    g.restore();
    this.drawMarker(g, 74, y + 55, 46, b.status);
    g.textAlign = 'left';
    g.fillStyle = C.ink;
    font(g, 800, 25);
    g.fillText(b.title, 116, y + 40);
    g.fillStyle = C.muted;
    font(g, 500, 21);
    g.fillText(b.text, 116, y + 76);
    if (b.action) {
      this.hits.push({
        x: 24, y, w: 672, h: 110,
        action: () => {
          this.banner = null;
          b.action();
        },
      });
    }
  }
}
