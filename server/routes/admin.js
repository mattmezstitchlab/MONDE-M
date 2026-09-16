/**
 * API d'administration — protégée par session éditeur.
 *
 * Tout ce qui écrit passe par ici. Chaque mutation est normalisée
 * (`normalizeCard` / `normalizeProject`), journalisée (`audit`) et
 * immédiatement visible côté public si le statut est `published`.
 */
import { Router } from 'express';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import * as store from '../store.js';
import { normalizeCard, normalizeProject, stats } from '../lib.js';
import { audit, auditLog } from '../audit.js';
import { requireEditor, login, destroySession, COOKIE_NAME, cookieOptions, setPassword, setEmail, sessionCount } from '../auth.js';
import { p } from '../env.js';

const router = Router();
const MEDIA_DIR = p('public', 'media');

router.use(requireEditor);

const actor = (req) => req.session?.email || 'editor';
const log = (req, action, target, type, detail) =>
  audit({ actor: actor(req), action, target, type, detail });

/* ------------------------------------------------------------------ */
/* Tableau de bord                                                     */
/* ------------------------------------------------------------------ */

router.get('/overview', (_req, res) => {
  const projects = store.all('projects');
  const cards = store.all('cards');
  const recent = [...projects.map((x) => ({ ...x, _kind: 'project' })), ...cards.map((x) => ({ ...x, _kind: 'card' }))]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 8)
    .map((x) => ({
      kind: x._kind,
      id: x.id,
      title: x._kind === 'project' ? x.title : x.identity?.displayName,
      subtitle:
        x._kind === 'project'
          ? x.subtitle
          : [x.music?.trackTitle, x.music?.artist].filter(Boolean).join(' — '),
      status: x.status,
      updatedAt: x.updatedAt
    }));

  const alerts = [];
  for (const c of cards) {
    if (c.status !== 'published') continue;
    if (!c.music?.trackTitle) alerts.push({ level: 'warn', text: `« ${c.identity?.displayName || c.slug} » est publiée sans morceau.` });
    if (!c.music?.coverUrl) alerts.push({ level: 'info', text: `« ${c.identity?.displayName || c.slug} » n’a pas de pochette : la couleur par défaut est utilisée.` });
  }
  for (const pr of projects) {
    if (pr.status === 'published' && !pr.summary) {
      alerts.push({ level: 'warn', text: `Le projet « ${pr.title} » est publié sans chapô.` });
    }
  }

  res.json({
    stats: stats({ projects, cards }),
    recent,
    alerts: alerts.slice(0, 12),
    sessions: sessionCount()
  });
});

/* ------------------------------------------------------------------ */
/* Projets                                                             */
/* ------------------------------------------------------------------ */

router.get('/projects', (req, res) => {
  let items = store.sorted('projects');
  if (req.query.status && req.query.status !== 'all') {
    items = items.filter((x) => x.status === req.query.status);
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    items = items.filter((x) =>
      [x.title, x.subtitle, x.summary, x.client, ...(x.tags || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }
  res.json({ count: items.length, projects: items });
});

router.get('/projects/:id', (req, res) => {
  const project = store.find('projects', req.params.id);
  if (!project) return res.status(404).json({ error: 'Projet introuvable.' });
  res.json({ project });
});

router.post('/projects', (req, res) => {
  const body = req.body || {};
  const slug = store.uniqueSlug('projects', body.slug || body.title || 'projet');
  const created = store.insert(
    'projects',
    normalizeProject({ ...body, slug, status: body.status || 'draft' })
  );
  log(req, 'create', created.slug, 'project', created.title);
  res.status(201).json({ project: created });
});

router.put('/projects/:id', (req, res) => {
  const existing = store.find('projects', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });
  const body = { ...(req.body || {}) };
  if (body.slug && body.slug !== existing.slug) {
    body.slug = store.uniqueSlug('projects', body.slug, existing.id);
  }
  const wasPublished = existing.status === 'published';
  const updated = store.update('projects', existing.id, normalizeProject(body, existing));
  if (!wasPublished && updated.status === 'published') {
    log(req, 'publish', updated.slug, 'project', updated.title);
  } else if (wasPublished && updated.status !== 'published') {
    log(req, 'unpublish', updated.slug, 'project', updated.title);
  } else {
    log(req, 'update', updated.slug, 'project', updated.title);
  }
  res.json({ project: updated });
});

router.post('/projects/:id/publish', (req, res) => {
  const existing = store.find('projects', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });
  const updated = store.update('projects', existing.id, {
    status: 'published',
    publishedAt: existing.publishedAt || new Date().toISOString()
  });
  log(req, 'publish', updated.slug, 'project', updated.title);
  res.json({ project: updated });
});

router.post('/projects/:id/unpublish', (req, res) => {
  const existing = store.find('projects', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });
  const updated = store.update('projects', existing.id, { status: 'draft' });
  log(req, 'unpublish', updated.slug, 'project', updated.title);
  res.json({ project: updated });
});

router.post('/projects/:id/duplicate', (req, res) => {
  const existing = store.find('projects', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });
  const copy = { ...existing, id: undefined, status: 'draft', publishedAt: '' };
  copy.slug = store.uniqueSlug('projects', `${existing.slug}-copie`);
  copy.title = `${existing.title} (copie)`;
  const created = store.insert('projects', normalizeProject(copy));
  log(req, 'duplicate', created.slug, 'project', existing.title);
  res.status(201).json({ project: created });
});

router.delete('/projects/:id', (req, res) => {
  const existing = store.find('projects', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });
  // Détache la carte des crédits avant suppression : pas de référence orpheline.
  for (const card of store.all('cards')) {
    if ((card.role?.projectIds || []).includes(existing.id)) {
      store.update('cards', card.id, {
        role: { ...card.role, projectIds: card.role.projectIds.filter((x) => x !== existing.id) }
      });
    }
  }
  store.remove('projects', existing.id);
  log(req, 'delete', existing.slug, 'project', existing.title);
  res.json({ ok: true });
});

/** Réordonnancement par glisser-déposer : tableau d'ids dans l'ordre voulu. */
router.post('/projects/reorder', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  ids.forEach((id, index) => {
    if (store.findById('projects', id)) store.update('projects', id, { order: index + 1 });
  });
  log(req, 'reorder', `${ids.length} projets`, 'project');
  res.json({ ok: true, projects: store.sorted('projects') });
});

/* ------------------------------------------------------------------ */
/* Cartes                                                              */
/* ------------------------------------------------------------------ */

router.get('/cards', (req, res) => {
  let items = store.sorted('cards');
  if (req.query.status && req.query.status !== 'all') {
    items = items.filter((x) => x.status === req.query.status);
  }
  if (req.query.rsvp && req.query.rsvp !== 'all') {
    items = items.filter((x) => x.presence?.rsvp === req.query.rsvp);
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    items = items.filter((x) =>
      [
        x.identity?.displayName,
        x.identity?.firstName,
        x.identity?.lastName,
        x.music?.trackTitle,
        x.music?.artist,
        x.role?.label,
        x.role?.moment,
        x.identity?.city
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }
  res.json({ count: items.length, cards: items });
});

router.get('/cards/:id', (req, res) => {
  const card = store.find('cards', req.params.id);
  if (!card) return res.status(404).json({ error: 'Carte introuvable.' });
  res.json({ card });
});

router.post('/cards', (req, res) => {
  const body = req.body || {};
  const name = body.identity?.displayName || body.identity?.firstName || 'carte';
  const slug = store.uniqueSlug('cards', body.slug || name);
  const created = store.insert(
    'cards',
    normalizeCard(
      { ...body, slug, status: body.status || 'draft' },
      { publish: { shareToken: store.shareToken() } }
    )
  );
  log(req, 'create', created.slug, 'card', created.identity?.displayName);
  res.status(201).json({ card: created });
});

router.put('/cards/:id', (req, res) => {
  const existing = store.find('cards', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Carte introuvable.' });
  const body = { ...(req.body || {}) };
  if (body.slug && body.slug !== existing.slug) {
    body.slug = store.uniqueSlug('cards', body.slug, existing.id);
  }
  const wasPublished = existing.status === 'published';
  const updated = store.update('cards', existing.id, normalizeCard(body, existing));
  if (!wasPublished && updated.status === 'published') {
    log(req, 'publish', updated.slug, 'card', updated.identity?.displayName);
  } else if (wasPublished && updated.status !== 'published') {
    log(req, 'unpublish', updated.slug, 'card', updated.identity?.displayName);
  } else {
    log(req, 'update', updated.slug, 'card', updated.identity?.displayName);
  }
  res.json({ card: updated });
});

/**
 * Mise à jour d'un seul bloc. Utilisée par le configurateur : chaque onglet
 * sauvegarde indépendamment, sans renvoyer toute la carte.
 */
router.patch('/cards/:id', (req, res) => {
  const existing = store.find('cards', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Carte introuvable.' });
  const updated = store.update('cards', existing.id, normalizeCard(req.body || {}, existing));
  log(req, 'update', updated.slug, 'card', Object.keys(req.body || {}).join(', '));
  res.json({ card: updated });
});

router.post('/cards/:id/publish', (req, res) => {
  const existing = store.find('cards', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Carte introuvable.' });
  const updated = store.update('cards', existing.id, {
    status: 'published',
    publishedAt: existing.publishedAt || new Date().toISOString()
  });
  log(req, 'publish', updated.slug, 'card', updated.identity?.displayName);
  res.json({ card: updated });
});

router.post('/cards/:id/unpublish', (req, res) => {
  const existing = store.find('cards', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Carte introuvable.' });
  const updated = store.update('cards', existing.id, { status: 'draft' });
  log(req, 'unpublish', updated.slug, 'card', updated.identity?.displayName);
  res.json({ card: updated });
});

router.post('/cards/:id/duplicate', (req, res) => {
  const existing = store.find('cards', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Carte introuvable.' });
  const copy = { ...existing, id: undefined, status: 'draft', publishedAt: '' };
  copy.identity = { ...existing.identity, displayName: `${existing.identity?.displayName || 'Carte'} (copie)` };
  copy.slug = store.uniqueSlug('cards', `${existing.slug}-copie`);
  copy.publish = { ...existing.publish, shareToken: store.shareToken() };
  const created = store.insert('cards', normalizeCard(copy));
  log(req, 'duplicate', created.slug, 'card', existing.identity?.displayName);
  res.status(201).json({ card: created });
});

router.delete('/cards/:id', (req, res) => {
  const existing = store.find('cards', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Carte introuvable.' });
  // Retire la carte des crédits de tous les projets.
  for (const project of store.all('projects')) {
    if ((project.credits || []).some((c) => c.cardId === existing.id)) {
      store.update('projects', project.id, {
        credits: project.credits.filter((c) => c.cardId !== existing.id)
      });
    }
  }
  store.remove('cards', existing.id);
  log(req, 'delete', existing.slug, 'card', existing.identity?.displayName);
  res.json({ ok: true });
});

router.post('/cards/reorder', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  ids.forEach((id, index) => {
    if (store.findById('cards', id)) {
      store.update('cards', id, { publish: { order: index + 1 } });
    }
  });
  log(req, 'reorder', `${ids.length} cartes`, 'card');
  res.json({ ok: true, cards: store.sorted('cards') });
});

/** Génère ou régénère le lien privé de remplissage, avec QR code. */
router.post('/cards/:id/share', async (req, res) => {
  const existing = store.find('cards', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Carte introuvable.' });
  const regenerate = Boolean(req.body?.regenerate);
  const token = regenerate || !existing.publish?.shareToken
    ? store.shareToken()
    : existing.publish.shareToken;
  const updated = store.update('cards', existing.id, {
    publish: {
      shareToken: token,
      shareEnabled: true,
      shareExpiresAt: req.body?.expiresAt || existing.publish?.shareExpiresAt || ''
    }
  });
  const base = String(req.body?.baseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const url = `${base}/carte/r/${token}`;
  let qr = '';
  try {
    qr = await QRCode.toDataURL(url, { margin: 2, width: 320, errorCorrectionLevel: 'M' });
  } catch {
    qr = '';
  }
  log(req, 'share', updated.slug, 'card', regenerate ? 'jeton régénéré' : 'lien consulté');
  res.json({ url, token, qr, card: updated });
});

/**
 * Import en masse : tableau de cartes partielles.
 * Sert au remplissage rapide d'une liste de personnes (CSV converti côté client).
 */
router.post('/cards/import', (req, res) => {
  const items = Array.isArray(req.body?.cards) ? req.body.cards.slice(0, 500) : [];
  const created = [];
  for (const item of items) {
    const name = item?.identity?.displayName || item?.identity?.firstName || 'carte';
    const slug = store.uniqueSlug('cards', item.slug || name);
    created.push(
      store.insert(
        'cards',
        normalizeCard(
          { ...item, slug, status: item.status || 'draft' },
          { publish: { shareToken: store.shareToken() } }
        )
      )
    );
  }
  log(req, 'import', `${created.length} cartes`, 'card');
  res.status(201).json({ count: created.length, cards: created });
});

/* ------------------------------------------------------------------ */
/* Configuration du hero et du site                                    */
/* ------------------------------------------------------------------ */

router.get('/hero', (_req, res) => res.json({ hero: store.getConfig('hero') }));

router.put('/hero', (req, res) => {
  const hero = store.setConfig('hero', req.body || {});
  log(req, 'update', 'hero', 'config');
  res.json({ hero });
});

/**
 * Rétablit **uniquement** la configuration du hero.
 *
 * Cette route existe pour que le bouton correspondant de l'admin fasse
 * exactement ce qu'il annonce : la réinitialisation globale vit ailleurs
 * (`POST /reset`) et ne doit jamais être déclenchée par accident.
 */
router.post('/hero/reset', (req, res) => {
  const hero = store.resetConfig('hero');
  log(req, 'reset', 'hero', 'config', 'réglages du hero rétablis depuis le seed');
  res.json({ hero });
});

router.get('/settings', (_req, res) => res.json({ settings: store.getConfig('settings') }));

router.put('/settings', (req, res) => {
  const settings = store.setConfig('settings', req.body || {});
  log(req, 'update', 'settings', 'config');
  res.json({ settings });
});

/* ------------------------------------------------------------------ */
/* Médias                                                              */
/* ------------------------------------------------------------------ */

const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo
const IMAGE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg'
};
const AUDIO_TYPES = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/webm': '.webm'
};

/**
 * Upload en `data:` URL plutôt qu'en multipart : pas de dépendance
 * supplémentaire, et la limite de taille est vérifiée avant tout écriture.
 */
router.post('/media', async (req, res) => {
  const { data, kind = 'uploads', filename = '' } = req.body || {};
  if (typeof data !== 'string' || !data.startsWith('data:')) {
    return res.status(400).json({ error: 'Donnée invalide : une data URL est attendue.' });
  }
  const comma = data.indexOf(',');
  const meta = data.slice(5, comma);
  const payload = data.slice(comma + 1);
  const isBase64 = meta.endsWith(';base64');
  const mime = meta.replace(/;base64$/, '').trim();
  const dir = kind === 'covers' || kind === 'previews' ? kind : 'uploads';
  const allowed = dir === 'previews' ? AUDIO_TYPES : IMAGE_TYPES;
  const ext = allowed[mime];
  if (!ext) {
    return res.status(415).json({
      error: `Type non accepté : ${mime || 'inconnu'}. Types autorisés : ${Object.keys(allowed).join(', ')}.`
    });
  }
  const buffer = Buffer.from(payload, isBase64 ? 'base64' : 'utf8');
  if (buffer.length > MAX_BYTES) {
    return res.status(413).json({ error: `Fichier trop lourd (${(buffer.length / 1048576).toFixed(1)} Mo). Limite : 8 Mo.` });
  }
  // L'extension vient du MIME vérifié ci-dessus, jamais du nom fourni :
  // on retire donc toute extension du nom d'origine pour éviter `x.png.png`.
  const safe = String(filename || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const name = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}${safe ? `-${safe}` : ''}${ext}`;
  const target = join(MEDIA_DIR, dir);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, name), buffer);
  log(req, 'upload', `/media/${dir}/${name}`, 'media', `${(buffer.length / 1024).toFixed(0)} ko`);
  res.status(201).json({ url: `/media/${dir}/${name}`, bytes: buffer.length, mime });
});

router.delete('/media', async (req, res) => {
  const url = String(req.body?.url || '');
  const match = url.match(/^\/media\/(covers|previews|uploads)\/([a-z0-9._-]+)$/i);
  if (!match) return res.status(400).json({ error: 'URL de média invalide.' });
  const target = join(MEDIA_DIR, match[1], match[2]);
  // Garde-fou : le chemin résolu doit rester dans le dossier des médias.
  if (!target.startsWith(MEDIA_DIR) || !existsSync(target)) {
    return res.status(404).json({ error: 'Fichier introuvable.' });
  }
  await unlink(target);
  log(req, 'delete', url, 'media');
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

router.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 500);
  res.json({ entries: auditLog().slice(0, limit) });
});

/* ------------------------------------------------------------------ */
/* Compte éditeur                                                      */
/* ------------------------------------------------------------------ */

router.put('/credentials', (req, res) => {
  const { password, email } = req.body || {};
  if (email !== undefined) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
      return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    }
    setEmail(email);
    log(req, 'update', 'email', 'account', String(email));
  }
  if (password !== undefined) {
    if (String(password).length < 10) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 10 caractères.' });
    }
    setPassword(password);
    log(req, 'update', 'mot de passe', 'account');
  }
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Données : export / réinitialisation                                 */
/* ------------------------------------------------------------------ */

router.get('/export', (_req, res) => {
  res.json({
    exportedAt: new Date().toISOString(),
    projects: store.all('projects'),
    cards: store.all('cards'),
    hero: store.getConfig('hero'),
    settings: store.getConfig('settings')
  });
});

router.post('/reset', (req, res) => {
  if (req.body?.confirm !== 'REINITIALISER') {
    return res.status(400).json({ error: 'Confirmation manquante.' });
  }
  store.resetAll();
  log(req, 'reset', 'all', 'data', 'données réinitialisées depuis le seed');
  res.json({ ok: true });
});

export default router;

/** Les routes de session, accessibles sans authentification. */
export const sessionRouter = Router();

sessionRouter.post('/login', (req, res) => {
  const result = login({
    email: req.body?.email,
    password: req.body?.password,
    ip: req.ip
  });
  if (!result.ok) {
    return res.status(result.status || 401).json({ error: result.error, remaining: result.remaining });
  }
  res.cookie(COOKIE_NAME, result.cookieValue, cookieOptions());
  res.json({ ok: true, email: result.email });
});

sessionRouter.post('/logout', (req, res) => {
  destroySession(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});
