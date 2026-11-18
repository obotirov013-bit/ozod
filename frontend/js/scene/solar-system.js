// Интерактивная солнечная система навыков.
// Каждая секция страницы с data-shot задаёт «кадр» камеры. При скролле кадры плавно
// смешиваются (камера перелетает по дуге к нужной планете), Млечный Путь дрейфует,
// планеты медленно идут по орбитам. Наведение и клик по планете ведут к её разделу.

import { TAU, clamp, lerp, smoothstep, angleDelta, rotationMatrix, mulTransposed, rgba } from './math.js';
import { Camera, blendPoses } from './camera.js';
import { Sky } from './sky.js';
import { PlanetSprite, drawAtmosphere, drawRingHalf } from './planet-sprite.js';
import { createTextureJob, TEX_W } from './textures.js';
import { PLANETS, PEERS, LINKS, SHOTS, SUN_RADIUS, OUTER_ORBIT, SUN_ANGLE } from './scene-config.js';

// Над этими элементами канвас не перехватывает наведение и клики
const CONTENT_SELECTOR = [
  'a', 'button', 'input', 'label', 'select', 'textarea',
  '.hero__copy', '.planet__panel', '.how__inner', '.join__inner',
  '.site-header', '.mobile-menu', '.site-footer',
].join(',');

const SKY_AXIS = [0.25, 1, 0.35];
const SUN_RGB = [255, 210, 122];
const LABEL_FONT = '500 13px Jost, "Century Gothic", sans-serif';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const screenPoint = () => ({ x: 0, y: 0, z: 0, k: 0, visible: false });

export class SolarSystem {
  constructor(canvas, { sections = [], heroCopy = null, header = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D is not supported');

    this.sections = sections.map((el) => ({
      el,
      shot: SHOTS[el.dataset.shot] ? el.dataset.shot : 'overview',
      center: 0,
    }));
    this.heroCopy = heroCopy;
    this.header = header;

    this.reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.splitQuery = matchMedia('(min-width: 768px) and (min-aspect-ratio: 1/1)');
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.reduced = this.reducedQuery.matches;
    this.maxSprite = this.coarse ? 208 : 304;

    this.camera = new Camera();
    this.sky = new Sky({ starCount: this.coarse ? 1000 : 1700 });

    this.planets = PLANETS.map((def) => ({
      def,
      x: 0,
      y: 0,
      z: 0,
      angle: 0,
      sprite: new PlanetSprite(def),
      job: createTextureJob(def.id, def.seed, def.base),
      screen: screenPoint(),
      sr: 0,
    }));
    this.planetById = Object.fromEntries(this.planets.map((p) => [p.def.id, p]));
    this.peers = PEERS.map((def) => ({ def, planet: this.planetById[def.planet], x: 0, y: 0, z: 0, screen: screenPoint() }));
    this.userSats = [];

    this.time = 0;
    this.last = 0;
    this.frameNo = 0;
    this.pose = {};
    this.poseA = {};
    this.poseB = {};
    this.weights = { system: 1, network: 0 };
    this.snap = true;
    this.hover = null;
    this.pointer = null;
    this.parallax = { x: 0, y: 0 };
    this.parallaxTarget = { x: 0, y: 0 };
    this.sun = screenPoint();
    this.skyView = { r: null, u: null, f: null, cx: 0, cy: 0, focal: 0, w: 0, h: 0 };
    this.bodies = [];

    /** Колбэк выбора планеты (клик по ней на канвасе). */
    this.onPlanetSelect = null;

    this.loop = this.loop.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onClick = this.onClick.bind(this);
  }

  start() {
    this.resize();
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', this.onPointerLeave);
    window.addEventListener('click', this.onClick);
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(document.body);
    }
    if (document.fonts) document.fonts.ready.then(() => this.measure());
    requestAnimationFrame(this.loop);
  }

  /** «Запуск спутника» из кнопки после записи в waitlist. */
  launchSatellite(rect) {
    let orbit = 64 + Math.random() * 240;
    for (const def of PLANETS) if (Math.abs(orbit - def.orbit) < 12) orbit += 24;
    this.userSats.push({
      orbit,
      incl: (Math.random() - 0.5) * 0.5,
      phase: Math.random() * TAU,
      speed: TAU / (60 + Math.random() * 70),
      started: performance.now(),
      flight: this.reducedQuery.matches ? 0 : 1.8,
      from: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      trail: [],
      x: 0,
      y: 0,
      z: 0,
    });
    if (this.userSats.length > 12) this.userSats.shift();
  }

  // ---------------------------------------------------------------- раскладка

  onResize() {
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => {
      this.resizeQueued = false;
      this.resize();
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Свёрнутое окно или скрытая панель дают нулевой размер — ждём нормального
    this.collapsed = w < 2 || h < 2;
    if (this.collapsed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.coarse ? 1.5 : 2);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.focal = 1.25 * Math.max(w, h);
    this.sky.resize(w, h);
    this.split = this.splitQuery.matches;

    const bg = this.ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0A1628');
    bg.addColorStop(1, '#0F1C3F');
    this.bg = bg;
    this.measure();
  }

  measure() {
    const scrollY = window.scrollY;
    for (const s of this.sections) {
      const r = s.el.getBoundingClientRect();
      s.center = r.top + scrollY + r.height / 2;
    }
    this.heroCopyTop = this.heroCopy ? this.heroCopy.getBoundingClientRect().top + scrollY : (this.h || 0) * 0.55;
    this.headerH = this.header ? this.header.getBoundingClientRect().height : 64;
    this.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  /** Свободная от текста область экрана, в которой строится кадр. */
  frameRect(shot) {
    const { w, h } = this;
    let x0 = 0;
    let x1 = w;
    let y0 = this.headerH;
    let y1 = h;
    if (this.split) {
      if (shot === 'farewell') y1 = h * 0.52;
      else x0 = w * 0.46;
    } else if (shot === 'overview') {
      y1 = clamp(this.heroCopyTop - 8, h * 0.3, h * 0.62);
    } else {
      y1 = h * (shot === 'farewell' ? 0.44 : 0.5);
    }
    const fw = x1 - x0;
    const fh = y1 - y0;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: fw, h: fh, size: Math.min(fw, fh) };
  }

  // ---------------------------------------------------------------- камера

  shotPose(name, out) {
    const shot = SHOTS[name];
    const frame = this.frameRect(name);
    const focal = this.camera.focal;
    out.cx = frame.cx;
    out.cy = frame.cy;
    out.pitch = shot.pitch;

    if (shot.kind === 'planet') {
      const p = this.planetById[shot.planet];
      const def = p.def;
      const fitR = def.ring ? def.radius * def.ring.outer * 0.92 : def.radius * 1.25;
      out.dist = (fitR * focal) / (frame.size * shot.fill);
      out.tx = p.x;
      out.ty = 0;
      out.tz = p.z;
      out.yaw = this.planetYaw(p);
    } else {
      const vis = Math.max(Math.sin(shot.pitch), 0.3);
      // В колонке (телефон) ближняя сторона орбит из-за перспективы шире — оставляем запас
      const fitPx = Math.min(frame.w * 0.5, (frame.h * 0.5) / vis) * shot.fit * (this.split ? 1 : 0.86);
      out.dist = ((OUTER_ORBIT + 16) * focal) / fitPx;
      out.tx = 0;
      out.ty = 0;
      out.tz = 0;
      out.yaw = shot.yaw;
    }
    return out;
  }

  /** Ракурс крупного плана: Солнце сзади-слева, планета освещена со стороны текста. */
  planetYaw(p) {
    const len = Math.hypot(p.x, p.z) || 1;
    const sx = -p.x / len;
    const sz = -p.z / len;
    const base = Math.atan2(sz, sx);
    let best = 0;
    for (const sign of [1, -1]) {
      const a = base + sign * SUN_ANGLE;
      const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
      if (sx * Math.cos(yaw) - sz * Math.sin(yaw) < 0) best = yaw;
    }
    return best;
  }

  targetPose(out) {
    const secs = this.sections;
    if (!secs.length) {
      this.shotPose('overview', out);
      return;
    }
    const anchor = window.scrollY + this.h * 0.5;
    let i = 0;
    while (i < secs.length - 1 && anchor > secs[i + 1].center) i++;
    const a = secs[i];
    const b = secs[Math.min(i + 1, secs.length - 1)];
    let t = 0;
    if (b !== a && anchor > a.center) t = clamp((anchor - a.center) / (b.center - a.center), 0, 1);
    // Кадр «держится» у центра секции и меняется между секциями
    t = this.reduced ? (t < 0.5 ? 0 : 1) : smoothstep(0.18, 0.82, t);

    this.shotPose(a.shot, this.poseA);
    this.shotPose(b.shot, this.poseB);
    blendPoses(this.poseA, this.poseB, t, out);

    const sys = (name) => (SHOTS[name].kind === 'system' ? 1 : 0);
    this.weights.system = lerp(sys(a.shot), sys(b.shot), t);
    this.weights.network = lerp(a.shot === 'network' ? 1 : 0, b.shot === 'network' ? 1 : 0, t);
  }

  smoothCamera(dt) {
    const cam = this.camera;
    const p = this.pose;
    const broken = !Number.isFinite(cam.dist) || !Number.isFinite(cam.cx) || !Number.isFinite(cam.yaw);
    if (this.snap || this.reduced || broken) {
      cam.setPose(p);
      this.snap = false;
      return;
    }
    const k = 1 - Math.exp(-dt * 3.2);
    cam.tx += (p.tx - cam.tx) * k;
    cam.ty += (p.ty - cam.ty) * k;
    cam.tz += (p.tz - cam.tz) * k;
    cam.pitch += (p.pitch - cam.pitch) * k;
    cam.cx += (p.cx - cam.cx) * k;
    cam.cy += (p.cy - cam.cy) * k;
    cam.dist = Math.exp(Math.log(cam.dist) + (Math.log(p.dist) - Math.log(cam.dist)) * k);
    cam.yaw += angleDelta(cam.yaw, p.yaw) * k;
    cam.yaw = Math.atan2(Math.sin(cam.yaw), Math.cos(cam.yaw));
  }

  // ---------------------------------------------------------------- кадр

  loop(now) {
    // Шаг времени всегда в [0; 50 мс]: отрицательный шаг раскачал бы сглаживание камеры
    const dt = this.last ? clamp((now - this.last) / 1000, 0, 0.05) : 1 / 60;
    this.last = now;
    if (!this.collapsed) {
      try {
        this.frame(now, dt);
      } catch (error) {
        // Один неудачный кадр не должен останавливать сцену
        if (!this.warned) console.warn('[SkillOrbit] frame skipped:', error);
        this.warned = true;
        this.snap = true;
      }
    }
    requestAnimationFrame(this.loop);
  }

  frame(now, dt) {
    this.reduced = this.reducedQuery.matches;
    if (!this.reduced) this.time += dt;
    this.frameNo++;

    this.stepTextures();
    this.updateBodies();
    this.targetPose(this.pose);
    this.smoothCamera(dt);

    const kp = 1 - Math.exp(-dt * 2.5);
    const px = this.reduced ? 0 : this.parallaxTarget.x;
    const py = this.reduced ? 0 : this.parallaxTarget.y;
    this.parallax.x += (px - this.parallax.x) * kp;
    this.parallax.y += (py - this.parallax.y) * kp;
    this.camera.updateBasis(this.parallax.x * 0.06, -this.parallax.y * 0.04);

    this.render(now);
    if (this.pointer && this.frameNo % 6 === 0) this.refreshHover();
  }

  stepTextures() {
    const budget = this.coarse ? 3 : 5;
    for (const p of this.planets) {
      if (!p.job.tex.ready) {
        p.job.step(performance.now() + budget);
        return;
      }
    }
  }

  updateBodies() {
    const t = this.time;
    for (const p of this.planets) {
      const d = p.def;
      p.angle = d.phase + (t * TAU) / d.period;
      p.x = d.orbit * Math.cos(p.angle);
      p.z = -d.orbit * Math.sin(p.angle);
    }
    for (const peer of this.peers) {
      const d = peer.def;
      const P = peer.planet;
      const rho = d.dist * P.def.radius;
      const a = d.phase + t * d.speed;
      peer.x = P.x + rho * Math.cos(a);
      peer.y = rho * Math.sin(a) * Math.sin(d.incl);
      peer.z = P.z - rho * Math.sin(a) * Math.cos(d.incl);
    }
    for (const s of this.userSats) {
      const a = s.phase + t * s.speed;
      s.x = s.orbit * Math.cos(a);
      s.y = s.orbit * Math.sin(a) * Math.sin(s.incl);
      s.z = -s.orbit * Math.sin(a) * Math.cos(s.incl);
    }
  }

  render(now) {
    const { ctx, w, h, dpr, camera: cam } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);

    // Небо: Млечный Путь поворачивается вместе со скроллом
    const scrollP = this.reduced ? 0 : window.scrollY / this.maxScroll;
    const M = rotationMatrix(SKY_AXIS, 0.4 + scrollP * 1.1 + this.time * 0.004);
    const v = this.skyView;
    v.r = mulTransposed(M, cam.r);
    v.u = mulTransposed(M, cam.u);
    v.f = mulTransposed(M, cam.f);
    v.cx = cam.cx;
    v.cy = cam.cy;
    v.focal = cam.focal;
    v.w = w;
    v.h = h;
    this.sky.draw(ctx, v, this.time, !this.reduced);

    const sun = this.sun;
    cam.project(0, 0, 0, sun);
    if (sun.visible) this.drawSpaceGlow();
    this.drawOrbits();

    // Тела — от дальних к ближним
    const bodies = this.bodies;
    bodies.length = 0;
    if (sun.visible) bodies.push({ kind: 0, ref: null, z: sun.z });
    for (const p of this.planets) {
      if (cam.project(p.x, p.y, p.z, p.screen)) bodies.push({ kind: 1, ref: p, z: p.screen.z });
    }
    for (const peer of this.peers) {
      if (cam.project(peer.x, peer.y, peer.z, peer.screen)) bodies.push({ kind: 2, ref: peer, z: peer.screen.z });
    }
    bodies.sort((a, b) => b.z - a.z);
    for (const item of bodies) {
      if (item.kind === 0) this.drawSun();
      else if (item.kind === 1) this.drawPlanet(item.ref);
      else this.drawPeer(item.ref);
    }

    this.drawLinks();
    this.drawUserSats(now);
    this.drawLabels();
  }

  // ---------------------------------------------------------------- отрисовка

  drawSpaceGlow() {
    const { ctx, sun, w, h } = this;
    const R = Math.max(w, h) * 0.8;
    const g = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, R);
    g.addColorStop(0, 'rgba(26, 42, 90, 0.55)');
    g.addColorStop(0.45, 'rgba(15, 28, 63, 0.22)');
    g.addColorStop(1, 'rgba(15, 28, 63, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawOrbits() {
    const { ctx, camera: cam } = this;
    const tmp = this.tmpPoint || (this.tmpPoint = screenPoint());
    const base = 0.1 + 0.18 * this.weights.system;
    ctx.lineWidth = 1;
    for (const p of this.planets) {
      const R = p.def.orbit;
      ctx.strokeStyle = this.hover === p ? rgba(p.def.color, 0.55) : rgba([130, 158, 230], base);
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 180; i++) {
        const a = (i / 180) * TAU;
        if (cam.project(R * Math.cos(a), 0, -R * Math.sin(a), tmp)) {
          if (pen) ctx.lineTo(tmp.x, tmp.y);
          else ctx.moveTo(tmp.x, tmp.y);
          pen = true;
        } else {
          pen = false;
        }
      }
      ctx.stroke();
    }
  }

  drawSun() {
    const { ctx, sun } = this;
    const R = SUN_RADIUS * sun.k;
    if (R < 0.3) return;
    const glowR = Math.min(R * 9, Math.max(this.w, this.h) * 1.5);
    ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createRadialGradient(sun.x, sun.y, R * 0.6, sun.x, sun.y, glowR);
    g.addColorStop(0, 'rgba(255, 198, 120, 0.42)');
    g.addColorStop(0.1, 'rgba(255, 176, 96, 0.17)');
    g.addColorStop(0.35, 'rgba(255, 150, 90, 0.045)');
    g.addColorStop(1, 'rgba(255, 150, 90, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, glowR, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    g = ctx.createRadialGradient(sun.x - R * 0.22, sun.y - R * 0.22, R * 0.05, sun.x, sun.y, R);
    g.addColorStop(0, '#FFFEF6');
    g.addColorStop(0.55, '#FFEDB9');
    g.addColorStop(0.85, '#FFCD78');
    g.addColorStop(1, '#F7AE4E');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, R, 0, TAU);
    ctx.fill();
  }

  drawPlanet(p) {
    const { ctx, camera: cam } = this;
    const def = p.def;
    const s = p.screen;
    const R = def.radius * s.k;
    p.sr = def.ring ? R * 2.2 : R;
    if (R < 0.4) return;
    const reach = p.sr * 1.3;
    if (s.x + reach < 0 || s.y + reach < 0 || s.x - reach > this.w || s.y - reach > this.h) return;

    // Направление на Солнце в координатах камеры, с поправкой на поворот спрайта (roll)
    const len = Math.hypot(p.x, p.y, p.z) || 1;
    const [lx, ly, lz] = cam.toView([-p.x / len, -p.y / len, -p.z / len]);
    const cr = Math.cos(def.roll);
    const sr = Math.sin(def.roll);
    const light = [lx * cr - ly * sr, lx * sr + ly * cr, lz];
    const lsl = Math.hypot(lx, ly) || 1;
    const lightDir = [lx / lsl, -ly / lsl];

    // Размер спрайта квантуется (шаг 2^¼), чтобы LUT пересчитывалась редко
    const target = Math.max(2 * R * this.dpr, 8);
    const n = Math.round(clamp(Math.pow(2, Math.round(Math.log2(target) * 4) / 4), 8, this.maxSprite));
    const sprite = p.sprite;
    const sizeChanged = !sprite.lut || sprite.lut.n !== n;
    sprite.prepare(n);
    if (sizeChanged || n <= 160 || this.frameNo % 2 === 0) {
      sprite.render(p.job.tex, light, (this.time * TEX_W) / def.spinPeriod);
    }

    ctx.globalCompositeOperation = 'lighter';
    drawAtmosphere(ctx, s.x, s.y, R, def.atmosphere, lightDir, def.halo);
    ctx.globalCompositeOperation = 'source-over';

    const ringLight = 0.45 + 0.55 * smoothstep(-0.5, 0.6, lz);
    if (def.ring) drawRingHalf(ctx, s.x, s.y, R, def.ring, def.roll, false, ringLight);

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(def.roll);
    ctx.drawImage(sprite.canvas, -R, -R, R * 2, R * 2);
    ctx.restore();

    if (def.ring) drawRingHalf(ctx, s.x, s.y, R, def.ring, def.roll, true, ringLight);

    if (this.hover === p) {
      ctx.strokeStyle = rgba(def.color, 0.85);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.sr + 7, 0, TAU);
      ctx.stroke();
    }
  }

  drawPeer(peer) {
    const { ctx } = this;
    const s = peer.screen;
    const r = clamp(peer.planet.def.radius * 0.16 * s.k, 0.9, 5);
    const wN = this.weights.network;
    if (wN > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(SUN_RGB, 0.25 * wN);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 3.2, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = '#FFE9C2';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
  }

  /** P2P-связи между учениками: видны в разделе «How the orbit works». */
  drawLinks() {
    const wN = this.weights.network;
    if (wN < 0.01) return;
    const { ctx } = this;
    ctx.lineWidth = 1.2;
    LINKS.forEach(([i, j], idx) => {
      const A = this.peers[i].screen;
      const B = this.peers[j].screen;
      if (!A.visible || !B.visible) return;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = (A.x + B.x) / 2 - (dy / len) * len * 0.22;
      const cy = (A.y + B.y) / 2 + (dx / len) * len * 0.22;
      ctx.strokeStyle = rgba(SUN_RGB, 0.38 * wN);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.quadraticCurveTo(cx, cy, B.x, B.y);
      ctx.stroke();

      // Импульс «данных», бегущий от ученика к ученику
      const t = (this.time * 0.18 + idx * 0.37) % 1;
      const it = 1 - t;
      const x = it * it * A.x + 2 * it * t * cx + t * t * B.x;
      const y = it * it * A.y + 2 * it * t * cy + t * t * B.y;
      ctx.fillStyle = rgba([255, 236, 200], 0.9 * wN);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    });
  }

  drawUserSats(now) {
    if (!this.userSats.length) return;
    const { ctx, camera: cam } = this;
    const tmp = this.tmpPoint || (this.tmpPoint = screenPoint());
    for (const s of this.userSats) {
      if (!cam.project(s.x, s.y, s.z, tmp)) continue;
      let x = tmp.x;
      let y = tmp.y;
      const elapsed = (now - s.started) / 1000;
      if (elapsed < s.flight) {
        // Перелёт от кнопки к своей орбите по дуге
        const t = easeInOutCubic(elapsed / s.flight);
        const f = s.from;
        const cx = lerp(f.x, x, 0.3);
        const cy = Math.min(f.y, y) - Math.min(this.h * 0.28, 240);
        const it = 1 - t;
        x = it * it * f.x + 2 * it * t * cx + t * t * x;
        y = it * it * f.y + 2 * it * t * cy + t * t * y;
        s.trail.push(x, y);
        if (s.trail.length > 40) s.trail.splice(0, 2);
      } else if (s.trail.length) {
        s.trail.splice(0, 4);
      }

      ctx.lineCap = 'round';
      for (let i = 2; i < s.trail.length; i += 2) {
        const a = i / s.trail.length;
        ctx.strokeStyle = rgba(SUN_RGB, a * 0.6);
        ctx.lineWidth = 2.6 * a;
        ctx.beginPath();
        ctx.moveTo(s.trail[i - 2], s.trail[i - 1]);
        ctx.lineTo(s.trail[i], s.trail[i + 1]);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, 'rgba(255, 214, 140, 0.6)');
      g.addColorStop(1, 'rgba(255, 214, 140, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFF4DA';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, TAU);
      ctx.fill();
    }
  }

  drawLabels() {
    const alpha = smoothstep(0.4, 1, this.weights.system);
    if (alpha < 0.01) return;
    const { ctx } = this;
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    for (const p of this.planets) {
      const s = p.screen;
      if (!s.visible) continue;
      const hovered = this.hover === p;
      const gap = p.sr + 9;
      const width = ctx.measureText(p.def.label).width;
      let x = s.x + gap;
      ctx.textAlign = 'left';
      if (x + width > this.w - 10) {
        x = s.x - gap;
        ctx.textAlign = 'right';
      }
      ctx.globalAlpha = alpha * (hovered ? 1 : 0.85);
      ctx.fillStyle = hovered ? rgba(p.def.color, 1) : '#C3CDEA';
      ctx.fillText(p.def.label, x, s.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ---------------------------------------------------------------- указатель

  hitTest(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.planets) {
      const s = p.screen;
      if (!s.visible) continue;
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < Math.max(p.sr + 8, 16) && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  pickAt(x, y, target) {
    if (target instanceof Element && target.closest(CONTENT_SELECTOR)) return null;
    return this.hitTest(x, y);
  }

  setHover(p) {
    if (p === this.hover) return;
    this.hover = p;
    document.documentElement.classList.toggle('is-planet-hover', !!p);
  }

  refreshHover() {
    const { x, y } = this.pointer;
    this.setHover(this.pickAt(x, y, document.elementFromPoint(x, y)));
  }

  onPointerMove(e) {
    if ((e.pointerType && e.pointerType !== 'mouse') || !this.w) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    this.parallaxTarget.x = clamp((e.clientX / this.w) * 2 - 1, -1, 1);
    this.parallaxTarget.y = clamp((e.clientY / this.h) * 2 - 1, -1, 1);
    this.setHover(this.pickAt(e.clientX, e.clientY, e.target));
  }

  onPointerLeave() {
    this.pointer = null;
    this.parallaxTarget.x = 0;
    this.parallaxTarget.y = 0;
    this.setHover(null);
  }

  onClick(e) {
    if (e.defaultPrevented || e.button !== 0) return;
    const hit = this.pickAt(e.clientX, e.clientY, e.target);
    if (hit && this.onPlanetSelect) this.onPlanetSelect(hit.def.id);
  }
}
