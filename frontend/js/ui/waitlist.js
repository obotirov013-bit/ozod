// Формы waitlist.
// Валидация: ошибка появляется только после ухода из поля (blur) или при отправке,
// исчезает сразу при фокусе/вводе. Кнопка никогда не блокируется.
// При корректном email уведомление об успехе показывается сразу, запрос уходит в фоне.

import { joinWaitlist, queuePending } from '../api.js';
import { showToast } from './toast.js';

// Та же проверка, что и на сервере (WaitlistRequest.EMAIL_PATTERN)
const EMAIL_RE = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;

export function validateEmail(raw) {
  const value = raw.trim();
  if (!value) return 'Enter your email to join the waitlist.';
  if (value.length > 254 || !EMAIL_RE.test(value)) return 'Enter an email like name@example.com.';
  return '';
}

export function initWaitlistForms({ onJoined } = {}) {
  document.querySelectorAll('[data-waitlist]').forEach((form) => setupForm(form, onJoined));
}

function setupForm(form, onJoined) {
  const input = form.querySelector('input[type="email"]');
  const msg = form.querySelector('.waitlist__msg');
  const button = form.querySelector('button[type="submit"]');
  if (!input || !msg || !button) return;

  const helper = msg.dataset.helper || '';
  let dirty = false;
  let invalid = false;
  let keepErrorOnFocus = false;

  const field = {
    input,
    showError(text) {
      invalid = true;
      input.setAttribute('aria-invalid', 'true');
      msg.textContent = text;
      msg.classList.add('is-error');
    },
    clearError() {
      invalid = false;
      input.removeAttribute('aria-invalid');
      msg.textContent = helper;
      msg.classList.remove('is-error');
    },
  };

  input.addEventListener('input', () => {
    dirty = true;
    if (invalid) field.clearError();
  });
  input.addEventListener('focus', () => {
    if (invalid && !keepErrorOnFocus) field.clearError();
  });
  input.addEventListener('blur', () => {
    if (!dirty) return;
    const error = validateEmail(input.value);
    if (error) field.showError(error);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = input.value.trim();
    const error = validateEmail(email);
    if (error) {
      field.showError(error);
      keepErrorOnFocus = true;
      input.focus();
      keepErrorOnFocus = false;
      return;
    }

    const toast = showToast({
      title: "You're on the SkillOrbit waitlist",
      text: `We'll email ${email} when early access opens.`,
    });
    form.reset();
    dirty = false;
    field.clearError();
    if (onJoined) onJoined(button);
    submitInBackground(email, toast, field);
  });
}

async function submitInBackground(email, toast, field) {
  const result = await joinWaitlist(email);

  if (result.ok) {
    const { status, position } = result.data || {};
    if (status === 'ALREADY_REGISTERED') {
      toast.update({ text: `${email} is already on the list. We'll email you when early access opens.` });
    } else if (Number.isFinite(position)) {
      toast.update({
        text: `We'll email ${email} when early access opens. You're number ${position.toLocaleString('en-US')} in line.`,
      });
    }
    document.dispatchEvent(new CustomEvent('waitlist:joined', { detail: result.data }));
    return;
  }

  // Сеть или сервер недоступны — тихо повторим позже, заявка не потеряется
  if (result.retry) {
    queuePending(email);
    return;
  }

  // Сервер отклонил адрес: говорим, что произошло, и возвращаем email в поле
  toast.update({
    variant: 'error',
    title: 'This email was not added',
    text: (result.data && result.data.message) || 'Check the address and join again.',
  });
  if (!field.input.value) field.input.value = email;
  field.showError('Enter an email like name@example.com.');
}
