/**
 * Journal d'audit des actions d'édition.
 *
 * Trace qui a publié, dépublié, modifié ou supprimé quoi, et quand
 * (docs/AUDIT.md §7.2). Fichier `data/audit.json`, borné à 500 entrées :
 * c'est un journal de consultation, pas une archive légale.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './env.js';
import { atomicAppend } from './fs.js';

const LIMIT = 500;
const FILE = 'audit.json';
const PATH = join(dataDir(), FILE);

export function auditLog() {
  if (!existsSync(PATH)) return [];
  try {
    const value = JSON.parse(readFileSync(PATH, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function audit({ actor = 'editor', action, target = '', type = '', detail = '' }) {
  const entries = auditLog();
  entries.unshift({
    id: `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    actor,
    action,
    target,
    type,
    detail: String(detail || '').slice(0, 300)
  });
  const next = entries.slice(0, LIMIT);
  atomicAppend(FILE, next);
  return next[0];
}
