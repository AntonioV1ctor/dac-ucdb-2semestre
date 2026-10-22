// Modelos 3D feitos só com geometria do Three.js (sem arquivos externos).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Medidas da lixeira (metros)
export const BIN = {
  bottomY: 0.3, // altura do fundo (fica pendurada no suporte)
  h: 0.6,
  bw: 0.18, bd: 0.155, // meia largura/profundidade embaixo
  tw: 0.205, td: 0.18, // meia largura/profundidade em cima
};
BIN.topY = BIN.bottomY + BIN.h;

// Saco de lixo
export const BAG_H = 0.56;
const BAG_RX = 0.19;
const BAG_RZ = 0.165;

const std = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...opts });

export function enableShadows(obj, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

const rand = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ */
/* Lixeira                                                            */
/* ------------------------------------------------------------------ */

// Caixa aberta em cima e mais larga no topo (corpo da lixeira)
function openTaperedBox(bw, bd, tw, td, h) {
  const BL = [], quads = [
    [[-bw, 0, bd], [bw, 0, bd], [tw, h, td], [-tw, h, td]], // frente
    [[bw, 0, bd], [bw, 0, -bd], [tw, h, -td], [tw, h, td]], // direita
    [[bw, 0, -bd], [-bw, 0, -bd], [-tw, h, -td], [tw, h, -td]], // trás
    [[-bw, 0, -bd], [-bw, 0, bd], [-tw, h, td], [-tw, h, -td]], // esquerda
    [[-bw, 0, -bd], [bw, 0, -bd], [bw, 0, bd], [-bw, 0, bd]], // fundo
  ];
  for (const [a, b, c, d] of quads) BL.push(...a, ...b, ...c, ...a, ...c, ...d);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(BL, 3));
  geo.computeVertexNormals();
  return geo;
}

function drawRecycle(g, cx, cy, R, color) {
  const V = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a) + R * 0.12];
  });
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = R * 0.22;
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  for (let i = 0; i < 3; i++) {
    const A = V[i], B = V[(i + 1) % 3], C = V[(i + 2) % 3];
    const at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    const s = [A[0] + (C[0] - A[0]) * 0.13, A[1] + (C[1] - A[1]) * 0.13];
    g.beginPath();
    g.moveTo(...s);
    g.lineTo(...A);
    g.lineTo(...at(0.58));
    g.stroke();
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const n = [-(B[1] - A[1]) / L, (B[0] - A[0]) / L];
    const tip = at(0.8), base = at(0.55), w = R * 0.25;
    g.beginPath();
    g.moveTo(...tip);
    g.lineTo(base[0] + n[0] * w, base[1] + n[1] * w);
    g.lineTo(base[0] - n[0] * w, base[1] - n[1] * w);
    g.closePath();
    g.fill();
  }
}

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  drawRecycle(g, 256, 190, 125, '#121212');
  g.fillStyle = '#121212';
  g.font = '800 84px Manrope, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 418);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeBin(cfg) {
  const group = new THREE.Group();
  group.position.x = cfg.x;
  const color = new THREE.Color(cfg.cor);

  const bodyMat = std(color, { roughness: 0.4, side: THREE.DoubleSide });
  const body = new THREE.Mesh(openTaperedBox(BIN.bw, BIN.bd, BIN.tw, BIN.td, BIN.h), bodyMat);
  body.position.y = BIN.bottomY;
  group.add(body);

  // Borda superior
  const rimT = 0.014, rimH = 0.03, y = BIN.topY - rimH / 2;
  const fb = new THREE.BoxGeometry(BIN.tw * 2 + rimT * 2, rimH, rimT);
  const sb = new THREE.BoxGeometry(rimT, rimH, BIN.td * 2);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(fb, bodyMat);
    f.position.set(0, y, s * (BIN.td + rimT / 2));
    const sd = new THREE.Mesh(sb, bodyMat);
    sd.position.set(s * (BIN.tw + rimT / 2), y, 0);
    group.add(f, sd);
  }

  // Frisos verticais na frente (como na foto)
  const tilt = Math.atan((BIN.td - BIN.bd) / BIN.h);
  const ribGeo = new THREE.BoxGeometry(0.012, BIN.h * 0.9, 0.01);
  for (const s of [-1, 1]) {
    const rib = new THREE.Mesh(ribGeo, bodyMat);
    rib.position.set(s * 0.15, BIN.bottomY + BIN.h * 0.5, (BIN.bd + BIN.td) / 2 + 0.002);
    rib.rotation.x = tilt;
    group.add(rib);
  }

  // Adesivo com símbolo de reciclagem
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTexture(cfg.rotulo), transparent: true, roughness: 0.6,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), labelMat);
  const ly = 0.37;
  label.position.set(0, BIN.bottomY + ly, BIN.bd + (BIN.td - BIN.bd) * (ly / BIN.h) + 0.003);
  label.rotation.x = tilt;
  group.add(label);

  // Tampa basculante
  const lid = new THREE.Group();
  lid.position.set(0, BIN.topY, 0);
  const lidMat = std(color.clone().multiplyScalar(0.97), { roughness: 0.38 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.225, 0);
  shape.lineTo(0.225, 0);
  shape.lineTo(0.225, 0.05);
  shape.lineTo(0.15, 0.145);
  shape.lineTo(-0.15, 0.145);
  shape.lineTo(-0.225, 0.05);
  shape.closePath();
  const lidGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.38, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01,
    bevelSegments: 3, curveSegments: 4,
  });
  lidGeo.translate(0, 0.01, -0.19);
  lid.add(new THREE.Mesh(lidGeo, lidMat));

  const flapMat = std(color.clone().multiplyScalar(0.82), { roughness: 0.35 });
  const flapGeo = new THREE.BoxGeometry(0.25, 0.085, 0.012);
  const slitGeo = new THREE.BoxGeometry(0.25, 0.006, 0.006);
  const slitMat = std(0x111111);
  let flap = null;
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.148, s * 0.205);
    pivot.rotation.y = s > 0 ? 0 : Math.PI;
    const m = new THREE.Mesh(flapGeo, flapMat);
    m.position.y = -0.046;
    pivot.add(m);
    const slit = new THREE.Mesh(slitGeo, slitMat);
    slit.position.set(0, 0.0, 0.004);
    pivot.add(slit);
    lid.add(pivot);
    if (s > 0) flap = pivot;
  }
  group.add(lid);

  // Sensor ultrassônico HC-SR04 (preso na parede de trás, apontando para baixo)
  const sensor = makeUltrasonic();
  sensor.position.set(0, BIN.topY - 0.045, -BIN.td + 0.035);
  group.add(sensor);

  enableShadows(group);
  label.castShadow = false;

  return {
    group, lid, flap, sensor,
    mats: { body: bodyMat, lid: [lidMat, flapMat], label: labelMat },
  };
}

function makeUltrasonic() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.003, 0.021), std(0x1b5fc4, { roughness: 0.5 }));
  g.add(board);
  const can = new THREE.CylinderGeometry(0.008, 0.008, 0.012, 20);
  const metal = std(0xd7dade, { metalness: 0.9, roughness: 0.25 });
  const mesh = std(0x2a2a2a, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(can, metal);
    c.position.set(s * 0.013, -0.0075, 0);
    g.add(c);
    const grill = new THREE.Mesh(new THREE.CircleGeometry(0.0065, 20), mesh);
    grill.rotation.x = Math.PI / 2;
    grill.position.set(s * 0.013, -0.0136, 0);
    g.add(grill);
  }
  // Suporte até a parede
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.03), std(0x444b55));
  bracket.position.set(0, 0.003, -0.022);
  g.add(bracket);
  return g;
}

/* ------------------------------------------------------------------ */
/* Saco de lixo (aberto → amarrado) + volume de lixo dentro           */
/* ------------------------------------------------------------------ */

const H = BAG_H;
const BAG_OPEN = [[0.001, 0], [0.86, 0.004], [0.93, 0.04], [0.97, 0.35 * H], [1.0, H], [1.02, H + 0.008], [1.04, H + 0.004], [1.04, H - 0.03]];
const BAG_TIED = [[0.001, 0], [0.86, 0.004], [0.96, 0.04], [1.0, 0.35 * H], [0.9, 0.68 * H], [0.36, 0.9 * H], [0.1, 0.985 * H], [0.32, 1.1 * H]];

let pileTexture = null;
function getPileTexture() {
  if (pileTexture) return pileTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4740';
  g.fillRect(0, 0, 256, 256);
  const cols = ['#f3f0e8', '#e9e4d6', '#c9302c', '#f2cf3b', '#9aa3ad', '#e98a2c', '#6d8f4e', '#d9d3c4', '#3d6fb5'];
  for (let i = 0; i < 260; i++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, rand(4, 14), rand(3, 9), Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  pileTexture = new THREE.CanvasTexture(c);
  pileTexture.colorSpace = THREE.SRGBColorSpace;
  pileTexture.wrapS = pileTexture.wrapT = THREE.RepeatWrapping;
  return pileTexture;
}

export function makeBag() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1b1d23, roughness: 0.32, metalness: 0.05, side: THREE.DoubleSide, transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.scale.set(BAG_RX, 1, BAG_RZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const pileMat = new THREE.MeshStandardMaterial({ map: getPileTexture(), roughness: 0.9 });
  const pile = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28), pileMat);
  pile.geometry.translate(0, 0.5, 0);
  pile.scale.set(BAG_RX * 0.92, 0.001, BAG_RZ * 0.92);
  pile.visible = false;
  group.add(pile);

  const items = new THREE.Group();
  group.add(items);

  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), mat);
  knot.position.y = 0.985 * H;
  knot.visible = false;
  group.add(knot);

  const bag = {
    group, mesh, pile, items, knot, mat, tie: 0, fill: 0,
    setTie(t) {
      bag.tie = t;
      const pts = BAG_OPEN.map((p, i) => new THREE.Vector2(
        p[0] + (BAG_TIED[i][0] - p[0]) * t, p[1] + (BAG_TIED[i][1] - p[1]) * t));
      mesh.geometry.dispose();
      mesh.geometry = new THREE.LatheGeometry(pts, 32);
      knot.visible = t > 0.85;
      const hide = t > 0.25;
      pile.visible = !hide && bag.fill > 0.005;
      items.visible = !hide;
    },
    setFill(f) {
      bag.fill = f;
      pile.visible = f > 0.005 && bag.tie < 0.25;
      pile.scale.y = Math.max(0.001, f * H * 0.97);
      pileMat.map.repeat.set(2, Math.max(0.3, f * 1.6));
    },
    surfaceY() {
      return group.position.y + bag.fill * H * 0.97;
    },
  };
  bag.setTie(0);
  return bag;
}

/* ------------------------------------------------------------------ */
/* Itens de lixo                                                      */
/* ------------------------------------------------------------------ */

function canTexture(bg, fg, text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(0, 92);
  g.bezierCurveTo(70, 60, 140, 120, 256, 80);
  g.stroke();
  g.fillStyle = fg;
  g.font = '800 34px Manrope, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 52);
  g.fillText(text, 192, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CANS = [
  ['#c8202a', '#ffffff', 'COLA'],
  ['#1f8a3b', '#f7e04a', 'GUARANÁ'],
  ['#f07f17', '#ffffff', 'LARANJA'],
  ['#1d4fa8', '#ffffff', 'TÔNICA'],
];

export function makeItem(type) {
  if (type === 'papel') {
    const geo = new THREE.IcosahedronGeometry(0.034, 2);
    const p = geo.attributes.position;
    const k = [rand(20, 40), rand(20, 40), rand(20, 40), rand(0, 6)];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.16 * Math.sin(x * k[0] + k[3]) * Math.sin(y * k[1]) + 0.12 * Math.sin(z * k[2] + x * 30);
      p.setXYZ(i, x * n, y * n * 0.92, z * n);
    }
    geo.computeVertexNormals();
    const col = [0xf4f1ea, 0xf7f3e3, 0xfdf3b0, 0xdfeaf7][(Math.random() * 4) | 0];
    const m = new THREE.Mesh(geo, std(col, { roughness: 0.9, flatShading: true }));
    m.userData.r = 0.03;
    return enableShadows(m);
  }

  if (type === 'lata') {
    const [bg, fg, text] = CANS[(Math.random() * CANS.length) | 0];
    const metal = std(0xc9cdd2, { metalness: 0.9, roughness: 0.25 });
    const side = std(0xffffff, { map: canTexture(bg, fg, text), metalness: 0.45, roughness: 0.3 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.108, 28), [side, metal, metal]);
    g.add(body);
    for (const s of [-1, 1]) {
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(s > 0 ? 0.026 : 0.031, s > 0 ? 0.031 : 0.026, 0.01, 28), metal);
      neck.position.y = s * 0.059;
      g.add(neck);
    }
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.02), metal);
    tab.position.set(0, 0.065, 0.006);
    g.add(tab);
    g.userData.r = 0.034;
    return enableShadows(g);
  }

  // Casca de fruta: banana ou laranja
  const g = new THREE.Group();
  if (Math.random() < 0.55) {
    const peel = std(0xf2cf3a, { roughness: 0.6 });
    const petalGeo = new THREE.SphereGeometry(1, 12, 10);
    petalGeo.translate(0, -1, 0);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i * Math.PI) / 2 + rand(-0.2, 0.2);
      const petal = new THREE.Mesh(petalGeo, peel);
      petal.scale.set(0.017, 0.042, 0.006);
      petal.rotation.z = rand(1.2, 1.9);
      pivot.add(petal);
      g.add(pivot);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.03, 8), std(0x6b4a26));
    stem.position.y = 0.012;
    g.add(stem);
    g.userData.r = 0.02;
  } else {
    const shellGeo = new THREE.SphereGeometry(0.04, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.46);
    const outer = new THREE.Mesh(shellGeo, std(0xf2861a, { roughness: 0.7 }));
    const inner = new THREE.Mesh(shellGeo, std(0xf7e8c9, { roughness: 0.9, side: THREE.BackSide }));
    inner.scale.setScalar(0.96);
    g.add(outer, inner);
    g.userData.r = 0.03;
  }
  return enableShadows(g);
}

/* ------------------------------------------------------------------ */
/* Mão que joga o lixo                                                */
/* ------------------------------------------------------------------ */

export function makeHand() {
  const rig = new THREE.Group(); // aponta para a lixeira com lookAt (eixo +z)
  const wrist = new THREE.Group();
  rig.add(wrist);
  const skin = std(0xd59c76, { roughness: 0.62 });
  // Manga do antebraço (~60 cm) que some num degradê na ponta, sem mostrar o "corte"
  const SLEEVE_LEN = 0.6;
  const sleeveGeo = new THREE.CylinderGeometry(0.04, 0.048, SLEEVE_LEN, 22, 12, true);
  const sp = sleeveGeo.attributes.position;
  const colors = [];
  for (let i = 0; i < sp.count; i++) {
    const t = (sp.getY(i) + SLEEVE_LEN / 2) / (SLEEVE_LEN * 0.55); // 0 na ponta → 1 perto do punho
    colors.push(1, 1, 1, Math.min(1, Math.max(0, t)));
  }
  sleeveGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  const sleeveMat = std(0x2f5fa8, {
    roughness: 0.85, vertexColors: true, transparent: true, side: THREE.DoubleSide,
  });
  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = -0.03 - SLEEVE_LEN / 2;
  wrist.add(sleeve);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.08, 18), skin);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = -0.03;
  wrist.add(arm);

  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.03, 0.095, 3, 0.012), skin);
  palm.position.z = 0.045;
  wrist.add(palm);

  const fingers = [];
  const defs = [[0.03, 0.05], [0.01, 0.057], [-0.01, 0.054], [-0.03, 0.043]];
  for (const [x, L] of defs) {
    const base = new THREE.Group();
    base.position.set(x, 0, 0.09);
    const l1 = L * 0.55, l2 = L * 0.45;
    const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0092, l1, 4, 8), skin);
    seg1.rotation.x = Math.PI / 2;
    seg1.position.z = l1 / 2;
    const joint = new THREE.Group();
    joint.position.z = l1 + 0.004;
    const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0086, l2, 4, 8), skin);
    seg2.rotation.x = Math.PI / 2;
    seg2.position.z = l2 / 2;
    joint.add(seg2);
    base.add(seg1, joint);
    wrist.add(base);
    fingers.push({ base, joint });
  }
  const thumb = new THREE.Group();
  thumb.position.set(0.042, -0.006, 0.025);
  const tseg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.045, 4, 8), skin);
  tseg.rotation.x = Math.PI / 2;
  tseg.position.z = 0.03;
  thumb.add(tseg);
  wrist.add(thumb);

  const itemAnchor = new THREE.Group();
  itemAnchor.position.set(0, -0.045, 0.078);
  wrist.add(itemAnchor);

  // gr: 0 = mão aberta, 1 = fechada. point = true deixa o indicador esticado (apontando)
  function setGrip(gr, point = false) {
    fingers.forEach((f, i) => {
      const g = point && i === 0 ? -0.1 : gr;
      f.base.rotation.x = 0.15 + g * 0.95;
      f.joint.rotation.x = 0.1 + g * 1.1;
    });
    thumb.rotation.y = 0.85 - gr * 0.65;
    thumb.rotation.x = 0.15 + gr * 0.45;
  }
  setGrip(0);
  enableShadows(rig, false);
  sleeve.castShadow = false;
  rig.visible = false;
  return { rig, wrist, itemAnchor, setGrip };
}

/* ------------------------------------------------------------------ */
/* Suporte metálico, Raspberry Pi, celular                            */
/* ------------------------------------------------------------------ */

function tube(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 14), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function makeStand(binXs) {
  const g = new THREE.Group();
  const metal = std(0xd3d6db, { metalness: 1, roughness: 0.22 });
  const rubber = std(0x222222, { roughness: 0.9 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = 0.64, Z = -0.21;
  for (const s of [-1, 1]) {
    const x = s * X;
    g.add(tube(V(x, 0.09, Z), V(x, 0.72, Z), 0.013, metal));
    g.add(tube(V(x, 0.09, Z), V(x, 0.015, 0.06), 0.012, metal));
    g.add(tube(V(x, 0.09, Z), V(x, 0.015, -0.48), 0.012, metal));
    for (const z of [0.06, -0.48]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), rubber);
      foot.position.set(x, 0.014, z);
      g.add(foot);
    }
  }
  g.add(tube(V(-X, 0.7, Z), V(X, 0.7, Z), 0.012, metal));
  g.add(tube(V(-X, 0.38, Z), V(X, 0.38, Z), 0.012, metal));
  for (const bx of binXs) {
    for (const y of [0.7, 0.38]) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.05), metal);
      br.position.set(bx, y, -0.19 + (y > 0.5 ? 0.012 : 0.02));
      g.add(br);
    }
  }
  return enableShadows(g);
}

export function makePi() {
  const g = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false,
  });
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.072, 0.03, 3, 0.007), caseMat);
  g.add(box);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.056, 0.0016), std(0x1f7a3a, { roughness: 0.6 }));
  g.add(board);
  const parts = [
    [0.016, 0.016, 0.003, 0x1a1a1a, -0.012, 0.0],
    [0.012, 0.01, 0.002, 0x222222, 0.008, 0.004],
    [0.016, 0.014, 0.016, 0xc7cbd1, 0.037, 0.014],
    [0.016, 0.014, 0.016, 0xc7cbd1, 0.037, -0.006],
    [0.06, 0.006, 0.008, 0x111111, -0.006, 0.024],
  ];
  for (const [w, h, d, c, x, y] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(c, c === 0xc7cbd1 ? { metalness: 0.9, roughness: 0.3 } : {}));
    m.position.set(x, y, d / 2 + 0.001);
    g.add(m);
  }
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x0b3d1b, emissive: 0x23e05a, emissiveIntensity: 0.2 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), ledMat);
  led.position.set(-0.035, -0.022, 0.003);
  g.add(led);
  const pwr = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x400, emissive: 0xff2a2a, emissiveIntensity: 1.5 }));
  pwr.position.set(-0.035, -0.012, 0.003);
  g.add(pwr);
  // Suporte até a barra traseira
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.09), std(0x9aa0a8, { metalness: 0.8, roughness: 0.3 }));
  arm.position.set(0, 0, -0.055);
  g.add(arm);
  enableShadows(g);
  box.castShadow = false;
  return { group: g, ledMat };
}

export function makeArduino() {
  const g = new THREE.Group();
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.069, 0.053, 0.0016), std(0x0f7f8c, { roughness: 0.5 }));
  g.add(pcb);
  const metal = { metalness: 0.9, roughness: 0.3 };
  const parts = [
    // largura, altura, profundidade, cor, x, y, metal
    [0.016, 0.012, 0.011, 0xc7cbd1, -0.029, 0.012, true], // conector USB
    [0.013, 0.009, 0.011, 0x151515, -0.029, -0.016], // conector de energia
    [0.035, 0.008, 0.004, 0x1a1a1a, 0.012, -0.011], // microcontrolador ATmega328P
    [0.042, 0.0025, 0.008, 0x111111, 0.006, 0.0235], // barra de pinos digitais
    [0.032, 0.0025, 0.008, 0x111111, 0.014, -0.0235], // barra de pinos analógicos
    [0.007, 0.0035, 0.003, 0xc7cbd1, -0.016, 0.0, true], // cristal
    [0.005, 0.005, 0.003, 0x333333, -0.013, 0.02], // botão reset
  ];
  for (const [w, h, d, c, x, y, isMetal] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(c, isMetal ? metal : {}));
    m.position.set(x, y, d / 2 + 0.001);
    g.add(m);
  }
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x3d2200, emissive: 0xff9a1f, emissiveIntensity: 0.15 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, 0.0015), ledMat);
  led.position.set(-0.004, 0.012, 0.0015);
  g.add(led);
  const pwr = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, 0.0015),
    new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x2bff5a, emissiveIntensity: 1.2 }));
  pwr.position.set(0.026, 0.004, 0.0015);
  g.add(pwr);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.08), std(0x9aa0a8, { metalness: 0.8, roughness: 0.3 }));
  arm.position.set(0, 0, -0.042);
  g.add(arm);
  enableShadows(g);
  return { group: g, ledMat };
}

export function makePhone(texture, sw, sh) {
  const g = new THREE.Group();
  const W = sw + 0.03, Hh = sh + 0.03, D = 0.032;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, Hh, D, 6, 0.045),
    std(0x22252b, { metalness: 0.6, roughness: 0.32 }));
  g.add(body);

  // Tela com cantos arredondados
  const r = 0.035;
  const s = new THREE.Shape();
  const x0 = -sw / 2, y0 = -sh / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + sw - r, y0);
  s.quadraticCurveTo(x0 + sw, y0, x0 + sw, y0 + r);
  s.lineTo(x0 + sw, y0 + sh - r);
  s.quadraticCurveTo(x0 + sw, y0 + sh, x0 + sw - r, y0 + sh);
  s.lineTo(x0 + r, y0 + sh);
  s.quadraticCurveTo(x0, y0 + sh, x0, y0 + sh - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const geo = new THREE.ShapeGeometry(s, 8);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / sw, (pos.getY(i) - y0) / sh);
  const screen = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  screen.position.z = D / 2 + 0.0012;
  g.add(screen);

  const btnMat = std(0x30343b, { metalness: 0.7, roughness: 0.3 });
  for (const [y, h] of [[0.2, 0.08], [0.08, 0.06]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.008, h, 0.014), btnMat);
    b.position.set(-W / 2 - 0.002, y, 0);
    g.add(b);
  }
  const pb = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.014), btnMat);
  pb.position.set(W / 2 + 0.002, 0.14, 0);
  g.add(pb);
  enableShadows(g, false);
  return { group: g, screen };
}
