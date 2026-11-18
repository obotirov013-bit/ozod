// Точка входа лендинга SkillOrbit.

import { initToasts } from './ui/toast.js';
import { initMenu } from './ui/menu.js';
import { initNavigation } from './ui/navigation.js';
import { initWaitlistForms } from './ui/waitlist.js';
import { fetchWaitlistCount, flushPending } from './api.js';
import { SolarSystem } from './scene/solar-system.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function startScene() {
  const canvas = document.getElementById('orbit-canvas');
  if (!canvas) return null;
  try {
    const scene = new SolarSystem(canvas, {
      sections: [...document.querySelectorAll('[data-shot]')],
      heroCopy: document.querySelector('.hero__copy'),
      header: document.querySelector('[data-header]'),
    });
    // Клик по планете — переход к её разделу (камера сама прилетит к планете)
    scene.onPlanetSelect = (id) => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    };
    scene.start();
    return scene;
  } catch (error) {
    // Без канваса страница остаётся полностью рабочей
    console.warn('[SkillOrbit] canvas scene is disabled:', error);
    return null;
  }
}

async function showWaitlistCount() {
  const el = document.querySelector('[data-waitlist-count]');
  if (!el) return;
  const count = await fetchWaitlistCount();
  if (count === null || count < 1) return;
  el.textContent =
    count === 1 ? '1 student is already waiting.' : `${count.toLocaleString('en-US')} students are already waiting.`;
  el.hidden = false;
}

const scene = startScene();
initToasts();
initMenu();
initNavigation();
initWaitlistForms({
  onJoined: (button) => scene && scene.launchSatellite(button.getBoundingClientRect()),
});

flushPending().then((sent) => {
  if (sent) showWaitlistCount();
});
window.addEventListener('online', () => flushPending());
document.addEventListener('waitlist:joined', showWaitlistCount);
showWaitlistCount();
