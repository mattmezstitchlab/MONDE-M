/**
 * Authentification de l'espace éditeur.
 *
 * Périmètre volontairement simple (docs/AUDIT.md §7.1) : **un seul rôle**,
 * un compte éditeur, défini par variables d'environnement. Aucune dépendance
 * externe — le hachage utilise PBKDF2 de `node:crypto` (SHA-256, 210 000
 * itérations), les sessions sont des jetons aléatoires signés par HMAC.
 *
 * Le hachage du mot de passe est persisté dans `data/auth.json` pour qu'un
 * changement de mot de passe depuis l'admin survive à un redémarrage.
 */
import { randomBytes, timingSafeEqual, pbkdf2Sync, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, dataDir } from './env.js';

loadEnv();

const ITERATIONS = 210_000;
const KEYLEN = 32;
const AUTH_FILE = join(dataDir(), 'auth.json');

const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const SESSION_TTL = SESSION_HOURS * 3600 * 1000;
const SECRET = process.env.SESSION_SECRET || 'monde-m-dev-secret-a-changer';
const COOKIE = 'monde_m_session';

/* ------------------------------------------------------------------ */
/* Hachage                                                             */
/* ------------------------------------------------------------------ */

export function hashPassword(password, salt = randomBytes(16)) {
  const digest = pbkdf2Sync(String(password), salt, ITERATIONS, KEYLEN, 'sha256');
  return {
    algorithm: 'pbkdf2-sha256',
    iterations: ITERATIONS,
    salt: salt.toString('hex'),
    hash: digest.toString('hex')
  };
}

export function verifyPassword(password, record) {
  if (!record?.hash || !record?.salt) return false;
  const salt = Buffer.from(record.salt, 'hex');
  const candidate = pbkdf2Sync(
    String(password),
    salt,
    Number(record.iterations) || ITERATIONS,
    KEYLEN,
    'sha256'
  );
  const expected = Buffer.from(record.hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function readAuth() {
  if (existsSync(AUTH_FILE)) {
    try {
      return JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
    } catch {
      /* on repart de l'environnement */
    }
  }
  return null;
}

function writeAuth(record) {
  writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2) + '\n', 'utf8');
}

/** Identifiants courants : `data/auth.json` sinon les variables d'environnement. */
export function currentCredentials() {
  const stored = readAuth();
  if (stored?.password) {
    return { email: String(stored.email || '').toLowerCase(), password: stored.password };
  }
  const email = String(process.env.ADMIN_EMAIL || 'atelier@monde-m.fr').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'mondra2026gon';
  const record = { email, password: hashPassword(password), updatedAt: new Date().toISOString() };
  writeAuth(record);
  return { email, password: record.password };
}

export function setPassword(password) {
  const { email } = currentCredentials();
  const record = { email, password: hashPassword(password), updatedAt: new Date().toISOString() };
  writeAuth(record);
  return { ok: true };
}

export function setEmail(email) {
  const { password } = currentCredentials();
  const record = {
    email: String(email).toLowerCase(),
    password,
    updatedAt: new Date().toISOString()
  };
  writeAuth(record);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const sessions = new Map(); // token -> { email, expiresAt }

function sign(value) {
  return createHmac('sha256', SECRET).update(value).digest('base64url');
}

export function createSession(email) {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL;
  sessions.set(token, { email, expiresAt });
  purgeExpired();
  return { cookieValue: `${token}.${sign(token)}`, expiresAt };
}

export function readSession(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 0) return null;
  const token = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  const expected = sign(token);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, email: session.email, expiresAt: session.expiresAt };
}

export function destroySession(cookieValue) {
  const session = readSession(cookieValue);
  if (session) sessions.delete(session.token);
  return { ok: true };
}

function purgeExpired() {
  const limit = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt < limit) sessions.delete(token);
  }
}

export const sessionCount = () => sessions.size;

/** Options du cookie de session : HttpOnly, SameSite, Secure hors développement. */
export function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL
  };
}

export const COOKIE_NAME = COOKIE;

/* ------------------------------------------------------------------ */
/* Garde-fous                                                          */
/* ------------------------------------------------------------------ */

const attempts = new Map(); // email|ip -> { count, firstAt }
const WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function rateLimited(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(key) {
  attempts.delete(key);
}

export function remainingAttempts(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW) return MAX_ATTEMPTS;
  return Math.max(0, MAX_ATTEMPTS - entry.count);
}

/* ------------------------------------------------------------------ */
/* Middleware Express                                                  */
/* ------------------------------------------------------------------ */

export function attachUser(req, _res, next) {
  req.session = readSession(req.cookies?.[COOKIE]);
  req.isEditor = Boolean(req.session);
  next();
}

export function requireEditor(req, res, next) {
  if (req.isEditor) return next();
  // `req.path` est relatif au point de montage du routeur : c'est
  // `originalUrl` qui porte le préfixe `/api/…`. Sans cette distinction, une
  // requête d'API non authentifiée recevait une redirection HTML au lieu
  // d'un 401 JSON — et le client ne pouvait pas le détecter.
  const url = String(req.originalUrl || req.url || '');
  const wantsJson = url.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';
  if (wantsJson) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  return res.redirect(302, `/admin/login?redirect=${encodeURIComponent(url || '/admin')}`);
}

/** Tentative de connexion : renvoie `{ ok, ... }` sans jamais révéler quel champ était faux. */
export function login({ email, password, ip }) {
  const key = `${String(email || '').toLowerCase()}|${ip || ''}`;
  if (rateLimited(key)) {
    return {
      ok: false,
      error: 'Trop de tentatives. Réessayez dans quelques minutes.',
      status: 429
    };
  }
  const creds = currentCredentials();
  const emailOk =
    String(email || '').trim().toLowerCase() === String(creds.email).trim().toLowerCase();
  const passwordOk = verifyPassword(password || '', creds.password);
  // Comparaison à temps constant des deux résultats pour ne pas fuiter l'ordre.
  if (emailOk && passwordOk) {
    clearFailures(key);
    const session = createSession(creds.email);
    return { ok: true, email: creds.email, ...session };
  }
  recordFailure(key);
  return {
    ok: false,
    error: 'Identifiants incorrects.',
    status: 401,
    remaining: remainingAttempts(key)
  };
}
