// Modo apresentação: roteiro automático com câmera, legendas e balões explicativos.
// Os textos e os tempos de cada etapa ficam todos aqui.
import * as THREE from 'three';
import { CONFIG, statusOf } from './config.js';
import { tween, wait, ease, lerp, clamp, smoothstep } from './tween.js';

const CANCEL = Symbol('cancelado');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const STEPS = ['Abertura', 'Componentes', 'Descarte', 'App', 'Coleta', 'Fim'];

export function createPresentation(ctx) {
  const $ = (id) => document.getElementById(id);
  const el = {
    step: $('capStep'), dots: $('capDots'), title: $('capTitle'), text: $('capText'), cap: $('caption'),
    svg: $('calloutSvg'), line: $('cLine'), dot: $('cDot'), pulse: $('cPulse'),
    box: $('calloutBox'), bKicker: $('cKicker'), bTitle: $('cTitle'), bText: $('cText'),
  };
  el.dots.innerHTML = STEPS.map(() => '<i></i>').join('');

  let active = false;
  let cancelled = false;
  let callout = null;
  let feeding = false;
  let time = 0;

  const check = () => {
    if (cancelled) throw CANCEL;
  };
  const pause = async (s) => {
    await wait(s);
    check();
  };
  const fly = async (shot, dur = 2.2) => {
    await ctx.flyTo(shot.pos, shot.target, dur);
    check();
  };
  async function until(fn) {
    while (!fn()) await pause(0.1);
  }
  // Câmera olhando para `target`, vinda da direção `dir`, a `dist` metros
  const shot = (target, dir, dist) => ({ target, pos: target.clone().addScaledVector(dir.clone().normalize(), dist) });
  // Close no celular: de frente para a tela, ocupando quase toda a altura livre
  const phoneShot = () => shot(
    ctx.phone.group.position.clone(),
    V(0, 0, 1).applyQuaternion(ctx.phone.group.quaternion),
    ctx.fitDist(0.44, 0.86),
  );

  /* -------------------------------- Legenda -------------------------------- */

  function caption(step, title, text) {
    el.step.textContent = `Etapa ${step + 1} de ${STEPS.length} · ${STEPS[step]}`;
    [...el.dots.children].forEach((d, i) => d.classList.toggle('on', i <= step));
    el.title.textContent = title;
    el.text.textContent = text;
    el.cap.classList.remove('swap');
    void el.cap.offsetWidth; // reinicia a animação de troca
    el.cap.classList.add('swap');
  }

  /* ------------------------ Balão: ponto + linha + caixa ------------------------ */

  async function showCallout(c) {
    el.bKicker.textContent = c.kicker;
    el.bTitle.textContent = c.title;
    el.bText.textContent = c.text;
    callout = { ...c, prog: 0 };
    const mine = callout;
    await tween(0.8, (e) => (mine.prog = e), ease.out);
    check();
  }

  async function hideCallout() {
    const mine = callout;
    if (!mine) return;
    await tween(0.35, (e) => (mine.prog = 1 - e));
    if (callout === mine) callout = null;
    check();
  }

  const tmp = new THREE.Vector3();
  function update(dt) {
    time += dt;
    const show = active && callout && callout.prog > 0.001;
    el.svg.classList.toggle('on', !!show);
    if (!show) {
      el.box.style.opacity = 0;
      return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    tmp.copy(callout.anchor()).project(ctx.camera);
    const sx = (tmp.x * 0.5 + 0.5) * W, sy = (-tmp.y * 0.5 + 0.5) * H;
    const bw = el.box.offsetWidth, bh = el.box.offsetHeight;
    let bx, by, ex, ey;
    if (W < 700) {
      // Celular: caixa no topo, linha descendo até a peça
      bx = 16;
      by = 78;
      ex = clamp(sx, bx + 24, bx + bw - 24);
      ey = by + bh;
    } else {
      const side = callout.side === 'left' ? -1 : 1;
      const gap = callout.gap ?? 150;
      bx = side > 0 ? sx + gap : sx - gap - bw;
      by = sy - bh * 0.5 - (callout.lift ?? 90);
      bx = clamp(bx, 20, W - bw - 20);
      by = clamp(by, 90, H - bh - 200);
      ex = bx > sx ? bx : bx + bw;
      ey = clamp(sy, by + 24, by + bh - 24);
    }
    const p = callout.prog;
    const lp = smoothstep(0.1, 0.75, p);
    el.dot.setAttribute('cx', sx);
    el.dot.setAttribute('cy', sy);
    el.dot.setAttribute('r', 7 * smoothstep(0, 0.25, p));
    const pr = (time * 0.9) % 1;
    el.pulse.setAttribute('cx', sx);
    el.pulse.setAttribute('cy', sy);
    el.pulse.setAttribute('r', 8 + pr * 18);
    el.pulse.style.opacity = (1 - pr) * 0.6 * smoothstep(0.2, 0.5, p);
    el.line.setAttribute('x1', sx);
    el.line.setAttribute('y1', sy);
    el.line.setAttribute('x2', lerp(sx, ex, lp));
    el.line.setAttribute('y2', lerp(sy, ey, lp));
    el.box.style.transform = `translate(${bx}px, ${by + (1 - p) * 10}px)`;
    el.box.style.opacity = smoothstep(0.55, 1, p);
  }

  /* ------------------------ Dedo apertando o botão do app ------------------------ */

  async function tapAppButton(id) {
    const { hand, phone, app } = ctx;
    let uv = null;
    await until(() => (uv = app.regionCenter(id)));
    const q = phone.group.quaternion;
    const n = V(0, 0, 1).applyQuaternion(q);
    const up = V(0, 1, 0).applyQuaternion(q);
    const right = V(1, 0, 0).applyQuaternion(q);
    // O dedo vem de baixo e da direita, inclinado em direção à tela
    const dir = n.clone().negate().addScaledVector(up, 0.55).addScaledVector(right, -0.3).normalize();
    const S = 1.3;
    const tip = V(0.03, -0.006, 0.152).multiplyScalar(S); // ponta do indicador (coordenadas da mão)
    const aim = new THREE.Object3D();
    aim.lookAt(dir);
    hand.rig.quaternion.copy(aim.quaternion);
    hand.rig.scale.setScalar(S);
    hand.wrist.rotation.x = 0;
    hand.setGrip(1, true);
    const place = (dist) => {
      const t = phone.screen.localToWorld(V((uv.u - 0.5) * ctx.screen.w, (uv.v - 0.5) * ctx.screen.h, 0));
      hand.rig.position.copy(t).sub(tip.clone().applyQuaternion(hand.rig.quaternion)).addScaledVector(dir, -dist);
    };
    place(0.5);
    hand.rig.visible = true;
    await tween(1.0, (e) => place(lerp(0.5, 0.03, e)), ease.out);
    await tween(0.16, (e) => place(lerp(0.03, -0.003, e)), ease.in);
    const ok = app.tap(uv.u, uv.v);
    await tween(0.18, (e) => place(lerp(-0.003, 0.04, e)));
    await wait(0.35);
    await tween(0.7, (e) => place(lerp(0.04, 0.6, e)), ease.in);
    hand.rig.visible = false;
    hand.rig.scale.setScalar(1);
    hand.setGrip(0);
    return ok;
  }

  /* -------------------------------- Roteiro -------------------------------- */

  async function feedTrash(binIndex) {
    const types = Object.keys(CONFIG.itens);
    feeding = true;
    while (feeding && !cancelled && statusOf(ctx.app.live[binIndex].fill) !== 'cheia') {
      if (!ctx.handBusy()) ctx.requestTrash(binIndex, types[(Math.random() * types.length) | 0]);
      await wait(0.15);
    }
    feeding = false;
  }

  async function run() {
    const { bins, app } = ctx;
    const B = 0; // lixeira usada na demonstração (A-01)
    const id = bins[B].cfg.id;

    caption(0, 'Preparando…', 'Aguardando as animações em andamento terminarem.');
    await until(() => ctx.idle());
    ctx.resetBins();
    ctx.setXray(false);
    ctx.setTags(false);

    // 1) Abertura: câmera girando até a visão geral
    caption(0, 'Lixeira Inteligente UCDB',
      'Monitoramento em tempo real do nível das lixeiras do campus, com sensor ultrassônico, '
      + `${CONFIG.placaArduino ? 'Arduino, ' : ''}Raspberry Pi e um app para a equipe de limpeza.`);
    const ov = ctx.cameraPreset('overview');
    const from = ov.pos.clone().sub(ov.target).applyAxisAngle(V(0, 1, 0), -0.75).multiplyScalar(1.3).add(ov.target);
    ctx.jumpTo(from, ov.target);
    await fly(ov, 4.5);
    await pause(1.5);

    // 2) Componentes do sistema
    const parts = [
      {
        title: 'Sensor ultrassônico HC-SR04',
        short: 'Sensor',
        text: 'Fica no alto da lixeira, apontado para baixo. Emite um pulso de ultrassom (40 kHz) e mede quanto tempo o eco '
          + 'leva para voltar do lixo. Quanto menor a distância, mais cheia está a lixeira.',
        anchor: () => bins[B].sensorPos,
        cam: shot(bins[B].sensorPos.clone().add(V(0, -0.04, 0)), V(0.4, 0.32, 1), 1.0),
        side: 'left',
        xray: true, // a lixeira fica transparente para ver o sensor lá dentro
      },
      CONFIG.placaArduino && {
        title: 'Arduino Uno',
        short: 'Arduino',
        text: 'Dispara o sensor pelo pino TRIG, cronometra o eco no pino ECHO e converte o tempo em centímetros '
          + '(distância = tempo × 0,0343 ÷ 2). Envia cada medida ao Raspberry Pi pelo cabo USB.',
        anchor: () => ctx.arduino.group.position,
        cam: shot(ctx.arduino.group.position.clone(), V(0.3, 0.22, 1), 0.62),
        side: 'right',
      },
      {
        title: 'Raspberry Pi',
        short: 'Raspberry Pi',
        text: 'O "cérebro" do sistema: recebe as distâncias das lixeiras, calcula a % de ocupação, classifica em '
          + 'Vazia, Pela metade ou Cheia e envia os dados por Wi-Fi para o app.',
        anchor: () => ctx.pi.group.position,
        cam: shot(ctx.pi.group.position.clone(), V(-0.3, 0.28, 1), 0.62),
        side: 'left',
      },
      {
        title: 'App de monitoramento',
        short: 'App',
        text: 'Mostra o mapa do campus com cada lixeira em verde, laranja ou vermelho. Quando a lixeira passa de '
          + `${CONFIG.limites.metade}%, libera o botão de coleta para a equipe de limpeza.`,
        anchor: () => ctx.phone.screen.localToWorld(V(0, (0.64 - 0.5) * ctx.screen.h, 0)),
        cam: phoneShot(),
        side: 'left',
        gap: 230,
      },
    ].filter(Boolean);
    caption(1, 'Componentes do sistema',
      `${parts.map((p) => p.short).join(' → ')}: o caminho de cada leitura até o celular.`);
    for (const [k, part] of parts.entries()) {
      ctx.setXray(!!part.xray);
      await fly(part.cam, 2.2);
      await showCallout({ ...part, kicker: `Componente ${k + 1} de ${parts.length}` });
      await pause(6);
      await hideCallout();
    }

    // 3) Descarte do lixo
    caption(2, 'Alunos descartam o lixo',
      'A cada leitura o sensor mede a distância até o topo do lixo. Com a lixeira "transparente" dá para ver o lixo subindo.');
    ctx.setXray(true);
    ctx.setTags(true);
    await fly(shot(V(-0.2, 0.82, 0.12), V(0.28, 0.3, 1), ctx.fitDist(1.8, 1.45)), 2.4);
    const feeder = feedTrash(B);
    await until(() => bins[B].fill >= 0.32);
    await pause(1.2);

    // 4) Acompanhando pelo app
    caption(3, 'O app acompanha em tempo real',
      `O Raspberry Pi envia cada leitura por Wi-Fi. No mapa, a ${id} passa de verde para laranja e depois vermelho.`);
    ctx.setTags(false);
    await fly(phoneShot(), 2.2);
    await until(() => statusOf(app.live[B].fill) === 'cheia');
    feeding = false;
    await feeder;
    caption(3, `${id} cheia!`, `Passou de ${CONFIG.limites.cheia}%: o app avisa e libera o botão "Acionar coleta".`);
    await pause(2.2);
    await until(() => !ctx.handBusy());
    const tapped = await tapAppButton(`collect-${B}`);
    check();
    if (!tapped) ctx.requestCollect(B);
    await pause(1.2);

    // 5) Coleta
    caption(4, 'Equipe de limpeza a caminho',
      'O funcionário retira a tampa, puxa e amarra o saco cheio, coloca um saco novo e leva o lixo embora.');
    ctx.setXray(false);
    ctx.setTags(true);
    await fly(shot(V(-0.48, 0.9, -0.4), V(0.3, 0.24, 1), ctx.fitDist(2.0, 1.85)), 2.4);
    await until(() => !bins[B].collecting);
    caption(4, 'Saco trocado!', 'Tampa de volta no lugar: o sensor já mede a distância máxima de novo.');
    await until(() => !ctx.workerBusy());

    // 6) Ciclo completo
    caption(5, 'Ciclo completo',
      `No app, a ${id} volta a ficar verde (vazia) e registra o horário da última coleta.`);
    ctx.setTags(false);
    await fly(phoneShot(), 2.2);
    app.notify('vazia', `Coleta concluída · ${id}`, 'Saco trocado, lixeira vazia', null);
    await pause(5);
    caption(5, 'Lixeira Inteligente UCDB', 'Fim da demonstração. Obrigado!');
    ctx.setTags(true);
    await fly(ctx.cameraPreset('overview'), 3);
    await pause(4);
  }

  function start() {
    if (active) return;
    active = true;
    cancelled = false;
    callout = null;
    document.body.classList.add('presenting');
    ctx.onStart();
    run()
      .catch((e) => {
        if (e !== CANCEL) console.error(e);
      })
      .finally(() => {
        if (active && !cancelled) stop();
      });
  }

  function stop() {
    if (!active) return;
    active = false;
    cancelled = true;
    feeding = false;
    callout = null;
    document.body.classList.remove('presenting');
    ctx.onStop();
  }

  return {
    start, stop, update,
    get active() { return active; },
  };
}
