// Уведомления (toast). Регион объявляется скринридерам через role="status".
// Одновременно показывается одно уведомление; оно закрывается само через несколько секунд
// (таймер ставится на паузу, пока на уведомлении курсор или фокус).

const ICONS = {
  success: `<svg class="toast__icon" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="17" fill="none" stroke="currentColor" stroke-opacity=".35"/>
      <ellipse cx="18" cy="18" rx="13" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.4" transform="rotate(-24 18 18)"/>
      <circle cx="18" cy="18" r="4.5" fill="currentColor"/>
      <circle cx="29.3" cy="13.4" r="2.2" fill="currentColor"/>
    </svg>`,
  error: `<svg class="toast__icon" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="17" fill="none" stroke="currentColor" stroke-width="1.4"/>
      <path d="M18 10v10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="18" cy="25.5" r="1.6" fill="currentColor"/>
    </svg>`,
};

const CLOSE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

let region = null;
let current = null;

export function initToasts() {
  region = document.querySelector('[data-toast-region]');
  if (!region) return;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
}

/**
 * @param {{ title: string, text?: string, variant?: 'success' | 'error', duration?: number }} options
 * @returns {{ update(options): void, dismiss(): void }}
 */
export function showToast({ title, text = '', variant = 'success', duration = 6500 }) {
  if (!region) initToasts();
  if (current) current.dismiss(true);

  const el = document.createElement('div');
  el.className = `toast toast--${variant}`;
  el.innerHTML = `${ICONS[variant]}
    <div class="toast__body">
      <p class="toast__title"></p>
      <p class="toast__text"></p>
    </div>
    <button class="toast__close" type="button" aria-label="Dismiss notification">${CLOSE_ICON}</button>`;
  const titleEl = el.querySelector('.toast__title');
  const textEl = el.querySelector('.toast__text');
  titleEl.textContent = title;
  textEl.textContent = text;
  region.append(el);

  // Принудительный reflow, чтобы сработал переход появления
  void el.offsetWidth;
  el.classList.add('is-visible');

  let timer = 0;
  let remaining = duration;
  let startedAt = 0;
  let closed = false;

  const startTimer = () => {
    clearTimeout(timer);
    startedAt = performance.now();
    timer = setTimeout(() => api.dismiss(), remaining);
  };
  const pauseTimer = () => {
    clearTimeout(timer);
    remaining = Math.max(1500, remaining - (performance.now() - startedAt));
  };

  const api = {
    update(next = {}) {
      if (closed) return;
      if (next.variant && next.variant !== variant) {
        el.classList.replace(`toast--${variant}`, `toast--${next.variant}`);
        el.querySelector('.toast__icon').outerHTML = ICONS[next.variant];
        variant = next.variant;
      }
      if (next.title) titleEl.textContent = next.title;
      if (next.text !== undefined) textEl.textContent = next.text;
      remaining = Math.max(remaining, 4000);
      startTimer();
    },
    dismiss(immediate = false) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (current === api) current = null;
      if (immediate) {
        el.remove();
        return;
      }
      el.classList.remove('is-visible');
      const remove = () => el.remove();
      el.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 400);
    },
  };

  el.querySelector('.toast__close').addEventListener('click', () => api.dismiss());
  el.addEventListener('mouseenter', pauseTimer);
  el.addEventListener('mouseleave', startTimer);
  el.addEventListener('focusin', pauseTimer);
  el.addEventListener('focusout', startTimer);

  current = api;
  startTimer();
  return api;
}
