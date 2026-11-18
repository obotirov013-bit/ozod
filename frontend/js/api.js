// REST-клиент waitlist + очередь неотправленных заявок.
// Уведомление об успехе показывается сразу, а запрос уходит в фоне; если сеть или сервер
// недоступны, заявка сохраняется в localStorage и отправляется при следующей возможности.

import { API_BASE } from './config.js';

const PENDING_KEY = 'skillorbit:pending-waitlist';

async function request(path, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } catch (error) {
    return { status: 0, ok: false, data: {}, error };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {{ ok: boolean, retry: boolean, data: object }}
 *   retry=true — временная проблема (сеть, 429, 5xx, нет бэкенда): стоит повторить позже.
 */
export async function joinWaitlist(email, source = 'landing') {
  const res = await request('/api/waitlist', { method: 'POST', body: { email, source } });
  if (res.ok) return { ok: true, retry: false, data: res.data };
  const permanent = res.status === 400 || res.status === 422;
  return { ok: false, retry: !permanent, data: res.data };
}

export async function fetchWaitlistCount() {
  const res = await request('/api/waitlist/count', { timeoutMs: 5000 });
  return res.ok && Number.isFinite(res.data.count) ? res.data.count : null;
}

// ---------- очередь неотправленных заявок

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writePending(list) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // localStorage недоступен (приватный режим) — просто не сохраняем
  }
}

export function queuePending(email, source = 'landing') {
  const list = readPending().filter((item) => item.email !== email);
  list.push({ email, source, at: Date.now() });
  writePending(list.slice(-20));
}

let flushing = false;

/** Повторно отправляет сохранённые заявки. Возвращает число успешно отправленных. */
export async function flushPending() {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    const keep = [];
    for (const item of readPending()) {
      const result = await joinWaitlist(item.email, item.source);
      if (result.ok) sent++;
      else if (result.retry) keep.push(item);
    }
    writePending(keep);
  } finally {
    flushing = false;
  }
  return sent;
}
