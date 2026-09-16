# Audit — MONDE-M

**Date :** 16 septembre 2026
**Périmètre :** état du dépôt `mattmezstitchlab/MONDE-M` (branche `arena/01a0a789-monde-m`, base `acd4aaa`), analyse du site de référence [dispoo.app](https://dispoo.app/) (AIME), écart entre les deux, et architecture cible pour (1) un espace admin éditeur permettant de publier des projets et (2) un hero conservant la 3D intégrant un **configurateur de carte universelle musicale** portant toutes les informations d'une personne.

---

## 1. Synthèse exécutive

| Axe | Verdict |
|---|---|
| Qualité de la scène 3D | **Bonne.** Le hero three.js est propre, lisible, interactif, cohérent visuellement. C'est un actif à conserver tel quel. |
| Socle « site » | **Inexistant.** Un seul fichier HTML autonome : pas de routage, pas de pages, pas de données, pas de backend. |
| Contenus / projets | **Inexistant.** Tout est codé en dur. Aucune notion de projet, d'article ou de fiche. |
| Admin / édition | **Inexistant.** Aucun back-office, aucune authentification, aucun CMS. |
| Carte musicale universelle | **Inexistant.** Aucun modèle de données, aucun player, aucune pochette, aucun rôle/moment/présence. |
| Accessibilité | **Faible.** Pas de `<!DOCTYPE html>`, pas de `<main>`/landmarks, canvas sans équivalent texte, pas de `prefers-reduced-motion`, pas de navigation clavier dans la scène, textes de 10 px en majuscules espacées. |
| SEO | **Nul.** Pas de `<!DOCTYPE html>`, pas de meta description, pas d'Open Graph, pas de canonical, pas de JSON-LD, pas de favicon. |
| Sécurité | **Non applicable aujourd'hui** (aucune donnée), mais **tout est à construire** dès qu'un admin existe. |
| Outillage | **Aucun.** Pas de `package.json`, pas de build, pas de lint, pas de tests. Environnement disponible : Node **v22.22.3**, npm **10.9.8**. |

**Conclusion :** le projet n'est pas « à améliorer », il est à **étager**. Le hero 3D est la couche présentation d'un produit qui n'a ni couche données, ni couche édition. Le travail consiste à construire ces deux couches *autour* du hero sans le casser — et à transformer ses 12 sphères décoratives (« Fragment 01…12 ») en **porteurs de cartes**, ce qui réconcilie exactement les deux demandes : la 3D reste, et elle devient le configurateur/lecteur de la carte universelle musicale.

---

## 2. État des lieux du dépôt MONDE-M

### 2.1 Inventaire

```
MONDE-M/
├── README.md      9 octets — « # MONDE-M »
└── index.html     15 259 octets — 372 lignes, tout-en-un (CSS + JS inline)
```

Un seul commit (`acd4aaa` — « Export from DesignArena (3d) »). Aucune dépendance déclarée, aucune configuration, aucun asset, aucun `.gitignore`.

### 2.2 Ce qui fonctionne bien (à préserver)

**Scène et rendu**
- `PerspectiveCamera(42°)` à `(0, .6, 9.5)`, fog `THREE.Fog(0xf6f6f3, 13, 28)` : la brume reprend la couleur de fond, ce qui donne une profondeur douce sans horizon dur. Bon choix.
- Éclairage à 3 sources : ambient `.78` + directionnelle `.95` avec ombres `PCFSoftShadowMap` (2048², bias `-0.0005`) + point lumineux accentué `.8` en contre-jour. Le sol est un `ShadowMaterial(opacity:.1)` : ombre portée sans plan visible, sur une `GridHelper` décalée de `-0.01` pour éviter le z-fighting. C'est du travail soigné.
- `setPixelRatio(Math.min(devicePixelRatio, 2))` : plafonnement correct.

**Le morph icosaèdre ↔ nœud torique**
- Deux géométries pré-construites (`IcosahedronGeometry(1.8, 1)` / `TorusKnotGeometry(1.12, .38, 180, 24, 2, 3)`), bascule à mi-course (`HALF = .45 s`, `TOTAL = 1.15 s`).
- Courbe d'échelle en deux temps : contraction cubique `1 - k³` puis rebond *back-out* (`c1 = 1.70158`). Le résultat est lisible et « physique ».
- Le morph est **aussi** un changement de monde : l'accent passe de `#b5541d` (terre) à `#2e5cff` (électrique) simultanément sur le wireframe, la point light **et** la variable CSS `--accent` (donc le point de la marque, le `<em>` du titre, la pastille du bouton). Cette synchronisation 3D ↔ DOM est la meilleure idée du fichier : elle doit devenir le mécanisme de thématisation du site entier.
- Garde-fou `if(morphT > 0) return;` : pas de re-déclenchement parasite.

**Respiration géométrique**
- `breatheGeo()` déplace chaque sommet le long de sa normale avec `sin(t*1.6 + x*1.9 + y*1.4 + z*1.7)`. Amplitudes différenciées (`.055` icosa / `.03` nœud). La forme vit sans tourner en boucle mécanique.

**Interaction**
- Rotation au drag avec clamp `x ∈ [-.55, .55]`, inertie amortie à `.95`, rotation idle `+.0016 rad/frame`.
- Zoom molette clampé `[6, 14]` avec lissage `camZ += (target - camZ) * .08`.
- Parallaxe caméra sur la position souris, lissée à `.05`.
- Distinction clic / drag par double seuil (`moved < 6` **et** `< 500 ms`) : c'est la bonne méthode, elle évite les faux clics.
- Raycasting sur les fragments + le cœur, tooltip suiveur, survol → `scale 1.8` et lerp de couleur vers l'accent, clic → `pulse`.
- `setPointerCapture` : le drag ne se perd pas si la souris sort du canvas.

**Direction artistique**
- Palette éditoriale cohérente : `--bg #f6f6f3`, `--ink #141414`, `--muted #6f6f6a`, `--accent #b5541d`, lignes à `rgba(20,20,20,.14)`.
- Typographie : **Fraunces** (serif, graisse 300, italique pour l'accent sémantique) en display + **Inter** en texte. `clamp(38px, 6vw, 64px)` sur le `h1`.
- Mise en page asymétrique en coins : marque en haut-gauche, métadonnées en haut-droite, hero en bas-gauche, hint en bas-droite. Le centre reste à la 3D. C'est un parti pris fort et il tient.
- Vignettage `radial-gradient` en `::after` sur `.ui` pour asseoir le texte.
- Animations d'entrée `fadeUp` échelonnées (`.15s / .3s / .45s`).

### 2.3 Lacunes bloquantes pour la demande

1. **Aucun contenu.** Le hero parle d'« une forme, deux mondes » ; il n'y a ni projets, ni personnes, ni fiches. Rien à publier.
2. **Aucun admin.** Pas de route `/admin`, pas de session, pas de formulaire, pas de persistance.
3. **Aucune donnée.** Ni modèle, ni stockage, ni API. Les 12 fragments sont générés aléatoirement au chargement (`Math.random()` sur taille, rayon, vitesse, phase) : **la scène change à chaque rechargement**, elle n'est reproductible ni par un admin ni par un visiteur.
4. **Aucune musique.** Pas d'`AudioContext`, pas d'élément `<audio>`, pas de pochette, pas de métadonnées de morceau.
5. **Aucun routage.** Une seule page, sans `history` API, sans hash.
6. **`overflow:hidden` sur `body`.** Le site est une application plein écran, pas une page. Pour publier des projets il faudra assumer un défilement : la 3D devient une section (ou reste fixe en fond pendant que le contenu défile au-dessus).

### 2.4 Dette technique et risques

**Architecture**
- Un IIFE de ~280 lignes mélangeant scène, état, DOM et événements. Aucune surface d'extension : aujourd'hui, rien ne permet d'injecter des données depuis l'extérieur. → à découper en modules (`scene`, `cards`, `audio`, `ui`, `state`).
- `three.min.js r128` chargé depuis cdnjs **sans SRI ni fallback local**. r128 date de 2021 ; si le CDN tombe ou si la ressource est retirée, le site est blanc. Risque de rupture total sur l'unique page.
- Aucune gestion d'échec WebGL : si `WebGLRenderer` lève (matériel ancien, navigateur restrictif, économie de batterie), l'exception n'est pas attrapée et le hero reste vide sans message.

**Performance**
- `breatheGeo` parcourt **tout** le tableau de positions à chaque frame et pose `needsUpdate = true` : re-téléchargement complet du buffer GPU, 60 fois par seconde. Pour l'icosaèdre détail 1 (~240 sommets) c'est acceptable ; sur le nœud torique `180 × 24` segments (~8 700 sommets) c'est le poste le plus cher de la boucle. À déplacer dans un vertex shader ou à throttlé.
- `shadowMap.enabled = true` en continu alors que la scène ne contient qu'une lumière directionnelle fixe et un sol invisible : le rendu d'ombre est recalculé chaque frame pour un résultat quasi statique. `shadowMap.autoUpdate = false` + `needsUpdate` ponctuel ferait gagner une passe entière.
- La boucle `requestAnimationFrame` tourne en permanence, même onglet masqué, même hors-viewport. Aucun `IntersectionObserver`, aucun `visibilitychange`.
- 12 matériaux `MeshStandardMaterial` distincts (un par fragment) → 12 programmes identiques mais pas d'`InstancedMesh`. Sur mobile, c'est 12 draw calls évitables.

**Accessibilité (RGAA / WCAG AA)**
- Pas de `<!DOCTYPE html>` : le navigateur bascule en mode quirks.
- Pas de landmarks (`header`, `main`, `nav`, `footer`), tout est en `div`.
- Le canvas est le seul vecteur d'information interactive : **aucun équivalent texte**, aucun `aria-label`, aucun `role="application"` ni description.
- Les fragments sont atteignables uniquement à la souris. Un utilisateur clavier ne peut ni les découvrir ni les activer.
- Pas de `@media (prefers-reduced-motion: reduce)` : la rotation idle, la respiration, le pulse et les `fadeUp` sont imposés.
- Pas d'états `:focus-visible` sur le bouton.
- Contrastes (mesurés sur `--bg #f6f6f3`) : `--muted #6f6f6a` = **4,66:1** → conforme AA pour du texte courant, mais le `.hint` et le `.chip` sont composés en **10 px**, taille où ce seuil devient fragile et où l'espacement `.16em` en majuscules dégrade encore la lisibilité réelle. `--accent #b5541d` = **4,56:1** → interdit pour le `em` du titre s'il tombe sous 18,66 px (il est en `clamp(38px…)` donc large : conforme, mais à ne pas réutiliser sur de petits textes accentués). `--ink` = 17,01:1, aucun problème.
- Le texte du `.hint` est en majuscules espacées (`.16em`) en 10 px : illisible pour une partie des utilisateurs, et non traduisible par les lecteurs d'écran de façon naturelle.

**SEO**
- Zéro meta : pas de `description`, pas d'`og:*`, pas de `twitter:*`, pas de `canonical`, pas de `robots`, pas de favicon, pas de `manifest`.
- Titre `MONDRAGON — Transformer votre monde` alors que le dépôt s'appelle `MONDE-M` et que la cible est un site de projets + cartes musicales : **incohérence de marque à trancher**.
- Pas de JSON-LD (`Organization`, `CreativeWork`, `Person`, `MusicRecording` — ce dernier est pourtant directement pertinent pour la carte musicale).
- Contenu 100 % client : un robot non-JS ne voit que du texte décoratif.

**Mobile**
- Un seul point de rupture (`720px`) : les tablettes et les écrans courts en paysage ne sont pas traités. Le hero en `position:absolute; bottom:44px` peut entrer en collision avec la marque sur un viewport de 600×400.
- Pas de pinch-zoom (un seul pointeur géré) alors que la molette sert au zoom : sur mobile, le zoom est inaccessible.
- Pas de `touch-action` déclaré : le navigateur peut voler le geste et faire défiler/zoomer la page pendant le drag.

**Sécurité (à venir)**
- Dès qu'un admin existe : hachage de mot de passe (argon2id/bcrypt), cookie de session `HttpOnly` + `SameSite=Lax` + `Secure`, jeton anti-CSRF, limitation de débit sur `/login`, en-têtes stricts (CSP, `X-Frame-Options`, `Referrer-Policy`), échappement systématique des contenus saisis (le titre du hero est injecté dans le DOM), validation des uploads (MIME réel, taille, renommage), journal d'audit.

---

## 3. Analyse du site de référence — dispoo.app (AIME)

> Note de méthode : les routes `/passeport`, `/jour-j`, `/buro`, `/contrats`, `/factures`, `/messages`, `/mes-reservations` renvoient vers `/auth?redirect=…`. Leur contenu détaillé n'est donc pas observable publiquement ; ce qui suit est reconstitué depuis la page d'accueil, `/invites`, `/professionnels`, `/futurs-maries`, `/carte`, `/magazine` et le `sitemap.xml`.

### 3.1 Ce qu'est le produit

**AIME** est un SaaS français d'organisation de mariage (domaine de production `aime-mariage.fr` d'après le sitemap). SPA de type Vite/React (assets hashés `hero-accueil-poster-BJTYFVvp.jpg`). Positionnement : *« Une date, un lieu, une équipe complète. AIME compose et organise tout avec vous. »*

Sept briques structurent le produit :

| Brique | Rôle | Route |
|---|---|---|
| **Le Bureau** | classeur automatique : chaque élément rejoint son dossier, notification par e-mail | `/buro`, `/buro/local` |
| **Dossiers** | Jour J · Réservations · Demandes · Devis · Contrats · Factures · Messages · **Passeport** · Local | multiples |
| **Timeline Jour J** | « source de vérité » : déroulé heure par heure + **timeline musicale**, moment par moment | `/jour-j` |
| **Cartes musicales** | le cœur du concept (voir 3.2) | — |
| **Cerise** | assistant conversationnel qui répond **à partir des cartes**, cite des personnes réelles, propose des regroupements ; « la décision reste la vôtre » | — |
| **Recherche** | 23 métiers, avec distinction explicite entre pros AIME et contacts trouvés sur le Web | `/recherche`, `/carte`, `/categories` |
| **Magazine** | 10 articles SEO, une route par article | `/magazine/*` |

Quatre publics, quatre entrées : futurs mariés · invités · wedding planners · prestataires.

### 3.2 La carte musicale universelle — le concept à répliquer

C'est la pièce maîtresse, et elle est remarquablement conçue.

**Le principe :** *« Une personne, un morceau, une carte. »*

**Le constat initial :** *« Fini les tableaux d'invités, les sondages de présence et les listes à part. »* — AIME supprime trois systèmes parallèles (liste d'invités, formulaire de présence, sondage musical) et les remplace par **un objet unique**.

**Le mécanisme identitaire :** la personne choisit un morceau ; **la pochette devient son identité dans l'événement** — *« c'est elle qu'on reconnaît dans la Timeline »*. Autrement dit, l'avatar n'est pas une photo ni une initiale : c'est un choix musical. C'est ce qui rend le système mémorable et ce qui justifie le mot « universelle » : la carte marche pour un invité, un témoin, un saxophoniste ou un DJ (les deux exemples affichés en accueil le prouvent : `Matt — Superstition · Stevie Wonder — Invité · Entrée des mariés` et `CosmosSax — Dancing Queen · ABBA — Saxophoniste · Ouverture de bal`).

**Le parcours en 3 étapes** (volontairement minimal) :
1. **Choisis ton morceau** → la pochette devient l'identité.
2. **Crée ta carte** → un rôle (témoin, photographe, invité) + une phrase, optionnelle. *« Rien de plus : la carte porte l'essentiel, pas un formulaire. »*
3. **Indique quand tu seras là** → heure d'arrivée, moments couverts, nombre d'accompagnants. La présence **rejoint la Timeline**.

**Ce que la carte porte, explicitement :** *« sa réponse, son rôle, ses disponibilités et les moments où elle sera là. »*

**Ce qui s'y rattache ensuite, sans double saisie :** les tables, les groupes et le plan de salle — *« se rattachent aux mêmes cartes — jamais à un second système d'invités »*.

**Ce qu'on en lit le Jour J :** *« Qui est là maintenant, qui manque, qui arrive à 16 h, quelles cartes passent au cocktail. »*

**Le complément « Passeport » :** *« Votre identité professionnelle, à jour et partageable. »* — c'est la face pro de la carte, celle qui porte les informations complètes d'une personne (coordonnées, métier, prestations), par opposition à la face événementielle.

**L'écoute :** chaque pochette *« s'écoute en extrait »* — il y a donc un lecteur intégré et une notion d'extrait (fenêtre de lecture), pas du streaming intégral.

### 3.3 Autres patterns à retenir

- **Sans compte pour les participants** : *« Un lien privé suffit. Les invités n'ont rien à installer et ne voient que ce que les mariés partagent. »* C'est ce qui fait le taux de complétion. À reproduire impérativement : **la carte se remplit par lien signé, pas par inscription**.
- **Source de vérité unique** : la Timeline. Tout le monde lit la même version ; *« si un horaire change, la page change aussi : personne ne reste avec une ancienne version »*.
- **Le classement est automatique, jamais manuel** : *« Tout arrive au bon endroit. »* C'est la promesse de valeur du Bureau.
- **L'IA est subordonnée** : Cerise cite ses sources et ne décide pas. Bon garde-fou éditorial.
- **Grille éditoriale systématique** : chaque section = numéro sur deux chiffres (`01`, `02`…) + verbe à l'infinitif en capitales (`IMAGINER`, `TROUVER`, `COMPOSER`, `ORCHESTRER`, `VALIDER`, `PARTAGER`, `RACONTER`) + titre en une phrase + description + CTA en capitales. Sept temps, récit complet du produit. C'est une structure de page que MONDE-M peut reprendre telle quelle.
- **Double sourcing affiché** : distinguer visuellement le contenu vérifié du contenu importé. Utile pour un admin : distinguer les projets publiés des brouillons/imports.
- **SEO par le magazine** : une route, un article, un mot-clé métier.

### 3.4 Ce qu'il faut traduire pour MONDE-M

AIME est un produit mariage. MONDE-M n'est pas un produit mariage : c'est un **studio 3D qui publie des projets**. La traduction honnête du concept est la suivante — et c'est elle qui rend la carte « **universelle** » au sens strict :

| AIME (mariage) | MONDE-M (universel) |
|---|---|
| L'événement = le mariage | Le **contexte** : un projet publié, le studio, ou aucun (carte libre) |
| Rôle = témoin, invité, DJ | Rôle **libre et paramétrable** par l'admin : client, collaborateur, artiste, prestataire, invité, auteur… |
| Moments de la journée | **Repères** du projet : jalons, crédits, séquences, étapes |
| Timeline du Jour J | **Timeline du projet** (ou des cartes) |
| Passeport professionnel | **Bloc identité complet** de la carte (coordonnées, liens, bio, compétences) |
| Pochette = identité | Pochette = identité **et** texture du fragment 3D dans le hero |

La carte cesse d'être une RSVP de mariage et devient **la fiche d'identité universelle d'une personne**, dont le morceau et la pochette sont la signature — rattachable à n'importe quel projet publié depuis l'admin.

---

## 4. Analyse d'écart (gap)

| # | Attendu | Actuel | Écart |
|---|---|---|---|
| 1 | Hero avec 3D | ✅ IcosahedronGeometry/TorusKnot + fragments + poussière | **Aucun** — à conserver |
| 2 | Admin éditeur | ❌ | **Tout** : auth, sessions, back-office, CRUD |
| 3 | Publication de projets | ❌ | **Tout** : modèle `Project`, statuts, slug, listing, page détail, ordre |
| 4 | Configurateur de carte | ❌ | **Tout** : modèle `Card`, formulaire multi-blocs, aperçu live |
| 5 | Carte « universelle » | ❌ | Modèle à concevoir contexte-agnostique (voir §6) |
| 6 | Carte « musicale » | ❌ | Recherche morceau, pochette, extrait audio, liens plateformes |
| 7 | « Toutes les infos d'une personne » | ❌ | Blocs identité, contact, liens, rôle, présence, préférences |
| 8 | Persistance | ❌ | Couche de stockage + API |
| 9 | Lien 3D ↔ carte | ❌ (12 sphères aléatoires et muettes) | **Opportunité** : les fragments deviennent les cartes |
| 10 | A11y / SEO / perf | ❌ | Reprendre la base avant d'empiler des pages |

### 4.1 L'opportunité de conception n° 9

Les 12 fragments en orbite portent déjà un nom (`Fragment 01`), un tooltip, un survol et un pulse au clic. **Ils n'attendent qu'une donnée.** En les mappant sur les cartes publiées :

- la sphère prend la **couleur de la pochette** (échantillonnée côté admin, stockée dans la carte) ;
- le tooltip affiche **le prénom + le morceau** au lieu de « Fragment 07 » ;
- le clic ouvre **la carte** (panneau latéral ou route `/carte/:slug`) ;
- le **rayon orbital, la vitesse et la phase** deviennent des champs éditables dans l'admin → la composition 3D du hero est pilotable sans toucher au code ;
- le morph icosa ↔ nœud bascule entre deux **vues** : « par projet » et « par personne ».

C'est la réponse la plus économique et la plus juste à « garder la 3D **et** mettre un configurateur de carte » : la 3D *est* l'interface du configurateur, pas un décor à côté.

---

## 5. Architecture cible proposée

### 5.1 Trois options

**Option A — Node/Express + JSON on disk + hero vanilla conservé** *(recommandée pour la phase 1)*
- `index.html` actuel découpé en modules ES natifs, servi statiquement.
- Express sert le public **et** l'admin, expose une API REST `/api/*`, persiste dans `data/*.json` (écriture atomique : tmp + rename).
- Auth par session cookie, un seul compte éditeur défini par variable d'environnement.
- **Zéro étape de build.** `npm start` et c'est en ligne — compatible avec l'aperçu live.
- Dépendances minimales : `express`, `cookie-parser`, éventuellement `multer` pour les uploads.
- Limite : pas de typage, montée en charge modeste. Acceptable pour un site de studio.

**Option B — Vite + React + TypeScript + Tailwind**
- Meilleur pour un produit appelé à grossir (composants, état, formulaires complexes).
- Coût : **réécriture complète** du hero (intégration `@react-three/fiber` + `drei`), chaîne de build, plus de dépendances.
- Pertinent en phase 2, une fois le modèle de données stabilisé.

**Option C — 100 % statique, admin en `localStorage`**
- Aucun backend, déploiement trivial.
- **Mais ce n'est pas un admin** : rien n'est réellement publié, rien n'est partagé, aucune URL publique de carte. À écarter pour l'objectif annoncé.

**Recommandation :** Option A maintenant, migration B seulement si le périmètre explose.

### 5.2 Arborescence cible

```
MONDE-M/
├── server/
│   ├── index.js            bootstrap Express, middlewares, statiques
│   ├── auth.js             session, login/logout, garde admin
│   ├── routes/
│   │   ├── public.js       GET /api/projects, /api/cards, /api/hero-config
│   │   ├── admin.js        CRUD protégé + publication
│   │   └── media.js        upload pochette / extrait audio
│   └── store.js            lecture/écriture JSON atomique
├── data/
│   ├── projects.json       (gitignore — contenu réel)
│   ├── cards.json
│   ├── hero.json           configuration du hero
│   └── seed.json           jeu de démonstration versionné
├── public/
│   ├── index.html          hero 3D + projets (réécrit à partir de l'actuel)
│   ├── projets.html        listing
│   ├── projet.html         détail (?slug=)
│   ├── cartes.html         timeline / mur de pochettes
│   ├── carte.html          carte universelle publique (?slug=)
│   ├── admin/
│   │   ├── index.html      tableau de bord
│   │   ├── login.html
│   │   ├── projet.html     éditeur de projet
│   │   └── carte.html      ⭐ configurateur de carte universelle musicale
│   ├── js/
│   │   ├── scene.js        three.js : scène, morph, respiration, caméra
│   │   ├── fragments.js    mapping cartes ↔ sphères orbitales
│   │   ├── audio.js        Web Audio : extrait, fondu, analyseur
│   │   ├── api.js          client fetch
│   │   └── ui.js           panneaux, tooltip, a11y
│   ├── css/                tokens.css, hero.css, admin.css
│   ├── media/              pochettes + extraits (gitignore)
│   └── vendor/three/       three.js **local** + SRI (fin du risque CDN)
├── docs/AUDIT.md           ce document
├── .gitignore
├── .env.example
└── package.json
```

### 5.3 Routes

**Publiques**
`/` (hero + projets) · `/projets` · `/projets/:slug` · `/cartes` · `/carte/:slug` · `/carte/r/:token` (remplissage par lien privé, sans compte — pattern AIME)

**Admin**
`/admin/login` · `/admin` · `/admin/projets` · `/admin/projets/nouveau` · `/admin/projets/:id` · `/admin/cartes` · `/admin/cartes/nouveau` · `/admin/cartes/:id` · `/admin/hero` · `/admin/parametres`

**API**
`GET /api/projects?status=published` · `GET /api/projects/:slug` · `GET /api/cards` · `GET /api/cards/:slug` · `GET /api/hero` · `POST /api/admin/login` · `POST/PUT/PATCH/DELETE /api/admin/projects[/:id]` · idem `cards` · `POST /api/admin/hero` · `POST /api/admin/media`

---

## 6. Spécification du modèle de données

### 6.1 `Card` — la carte universelle musicale

Sept blocs. Les blocs 1 à 5 correspondent exactement à « toutes les infos d'une personne » ; les blocs 6 et 7 font le lien avec la 3D et la publication.

```jsonc
{
  "id": "c_8f2a1d",
  "slug": "matt-superstition",
  "status": "published",              // draft | published | archived
  "createdAt": "…", "updatedAt": "…", "publishedAt": "…",

  // 1. IDENTITÉ
  "identity": {
    "displayName": "Matt",            // ce que la Timeline affiche
    "firstName": "", "lastName": "",
    "pronouns": "",
    "avatarUrl": "",                  // optionnel : la pochette prime
    "bio": "",                        // « une phrase, si tu veux »
    "tagline": "",
    "city": "", "country": "",
    "timezone": "Europe/Paris", "locale": "fr-FR",
    "birthdate": "",                  // optionnel, jamais affiché par défaut
    "languages": ["fr"]
  },

  // 2. CONTACT & LIENS
  "contact": {
    "email": "", "emailPublic": false,
    "phone": "", "phonePublic": false,
    "address": "", "addressPublic": false,
    "website": "",
    "socials": [ { "label": "Instagram", "url": "…" } ]
  },

  // 3. MUSIQUE  ← le cœur « universel musical »
  "music": {
    "trackTitle": "Superstition",
    "artist": "Stevie Wonder",
    "album": "Talking Book",
    "year": 1972,
    "genre": "Funk / Soul",
    "bpm": 100, "key": "Ebm", "duration": 265,
    "isrc": "",
    "coverUrl": "/media/covers/…",    // identité visuelle de la carte
    "coverColors": { "dominant": "#c8871f", "accent": "#1b1b1b", "bg": "#f6f6f3" },
    "preview": { "url": "/media/previews/…", "start": 42, "end": 72, "volume": .8 },
    "external": { "spotify": "", "apple": "", "deezer": "", "youtube": "" },
    "note": "",                       // « à écouter au moment de l'entrée »
    "explicit": false
  },

  // 4. RÔLE & CONTEXTE  ← ce qui la rend universelle
  "role": {
    "label": "Invité",                // libellé libre, paramétrable par l'admin
    "type": "guest",                  // guest | artist | client | crew | partner | staff
    "organization": "",
    "projectIds": ["p_…"],            // rattachement à un ou plusieurs projets publiés
    "moment": "Entrée des mariés",    // repère libre dans la timeline du contexte
    "momentStart": "16:00", "momentEnd": "",
    "tags": ["témoin", "cocktail"]
  },

  // 5. PRÉSENCE & DISPONIBILITÉS
  "presence": {
    "rsvp": "confirmed",              // pending | confirmed | maybe | declined
    "arrival": "15:30", "departure": "02:00",
    "attendMoments": ["cocktail", "diner", "soiree"],
    "companions": 1,
    "table": "", "group": "",
    "dietary": "", "accessibility": "",
    "transport": { "mode": "", "from": "", "seats": 0 },
    "contactDayOf": ""
  },

  // 6. APPARENCE DANS LE HERO 3D  ← le configurateur
  "visual": {
    "accent": "#c8871f",              // repris par --accent et la lumière
    "orbit": { "radius": 3.9, "speed": .21, "phase": 2.4, "yBase": -.6, "size": .12 },
    "geometry": "icosa",              // forme du cœur quand cette carte est active
    "textureUrl": "",                 // la pochette plaquée sur le fragment
    "emitOnPlay": true                // la lumière pulse au rythme de l'extrait
  },

  // 7. PUBLICATION
  "publish": {
    "order": 3, "featured": true,
    "publicUrl": "/carte/matt-superstition",
    "shareToken": "rt_…",             // lien privé de remplissage, sans compte
    "shareEnabled": true, "shareExpiresAt": "",
    "qr": "",
    "seo": { "title": "", "description": "", "ogImage": "" }
  }
}
```

**Règles de conception héritées d'AIME :**
- la pochette **est** l'identité : si `coverUrl` existe, elle prime sur `avatarUrl` partout (Timeline, fragment 3D, Open Graph) ;
- la carte porte l'essentiel, pas un formulaire : à la création publique, seuls `displayName`, `music.trackTitle`, `music.artist`, `role.label` et une phrase sont demandés ; le reste est complété par l'admin ;
- `shareToken` permet le remplissage **sans compte** ;
- chaque champ a un drapeau `*Public` : ce qui n'est pas explicitement public reste côté admin.

### 6.2 `Project` — ce que l'admin publie

```jsonc
{
  "id": "p_1c9e77",
  "slug": "atlas-sonore",
  "status": "published",              // draft | published | archived
  "order": 1, "featured": true,

  "title": "Atlas sonore",
  "subtitle": "Douze cartes, un territoire",
  "category": "installation",         // installation | web | identite | film | edition | live
  "tags": ["3D", "WebGL", "musique"],
  "summary": "",                      // chapeau court, listing
  "body": "",                         // markdown ou HTML assaini
  "credits": [ { "role": "", "name": "", "cardId": "c_…" } ],   // ⭐ relie aux cartes

  "cover": { "url": "", "alt": "", "colors": { "dominant": "", "accent": "" } },
  "gallery": [ { "url": "", "alt": "", "caption": "", "kind": "image|video" } ],
  "media": { "videoUrl": "", "posterUrl": "", "audioUrl": "" },

  "client": "", "year": 2026, "date": "2026-09-01",
  "links": [ { "label": "Voir en ligne", "url": "" } ],

  "hero": { "mode": "inherit", "geometry": "knot", "accent": "#2e5cff" },  // override du hero
  "seo": { "title": "", "description": "", "ogImage": "", "noindex": false },

  "createdAt": "…", "updatedAt": "…", "publishedAt": "…"
}
```

Le champ `credits[].cardId` est la clé de voûte : **un projet cite des cartes**, et une carte liste ses projets. C'est la traduction MONDE-M du « les tables, les groupes et le plan de salle se rattachent aux mêmes cartes ».

### 6.3 `HeroConfig`

```jsonc
{
  "title": "Une forme,", "titleAccent": "deux mondes.",
  "eyebrow": "TRANSFORMATION — EXPÉRIENCE TEMPS RÉEL",
  "description": "…",
  "ctaLabel": "Lancer la transformation",
  "geometry": { "idle": "icosa", "morphTarget": "knot", "breatheAmp": .055 },
  "palette": { "bg": "#f6f6f3", "ink": "#141414", "muted": "#767671", "accents": ["#b5541d", "#2e5cff"] },
  "fragments": { "source": "cards", "count": 12, "showDust": true, "dustCount": 320 },
  "motion": { "idleSpin": .0016, "parallax": .7, "reducedMotionFallback": "static" },
  "audio": { "autoplayPreview": false, "volume": .8, "fadeIn": .4 }
}
```

Note sur les contrastes, mesurés sur le fond `#f6f6f3` :

| Couleur | Ratio | Usage actuel | Verdict |
|---|---|---|---|
| `#6f6f6a` (`--muted` actuel) | 4,66:1 | 10–14 px | OK en ≥ 12 px, **limite en 10 px** |
| `#767671` | 4,22:1 | — | **non conforme**, ne pas utiliser |
| `#6b6b66` | 4,95:1 | texte courant | conforme AA, marge confortable |
| `#656560` | 5,41:1 | **10–11 px** (`.hint`, `.chip`) | conforme AA avec marge |
| `#5f5f5a` | 5,93:1 | petites capitales espacées | recommandé pour le hint |
| `#b5541d` (`--accent`) | 4,56:1 | `em` du `h1` en `clamp(38px…)` | conforme (texte grand) — **ne pas descendre sous 18,66 px** |

Recommandation : conserver `--muted` pour le corps de texte, introduire une variable `--muted-strong: #656560` pour tout ce qui est composé en dessous de 12 px, et ne jamais employer l'accent sur de petits textes.

---

## 7. Spécification fonctionnelle de l'admin

### 7.1 Écrans

**Connexion** — e-mail + mot de passe, un seul rôle éditeur, redirection après succès, message d'erreur générique, limitation à 5 tentatives / 15 min.

**Tableau de bord** — comptes (projets publiés / brouillons, cartes publiées / en attente de RSVP), derniers éléments modifiés, raccourcis « Nouveau projet » / « Nouvelle carte », aperçu miniature du hero, alertes (médias manquants, cartes sans morceau).

**Projets — liste** — colonnes ordre (glisser-déposer), couverture, titre, catégorie, statut, cartes liées, date de publication, actions. Filtres par statut et catégorie, recherche plein texte, actions groupées (publier, dépublier, archiver).

**Projets — éditeur** — tous les champs de §6.2, slug auto-généré depuis le titre et modifiable, upload de couverture avec extraction automatique des couleurs dominantes, gestion de galerie ordonnable, corps en markdown avec aperçu, sélecteur de cartes pour les crédits, panneau SEO avec compteurs de caractères et aperçu du snippet, sauvegarde automatique en brouillon, boutons « Enregistrer » / « Publier » / « Dépublier » / « Supprimer », aperçu direct du rendu public.

**⭐ Cartes — configurateur universel musical** — l'écran central, en trois colonnes :
- **gauche** : navigation par blocs (Identité · Contact · Musique · Rôle · Présence · Apparence 3D · Publication) avec état de complétion de chaque bloc ;
- **centre** : les champs du bloc actif, progressifs, sans formulaire géant ;
- **droite** : **aperçu live** — la scène three.js réduite, avec le fragment de la carte en surbrillance, la pochette plaquée, l'accent appliqué, l'extrait audio jouable. Toute modification de `visual.*` ou de `music.coverColors` se voit immédiatement.

Fonctions spécifiques :
- **recherche de morceau** : saisie libre + import par lien (Spotify / Apple / Deezer / YouTube) avec récupération titre, artiste, album, durée, ISRC et pochette ;
- **upload de pochette** avec génération des couleurs dominantes et d'un format carré normalisé ;
- **extrait audio** : upload ou découpe (`start` / `end`) avec lecture de contrôle ;
- **partage** : génération du lien privé `/carte/r/:token`, QR code, copie en un clic, expiration ;
- **duplication** d'une carte, **import CSV** pour les listes de personnes ;
- **rattachement** à un ou plusieurs projets.

**Hero** — édite `HeroConfig` avec aperçu plein écran : textes, palette, géométrie idle/cible, amplitude de respiration, densité de poussière, source des fragments, volume et autoplay.

**Paramètres** — identité du site (nom, marque — *à trancher : MONDE-M ou MONDRAGON ?*), SEO global, favicon, integrations, mot de passe de l'admin, export/import JSON complet des données.

### 7.2 Règles de publication

- `draft` → invisible côté public, visible en aperçu admin via un jeton ;
- `published` → visible, indexable, alimente le hero et les listings ;
- `archived` → retiré des listings, URL conservée (pas de lien cassé), `noindex` ;
- toute publication pose `publishedAt` ; toute modification d'un élément publié est immédiate (pas de double validation, sauf demande contraire) ;
- un journal d'audit trace qui a publié/dépublié quoi et quand.

---

## 8. Spécification du hero revisité

La 3D **reste exactement celle d'aujourd'hui**. Ce qui change :

1. **Les fragments sont alimentés par `/api/cards?status=published&featured=true`** au lieu de `Math.random()`. Position, taille, vitesse, phase et couleur viennent de `card.visual.orbit` et `card.music.coverColors`. La scène devient reproductible et pilotable depuis l'admin.
2. **Le tooltip affiche la personne** : `MATT · SUPERSTITION — STEVIE WONDER` au lieu de `FRAGMENT 07`.
3. **Le clic sur un fragment ouvre la carte** : panneau latéral glissant (pochette, lecteur d'extrait, rôle, moment, liens) avec bouton vers la page complète. Pas de rechargement, la 3D continue de tourner derrière.
4. **Le morph change de sens** : icosaèdre = vue « projets », nœud torique = vue « personnes ». L'accent bascule comme aujourd'hui, mais il bascule aussi vers la couleur dominante de la sélection.
5. **L'extrait audio est optionnel et non automatique** : lecture au clic, fondu d'entrée `.4 s`, volume maître depuis `HeroConfig`, et **coupure immédiate si `prefers-reduced-motion`** ou onglet masqué. Un visualiseur discret (anneau autour du fragment actif, piloté par un `AnalyserNode`) remplace l'effet de souffle quand le son joue.
6. **La page défile enfin** : `body { overflow: hidden }` est remplacé par un hero en `100svh` avec la 3D en `position: sticky`/`fixed` en fond, puis les sections projets, cartes et magazine au-dessous — en reprenant la grille éditoriale d'AIME (numéro `01`, verbe en capitales, titre, description, CTA).
7. **Équivalent accessible** : sous le canvas, une liste `<ul>` de boutons (une carte par fragment) masquée visuellement mais accessible au clavier et aux lecteurs d'écran ; `role="img"` + `aria-label` décrivant la scène ; `touch-action: none` sur le canvas ; support du pinch-zoom à deux doigts.
8. **Repli sans WebGL** : détection, message court, affichage de la liste des cartes en mode statique.

---

## 9. Accessibilité, SEO, performance — plan de correction

**Accessibilité**
- Ajouter `<!DOCTYPE html>` et les landmarks (`header`, `main`, `nav`, `footer`).
- Canvas : `role="img"`, `aria-label`, plus la liste équivalente décrite ci-dessus.
- `@media (prefers-reduced-motion: reduce)` → arrêt de la rotation idle, de la respiration et du pulse ; le morph devient un fondu enchaîné simple.
- `:focus-visible` explicite sur tous les éléments interactifs ; ordre de tabulation cohérent ; échappement ferme les panneaux.
- Contrastes : introduire `--muted-strong: #656560` et l'appliquer à tout texte composé en dessous de 12 px ; supprimer les textes de 10 px ou les remonter à 12 px minimum.
- Le hint en majuscules espacées devient du texte normal avec un `aria-hidden` sur la version décorative.

**SEO**
- `title` + `description` par page, `canonical`, `og:*`, `twitter:*`, favicon, `manifest.webmanifest`.
- JSON-LD : `Organization` (site), `CreativeWork` (projet), `Person` + `MusicRecording` (carte) — ce dernier est directement justifié par le concept.
- `sitemap.xml` et `robots.txt` générés depuis les données publiées.
- Rendu des contenus critiques côté serveur (le listing projets et le texte des cartes ne doivent pas dépendre de JS).

**Performance**
- three.js **local** + `integrity` + version figée.
- `breatheGeo` déplacé en vertex shader, ou exécuté à 30 Hz, ou remplacé par une respiration d'échelle globale.
- `shadowMap.autoUpdate = false`, mise à jour manuelle uniquement pendant le morph.
- `InstancedMesh` pour les 12 fragments (1 draw call au lieu de 12).
- `IntersectionObserver` + `visibilitychange` pour suspendre la boucle de rendu.
- Budget : hero ≤ 350 ko hors three.js, LCP < 2,5 s, aucune requête bloquante hors critique.

---

## 10. Plan de livraison proposé

| Phase | Contenu | Livrable vérifiable |
|---|---|---|
| **0 — Cadrage** | Réponses aux 4 questions §12. Ce document validé. | Décisions écrites |
| **1 — Socle** | `package.json`, Express, `store.js` atomique, seed JSON, API publique, three.js en local, découpage du hero en modules. | `GET /api/cards` répond ; le hero actuel tourne inchangé, servi par le serveur |
| **2 — Admin : accès + projets** | Login/session, garde, tableau de bord, liste + éditeur de projets, upload médias, publication. | Un projet créé dans l'admin apparaît sur la page publique |
| **3 — Admin : configurateur de carte** | Les 7 blocs, recherche/import de morceau, pochette + couleurs, extrait audio, aperçu 3D live, lien de partage + QR. | Une carte complète créée de bout en bout, visible publiquement |
| **4 — Public : cartes** | Le hero mappé sur les cartes, panneau au clic, `/cartes` (mur de pochettes), `/carte/:slug`, `/carte/r/:token` (remplissage sans compte). | Cliquer un fragment ouvre la carte ; le lien privé permet à un tiers de remplir sa carte |
| **5 — Fondations** | A11y, SEO, perf, repli WebGL, tests de smoke, `.gitignore`, README. | Contrastes AA, JSON-LD valide, 1 draw call pour les fragments, Lighthouse ≥ 90 |

Les phases 1 à 3 forment un premier ensemble démontrable ; 4 et 5 peuvent être menées en parallèle.

---

## 11. Risques

| Risque | Impact | Parade |
|---|---|---|
| three.js r128 depuis cdnjs, sans SRI | **Rupture totale** du hero | Vendoring local dès la phase 1 |
| Droits sur les pochettes et les extraits audio | Juridique | Extraits courts, hébergement des fichiers fournis par l'éditeur, mention des liens plateformes plutôt que du son quand c'est possible |
| Confusion de marque (MONDE-M vs MONDRAGON) | Image | Trancher en phase 0 |
| Périmètre « mariage » vs « universel » | Conception | Le modèle de §6.1 est contexte-agnostique ; le rôle et le moment sont des libellés libres |
| `overflow:hidden` → passage à une page défilante | Casser le hero existant | Hero en `100svh` + 3D en fond fixe ; le morph et le drag restent inchangés |
| Surcharge du hero (3D + audio + panneaux + scroll) | Perf et lisibilité | Audio désactivé par défaut, panneaux en overlay, rendu suspendu hors viewport |
| Pas de tests, un seul fichier | Régression silencieuse | Tests de smoke API + instantané du seed dès la phase 1 |

---

## 12. Questions de cadrage à trancher avant la phase 1

1. **Périmètre de la carte** : universelle au sens strict (toute personne, tout contexte — le modèle du §6.1), ou spécialisée mariage/événement comme AIME ? Le modèle proposé couvre les deux, mais l'interface d'administration et le vocabulaire affiché en découlent.
2. **Stack** : Option A (Express + JSON, hero vanilla conservé, zéro build) ou Option B (Vite + React + R3F, réécriture du hero) ?
3. **Musique** : liens vers les plateformes uniquement, extraits audio hébergés (upload par l'admin), ou les deux ? Détermine le lecteur, le stockage et l'exposition juridique.
4. **Marque et contenus** : on garde « MONDRAGON » ou on passe à « MONDE-M » ? Et qui sont les personnes des cartes — de vrais collaborateurs/clients, ou un jeu de démonstration pour la maquette ?

---

*Audit réalisé le 16 septembre 2026 sur la base du commit `acd4aaa` et de l'observation publique de dispoo.app le même jour.*
