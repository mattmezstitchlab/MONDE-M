/**
 * Normalisation des données et helpers partagés par les routes.
 */

/** Échappement HTML — utilisé partout où du contenu saisi est réinjecté. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PUBLIC_ROLES = new Set(['guest', 'artist', 'client', 'crew', 'partner', 'staff']);
const PUBLIC_STATUSES = new Set(['draft', 'published', 'archived']);

function str(v, max = 2000) {
  return String(v ?? '').slice(0, max);
}
function num(v, fallback = 0, min = -1e6, max = 1e6) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Nettoie une carte : types garantis, valeurs bornées, invariants respectés.
 * Utilisée à la création et à chaque mise à jour, côté admin comme côté lien
 * de partage public.
 */
export function normalizeCard(input = {}, existing = {}) {
  const base = { ...existing };
  const card = { ...base, ...input };

  const music = { ...(base.music || {}), ...(input.music || {}) };
  const preview = { ...(base.music?.preview || {}), ...(input.music?.preview || {}) };
  const external = { ...(base.music?.external || {}), ...(input.music?.external || {}) };
  const coverColors = {
    ...(base.music?.coverColors || {}),
    ...(input.music?.coverColors || {})
  };

  const visual = { ...(base.visual || {}), ...(input.visual || {}) };
  const orbit = { ...(base.visual?.orbit || {}), ...(input.visual?.orbit || {}) };

  const role = { ...(base.role || {}), ...(input.role || {}) };
  const presence = { ...(base.presence || {}), ...(input.presence || {}) };
  const identity = { ...(base.identity || {}), ...(input.identity || {}) };
  const contact = { ...(base.contact || {}), ...(input.contact || {}) };
  const publish = { ...(base.publish || {}), ...(input.publish || {}) };
  const seo = { ...(base.publish?.seo || {}), ...(input.publish?.seo || {}) };
  const transport = { ...(base.presence?.transport || {}), ...(input.presence?.transport || {}) };

  const bpm = num(music.bpm, 100, 20, 300);
  const duration = num(music.duration, 210, 1, 7200);

  const out = {
    ...card,
    status: PUBLIC_STATUSES.has(card.status) ? card.status : 'draft',

    identity: {
      displayName: str(identity.displayName, 80).trim(),
      firstName: str(identity.firstName, 80).trim(),
      lastName: str(identity.lastName, 80).trim(),
      pronouns: str(identity.pronouns, 30).trim(),
      avatarUrl: str(identity.avatarUrl, 500),
      bio: str(identity.bio, 600),
      tagline: str(identity.tagline, 120),
      city: str(identity.city, 80).trim(),
      country: str(identity.country, 80).trim(),
      timezone: str(identity.timezone, 60) || 'Europe/Paris',
      locale: str(identity.locale, 12) || 'fr-FR',
      birthdate: str(identity.birthdate, 10),
      languages: Array.isArray(identity.languages)
        ? identity.languages.slice(0, 8).map((l) => str(l, 8))
        : []
    },

    contact: {
      email: str(contact.email, 200).trim(),
      emailPublic: Boolean(contact.emailPublic),
      phone: str(contact.phone, 40).trim(),
      phonePublic: Boolean(contact.phonePublic),
      address: str(contact.address, 300),
      addressPublic: Boolean(contact.addressPublic),
      website: str(contact.website, 500),
      socials: Array.isArray(contact.socials)
        ? contact.socials
            .slice(0, 8)
            .map((s) => ({ label: str(s?.label, 40), url: str(s?.url, 500) }))
            .filter((s) => s.url)
        : []
    },

    music: {
      trackTitle: str(music.trackTitle, 160).trim(),
      artist: str(music.artist, 160).trim(),
      album: str(music.album, 160).trim(),
      year: music.year ? num(music.year, null, 1000, 2200) : null,
      genre: str(music.genre, 80).trim(),
      bpm: Math.round(bpm),
      key: str(music.key, 8).trim(),
      duration: Math.round(duration),
      isrc: str(music.isrc, 20).trim(),
      coverUrl: str(music.coverUrl, 500),
      coverColors: {
        dominant: str(coverColors.dominant, 9) || '#b5541d',
        accent: str(coverColors.accent, 9) || '#141414',
        bg: str(coverColors.bg, 9) || '#f6f6f3'
      },
      preview: {
        url: str(preview.url, 500),
        start: num(preview.start, 30, 0, 7200),
        end: num(preview.end, 60, 0, 7200),
        volume: num(preview.volume, 0.8, 0, 1),
        // Sans fichier ni synthèse explicite, l'extrait est généré dans le
        // navigateur à partir de bpm/tonalité (voir public/js/preview.js).
        synth: preview.url ? Boolean(preview.synth) : true
      },
      external: {
        spotify: str(external.spotify, 500),
        apple: str(external.apple, 500),
        deezer: str(external.deezer, 500),
        youtube: str(external.youtube, 500)
      },
      note: str(music.note, 400),
      explicit: Boolean(music.explicit)
    },

    role: {
      label: str(role.label, 80).trim(),
      type: PUBLIC_ROLES.has(role.type) ? role.type : 'guest',
      organization: str(role.organization, 120).trim(),
      projectIds: Array.isArray(role.projectIds) ? role.projectIds.slice(0, 40).map((v) => str(v, 40)) : [],
      moment: str(role.moment, 120).trim(),
      momentStart: str(role.momentStart, 8),
      momentEnd: str(role.momentEnd, 8),
      tags: Array.isArray(role.tags) ? role.tags.slice(0, 12).map((t) => str(t, 40)) : []
    },

    presence: {
      rsvp: ['pending', 'confirmed', 'maybe', 'declined'].includes(presence.rsvp)
        ? presence.rsvp
        : 'pending',
      arrival: str(presence.arrival, 8),
      departure: str(presence.departure, 8),
      attendMoments: Array.isArray(presence.attendMoments)
        ? presence.attendMoments.slice(0, 20).map((m) => str(m, 60))
        : [],
      companions: Math.round(num(presence.companions, 0, 0, 50)),
      table: str(presence.table, 40),
      group: str(presence.group, 60),
      dietary: str(presence.dietary, 200),
      accessibility: str(presence.accessibility, 300),
      transport: {
        mode: str(transport.mode, 40),
        from: str(transport.from, 120),
        seats: Math.round(num(transport.seats, 0, 0, 20))
      },
      contactDayOf: str(presence.contactDayOf, 200)
    },

    visual: {
      accent: str(visual.accent, 9) || coverColors.dominant || '#b5541d',
      orbit: {
        radius: num(orbit.radius, 3.8, 2, 7),
        speed: num(orbit.speed, 0.2, -1, 1),
        phase: num(orbit.phase, 0, 0, Math.PI * 2),
        yBase: num(orbit.yBase, 0, -2.5, 2.5),
        size: num(orbit.size, 0.1, 0.03, 0.4)
      },
      geometry: visual.geometry === 'knot' ? 'knot' : 'icosa',
      textureUrl: str(visual.textureUrl, 500),
      emitOnPlay: visual.emitOnPlay !== false
    },

    publish: {
      ...publish,
      order: Math.round(num(publish.order, 50, 0, 9999)),
      featured: Boolean(publish.featured),
      shareEnabled: publish.shareEnabled !== false,
      shareExpiresAt: str(publish.shareExpiresAt, 40),
      publicUrl: `/carte/${str(card.slug || existing.slug || '', 90)}`,
      seo: {
        title: str(seo.title, 120),
        description: str(seo.description, 300),
        ogImage: str(seo.ogImage, 500)
      }
    }
  };

  return out;
}

export function normalizeProject(input = {}, existing = {}) {
  const project = { ...existing, ...input };
  const cover = { ...(existing.cover || {}), ...(input.cover || {}) };
  const colors = { ...(existing.cover?.colors || {}), ...(input.cover?.colors || {}) };
  const hero = { ...(existing.hero || {}), ...(input.hero || {}) };
  const seo = { ...(existing.seo || {}), ...(input.seo || {}) };

  return {
    ...project,
    status: PUBLIC_STATUSES.has(project.status) ? project.status : 'draft',
    title: str(project.title, 120).trim(),
    subtitle: str(project.subtitle, 200).trim(),
    summary: str(project.summary, 500),
    body: str(project.body, 40000),
    category: str(project.category, 40) || 'installation',
    tags: Array.isArray(project.tags) ? project.tags.slice(0, 12).map((t) => str(t, 40)) : [],
    order: Math.round(num(project.order, 50, 0, 9999)),
    featured: Boolean(project.featured),
    year: project.year ? Math.round(num(project.year, new Date().getFullYear(), 1900, 2200)) : null,
    date: str(project.date, 10),
    client: str(project.client, 120),
    cover: {
      url: str(cover.url, 500),
      alt: str(cover.alt, 300),
      colors: {
        dominant: str(colors.dominant, 9) || '#b5541d',
        accent: str(colors.accent, 9) || '#141414'
      }
    },
    gallery: Array.isArray(project.gallery)
      ? project.gallery.slice(0, 40).map((g) => ({
          url: str(g?.url, 500),
          alt: str(g?.alt, 300),
          caption: str(g?.caption, 200),
          kind: g?.kind === 'video' ? 'video' : 'image'
        }))
      : [],
    media: {
      videoUrl: str(project.media?.videoUrl, 500),
      posterUrl: str(project.media?.posterUrl, 500),
      audioUrl: str(project.media?.audioUrl, 500)
    },
    credits: Array.isArray(project.credits)
      ? project.credits.slice(0, 60).map((c) => ({
          role: str(c?.role, 80),
          name: str(c?.name, 80),
          cardId: str(c?.cardId, 40)
        }))
      : [],
    links: Array.isArray(project.links)
      ? project.links.slice(0, 10).map((l) => ({ label: str(l?.label, 60), url: str(l?.url, 500) }))
      : [],
    hero: {
      mode: hero.mode === 'override' ? 'override' : 'inherit',
      geometry: hero.geometry === 'knot' ? 'knot' : 'icosa',
      accent: str(hero.accent, 9) || '#b5541d'
    },
    seo: {
      title: str(seo.title, 120),
      description: str(seo.description, 300),
      ogImage: str(seo.ogImage, 500),
      noindex: Boolean(seo.noindex)
    }
  };
}

/* ------------------------------------------------------------------ */
/* Vues                                                                */
/* ------------------------------------------------------------------ */

/** Vue publique d'une carte : retire ce qui n'est pas explicitement public. */
export function publicCard(card) {
  if (!card) return null;
  const c = { ...card };
  const contact = { ...c.contact };
  if (!contact.emailPublic) delete contact.email;
  if (!contact.phonePublic) delete contact.phone;
  if (!contact.addressPublic) delete contact.address;
  contact.emailPublic = undefined;
  contact.phonePublic = undefined;
  contact.addressPublic = undefined;
  // Les champs internes d'administration ne sortent jamais.
  return {
    ...c,
    contact,
    identity: { ...c.identity, birthdate: undefined },
    publish: {
      order: c.publish?.order,
      featured: c.publish?.featured,
      publicUrl: c.publish?.publicUrl,
      seo: c.publish?.seo
    }
  };
}

/** Vue compacte pour le hero : uniquement ce dont la scène a besoin. */
export function fragmentCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    slug: card.slug,
    name: card.identity?.displayName || 'Sans nom',
    role: card.role?.label || '',
    moment: card.role?.moment || '',
    track: card.music?.trackTitle || '',
    artist: card.music?.artist || '',
    bpm: card.music?.bpm || 100,
    key: card.music?.key || '',
    coverUrl: card.music?.coverUrl || '',
    cover: card.music?.coverColors || { dominant: '#b5541d', accent: '#141414', bg: '#f6f6f3' },
    preview: card.music?.preview || { synth: true, volume: 0.8 },
    visual: card.visual,
    url: `/carte/${card.slug}`
  };
}

/** Vue liste : pas de corps long, pas de galerie. */
export function summaryProject(project) {
  if (!project) return null;
  return {
    id: project.id,
    slug: project.slug,
    status: project.status,
    title: project.title,
    subtitle: project.subtitle,
    category: project.category,
    tags: project.tags,
    summary: project.summary,
    year: project.year,
    date: project.date,
    client: project.client,
    cover: project.cover,
    credits: project.credits,
    hero: project.hero,
    url: `/projets/${project.slug}`
  };
}

export function stats({ projects, cards }) {
  const count = (arr, fn) => arr.filter(fn).length;
  return {
    projects: {
      total: projects.length,
      published: count(projects, (x) => x.status === 'published'),
      draft: count(projects, (x) => x.status === 'draft'),
      archived: count(projects, (x) => x.status === 'archived')
    },
    cards: {
      total: cards.length,
      published: count(cards, (x) => x.status === 'published'),
      draft: count(cards, (x) => x.status === 'draft'),
      featured: count(cards, (x) => x.publish?.featured),
      withTrack: count(cards, (x) => Boolean(x.music?.trackTitle)),
      missingCover: count(cards, (x) => !x.music?.coverUrl),
      rsvp: {
        confirmed: count(cards, (x) => x.presence?.rsvp === 'confirmed'),
        maybe: count(cards, (x) => x.presence?.rsvp === 'maybe'),
        pending: count(cards, (x) => x.presence?.rsvp === 'pending'),
        declined: count(cards, (x) => x.presence?.rsvp === 'declined')
      }
    }
  };
}
