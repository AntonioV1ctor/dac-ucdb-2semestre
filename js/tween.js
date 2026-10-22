// Mini sistema de animação baseado em Promises: `await tween(dur, fn)`.
// Permite escrever as animações como uma sequência de passos (async/await).

export const clock = { speed: 1 };

const tasks = new Set();

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};

export function tween(duration, onUpdate, easing = ease.inOut) {
  return new Promise((resolve) => {
    tasks.add({ t: 0, duration: Math.max(duration, 1e-4), onUpdate, easing, resolve });
  });
}

export const wait = (s) => tween(s, () => {}, ease.linear);

export function updateTweens(realDt) {
  const dt = realDt * clock.speed;
  for (const k of [...tasks]) {
    k.t += dt;
    const p = Math.min(1, k.t / k.duration);
    k.onUpdate(k.easing(p), p);
    if (p >= 1) {
      tasks.delete(k);
      k.resolve();
    }
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
