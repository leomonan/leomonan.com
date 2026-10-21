import { ROUTES, SITE_URL } from '../i18n/index.js';
export function GET() {
  const urls = Object.values(ROUTES).flatMap(pages => Object.values(pages));
  return new Response('<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(path => `<url><loc>${SITE_URL}${path}</loc></url>`).join('') + '</urlset>',
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
