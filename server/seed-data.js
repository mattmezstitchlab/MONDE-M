/**
 * Jeu de données de démonstration MONDE-M.
 *
 * Ce fichier est **versionné** : il sert de référence et de point de départ.
 * Les données réellement saisies depuis l'admin vivent dans `data/*.json`,
 * qui est exclu de Git (voir `.gitignore`).
 *
 * Modèle : voir docs/AUDIT.md §6.
 */

const now = new Date().toISOString();

/** Identifiant court et stable, sans dépendance externe. */
let seq = 0;
export function uid(prefix = 'id') {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36).slice(-4)}${seq.toString(36)}${rand}`;
}

/* ------------------------------------------------------------------ */
/* Utilitaires de construction                                         */
/* ------------------------------------------------------------------ */

const identity = (o = {}) => ({
  displayName: '',
  firstName: '',
  lastName: '',
  pronouns: '',
  avatarUrl: '',
  bio: '',
  tagline: '',
  city: '',
  country: 'France',
  timezone: 'Europe/Paris',
  locale: 'fr-FR',
  birthdate: '',
  languages: ['fr'],
  ...o
});

const contact = (o = {}) => ({
  email: '',
  emailPublic: false,
  phone: '',
  phonePublic: false,
  address: '',
  addressPublic: false,
  website: '',
  socials: [],
  ...o
});

const music = (o = {}) => ({
  trackTitle: '',
  artist: '',
  album: '',
  year: null,
  genre: '',
  bpm: 100,
  key: 'C',
  duration: 210,
  isrc: '',
  coverUrl: '',
  coverColors: { dominant: '#b5541d', accent: '#141414', bg: '#f6f6f3' },
  preview: {
    url: '',
    start: 30,
    end: 60,
    volume: 0.8,
    // `synth: true` → l'extrait est généré à la volée dans le navigateur
    // à partir de `bpm` et `key`. Utilisé par le jeu de démonstration, qui
    // n'embarque aucun fichier audio. Un upload réel pose `url` et `synth:false`.
    synth: true
  },
  external: { spotify: '', apple: '', deezer: '', youtube: '' },
  note: '',
  explicit: false,
  ...o
});

const role = (o = {}) => ({
  label: '',
  type: 'guest', // guest | artist | client | crew | partner | staff
  organization: '',
  projectIds: [],
  moment: '',
  momentStart: '',
  momentEnd: '',
  tags: [],
  ...o
});

const presence = (o = {}) => ({
  rsvp: 'pending', // pending | confirmed | maybe | declined
  arrival: '',
  departure: '',
  attendMoments: [],
  companions: 0,
  table: '',
  group: '',
  dietary: '',
  accessibility: '',
  transport: { mode: '', from: '', seats: 0 },
  contactDayOf: '',
  ...o
});

const visual = (o = {}) => ({
  accent: '#b5541d',
  orbit: {
    radius: 3.2 + Math.random() * 1.5,
    speed: (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? -1 : 1),
    phase: Math.random() * Math.PI * 2,
    yBase: (Math.random() - 0.5) * 2.6,
    size: 0.07 + Math.random() * 0.09
  },
  geometry: 'icosa',
  textureUrl: '',
  emitOnPlay: true,
  ...o
});

const publish = (o = {}) => ({
  order: 0,
  featured: true,
  publicUrl: '',
  shareToken: '',
  shareEnabled: true,
  shareExpiresAt: '',
  qr: '',
  seo: { title: '', description: '', ogImage: '' },
  ...o
});

/**
 * Construit une carte complète à partir d'un objet partiel.
 * Les blocs peuvent être passés à plat : `{ identity: {...}, music: {...} }`.
 */
export function makeCard(input) {
  const id = input.id || uid('c');
  const slug = input.slug || '';
  const v = visual(input.visual);
  const m = music(input.music);
  v.accent = v.accent || m.coverColors?.dominant || '#b5541d';
  return {
    id,
    slug,
    status: input.status || 'published',
    createdAt: now,
    updatedAt: now,
    publishedAt: input.status === 'draft' ? '' : now,
    identity: identity(input.identity),
    contact: contact(input.contact),
    music: m,
    role: role(input.role),
    presence: presence(input.presence),
    visual: v,
    publish: publish(input.publish)
  };
}

export function makeProject(input) {
  const id = input.id || uid('p');
  return {
    id,
    slug: input.slug || '',
    status: 'published',
    order: 0,
    featured: false,
    title: '',
    subtitle: '',
    category: 'installation',
    tags: [],
    summary: '',
    body: '',
    credits: [],
    cover: { url: '', alt: '', colors: { dominant: '#b5541d', accent: '#141414' } },
    gallery: [],
    media: { videoUrl: '', posterUrl: '', audioUrl: '' },
    client: '',
    year: new Date().getFullYear(),
    date: new Date().toISOString().slice(0, 10),
    links: [],
    hero: { mode: 'inherit', geometry: 'icosa', accent: '#b5541d' },
    seo: { title: '', description: '', ogImage: '', noindex: false },
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    ...input
  };
}

/* ------------------------------------------------------------------ */
/* Les projets publiés                                                 */
/* ------------------------------------------------------------------ */

export const seedProjects = [
  makeProject({
    id: 'p_atlas',
    slug: 'atlas-sonore',
    order: 1,
    featured: true,
    title: 'Atlas sonore',
    subtitle: 'Douze personnes, un territoire, une seule carte',
    category: 'installation',
    tags: ['3D', 'WebGL', 'musique', 'cartographie'],
    summary:
      'Un globe navigable où chaque point est une personne. On approche, la pochette apparaît, l’extrait démarre : le territoire se lit comme une partition.',
    body:
      "Atlas sonore rassemble douze personnes liées au studio — collaborateurs, clients, artistes invités — et leur donne à chacune un morceau.\n\n" +
      "La pochette devient l’identité : c’est elle qu’on reconnaît dans la scène, elle qui colore le fragment en orbite, elle qui porte l’extrait.\n\n" +
      "L’installation a été présentée en continu pendant trois semaines. Les visiteurs déplaçaient le globe, s’arrêtaient sur une carte, écoutaient. Aucune interface explicative : le geste suffisait.",
    credits: [
      { role: 'Conception & 3D', name: 'Matt', cardId: 'c_matt' },
      { role: 'Saxophone, captation', name: 'CosmosSax', cardId: 'c_cosmos' },
      { role: 'Voix', name: 'Awa Ndiaye', cardId: 'c_awa' },
      { role: 'Électronique', name: 'Léa Mercier', cardId: 'c_lea' }
    ],
    cover: {
      url: '',
      alt: 'Globe sombre traversé de points orangés en orbite',
      colors: { dominant: '#b5541d', accent: '#141414' }
    },
    client: 'MONDE-M — production propre',
    year: 2026,
    date: '2026-06-14',
    links: [{ label: 'Voir la scène', url: '/' }],
    hero: { mode: 'override', geometry: 'icosa', accent: '#b5541d' },
    seo: {
      title: 'Atlas sonore — installation 3D · MONDE-M',
      description:
        'Douze personnes, douze morceaux, un globe navigable. Une installation WebGL où la pochette devient l’identité.'
    }
  }),

  makeProject({
    id: 'p_mondragon',
    slug: 'mondragon',
    order: 2,
    featured: true,
    title: 'Mondragon',
    subtitle: 'Une forme, deux mondes',
    category: 'web',
    tags: ['WebGL', 'identite', 'morph'],
    summary:
      'L’identité du studio tient dans un seul objet : un icosaèdre qui respire et bascule en nœud torique au clic. Deux géométries, deux accents, un même monde.',
    body:
      "Mondragon est la pièce d’origine de MONDE-M : un hero entièrement en trois.js, sans image, sans vidéo.\n\n" +
      "La géométrie respire — chaque sommet est déplacé le long de sa normale par une sinusoïde composite. Le morph contracte la forme jusqu’à presque rien, échange les géométries à mi-course, puis la fait renaître avec un rebond.\n\n" +
      "La bascule change aussi la lumière : l’accent passe de la terre (#b5541d) à l’électrique (#2e5cff), sur le filaire, sur la source ponctuelle et jusque dans les variables CSS de la page. La 3D et le texte changent de monde ensemble.",
    credits: [
      { role: 'Direction & code', name: 'Matt', cardId: 'c_matt' },
      { role: 'Typographie', name: 'Sofia Reyes', cardId: 'c_sofia' },
      { role: 'Son', name: 'Jonas Keller', cardId: 'c_jonas' }
    ],
    cover: {
      url: '',
      alt: 'Icosaèdre noir sur fond ivoire, cerclé d’un filaire orangé',
      colors: { dominant: '#2e5cff', accent: '#141414' }
    },
    client: 'MONDE-M',
    year: 2026,
    date: '2026-02-03',
    links: [{ label: 'Ouvrir le hero', url: '/' }],
    hero: { mode: 'override', geometry: 'knot', accent: '#2e5cff' },
    seo: {
      title: 'Mondragon — identité WebGL · MONDE-M',
      description:
        'Un icosaèdre qui respire et bascule en nœud torique. L’identité temps réel du studio MONDE-M.'
    }
  }),

  makeProject({
    id: 'p_cartes',
    slug: 'carte-universelle',
    order: 3,
    featured: true,
    title: 'Carte universelle',
    subtitle: 'Une personne, un morceau, une carte',
    category: 'identite',
    tags: ['musique', 'donnees', 'partage'],
    summary:
      'Le système qui remplace trois listes par un objet unique : la carte porte l’identité, le rôle, les disponibilités et le morceau d’une personne — et sa pochette devient son visage.',
    body:
      "Fini les tableaux de personnes, les formulaires de présence et les sondages musicaux tenus séparément.\n\n" +
      "Chaque personne liée à un projet choisit un morceau. Ce morceau devient sa carte : sa réponse, son rôle, ses disponibilités et les moments où elle sera là.\n\n" +
      "Le parcours tient en trois étapes — choisir son morceau, créer sa carte, indiquer quand elle sera présente. La carte porte l’essentiel, pas un formulaire.\n\n" +
      "Les crédits d’un projet, les groupes, les tables et la timeline se rattachent aux mêmes cartes : jamais à un second système.",
    credits: [
      { role: 'Conception du modèle', name: 'Matt', cardId: 'c_matt' },
      { role: 'Identité & accès', name: 'Nils Aubert', cardId: 'c_nils' },
      { role: 'Illustration sonore', name: 'Yuki Tanaka', cardId: 'c_yuki' }
    ],
    cover: {
      url: '',
      alt: 'Grille de pochettes carrées de tailles variées',
      colors: { dominant: '#c8871f', accent: '#141414' }
    },
    client: 'MONDE-M',
    year: 2026,
    date: '2026-08-21',
    links: [{ label: 'Voir toutes les cartes', url: '/cartes' }],
    hero: { mode: 'override', geometry: 'knot', accent: '#c8871f' },
    seo: {
      title: 'Carte universelle musicale · MONDE-M',
      description:
        'Une personne, un morceau, une carte. Identité, rôle, disponibilités et pochette réunis dans un seul objet partageable.'
    }
  }),

  makeProject({
    id: 'p_nuitblanche',
    slug: 'nuit-blanche',
    order: 4,
    featured: false,
    title: 'Nuit blanche',
    subtitle: 'Live audiovisuel, six heures',
    category: 'live',
    tags: ['live', 'son', 'lumiere'],
    summary:
      'Un set continu de six heures où la scène 3D réagit au signal audio : les fragments en orbite s’écartent quand le morceau monte, la lumière accentuée pulse sur le temps.',
    body:
      "Nuit blanche a été jouée une seule fois, dans un hangar de Bouray-sur-Juine, de minuit à six heures.\n\n" +
      "La scène était projetée sur trois mètres. Le saxophone était capté, analysé, et son niveau pilotait le rayon orbital des fragments. Quand Malik attaquait un chorus, les douze points s’écartaient ; quand le son retombait, ils se resserraient.\n\n" +
      "Aucun mapping manuel : l’analyseur fournissait l’énergie, la scène faisait le reste.",
    credits: [
      { role: 'Saxophone', name: 'Malik Benali', cardId: 'c_malik' },
      { role: 'Scène temps réel', name: 'Matt', cardId: 'c_matt' },
      { role: 'Électronique', name: 'Léa Mercier', cardId: 'c_lea' }
    ],
    cover: {
      url: '',
      alt: 'Silhouette de saxophoniste devant un halo bleu électrique',
      colors: { dominant: '#2e5cff', accent: '#0b0b0c' }
    },
    client: 'Collectif Halte',
    year: 2026,
    date: '2026-04-27',
    links: [],
    hero: { mode: 'inherit', geometry: 'knot', accent: '#2e5cff' },
    seo: {
      title: 'Nuit blanche — live audiovisuel · MONDE-M',
      description: 'Six heures de set où la scène 3D est pilotée par l’analyseur audio du saxophone.'
    }
  }),

  makeProject({
    id: 'p_sillage',
    slug: 'sillage',
    order: 5,
    featured: false,
    title: 'Sillage',
    subtitle: 'Court-métrage génératif',
    category: 'film',
    tags: ['generatif', 'film', '3D'],
    summary:
      'Trois minutes d’images calculées image par image : une trace de particules qui suit la ligne de chant d’un morceau de koto.',
    body:
      "Sillage est né d’une contrainte : ne rien filmer.\n\n" +
      "La partition a été relevée, puis chaque note est devenue une émission de particules. Le résultat a été rendu en 4K, image par image, sans caméra virtuelle — uniquement des positions calculées.\n\n" +
      "Yuki Tanaka a rejoué le morceau en direct lors de la première projection.",
    credits: [
      { role: 'Koto', name: 'Yuki Tanaka', cardId: 'c_yuki' },
      { role: 'Rendu & particules', name: 'Matt', cardId: 'c_matt' }
    ],
    cover: {
      url: '',
      alt: 'Traînée de particules blanches sur fond profond',
      colors: { dominant: '#7a9cc6', accent: '#0b0b0c' }
    },
    client: 'Festival Écran court',
    year: 2025,
    date: '2025-11-08',
    links: [],
    hero: { mode: 'inherit', geometry: 'icosa', accent: '#7a9cc6' },
    seo: {
      title: 'Sillage — court-métrage génératif · MONDE-M',
      description: 'Trois minutes d’images calculées, une note à la fois, sur une partition de koto.'
    }
  }),

  makeProject({
    id: 'p_terrain',
    slug: 'terrain-vague',
    order: 6,
    featured: false,
    title: 'Terrain vague',
    subtitle: 'Édition imprimée, 96 pages',
    category: 'edition',
    tags: ['print', 'editorial', 'typographie'],
    summary:
      'Un livre d’entretiens avec neuf personnes du quartier, chacune ouverte par son morceau et sa pochette en pleine page.',
    body:
      "Terrain vague applique la carte universelle au papier.\n\n" +
      "Neuf entretiens, neuf personnes, neuf morceaux. Chaque entretien s’ouvre par la pochette en pleine page, imprimée en trame grossière, suivie de la phrase que la personne avait choisie pour sa carte.\n\n" +
      "Sofia Reyes a composé l’ensemble en deux caractères : un serif de titrage et une sans-serif de labeur, sans aucune graisse intermédiaire.",
    credits: [
      { role: 'Direction artistique', name: 'Sofia Reyes', cardId: 'c_sofia' },
      { role: 'Édition', name: 'Nils Aubert', cardId: 'c_nils' }
    ],
    cover: {
      url: '',
      alt: 'Double page imprimée, pochette en pleine page à gauche',
      colors: { dominant: '#8a8f6c', accent: '#141414' }
    },
    client: 'Éditions du Larris',
    year: 2025,
    date: '2025-09-19',
    links: [],
    hero: { mode: 'inherit', geometry: 'icosa', accent: '#8a8f6c' },
    seo: {
      title: 'Terrain vague — édition imprimée · MONDE-M',
      description: 'Neuf entretiens, neuf morceaux, neuf pochettes en pleine page.'
    }
  }),

  makeProject({
    id: 'p_brouillon',
    slug: 'halo-en-cours',
    status: 'draft',
    order: 99,
    featured: false,
    title: 'Halo',
    subtitle: 'Brouillon — sculpture lumineuse',
    category: 'installation',
    tags: ['lumiere'],
    summary: 'Brouillon de démonstration : ce projet n’apparaît pas sur le site public.',
    body: 'Projet en cours de rédaction, volontairement laissé en brouillon dans le jeu de démonstration.',
    credits: [],
    cover: { url: '', alt: '', colors: { dominant: '#6f6f6a', accent: '#141414' } },
    client: '',
    year: 2026,
    date: '2026-09-10',
    links: [],
    hero: { mode: 'inherit', geometry: 'icosa', accent: '#6f6f6a' },
    seo: { title: '', description: '', ogImage: '', noindex: true }
  })
];

/* ------------------------------------------------------------------ */
/* Les cartes — une par fragment du hero                               */
/* ------------------------------------------------------------------ */

export const seedCards = [
  makeCard({
    id: 'c_matt',
    slug: 'matt-superstition',
    identity: identity({
      displayName: 'Matt',
      firstName: 'Matt',
      lastName: 'Mez',
      pronouns: 'il',
      bio: 'Je construis des mondes qui répondent au regard.',
      tagline: 'Conception & temps réel',
      city: 'Bouray-sur-Juine',
      country: 'France',
      languages: ['fr', 'en']
    }),
    contact: contact({
      email: 'atelier@monde-m.fr',
      emailPublic: true,
      website: 'https://monde-m.fr',
      socials: [{ label: 'GitHub', url: 'https://github.com/mattmezstitchlab' }]
    }),
    music: music({
      trackTitle: 'Superstition',
      artist: 'Stevie Wonder',
      album: 'Talking Book',
      year: 1972,
      genre: 'Funk / Soul',
      bpm: 100,
      key: 'Ebm',
      duration: 265,
      coverColors: { dominant: '#c8871f', accent: '#2b1a06', bg: '#f6f6f3' },
      note: 'À jouer fort, au moment où la forme bascule.',
      external: { spotify: 'https://open.spotify.com/track/1H4idkmruFoJBglsD1S9er' }
    }),
    role: role({
      label: 'Fondateur',
      type: 'crew',
      organization: 'MONDE-M',
      projectIds: ['p_atlas', 'p_mondragon', 'p_cartes', 'p_nuitblanche', 'p_sillage'],
      moment: 'Ouverture du hero',
      momentStart: '00:00',
      tags: ['studio', '3d', 'direction']
    }),
    presence: presence({
      rsvp: 'confirmed',
      arrival: '09:00',
      departure: '23:00',
      attendMoments: ['conception', 'rendu', 'diffusion'],
      companions: 0,
      group: 'Atelier'
    }),
    visual: visual({
      accent: '#c8871f',
      orbit: { radius: 3.4, speed: 0.19, phase: 0.4, yBase: 0.5, size: 0.15 },
      geometry: 'icosa'
    }),
    publish: publish({ order: 1, featured: true })
  }),

  makeCard({
    id: 'c_cosmos',
    slug: 'cosmossax-dancing-queen',
    identity: identity({
      displayName: 'CosmosSax',
      firstName: 'Cosmos',
      lastName: '',
      pronouns: 'il',
      bio: 'Saxophoniste. Je joue là où on ne m’attend pas.',
      tagline: 'Saxophone live',
      city: 'Lille',
      languages: ['fr', 'en']
    }),
    contact: contact({
      email: 'book@cosmossax.fr',
      emailPublic: true,
      socials: [{ label: 'Instagram', url: 'https://instagram.com/cosmossax' }]
    }),
    music: music({
      trackTitle: 'Dancing Queen',
      artist: 'ABBA',
      album: 'Arrival',
      year: 1976,
      genre: 'Disco / Pop',
      bpm: 101,
      key: 'A',
      duration: 231,
      coverColors: { dominant: '#2e6bd6', accent: '#f2d24b', bg: '#f6f6f3' },
      note: 'Ouverture de bal, en version dépouillée, sax seul.',
      external: { spotify: 'https://open.spotify.com/track/4NtUY5IGzHCaqfZemmAu56' }
    }),
    role: role({
      label: 'Saxophoniste',
      type: 'artist',
      organization: 'CosmosSax',
      projectIds: ['p_atlas', 'p_nuitblanche'],
      moment: 'Ouverture de bal',
      momentStart: '21:30',
      momentEnd: '22:00',
      tags: ['live', 'cocktail']
    }),
    presence: presence({
      rsvp: 'confirmed',
      arrival: '20:30',
      departure: '23:30',
      attendMoments: ['cocktail', 'ouverture'],
      companions: 1,
      group: 'Artistes',
      transport: { mode: 'train', from: 'Lille Flandres', seats: 2 }
    }),
    visual: visual({
      accent: '#2e6bd6',
      orbit: { radius: 4.1, speed: -0.24, phase: 1.9, yBase: -0.9, size: 0.13 },
      geometry: 'knot'
    }),
    publish: publish({ order: 2, featured: true })
  }),

  makeCard({
    id: 'c_lea',
    slug: 'lea-mercier-strobe',
    identity: identity({
      displayName: 'Léa Mercier',
      firstName: 'Léa',
      lastName: 'Mercier',
      pronouns: 'elle',
      bio: 'Productrice de musique électronique. Je préfère les basses aux mélodies.',
      tagline: 'Électronique live',
      city: 'Paris',
      languages: ['fr']
    }),
    contact: contact({ email: '', website: 'https://leamercier.bandcamp.com' }),
    music: music({
      trackTitle: 'Strobe',
      artist: 'deadmau5',
      album: 'For Lack of a Better Name',
      year: 2009,
      genre: 'Progressive house',
      bpm: 128,
      key: 'F#m',
      duration: 634,
      coverColors: { dominant: '#1fa8a0', accent: '#0d1b1a', bg: '#f6f6f3' },
      note: 'La montée de trois minutes, celle qui fait lever la salle.',
      external: { deezer: 'https://www.deezer.com/track/3536221' }
    }),
    role: role({
      label: 'Productrice',
      type: 'artist',
      organization: 'Mercier Audio',
      projectIds: ['p_atlas', 'p_nuitblanche'],
      moment: 'Soirée',
      momentStart: '23:00',
      tags: ['live', 'son']
    }),
    presence: presence({
      rsvp: 'confirmed',
      arrival: '22:00',
      departure: '04:00',
      attendMoments: ['diner', 'soiree'],
      companions: 0,
      group: 'Artistes',
      dietary: 'Végétarienne'
    }),
    visual: visual({
      accent: '#1fa8a0',
      orbit: { radius: 3.8, speed: 0.31, phase: 3.4, yBase: 1.1, size: 0.1 },
      geometry: 'knot'
    }),
    publish: publish({ order: 3, featured: true })
  }),

  makeCard({
    id: 'c_sofia',
    slug: 'sofia-reyes-bach',
    identity: identity({
      displayName: 'Sofia Reyes',
      firstName: 'Sofia',
      lastName: 'Reyes',
      pronouns: 'elle',
      bio: 'Directrice artistique. Un caractère de titrage, un de labeur, rien d’autre.',
      tagline: 'Typographie & direction artistique',
      city: 'Lyon',
      languages: ['fr', 'es', 'en']
    }),
    contact: contact({ email: 'sofia@reyes.studio', emailPublic: true }),
    music: music({
      trackTitle: 'Partita n°2 en ut mineur, BWV 826',
      artist: 'Johann Sebastian Bach',
      album: 'Six Partitas',
      year: 1730,
      genre: 'Classique / clavecin',
      bpm: 72,
      key: 'Cm',
      duration: 1180,
      coverColors: { dominant: '#8a8f6c', accent: '#1d1f16', bg: '#f6f6f3' },
      note: 'La Sinfonia d’ouverture. Grave, puis l’andante.',
      external: { apple: 'https://music.apple.com/fr/album/bach-six-partitas/1440935990' }
    }),
    role: role({
      label: 'Directrice artistique',
      type: 'partner',
      organization: 'Reyes Studio',
      projectIds: ['p_mondragon', 'p_terrain'],
      moment: 'Conception éditoriale',
      tags: ['type', 'print']
    }),
    presence: presence({ rsvp: 'confirmed', companions: 0, group: 'Partenaires' }),
    visual: visual({
      accent: '#8a8f6c',
      orbit: { radius: 4.5, speed: -0.16, phase: 5.1, yBase: -0.3, size: 0.11 },
      geometry: 'icosa'
    }),
    publish: publish({ order: 4, featured: true })
  }),

  makeCard({
    id: 'c_nils',
    slug: 'nils-aubert-digital-love',
    identity: identity({
      displayName: 'Nils Aubert',
      firstName: 'Nils',
      lastName: 'Aubert',
      pronouns: 'il',
      bio: 'Développeur. Je fais tenir des choses fragiles.',
      tagline: 'Développement & architecture',
      city: 'Nantes',
      languages: ['fr', 'en']
    }),
    contact: contact({ website: 'https://nils.aubert.dev' }),
    music: music({
      trackTitle: 'Digital Love',
      artist: 'Daft Punk',
      album: 'Discovery',
      year: 2001,
      genre: 'French touch',
      bpm: 100,
      key: 'Db',
      duration: 301,
      coverColors: { dominant: '#d94f70', accent: '#2a0d16', bg: '#f6f6f3' },
      note: 'Le solo de guitare à 2 min 20, évidemment.',
      external: { spotify: 'https://open.spotify.com/track/2VEgrxrsDeOTVy7aL5v5TX' }
    }),
    role: role({
      label: 'Développeur',
      type: 'crew',
      organization: 'MONDE-M',
      projectIds: ['p_cartes', 'p_terrain'],
      moment: 'Intégration',
      tags: ['code', 'infra']
    }),
    presence: presence({ rsvp: 'confirmed', companions: 1, group: 'Atelier' }),
    visual: visual({
      accent: '#d94f70',
      orbit: { radius: 3.2, speed: 0.27, phase: 2.2, yBase: -1.2, size: 0.09 },
      geometry: 'icosa'
    }),
    publish: publish({ order: 5, featured: true })
  }),

  makeCard({
    id: 'c_awa',
    slug: 'awa-ndiaye-yankady',
    identity: identity({
      displayName: 'Awa Ndiaye',
      firstName: 'Awa',
      lastName: 'Ndiaye',
      pronouns: 'elle',
      bio: 'Chanteuse. J’apprends les morceaux avant de lire les partitions.',
      tagline: 'Voix',
      city: 'Dakar',
      country: 'Sénégal',
      timezone: 'Africa/Dakar',
      languages: ['fr', 'wo', 'en']
    }),
    contact: contact({ email: 'awa.ndiaye@voix.sn', emailPublic: true }),
    music: music({
      trackTitle: 'Yankady',
      artist: 'Orchestre Baobab',
      album: 'Specialiste de tout',
      year: 2007,
      genre: 'Afro-cubain',
      bpm: 112,
      key: 'Gm',
      duration: 287,
      coverColors: { dominant: '#e0a21c', accent: '#3a2405', bg: '#f6f6f3' },
      note: 'À capella sur les huit premières mesures.',
      external: { youtube: 'https://www.youtube.com/watch?v=OrchestreBaobabYankady' }
    }),
    role: role({
      label: 'Chanteuse',
      type: 'artist',
      projectIds: ['p_atlas'],
      moment: 'Cérémonie',
      momentStart: '16:00',
      tags: ['voix', 'live']
    }),
    presence: presence({
      rsvp: 'maybe',
      arrival: '14:30',
      attendMoments: ['ceremonie', 'cocktail'],
      companions: 2,
      group: 'Artistes',
      transport: { mode: 'avion', from: 'Dakar', seats: 3 }
    }),
    visual: visual({
      accent: '#e0a21c',
      orbit: { radius: 4.3, speed: 0.14, phase: 0.9, yBase: 0.2, size: 0.12 },
      geometry: 'knot'
    }),
    publish: publish({ order: 6, featured: true })
  }),

  makeCard({
    id: 'c_yuki',
    slug: 'yuki-tanaka-opus-17',
    identity: identity({
      displayName: 'Yuki Tanaka',
      firstName: 'Yuki',
      lastName: 'Tanaka',
      pronouns: 'elle',
      bio: 'Koto et électronique. Le silence fait partie de la note.',
      tagline: 'Koto & électronique',
      city: 'Kyoto',
      country: 'Japon',
      timezone: 'Asia/Tokyo',
      locale: 'ja-JP',
      languages: ['ja', 'en', 'fr']
    }),
    contact: contact({}),
    music: music({
      trackTitle: 'Opus 17',
      artist: 'Ryuichi Sakamoto',
      album: 'async',
      year: 2017,
      genre: 'Ambient / néo-classique',
      bpm: 60,
      key: 'D',
      duration: 244,
      coverColors: { dominant: '#7a9cc6', accent: '#131c26', bg: '#f6f6f3' },
      note: 'Pour les moments où plus personne ne parle.',
      external: { apple: 'https://music.apple.com/jp/album/async/1218764834' }
    }),
    role: role({
      label: 'Musicienne',
      type: 'artist',
      projectIds: ['p_cartes', 'p_sillage'],
      moment: 'Projection',
      momentStart: '20:00',
      tags: ['ambient', 'live']
    }),
    presence: presence({ rsvp: 'confirmed', companions: 0, group: 'Artistes' }),
    visual: visual({
      accent: '#7a9cc6',
      orbit: { radius: 3.6, speed: -0.2, phase: 4.4, yBase: 1.3, size: 0.08 },
      geometry: 'icosa'
    }),
    publish: publish({ order: 7, featured: true })
  }),

  makeCard({
    id: 'c_malik',
    slug: 'malik-benali-aicha',
    identity: identity({
      displayName: 'Malik Benali',
      firstName: 'Malik',
      lastName: 'Benali',
      pronouns: 'il',
      bio: 'Sax alto. Le raï, c’est de la danse avant d’être de la musique.',
      tagline: 'Saxophone alto',
      city: 'Marseille',
      languages: ['fr', 'ar']
    }),
    contact: contact({ phone: '', phonePublic: false }),
    music: music({
      trackTitle: 'Aïcha',
      artist: 'Khaled',
      album: 'Sahra',
      year: 1996,
      genre: 'Raï',
      bpm: 96,
      key: 'Bbm',
      duration: 275,
      coverColors: { dominant: '#b5541d', accent: '#2b1408', bg: '#f6f6f3' },
      note: 'Reprise instrumentale, tempo ralenti de six.',
      external: { deezer: 'https://www.deezer.com/track/1187114' }
    }),
    role: role({
      label: 'Musicien',
      type: 'artist',
      projectIds: ['p_nuitblanche'],
      moment: 'Nuit blanche — chorus',
      momentStart: '02:00',
      momentEnd: '03:30',
      tags: ['live', 'nuit']
    }),
    presence: presence({
      rsvp: 'confirmed',
      arrival: '23:30',
      departure: '05:00',
      attendMoments: ['soiree', 'nuit'],
      companions: 0,
      group: 'Artistes'
    }),
    visual: visual({
      accent: '#b5541d',
      orbit: { radius: 4.7, speed: 0.22, phase: 5.8, yBase: -1.4, size: 0.1 },
      geometry: 'knot'
    }),
    publish: publish({ order: 8, featured: true })
  }),

  makeCard({
    id: 'c_jonas',
    slug: 'jonas-keller-arbos',
    identity: identity({
      displayName: 'Jonas Keller',
      firstName: 'Jonas',
      lastName: 'Keller',
      pronouns: 'il',
      bio: 'Violoncelliste et preneur de son. J’enregistre les salles avant les musiciens.',
      tagline: 'Violoncelle & captation',
      city: 'Berlin',
      country: 'Allemagne',
      timezone: 'Europe/Berlin',
      locale: 'de-DE',
      languages: ['de', 'fr', 'en']
    }),
    contact: contact({ email: 'jonas@keller-audio.de', emailPublic: false }),
    music: music({
      trackTitle: 'Arbos',
      artist: 'Arvo Pärt',
      album: 'Tabula Rasa',
      year: 1977,
      genre: 'Musique contemporaine',
      bpm: 54,
      key: 'A',
      duration: 183,
      coverColors: { dominant: '#5f5f5a', accent: '#141414', bg: '#f6f6f3' },
      note: 'Pièce pour cuivres. À écouter très bas.',
      external: { spotify: 'https://open.spotify.com/track/ArbosPart' }
    }),
    role: role({
      label: 'Violoncelliste',
      type: 'artist',
      projectIds: ['p_mondragon'],
      moment: 'Captation',
      tags: ['son', 'studio']
    }),
    presence: presence({ rsvp: 'declined', companions: 0, group: 'Artistes' }),
    visual: visual({
      accent: '#5f5f5a',
      orbit: { radius: 3.3, speed: -0.13, phase: 1.2, yBase: 0.8, size: 0.07 },
      geometry: 'icosa'
    }),
    publish: publish({ order: 9, featured: false })
  }),

  makeCard({
    id: 'c_attente',
    slug: 'carte-en-attente',
    status: 'draft',
    identity: identity({ displayName: 'Personne à compléter' }),
    music: music({ trackTitle: '', artist: '' }),
    role: role({ label: 'Invité', type: 'guest' }),
    presence: presence({ rsvp: 'pending' }),
    visual: visual({ orbit: { radius: 4.0, speed: 0.18, phase: 3.0, yBase: 0, size: 0.09 } }),
    publish: publish({ order: 99, featured: false, shareEnabled: true })
  })
];

/* ------------------------------------------------------------------ */
/* Configuration du hero et du site                                    */
/* ------------------------------------------------------------------ */

export const seedHero = {
  updatedAt: now,
  title: 'Une forme,',
  titleAccent: 'deux mondes.',
  eyebrow: 'TRANSFORMATION — EXPÉRIENCE TEMPS RÉEL',
  description:
    'Un espace vivant dont la géométrie répond à votre regard. Chaque point en orbite est une personne, et chaque personne a choisi son morceau. Explorez librement, cliquez une carte pour l’écouter.',
  ctaLabel: 'Lancer la transformation',
  secondaryCta: { label: 'Voir les cartes', href: '/cartes' },
  geometry: { idle: 'icosa', morphTarget: 'knot', breatheAmp: 0.055, breatheAmpKnot: 0.03 },
  palette: {
    bg: '#f6f6f3',
    ink: '#141414',
    muted: '#6f6f6a',
    mutedStrong: '#656560',
    accents: ['#b5541d', '#2e5cff']
  },
  fragments: { source: 'cards', count: 12, showDust: true, dustCount: 320 },
  motion: {
    idleSpin: 0.0016,
    parallax: 0.7,
    zoomMin: 6,
    zoomMax: 14,
    reducedMotionFallback: 'static'
  },
  audio: { autoplayPreview: false, volume: 0.8, fadeIn: 0.4 }
};

export const seedSettings = {
  updatedAt: now,
  site: {
    name: 'MONDE-M',
    brand: 'MONDE-M',
    baseline: 'Studio 3D — cartes musicales & projets',
    description:
      'MONDE-M publie des projets et des personnes. Chaque carte réunit l’identité, le rôle, les disponibilités et le morceau d’une personne : sa pochette devient son visage.',
    locale: 'fr_FR',
    url: '',
    email: 'atelier@monde-m.fr'
  },
  seo: {
    titleTemplate: '%s · MONDE-M',
    defaultTitle: 'MONDE-M — Une personne, un morceau, une carte',
    defaultDescription:
      'Studio 3D. Projets publiés et cartes musicales universelles : identité, rôle, disponibilités et morceau réunis dans un seul objet partageable.',
    ogImage: '',
    twitter: '',
    noindexDrafts: true
  },
  sections: {
    showProjects: true,
    showCards: true,
    showSteps: true,
    showFooter: true
  },
  footer: {
    legalName: 'MONDE-M',
    address: 'Bouray-sur-Juine, Île-de-France',
    links: [
      { label: 'Projets', href: '/projets' },
      { label: 'Cartes', href: '/cartes' },
      { label: 'Espace éditeur', href: '/admin' }
    ]
  }
};

export const seedUsers = [
  {
    id: 'u_admin',
    email: 'atelier@monde-m.fr',
    role: 'editor',
    displayName: 'Éditeur MONDE-M',
    createdAt: now
  }
];

export const defaultAdminCredentials = {
  email: 'atelier@monde-m.fr',
  password: 'mondra2026gon'
};
