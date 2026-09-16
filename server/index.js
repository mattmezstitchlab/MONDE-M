/**
 * MONDE-M — serveur Express.
 *
 * Sert à la fois le site public, l'espace éditeur et l'API. Aucun build :
 * `npm start` suffit (docs/AUDIT.md §5.1, option A).
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { loadEnv, p, dataDir } from './env.js';
import * as store from './store.js';
import { absoluteUrl, withRequestContext } from './request-context.js';
import { attachUser } from './auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes, { sessionRouter } from './routes/admin.js';
import shareRoutes from './routes/share.js';
import { renderPage } from './pages.js';

loadEnv();
store.bootstrap();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0'; // obligatoire pour l'aperçu live du sandbox

app.set('trust proxy', true);
app.disable('x-powered-by');

/* ------------------------------------------------------------------ */
/* Middlewares                                                         */
/* ------------------------------------------------------------------ */

app.use((_req, res, next) => {
  // En-têtes de sécurité de base. La CSP est volontairement permissive sur
  // `script-src 'self'` : pas d'inline, pas de CDN (three.js est vendu en local).
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), interest-cohort=()'
  );
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser);

/* ------------------------------------------------------------------ */
/* Statiques                                                           */
/* ------------------------------------------------------------------ */

// Les médias téléversés ne sont pas revalidés à chaque requête.
app.use(
  '/media',
  express.static(p('public', 'media'), { maxAge: '7d', immutable: false, index: false })
);
app.use(
  '/vendor',
  express.static(p('public', 'vendor'), { maxAge: '30d', immutable: true, index: false })
);
app.use(
  express.static(p('public'), {
    index: false, // le routage des pages est géré explicitement ci-dessous
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

app.use('/api/auth', sessionRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', shareRoutes);

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

const PAGES = [
  { path: '/', view: 'home', title: 'MONDE-M — Une personne, un morceau, une carte' },
  { path: '/projets', view: 'projects', title: 'Projets · MONDE-M' },
  { path: '/cartes', view: 'cards', title: 'Cartes musicales · MONDE-M' },
  { path: '/admin/login', view: 'admin-login', title: 'Connexion éditeur · MONDE-M', public: true },
  { path: '/admin', view: 'admin-dashboard', title: 'Espace éditeur · MONDE-M', auth: true },
  { path: '/admin/projets', view: 'admin-projects', title: 'Projets · Espace éditeur', auth: true },
  { path: '/admin/cartes', view: 'admin-cards', title: 'Cartes · Espace éditeur', auth: true },
  { path: '/admin/hero', view: 'admin-hero', title: 'Hero 3D · Espace éditeur', auth: true },
  { path: '/admin/parametres', view: 'admin-settings', title: 'Paramètres · Espace éditeur', auth: true }
];

for (const page of PAGES) {
  app.get(page.path, (req, res) => {
    if (page.auth && !req.isEditor) {
      return res.redirect(302, `/admin/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
    renderPage(res, page.view, {
      title: page.title,
      path: req.path,
      query: req.query,
      isEditor: req.isEditor,
      email: req.session?.email || ''
    });
  });
}

// Pages dynamiques : détail d'un projet, d'une carte, remplissage par lien.
app.get('/projets/:slug', (req, res) =>
  renderPage(res, 'project', {
    title: 'Projet · MONDE-M',
    path: req.path,
    slug: req.params.slug,
    isEditor: req.isEditor
  })
);

app.get('/carte/:slug', (req, res) =>
  renderPage(res, 'card', {
    title: 'Carte · MONDE-M',
    path: req.path,
    slug: req.params.slug,
    isEditor: req.isEditor
  })
);

app.get('/carte/r/:token', (req, res) =>
  renderPage(res, 'card-fill', {
    title: 'Compléter ma carte · MONDE-M',
    path: req.path,
    token: req.params.token,
    isEditor: req.isEditor
  })
);

// Aperçu d'un brouillon côté admin (jeton de session requis).
app.get('/admin/apercu/carte/:id', (req, res) => {
  if (!req.isEditor) return res.redirect(302, '/admin/login');
  renderPage(res, 'card', {
    title: 'Aperçu · MONDE-M',
    path: req.path,
    slug: req.params.id,
    preview: true,
    isEditor: true
  });
});

app.get('/admin/apercu/projet/:id', (req, res) => {
  if (!req.isEditor) return res.redirect(302, '/admin/login');
  renderPage(res, 'project', {
    title: 'Aperçu · MONDE-M',
    path: req.path,
    slug: req.params.id,
    preview: true,
    isEditor: true
  });
});

/* ------------------------------------------------------------------ */
/* SEO                                                                 */
/* ------------------------------------------------------------------ */

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n');
});

app.get('/sitemap.xml', (req, res) => {
  const projects = store.sorted('projects').filter((x) => x.status === 'published');
  const cards = store.sorted('cards').filter((x) => x.status === 'published');
  const urls = ['/', '/projets', '/cartes']
    .concat(projects.map((x) => `/projets/${x.slug}`))
    .concat(cards.map((x) => `/carte/${x.slug}`))
    .map((u) => withRequestContext(req, () => absoluteUrl(u)));
  const body = urls
    .map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`)
    .join('\n');
  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
});

/* ------------------------------------------------------------------ */
/* 404 et erreurs                                                      */
/* ------------------------------------------------------------------ */

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ressource introuvable.' });
  }
  res.status(404);
  renderPage(res, 'notfound', { title: 'Page introuvable · MONDE-M', path: req.path });
});

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  if (res.headersSent) return;
  if (_req.path?.startsWith('/api/')) {
    return res.status(500).json({ error: 'Erreur interne.' });
  }
  res.status(500).type('html').send('<h1>Erreur interne</h1>');
});

app.listen(PORT, HOST, () => {
  console.log(`MONDE-M — http://${HOST}:${PORT}`);
  console.log(`  Site public   http://localhost:${PORT}/`);
  console.log(`  Espace éditeur http://localhost:${PORT}/admin`);
  console.log(`  API           http://localhost:${PORT}/api/public/hero`);
  console.log(`  Données       ${dataDir()}`);
});
