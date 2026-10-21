import en from './en.json' with { type: 'json' };
import zh from './zh.json' with { type: 'json' };

export const SITE_URL = 'https://leomonan.com';
export const LOCALES = Object.freeze({
  en: { name: 'English', short: 'EN', lang: 'en', og: 'en_US' },
  zh: { name: '简体中文', short: '中文', lang: 'zh-Hans', og: 'zh_CN' },
});
export const ROUTES = Object.freeze({
  en: { home: '/', aistory: '/aistory' },
  zh: { home: '/zh/', aistory: '/zh/aistory' },
});
const messages = { en, zh };
export function getMessages(locale = 'en') {
  if (!Object.hasOwn(messages, locale)) throw new RangeError('Unsupported locale: ' + locale);
  return messages[locale];
}
export function localizedPath(locale, page) {
  getMessages(locale);
  if (!Object.hasOwn(ROUTES[locale], page)) throw new RangeError('Unknown page: ' + page);
  return ROUTES[locale][page];
}
// Build-time interpolation, never HTML injection.
export function format(message, values) {
  return message.replace(/\{(\w+)\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error('Missing message value: ' + key);
    return String(values[key]);
  });
}
