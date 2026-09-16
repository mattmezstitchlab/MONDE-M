/**
 * Contexte de requête propagé sans perçage de paramètres.
 *
 * Les URLs canoniques et Open Graph doivent être **absolues** : une route
 * relative est ignorée par les crawlers et les plateformes de partage. Le
 * domaine de production n'est pas connu à la compilation (`settings.site.url`
 * peut rester vide), on le déduit donc de l'en-tête `Host` de la requête
 * courante — ce qui reste exact derrière un proxy, grâce à
 * `X-Forwarded-Proto` / `X-Forwarded-Host`.
 *
 * `AsyncLocalStorage` garantit l'isolation entre requêtes concurrentes, y
 * compris à travers les `await` des constructeurs de page.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** Origine (`https://exemple.fr`) de la requête en cours, ou ''. */
export function currentOrigin() {
  return storage.getStore()?.origin || '';
}

/** Exécute `fn` avec l'origine déduite de `req` comme contexte courant. */
export function withRequestContext(req, fn) {
  const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const origin = host ? `${String(proto).split(',')[0]}://${String(host).split(',')[0]}` : '';
  return storage.run({ origin }, fn);
}

/** Rend une URL absolue : préfixe l'origine courante si `path` est relatif. */
export function absoluteUrl(path = '/') {
  const p = String(path || '/');
  if (/^https?:\/\//i.test(p)) return p;
  const origin = currentOrigin();
  return origin ? origin + (p.startsWith('/') ? p : `/${p}`) : p;
}
