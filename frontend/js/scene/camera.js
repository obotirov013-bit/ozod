// Орбитальная перспективная камера: смотрит на цель с расстояния dist под углами yaw/pitch.
// (cx, cy) — точка экрана, куда проецируется цель («сдвиг объектива»), так кадр
// можно строить справа от текста на десктопе или сверху на телефоне.

import { clamp, lerp, lerpAngle } from './math.js';

export const NEAR = 0.5;

export class Camera {
  constructor() {
    this.tx = 0;
    this.ty = 0;
    this.tz = 0;
    this.dist = 1000;
    this.yaw = 0;
    this.pitch = 0.4;
    this.cx = 0;
    this.cy = 0;
    this.focal = 1000;
    this.pos = [0, 0, 0];
    this.r = [1, 0, 0];
    this.u = [0, 1, 0];
    this.f = [0, 0, -1];
  }

  setPose(p) {
    this.tx = p.tx;
    this.ty = p.ty;
    this.tz = p.tz;
    this.dist = p.dist;
    this.yaw = p.yaw;
    this.pitch = p.pitch;
    this.cx = p.cx;
    this.cy = p.cy;
  }

  /** Пересчитывает положение и базис; смещения — для лёгкого параллакса от курсора. */
  updateBasis(yawOffset = 0, pitchOffset = 0) {
    const yaw = this.yaw + yawOffset;
    const pitch = clamp(this.pitch + pitchOffset, -1.4, 1.45);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cyaw = Math.cos(yaw);
    const syaw = Math.sin(yaw);
    const bx = cp * syaw;
    const by = sp;
    const bz = cp * cyaw;
    this.pos = [this.tx + this.dist * bx, this.ty + this.dist * by, this.tz + this.dist * bz];
    this.f = [-bx, -by, -bz];
    this.r = [cyaw, 0, -syaw];
    this.u = [-syaw * sp, cp, -cyaw * sp];
  }

  /** Проекция мировой точки на экран (CSS-пиксели). Возвращает false, если точка за камерой. */
  project(x, y, z, out) {
    const dx = x - this.pos[0];
    const dy = y - this.pos[1];
    const dz = z - this.pos[2];
    const f = this.f;
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    out.z = zc;
    if (zc < NEAR) {
      out.visible = false;
      return false;
    }
    const r = this.r;
    const u = this.u;
    const k = this.focal / zc;
    out.x = this.cx + (dx * r[0] + dy * r[1] + dz * r[2]) * k;
    out.y = this.cy - (dx * u[0] + dy * u[1] + dz * u[2]) * k;
    out.k = k;
    out.visible = true;
    return true;
  }

  /** Мировой вектор → координаты камеры (x вправо, y вверх, z к зрителю). */
  toView(v) {
    const { r, u, f } = this;
    return [
      v[0] * r[0] + v[1] * r[1] + v[2] * r[2],
      v[0] * u[0] + v[1] * u[1] + v[2] * u[2],
      -(v[0] * f[0] + v[1] * f[1] + v[2] * f[2]),
    ];
  }
}

/**
 * Смешивает два кадра. Посередине перелёта камера приподнимается и отъезжает
 * пропорционально расстоянию между целями — получается дуга, а не пролёт сквозь Солнце.
 */
export function blendPoses(a, b, t, out) {
  const sep = Math.hypot(a.tx - b.tx, a.tz - b.tz);
  const hop = Math.sin(Math.PI * t);
  out.tx = lerp(a.tx, b.tx, t);
  out.ty = lerp(a.ty, b.ty, t);
  out.tz = lerp(a.tz, b.tz, t);
  out.dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t)) + hop * sep * 0.85;
  out.yaw = lerpAngle(a.yaw, b.yaw, t);
  out.pitch = lerp(a.pitch, b.pitch, t) + hop * Math.min(sep / 200, 1) * 0.3;
  out.cx = lerp(a.cx, b.cx, t);
  out.cy = lerp(a.cy, b.cy, t);
  return out;
}
