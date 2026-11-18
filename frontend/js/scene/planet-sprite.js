// Попиксельный рендер освещённой планеты в маленький offscreen-canvas.
// Для каждого размера спрайта один раз строится таблица (LUT): нормаль, широта/долгота
// и прозрачность края. В кадре остаётся только освещение (Ламберт + мягкий терминатор),
// блик океана, свечение атмосферы у края и «огни» на ночной стороне.

import { TEX_W, TEX_H } from './textures.js';
import { TAU, clamp, rgba } from './math.js';

const WMASK = TEX_W - 1;

function buildLut(n, tilt) {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const max = n * n;
  const pix = new Int32Array(max);
  const X = new Float32Array(max);
  const Y = new Float32Array(max);
  const NZ = new Float32Array(max);
  const ROW = new Int32Array(max);
  const COL = new Int32Array(max);
  const A = new Uint8Array(max);
  const inv = 2 / n;
  let m = 0;

  for (let j = 0; j < n; j++) {
    const y = 1 - (j + 0.5) * inv;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * inv - 1;
      const rr = x * x + y * y;
      const alpha = clamp((1 - Math.sqrt(rr)) * n * 0.5 + 0.5, 0, 1);
      if (alpha <= 0) continue;

      const nz = Math.sqrt(Math.max(0, 1 - Math.min(rr, 1)));
      // Северный полюс наклонён к зрителю на угол tilt
      const lat = Math.asin(clamp(y * ct + nz * st, -1, 1));
      const lon = Math.atan2(x, nz * ct - y * st);
      const row = clamp(Math.floor((0.5 - lat / Math.PI) * TEX_H), 0, TEX_H - 1);

      pix[m] = (j * n + i) * 4;
      X[m] = x;
      Y[m] = y;
      NZ[m] = nz;
      ROW[m] = row * TEX_W;
      COL[m] = Math.floor((lon / TAU + 0.5) * TEX_W) & WMASK;
      A[m] = Math.round(alpha * 255);
      m++;
    }
  }
  return { n, m, pix, X, Y, NZ, ROW, COL, A };
}

export class PlanetSprite {
  constructor(def) {
    this.def = def;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.lut = null;
    this.image = null;
  }

  /** Готовит LUT под размер n×n пикселей (пересчитывается только при смене размера). */
  prepare(n) {
    if (this.lut && this.lut.n === n) return;
    this.canvas.width = n;
    this.canvas.height = n;
    this.image = this.ctx.createImageData(n, n);
    this.lut = buildLut(n, this.def.tilt || 0);
  }

  /**
   * @param tex   текстура из createTextureJob
   * @param light направление на Солнце в координатах спрайта (x вправо, y вверх, z к зрителю)
   * @param spin  смещение долготы в текселях (дробное — для плавного вращения)
   */
  render(tex, light, spin) {
    const { m, pix, X, Y, NZ, ROW, COL, A } = this.lut;
    const data = this.image.data;
    const col = tex.col;
    const spec = tex.spec;
    const emit = tex.emit;
    const hasSpec = tex.hasSpec;
    const hasEmit = tex.hasEmit;
    const lx = light[0];
    const ly = light[1];
    const lz = light[2];

    // Полувектор для блика (зритель смотрит вдоль +z)
    let hx = lx;
    let hy = ly;
    let hz = lz + 1;
    const hl = Math.hypot(hx, hy, hz) || 1;
    hx /= hl;
    hy /= hl;
    hz /= hl;

    const s0 = Math.floor(spin);
    const fr = spin - s0;
    const sI = s0 & WMASK;
    const atm = this.def.atmosphere;
    const atmK = this.def.atmosphereStrength;
    const em = this.def.emitColor || [0, 0, 0];

    for (let k = 0; k < m; k++) {
      const x = X[k];
      const y = Y[k];
      const nz = NZ[k];
      const lam = lx * x + ly * y + lz * nz;

      // Мягкий терминатор
      let t = (lam + 0.1) * 1.3;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      t = t * t * (3 - 2 * t);
      // Немного рассеянного света, чтобы ночная сторона читалась как диск, а не как дыра
      const shade = 0.05 + 0.11 * nz + 0.9 * t;

      const c = COL[k];
      const i0 = ROW[k] + ((c - sI) & WMASK);
      const i1 = ROW[k] + ((c - sI - 1) & WMASK);
      const o0 = i0 * 3;
      const o1 = i1 * 3;
      let r = (col[o0] + (col[o1] - col[o0]) * fr) * shade;
      let g = (col[o0 + 1] + (col[o1 + 1] - col[o0 + 1]) * fr) * shade;
      let b = (col[o0 + 2] + (col[o1 + 2] - col[o0 + 2]) * fr) * shade;

      // Атмосфера у края диска, сильнее на дневной стороне
      const rim = 1 - nz;
      const a = rim * rim * rim * (0.15 + 0.85 * t) * atmK;
      r += atm[0] * a;
      g += atm[1] * a;
      b += atm[2] * a;

      if (hasSpec && lam > 0) {
        const sp = spec[i0];
        if (sp) {
          let h = hx * x + hy * y + hz * nz;
          if (h > 0) {
            h *= h; h *= h; h *= h; h *= h; h *= h; // h^32
            const v = h * sp * 0.55;
            r += v;
            g += v;
            b += v * 0.95;
          }
        }
      }

      if (hasEmit) {
        const e = emit[i0];
        if (e) {
          const night = 1 - t;
          const v = (e * night * night) / 255;
          r += em[0] * v;
          g += em[1] * v;
          b += em[2] * v;
        }
      }

      const o = pix[k];
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = A[k];
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}

/** Ореол атмосферы вокруг диска (рисуется аддитивно до самой планеты). */
export function drawAtmosphere(ctx, x, y, R, color, lightDir, strength) {
  const ox = x + lightDir[0] * R * 0.08;
  const oy = y + lightDir[1] * R * 0.08;
  const outer = R * 1.24;
  const g = ctx.createRadialGradient(ox, oy, R * 0.9, ox, oy, outer);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.3, rgba(color, 0.34 * strength));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ox, oy, outer, 0, TAU);
  ctx.fill();
}

// Профиль колец: [доля радиуса, непрозрачность] — тусклое C, яркое B, щель Кассини, A
const RING_STOPS = [
  [0, 0], [0.06, 0.16], [0.3, 0.32], [0.34, 0.74], [0.62, 0.68],
  [0.65, 0.07], [0.7, 0.5], [0.92, 0.4], [0.95, 0.1], [1, 0],
];

/**
 * Половина колец: задняя (за планетой) или передняя.
 * Северный полюс наклонён к зрителю, поэтому ближняя половина колец — нижняя.
 */
export function drawRingHalf(ctx, x, y, R, ring, roll, front, brightness) {
  const inner = R * ring.inner;
  const outer = R * ring.outer;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(roll);
  ctx.beginPath();
  if (front) ctx.rect(-outer - 2, 0, outer * 2 + 4, outer + 2);
  else ctx.rect(-outer - 2, -outer - 2, outer * 2 + 4, outer + 2);
  ctx.clip();
  ctx.scale(1, Math.sin(ring.tilt));

  const c = ring.color;
  const lit = [c[0] * brightness, c[1] * brightness, c[2] * brightness];
  const g = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
  for (const [t, a] of RING_STOPS) g.addColorStop(t, rgba(lit, a));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, TAU);
  ctx.arc(0, 0, inner, 0, TAU, true);
  ctx.fill();
  ctx.restore();
}
