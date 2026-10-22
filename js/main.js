import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG, STATUS, statusOf } from './config.js';
import { tween, wait, ease, updateTweens, clock, lerp, lerpAngle, smoothstep } from './tween.js';
import * as M from './models.js';
import { BIN, BAG_H } from './models.js';
import { Worker } from './worker.js';
import { PhoneApp } from './phoneApp.js';
import { createPresentation } from './presentation.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);

// Espera as fontes para os textos desenhados em canvas saírem certos
await Promise.race([
  Promise.all(['500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 20px Manrope`))),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});

/* ------------------------------------------------------------------ */
/* Cena, câmera e luz                                                 */
/* ------------------------------------------------------------------ */

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(36, stage.clientWidth / stage.clientHeight, 0.05, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.6;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe5ec, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(2.2, 4.6, 3.2);
key.target.position.set(0.3, 0.5, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 12 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xf2f6ff, 0.7);
fill.position.set(-3, 2.5, 2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.8);
rim.position.set(-1, 3, -4);
scene.add(rim);

// Piso invisível que só recebe sombras: fundo 100% branco
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.ShadowMaterial({ color: 0x1b2a3d, opacity: 0.16 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* ------------------------------------------------------------------ */
/* Objetos                                                            */
/* ------------------------------------------------------------------ */

scene.add(M.makeStand(CONFIG.lixeiras.map((b) => b.x)));

const pi = M.makePi();
pi.group.position.set(0, 0.7, -0.115);
scene.add(pi.group);
const piOut = V(0, 0.745, -0.11);

// Arduino (opcional): fica abaixo do Raspberry Pi, preso numa haste vertical
let arduino = null;
let usbCurve = null;
if (CONFIG.placaArduino) {
  arduino = M.makeArduino();
  arduino.group.position.set(0, 0.53, -0.115);
  scene.add(arduino.group);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.006),
    new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.25 }));
  strip.position.set(0, 0.54, -0.2);
  strip.castShadow = true;
  scene.add(strip);
  usbCurve = new THREE.CatmullRomCurve3([
    V(-0.04, 0.542, -0.106), V(-0.072, 0.57, -0.092), V(-0.07, 0.645, -0.092), V(-0.042, 0.668, -0.106),
  ]);
  const usb = new THREE.Mesh(new THREE.TubeGeometry(usbCurve, 24, 0.0035, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.5 }));
  usb.castShadow = true;
  scene.add(usb);
}

const app = new PhoneApp((i) => requestCollect(i));
const SCREEN_W = 0.37;
const phone = M.makePhone(app.texture, SCREEN_W, SCREEN_W / app.aspect);
const PHONE_POS = V(1.1, 1.0, 0.5);
phone.group.position.copy(PHONE_POS);
phone.group.rotation.set(-0.06, -0.55, 0);
scene.add(phone.group);

const cableMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6 });
const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
const packetGeo = new THREE.SphereGeometry(0.011, 12, 8);

const bins = CONFIG.lixeiras.map((cfg, index) => {
  const b = M.makeBin(cfg);
  scene.add(b.group);
  const bag = M.makeBag();
  bag.group.position.set(cfg.x, BIN.bottomY + 0.008, 0);
  scene.add(bag.group);

  b.group.updateMatrixWorld(true);
  const sensorPos = b.sensor.getWorldPosition(V(0, 0, 0));
  const s = Math.sign(cfg.x) || 1;
  // Cabo do sensor até o Arduino (ou direto até o Raspberry Pi)
  const cable = new THREE.CatmullRomCurve3(arduino ? [
    sensorPos.clone().add(V(0, 0.004, -0.01)),
    V(cfg.x, sensorPos.y + 0.004, -BIN.td - 0.015),
    V(cfg.x * 0.75, 0.82, -0.225),
    V(cfg.x * 0.35, 0.62, -0.215),
    V(s * 0.03, 0.585, -0.16),
    V(s * 0.012, 0.556, -0.112),
  ] : [
    sensorPos.clone().add(V(0, 0.004, -0.01)),
    V(cfg.x, sensorPos.y + 0.004, -BIN.td - 0.015),
    V(cfg.x * 0.75, 0.84, -0.225),
    V(cfg.x * 0.3, 0.79, -0.19),
    V(s * 0.02, piOut.y, piOut.z),
  ]);
  const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cable, 40, 0.004, 6), cableMat);
  cableMesh.castShadow = true;
  scene.add(cableMesh);

  return {
    ...b, cfg, index, bag, fill: 0, cable, sensorPos,
    collecting: false, queued: false, nextPing: 0.4 + index * 0.6, pinging: false, epoch: 0,
  };
});

const wifiCurve = new THREE.QuadraticBezierCurve3(piOut.clone(), V(0.6, 1.8, 0.25), PHONE_POS.clone());

const hand = M.makeHand();
scene.add(hand.rig);

const worker = new Worker();
scene.add(worker.root);

/* ------------------------------------------------------------------ */
/* Sensor ultrassônico → Raspberry Pi → celular                       */
/* ------------------------------------------------------------------ */

function distanceCm(fill) {
  return 2 + (1 - fill) * (CONFIG.profundidadeCm - 2);
}

function ring(bin, y0, y1, dur, color) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.renderOrder = 5;
  const update = (e, p) => {
    m.position.set(bin.sensorPos.x, lerp(y0, y1, p), bin.sensorPos.z + 0.02);
    const r = y1 < y0 ? 0.015 + p * 0.13 : 0.14 - p * 0.1;
    m.scale.set(r, 1, r * 0.85);
    m.material.opacity = 0.85 * (1 - p * 0.6);
  };
  update(0, 0); // posiciona antes de entrar na cena (senão aparece 1 quadro no chão)
  scene.add(m);
  return tween(dur, update, ease.linear).then(() => {
    scene.remove(m);
    m.material.dispose();
  });
}

function pulseAlong(curve, dur, color = 0x1fb6ff) {
  const m = new THREE.Mesh(packetGeo, new THREE.MeshBasicMaterial({ color }));
  curve.getPointAt(0, m.position);
  scene.add(m);
  return tween(dur, (e) => curve.getPointAt(e, m.position), ease.inOut).then(() => {
    scene.remove(m);
    m.material.dispose();
  });
}

let piBlink = 0;
let ardBlink = 0;
async function ping(bin) {
  bin.pinging = true;
  const epoch = bin.epoch;
  const top = bin.sensorPos.y - 0.015;
  const surface = bin.bag ? bin.bag.surfaceY() : BIN.bottomY;
  const reading = bin.fill;
  const travel = 0.12 + (top - surface) * 0.5;
  ring(bin, top, surface, travel, 0x19b4ff);
  await wait(travel * 0.5);
  ring(bin, top, surface, travel, 0x19b4ff);
  await wait(travel * 0.5);
  await ring(bin, surface, top, travel, 0x7fe3ff);
  await pulseAlong(bin.cable, 0.35, 0x37d67a);
  if (arduino) {
    ardBlink = 1;
    await pulseAlong(usbCurve, 0.25, 0xffa31a);
  }
  piBlink = 1;
  await pulseAlong(wifiCurve, 0.6);
  // Leitura descartada se a lixeira foi zerada enquanto ela viajava
  if (epoch === bin.epoch) app.receive(bin.index, reading, distanceCm(reading));
  bin.nextPing = CONFIG.leituraSensorSeg;
  bin.pinging = false;
}

/* ------------------------------------------------------------------ */
/* Adicionar lixo: a mão joga o item na lixeira                       */
/* ------------------------------------------------------------------ */

const throwQueue = [];
let handBusy = false;

function pendingVolume(bin) {
  return throwQueue.filter((q) => q.bin === bin).reduce((s, q) => s + CONFIG.itens[q.type].volume / 100, 0);
}

function requestTrash(index, type) {
  const bin = bins[index];
  if (bin.collecting || bin.queued) return toast(`Coleta em andamento na ${bin.cfg.id}. Aguarde terminar.`);
  if (bin.fill + pendingVolume(bin) >= 0.995) return toast(`A ${bin.cfg.id} está cheia! Acione a coleta pelo app.`);
  if (throwQueue.length >= 6) return;
  throwQueue.push({ bin, type });
  processThrows();
}

async function processThrows() {
  if (handBusy) return;
  handBusy = true;
  while (throwQueue.length) {
    const job = throwQueue.shift();
    if (!job.bin.collecting && !job.bin.queued) await throwItem(job.bin, job.type);
  }
  handBusy = false;
}

async function swingFlap(bin) {
  const f = bin.flap;
  await tween(0.1, (e) => (f.rotation.x = 1.05 * e), ease.out);
  await tween(1.1, (e, p) => (f.rotation.x = 1.05 * Math.cos(p * Math.PI * 3) * Math.pow(1 - p, 2)), ease.linear);
  f.rotation.x = 0;
}

function spinner(item) {
  const s = V(rand(-9, 9), rand(-9, 9), rand(-9, 9));
  let last = 0;
  return (p, dur) => {
    const dt = (p - last) * dur;
    last = p;
    item.rotation.x += s.x * dt;
    item.rotation.y += s.y * dt;
    item.rotation.z += s.z * dt;
  };
}

async function launch(item, type, bin, entry) {
  scene.attach(item);
  const p0 = item.position.clone();
  const peak = Math.max(p0.y, entry.y) + 0.15;
  const ctrlY = 2 * peak - (p0.y + entry.y) / 2;
  let spin = spinner(item);
  await tween(0.48, (e, p) => {
    item.position.x = lerp(p0.x, entry.x, p);
    item.position.z = lerp(p0.z, entry.z, p);
    item.position.y = (1 - p) * (1 - p) * p0.y + 2 * (1 - p) * p * ctrlY + p * p * entry.y;
    spin(p, 0.48);
  }, ease.linear);

  swingFlap(bin);
  const inside = V(entry.x + rand(-0.07, 0.07), BIN.topY - 0.02, rand(-0.04, 0.07));
  await tween(0.14, (e, p) => item.position.lerpVectors(entry, inside, p), ease.linear);

  const bag = bin.bag;
  if (!bag || bin.collecting) {
    scene.remove(item);
    return;
  }
  const vol = (CONFIG.itens[type].volume + rand(-1.5, 1.5)) / 100;
  const newFill = Math.min(1, bin.fill + vol);
  const landY = bag.group.position.y + newFill * BAG_H * 0.97 + (item.userData.r || 0.03) * 0.3;
  const fallDur = Math.max(0.12, Math.sqrt(Math.max(0.01, inside.y - landY)) * 0.45);
  spin = spinner(item);
  await tween(fallDur, (e, p) => {
    item.position.y = lerp(inside.y, landY, p * p);
    spin(p, fallDur * 0.5);
  }, ease.linear);

  bin.fill = newFill;
  const f0 = bag.fill;
  tween(0.25, (e) => bag.setFill(lerp(f0, newFill, e)));
  bag.items.attach(item);
  if (bag.items.children.length > 28) bag.items.remove(bag.items.children[0]);
  const by = item.position.y;
  await tween(0.2, (e, p) => (item.position.y = by + Math.sin(p * Math.PI) * 0.018), ease.linear);
}

async function throwItem(bin, type) {
  const bx = bin.group.position.x;
  const item = M.makeItem(type);
  item.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  hand.itemAnchor.add(item);
  hand.setGrip(1);
  hand.wrist.rotation.x = 0;

  const entry = V(bx, BIN.topY + 0.1, 0.235);
  const start = V(bx + 0.35, 1.9, 1.45);
  const hold = V(bx + 0.12, 1.22, 0.6);
  const back = V(bx + 0.17, 1.3, 0.72);
  const aim = () => hand.rig.lookAt(entry);

  hand.rig.visible = true;
  await tween(0.7, (e) => {
    hand.rig.position.lerpVectors(start, hold, e);
    hand.rig.scale.setScalar(0.5 + 0.5 * Math.min(1, e * 2));
    aim();
  }, ease.out);
  await tween(0.28, (e) => {
    hand.rig.position.lerpVectors(hold, back, e);
    hand.wrist.rotation.x = -0.55 * e;
    aim();
  });
  let flight = null;
  await tween(0.17, (e, p) => {
    hand.rig.position.lerpVectors(back, hold, e);
    hand.wrist.rotation.x = -0.55 + 0.95 * e;
    aim();
    if (!flight && p > 0.5) flight = launch(item, type, bin, entry);
    if (flight) hand.setGrip(Math.max(0, 1 - (p - 0.5) * 3));
  }, ease.linear);
  hand.setGrip(0);
  const retreat = tween(0.6, (e) => {
    hand.rig.position.lerpVectors(hold, start, e);
    hand.wrist.rotation.x = 0.4 * (1 - e);
    hand.rig.scale.setScalar(1 - 0.5 * e);
    aim();
  }, ease.in).then(() => (hand.rig.visible = false));
  await Promise.all([flight, retreat]);
}

/* ------------------------------------------------------------------ */
/* Coleta: funcionário tira a tampa, amarra o saco, troca e leva      */
/* ------------------------------------------------------------------ */

const collectQueue = [];
let workerBusy = false;

function requestCollect(i) {
  const bin = bins[i];
  if (bin.collecting || bin.queued) return;
  if (statusOf(app.live[i].fill) === 'vazia') {
    return toast(`A ${bin.cfg.id} ainda está vazia — a coleta libera a partir de ${CONFIG.limites.metade}%.`);
  }
  bin.queued = true;
  for (let k = throwQueue.length - 1; k >= 0; k--) if (throwQueue[k].bin === bin) throwQueue.splice(k, 1);
  app.setState(i, workerBusy ? 'queued' : 'collecting');
  toast(`Coleta acionada para a ${bin.cfg.id}. Equipe a caminho!`);
  collectQueue.push(bin);
  runCollections();
}

async function runCollections() {
  if (workerBusy) return;
  workerBusy = true;
  while (collectQueue.length) {
    const bin = collectQueue.shift();
    bin.queued = false;
    bin.collecting = true;
    app.setState(bin.index, 'collecting');
    await collect(bin);
  }
  workerBusy = false;
}

function grip(obj, local) {
  return () => obj.localToWorld(local.clone());
}
function polar(o, th, d, y) {
  return V(o.x + Math.sin(th) * d, y, o.z + Math.cos(th) * d);
}

let wiggle = 0;

async function collect(bin) {
  const W = worker;
  const bx = bin.group.position.x;
  const side = bx < 0 ? -1 : 1;
  const home = V(bx, 0, -0.6);
  const lid = bin.lid;

  // Chegada
  W.root.position.set(side * 3.7, 0, -0.95);
  W.root.rotation.y = -side * Math.PI / 2;
  W.crouch = 0;
  W.root.visible = true;
  await W.walkTo(home.x, home.z);
  await W.turnTo(0, 0.45);

  // 1) Retira a tampa e deixa no chão ao lado
  W.setGoals(grip(lid, V(0.235, 0.035, -0.04)), grip(lid, V(-0.235, 0.035, -0.04)));
  await wait(0.55);
  scene.attach(lid);
  const l0 = lid.position.clone();
  await tween(0.6, (e) => lid.position.set(l0.x, l0.y + 0.22 * e, l0.z - 0.04 * e));
  const lidUpY = lid.position.y;
  const lidSide = side * Math.PI / 2;
  await tween(1.5, (e) => {
    const th = lidSide * Math.min(1, e * 1.4);
    W.root.rotation.y = th;
    lid.rotation.y = th;
    W.crouch = smoothstep(0.3, 1, e);
    const y = lerp(lidUpY, 0.012, smoothstep(0.45, 1, e));
    lid.position.copy(polar(home, th, lerp(0.56, 0.62, e), y));
  });
  W.setGoals(null, null);
  await tween(0.7, (e) => {
    W.crouch = 1 - e;
    W.root.rotation.y = lerpAngle(lidSide, 0, e);
  });

  // 2) Puxa o saco para cima
  const bag = bin.bag;
  const bagGrip = (sx) => () => bag.group.localToWorld(V(
    sx * lerp(0.15, 0.03, bag.tie),
    BAG_H * lerp(1.0, 0.99, bag.tie) + wiggle * sx,
    lerp(-0.08, 0, bag.tie),
  ));
  W.setGoals(bagGrip(1), bagGrip(-1));
  await wait(0.6);
  const y0 = bag.group.position.y;
  await tween(0.8, (e) => (bag.group.position.y = y0 + 0.3 * e));
  bin.bag = null;
  bin.fill = 0;

  // 3) Amarra o saco
  await tween(1.6, (e, p) => {
    bag.setTie(e);
    wiggle = Math.sin(p * Math.PI * 8) * 0.025 * (1 - p * 0.5);
  });
  wiggle = 0;

  // 4) Tira da lixeira e coloca no chão atrás
  const y1 = bag.group.position.y;
  await tween(0.6, (e) => (bag.group.position.y = y1 + 0.36 * e));
  const bagUpY = bag.group.position.y;
  const bagSide = side * Math.PI * 0.75;
  await tween(1.5, (e) => {
    const th = bagSide * Math.min(1, e * 1.25);
    W.root.rotation.y = th;
    bag.group.rotation.y = th;
    W.crouch = 0.5 * smoothstep(0.4, 1, e);
    const y = lerp(bagUpY, 0, smoothstep(0.45, 1, e));
    bag.group.position.copy(polar(home, th, lerp(0.6, 0.62, e), y));
  });
  W.setGoals(null, null);
  await tween(0.7, (e) => {
    W.crouch = 0.5 * (1 - e);
    W.root.rotation.y = lerpAngle(bagSide, 0, e);
  });

  // 5) Coloca um saco novo
  const nb = M.makeBag();
  applyXrayToBag(nb);
  scene.add(nb.group);
  nb.group.position.set(bx, 1.12, -0.12);
  nb.group.scale.set(0.001, 0.001, 0.001);
  W.setGoals(grip(nb.group, V(0.17, BAG_H, -0.05)), grip(nb.group, V(-0.17, BAG_H, -0.05)));
  await tween(0.45, (e) => nb.group.scale.set(0.28 * e, 0.06 * e, 0.28 * e), ease.out);
  await tween(0.7, (e) => {
    nb.group.scale.set(lerp(0.28, 1, e), lerp(0.06, 0.15, e), lerp(0.28, 1, e));
    nb.group.position.set(bx, lerp(1.12, 0.96, e), lerp(-0.12, 0, e));
  });
  await tween(0.9, (e) => {
    nb.group.scale.y = lerp(0.15, 1, e);
    nb.group.position.y = lerp(0.96, BIN.bottomY + 0.008, e);
  });
  nb.group.scale.set(1, 1, 1);
  bin.bag = nb;
  W.setGoals(null, null);
  await wait(0.2);

  // 6) Recoloca a tampa
  await tween(1.1, (e) => {
    W.root.rotation.y = lidSide * Math.min(1, e * 1.4);
    W.crouch = smoothstep(0.3, 1, e);
  });
  W.setGoals(grip(lid, V(0.235, 0.035, -0.04)), grip(lid, V(-0.235, 0.035, -0.04)));
  await wait(0.5);
  await tween(1.6, (e) => {
    const th = lidSide * (1 - smoothstep(0.3, 1, e));
    W.root.rotation.y = th;
    lid.rotation.y = th;
    W.crouch = 1 - smoothstep(0, 0.6, e);
    const y = lerp(0.012, BIN.topY + 0.2, smoothstep(0, 0.4, e));
    lid.position.copy(polar(home, th, lerp(0.62, 0.6, e), y));
  });
  await tween(0.45, (e) => (lid.position.y = lerp(BIN.topY + 0.2, BIN.topY, e)));
  bin.group.attach(lid);
  lid.position.set(0, BIN.topY, 0);
  lid.rotation.set(0, 0, 0);
  W.setGoals(null, null);

  bin.collecting = false;
  app.finishCollect(bin.index);
  bin.nextPing = 0.3;
  toast(`Coleta concluída na ${bin.cfg.id}.`);

  // 7) Leva o saco cheio embora
  await tween(1.0, (e) => {
    W.root.rotation.y = lerpAngle(0, bagSide, e);
    W.crouch = 0.55 * smoothstep(0.3, 1, e);
  });
  const armIdx = side > 0 ? 1 : 0;
  W.setGoal(armIdx, grip(bag.group, V(0, BAG_H * 0.99, 0)));
  await wait(0.55);
  W.carry(armIdx, bag.group, BAG_H * 0.99);
  W.setGoal(armIdx, null);
  await tween(0.7, (e) => (W.crouch = 0.55 * (1 - e)));
  await W.walkTo(side * 3.9, -0.8);
  W.carry(null);
  scene.remove(bag.group);
  W.root.visible = false;
}

/* ------------------------------------------------------------------ */
/* Visão interna (raio-x)                                             */
/* ------------------------------------------------------------------ */

let xray = false;
function setOpacity(m, o) {
  m.transparent = true;
  m.opacity = o;
  m.depthWrite = o >= 1;
  m.needsUpdate = true;
}
function applyXrayToBag(bag) {
  setOpacity(bag.mat, xray ? 0.5 : 1);
}
function setXray(on) {
  xray = on;
  for (const b of bins) {
    setOpacity(b.mats.body, on ? 0.2 : 1);
    for (const m of b.mats.lid) setOpacity(m, on ? 0.35 : 1);
    setOpacity(b.mats.label, on ? 0.25 : 1);
    if (b.bag) applyXrayToBag(b.bag);
  }
  ui.xray.classList.toggle('on', on);
  ui.xray.setAttribute('aria-pressed', String(on));
}

/* ------------------------------------------------------------------ */
/* Câmera                                                             */
/* ------------------------------------------------------------------ */

let camMode = 'overview';
let camAnim = null;
const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
let freeFrac = 1; // fração da altura da tela livre (sem cabeçalho e painel)

// Centraliza a cena no espaço entre o cabeçalho e o painel de controles
function layoutView() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const header = w < 760 ? 80 : 90;
  const dockTop = document.body.classList.contains('presenting')
    ? h - (w < 760 ? 210 : 170) // espaço da legenda
    : document.querySelector('.dock').getBoundingClientRect().top;
  const free = Math.max(h * 0.35, dockTop - header);
  freeFrac = free / h;
  camera.setViewOffset(w, h, 0, h / 2 - (header + free / 2), w, h);
}
const fitDist = (w, h) => Math.max(h / freeFrac / 2 / tanHalf(), w / 2 / (tanHalf() * camera.aspect));

function cameraPreset(mode) {
  if (mode === 'phone') {
    const n = V(0, 0, 1).applyQuaternion(phone.group.quaternion);
    const d = fitDist(0.55, 0.92);
    return { target: phone.group.position.clone(), pos: phone.group.position.clone().addScaledVector(n, d) };
  }
  const target = V(0.32, 0.64, 0.05);
  const dir = V(0.12, 0.26, 1).normalize();
  return { target, pos: target.clone().addScaledVector(dir, fitDist(2.9, 2.0)) };
}

function goCamera(mode, instant = false) {
  camMode = mode;
  const p = cameraPreset(mode);
  if (instant) {
    camera.position.copy(p.pos);
    controls.target.copy(p.target);
  } else {
    camAnim = { t: 0, dur: 1.1, p0: camera.position.clone(), t0: controls.target.clone(), ...p };
  }
  ui.cam.textContent = mode === 'phone' ? 'Visão geral' : 'Focar no app';
}

// Movimento de câmera que pode ser aguardado (usado no modo apresentação)
function flyTo(pos, target, dur = 2) {
  return new Promise((resolve) => {
    camAnim = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), pos, target, resolve };
  });
}
function jumpTo(pos, target) {
  camAnim = null;
  camera.position.copy(pos);
  controls.target.copy(target);
}

/* ------------------------------------------------------------------ */
/* Interface HTML                                                     */
/* ------------------------------------------------------------------ */

const ui = {
  binSeg: document.getElementById('binSeg'),
  itemSeg: document.getElementById('itemSeg'),
  add: document.getElementById('addTrash'),
  collect: document.getElementById('collectBtn'),
  xray: document.getElementById('xrayBtn'),
  cam: document.getElementById('camBtn'),
  speed: document.getElementById('speedBtn'),
  reset: document.getElementById('resetBtn'),
  present: document.getElementById('presentBtn'),
  presentExit: document.getElementById('presentExit'),
  toast: document.getElementById('toast'),
  tags: document.getElementById('tags'),
};
let selectedBin = 0;
let selectedItem = 'aleatorio';

CONFIG.lixeiras.forEach((cfg, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.innerHTML = `<span class="swatch" style="background:#${cfg.cor.toString(16).padStart(6, '0')}"></span>${cfg.id} · ${cfg.nome}`;
  b.onclick = () => selectBin(i);
  ui.binSeg.appendChild(b);
});
const itemOptions = [['aleatorio', 'Aleatório'], ...Object.entries(CONFIG.itens).map(([k, v]) => [k, v.nome])];
for (const [k, label] of itemOptions) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = label;
  b.dataset.item = k;
  b.onclick = () => {
    selectedItem = k;
    [...ui.itemSeg.children].forEach((c) => c.classList.toggle('on', c.dataset.item === k));
  };
  ui.itemSeg.appendChild(b);
}
ui.itemSeg.children[0].classList.add('on');

function selectBin(i) {
  selectedBin = i;
  [...ui.binSeg.children].forEach((c, k) => c.classList.toggle('on', k === i));
}
selectBin(0);

function addTrash() {
  const types = Object.keys(CONFIG.itens);
  const type = selectedItem === 'aleatorio' ? types[(Math.random() * types.length) | 0] : selectedItem;
  requestTrash(selectedBin, type);
}
ui.add.onclick = addTrash;
ui.collect.onclick = () => requestCollect(selectedBin);
ui.xray.onclick = () => setXray(!xray);
ui.cam.onclick = () => goCamera(camMode === 'phone' ? 'overview' : 'phone');
ui.speed.onclick = () => {
  clock.speed = clock.speed === 1 ? 2 : 1;
  ui.speed.textContent = `${clock.speed}×`;
};
ui.reset.onclick = () => location.reload();

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (pres.active) {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'm') pres.stop();
    return;
  }
  if (e.key.toLowerCase() === 'm') pres.start();
  else if (e.code === 'Space') { e.preventDefault(); addTrash(); }
  else if (e.key === '1' || e.key === '2') selectBin(+e.key - 1);
  else if (e.key.toLowerCase() === 'c') requestCollect(selectedBin);
  else if (e.key.toLowerCase() === 'x') setXray(!xray);
  else if (e.key.toLowerCase() === 'p') ui.cam.click();
});

let toastTimer = 0;
function toast(msg) {
  if (pres.active) return; // na apresentação quem explica é a legenda
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2800);
}

// Etiquetas flutuantes acima de cada lixeira
const tags = bins.map((bin) => {
  const el = document.createElement('div');
  el.className = 'tag';
  ui.tags.appendChild(el);
  return el;
});
const tmp = V(0, 0, 0);
function updateTags() {
  const w = stage.clientWidth, h = stage.clientHeight;
  bins.forEach((bin, i) => {
    const el = tags[i];
    // Sobe a etiqueta durante a coleta para não cobrir o funcionário
    bin.tagY = lerp(bin.tagY ?? 1.2, bin.collecting ? 2.05 : 1.2, 0.08);
    tmp.set(bin.group.position.x, bin.tagY, 0).project(camera);
    const allowed = pres.active ? presentTags : camMode !== 'phone';
    const visible = allowed && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    el.style.display = visible ? '' : 'none';
    if (!visible) return;
    el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    const live = app.live[i];
    const st = statusOf(live.fill);
    const extra = bin.collecting ? 'Em coleta' : bin.queued ? 'Na fila' : STATUS[st].label;
    const html = `<i style="background:${STATUS[st].color}"></i><b>${bin.cfg.id}</b><span>${Math.round(live.fill * 100)}%</span><em>${extra} · ${live.dist.toFixed(0)} cm</em>`;
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
  });
  const live = app.live[selectedBin];
  const canCollect = statusOf(live.fill) !== 'vazia' && !bins[selectedBin].collecting && !bins[selectedBin].queued;
  ui.collect.hidden = !canCollect;
}

/* ------------------------------------------------------------------ */
/* Clique / toque na cena (tela do celular e lixeiras)                */
/* ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const targets = [phone.group, ...bins.map((b) => b.group)];
  return raycaster.intersectObjects(targets, true)[0] || null;
}
function ownerBin(obj) {
  return bins.findIndex((b) => {
    let o = obj;
    while (o) {
      if (o === b.group) return true;
      o = o.parent;
    }
    return false;
  });
}

renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (pres.active) return;
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  downAt = null;
  const hit = pick(e);
  if (!hit) return;
  if (hit.object === phone.screen) {
    if (!app.click(hit.uv.x, hit.uv.y) && camMode !== 'phone') goCamera('phone');
    return;
  }
  const bi = ownerBin(hit.object);
  if (bi >= 0) return selectBin(bi);
  if (camMode !== 'phone') goCamera('phone');
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons || pres.active) return;
  const hit = pick(e);
  let cursor = '';
  if (hit) {
    if (hit.object === phone.screen) cursor = app.hitTest(hit.uv.x, hit.uv.y) || camMode !== 'phone' ? 'pointer' : '';
    else cursor = 'pointer';
  }
  renderer.domElement.style.cursor = cursor;
});

/* ------------------------------------------------------------------ */
/* Modo apresentação                                                  */
/* ------------------------------------------------------------------ */

let presentTags = true;
let savedState = null;

function resetBins() {
  for (const b of bins) {
    if (!b.bag || b.collecting) continue;
    b.epoch++;
    b.bag.items.clear();
    b.fill = 0;
    b.bag.setFill(0);
    Object.assign(app.live[b.index], {
      fill: 0, dist: CONFIG.profundidadeCm, state: 'idle', updatedAt: Date.now(),
    });
    b.nextPing = 0.3 + b.index * 0.4;
  }
}

const pres = createPresentation({
  camera, bins, app, phone, pi, arduino, hand,
  screen: { w: SCREEN_W, h: SCREEN_W / app.aspect },
  flyTo, jumpTo, fitDist, cameraPreset, setXray, requestTrash, requestCollect, resetBins,
  setTags: (on) => (presentTags = on),
  handBusy: () => handBusy || throwQueue.length > 0,
  workerBusy: () => workerBusy,
  idle: () => !handBusy && !workerBusy && !throwQueue.length && !collectQueue.length,
  onStart() {
    savedState = { speed: clock.speed, xray };
    clock.speed = 1;
    controls.enabled = false;
    ui.toast.classList.remove('show');
    layoutView();
  },
  onStop() {
    clock.speed = savedState.speed;
    ui.speed.textContent = `${clock.speed}×`;
    setXray(savedState.xray);
    controls.enabled = true;
    layoutView();
    goCamera('overview');
  },
});
ui.present.onclick = () => pres.start();
ui.presentExit.onclick = () => pres.stop();

/* ------------------------------------------------------------------ */
/* Loop                                                               */
/* ------------------------------------------------------------------ */

function onResize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  layoutView();
}
window.addEventListener('resize', () => {
  onResize();
  goCamera(camMode);
});

layoutView();
goCamera('overview', true);
const timer = new THREE.Clock();
let elapsed = 0;
let firstFrame = true;

renderer.setAnimationLoop(() => {
  const rdt = Math.min(timer.getDelta(), 0.05);
  const dt = rdt * clock.speed;
  elapsed += rdt;

  updateTweens(rdt);
  worker.update(dt);

  for (const bin of bins) {
    bin.nextPing -= dt;
    if (bin.nextPing <= 0 && !bin.pinging) ping(bin);
  }
  piBlink = Math.max(0, piBlink - dt * 3);
  pi.ledMat.emissiveIntensity = 0.2 + piBlink * 3;
  if (arduino) {
    ardBlink = Math.max(0, ardBlink - dt * 3);
    arduino.ledMat.emissiveIntensity = 0.15 + ardBlink * 3;
  }

  phone.group.position.y = PHONE_POS.y + Math.sin(elapsed * 1.3) * 0.01;
  app.update(rdt);

  if (camAnim) {
    const a = camAnim;
    a.t = Math.min(1, a.t + rdt / a.dur);
    const e = ease.inOut(a.t);
    camera.position.lerpVectors(a.p0, a.pos, e);
    controls.target.lerpVectors(a.t0, a.target, e);
    if (a.t >= 1) {
      camAnim = null;
      a.resolve?.();
    }
  }
  controls.update();
  updateTags();
  pres.update(rdt);
  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    document.body.classList.add('ready');
  }
});

// Acesso pelo console do navegador (ex.: lixeira.encher(0) antes da apresentação)
window.lixeira = {
  bins, app, phone, camera, clock, pres, setXray, goCamera, requestTrash, requestCollect,
  encher(i = selectedBin, pct = 85) {
    const bin = bins[i];
    if (!bin.bag || bin.collecting) return;
    bin.fill = Math.min(1, pct / 100);
    bin.bag.setFill(bin.fill);
  },
};
