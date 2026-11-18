// Где искать бэкенд.
// 1) <meta name="skillorbit-api" content="https://api.example.com"> — явный адрес;
// 2) страница открыта с localhost на другом порту (Live Server и т.п.) — http://localhost:8080;
// 3) иначе тот же origin: Spring Boot сам отдаёт фронтенд.

function resolveApiBase() {
  const meta = document.querySelector('meta[name="skillorbit-api"]');
  const configured = meta ? meta.content.trim() : '';
  if (configured) return configured.replace(/\/+$/, '');

  const { protocol, hostname, port } = window.location;
  if (protocol === 'file:') return 'http://localhost:8080';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (isLocal && port !== '8080') return 'http://localhost:8080';
  return '';
}

export const API_BASE = resolveApiBase();

export function signalingUrl() {
  const base = API_BASE || window.location.origin;
  return `${base.replace(/^http/, 'ws')}/ws/signal`;
}
