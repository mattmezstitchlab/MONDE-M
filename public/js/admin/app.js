/**
 * Espace éditeur — application.
 *
 * Une seule coquille rendue côté serveur ; chaque vue est montée ici.
 * Les éditeurs de projet et de carte sont des routes internes
 * (`#/projets/:id`, `#/cartes/:id`) pour éviter un rechargement à chaque
 * aller-retour entre la liste et le formulaire.
 */
import { api } from './api.js';
import { esc, toast } from './ui.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProjects, renderProjectEditor } from './views/projects.js';
import { renderCards, renderCardEditor } from './views/cards.js';
import { renderHero } from './views/hero.js';
import { renderSettings } from './views/settings.js';

const island = document.getElementById('admin-data');
const boot = island ? JSON.parse(island.textContent) : { view: 'dashboard', email: '' };
const main = document.getElementById('adminMain');

/* ------------------------------------------------------------------ */
/* Routage interne                                                     */
/* ------------------------------------------------------------------ */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: new URLSearchParams(query) };
}

const ROUTES = [
  { view: 'dashboard', match: (p) => p.length === 0, render: renderDashboard },
  {
    view: 'projects',
    match: (p) => p[0] === 'projets' && p.length === 1,
    render: renderProjects
  },
  {
    view: 'projects',
    match: (p) => p[0] === 'projets' && p.length === 2,
    render: (ctx, p) => renderProjectEditor(ctx, p[1])
  },
  { view: 'cards', match: (p) => p[0] === 'cartes' && p.length === 1, render: renderCards },
  {
    view: 'cards',
    match: (p) => p[0] === 'cartes' && p.length === 2,
    render: (ctx, p) => renderCardEditor(ctx, p[1])
  },
  { view: 'hero', match: (p) => p[0] === 'hero', render: renderHero },
  { view: 'settings', match: (p) => p[0] === 'parametres', render: renderSettings }
];

/** Vue serveur -> route interne par défaut. */
const VIEW_HASH = {
  dashboard: '#/',
  projects: '#/projets',
  cards: '#/cartes',
  hero: '#/hero',
  settings: '#/parametres'
};

let current = null;
let disposed = null;

async function route() {
  const { parts, query } = parseHash();
  const entry = ROUTES.find((r) => r.match(parts));

  if (!entry) {
    location.hash = VIEW_HASH[boot.view] || '#/';
    return;
  }

  // Nettoie la vue précédente (scène d'aperçu, listeners, minuteurs).
  if (typeof disposed === 'function') {
    try {
      disposed();
    } catch {
      /* ignore */
    }
  }
  disposed = null;
  main.textContent = '';
  highlightNav(entry.view);

  const ctx = { main, query, navigate, toast, email: boot.email, onDispose: (fn) => (disposed = fn) };
  current = entry.view;
  try {
    await entry.render(ctx, parts);
  } catch (err) {
    console.error('[admin]', err);
    main.innerHTML = `<div class="empty-state">
      <h2>Impossible d’afficher cette vue</h2>
      <p class="small">${esc(err.message)}</p>
      <a class="abtn" href="#/">Retour au tableau de bord</a>
    </div>`;
  }
}

function highlightNav(view) {
  for (const link of document.querySelectorAll('.admin-nav a')) {
    const isCurrent = link.dataset.nav === view;
    if (isCurrent) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const titles = {
    dashboard: 'Tableau de bord',
    projects: 'Projets',
    cards: 'Cartes',
    hero: 'Hero 3D',
    settings: 'Paramètres'
  };
  document.title = `${titles[view] || 'Admin'} · MONDE-M`;
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/* ------------------------------------------------------------------ */
/* Déconnexion                                                         */
/* ------------------------------------------------------------------ */

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    location.href = '/admin/login';
  }
});

/* ------------------------------------------------------------------ */
/* Amorçage                                                            */
/* ------------------------------------------------------------------ */

// Les liens de la barre latérale pointent vers des pages serveur : on les
// convertit en routes internes pour rester dans l'application.
for (const link of document.querySelectorAll('.admin-nav a')) {
  link.addEventListener('click', (e) => {
    const map = {
      dashboard: '#/',
      projects: '#/projets',
      cards: '#/cartes',
      hero: '#/hero',
      settings: '#/parametres'
    };
    const target = map[link.dataset.nav];
    if (!target) return;
    e.preventDefault();
    navigate(target);
  });
}

window.addEventListener('hashchange', route);

// Premier chargement : si l'URL n'a pas de hash, on pose celui de la vue
// demandée par le serveur, ce qui déclenche `hashchange` puis `route()`.
if (!location.hash) {
  location.replace(`${location.pathname}${location.search}${VIEW_HASH[boot.view] || '#/'}`);
} else {
  route();
}

// Alerte avant de quitter une page avec un formulaire non enregistré.
let dirty = false;
export function markDirty(value = true) {
  dirty = value;
}
window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});
