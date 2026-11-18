// 3D value noise + fBm. Используется для процедурных текстур планет:
// шум берётся на поверхности сферы, поэтому нет шва на 0°/360° и искажений у полюсов.

import { createRng } from './math.js';

export function createNoise(seed = 1) {
  const rng = createRng(seed);
  const perm = new Uint8Array(512);
  const values = new Float32Array(256);

  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
    values[i] = rng() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function noise(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    const aa = perm[a] + Z;
    const ab = perm[a + 1] + Z;
    const ba = perm[b] + Z;
    const bb = perm[b + 1] + Z;

    const x00 = values[perm[aa]] + (values[perm[ba]] - values[perm[aa]]) * u;
    const x10 = values[perm[ab]] + (values[perm[bb]] - values[perm[ab]]) * u;
    const x01 = values[perm[aa + 1]] + (values[perm[ba + 1]] - values[perm[aa + 1]]) * u;
    const x11 = values[perm[ab + 1]] + (values[perm[bb + 1]] - values[perm[ab + 1]]) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  /** Фрактальный шум, результат примерно в диапазоне [-0.7, 0.7]. */
  function fbm(x, y, z, octaves = 5) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  return { noise, fbm };
}
