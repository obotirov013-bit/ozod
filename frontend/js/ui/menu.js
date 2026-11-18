// Анимированное бургер-меню для узких экранов.
// Открытое меню — модальная панель: фокус удерживается внутри (вместе с кнопкой-крестиком),
// Escape закрывает, фокус возвращается на бургер, фон помечается inert.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initMenu() {
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (!burger || !menu) return;

  const label = burger.querySelector('[data-burger-label]');
  const background = [document.getElementById('main'), document.querySelector('.site-footer')].filter(Boolean);
  const wide = matchMedia('(min-width: 768px)');
  let open = false;

  // Дальше видимостью управляет класс .is-open — так работает анимация появления
  menu.hidden = false;

  function setOpen(next, { restoreFocus = true } = {}) {
    if (next === open) return;
    open = next;
    burger.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Close menu' : 'Open menu';
    menu.classList.toggle('is-open', open);
    document.documentElement.classList.toggle('is-menu-open', open);
    background.forEach((el) => {
      el.inert = open;
    });

    if (open) {
      menu.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
    } else if (restoreFocus) {
      burger.focus({ preventScroll: true });
    }
  }

  burger.addEventListener('click', () => setOpen(!open));

  // Переход по пункту меню: закрываем без возврата фокуса — он уйдёт к разделу
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false, { restoreFocus: false });
  });

  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;

    const items = [burger, ...menu.querySelectorAll(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!items.includes(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // На широком экране меню не нужно
  wide.addEventListener('change', (event) => {
    if (event.matches) setOpen(false, { restoreFocus: false });
  });
}
