/** Écriture atomique bas niveau, partagée par store et audit. */
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './env.js';

const DATA_DIR = dataDir();
mkdirSync(DATA_DIR, { recursive: true });

export function atomicAppend(name, data) {
  const target = join(DATA_DIR, name);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, target);
  return target;
}
