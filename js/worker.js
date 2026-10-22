// Funcionário da limpeza: boneco articulado com caminhada, agachamento
// e braços que "alcançam" pontos no mundo (IK simples de um segmento).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { enableShadows } from './models.js';
import { tween, ease, lerpAngle, clamp } from './tween.js';

const ARM_LEN = 0.62;
const STAND_HIP = 0.95;
const DOWN = new THREE.Vector3(0, -1, 0);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });

export class Worker {
  constructor() {
    const uniform = mat(0xf07c1e, { roughness: 0.8 });
    const pants = mat(0x2f3542, { roughness: 0.85 });
    const skin = mat(0xc68b63, { roughness: 0.6 });
    const glove = mat(0xe9c43b, { roughness: 0.5 });
    const boot = mat(0x1b1b1b, { roughness: 0.6 });
    const reflect = mat(0xe6e9ee, { roughness: 0.3, metalness: 0.4, emissive: 0x666666, emissiveIntensity: 0.25 });

    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.hips.position.y = STAND_HIP;
    this.root.add(this.hips);

    const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.33, 0.16, 0.21, 3, 0.05), pants);
    pelvis.position.y = 0.0;
    this.hips.add(pelvis);

    this.legs = [-1, 1].map((s) => {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.095, -0.03, 0);
      const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.32, 4, 10), pants);
      tm.position.y = -0.215;
      thigh.add(tm);
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      const sm = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.32, 4, 10), pants);
      sm.position.y = -0.2;
      knee.add(sm);
      const ankle = new THREE.Group();
      ankle.position.y = -0.42;
      const bm = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.25, 3, 0.03), boot);
      bm.position.set(0, -0.03, 0.045);
      ankle.add(bm);
      knee.add(ankle);
      thigh.add(knee);
      this.hips.add(thigh);
      return { s, thigh, knee, ankle };
    });

    this.spine = new THREE.Group();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    const chest = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.52, 0.23, 4, 0.08), uniform);
    chest.position.y = 0.25;
    this.spine.add(chest);
    for (const y of [0.13, 0.24]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.405, 0.035, 0.235), reflect);
      stripe.position.y = y;
      this.spine.add(stripe);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 12), skin);
    neck.position.y = 0.54;
    this.spine.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18), skin);
    head.position.y = 0.66;
    head.scale.set(0.95, 1.05, 1);
    this.spine.add(head);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), mat(0x161616));
      eye.position.set(s * 0.04, 0.68, 0.1);
      this.spine.add(eye);
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.117, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), uniform);
    cap.position.y = 0.69;
    this.spine.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), uniform);
    brim.position.set(0, 0.69, 0.07);
    brim.scale.z = 1.4;
    this.spine.add(brim);

    this.arms = [1, -1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.25, 0.46, 0);
      const am = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, ARM_LEN - 0.1, 4, 10), uniform);
      am.geometry.translate(0, -(ARM_LEN - 0.1) / 2 - 0.02, 0);
      shoulder.add(am);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), glove);
      hand.position.y = -ARM_LEN;
      shoulder.add(hand);
      this.spine.add(shoulder);
      return { s, shoulder, mesh: am, hand, goal: null, w: 0, last: new THREE.Vector3() };
    });

    enableShadows(this.root);
    this.root.visible = false;

    this.walking = false;
    this.walk = 0;
    this.phase = 0;
    this.crouch = 0;
    this.carried = null;
    this.carryArm = 0;
    this.carryOffset = 0;
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
  }

  // goals: função que retorna um Vector3 no mundo (ou null para soltar o braço)
  setGoals(a, b) {
    this.setGoal(0, a);
    this.setGoal(1, b);
  }
  setGoal(i, fn) {
    this.arms[i].goal = fn;
  }

  carry(armIndex, obj, offset) {
    this.carried = obj;
    this.carryArm = armIndex;
    this.carryOffset = offset;
  }

  async turnTo(angle, dur = 0.4) {
    const a0 = this.root.rotation.y;
    await tween(dur, (e) => (this.root.rotation.y = lerpAngle(a0, angle, e)));
  }

  async walkTo(x, z, speed = 1.0) {
    const from = this.root.position.clone();
    const to = new THREE.Vector3(x, 0, z);
    const dist = from.distanceTo(to);
    if (dist < 0.01) return;
    await this.turnTo(Math.atan2(to.x - from.x, to.z - from.z), 0.3);
    this.walking = true;
    await tween(dist / speed, (e, p) => this.root.position.lerpVectors(from, to, p), ease.linear);
    this.walking = false;
  }

  update(dt) {
    this.walk += ((this.walking ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    if (this.walk > 0.01) this.phase += dt * 7.5;
    const w = this.walk, c = this.crouch;

    // Agachar: abaixa o quadril e dobra joelhos mantendo os pés no chão
    const hipY = STAND_HIP - c * 0.42;
    const a = Math.acos(clamp((hipY - 0.1) / 0.85, -1, 1));
    this.hips.position.y = hipY - Math.abs(Math.cos(this.phase)) * 0.022 * w;
    for (const L of this.legs) {
      const ph = this.phase + (L.s > 0 ? 0 : Math.PI);
      const swing = Math.sin(ph) * 0.5 * w;
      const bend = Math.max(0, Math.cos(ph)) * 0.6 * w;
      L.thigh.rotation.x = -a - swing;
      L.knee.rotation.x = 2 * a + bend;
      L.ankle.rotation.x = -a + swing * 0.3 - bend * 0.6;
    }
    this.spine.rotation.x = c * 1.1;

    // Braços: pose de descanso (balanço da caminhada) misturada com o alvo
    this.root.updateMatrixWorld(true);
    for (const arm of this.arms) {
      const carrying = this.carried && this.arms[this.carryArm] === arm;
      arm.w += ((arm.goal ? 1 : 0) - arm.w) * Math.min(1, dt * 7);
      const swingAmt = carrying ? 0.12 : 0.4;
      const ph = this.phase + (arm.s > 0 ? Math.PI : 0);
      // -c*1.2 compensa a inclinação do tronco para o braço continuar pendurado
      this._e.set(Math.sin(ph) * swingAmt * w - c * 1.2, 0, arm.s * (carrying ? 0.3 : 0.08));
      this._q.setFromEuler(this._e);

      let stretch = 1;
      if (arm.w > 0.001) {
        if (arm.goal) arm.last.copy(arm.goal());
        const S = arm.shoulder.getWorldPosition(this._s);
        const d = this._v.subVectors(arm.last, S);
        const len = d.length();
        arm.shoulder.parent.getWorldQuaternion(this._q2).invert();
        d.normalize().applyQuaternion(this._q2);
        this._q2.setFromUnitVectors(DOWN, d);
        this._q.slerp(this._q2, arm.w);
        stretch = 1 + (clamp(len / ARM_LEN, 0.7, 1.45) - 1) * arm.w;
      }
      arm.shoulder.quaternion.copy(this._q);
      arm.mesh.scale.y = stretch;
      arm.hand.position.y = -ARM_LEN * stretch;
    }

    if (this.carried) {
      this.root.updateMatrixWorld(true);
      const p = this.arms[this.carryArm].hand.getWorldPosition(this._v);
      this.carried.position.set(p.x, p.y - this.carryOffset, p.z);
      this.carried.rotation.y = this.root.rotation.y;
    }
  }
}
