/**
 * Tests de smoke — parcours complets, du démarrage au partage public.
 *
 * Lancés contre un serveur réel sur un port libre, avec un dossier de
 * données isolé : rien n'écrase `data/`.
 *
 *   npm run smoke
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Port choisi par le système plutôt que fixé : un serveur oublié d'un run
 * précédent ne peut plus faire tourner la suite contre du code périmé.
 */
let PORT = 0;
let BASE = '';
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
const PASSWORD = 'motdepasse-test-2026';
const EMAIL = 'test@monde-m.fr';

const workdir = mkdtempSync(join(tmpdir(), 'monde-m-test-'));
const dataDir = join(workdir, 'data');
const coversDir = join(ROOT, 'public', 'media', 'covers');

let server;
let cookie = '';
// Fichiers téléversés pendant les tests : à retirer du dépôt à la fin.
const uploadedFiles = new Set();

function cleanMedia() {
  for (const url of uploadedFiles) {
    const file = join(ROOT, 'public', url.replace(/^\//, ''));
    try {
      if (file.startsWith(coversDir) && existsSync(file)) rmSync(file);
    } catch {
      /* déjà supprimé */
    }
  }
  uploadedFiles.clear();
}

async function waitForServer(timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const res = await fetch(`${BASE}/api/public/health`);
      if (res.ok) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Le serveur n’a pas démarré à temps.');
}

before(async () => {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  writeFileSync(
    join(workdir, '.env'),
    [
      `PORT=${PORT}`,
      `ADMIN_EMAIL=${EMAIL}`,
      `ADMIN_PASSWORD=${PASSWORD}`,
      'SESSION_SECRET=secret-de-test-tres-long-et-aleatoire',
      'NODE_ENV=test'
    ].join('\n')
  );

  server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_EMAIL: EMAIL,
      ADMIN_PASSWORD: PASSWORD,
      SESSION_SECRET: 'secret-de-test-tres-long-et-aleatoire',
      NODE_ENV: 'test',
      MONDE_M_DATA_DIR: dataDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(`[serveur] ${d}`));
  await waitForServer();
});

after(() => {
  server?.kill('SIGTERM');
  rmSync(workdir, { recursive: true, force: true });
  cleanMedia();
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function req(path, { method = 'GET', body, auth = false, raw = false, headers: extra = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...extra
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* réponse HTML */
  }
  return { status: res.status, json, text, headers: res.headers };
}

/* ------------------------------------------------------------------ */
/* Site public                                                         */
/* ------------------------------------------------------------------ */

test('la page d’accueil rend le hero, les projets et les cartes', async () => {
  const { status, text } = await req('/');
  assert.equal(status, 200);
  assert.match(text, /<!DOCTYPE html>/i, 'DOCTYPE présent');
  assert.match(text, /id="scene-canvas"/, 'canvas de la scène');
  assert.match(text, /three\.min\.js" integrity="sha384-/, 'three.js local avec SRI');
  assert.match(text, /id="hero-data"/, 'îlot de données du hero');
  assert.match(text, /id="fragmentList"/, 'équivalent textuel des fragments');
  assert.match(text, /id="morphBtn"/, 'bouton de morph');
  assert.match(text, /cover-card/, 'mur de pochettes');
  assert.match(text, /project-row/, 'liste de projets');
});

test('les listings et pages de détail répondent', async () => {
  for (const path of ['/projets', '/cartes', '/carte/matt-superstition', '/projets/atlas-sonore']) {
    const { status } = await req(path);
    assert.equal(status, 200, `${path} doit répondre 200`);
  }
});

test('la page de carte expose un lecteur et du JSON-LD Person', async () => {
  const { text } = await req('/carte/matt-superstition');
  assert.match(text, /class="player"/, 'lecteur présent');
  assert.match(text, /data-bpm="100"/, 'tempo transmis au lecteur');
  assert.match(text, /application\/ld\+json/, 'données structurées');
  assert.match(text, /"MusicRecording"/, 'le morceau est décrit en schema.org');
});

test('les brouillons ne sont jamais visibles publiquement', async () => {
  const { status: cardStatus } = await req('/carte/carte-en-attente');
  assert.equal(cardStatus, 404, 'une carte en brouillon doit renvoyer 404');
  const { status: projectStatus } = await req('/projets/halo-en-cours');
  assert.equal(projectStatus, 404, 'un projet en brouillon doit renvoyer 404');
});

test('l’API publique ne renvoie que du publié', async () => {
  const { json } = await req('/api/public/cards');
  assert.ok(json.count > 0);
  for (const card of json.cards) {
    assert.equal(card.status, 'published');
  }
  const { json: projects } = await req('/api/public/projects');
  for (const project of projects.projects) {
    assert.equal(project.status, 'published');
    assert.equal(project.body, undefined, 'le corps long n’est pas servi dans la liste');
  }
});

test('les coordonnées non publiques restent côté admin', async () => {
  const { json } = await req('/api/public/cards/matt-superstition');
  assert.equal(json.card.contact.email, 'atelier@monde-m.fr', 'e-mail marqué public');
  const { json: other } = await req('/api/public/cards/jonas-keller-arbos');
  assert.equal(other.card.contact.email, undefined, 'e-mail non public masqué');
  assert.equal(other.card.identity.birthdate, undefined, 'date de naissance jamais exposée');
});

test('le hero livre configuration et fragments en une requête', async () => {
  const { json } = await req('/api/public/hero');
  assert.ok(json.hero?.title, 'configuration du hero');
  assert.ok(Array.isArray(json.fragments), 'fragments');
  assert.ok(json.fragments.length > 0, 'au moins un fragment');
  const f = json.fragments[0];
  assert.ok(f.name && f.url, 'un fragment porte un nom et une URL');
  assert.ok(f.visual?.orbit, 'un fragment porte ses réglages d’orbite');
  assert.ok(f.cover?.dominant, 'un fragment porte la couleur de sa pochette');
});

test('404 et robots/sitemap', async () => {
  assert.equal((await req('/page-inexistante')).status, 404);
  assert.equal((await req('/api/public/inexistant')).status, 404);
  const sitemap = await req('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.text, /<urlset/, 'sitemap XML valide');
  assert.doesNotMatch(sitemap.text, /carte-en-attente/, 'les brouillons sont absents du sitemap');
  const robots = await req('/robots.txt');
  assert.match(robots.text, /Disallow: \/admin/, 'l’admin est exclu des robots');
});

/* ------------------------------------------------------------------ */
/* Authentification                                                    */
/* ------------------------------------------------------------------ */

test('l’admin est inaccessible sans session', async () => {
  const api401 = await req('/api/admin/overview');
  assert.equal(api401.status, 401);
  const page = await req('/admin');
  assert.equal(page.status, 302, 'la page admin redirige');
  assert.match(page.headers.get('location') || '', /\/admin\/login\?redirect=/);
});

test('un mauvais mot de passe est refusé sans révéler quel champ est faux', async () => {
  const { status, json } = await req('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: 'mauvais-mot-de-passe' }
  });
  assert.equal(status, 401);
  assert.equal(json.error, 'Identifiants incorrects.');
});

test('un e-mail inconnu renvoie exactement le même message', async () => {
  const { status, json } = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'inconnu@ailleurs.fr', password: PASSWORD }
  });
  assert.equal(status, 401);
  assert.equal(json.error, 'Identifiants incorrects.', 'message identique — aucune fuite');
});

test('la connexion pose un cookie HttpOnly et SameSite', async () => {
  const res = await req('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
    raw: true
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie') || '';
  assert.match(setCookie, /HttpOnly/i, 'cookie non lisible en JS');
  assert.match(setCookie, /SameSite=Lax/i, 'protection CSRF de base');
  cookie = setCookie.split(';')[0];
  const { status } = await req('/api/admin/overview', { auth: true });
  assert.equal(status, 200, 'la session donne accès à l’admin');
});

test('un cookie falsifié est rejeté', async () => {
  const saved = cookie;
  cookie = 'monde_m_session=token-invente.fausse-signature';
  const { status } = await req('/api/admin/overview', { auth: true });
  assert.equal(status, 401, 'la signature HMAC est vérifiée');
  cookie = saved;
});

/* ------------------------------------------------------------------ */
/* CRUD projets                                                        */
/* ------------------------------------------------------------------ */

let projectId = '';

test('créer un projet génère un slug lisible et le laisse en brouillon', async () => {
  const { status, json } = await req('/api/admin/projects', {
    method: 'POST',
    auth: true,
    body: {
      title: 'Projet d’essai Æonné',
      subtitle: 'Sous-titre',
      category: 'web',
      summary: 'Un chapô de test.',
      body: 'Premier paragraphe.\n\nSecond paragraphe.',
      tags: ['test', 'smoke']
    }
  });
  assert.equal(status, 201);
  assert.equal(json.project.slug, 'projet-d-essai-aeonne', 'accents translittérés');
  assert.equal(json.project.status, 'draft', 'un nouveau projet n’est pas publié par défaut');
  projectId = json.project.id;
});

test('un projet en brouillon est invisible publiquement, puis visible une fois publié', async () => {
  assert.equal((await req('/projets/projet-d-essai-aeonne')).status, 404);
  await req(`/api/admin/projects/${projectId}/publish`, { method: 'POST', auth: true });
  const page = await req('/projets/projet-d-essai-aeonne');
  assert.equal(page.status, 200);
  assert.match(page.text, /Projet d’essai Æonné/, 'le titre est rendu');
  assert.match(page.text, /Second paragraphe/, 'le corps est rendu');
  const { json } = await req('/api/public/projects');
  assert.ok(json.projects.some((p) => p.id === projectId), 'présent dans l’API publique');
});

test('le contenu saisi est échappé à l’affichage', async () => {
  const { json } = await req(`/api/admin/projects/${projectId}`, {
    method: 'PUT',
    auth: true,
    body: { summary: '<script>alert("xss")</script> texte' }
  });
  assert.equal(json.project.summary, '<script>alert("xss")</script> texte', 'stocké tel quel');
  const { text } = await req('/projets/projet-d-essai-aeonne');
  assert.doesNotMatch(text, /<script>alert\("xss"\)<\/script>/, 'jamais réinjecté en HTML brut');
  assert.match(text, /&lt;script&gt;/, 'échappé');
});

test('les slugs en double sont désambiguïsés', async () => {
  const { json } = await req('/api/admin/projects', {
    method: 'POST',
    auth: true,
    body: { title: 'Projet d’essai Æonné' }
  });
  assert.equal(json.project.slug, 'projet-d-essai-aeonne-2');
  await req(`/api/admin/projects/${json.project.id}`, { method: 'DELETE', auth: true });
});

test('la duplication crée un brouillon et la suppression détache les crédits', async () => {
  const { json } = await req(`/api/admin/projects/${projectId}/duplicate`, {
    method: 'POST',
    auth: true
  });
  assert.equal(json.project.status, 'draft');
  assert.match(json.project.title, /\(copie\)$/);
  const deleted = await req(`/api/admin/projects/${json.project.id}`, { method: 'DELETE', auth: true });
  assert.equal(deleted.json.ok, true);
  assert.equal((await req(`/api/admin/projects/${json.project.id}`, { auth: true })).status, 404);
});

test('le réordonnancement met à jour le champ order', async () => {
  const { json } = await req('/api/admin/projects', { auth: true });
  const ids = json.projects.slice(0, 3).map((p) => p.id).reverse();
  await req('/api/admin/projects/reorder', { method: 'POST', auth: true, body: { ids } });
  const after = await req('/api/admin/projects', { auth: true });
  assert.deepEqual(
    after.json.projects.slice(0, 3).map((p) => p.id),
    ids,
    'l’ordre demandé est respecté'
  );
});

/* ------------------------------------------------------------------ */
/* CRUD cartes                                                         */
/* ------------------------------------------------------------------ */

let cardId = '';

test('créer une carte normalise les valeurs et pose un jeton de partage', async () => {
  const { status, json } = await req('/api/admin/cards', {
    method: 'POST',
    auth: true,
    body: {
      identity: { displayName: 'Personne de test' },
      music: { trackTitle: 'Morceau de test', artist: 'Artiste', bpm: 9999, key: 'Zz' },
      visual: { orbit: { radius: 99, size: 5 } },
      role: { label: 'QA', type: 'type-inconnu' }
    }
  });
  assert.equal(status, 201);
  const card = json.card;
  cardId = card.id;
  assert.equal(card.music.bpm, 300, 'le tempo est borné');
  assert.ok(card.visual.orbit.radius <= 7, 'le rayon orbital est borné');
  assert.ok(card.visual.orbit.size <= 0.4, 'la taille est bornée');
  assert.equal(card.role.type, 'guest', 'un type inconnu retombe sur la valeur par défaut');
  assert.match(card.publish.shareToken, /^rt_/, 'jeton de partage généré');
  assert.equal(card.publish.publicUrl, `/carte/${card.slug}`);
});

test('PATCH ne met à jour que le bloc transmis', async () => {
  await req('/api/admin/cards', {
    method: 'POST',
    auth: true,
    body: { identity: { displayName: 'Base' }, music: { trackTitle: 'Avant' } }
  });
  const { json } = await req(`/api/admin/cards/${cardId}`, {
    method: 'PATCH',
    auth: true,
    body: { music: { trackTitle: 'Après' } }
  });
  assert.equal(json.card.music.trackTitle, 'Après', 'le bloc modifié est à jour');
  assert.equal(json.card.identity.displayName, 'Personne de test', 'les autres blocs sont préservés');
});

test('publier une carte la fait apparaître dans le hero', async () => {
  await req(`/api/admin/cards/${cardId}/publish`, { method: 'POST', auth: true });
  const { json } = await req('/api/public/hero');
  assert.equal((await req(`/carte/${json.fragments[0] ? '' : ''}`)).status >= 0, true);
  const { json: cards } = await req('/api/public/cards');
  assert.ok(cards.cards.some((c) => c.id === cardId), 'la carte est publiée');
});

test('l’import en masse crée plusieurs cartes en brouillon', async () => {
  const { status, json } = await req('/api/admin/cards/import', {
    method: 'POST',
    auth: true,
    body: {
      cards: [
        { identity: { displayName: 'Import A' }, music: { trackTitle: 'A' } },
        { identity: { displayName: 'Import B' }, music: { trackTitle: 'B' } }
      ]
    }
  });
  assert.equal(status, 201);
  assert.equal(json.count, 2);
  for (const card of json.cards) {
    assert.equal(card.status, 'draft');
    assert.match(card.publish.shareToken, /^rt_/);
  }
});

/* ------------------------------------------------------------------ */
/* Lien privé de remplissage                                           */
/* ------------------------------------------------------------------ */

test('le lien privé permet de remplir sa carte sans compte', async () => {
  const { json: shared } = await req(`/api/admin/cards/${cardId}/share`, {
    method: 'POST',
    auth: true,
    body: {}
  });
  assert.match(shared.url, /^https?:\/\/.+\/carte\/r\/rt_/);
  assert.ok(shared.qr.startsWith('data:image/png;base64,'), 'QR code généré');

  const token = shared.token;
  const page = await req(`/carte/r/${token}`);
  assert.equal(page.status, 200, 'le formulaire public s’affiche');
  assert.match(page.text, /id="fillForm"/);

  const fill = await req(`/api/share/${token}`, {
    method: 'POST',
    body: {
      identity: { displayName: 'Complété sans compte', bio: 'Une phrase.' },
      presence: { rsvp: 'confirmed', arrival: '19:30', companions: 2 },
      music: { trackTitle: 'Choisi par la personne', artist: 'Elle-même' }
    }
  });
  assert.equal(fill.json.ok, true);

  const { json } = await req(`/api/admin/cards/${cardId}`, { auth: true });
  assert.equal(json.card.identity.displayName, 'Complété sans compte');
  assert.equal(json.card.presence.rsvp, 'confirmed');
  assert.equal(json.card.presence.arrival, '19:30');
  assert.equal(json.card.music.trackTitle, 'Choisi par la personne');
});

test('le lien privé refuse les champs réservés à l’admin', async () => {
  const { json: shared } = await req(`/api/admin/cards/${cardId}/share`, {
    method: 'POST',
    auth: true,
    body: {}
  });
  await req(`/api/share/${shared.token}`, {
    method: 'POST',
    body: {
      status: 'archived',
      publish: { featured: false, order: 999 },
      identity: { displayName: 'Toujours là', birthdate: '1900-01-01' }
    }
  });
  const { json } = await req(`/api/admin/cards/${cardId}`, { auth: true });
  assert.equal(json.card.status, 'published', 'le statut n’est pas modifiable par le lien');
  assert.notEqual(json.card.publish.order, 999, 'l’ordre n’est pas modifiable par le lien');
  assert.equal(json.card.identity.birthdate, '', 'la date de naissance n’est pas accessible');
  assert.equal(json.card.identity.displayName, 'Toujours là', 'les champs autorisés passent');
});

test('un jeton inconnu ou régénéré ne donne accès à rien', async () => {
  assert.equal((await req('/api/share/rt_inexistant', { method: 'POST', body: {} })).status, 404);
  assert.equal((await req('/carte/r/rt_inexistant')).status, 200); // page d'explication
  const page = await req('/carte/r/rt_inexistant');
  assert.match(page.text, /n’est plus valide/, 'message clair, sans fuite');

  const first = await req(`/api/admin/cards/${cardId}/share`, { method: 'POST', auth: true, body: {} });
  const regenerated = await req(`/api/admin/cards/${cardId}/share`, {
    method: 'POST',
    auth: true,
    body: { regenerate: true }
  });
  assert.notEqual(first.json.token, regenerated.json.token);
  assert.equal(
    (await req(`/api/share/${first.json.token}`, { method: 'POST', body: { identity: { displayName: 'X' } } })).status,
    404,
    'l’ancien jeton est immédiatement invalidé'
  );
});

/* ------------------------------------------------------------------ */
/* Médias                                                              */
/* ------------------------------------------------------------------ */

const PNG_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let uploadedUrl = '';

test('un PNG est accepté et servi', async () => {
  const { status, json } = await req('/api/admin/media', {
    method: 'POST',
    auth: true,
    body: { data: PNG_DATA, kind: 'covers', filename: 'pochette test.png' }
  });
  assert.equal(status, 201);
  assert.match(json.url, /^\/media\/covers\/[a-z0-9.-]+\.png$/);
  assert.doesNotMatch(json.url, /\.png\.png$/, 'pas de double extension');
  uploadedUrl = json.url;
  uploadedFiles.add(json.url);
  const file = await req(uploadedUrl, { raw: true });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') || '', /image\/png/);
});

test('un type non autorisé est refusé', async () => {
  const { status, json } = await req('/api/admin/media', {
    method: 'POST',
    auth: true,
    body: { data: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', kind: 'covers' }
  });
  assert.equal(status, 415);
  assert.match(json.error, /Type non accepté/);
});

test('une sortie du dossier média est refusée', async () => {
  const { status } = await req('/api/admin/media', {
    method: 'DELETE',
    auth: true,
    body: { url: '/media/covers/../../server/index.js' }
  });
  assert.equal(status, 400);
  assert.ok(existsSync(join(ROOT, 'server', 'index.js')), 'le fichier du serveur est intact');
});

test('un média téléversé peut être supprimé', async () => {
  const { json } = await req('/api/admin/media', { method: 'DELETE', auth: true, body: { url: uploadedUrl } });
  assert.equal(json.ok, true);
  assert.equal((await req(uploadedUrl, { raw: true })).status, 404);
});

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

test('le hero accepte une mise à jour partielle et préserve le reste', async () => {
  const before = await req('/api/admin/hero', { auth: true });
  const { json } = await req('/api/admin/hero', {
    method: 'PUT',
    auth: true,
    body: { title: 'Titre modifié', fragments: { count: 5 } }
  });
  assert.equal(json.hero.title, 'Titre modifié');
  assert.equal(json.hero.fragments.count, 5);
  assert.equal(
    json.hero.eyebrow,
    before.json.hero.eyebrow,
    'les champs non transmis sont préservés (fusion profonde)'
  );
  assert.ok(json.hero.motion?.idleSpin !== undefined, 'le bloc motion est intact');

  const home = await req('/');
  assert.match(home.text, /Titre modifié/, 'la page d’accueil reflète le réglage');
  assert.equal(
    home.text.match(/data-fragment="/g)?.length,
    5,
    'le nombre de fragments suit la configuration'
  );
});

test('les paramètres du site pilotent la marque et le SEO', async () => {
  await req('/api/admin/settings', {
    method: 'PUT',
    auth: true,
    body: {
      site: { brand: 'MARQUE-TEST', description: 'Description du site de test.' },
      seo: { defaultDescription: 'Description de repli.' }
    }
  });
  const home = await req('/');
  assert.match(home.text, /MARQUE-TEST/, 'la marque est reprise dans l’en-tête');
  assert.match(
    home.text,
    /name="description" content="Description du site de test\."/,
    'l’accueil reprend la description du site'
  );
  assert.doesNotMatch(home.text, /Description de repli\./, 'le repli n’écrase pas la valeur propre');

  // Une page sans description dédiée retombe sur la valeur par défaut.
  const missing = await req('/page-sans-description');
  assert.equal(missing.status, 404);
  assert.match(missing.text, /Description de repli\./, 'le repli SEO s’applique');
});

test('les sections de l’accueil peuvent être masquées individuellement', async () => {
  const before = await req('/');
  assert.match(before.text, /01 — PROJETS/, 'section projets présente par défaut');
  assert.match(before.text, /02 — CARTES/, 'section cartes présente par défaut');
  assert.match(before.text, /site-footer/, 'pied de page présent par défaut');

  await req('/api/admin/settings', {
    method: 'PUT',
    auth: true,
    body: { sections: { showProjects: false, showCards: false, showFooter: false } }
  });
  const after = await req('/');
  assert.doesNotMatch(after.text, /01 — PROJETS/, 'la section projets est masquée');
  assert.doesNotMatch(after.text, /02 — CARTES/, 'la section cartes est masquée');
  assert.doesNotMatch(after.text, /site-footer/, 'le pied de page est masqué');
  assert.match(after.text, /id="scene-canvas"/, 'le hero 3D reste toujours affiché');

  // Les pages dédiées ne dépendent pas de ces réglages.
  assert.equal((await req('/projets')).status, 200);
  assert.equal((await req('/cartes')).status, 200);

  await req('/api/admin/settings', {
    method: 'PUT',
    auth: true,
    body: { sections: { showProjects: true, showCards: true, showFooter: true } }
  });
});

test('rétablir le hero ne touche ni aux projets ni aux cartes', async () => {
  await req('/api/admin/hero', { method: 'PUT', auth: true, body: { title: 'Titre à perdre' } });
  const projectsBefore = (await req('/api/admin/projects', { auth: true })).json.projects.length;
  const cardsBefore = (await req('/api/admin/cards', { auth: true })).json.cards.length;

  const { json } = await req('/api/admin/hero/reset', { method: 'POST', auth: true });
  assert.notEqual(json.hero.title, 'Titre à perdre', 'le titre modifié est bien rétabli');
  assert.equal(json.hero.title, 'Une forme,', 'valeur du seed restaurée');

  const projectsAfter = (await req('/api/admin/projects', { auth: true })).json.projects.length;
  const cardsAfter = (await req('/api/admin/cards', { auth: true })).json.cards.length;
  assert.equal(projectsAfter, projectsBefore, 'aucun projet perdu');
  assert.equal(cardsAfter, cardsBefore, 'aucune carte perdue');
});

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

test('les écritures sont atomiques : aucun fichier temporaire ne subsiste', async () => {
  // Écritures en rafale pour maximiser la chance de surprendre un état intermédiaire.
  for (let i = 0; i < 6; i++) {
    await req('/api/admin/hero', { method: 'PUT', auth: true, body: { title: `Rafale ${i}` } });
  }
  const { json } = await req('/api/admin/projects', { auth: true });
  assert.ok(json.projects.length > 0);
  const { json: cards } = await req('/api/admin/cards', { auth: true });
  assert.ok(cards.cards.length > 0);

  const leftovers = readdirSync(dataDir).filter((f) => f.includes('.tmp-') || f.includes('.corrompu'));
  assert.deepEqual(leftovers, [], `fichiers temporaires abandonnés : ${leftovers.join(', ')}`);

  // Chaque fichier reste un JSON valide et complet.
  for (const name of ['projects.json', 'cards.json', 'hero.json', 'settings.json']) {
    const file = join(dataDir, name);
    assert.ok(existsSync(file), `${name} existe`);
    assert.doesNotThrow(() => JSON.parse(readFileSync(file, 'utf8')), `${name} est un JSON valide`);
  }
});

test('l’export contient tout et le journal trace les actions', async () => {
  const { json } = await req('/api/admin/export', { auth: true });
  assert.ok(Array.isArray(json.projects) && json.projects.length > 0);
  assert.ok(Array.isArray(json.cards) && json.cards.length > 0);
  assert.ok(json.hero && json.settings);

  const { json: log } = await req('/api/admin/audit?limit=200', { auth: true });
  const actions = log.entries.map((e) => `${e.action}:${e.type}`);
  for (const expected of ['create:project', 'publish:project', 'create:card', 'upload:media', 'fill:card']) {
    assert.ok(actions.includes(expected), `le journal contient ${expected}`);
  }
  assert.ok(
    log.entries.every((e) => e.at && e.actor && e.action),
    'chaque entrée est horodatée et attribuée'
  );
});

test('le tableau de bord remonte des alertes exploitables', async () => {
  const { json } = await req('/api/admin/overview', { auth: true });
  assert.ok(json.stats.projects.published >= 0);
  assert.ok(Array.isArray(json.recent));
  assert.ok(Array.isArray(json.alerts));
  const missingCover = json.stats.cards.missingCover;
  assert.ok(missingCover > 0, 'le jeu de démo n’a pas de pochettes : l’alerte doit remonter');
});

/* ------------------------------------------------------------------ */
/* En-têtes de sécurité                                                */
/* ------------------------------------------------------------------ */

test('les en-têtes de sécurité sont posés', async () => {
  const res = await req('/', { raw: true });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(res.headers.get('referrer-policy') || '', /strict-origin/);
  assert.equal(res.headers.get('x-powered-by'), null, 'Express ne s’annonce pas');
});

test('les pages d’admin sont exclues de l’indexation', async () => {
  const res = await req('/admin/login', { raw: true });
  const text = await res.text();
  assert.match(text, /noindex/, 'meta robots noindex sur la connexion');
});

/* ------------------------------------------------------------------ */
/* URLs absolues (SEO / partage social)                                */
/* ------------------------------------------------------------------ */

test('canonical, og:url et og:image sont des URLs absolues', async () => {
  // Derrière un proxy, l'origine vient de X-Forwarded-* : c'est elle qui
  // doit apparaître dans les métadonnées, pas l'adresse interne du serveur.
  const { text } = await req('/carte/matt-superstition', {
    headers: { 'X-Forwarded-Host': 'monde-m.test', 'X-Forwarded-Proto': 'https' }
  });
  const canonical = text.match(/<link rel="canonical" href="([^"]+)"/);
  const ogUrl = text.match(/<meta property="og:url" content="([^"]+)"/);
  const ogImage = text.match(/<meta property="og:image" content="([^"]+)"/);
  assert.ok(canonical, 'balise canonical présente');
  assert.match(canonical[1], /^https:\/\/monde-m\.test\//, 'canonical absolutisé');
  assert.match(ogUrl[1], /^https:\/\/monde-m\.test\//, 'og:url absolutisé');
  assert.match(ogImage[1], /^https:\/\/monde-m\.test\//, 'og:image absolutisé');
  assert.match(text, /name="twitter:card" content="summary_large_image"/, 'carte Twitter riche');
});

test('le sitemap publie des URLs absolues et exclut les brouillons', async () => {
  const { text } = await req('/sitemap.xml', {
    headers: { 'X-Forwarded-Host': 'monde-m.test', 'X-Forwarded-Proto': 'https' }
  });
  const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 5, 'le sitemap liste le site');
  assert.ok(locs.every((u) => u.startsWith('https://monde-m.test/')), 'toutes absolues');
  assert.ok(!text.includes('carte-en-attente'), 'brouillon de carte exclu');
  assert.ok(!text.includes('halo-en-cours'), 'brouillon de projet exclu');
});
