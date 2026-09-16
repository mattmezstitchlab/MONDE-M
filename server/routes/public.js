/**
 * API publique — lecture seule.
 *
 * Principe (docs/AUDIT.md §5.3) : le site public ne voit **que** ce qui est
 * publié. Un brouillon n'est accessible que via un jeton d'aperçu admin.
 */
import { Router } from 'express';
import * as store from '../store.js';
import { publicCard, fragmentCard, summaryProject, stats } from '../lib.js';

const router = Router();

const isPublished = (item) => item?.status === 'published';

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'monde-m', time: new Date().toISOString() });
});

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

/**
 * Tout ce dont le hero a besoin en une seule requête : configuration,
 * fragments (cartes publiées mises en avant) et projets publiés.
 */
router.get('/hero', (_req, res) => {
  const hero = store.getConfig('hero');
  const settings = store.getConfig('settings');
  const cards = store.sorted('cards').filter(isPublished);
  const max = Number(hero.fragments?.count) || 12;

  const featured = cards.filter((c) => c.publish?.featured);
  const pool = featured.length ? featured : cards;
  const selected = pool.slice(0, max);

  res.json({
    hero,
    site: settings.site,
    fragments: selected.map(fragmentCard),
    cardsTotal: cards.length,
    projects: store
      .sorted('projects')
      .filter(isPublished)
      .slice(0, 6)
      .map(summaryProject)
  });
});

/* ------------------------------------------------------------------ */
/* Cartes                                                              */
/* ------------------------------------------------------------------ */

router.get('/cards', (req, res) => {
  let cards = store.sorted('cards').filter(isPublished);
  if (req.query.featured === '1') cards = cards.filter((c) => c.publish?.featured);
  if (req.query.role) {
    const role = String(req.query.role).toLowerCase();
    cards = cards.filter(
      (c) =>
        String(c.role?.label || '').toLowerCase().includes(role) ||
        String(c.role?.type || '').toLowerCase() === role
    );
  }
  if (req.query.project) {
    const pid = String(req.query.project);
    cards = cards.filter((c) => (c.role?.projectIds || []).includes(pid));
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    cards = cards.filter((c) =>
      [
        c.identity?.displayName,
        c.music?.trackTitle,
        c.music?.artist,
        c.role?.label,
        c.role?.moment
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }
  res.json({ count: cards.length, cards: cards.map(publicCard) });
});

/** Fragments compacts : utilisés par la scène 3D et le mur de pochettes. */
router.get('/fragments', (_req, res) => {
  const cards = store.sorted('cards').filter(isPublished);
  res.json({ count: cards.length, fragments: cards.map(fragmentCard) });
});

router.get('/cards/:slug', (req, res) => {
  const card = store.find('cards', req.params.slug);
  if (!card || !isPublished(card)) {
    return res.status(404).json({ error: 'Carte introuvable.' });
  }
  const projects = store
    .all('projects')
    .filter((p) => isPublished(p) && (card.role?.projectIds || []).includes(p.id))
    .map(summaryProject);
  res.json({ card: publicCard(card), projects });
});

/* ------------------------------------------------------------------ */
/* Projets                                                             */
/* ------------------------------------------------------------------ */

router.get('/projects', (req, res) => {
  let projects = store.sorted('projects').filter(isPublished);
  if (req.query.featured === '1') projects = projects.filter((p) => p.featured);
  if (req.query.category) {
    const cat = String(req.query.category).toLowerCase();
    projects = projects.filter((p) => String(p.category).toLowerCase() === cat);
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    projects = projects.filter((p) =>
      [p.title, p.subtitle, p.summary, ...(p.tags || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }
  res.json({ count: projects.length, projects: projects.map(summaryProject) });
});

router.get('/projects/:slug', (req, res) => {
  const project = store.find('projects', req.params.slug);
  if (!project || !isPublished(project)) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }
  const cards = (project.credits || [])
    .map((credit) => store.findById('cards', credit.cardId))
    .filter((c) => c && isPublished(c))
    .map(fragmentCard);
  const related = store
    .sorted('projects')
    .filter((p) => isPublished(p) && p.id !== project.id)
    .slice(0, 3)
    .map(summaryProject);
  res.json({ project, cards, related });
});

/* ------------------------------------------------------------------ */
/* Lien privé de remplissage — sans compte (pattern AIME)              */
/* ------------------------------------------------------------------ */

/**
 * Résout un jeton de partage en carte. Le jeton est non devinable et
 * n'expose jamais la liste des cartes : on compare jeton par jeton.
 */
export function cardByShareToken(token) {
  if (!token) return null;
  return (
    store.all('cards').find((c) => {
      if (!c.publish?.shareEnabled || !c.publish?.shareToken) return false;
      if (c.publish.shareToken !== String(token)) return false;
      if (c.publish.shareExpiresAt) {
        const expiry = Date.parse(c.publish.shareExpiresAt);
        if (Number.isFinite(expiry) && expiry < Date.now()) return false;
      }
      return true;
    }) || null
  );
}

router.get('/share/:token', (req, res) => {
  const card = cardByShareToken(req.params.token);
  if (!card) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
  // La personne qui remplit sa carte ne voit que ce qui la concerne.
  res.json({
    card: {
      id: card.id,
      slug: card.slug,
      identity: card.identity,
      music: card.music,
      role: { label: card.role?.label, type: card.role?.type, moment: card.role?.moment },
      visual: card.visual
    }
  });
});

/* ------------------------------------------------------------------ */
/* Métadonnées du site                                                 */
/* ------------------------------------------------------------------ */

router.get('/settings', (_req, res) => {
  const settings = store.getConfig('settings');
  res.json({ site: settings.site, seo: settings.seo, sections: settings.sections, footer: settings.footer });
});

router.get('/stats', (_req, res) => {
  res.json(stats({ projects: store.all('projects'), cards: store.all('cards') }));
});

export default router;
