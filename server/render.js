/**
 * Fragments HTML partagés par les vues.
 *
 * Le contenu critique est rendu côté serveur (SEO — audit §9) ; l'interactivité
 * est ajoutée par les modules de `public/js`. Les données utiles au client sont
 * injectées dans une île `<script type="application/json">` plutôt que
 * refetchées, ce qui évite un aller-retour avant le premier rendu.
 */
import * as store from './store.js';
import { esc, publicCard, summaryProject } from './lib.js';
import { absoluteUrl } from './request-context.js';

/* ------------------------------------------------------------------ */
/* Helpers de fragments                                                */
/* ------------------------------------------------------------------ */

export function head({ title, description, path = '/', ogImage = '', canonical = '' }) {
  const settings = store.getConfig('settings');
  const seo = settings.seo || {};
  const site = settings.site || {};
  const desc = description || seo.defaultDescription || '';
  // `canonical`, `og:url` et `og:image` doivent être absolus : une URL
  // relative est ignorée par les crawlers et les plateformes de partage.
  const url = absoluteUrl(canonical || `${String(site.url || '').replace(/\/$/, '')}${path}`);
  // Repli sur l'image de marque : un partage social sans image n'affiche
  // qu'un bloc de texte, ce qui casse l'identité du studio.
  const image = absoluteUrl(ogImage || seo.ogImage || '/media/og-default.jpg');
  const noindex = path.startsWith('/admin') ? '<meta name="robots" content="noindex, nofollow">' : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title || seo.defaultTitle || 'MONDE-M')}</title>
<meta name="description" content="${esc(desc)}">
${noindex}
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.brand || 'MONDE-M')}">
<meta property="og:title" content="${esc(title || '')}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;1,9..144,300&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">`;
}

export function siteHeader({ path = '', brand = 'MONDE-M' }) {
  const nav = [
    { href: '/', label: 'Accueil' },
    { href: '/projets', label: 'Projets' },
    { href: '/cartes', label: 'Cartes' }
  ];
  return `<header class="site-header"><div class="shell" style="display:flex;align-items:center;justify-content:space-between;gap:1.5rem;width:100%">
  <a class="brand" href="/"><span class="mark" aria-hidden="true"></span><span class="word">${esc(brand)}</span></a>
  <nav class="site-nav" aria-label="Navigation principale">
    ${nav
      .map(
        (item) =>
          `<a href="${item.href}"${
            path === item.href ? ' aria-current="page"' : ''
          }>${esc(item.label)}</a>`
      )
      .join('')}
    <a href="/admin" class="btn btn--ghost btn--sm">Espace éditeur</a>
  </nav>
</div></header>`;
}

export function siteFooter() {
  const settings = store.getConfig('settings');
  const footer = settings.footer || {};
  const site = settings.site || {};
  const links = (footer.links || [])
    .map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`)
    .join(' · ');
  return `<footer class="site-footer"><div class="shell">
  <div class="footer-grid">
    <div>
      <div class="brand" style="margin-bottom:.75rem"><span class="mark" aria-hidden="true"></span><span class="word">${esc(
        site.brand || 'MONDE-M'
      )}</span></div>
      <p class="tiny">${esc(site.baseline || '')}</p>
    </div>
    <div>
      <p class="eyebrow" style="margin-bottom:.75rem">Naviguer</p>
      <p class="small">${links}</p>
    </div>
    <div>
      <p class="eyebrow" style="margin-bottom:.75rem">Contact</p>
      <p class="small">${esc(site.email || '')}</p>
      <p class="tiny">${esc(footer.address || '')}</p>
    </div>
  </div>
  <p class="tiny" style="margin-top:2.5rem">© ${new Date().getFullYear()} ${esc(
    footer.legalName || site.name || 'MONDE-M'
  )}. Une personne, un morceau, une carte.</p>
</div></footer>`;
}

export function jsonIsland(id, data) {
  // Échappement des séquences dangereuses dans un contexte <script>.
  const safe = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/json" id="${esc(id)}">${safe}</script>`;
}

/* ------------------------------------------------------------------ */
/* Fragments de carte                                                  */
/* ------------------------------------------------------------------ */

export function coverBlock(card, { size = '' } = {}) {
  const m = card.music || {};
  const colors = m.coverColors || {};
  const dominant = colors.dominant || '#b5541d';
  const accent = colors.accent || '#141414';
  const initials = String(card.identity?.displayName || card.identity?.firstName || '?')
    .trim()
    .slice(0, 2)
    .toUpperCase();
  const cls = `cover${size ? ` cover--${size}` : ''}`;
  if (m.coverUrl) {
    return `<div class="${cls}"><img src="${esc(m.coverUrl)}" alt="Pochette de ${esc(
      m.trackTitle || ''
    )} par ${esc(m.artist || '')}" loading="lazy" width="400" height="400"></div>`;
  }
  return `<div class="${cls} cover--fallback" role="img" aria-label="Pochette générée pour ${esc(
    m.trackTitle || 'un morceau'
  )}" style="background:linear-gradient(140deg, ${esc(dominant)}, ${esc(accent)});color:rgba(255,255,255,.92)">${esc(
    initials
  )}</div>`;
}

export function cardTile(card) {
  const id = card.identity || {};
  const m = card.music || {};
  const r = card.role || {};
  const track = [m.trackTitle, m.artist].filter(Boolean).join(' · ') || 'Morceau à choisir';
  const sub = [r.label, r.moment].filter(Boolean).join(' · ');
  return `<a class="cover-card" href="/carte/${esc(card.slug)}">
  ${coverBlock(card)}
  <span class="who">${esc(id.displayName || 'Sans nom')}</span>
  <span class="what">${esc(track)}${sub ? `<br>${esc(sub)}` : ''}</span>
</a>`;
}

export function projectTile(project) {
  const colors = project.cover?.colors || {};
  const dominant = colors.dominant || '#b5541d';
  const accent = colors.accent || '#141414';
  const thumb = project.cover?.url
    ? `<div class="project-thumb"><img src="${esc(project.cover.url)}" alt="${esc(
        project.cover.alt || project.title
      )}" loading="lazy" width="480" height="360"></div>`
    : `<div class="project-thumb project-thumb--fallback" role="img" aria-label="${esc(
        project.cover?.alt || project.title
      )}" style="background:linear-gradient(140deg, ${esc(dominant)}, ${esc(accent)})"></div>`;
  const meta = [project.category, project.year, project.client].filter(Boolean).join(' · ');
  return `<a class="project-row" href="/projets/${esc(project.slug)}">
  ${thumb}
  <span class="project-head">
    <span class="project-meta">${esc(meta)}</span>
    <span class="project-title">${esc(project.title)}</span>
    <span class="project-summary">${esc(project.subtitle || project.summary || '')}</span>
  </span>
</a>`;
}

/* ------------------------------------------------------------------ */
/* Données publiques                                                   */
/* ------------------------------------------------------------------ */

export function publishedCards() {
  return store.sorted('cards').filter((c) => c.status === 'published');
}
export function publishedProjects() {
  return store.sorted('projects').filter((x) => x.status === 'published');
}
export function cardBySlug(slug) {
  return store.find('cards', slug);
}
export function projectBySlug(slug) {
  return store.find('projects', slug);
}
export { publicCard, summaryProject };
