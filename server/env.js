/**
 * Chargement minimaliste des variables d'environnement depuis `.env`.
 * Évite une dépendance externe ; le format géré est `CLE=valeur` avec
 * commentaires `#` et guillemets simples/doubles.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(file = '.env') {
  const path = resolve(root, file);
  if (!existsSync(path)) return {};
  const parsed = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return parsed;
}

export const ROOT = root;
export function p(...parts) {
  return resolve(root, ...parts);
}

/**
 * Dossier des données JSON.
 *
 * `MONDE_M_DATA_DIR` permet d'isoler un jeu de données — utilisé par la suite
 * de tests pour ne jamais écrire dans `data/` (voir tests/smoke.test.js).
 */
export function dataDir() {
  const override = process.env.MONDE_M_DATA_DIR;
  return override ? resolve(override) : resolve(root, 'data');
}

// Chargement immédiat : les modules qui lisent `dataDir()` au niveau racine
// (store, fs, audit) doivent voir les variables du `.env` dès leur évaluation.
loadEnv();
