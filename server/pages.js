/**
 * Construction des pages HTML.
 *
 * Chaque vue est rendue côté serveur à partir des données publiées, puis
 * enrichie côté client. Les pages d'administration ne rendent que la coquille
 * et l'îlot de données : leur interface est entièrement pilotée en JS.
 */
import {
  head,
  siteHeader,
  siteFooter,
  jsonIsland,
  coverBlock,
  cardTile,
  projectTile,
  publishedCards,
  publishedProjects,
  cardBySlug,
  projectBySlug
} from './render.js';
import * as store from './store.js';
import { withRequestContext } from './request-context.js';
import { esc, fragmentCard } from './lib.js';

const SETTINGS = () => store.getConfig('settings');
const HERO = () => store.getConfig('hero');

/**
 * three.js est servi en local, plus aucune dépendance à un CDN — c'était le
 * risque de rupture n°1 de l'audit (§11). L'empreinte SRI est calculée au
 * démarrage sur le fichier réellement présent : elle ne peut donc pas se
 * désynchroniser après une mise à jour de la bibliothèque.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { p } from './env.js';

function sriTag(relPath) {
  const file = p('public', relPath.replace(/^\//, ''));
  if (!existsSync(file)) return `<script src="${esc(relPath)}" defer></script>`;
  const hash = createHash('sha384').update(readFileSync(file)).digest('base64');
  return `<script src="${esc(relPath)}" integrity="sha384-${hash}" crossorigin="anonymous" defer></script>`;
}

const THREE_TAG = sriTag('/vendor/three/three.min.js');

function shell({ title, description, path, body, scripts = [], styles = [], data = null, dataId = 'page-data', vendor = [], extraHead = {} }) {
  return `${head({ title, description, path, ...(typeof extraHead === 'object' ? extraHead : {}) })}
${styles.map((s) => `<link rel="stylesheet" href="${s}">`).join('\n')}
</head>
<body>
<a class="skip-link" href="#main">Aller au contenu principal</a>
${vendor.map((v) => (v === 'three' ? THREE_TAG : sriTag(v))).join('\n')}
${body}
${data ? jsonIsland(dataId, data) : ''}
${scripts.map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
</body>
</html>`;
}

/* ================================================================== */
/* ACCUEIL — hero 3D + projets + cartes + étapes                       */
/* ================================================================== */

function home({ isEditor }) {
  const hero = HERO();
  const settings = SETTINGS();
  const site = settings.site || {};
  // Sections masquables depuis Paramètres : chaque drapeau absent vaut « affiché ».
  const sections = settings.sections || {};
  const cards = publishedCards();
  const projects = publishedProjects();
  const palette = hero.palette || {};

  // Application des couleurs pilotées par l'admin, sans toucher au CSS.
  const vars = [
    palette.bg && `--bg:${palette.bg}`,
    palette.ink && `--ink:${palette.ink}`,
    palette.muted && `--muted:${palette.muted}`,
    palette.mutedStrong && `--muted-strong:${palette.mutedStrong}`,
    palette.accents?.[0] && `--accent:${palette.accents[0]}`,
    palette.accents?.[1] && `--accent-alt:${palette.accents[1]}`
  ]
    .filter(Boolean)
    .join(';');

  const max = Number(hero.fragments?.count) || 12;
  const pool = cards.filter((c) => c.publish?.featured);
  const fragments = (pool.length ? pool : cards).slice(0, max).map(fragmentCard);

  const cardList = fragments
    .map(
      (f, i) =>
        `<li><button type="button" data-fragment="${i}">${esc(f.name)}${
          f.track ? ` — ${esc(f.track)}` : ''
        }</button></li>`
    )
    .join('');

  const projectRows = projects.slice(0, 4).map(projectTile).join('');
  const coverCards = cards.slice(0, 8).map(cardTile).join('');

  const steps = [
    {
      num: '01',
      verb: 'Choisir',
      title: 'Un morceau par personne',
      text:
        'La pochette devient l’identité : c’est elle qu’on reconnaît dans la scène, elle qui colore le fragment en orbite. Ni photo imposée, ni initiale.'
    },
    {
      num: '02',
      verb: 'Composer',
      title: 'Une carte, pas un formulaire',
      text:
        'Un rôle, une phrase, un moment. La carte porte l’essentiel — identité, contact, morceau, rôle, présence — et rien de plus.'
    },
    {
      num: '03',
      verb: 'Publier',
      title: 'Depuis l’espace éditeur',
      text:
        'Projets et cartes se publient, s’ordonnent et se rattachent les uns aux autres. Le hero reflète immédiatement ce qui est publié.'
    },
    {
      num: '04',
      verb: 'Écouter',
      title: 'L’extrait démarre au clic',
      text:
        'Chaque carte s’écoute en extrait. Le son pilote la lumière du fragment : la scène réagit à ce qu’elle affiche.'
    }
  ]
    .map(
      (s) => `<article class="step">
      <span class="step-num">${s.num}</span>
      <span class="step-verb">${s.verb}</span>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.text)}</p>
    </article>`
    )
    .join('');

  const body = `
<canvas id="scene-canvas" role="img" aria-label="Scène trois dimensions : une forme centrale qui respire, entourée de fragments en orbite. Chaque fragment représente une personne et son morceau."></canvas>
<div class="hero-scrim" aria-hidden="true"></div>

${siteHeader({ path: '/', brand: site.brand || 'MONDE-M' })}

<main id="main">
<section class="hero shell" style="${vars ? `--hero-vars:1;` : ''}">
  <div class="hero-meta fade-in" style="animation-delay:.15s">
    ${esc(site.baseline || 'STUDIO — 3D')}<br>
    <span class="chip">FORME&nbsp;·&nbsp;<b id="scene-state">ICOSPHÈRE</b></span>
  </div>

  <div class="hero-body fade-in" style="animation-delay:.3s">
    <p class="eyebrow">${esc(hero.eyebrow || '')}</p>
    <h1>${esc(hero.title || '')}<br><em>${esc(hero.titleAccent || '')}</em></h1>
    <p class="desc">${esc(hero.description || '')}</p>
    <div class="hero-cta">
      <button class="btn" id="morphBtn" type="button"><span class="dot" aria-hidden="true"></span>${esc(
        hero.ctaLabel || 'Lancer la transformation'
      )}</button>
      ${
        hero.secondaryCta?.href
          ? `<a class="btn btn--ghost" href="${esc(hero.secondaryCta.href)}">${esc(
              hero.secondaryCta.label || 'Voir les cartes'
            )}</a>`
          : ''
      }
    </div>
    <ul class="hero-cardlist visually-hidden-focusable" id="fragmentList" aria-label="Personnes présentes dans la scène">
      ${cardList}
    </ul>
  </div>

  <p class="hero-hint fade-in" style="animation-delay:.45s">
    Glisser — explorer<br>Molette — zoom<br>Clic sur un fragment — écouter
  </p>
</section>

<div id="tooltip" role="status" aria-live="polite">FRAGMENT</div>
<div class="panel-backdrop" id="panelBackdrop" hidden></div>
<aside class="card-panel" id="cardPanel" role="dialog" aria-modal="false" aria-labelledby="panelTitle" aria-hidden="true">
  <div class="card-panel-head">
    <span class="eyebrow">Carte</span>
    <button class="card-panel-close" type="button" id="panelClose" aria-label="Fermer le panneau">×</button>
  </div>
  <div class="card-panel-body" id="panelBody"></div>
</aside>

<div class="page-content">
  ${
    sections.showProjects !== false
      ? `<section class="section shell">
    <div class="section-head">
      <span class="section-num">01 — PROJETS</span>
      <h2>Ce que nous publions.</h2>
      <p class="lede">Installations, identités, films et éditions. Chaque projet cite les personnes qui l’ont fait — et chaque personne a son morceau.</p>
    </div>
    <div class="project-list">
      ${projectRows || '<p class="muted">Aucun projet publié pour le moment.</p>'}
    </div>
    <p style="margin-top:2rem"><a class="btn btn--ghost btn--sm" href="/projets">Tous les projets</a></p>
  </section>`
      : ''
  }

  ${
    sections.showCards !== false
      ? `<section class="section shell">
    <div class="section-head">
      <span class="section-num">02 — CARTES</span>
      <h2>Une personne. Un morceau. Une carte.</h2>
      <p class="lede">Fini les listes tenues séparément. La carte porte l’identité, le contact, le rôle, les disponibilités et le morceau — et la pochette devient le visage.</p>
    </div>
    <div class="cover-wall">
      ${coverCards || '<p class="muted">Aucune carte publiée pour le moment.</p>'}
    </div>
    <p style="margin-top:2rem"><a class="btn btn--ghost btn--sm" href="/cartes">Voir toutes les cartes</a></p>
  </section>`
      : ''
  }

  ${
    sections.showSteps !== false
      ? `<section class="section shell">
    <div class="section-head">
      <span class="section-num">03 — MÉTHODE</span>
      <h2>Comment une carte prend vie.</h2>
    </div>
    <div class="steps">${steps}</div>
  </section>`
      : ''
  }
</div>
</main>

${sections.showFooter !== false ? siteFooter() : ''}
`;

  return shell({
    title: `${site.brand || 'MONDE-M'} — ${hero.title || ''} ${hero.titleAccent || ''}`.replace(/\s+/g, ' ').trim(),
    description: site.description,
    path: '/',
    body,
    styles: ['/css/hero.css', '/css/site.css'],
    scripts: ['/js/hero.js'],
    vendor: ['three'],
    data: { hero, fragments, cards: cards.map(publicSafe), projects: projects.map(summarySafe) },
    dataId: 'hero-data'
  });
}

function publicSafe(card) {
  const c = { ...card };
  const contact = { ...c.contact };
  if (!contact.emailPublic) delete contact.email;
  if (!contact.phonePublic) delete contact.phone;
  if (!contact.addressPublic) delete contact.address;
  delete contact.emailPublic;
  delete contact.phonePublic;
  delete contact.addressPublic;
  if (c.identity) delete c.identity.birthdate;
  c.publish = { order: c.publish?.order, featured: c.publish?.featured, publicUrl: c.publish?.publicUrl };
  return c;
}
function summarySafe(project) {
  const { body, gallery, ...rest } = project;
  return rest;
}

/* ================================================================== */
/* PROJETS — liste et détail                                           */
/* ================================================================== */

function projects({ query }) {
  const site = SETTINGS().site || {};
  let items = publishedProjects();
  const categories = [...new Set(items.map((x) => x.category).filter(Boolean))].sort();
  const active = String(query.category || '');
  const q = String(query.q || '').toLowerCase();
  if (active) items = items.filter((x) => x.category === active);
  if (q) {
    items = items.filter((x) =>
      [x.title, x.subtitle, x.summary, x.client, ...(x.tags || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }

  const filters = [
    `<a class="filter-btn${!active ? ' is-active' : ''}" href="/projets">Tous</a>`,
    ...categories.map(
      (c) =>
        `<a class="filter-btn${active === c ? ' is-active' : ''}" href="/projets?category=${encodeURIComponent(
          c
        )}">${esc(c)}</a>`
    )
  ].join('');

  const body = `${siteHeader({ path: '/projets', brand: site.brand || 'MONDE-M' })}
<main id="main" class="shell">
  <section class="section">
    <div class="section-head">
      <span class="section-num">PROJETS</span>
      <h1>Ce que nous publions.</h1>
      <p class="lede">${items.length} projet${items.length > 1 ? 's' : ''} publié${
    items.length > 1 ? 's' : ''
  }.</p>
    </div>
    <div class="filters">${filters}
      <form class="search-field" action="/projets" method="get" role="search">
        <label class="visually-hidden" for="q">Rechercher un projet</label>
        <input id="q" name="q" type="search" placeholder="Rechercher…" value="${esc(query.q || '')}">
        ${active ? `<input type="hidden" name="category" value="${esc(active)}">` : ''}
      </form>
    </div>
    <div class="project-list">
      ${items.map(projectTile).join('') || '<div class="empty"><p>Aucun projet ne correspond.</p><a class="btn btn--sm" href="/projets">Réinitialiser</a></div>'}
    </div>
  </section>
</main>
${siteFooter()}`;

  return shell({
    title: 'Projets · MONDE-M',
    description: 'Tous les projets publiés par le studio MONDE-M.',
    path: '/projets',
    body,
    styles: ['/css/site.css']
  });
}

function project({ slug, preview = false, isEditor = false, res }) {
  const site = SETTINGS().site || {};
  const item = projectBySlug(slug);
  if (!item || (item.status !== 'published' && !(preview && isEditor))) {
    // Sans ce statut, un brouillon renvoyait une page 404 en HTTP 200 :
    // invisible pour les robots et trompeur pour la surveillance.
    res?.status?.(404);
    return notfound({ path: `/projets/${slug}` });
  }

  const colors = item.cover?.colors || {};
  const cover = item.cover?.url
    ? `<div class="detail-cover"><img src="${esc(item.cover.url)}" alt="${esc(
        item.cover.alt || item.title
      )}" width="900" height="900"></div>`
    : `<div class="detail-cover" role="img" aria-label="${esc(
        item.cover?.alt || item.title
      )}" style="background:linear-gradient(140deg, ${esc(colors.dominant || '#b5541d')}, ${esc(
        colors.accent || '#141414'
      )})"></div>`;

  const credits = (item.credits || [])
    .map((credit) => {
      const card = credit.cardId ? store.findById('cards', credit.cardId) : null;
      if (!card) {
        return `<div class="credit"><span class="credit-cover" style="background:var(--bg-sunken)"></span><span><strong>${esc(
          credit.name || ''
        )}</strong><br><span class="tiny">${esc(credit.role || '')}</span></span></div>`;
      }
      return `<a class="credit" href="/carte/${esc(card.slug)}">
        <span class="credit-cover">${coverBlock(card)}</span>
        <span><strong>${esc(card.identity?.displayName || credit.name)}</strong><br>
        <span class="tiny">${esc(credit.role || card.role?.label || '')}${
        card.music?.trackTitle ? ` · ${esc(card.music.trackTitle)}` : ''
      }</span></span>
      </a>`;
    })
    .join('');

  const facts = [
    ['Client', item.client],
    ['Année', item.year],
    ['Catégorie', item.category],
    ['Date', item.date]
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`)
    .join('');

  const links = (item.links || [])
    .filter((l) => l.url)
    .map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label || l.url)} →</a></li>`)
    .join('');

  const paragraphs = String(item.body || '')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const gallery = (item.gallery || [])
    .filter((g) => g.url)
    .map(
      (g) => `<figure><img src="${esc(g.url)}" alt="${esc(g.alt || '')}" loading="lazy">${
        g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''
      }</figure>`
    )
    .join('');

  const related = publishedProjects()
    .filter((x) => x.id !== item.id)
    .slice(0, 3)
    .map(projectTile)
    .join('');

  const body = `${siteHeader({ path: '/projets', brand: site.brand || 'MONDE-M' })}
<main id="main" class="shell">
  ${
    item.status !== 'published'
      ? '<div class="section"><p class="notice notice--warn">Aperçu éditeur — ce projet n’est pas publié.</p></div>'
      : ''
  }
  <section class="detail-hero">
    <div class="stack">
      <span class="eyebrow">${esc(item.category || '')}${item.year ? ` · ${esc(String(item.year))}` : ''}</span>
      <h1>${esc(item.title)}</h1>
      <p class="lede">${esc(item.subtitle || '')}</p>
      ${facts ? `<dl class="fact-list">${facts}</dl>` : ''}
      ${links ? `<ul class="link-list">${links}</ul>` : ''}
    </div>
    ${cover}
  </section>

  ${paragraphs ? `<section class="section"><div class="prose">${paragraphs}</div></section>` : ''}
  ${gallery ? `<section class="section"><h2 class="eyebrow" style="margin-bottom:1.5rem">Galerie</h2><div class="gallery">${gallery}</div></section>` : ''}
  ${credits ? `<section class="section"><div class="section-head"><span class="section-num">CRÉDITS</span><h2>Les personnes derrière.</h2><p class="lede">Chaque crédit pointe vers une carte : son morceau, son rôle, sa présence.</p></div><div class="credits">${credits}</div></section>` : ''}
  ${related ? `<section class="section"><div class="section-head"><span class="section-num">SUITE</span><h2>Autres projets.</h2></div><div class="project-list">${related}</div></section>` : ''}
</main>
${siteFooter()}`;

  return shell({
    title: item.seo?.title || `${item.title} · MONDE-M`,
    description: item.seo?.description || item.summary,
    path: `/projets/${item.slug}`,
    ogImage: item.seo?.ogImage || item.cover?.url || '',
    body,
    styles: ['/css/site.css'],
    extraHead: item.seo?.noindex ? { noindex: true } : {}
  });
}

/* ================================================================== */
/* CARTES — mur, timeline, détail                                      */
/* ================================================================== */

function cards({ query }) {
  const site = SETTINGS().site || {};
  let items = publishedCards();
  const roles = [...new Set(items.map((c) => c.role?.label).filter(Boolean))].sort();
  const active = String(query.role || '');
  const view = String(query.vue || 'mur');
  const q = String(query.q || '').toLowerCase();
  if (active) {
    items = items.filter(
      (c) => c.role?.label === active || String(c.role?.type || '') === active
    );
  }
  if (q) {
    items = items.filter((c) =>
      [c.identity?.displayName, c.music?.trackTitle, c.music?.artist, c.role?.label, c.identity?.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }

  const filters = [
    `<a class="filter-btn${!active ? ' is-active' : ''}" href="/cartes">Toutes</a>`,
    ...roles.map(
      (r) =>
        `<a class="filter-btn${active === r ? ' is-active' : ''}" href="/cartes?role=${encodeURIComponent(
          r
        )}">${esc(r)}</a>`
    )
  ].join('');

  const wall = items.map(cardTile).join('');

  const timeline = items
    .filter((c) => c.role?.momentStart || c.presence?.arrival)
    .sort((a, b) =>
      String(a.role?.momentStart || a.presence?.arrival || '').localeCompare(
        String(b.role?.momentStart || b.presence?.arrival || '')
      )
    )
    .map((c) => {
      const time = c.role?.momentStart || c.presence?.arrival || '';
      return `<div class="timeline-item">
        <span class="timeline-time">${esc(time)}</span>
        <a href="/carte/${esc(c.slug)}" style="display:flex;gap:1rem;align-items:center;text-decoration:none">
          <span class="timeline-cover">${coverBlock(c)}</span>
          <span>
            <strong>${esc(c.identity?.displayName || '')}</strong><br>
            <span class="tiny">${esc([c.music?.trackTitle, c.music?.artist].filter(Boolean).join(' · '))}${
        c.role?.moment ? ` — ${esc(c.role.moment)}` : ''
      }</span>
          </span>
        </a>
      </div>`;
    })
    .join('');

  const body = `${siteHeader({ path: '/cartes', brand: site.brand || 'MONDE-M' })}
<main id="main" class="shell">
  <section class="section">
    <div class="section-head">
      <span class="section-num">CARTES MUSICALES</span>
      <h1>Une personne. Un morceau. Une carte.</h1>
      <p class="lede">Chaque carte réunit l’identité, le contact, le rôle, les disponibilités et le morceau d’une personne. La pochette devient son visage.</p>
    </div>
    <div class="filters">
      ${filters}
      <span style="flex:1"></span>
      <a class="filter-btn${view === 'mur' ? ' is-active' : ''}" href="/cartes?vue=mur${
    active ? `&role=${encodeURIComponent(active)}` : ''
  }">Mur</a>
      <a class="filter-btn${view === 'timeline' ? ' is-active' : ''}" href="/cartes?vue=timeline${
    active ? `&role=${encodeURIComponent(active)}` : ''
  }">Timeline</a>
      <form class="search-field" action="/cartes" method="get" role="search">
        <label class="visually-hidden" for="q">Rechercher une carte</label>
        <input id="q" name="q" type="search" placeholder="Nom, morceau, ville…" value="${esc(query.q || '')}">
        <input type="hidden" name="vue" value="${esc(view)}">
      </form>
    </div>
    ${
      view === 'timeline'
        ? timeline
          ? `<div class="timeline">${timeline}</div>`
          : '<div class="empty"><p>Aucune carte n’indique de moment pour l’instant.</p></div>'
        : wall || '<div class="empty"><p>Aucune carte ne correspond.</p></div>'
    }
    <p style="margin-top:2.5rem" class="tiny">${items.length} carte${
    items.length > 1 ? 's' : ''
  } affichée${items.length > 1 ? 's' : ''}.</p>
  </section>
</main>
${siteFooter()}`;

  return shell({
    title: 'Cartes musicales · MONDE-M',
    description:
      'Toutes les cartes musicales publiées : une personne, un morceau, une pochette, un rôle et des disponibilités.',
    path: '/cartes',
    body,
    styles: ['/css/site.css']
  });
}

function card({ slug, preview = false, isEditor = false, res }) {
  const site = SETTINGS().site || {};
  const item = cardBySlug(slug);
  if (!item || (item.status !== 'published' && !(preview && isEditor))) {
    res?.status?.(404);
    return notfound({ path: `/carte/${slug}` });
  }

  const id = item.identity || {};
  const m = item.music || {};
  const r = item.role || {};
  const pr = item.presence || {};
  const c = item.contact || {};
  const related = publishedProjects().filter((x) => (r.projectIds || []).includes(x.id));

  const socials = (c.socials || [])
    .filter((s) => s.url)
    .map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label || s.url)} →</a></li>`)
    .join('');

  const external = Object.entries(m.external || {})
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<li><a href="${esc(v)}" rel="noopener">${esc(
          k.charAt(0).toUpperCase() + k.slice(1)
        )} →</a></li>`
    )
    .join('');

  const facts = [
    ['Rôle', r.label],
    ['Organisation', r.organization],
    ['Moment', [r.moment, r.momentStart].filter(Boolean).join(' · ')],
    ['Ville', [id.city, id.country].filter(Boolean).join(', ')],
    ['Présence', pr.rsvp && pr.rsvp !== 'pending' ? prsvp(pr.rsvp) : ''],
    ['Arrivée', pr.arrival],
    ['Départ', pr.departure],
    ['Accompagnants', pr.companions ? String(pr.companions) : ''],
    ['Table', pr.table],
    ['Groupe', pr.group],
    ['Régime', pr.dietary],
    ['Accessibilité', pr.accessibility]
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`)
    .join('');

  const trackFacts = [
    ['Album', m.album],
    ['Année', m.year],
    ['Genre', m.genre],
    ['Tempo', m.bpm ? `${m.bpm} BPM` : ''],
    ['Tonalité', m.key],
    ['Durée', m.duration ? fmtDuration(m.duration) : ''],
    ['ISRC', m.isrc]
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`)
    .join('');

  const body = `${siteHeader({ path: '/cartes', brand: site.brand || 'MONDE-M' })}
<main id="main" class="shell">
  ${
    item.status !== 'published'
      ? '<div class="section"><p class="notice notice--warn">Aperçu éditeur — cette carte n’est pas publiée.</p></div>'
      : ''
  }
  <section class="detail-hero">
    <div class="stack">
      <span class="eyebrow">${esc(r.label || 'Carte')}</span>
      <h1>${esc(id.displayName || 'Sans nom')}</h1>
      ${id.tagline ? `<p class="lede">${esc(id.tagline)}</p>` : ''}
      ${id.bio ? `<p class="muted">${esc(id.bio)}</p>` : ''}

      <div class="player" data-card="${esc(item.slug)}" data-bpm="${esc(m.bpm || 100)}" data-key="${esc(
    m.key || ''
  )}" data-preview='${esc(JSON.stringify(m.preview || {}))}' data-src="${esc(m.preview?.url || '')}">
        <div class="player-row">
          <button class="play-btn" type="button" aria-pressed="false" aria-label="Écouter l’extrait">
            <svg class="icon-play" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M0 0l14 8-14 8z" fill="currentColor"/></svg>
            <svg class="icon-pause" width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><rect width="4" height="16" fill="currentColor"/><rect x="8" width="4" height="16" fill="currentColor"/></svg>
          </button>
          <div style="flex:1">
            <strong>${esc(m.trackTitle || 'Morceau à choisir')}</strong>
            <div class="tiny">${esc([m.artist, m.album].filter(Boolean).join(' — '))}</div>
          </div>
        </div>
        <div class="progress" role="progressbar" aria-label="Progression de l’extrait" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill"></div></div>
        <div class="visualizer" aria-hidden="true">${'<span></span>'.repeat(24)}</div>
        ${m.note ? `<p class="tiny" style="font-style:italic">« ${esc(m.note)} »</p>` : ''}
      </div>

      ${external ? `<ul class="link-list">${external}</ul>` : ''}
      ${(c.email || c.phone || c.website || socials) ? `<ul class="link-list">
        ${c.email ? `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : ''}
        ${c.phone ? `<li><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></li>` : ''}
        ${c.website ? `<li><a href="${esc(c.website)}" rel="noopener">Site →</a></li>` : ''}
        ${socials}
      </ul>` : ''}
    </div>
    ${coverBlock(item)}
  </section>

  ${trackFacts ? `<section class="section"><div class="section-head"><span class="section-num">MORCEAU</span><h2>${esc(
    m.trackTitle || ''
  )}</h2></div><dl class="fact-list">${trackFacts}</dl></section>` : ''}
  ${facts ? `<section class="section"><div class="section-head"><span class="section-num">LA PERSONNE</span><h2>Rôle, présence, informations.</h2></div><dl class="fact-list">${facts}</dl></section>` : ''}
  ${
    related.length
      ? `<section class="section"><div class="section-head"><span class="section-num">PROJETS</span><h2>Où cette carte intervient.</h2></div><div class="project-list">${related
          .map(projectTile)
          .join('')}</div></section>`
      : ''
  }
</main>
${siteFooter()}`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: id.displayName || '',
    jobTitle: r.label || '',
    ...(id.city ? { address: { '@type': 'PostalAddress', addressLocality: id.city, addressCountry: id.country || 'France' } } : {}),
    ...(m.trackTitle
      ? {
          knowsAbout: {
            '@type': 'MusicRecording',
            name: m.trackTitle,
            byArtist: { '@type': 'MusicGroup', name: m.artist || '' },
            inAlbum: m.album || undefined,
            duration: m.duration ? `PT${Math.round(m.duration / 60)}M${m.duration % 60}S` : undefined
          }
        }
      : {})
  };

  return shell({
    title: item.publish?.seo?.title || `${id.displayName || 'Carte'} — ${m.trackTitle || ''} · MONDE-M`.replace(/\s+/g, ' '),
    description:
      item.publish?.seo?.description ||
      `${[r.label, m.trackTitle && `${m.trackTitle} — ${m.artist}`].filter(Boolean).join(' · ')}`,
    path: `/carte/${item.slug}`,
    ogImage: m.coverUrl || item.publish?.seo?.ogImage || '',
    body: `${body}<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
    styles: ['/css/site.css'],
    scripts: ['/js/player.js']
  });
}

function prsvp(v) {
  return { confirmed: 'Confirmée', maybe: 'Peut-être', declined: 'Absente', pending: 'En attente' }[v] || v;
}
function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/* ================================================================== */
/* REMPLISSAGE PAR LIEN PRIVÉ — sans compte                            */
/* ================================================================== */

function cardFill({ token }) {
  const site = SETTINGS().site || {};
  const found = store.all('cards').find((c) => c.publish?.shareToken === token && c.publish?.shareEnabled);
  if (!found) {
    return shell({
      title: 'Lien invalide · MONDE-M',
      path: '/carte/r/invalide',
      styles: ['/css/site.css'],
      body: `${siteHeader({ brand: site.brand || 'MONDE-M' })}
<main id="main" class="shell shell-narrow"><section class="section">
  <h1>Ce lien n’est plus valide.</h1>
  <p class="lede">Il a peut-être expiré ou été régénéré. Demandez un nouveau lien à la personne qui vous l’a envoyé.</p>
  <p style="margin-top:2rem"><a class="btn" href="/">Retour à l’accueil</a></p>
</section></main>${siteFooter()}`
    });
  }

  const c = found;
  const m = c.music || {};
  const moments = ['ceremonie', 'cocktail', 'diner', 'soiree', 'nuit', 'conception', 'rendu', 'diffusion'];

  const body = `${siteHeader({ brand: site.brand || 'MONDE-M' })}
<main id="main" class="shell shell-narrow">
<section class="section">
  <div class="section-head">
    <span class="section-num">MA CARTE</span>
    <h1>Trois étapes, et c’est fini.</h1>
    <p class="lede">Choisis ton morceau, dis quel est ton rôle, indique quand tu seras là. La carte porte l’essentiel — pas un formulaire.</p>
  </div>

  <div id="fillStatus" role="status" aria-live="polite"></div>

  <form class="fill-form" id="fillForm" data-token="${esc(token)}" novalidate>
    <fieldset class="fieldset">
      <legend>01 — Ton morceau</legend>
      <div class="field-grid">
        <div class="field">
          <label for="trackTitle">Titre</label>
          <input id="trackTitle" name="trackTitle" type="text" value="${esc(m.trackTitle || '')}" autocomplete="off">
        </div>
        <div class="field">
          <label for="artist">Artiste</label>
          <input id="artist" name="artist" type="text" value="${esc(m.artist || '')}" autocomplete="off">
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="album">Album</label>
          <input id="album" name="album" type="text" value="${esc(m.album || '')}">
        </div>
        <div class="field">
          <label for="genre">Genre</label>
          <input id="genre" name="genre" type="text" value="${esc(m.genre || '')}">
        </div>
      </div>
      <div class="field">
        <label for="note">Une phrase sur ce morceau, si tu veux</label>
        <textarea id="note" name="note" maxlength="400">${esc(m.note || '')}</textarea>
        <span class="hint">Pourquoi celui-là, à quel moment il doit passer, à quel volume.</span>
      </div>
      <div class="field">
        <label for="spotify">Lien d’écoute (Spotify, Deezer, Apple, YouTube)</label>
        <input id="spotify" name="spotify" type="url" placeholder="https://…" value="${esc(
          m.external?.spotify || ''
        )}">
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend>02 — Qui tu es</legend>
      <div class="field-grid">
        <div class="field">
          <label for="displayName">Nom affiché</label>
          <input id="displayName" name="displayName" type="text" value="${esc(
            c.identity?.displayName || ''
          )}" required>
        </div>
        <div class="field">
          <label for="roleLabel">Ton rôle</label>
          <input id="roleLabel" name="roleLabel" type="text" value="${esc(c.role?.label || '')}" placeholder="Témoin, invité, photographe…">
        </div>
      </div>
      <div class="field">
        <label for="bio">Une phrase</label>
        <textarea id="bio" name="bio" maxlength="600">${esc(c.identity?.bio || '')}</textarea>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" value="${esc(c.contact?.email || '')}" autocomplete="email">
        </div>
        <div class="field">
          <label for="phone">Téléphone</label>
          <input id="phone" name="phone" type="tel" value="${esc(c.contact?.phone || '')}" autocomplete="tel">
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="city">Ville</label>
          <input id="city" name="city" type="text" value="${esc(c.identity?.city || '')}">
        </div>
        <div class="field">
          <label for="dietary">Régime alimentaire</label>
          <input id="dietary" name="dietary" type="text" value="${esc(c.presence?.dietary || '')}" placeholder="Végétarien, sans gluten…">
        </div>
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend>03 — Quand tu seras là</legend>
      <div class="field">
        <span class="label" id="rsvpLabel">Ta réponse</span>
        <div class="rsvp-group" role="radiogroup" aria-labelledby="rsvpLabel">
          ${['confirmed', 'maybe', 'declined']
            .map(
              (v, i) => `<label><input type="radio" name="rsvp" value="${v}"${
            (c.presence?.rsvp || 'confirmed') === v ? ' checked' : ''
          }><span>${['Je serai là', 'Peut-être', 'Je ne peux pas'][i]}</span></label>`
            )
            .join('')}
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="arrival">J’arrive à</label>
          <input id="arrival" name="arrival" type="time" value="${esc(c.presence?.arrival || '')}">
        </div>
        <div class="field">
          <label for="departure">Je repars vers</label>
          <input id="departure" name="departure" type="time" value="${esc(c.presence?.departure || '')}">
        </div>
        <div class="field">
          <label for="companions">Nombre de personnes avec moi</label>
          <input id="companions" name="companions" type="number" min="0" max="50" value="${esc(
            String(c.presence?.companions ?? 0)
          )}">
        </div>
      </div>
      <div class="field">
        <span class="label" id="momentsLabel">Pour quels moments</span>
        <div class="moment-chips" role="group" aria-labelledby="momentsLabel">
          ${moments
            .map(
              (mo) => `<label><input type="checkbox" name="attendMoments" value="${mo}"${
            (c.presence?.attendMoments || []).includes(mo) ? ' checked' : ''
          }>${esc(mo)}</label>`
            )
            .join('')}
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="transportMode">Je viens en</label>
          <input id="transportMode" name="transportMode" type="text" value="${esc(
            c.presence?.transport?.mode || ''
          )}" placeholder="Voiture, train…">
        </div>
        <div class="field">
          <label for="transportFrom">Depuis</label>
          <input id="transportFrom" name="transportFrom" type="text" value="${esc(
            c.presence?.transport?.from || ''
          )}">
        </div>
        <div class="field">
          <label for="seats">Places disponibles</label>
          <input id="seats" name="seats" type="number" min="0" max="20" value="${esc(
            String(c.presence?.transport?.seats ?? 0)
          )}">
        </div>
      </div>
    </fieldset>

    <div class="row" style="justify-content:space-between">
      <p class="tiny" style="max-width:24rem">Aucun compte à créer. Ces informations ne sont visibles que par l’organisateur, sauf mention contraire.</p>
      <button class="btn" type="submit"><span class="dot" aria-hidden="true"></span>Enregistrer ma carte</button>
    </div>
  </form>
</section>
</main>
${siteFooter()}`;

  return shell({
    title: 'Compléter ma carte · MONDE-M',
    description: 'Choisis ton morceau, ton rôle et tes disponibilités. Aucun compte nécessaire.',
    path: '/carte/r/',
    body,
    styles: ['/css/site.css'],
    scripts: ['/js/fill.js']
  });
}

/* ================================================================== */
/* ADMIN — coquille + îlot de données                                  */
/* ================================================================== */

function adminShell({ title, view, email = '', extra = {} }) {
  const body = `<div class="admin" data-view="${esc(view)}" data-email="${esc(email)}">
  <aside class="admin-side">
    <a class="admin-brand" href="/admin"><span class="mark" aria-hidden="true"></span><span>MONDE-M</span><em>éditeur</em></a>
    <nav class="admin-nav" aria-label="Navigation éditeur">
      <a href="/admin" data-nav="dashboard">Tableau de bord</a>
      <a href="/admin/projets" data-nav="projects">Projets</a>
      <a href="/admin/cartes" data-nav="cards">Cartes</a>
      <a href="/admin/hero" data-nav="hero">Hero 3D</a>
      <a href="/admin/parametres" data-nav="settings">Paramètres</a>
    </nav>
    <div class="admin-side-foot">
      <a class="admin-view-site" href="/" target="_blank" rel="noopener">Voir le site ↗</a>
      <form method="dialog" id="logoutForm"><button type="button" class="admin-logout" id="logoutBtn">Se déconnecter</button></form>
      <p class="admin-user">${esc(email)}</p>
    </div>
  </aside>
  <main class="admin-main" id="adminMain" tabindex="-1"></main>
</div>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin-body">
<a class="skip-link" href="#adminMain">Aller au contenu principal</a>
${body}
${jsonIsland('admin-data', { view, email, ...extra })}
${THREE_TAG}
<script type="module" src="/js/admin/app.js"></script>
</body>
</html>`;
}

function adminLogin({ query, isEditor }) {
  if (isEditor) return null; // redirigé par le routeur
  const redirect = String(query.redirect || '/admin');
  const body = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connexion éditeur · MONDE-M</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin-body login-body">
<main class="login-wrap">
  <div class="login-card">
    <div class="login-brand"><span class="mark" aria-hidden="true"></span><span>MONDE-M</span></div>
    <h1>Espace éditeur</h1>
    <p class="tiny" style="margin-bottom:1.5rem">Publier des projets, composer les cartes musicales et régler le hero.</p>
    <div id="loginStatus" role="status" aria-live="polite"></div>
    <form id="loginForm" class="stack" data-redirect="${esc(redirect)}" novalidate>
      <div class="field">
        <label for="email">Adresse e-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="password">Mot de passe</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn" type="submit" style="justify-content:center"><span class="dot" aria-hidden="true"></span>Se connecter</button>
    </form>
    <p class="tiny" style="margin-top:1.5rem"><a href="/">← Retour au site</a></p>
  </div>
</main>
<script type="module" src="/js/admin/login.js"></script>
</body>
</html>`;
  return body;
}

function notfound({ path }) {
  const site = SETTINGS().site || {};
  return shell({
    title: 'Page introuvable · MONDE-M',
    path,
    styles: ['/css/site.css'],
    body: `${siteHeader({ brand: site.brand || 'MONDE-M' })}
<main id="main" class="shell shell-narrow"><section class="section">
  <span class="section-num">404</span>
  <h1>Page introuvable.</h1>
  <p class="lede">Cette page n’existe pas ou a été déplacée.</p>
  <p style="margin-top:2rem" class="row">
    <a class="btn" href="/">Retour à l’accueil</a>
    <a class="btn btn--ghost" href="/cartes">Voir les cartes</a>
  </p>
</section></main>${siteFooter()}`
  });
}

/* ================================================================== */
/* Aiguillage                                                          */
/* ================================================================== */

const VIEWS = {
  home,
  projects,
  project,
  cards,
  card,
  'card-fill': cardFill,
  'admin-login': adminLogin,
  'admin-dashboard': (ctx) => adminShell({ title: 'Tableau de bord · MONDE-M', view: 'dashboard', email: ctx.email }),
  'admin-projects': (ctx) => adminShell({ title: 'Projets · MONDE-M', view: 'projects', email: ctx.email }),
  'admin-cards': (ctx) => adminShell({ title: 'Cartes · MONDE-M', view: 'cards', email: ctx.email }),
  'admin-hero': (ctx) => adminShell({ title: 'Hero 3D · MONDE-M', view: 'hero', email: ctx.email }),
  'admin-settings': (ctx) => adminShell({ title: 'Paramètres · MONDE-M', view: 'settings', email: ctx.email }),
  notfound
};

export function renderPage(res, viewName, ctx = {}) {
  const builder = VIEWS[viewName] || notfound;
  let html;
  try {
    // `res` est passé aux vues pour qu'elles puissent poser un statut HTTP
    // (404 sur un brouillon consulté sans droits) avant le rendu.
    // Le contexte de requête rend `canonical`, `og:url` et `og:image`
    // absolus même quand `settings.site.url` est vide (audit §9).
    html = withRequestContext(res.req, () => builder({ ...ctx, res }));
  } catch (err) {
    console.error(`[render] ${viewName}:`, err);
    res.status(500).type('html').send('<h1>Erreur de rendu</h1>');
    return;
  }
  if (html === null) {
    res.redirect(302, '/admin');
    return;
  }
  if (!res.getHeader('Content-Type')) res.type('html');
  res.send(html);
}
