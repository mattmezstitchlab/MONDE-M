/**
 * Persistance JSON sur disque.
 *
 * Choix assumé (docs/AUDIT.md §5.1, option A) : pas de base de données, pas
 * d'ORM, pas d'étape de build. Les écritures sont **atomiques** — on écrit un
 * fichier temporaire puis on le renomme — pour qu'une interruption ne puisse
 * jamais laisser un JSON tronqué.
 *
 * Chaque collection est un tableau d'objets dans `data/<nom>.json`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dataDir } from './env.js';
import {
  seedProjects,
  seedCards,
  seedHero,
  seedSettings,
  seedUsers,
  uid
} from './seed-data.js';

const DATA_DIR = dataDir();
const COLLECTIONS = {
  projects: { file: 'projects.json', seed: () => seedProjects },
  cards: { file: 'cards.json', seed: () => seedCards },
  users: { file: 'users.json', seed: () => seedUsers }
};
const SINGLETONS = {
  hero: { file: 'hero.json', seed: () => seedHero },
  settings: { file: 'settings.json', seed: () => seedSettings }
};

mkdirSync(DATA_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* Bas niveau                                                          */
/* ------------------------------------------------------------------ */

function pathFor(file) {
  return join(DATA_DIR, file);
}

/** Écriture atomique : fichier temporaire + renommage. */
function atomicWrite(file, data) {
  const target = pathFor(file);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, target);
}

function read(file, fallback) {
  const target = pathFor(file);
  if (!existsSync(target)) {
    const initial = fallback();
    atomicWrite(file, initial);
    return initial;
  }
  try {
    return JSON.parse(readFileSync(target, 'utf8'));
  } catch (err) {
    // Un JSON corrompu ne doit pas mettre le site à terre : on isole et on
    // repart du fichier abîmé renommé, pour ne rien perdre.
    const quarantine = `${target}.corrompu-${Date.now()}`;
    try {
      renameSync(target, quarantine);
    } catch {
      /* ignore */
    }
    console.error(
      `[store] ${file} illisible (${err.message}). Fichier isolé : ${quarantine}. Réinitialisation depuis le seed.`
    );
    const initial = fallback();
    atomicWrite(file, initial);
    return initial;
  }
}

/* ------------------------------------------------------------------ */
/* Collections (tableaux)                                              */
/* ------------------------------------------------------------------ */

export function all(name) {
  const def = COLLECTIONS[name];
  if (!def) throw new Error(`Collection inconnue : ${name}`);
  const value = read(def.file, def.seed);
  return Array.isArray(value) ? value : [];
}

export function find(name, idOrSlug) {
  const key = String(idOrSlug || '').toLowerCase();
  return (
    all(name).find(
      (item) =>
        String(item.id).toLowerCase() === key || String(item.slug || '').toLowerCase() === key
    ) || null
  );
}

export function findById(name, id) {
  return all(name).find((item) => item.id === id) || null;
}

/** Tri par défaut : `order` croissant puis `publishedAt` décroissant. */
export function sorted(name) {
  return all(name).slice().sort((a, b) => {
    const oa = Number(a.order ?? a.publish?.order ?? 0);
    const ob = Number(b.order ?? b.publish?.order ?? 0);
    if (oa !== ob) return oa - ob;
    const da = a.publishedAt || a.updatedAt || a.createdAt || '';
    const db = b.publishedAt || b.updatedAt || b.createdAt || '';
    return String(db).localeCompare(String(da));
  });
}

export function insert(name, item) {
  const items = all(name);
  const id = item.id || uid(name === 'cards' ? 'c' : name === 'projects' ? 'p' : 'x');
  const record = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...item,
    id
  };
  items.push(record);
  atomicWrite(COLLECTIONS[name].file, items);
  return record;
}

/** Mise à jour partielle en profondeur d'un seul niveau de blocs. */
export function update(name, id, patch) {
  const items = all(name);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = items[index];
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    const existing = current[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      merged[key] = { ...existing, ...value };
    } else {
      merged[key] = value;
    }
  }
  merged.updatedAt = new Date().toISOString();
  if (merged.status === 'published' && !merged.publishedAt) {
    merged.publishedAt = merged.updatedAt;
  }
  items[index] = merged;
  atomicWrite(COLLECTIONS[name].file, items);
  return merged;
}

export function remove(name, id) {
  const items = all(name);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  atomicWrite(COLLECTIONS[name].file, next);
  return true;
}

export function replace(name, items) {
  atomicWrite(COLLECTIONS[name].file, items);
  return items;
}

/* ------------------------------------------------------------------ */
/* Singletons                                                          */
/* ------------------------------------------------------------------ */

export function getConfig(name) {
  const def = SINGLETONS[name];
  if (!def) throw new Error(`Configuration inconnue : ${name}`);
  return read(def.file, def.seed);
}

export function setConfig(name, patch) {
  const current = getConfig(name);
  const merged = deepMerge(current, patch || {});
  merged.updatedAt = new Date().toISOString();
  atomicWrite(SINGLETONS[name].file, merged);
  return merged;
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = base ? base[key] : undefined;
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && existing && typeof existing === 'object' && !Array.isArray(existing)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

const SLUG_MAP = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c', é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ñ: 'n', ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y',
  æ: 'ae', œ: 'oe', ß: 'ss'
};

/** Slug lisible et sûr, compatible URLs et systèmes de fichiers. */
export function slugify(input, fallback = 'sans-titre') {
  const base = String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split('')
    .map((ch) => SLUG_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return base || fallback;
}

/** Garantit l'unicité d'un slug dans une collection. */
export function uniqueSlug(name, wanted, ignoreId = null) {
  const items = all(name).filter((item) => item.id !== ignoreId);
  const taken = new Set(items.map((item) => String(item.slug || '').toLowerCase()));
  const base = slugify(wanted);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Jeton de partage non devinable (lien privé de remplissage, sans compte). */
export function shareToken() {
  return `rt_${uid('s').replace('s_', '')}${Math.random().toString(36).slice(2, 10)}`;
}

export function resetAll() {
  for (const def of Object.values(COLLECTIONS)) atomicWrite(def.file, def.seed());
  for (const def of Object.values(SINGLETONS)) atomicWrite(def.file, def.seed());
}

/** Rétablit une seule configuration depuis le seed, sans toucher au reste. */
export function resetConfig(name) {
  const def = SINGLETONS[name];
  if (!def) throw new Error(`Configuration inconnue : ${name}`);
  const fresh = def.seed();
  atomicWrite(def.file, fresh);
  return fresh;
}

/** Réinitialise les données uniquement si elles sont absentes. */
export function bootstrap() {
  for (const [name, def] of Object.entries(COLLECTIONS)) {
    if (!existsSync(pathFor(def.file))) {
      atomicWrite(def.file, def.seed());
      console.log(`[store] ${name} initialisé depuis le seed (${def.seed().length} entrées).`);
    }
  }
  for (const [name, def] of Object.entries(SINGLETONS)) {
    if (!existsSync(pathFor(def.file))) {
      atomicWrite(def.file, def.seed());
      console.log(`[store] ${name} initialisé depuis le seed.`);
    }
  }
  return { ok: true };
}

export const storeInfo = () => ({
  dir: DATA_DIR,
  collections: Object.keys(COLLECTIONS).map((name) => ({ name, count: all(name).length })),
  configs: Object.keys(SINGLETONS)
});
