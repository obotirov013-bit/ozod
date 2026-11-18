// Описание системы навыков: планеты, «ученики»-спутники, P2P-связи и кадры камеры.
// Мир: Солнце в начале координат, орбиты в плоскости XZ, ось Y направлена вверх.

// Масштаб условный: планеты крупнее «реальных», чтобы читаться в общем плане
export const SUN_RADIUS = 28;
export const OUTER_ORBIT = 292;

/** Угол между взглядом камеры и направлением на Солнце в крупных планах (Солнце сзади-слева). */
export const SUN_ANGLE = 2.05;

export const PLANETS = [
  {
    id: 'ielts',
    label: 'IELTS',
    color: [90, 169, 255],
    base: [30, 80, 160],
    orbit: 100,
    radius: 15,
    period: 75,
    phase: 0.9,
    spinPeriod: 70,
    tilt: 0.28,
    roll: -0.18,
    atmosphere: [110, 175, 255],
    atmosphereStrength: 0.95,
    halo: 0.9,
    seed: 11,
  },
  {
    id: 'sat',
    label: 'SAT',
    color: [221, 176, 124],
    base: [214, 170, 110],
    orbit: 162,
    radius: 17,
    period: 115,
    phase: 2.6,
    spinPeriod: 55,
    tilt: 0.42,
    roll: 0.32,
    atmosphere: [250, 220, 170],
    atmosphereStrength: 0.45,
    halo: 0.45,
    seed: 23,
    ring: { inner: 1.3, outer: 2.3, tilt: 0.42, color: [236, 214, 174] },
  },
  {
    id: 'csca',
    label: 'CSCA',
    color: [255, 122, 107],
    base: [170, 60, 48],
    orbit: 226,
    radius: 13,
    period: 160,
    phase: 4.3,
    spinPeriod: 80,
    tilt: 0.22,
    roll: -0.1,
    atmosphere: [255, 150, 130],
    atmosphereStrength: 0.5,
    halo: 0.5,
    seed: 37,
  },
  {
    id: 'programming',
    label: 'Programming',
    color: [167, 139, 250],
    base: [50, 38, 120],
    orbit: 292,
    radius: 16,
    period: 215,
    phase: 5.6,
    spinPeriod: 64,
    tilt: 0.3,
    roll: 0.12,
    atmosphere: [160, 140, 255],
    atmosphereStrength: 0.8,
    halo: 0.8,
    seed: 41,
    emitColor: [110, 242, 198],
  },
];

/** Ученики-«спутники» вокруг планет: dist — в радиусах планеты, speed — рад/с. */
export const PEERS = [
  { planet: 'ielts', dist: 2.4, speed: 0.55, phase: 0.3, incl: 0.4 },
  { planet: 'ielts', dist: 3.2, speed: -0.36, phase: 2.2, incl: -0.3 },
  { planet: 'sat', dist: 2.9, speed: 0.42, phase: 1.1, incl: 0.25 },
  { planet: 'sat', dist: 3.6, speed: -0.3, phase: 4.0, incl: -0.2 },
  { planet: 'csca', dist: 2.6, speed: 0.5, phase: 5.1, incl: 0.5 },
  { planet: 'csca', dist: 3.3, speed: -0.4, phase: 0.8, incl: -0.35 },
  { planet: 'programming', dist: 2.5, speed: 0.46, phase: 3.3, incl: 0.3 },
  { planet: 'programming', dist: 3.4, speed: -0.33, phase: 1.7, incl: -0.4 },
];

/** Прямые P2P-связи между учениками разных планет (индексы в PEERS). */
export const LINKS = [
  [0, 2], [1, 6], [3, 4], [5, 7], [2, 5], [0, 7],
];

/**
 * Кадры камеры. kind: 'system' — вся система, 'planet' — крупный план.
 * fit — доля кадра под систему, fill — доля кадра под планету.
 */
export const SHOTS = {
  overview: { kind: 'system', yaw: -0.38, pitch: 0.5, fit: 0.95 },
  ielts: { kind: 'planet', planet: 'ielts', pitch: 0.12, fill: 0.36 },
  sat: { kind: 'planet', planet: 'sat', pitch: 0.16, fill: 0.36 },
  csca: { kind: 'planet', planet: 'csca', pitch: 0.1, fill: 0.36 },
  programming: { kind: 'planet', planet: 'programming', pitch: 0.12, fill: 0.36 },
  network: { kind: 'system', yaw: -0.2, pitch: 1.12, fit: 0.86 },
  farewell: { kind: 'system', yaw: 0.55, pitch: 0.3, fit: 0.62 },
};
