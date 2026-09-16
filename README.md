# MONDE-M

Studio 3D. **Une personne, un morceau, une carte.**

Le site publie des projets et des cartes musicales universelles depuis un espace
éditeur, autour d'un hero three.js où chaque fragment en orbite porte une
personne et son morceau.

- **Site public** — `/`
- **Espace éditeur** — `/admin`
- **Audit et spécifications** — [`docs/AUDIT.md`](docs/AUDIT.md)

---

## Démarrage

```bash
npm install
npm start          # http://localhost:3000
```

Aucune étape de build. Node ≥ 20.

Au premier lancement, les données sont initialisées depuis un jeu de
démonstration versionné (`server/seed-data.js`) : 7 projets et 10 cartes.

```bash
npm run dev        # redémarrage à chaque modification
npm run smoke      # 39 tests de bout en bout
npm run seed       # réinitialise data/ depuis le seed
```

### Connexion à l'espace éditeur

Identifiants par défaut (à changer avant toute mise en ligne) :

```
atelier@monde-m.fr
mondra2026gon
```

Copiez `.env.example` en `.env` pour définir `ADMIN_EMAIL`, `ADMIN_PASSWORD` et
`SESSION_SECRET`. Les identifiants peuvent aussi être modifiés depuis
**Admin → Paramètres → Compte éditeur** ; ils sont alors hachés (PBKDF2-SHA256,
210 000 itérations) dans `data/auth.json`.

---

## Ce que fait le site

### Le hero

La scène d'origine est conservée à l'identique : icosaèdre ↔ nœud torique,
respiration des sommets, poussière, parallaxe, inertie, zoom. Trois changements
structurels :

1. **Les fragments portent des cartes.** Les douze sphères n'étaient que du
   `Math.random()` ; elles sont maintenant alimentées par les cartes publiées et
   mises en avant. Position, taille, vitesse, phase et couleur viennent de la
   carte, donc de l'espace éditeur.
2. **Cliquer un fragment ouvre la carte** — pochette, lecteur d'extrait, rôle,
   moment — dans un panneau latéral, pendant que la scène continue de tourner.
3. **La page défile.** Le hero occupe `100svh`, la 3D reste en fond fixe, et les
   sections projets / cartes / méthode viennent au-dessus.

La bascule de forme change toujours la couleur d'accent — dans le wireframe, la
lumière et les variables CSS du site entier. Sélectionner une carte applique la
couleur dominante de sa pochette.

### La carte universelle musicale

Sept blocs, tous éditables dans le configurateur (`/admin` → Cartes) :

| Bloc | Contenu |
|---|---|
| **Identité** | nom affiché, prénom, nom, pronoms, accroche, bio, ville, pays, fuseau, langues |
| **Contact** | e-mail, téléphone, adresse, site, réseaux — chacun avec son drapeau « public » |
| **Morceau** | titre, artiste, album, année, genre, BPM, tonalité, durée, ISRC, pochette, couleurs dominantes, extrait audio, liens Spotify/Apple/Deezer/YouTube |
| **Rôle & contexte** | libellé libre, type, organisation, moment, horaires, projets rattachés |
| **Présence** | réponse, arrivée, départ, moments couverts, accompagnants, table, groupe, régime, accessibilité, transport |
| **Apparence 3D** | rayon orbital, vitesse, phase, hauteur, taille, couleur, forme du cœur, texture |
| **Publication** | statut, ordre, mise en avant, slug, lien de partage + QR, expiration, SEO |

Le rôle est un **libellé libre** : la carte n'est pas cantonnée à un événement.
Elle décrit une personne — invitée, artiste, cliente, collaboratrice,
prestataire — rattachable à n'importe quel projet publié.

**La pochette est l'identité.** Quand elle existe, elle prime sur la photo :
c'est elle qu'on reconnaît dans la scène, elle qui colore le fragment, elle qui
part en Open Graph.

### Les extraits audio

Deux sources, au choix :

- **Fichier hébergé** — mp3/wav/ogg téléversé depuis l'admin, lu entre `start`
  et `end`.
- **Extrait généré** — à défaut de fichier, un motif de quatre mesures est
  synthétisé dans le navigateur à partir du BPM et de la tonalité de la carte
  (`public/js/audio.js`). C'est ce qui rend le jeu de démonstration réellement
  écoutable sans embarquer de fichiers audio.

Dans les deux cas un `AnalyserNode` alimente le visualiseur et l'énergie
lumineuse du fragment sélectionné.

### Le lien privé, sans compte

Chaque carte dispose d'un jeton non devinable : `/carte/r/<token>`. La personne
ouvre le lien, remplit trois étapes — son morceau, qui elle est, quand elle sera
là — et rien d'autre n'est exposé. L'API de partage n'accepte qu'une liste
blanche de champs : le statut, l'ordre et la mise en avant ne peuvent pas être
modifiés par ce biais. Un QR code est généré depuis l'admin.

### L'espace éditeur

- **Tableau de bord** — comptes, activité récente, éléments à compléter, journal
  des actions.
- **Projets** — liste filtrable, réordonnancement par glisser-déposer, éditeur
  complet (textes, couverture avec extraction automatique des couleurs, crédits
  liés aux cartes, galerie, hero, SEO), publication/dépublication, duplication,
  aperçu des brouillons.
- **Cartes** — le configurateur décrit ci-dessus, en trois colonnes : blocs à
  gauche, champs au centre, **aperçu 3D live à droite** qui reflète immédiatement
  les réglages d'orbite et les couleurs. Import CSV en masse, liens de partage.
- **Hero 3D** — textes, palette, accents du morph, géométrie, amplitude de
  respiration, rotation, parallaxe, zoom, densité de poussière, nombre de
  fragments, audio.
- **Paramètres** — marque, SEO par défaut, sections de l'accueil, pied de page,
  compte éditeur, export JSON complet.

Sauvegarde par `Ctrl`/`Cmd + S`, autosauvegarde de la carte après 4 s
d'inactivité, et alerte avant de quitter un formulaire non enregistré.

---

## Architecture

```
server/
├── index.js          Express : middlewares, statiques, routes, SEO, 404
├── pages.js          construction des pages HTML
├── render.js         fragments partagés (head, en-tête, pied de page, tuiles)
├── store.js          persistance JSON, écritures atomiques, slugs
├── auth.js           PBKDF2, sessions signées HMAC, garde-fous de débit
├── lib.js            normalisation et bornage des données, vues publiques
├── audit.js          journal des actions d'édition
├── seed-data.js      jeu de démonstration versionné
└── routes/           public.js · admin.js · share.js

public/
├── css/              tokens · base · hero · site · admin
├── js/               scene.js · audio.js · hero.js · player.js · fill.js
│   └── admin/        app.js · api.js · ui.js · preview.js · views/
├── vendor/three/     three.js r128 **en local**, avec SRI
└── media/            pochettes et extraits téléversés (hors Git)

data/                 JSON de production (hors Git, hors du seed)
tests/smoke.test.js   39 tests de bout en bout
docs/AUDIT.md         audit, spécifications et plan de livraison
```

### Choix techniques

**Express + JSON sur disque, zéro build.** Pas de base de données, pas d'ORM,
pas d'étape de compilation : `npm start` et c'est en ligne. Les écritures sont
atomiques (fichier temporaire puis renommage), et un JSON corrompu est mis en
quarantaine plutôt que de mettre le site à terre.

**three.js est vendu en local.** La version d'origine le chargeait depuis cdnjs,
sans SRI ni repli : une indisponibilité du CDN laissait le site entier blanc.
C'est désormais un fichier local avec empreinte `integrity`, calculée au
démarrage sur le fichier réellement présent — elle ne peut pas se
désynchroniser après une mise à jour.

**Rendu serveur du contenu critique.** Les projets, les cartes et leurs
métadonnées sont rendus par Express, pas par du JavaScript : un robot non-JS
voit le contenu. Les données nécessaires au client passent par une île JSON
plutôt que par un second aller-retour.

**La respiration des sommets est passée en vertex shader.** La version d'origine
réécrivait tout le buffer de positions sur le CPU à chaque frame — le poste le
plus cher de la boucle sur le nœud torique (~8 700 sommets). La même formule est
maintenant évaluée sur le GPU.

**Le rendu est suspendu** quand l'onglet est masqué ou quand la scène sort du
viewport (`IntersectionObserver` + `visibilitychange`). Les ombres ne sont
recalculées que pendant le morph.

---

## Accessibilité, SEO, sécurité

Corrections appliquées depuis l'audit :

- `<!DOCTYPE html>`, landmarks `header` / `main` / `footer`, lien d'évitement.
- La scène a un `role="img"`, un `aria-label`, et **un équivalent textuel** :
  une liste de boutons, une par fragment, masquée jusqu'au focus. Les flèches
  gauche/droite parcourent les cartes au clavier, `Échap` ferme le panneau.
- `prefers-reduced-motion` coupe la rotation libre, la respiration et le pulse ;
  le morph devient une bascule immédiate.
- `touch-action: none` sur le canvas, et **pince à deux doigts** pour le zoom
  tactile, absent de la version d'origine.
- Repli sans WebGL : message explicite et liste des cartes en mode statique.
- Les textes de 10 px passent sur une variable dédiée `--muted-strong`
  (5,41:1 sur le fond) ; l'accent reste réservé aux grands textes (4,56:1).
- Meta `description`, Open Graph, Twitter, `canonical`, favicon SVG, manifest,
  `robots.txt` et `sitemap.xml` générés depuis les données publiées — les
  brouillons en sont exclus.
- JSON-LD `Person` + `MusicRecording` sur chaque page de carte.
- Les brouillons renvoient un vrai **404**, pas une page 404 en HTTP 200.
- Cookie de session `HttpOnly` + `SameSite=Lax` + `Secure` en production, jeton
  signé HMAC, 5 tentatives de connexion par 15 minutes, message d'erreur
  identique que l'e-mail ou le mot de passe soit faux.
- En-têtes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` ; `noindex` sur tout l'espace éditeur.
- Tout contenu saisi est échappé au rendu, et borné à la normalisation
  (`lib.js`) : types garantis, longueurs plafonnées, valeurs numériques bornées.
- Uploads validés par liste blanche de MIME, renommés, limités à 8 Mo ; la
  suppression de média ne peut pas sortir du dossier `public/media`.

---

## Données

`data/` contient le JSON de production et est **exclu de Git** — seul le seed est
versionné. Pour sauvegarder : **Admin → Paramètres → Exporter toutes les
données**. Pour repartir du seed : `npm run seed`.

`MONDE_M_DATA_DIR` permet de pointer vers un autre dossier — c'est ce qu'utilise
la suite de tests pour ne jamais écrire dans `data/`.

Les médias téléversés vont dans `public/media/{covers,previews,uploads}/`,
également hors Git.

---

## Provenance

Le concept de carte musicale — une personne, un morceau, une pochette qui
devient son identité, un lien privé de remplissage sans compte, une source de
vérité unique — est repris de [dispoo.app](https://dispoo.app/) (AIME) et
traduit pour un usage universel plutôt qu'événementiel. L'analyse détaillée,
l'écart avec l'existant et le modèle de données complet sont dans
[`docs/AUDIT.md`](docs/AUDIT.md).

Le hero three.js d'origine est conservé dans [`docs/hero-origine.html`](docs/hero-origine.html)
à titre de référence ; il est désormais servi par `public/js/scene.js`.
