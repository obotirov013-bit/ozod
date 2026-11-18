// Звёздное небо и Млечный Путь на «небесной сфере».
// Звёзды — это направления (бесконечно далеко), поэтому они реагируют только на поворот
// камеры. Туманность рисуется в канвас пониженного разрешения и растягивается — так дёшево.

import { TAU, createRng, gaussian, normalize3, cross3 } from './math.js';

// Полюс галактики подобран так, чтобы в первом кадре полоса шла по диагонали через экран
const GAL_POLE = normalize3([-0.2222, 0.6367, -0.7384]);
const STAR_COLORS = ['#DDE6FF', '#B7CBFF', '#FFE9C7'];
const NEBULA_COLORS = [
  [126, 160, 255], // холодный голубой
  [150, 128, 245], // фиолетовый
  [255, 214, 168], // тёплое ядро
  [26, 42, 90],    // #1A2A5A — глубокие облака фона
];
const NEBULA_SCALE = 1 / 3;

function makeSprite(rgb) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`);
  grad.addColorStop(0.35, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.45)`);
  grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export class Sky {
  constructor({ starCount = 1600, seed = 7 } = {}) {
    const rng = createRng(seed);
    this.e1 = normalize3(cross3(GAL_POLE, [0, 0, 1]));
    this.e2 = cross3(GAL_POLE, this.e1);
    this.coreAngle = 0.95;

    // --- Звёзды (отсортированы по цвету, чтобы реже менять fillStyle)
    const stars = [];
    for (let i = 0; i < starCount; i++) {
      const inBand = rng() < 0.5;
      const d = inBand ? this.bandDirection(rng() * TAU, gaussian(rng) * 0.075) : this.uniformDirection(rng);
      const b = Math.pow(rng(), 2.4);
      const roll = rng();
      stars.push({
        d,
        alpha: 0.2 + 0.8 * b,
        size: 0.6 + 1.4 * b,
        color: roll < 0.12 ? 2 : roll < 0.32 ? 1 : 0,
        tw: rng() < 0.18 ? 0.6 + rng() * 1.4 : 0,
        phase: rng() * TAU,
      });
    }
    stars.sort((a, b) => a.color - b.color);
    this.stars = stars;

    // --- Туманность Млечного Пути
    const blobs = [];
    for (let i = 0; i < 170; i++) {
      const core = i < 44;
      const a = core ? this.coreAngle + gaussian(rng) * 0.35 : rng() * TAU;
      blobs.push({
        d: this.bandDirection(a, gaussian(rng) * (core ? 0.075 : 0.055)),
        r: core ? 0.08 + rng() * 0.14 : 0.05 + rng() * 0.12,
        a: core ? 0.07 + rng() * 0.09 : 0.045 + rng() * 0.065,
        c: core ? (rng() < 0.6 ? 2 : 1) : rng() < 0.65 ? 0 : 1,
      });
    }
    for (let i = 0; i < 6; i++) {
      blobs.push({ d: this.uniformDirection(rng), r: 0.5 + rng() * 0.4, a: 0.32, c: 3 });
    }
    this.blobs = blobs;

    // Тёмные пылевые прожилки вдоль центра полосы
    this.lanes = [];
    for (let i = 0; i < 26; i++) {
      const a = this.coreAngle + gaussian(rng) * 0.9;
      this.lanes.push({ d: this.bandDirection(a, gaussian(rng) * 0.015), r: 0.025 + rng() * 0.05, a: 0.3 });
    }

    this.sprites = NEBULA_COLORS.map(makeSprite);
    this.laneSprite = makeSprite([0, 0, 0]);
    this.nebula = document.createElement('canvas');
    this.nctx = this.nebula.getContext('2d');
  }

  bandDirection(a, b) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const { e1, e2 } = this;
    return [
      cb * (ca * e1[0] + sa * e2[0]) + sb * GAL_POLE[0],
      cb * (ca * e1[1] + sa * e2[1]) + sb * GAL_POLE[1],
      cb * (ca * e1[2] + sa * e2[2]) + sb * GAL_POLE[2],
    ];
  }

  uniformDirection(rng) {
    const z = rng() * 2 - 1;
    const phi = rng() * TAU;
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(phi), r * Math.sin(phi), z];
  }

  resize(w, h) {
    this.nebula.width = Math.max(2, Math.ceil(w * NEBULA_SCALE));
    this.nebula.height = Math.max(2, Math.ceil(h * NEBULA_SCALE));
  }

  /**
   * @param view { r, u, f, cx, cy, focal, w, h } — базис камеры, уже с учётом дрейфа неба
   */
  draw(ctx, view, time, twinkle) {
    const { r, u, f, cx, cy, focal, w, h } = view;
    const nctx = this.nctx;
    const s = NEBULA_SCALE;

    // 1. Туманность в низком разрешении
    nctx.setTransform(1, 0, 0, 1, 0, 0);
    nctx.globalCompositeOperation = 'source-over';
    nctx.globalAlpha = 1;
    nctx.clearRect(0, 0, this.nebula.width, this.nebula.height);
    nctx.globalCompositeOperation = 'lighter';
    for (const blob of this.blobs) this.drawBlob(nctx, blob, this.sprites[blob.c], view, s);
    nctx.globalCompositeOperation = 'destination-out';
    for (const lane of this.lanes) this.drawBlob(nctx, lane, this.laneSprite, view, s);
    nctx.globalCompositeOperation = 'source-over';
    nctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.nebula, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // 2. Звёзды
    let color = -1;
    for (const star of this.stars) {
      const d = star.d;
      const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
      if (z < 0.08) continue;
      const k = focal / z;
      const x = cx + (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) * k;
      const y = cy - (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) * k;
      if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;

      let a = star.alpha;
      if (twinkle && star.tw) a *= 0.72 + 0.28 * Math.sin(time * star.tw + star.phase);
      if (star.color !== color) {
        color = star.color;
        ctx.fillStyle = STAR_COLORS[color];
      }
      ctx.globalAlpha = a;
      const sz = star.size;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  drawBlob(nctx, blob, sprite, view, s) {
    const { r, u, f, cx, cy, focal, w, h } = view;
    const d = blob.d;
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (z < 0.12) return;
    const k = focal / z;
    const x = (cx + (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) * k) * s;
    const y = (cy - (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) * k) * s;
    const rad = blob.r * k * s;
    if (x + rad < 0 || y + rad < 0 || x - rad > w * s || y - rad > h * s) return;
    nctx.globalAlpha = blob.a;
    nctx.drawImage(sprite, x - rad, y - rad, rad * 2, rad * 2);
  }
}
