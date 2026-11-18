// Процедурные равнопромежуточные (equirectangular) текстуры планет.
// Генерация идёт порциями в пределах бюджета кадра, чтобы не блокировать главный поток.

import { createNoise } from './noise.js';
import { TAU, smoothstep } from './math.js';

export const TEX_W = 512; // степень двойки: позволяет «прокручивать» долготу через & (TEX_W - 1)
export const TEX_H = 256;

const mix = (a, b, t) => a + (b - a) * t;

// Каждый рецепт пишет в out: [r, g, b, specular 0..255, emissive 0..255]
const RECIPES = {
  // IELTS — «планета общения»: океаны, материки, облака
  ielts(n, x, y, z, lat, out) {
    const h = n.fbm(x * 1.7 + 3.1, y * 1.7 - 1.3, z * 1.7 + 7.7, 6);
    const detail = n.fbm(x * 6 + 1, y * 6 + 2, z * 6 + 3, 3);
    const cw = n.fbm(x * 2.2 + 9, y * 2.2, z * 2.2 - 4, 3);
    const c = n.fbm(x * 2.6 + cw * 1.4, y * 5.2 + cw, z * 2.6 - cw * 1.4, 5);
    const cloud = smoothstep(0.05, 0.34, c) * 0.94;
    const latAbs = Math.abs(lat);

    let r;
    let g;
    let b;
    let spec = 0;
    if (latAbs > 1.2 + detail * 0.25) {
      r = 226; g = 236; b = 248;
    } else if (h > 0.05) {
      const t = smoothstep(-0.2, 0.3, detail + (h - 0.05) * 1.2) * 0.85;
      r = mix(48, 196, t); g = mix(138, 172, t); b = mix(110, 116, t);
      const high = smoothstep(0.22, 0.4, h) * 0.5;
      r = mix(r, 150, high); g = mix(g, 140, high); b = mix(b, 126, high);
    } else {
      const shallow = smoothstep(-0.18, 0.05, h);
      r = mix(14, 40, shallow); g = mix(46, 120, shallow); b = mix(116, 198, shallow);
      spec = 255;
    }
    out[0] = mix(r, 240, cloud);
    out[1] = mix(g, 246, cloud);
    out[2] = mix(b, 255, cloud);
    out[3] = spec * (1 - cloud);
    out[4] = 0;
  },

  // SAT — газовый гигант с полосами (и кольцами, они рисуются отдельно)
  sat(n, x, y, z, lat, out) {
    const warp = n.fbm(x * 2 + 4, y * 2, z * 2 - 2, 4);
    const fine = n.fbm(x * 9 + 2, y * 18, z * 9 - 3, 3);
    const band = y * 7.5 + warp * 0.9;
    const t1 = 0.5 + 0.5 * Math.sin(band * 2.2);
    const t2 = 0.5 + 0.5 * Math.sin(band * 5.1 + 1.3);
    let r = mix(244, 214, t1);
    let g = mix(226, 162, t1);
    let b = mix(188, 98, t1);
    r = mix(r, 172, t2 * 0.32); g = mix(g, 124, t2 * 0.32); b = mix(b, 74, t2 * 0.32);
    r += fine * 18; g += fine * 14; b += fine * 10;
    const pole = smoothstep(1.0, 1.5, Math.abs(lat)) * 0.55;
    out[0] = mix(r, 168, pole);
    out[1] = mix(g, 140, pole);
    out[2] = mix(b, 104, pole);
    out[3] = 0;
    out[4] = 0;
  },

  // CSCA — каменистая киноварная планета с пылевыми хребтами и полярной шапкой
  csca(n, x, y, z, lat, out) {
    const h = n.fbm(x * 2.1 + 8, y * 2.1 + 2, z * 2.1 - 5, 6);
    const ridge = 1 - Math.abs(n.fbm(x * 4.2 - 3, y * 4.2 + 6, z * 4.2 + 1, 4)) * 2.2;
    const grain = n.noise(x * 40, y * 40, z * 40);
    const t = smoothstep(-0.32, 0.3, h);
    let r = mix(104, 206, t);
    let g = mix(30, 86, t);
    let b = mix(30, 64, t);
    const dust = smoothstep(0.45, 0.95, ridge) * 0.55;
    r = mix(r, 240, dust); g = mix(g, 152, dust); b = mix(b, 114, dust);
    r += grain * 10; g += grain * 6; b += grain * 6;
    if (lat > 1.28 + h * 0.3) {
      r = 248; g = 230; b = 224;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
    out[3] = 0;
    out[4] = 0;
  },

  // Programming — «цифровая» планета: сетка-схема и узлы, которые светятся на ночной стороне
  programming(n, x, y, z, lat, out, lon) {
    const base = n.fbm(x * 2.2 + 1, y * 2.2 - 7, z * 2.2 + 3, 5);
    const t = smoothstep(-0.35, 0.35, base);
    let r = mix(30, 72, t);
    let g = mix(22, 54, t);
    let b = mix(84, 168, t);
    let emit = 0;

    const step = Math.PI / 12;
    const fl = (lat + Math.PI / 2) / step;
    const fo = (lon + Math.PI) / step;
    const dl = Math.abs(fl - Math.round(fl)) * step;
    const dlo = Math.abs(fo - Math.round(fo)) * step * Math.max(Math.cos(lat), 0.05);
    const cellA = n.noise(Math.floor(fo) * 0.93 + 0.5, Math.round(fl) * 0.71 + 0.5, 3.3);
    const cellB = n.noise(Math.round(fo) * 0.67 + 0.5, Math.floor(fl) * 0.89 + 0.5, 8.1);

    let line = 0;
    if (cellA > -0.12) line = Math.max(line, 1 - dl / 0.014);
    if (cellB > -0.12) line = Math.max(line, 1 - dlo / 0.014);
    if (line > 0) {
      r = mix(r, 150, line * 0.75); g = mix(g, 128, line * 0.75); b = mix(b, 255, line * 0.75);
      emit = line * 46;
    }

    const node = 1 - Math.hypot(dl, dlo) / 0.032;
    if (node > 0 && n.noise(Math.round(fo) * 1.31, Math.round(fl) * 1.17, 5.5) > 0.05) {
      r = mix(r, 196, node); g = mix(g, 255, node); b = mix(b, 232, node);
      emit = Math.max(emit, node * 255);
    }

    if (n.noise(x * 64, y * 64, z * 64) > 0.62) emit = Math.max(emit, 150);

    out[0] = r;
    out[1] = g;
    out[2] = b;
    out[3] = 0;
    out[4] = emit;
  },
};

/**
 * Создаёт текстуру и «задание» на её постепенную генерацию.
 * До окончания генерации текстура залита базовым цветом — планета всё равно выглядит прилично.
 */
export function createTextureJob(kind, seed, baseColor) {
  const size = TEX_W * TEX_H;
  const col = new Uint8ClampedArray(size * 3);
  const spec = new Uint8Array(size);
  const emit = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    col[i * 3] = baseColor[0];
    col[i * 3 + 1] = baseColor[1];
    col[i * 3 + 2] = baseColor[2];
  }

  const noise = createNoise(seed);
  const recipe = RECIPES[kind];
  const out = [0, 0, 0, 0, 0];
  const tex = { col, spec, emit, ready: false, hasSpec: kind === 'ielts', hasEmit: kind === 'programming' };
  let row = 0;

  function step(deadline) {
    while (row < TEX_H) {
      const lat = (0.5 - (row + 0.5) / TEX_H) * Math.PI;
      const cl = Math.cos(lat);
      const sl = Math.sin(lat);
      const rowBase = row * TEX_W;
      for (let i = 0; i < TEX_W; i++) {
        const lon = ((i + 0.5) / TEX_W) * TAU - Math.PI;
        recipe(noise, cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, out, lon);
        const k = rowBase + i;
        col[k * 3] = out[0];
        col[k * 3 + 1] = out[1];
        col[k * 3 + 2] = out[2];
        spec[k] = out[3];
        emit[k] = out[4];
      }
      row++;
      if (performance.now() > deadline) break;
    }
    tex.ready = row >= TEX_H;
    return tex.ready;
  }

  return { tex, step };
}
