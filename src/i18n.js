import en from './locales/en.js';
import es from './locales/es.js';

const dictionaries = { en, es };
const storageKey = 'claywheel-language';
let locale = 'en';
try {
  const saved = localStorage.getItem(storageKey);
  if (saved in dictionaries) locale = saved;
} catch { /* Keep English as the session default when storage is unavailable. */ }

export function getLocale() { return locale; }

export function t(key, values = {}) {
  const message = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((element) => { element.title = t(element.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-language]').forEach((element) => {
    const active = element.dataset.language === locale;
    element.classList.toggle('active', active);
    element.setAttribute('aria-pressed', String(active));
  });
  document.documentElement.lang = locale;
  document.title = t('meta.title');
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = t('meta.description');
}

export function setLocale(next) {
  if (!(next in dictionaries) || next === locale) return false;
  locale = next;
  try { localStorage.setItem(storageKey, locale); } catch { /* Language remains active for this session. */ }
  applyTranslations();
  return true;
}
