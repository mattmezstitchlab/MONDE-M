/**
 * Lien privé de remplissage — accessible **sans compte**.
 *
 * C'est le pattern repris d'AIME (docs/AUDIT.md §3.3) : « un lien privé
 * suffit, les invités n'ont rien à installer ». La personne reçoit un lien,
 * complète sa carte, et rien d'autre n'est exposé.
 *
 * Sécurité : le jeton est non devinable, la route est limitée en débit, et
 * seuls les champs que la personne est censée remplir sont acceptés.
 */
import { Router } from 'express';
import * as store from '../store.js';
import { normalizeCard } from '../lib.js';
import { audit } from '../audit.js';
import { cardByShareToken } from './public.js';

const router = Router();

/** Champs modifiables par le détenteur du lien. */
const ALLOWED = {
  identity: ['displayName', 'firstName', 'lastName', 'pronouns', 'bio', 'tagline', 'city', 'avatarUrl'],
  contact: ['email', 'phone', 'website', 'address', 'socials'],
  music: ['trackTitle', 'artist', 'album', 'year', 'genre', 'note', 'external', 'coverUrl'],
  role: ['label', 'moment', 'momentStart', 'momentEnd'],
  presence: ['rsvp', 'arrival', 'departure', 'attendMoments', 'companions', 'table', 'group', 'dietary', 'accessibility', 'transport', 'contactDayOf']
};

function pick(allowed, source = {}) {
  const out = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

// Limitation de débit très simple, par jeton : 30 soumissions / 10 min.
const hits = new Map();
function throttled(token) {
  const now = Date.now();
  const entry = hits.get(token);
  if (!entry || now - entry.firstAt > 600_000) {
    hits.set(token, { count: 1, firstAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 30;
}

router.get('/share/:token', (req, res) => {
  const card = cardByShareToken(req.params.token);
  if (!card) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
  res.json({ ok: true });
});

router.post('/share/:token', (req, res) => {
  const token = req.params.token;
  if (throttled(token)) {
    return res.status(429).json({ error: 'Trop de soumissions. Réessayez dans quelques minutes.' });
  }
  const card = cardByShareToken(token);
  if (!card) return res.status(404).json({ error: 'Lien invalide ou expiré.' });

  const body = req.body || {};
  const patch = {};
  for (const [block, fields] of Object.entries(ALLOWED)) {
    const picked = pick(fields, body[block]);
    if (Object.keys(picked).length) patch[block] = picked;
  }
  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: 'Aucune modification transmise.' });
  }

  const updated = store.update('cards', card.id, normalizeCard(patch, card));
  audit({
    actor: `share:${token.slice(0, 12)}…`,
    action: 'fill',
    target: updated.slug,
    type: 'card',
    detail: Object.keys(patch).join(', ')
  });
  res.json({ ok: true, slug: updated.slug });
});

export default router;
