// Шапка и навигация: фон шапки после прокрутки, подсветка активного раздела,
// перенос фокуса к цели якорной ссылки (для клавиатуры и скринридеров).

export function initNavigation() {
  const header = document.querySelector('[data-header]');

  let ticking = false;
  const updateHeader = () => {
    ticking = false;
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateHeader);
    },
    { passive: true },
  );
  updateHeader();

  const links = [...document.querySelectorAll('[data-nav]')];
  if ('IntersectionObserver' in window && links.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const link of links) {
            const active = link.dataset.nav === entry.target.id;
            link.classList.toggle('is-active', active);
            if (active) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          }
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    document.querySelectorAll('main section[id]').forEach((section) => observer.observe(section));
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  });
}
