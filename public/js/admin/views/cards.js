/**
 * Cartes — liste et configurateur universel musical.
 *
 * Le configurateur est l'écran central de l'espace éditeur (audit §7.1) :
 * navigation par blocs à gauche, champs au centre, aperçu 3D live à droite.
 * Les sept blocs correspondent au modèle décrit en audit §6.1.
 */
import { api } from '../api.js';
import {
  h,
  esc,
  toast,
  confirmDialog,
  statusPill,
  rsvpPill,
  miniCover,
  relativeTime,
  field,
  countedField,
  makeSortable,
  readFileAsDataURL,
  dominantColors,
  formatDuration,
  ROLE_TYPES
} from '../ui.js';
import { markDirty } from '../app.js';
import { createPreviewScene } from '../preview.js';
import { createPlayer, spectrum, currentEnergy } from '../../audio.js';

/* ================================================================== */
/* LISTE                                                               */
/* ================================================================== */

export async function renderCards({ main, query, navigate }) {
  const status = query.get('status') || 'all';
  const rsvp = query.get('rsvp') || 'all';
  const q = query.get('q') || '';
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (rsvp !== 'all') params.set('rsvp', rsvp);
  if (q) params.set('q', q);

  const [{ cards }, projectsRes] = await Promise.all([
    api.cards(params.toString() ? `?${params}` : ''),
    api.projects()
  ]);
  const projects = projectsRes.projects || [];

  main.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, ['Cartes musicales']),
        h('p', {}, [
          'Une personne, un morceau, une carte. Chaque carte publiée devient un fragment du hero et peut être rattachée à un projet.'
        ])
      ]),
      h('div.row', {}, [
        h('button.abtn', { type: 'button', onclick: () => openImport(main, navigate) }, ['Importer']),
        h('a.abtn.abtn--primary', { href: '#/cartes/nouvelle' }, ['+ Nouvelle carte'])
      ])
    ])
  );

  /* ---------------- Filtres ---------------- */

  const bar = h('div.toolbar', {});
  for (const [value, label] of [
    ['all', 'Toutes'],
    ['published', 'Publiées'],
    ['draft', 'Brouillons'],
    ['archived', 'Archivées']
  ]) {
    bar.append(
      h('a.abtn', {
        href: `#/cartes?status=${value}${rsvp !== 'all' ? `&rsvp=${rsvp}` : ''}`,
        class: status === value ? 'abtn--primary' : ''
      }, [label])
    );
  }
  bar.append(h('span', { style: 'width:1px;height:1.4rem;background:var(--admin-line)' }));
  for (const [value, label] of [
    ['all', 'Toutes réponses'],
    ['confirmed', 'Confirmées'],
    ['maybe', 'Peut-être'],
    ['pending', 'En attente'],
    ['declined', 'Absentes']
  ]) {
    bar.append(
      h('a.abtn.abtn--sm', {
        href: `#/cartes?status=${status}&rsvp=${value}`,
        class: rsvp === value ? 'abtn--primary' : ''
      }, [label])
    );
  }
  bar.append(h('span.spacer', {}));
  const search = h('input', {
    type: 'search',
    placeholder: 'Nom, morceau, ville…',
    value: q,
    'aria-label': 'Rechercher une carte',
    style:
      'background:var(--admin-bg);border:1px solid var(--admin-line);border-radius:6px;color:var(--admin-ink);padding:.5rem .7rem;font-size:.875rem;min-width:14rem'
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigate(`#/cartes?status=${status}&rsvp=${rsvp}&q=${encodeURIComponent(search.value)}`);
    }
  });
  bar.append(search);
  main.append(bar);

  if (!cards.length) {
    main.append(
      h('div.empty-state', {}, [
        h('h2', {}, ['Aucune carte ici']),
        h('p.small', {}, [q || status !== 'all' || rsvp !== 'all' ? 'Élargissez les filtres.' : 'Créez la première carte.']),
        h('a.abtn.abtn--primary', { href: '#/cartes/nouvelle' }, ['+ Nouvelle carte'])
      ])
    );
    return;
  }

  /* ---------------- Tableau ---------------- */

  const tbody = h('tbody', {});
  for (const c of cards) {
    const track = [c.music?.trackTitle, c.music?.artist].filter(Boolean).join(' — ');
    const linked = (c.role?.projectIds || [])
      .map((pid) => projects.find((p) => p.id === pid)?.title)
      .filter(Boolean);
    tbody.append(
      h('tr', { dataset: { id: c.id }, draggable: 'true' }, [
        h('td', { class: 'num' }, [h('span.drag-handle', { title: 'Glisser pour réordonner' }, ['⠿'])]),
        h('td', {}, [
          h('div.cell-main', {}, [
            miniCover(c),
            h('div', { style: 'min-width:0' }, [
              h('strong', {}, [c.identity?.displayName || 'Sans nom']),
              h('span', {}, [track || 'Aucun morceau'])
            ])
          ])
        ]),
        h('td', { class: 'tiny' }, [c.role?.label || '—']),
        h('td', { class: 'tiny' }, [c.role?.moment ? `${c.role.moment}${c.role?.momentStart ? ` · ${c.role.momentStart}` : ''}` : '—']),
        h('td', {}, [rsvpPill(c.presence?.rsvp)]),
        h('td', {}, [statusPill(c.status)]),
        h('td', { class: 'tiny' }, [linked.length ? linked.join(', ') : '—']),
        h('td', {}, [
          h('div.row', { style: 'flex-wrap:nowrap;gap:.35rem' }, [
            h('a.abtn.abtn--sm', { href: `#/cartes/${c.id}` }, ['Éditer']),
            h('button.abtn.abtn--sm', {
              type: 'button',
              onclick: async () => {
                const { url } = await api.shareCard(c.id);
                await navigator.clipboard?.writeText(url).catch(() => {});
                toast(`Lien de partage copié : ${url}`);
              }
            }, ['Lien']),
            c.status === 'published'
              ? h('button.abtn.abtn--sm', {
                  type: 'button',
                  onclick: async () => {
                    await api.unpublishCard(c.id);
                    toast('Carte retirée du site.');
                    navigate(location.hash || '#/cartes');
                  }
                }, ['Dépublier'])
              : h('button.abtn.abtn--sm.abtn--primary', {
                  type: 'button',
                  onclick: async () => {
                    await api.publishCard(c.id);
                    toast('Carte publiée — elle apparaît dans le hero.');
                    navigate(location.hash || '#/cartes');
                  }
                }, ['Publier'])
          ])
        ])
      ])
    );
  }

  const table = h('table.admin-table', {}, [
    h('thead', {}, [
      h('tr', {}, [
        h('th', {}, ['#']),
        h('th', {}, ['Personne · morceau']),
        h('th', {}, ['Rôle']),
        h('th', {}, ['Moment']),
        h('th', {}, ['Réponse']),
        h('th', {}, ['Statut']),
        h('th', {}, ['Projets']),
        h('th', {}, ['Actions'])
      ])
    ]),
    tbody
  ]);

  makeSortable(tbody, async (ids) => {
    try {
      await api.reorderCards(ids);
      toast('Ordre enregistré.');
    } catch (err) {
      toast(err.message, { error: true });
    }
  });

  main.append(h('div.panel', { style: 'overflow-x:auto' }, [table]));
}

/* ---------------- Import en masse ---------------- */

async function openImport(main, navigate) {
  const textarea = h('textarea', {
    style: 'min-height:12rem;font-family:var(--font-mono);font-size:11px',
    placeholder: 'Prénom Nom, morceau, artiste, rôle\nMatt, Superstition, Stevie Wonder, Fondateur\nLéa, Strobe, deadmau5, Productrice'
  });
  const ok = await new Promise((resolve) => {
    const close = (v) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(v ? textarea.value : null);
    };
    const onKey = (e) => e.key === 'Escape' && close(false);
    const modal = h('div.modal', { style: 'max-width:36rem' }, [
      h('h2', {}, ['Importer des cartes']),
      h('p.small', { style: 'color:var(--admin-muted)' }, [
        'Une ligne par personne, au format CSV : nom, morceau, artiste, rôle. Les cartes sont créées en brouillon, à compléter ensuite.'
      ]),
      textarea,
      h('div.row', { style: 'justify-content:flex-end' }, [
        h('button.abtn', { type: 'button', onclick: () => close(false) }, ['Annuler']),
        h('button.abtn.abtn--primary', { type: 'button', onclick: () => close(true) }, ['Importer'])
      ])
    ]);
    const backdrop = h('div.modal-backdrop', { onclick: (e) => e.target === backdrop && close(false) }, [modal]);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    textarea.focus();
  });

  if (!ok) return;
  const lines = ok.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((line) => {
    const [name, track, artist, roleLabel] = line.split(',').map((s) => s.trim());
    return {
      status: 'draft',
      identity: { displayName: name || '' },
      music: { trackTitle: track || '', artist: artist || '' },
      role: { label: roleLabel || '', type: 'guest' },
      presence: { rsvp: 'pending' }
    };
  });
  if (!parsed.length) {
    toast('Aucune ligne exploitable.', { error: true });
    return;
  }
  try {
    const { count } = await api.importCards(parsed);
    toast(`${count} carte(s) créée(s) en brouillon.`);
    navigate('#/cartes?status=draft');
  } catch (err) {
    toast(err.message, { error: true });
  }
}

/* ================================================================== */
/* CONFIGURATEUR DE CARTE                                              */
/* ================================================================== */

const EMPTY_CARD = () => ({
  title: '',
  slug: '',
  status: 'draft',
  identity: {
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
    languages: []
  },
  contact: {
    email: '',
    emailPublic: false,
    phone: '',
    phonePublic: false,
    address: '',
    addressPublic: false,
    website: '',
    socials: []
  },
  music: {
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
    preview: { url: '', start: 30, end: 60, volume: 0.8, synth: true },
    external: { spotify: '', apple: '', deezer: '', youtube: '' },
    note: '',
    explicit: false
  },
  role: {
    label: '',
    type: 'guest',
    organization: '',
    projectIds: [],
    moment: '',
    momentStart: '',
    momentEnd: '',
    tags: []
  },
  presence: {
    rsvp: 'pending',
    arrival: '',
    departure: '',
    attendMoments: [],
    companions: 0,
    table: '',
    group: '',
    dietary: '',
    accessibility: '',
    transport: { mode: '', from: '', seats: 0 },
    contactDayOf: ''
  },
  visual: {
    accent: '#b5541d',
    orbit: { radius: 3.8, speed: 0.2, phase: 0, yBase: 0, size: 0.11 },
    geometry: 'icosa',
    textureUrl: '',
    emitOnPlay: true
  },
  publish: {
    order: 50,
    featured: true,
    shareEnabled: true,
    shareExpiresAt: '',
    seo: { title: '', description: '', ogImage: '' }
  }
});

const BLOCKS = [
  ['identity', 'Identité', 'Qui est cette personne, et comment elle apparaît.'],
  ['contact', 'Contact', 'Coordonnées et liens. Rien n’est public par défaut.'],
  ['music', 'Morceau', 'Le morceau, sa pochette et son extrait. La pochette devient l’identité.'],
  ['role', 'Rôle & contexte', 'Son rôle, libre, et les projets auxquels la carte est rattachée.'],
  ['presence', 'Présence', 'Réponse, horaires, moments couverts, accompagnants.'],
  ['visual', 'Apparence 3D', 'Position, taille et couleur du fragment dans le hero.'],
  ['publish', 'Publication', 'Statut, ordre, mise en avant, lien de partage et SEO.']
];

export async function renderCardEditor({ main, navigate, onDispose }, id) {
  const isNew = id === 'nouvelle';
  const projects = (await api.projects()).projects || [];

  let card = isNew ? EMPTY_CARD() : (await api.card(id)).card;
  if (!card) {
    main.append(h('div.empty-state', {}, [h('h2', {}, ['Carte introuvable']), h('a.abtn', { href: '#/cartes' }, ['Retour'])]));
    return;
  }
  let saved = !isNew;
  const setDirty = (v = true) => markDirty(v);

  /* ---------------- En-tête ---------------- */

  main.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, [isNew ? 'Nouvelle carte' : card.identity?.displayName || 'Carte']),
        h('p', {}, [
          isNew
            ? 'Sept blocs. Seuls le nom, le morceau et le rôle sont indispensables.'
            : `Modifiée ${relativeTime(card.updatedAt)} · /carte/${card.slug}`
        ])
      ]),
      h('div.row', {}, [
        h('a.abtn', { href: '#/cartes' }, ['← Cartes']),
        card.slug && !isNew
          ? h('a.abtn.abtn--ghost', { href: `/carte/${card.slug}`, target: '_blank', rel: 'noopener' }, ['Voir ↗'])
          : null
      ])
    ])
  );

  const actions = h('div.toolbar', {});
  main.append(actions);

  /* ---------------- Trois colonnes ---------------- */

  const editor = h('div.editor', {});
  const tabs = h('div.tabs', { role: 'tablist', 'aria-label': 'Blocs de la carte' });
  const panelWrap = h('div', { style: 'min-width:0' });
  const previewCol = h('div.preview-col', {});
  editor.append(tabs, panelWrap, previewCol);
  main.append(editor);

  let activeBlock = 'music';
  let preview = null;
  let player = null;
  let visualRaf = 0;

  /* ---------------- Aperçu live ---------------- */

  const stage = h('div.preview-stage', {});
  const stageCanvas = h('canvas', { 'aria-hidden': 'true' });
  stage.append(stageCanvas);

  const previewCover = h('div.preview-cover', {});
  const previewName = h('strong', { style: 'font-family:var(--font-display);font-size:1.15rem' }, ['']);
  const previewTrack = h('div.small', { style: 'color:var(--admin-muted)' }, ['']);
  const previewRole = h('div.tiny', { style: 'letter-spacing:.08em;text-transform:uppercase' }, ['']);
  const playBtn = h('button.abtn.abtn--primary', { type: 'button', style: 'justify-content:center' }, ['Écouter l’extrait']);
  const bars = h('div.visualizer', { 'aria-hidden': 'true', style: 'height:1.5rem' }, Array.from({ length: 20 }, () => h('span')));

  previewCol.append(
    stage,
    h('div.preview-card', {}, [
      previewCover,
      h('div', {}, [previewRole, previewName, previewTrack]),
      playBtn,
      bars,
      h('p.tiny', { style: 'color:var(--admin-muted)' }, [
        'L’aperçu reflète immédiatement le bloc « Apparence 3D » et les couleurs de la pochette.'
      ])
    ])
  );

  function initPreview() {
    try {
      preview = createPreviewScene(stageCanvas, { card });
    } catch (err) {
      stage.textContent = '';
      stage.append(
        h('p.tiny', { style: 'padding:1rem;color:var(--muted-strong)' }, [
          'Aperçu 3D indisponible sur ce navigateur.'
        ])
      );
      preview = null;
    }
  }
  initPreview();

  function paintPreview() {
    const colors = card.music?.coverColors || {};
    const dominant = colors.dominant || '#b5541d';
    previewCover.textContent = '';
    if (card.music?.coverUrl) {
      previewCover.style.background = 'var(--admin-raised)';
      previewCover.append(h('img', { src: card.music.coverUrl, alt: '' }));
    } else {
      previewCover.style.background = `linear-gradient(140deg, ${esc(dominant)}, ${esc(colors.accent || '#141414')})`;
      previewCover.append(
        String(card.identity?.displayName || '?').slice(0, 2).toUpperCase()
      );
    }
    previewName.textContent = card.identity?.displayName || 'Sans nom';
    previewTrack.textContent = [card.music?.trackTitle, card.music?.artist].filter(Boolean).join(' — ') || 'Aucun morceau';
    previewRole.textContent = [card.role?.label, card.role?.moment].filter(Boolean).join(' · ') || 'Rôle à définir';
    preview?.update({ card });
  }

  /* ---------------- Lecture de l'extrait ---------------- */

  function stopAudio() {
    player?.destroy();
    player = null;
    cancelAnimationFrame(visualRaf);
    preview?.setEnergy(0);
    playBtn.textContent = 'Écouter l’extrait';
    bars.querySelectorAll('span').forEach((b) => (b.style.height = '12%'));
  }

  playBtn.addEventListener('click', async () => {
    if (player?.playing) {
      stopAudio();
      return;
    }
    player = createPlayer(
      {
        url: card.music?.preview?.url || '',
        start: card.music?.preview?.start,
        end: card.music?.preview?.end,
        volume: card.music?.preview?.volume ?? 0.8,
        bpm: card.music?.bpm || 100,
        key: card.music?.key || 'C'
      },
      { onEnd: () => stopAudio() }
    );
    try {
      await player.play();
      playBtn.textContent = 'Arrêter';
      const spans = bars.querySelectorAll('span');
      const tick = () => {
        if (!player?.playing) return;
        visualRaf = requestAnimationFrame(tick);
        const values = spectrum(spans.length);
        spans.forEach((s, i) => (s.style.height = `${Math.max(8, values[i] * 100)}%`));
        preview?.setEnergy(currentEnergy());
      };
      tick();
    } catch (err) {
      toast(`Lecture impossible : ${err.message}`, { error: true });
      stopAudio();
    }
  });

  /* ---------------- Onglets ---------------- */

  function blockState(key) {
    switch (key) {
      case 'identity':
        return card.identity?.displayName ? 'done' : 'missing';
      case 'music':
        return card.music?.trackTitle ? 'done' : 'missing';
      case 'contact':
        return card.contact?.email || card.contact?.website ? 'done' : 'neutral';
      case 'role':
        return card.role?.label ? 'done' : 'missing';
      case 'presence':
        return card.presence?.rsvp && card.presence.rsvp !== 'pending' ? 'done' : 'neutral';
      case 'visual':
        return card.visual?.accent ? 'done' : 'neutral';
      case 'publish':
        return card.status === 'published' ? 'done' : 'neutral';
      default:
        return 'neutral';
    }
  }

  function paintTabs() {
    tabs.textContent = '';
    for (const [key, label] of BLOCKS) {
      const state = blockState(key);
      tabs.append(
        h(
          'button.tab',
          {
            type: 'button',
            role: 'tab',
            id: `tab-${key}`,
            'aria-selected': String(activeBlock === key),
            'aria-controls': 'tabpanel',
            onclick: () => {
              activeBlock = key;
              paintTabs();
              paintPanel();
            }
          },
          [
            h('span', {}, [label]),
            h('span.dot-state', {
              class: state === 'done' ? 'is-done' : state === 'missing' ? 'is-missing' : '',
              title: state === 'done' ? 'Complet' : state === 'missing' ? 'À renseigner' : 'Facultatif'
            })
          ]
        )
      );
    }
  }

  const panelEl = h('div.tabpanel', { id: 'tabpanel', role: 'tabpanel' });
  panelWrap.append(panelEl);

  function paintPanel() {
    stopAudio();
    panelEl.textContent = '';
    const [, label, desc] = BLOCKS.find(([k]) => k === activeBlock) || [];
    panelEl.append(h('h2', {}, [label]), h('p.apanel-desc', {}, [desc]));
    const builders = {
      identity: identityBlock,
      contact: contactBlock,
      music: musicBlock,
      role: roleBlock,
      presence: presenceBlock,
      visual: visualBlock,
      publish: publishBlock
    };
    builders[activeBlock]?.(panelEl);
  }

  /* ---------------- Bloc identité ---------------- */

  function identityBlock(root) {
    root.append(
      field({
        label: 'Nom affiché',
        path: 'identity.displayName',
        value: card.identity?.displayName,
        hint: 'C’est ce nom qui apparaît dans la scène et sur la carte publique.',
        onInput: (v) => ((card.identity.displayName = v), setDirty(), paintPreview(), paintTabs())
      }),
      h('div.afield-row', {}, [
        field({ label: 'Prénom', path: 'identity.firstName', value: card.identity?.firstName, onInput: (v) => ((card.identity.firstName = v), setDirty()) }),
        field({ label: 'Nom', path: 'identity.lastName', value: card.identity?.lastName, onInput: (v) => ((card.identity.lastName = v), setDirty()) }),
        field({ label: 'Pronoms', path: 'identity.pronouns', value: card.identity?.pronouns, onInput: (v) => ((card.identity.pronouns = v), setDirty()) })
      ]),
      field({
        label: 'Accroche',
        path: 'identity.tagline',
        value: card.identity?.tagline,
        hint: 'Une ligne courte : « Saxophoniste », « Direction artistique »…',
        onInput: (v) => ((card.identity.tagline = v), setDirty(), paintPreview())
      }),
      field({
        label: 'Une phrase',
        path: 'identity.bio',
        type: 'textarea',
        value: card.identity?.bio,
        hint: 'Facultatif. La carte porte l’essentiel, pas un formulaire.',
        attrs: { maxlength: '600', style: 'min-height:5rem' },
        onInput: (v) => ((card.identity.bio = v), setDirty())
      }),
      h('div.afield-row', {}, [
        field({ label: 'Ville', path: 'identity.city', value: card.identity?.city, onInput: (v) => ((card.identity.city = v), setDirty()) }),
        field({ label: 'Pays', path: 'identity.country', value: card.identity?.country, onInput: (v) => ((card.identity.country = v), setDirty()) }),
        field({
          label: 'Fuseau',
          path: 'identity.timezone',
          type: 'select',
          value: card.identity?.timezone,
          options: [
            ['Europe/Paris', 'Europe/Paris'],
            ['Europe/London', 'Europe/London'],
            ['Europe/Berlin', 'Europe/Berlin'],
            ['Africa/Dakar', 'Africa/Dakar'],
            ['Asia/Tokyo', 'Asia/Tokyo'],
            ['America/New_York', 'America/New_York']
          ],
          onInput: (v) => ((card.identity.timezone = v), setDirty())
        })
      ]),
      field({
        label: 'Langues',
        path: 'identity.languages',
        value: (card.identity?.languages || []).join(', '),
        hint: 'Codes séparés par des virgules : fr, en, ja…',
        onInput: (v) => ((card.identity.languages = v.split(',').map((s) => s.trim()).filter(Boolean)), setDirty())
      }),
      uploadField({
        label: 'Photo (facultative)',
        kind: 'covers',
        value: card.identity?.avatarUrl,
        hint: 'Si une pochette est définie, c’est elle qui prime comme identité visuelle.',
        onValue: (url) => ((card.identity.avatarUrl = url), setDirty())
      }),
      field({
        label: 'Date de naissance',
        path: 'identity.birthdate',
        type: 'date',
        value: card.identity?.birthdate,
        hint: 'Jamais affichée sur la page publique — réservée à l’éditeur.',
        onInput: (v) => ((card.identity.birthdate = v), setDirty())
      })
    );
  }

  /* ---------------- Bloc contact ---------------- */

  function contactBlock(root) {
    const emailRow = h('div.afield-row', {}, [
      field({ label: 'E-mail', path: 'contact.email', type: 'email', value: card.contact?.email, onInput: (v) => ((card.contact.email = v), setDirty(), paintTabs()) }),
      h('div', { style: 'align-self:end;padding-bottom:.5rem' }, [
        field({ type: 'checkbox', label: 'Afficher publiquement', path: 'contact.emailPublic', value: card.contact?.emailPublic, onInput: (v) => ((card.contact.emailPublic = v), setDirty()) })
      ])
    ]);
    const phoneRow = h('div.afield-row', {}, [
      field({ label: 'Téléphone', path: 'contact.phone', type: 'tel', value: card.contact?.phone, onInput: (v) => ((card.contact.phone = v), setDirty()) }),
      h('div', { style: 'align-self:end;padding-bottom:.5rem' }, [
        field({ type: 'checkbox', label: 'Afficher publiquement', path: 'contact.phonePublic', value: card.contact?.phonePublic, onInput: (v) => ((card.contact.phonePublic = v), setDirty()) })
      ])
    ]);
    const addressRow = h('div.afield-row', {}, [
      field({ label: 'Adresse', path: 'contact.address', value: card.contact?.address, onInput: (v) => ((card.contact.address = v), setDirty()) }),
      h('div', { style: 'align-self:end;padding-bottom:.5rem' }, [
        field({ type: 'checkbox', label: 'Afficher publiquement', path: 'contact.addressPublic', value: card.contact?.addressPublic, onInput: (v) => ((card.contact.addressPublic = v), setDirty()) })
      ])
    ]);

    root.append(
      h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
        'Aucune coordonnée n’est publiée tant que sa case n’est pas cochée.'
      ]),
      emailRow,
      phoneRow,
      addressRow,
      field({ label: 'Site web', path: 'contact.website', type: 'url', value: card.contact?.website, onInput: (v) => ((card.contact.website = v), setDirty()) })
    );

    const socials = h('div.repeater', {});
    function paintSocials() {
      socials.textContent = '';
      if (!card.contact.socials.length) socials.append(h('p.small', { style: 'color:var(--admin-muted)' }, ['Aucun lien social.']));
      card.contact.socials.forEach((s, i) => {
        const label = h('input', { type: 'text', value: s.label || '', placeholder: 'Instagram' });
        const url = h('input', { type: 'url', value: s.url || '', placeholder: 'https://…' });
        label.addEventListener('input', () => ((card.contact.socials[i].label = label.value), setDirty()));
        url.addEventListener('input', () => ((card.contact.socials[i].url = url.value), setDirty()));
        socials.append(
          h('div.repeater-row', {}, [
            label,
            url,
            h('button.icon-btn', {
              type: 'button',
              'aria-label': 'Retirer ce lien',
              onclick: () => {
                card.contact.socials.splice(i, 1);
                paintSocials();
                setDirty();
              }
            }, ['×'])
          ])
        );
      });
    }
    root.append(
      h('h2', { style: 'font-size:.875rem;margin-top:1.5rem' }, ['Réseaux']),
      socials,
      h('button.abtn', {
        type: 'button',
        style: 'margin-top:.75rem',
        onclick: () => {
          card.contact.socials.push({ label: '', url: '' });
          paintSocials();
          setDirty();
        }
      }, ['+ Ajouter un lien'])
    );
    paintSocials();
  }

  /* ---------------- Bloc musique ---------------- */

  function musicBlock(root) {
    const linkInput = h('input', {
      type: 'url',
      placeholder: 'https://open.spotify.com/track/…',
      'aria-label': 'Lien vers le morceau'
    });
    const importBtn = h('button.abtn', { type: 'button' }, ['Importer']);

    root.append(
      h('div.afield', {}, [
        h('span.alabel', {}, ['Importer depuis un lien']),
        h('div.row', { style: 'gap:.5rem' }, [linkInput, importBtn]),
        h('span.ahint', {}, [
          'Le lien est rangé dans le service correspondant (Spotify, Apple, Deezer, YouTube). Les métadonnées du morceau restent à saisir : aucune clé d’API de streaming n’est requise.'
        ])
      ])
    );

    importBtn.addEventListener('click', () => {
      const url = linkInput.value.trim();
      if (!url) {
        toast('Collez d’abord un lien.', { error: true });
        return;
      }
      const service = /spotify\./i.test(url)
        ? 'spotify'
        : /(apple\.com|music\.apple)/i.test(url)
        ? 'apple'
        : /deezer\./i.test(url)
        ? 'deezer'
        : /(youtube\.com|youtu\.be)/i.test(url)
        ? 'youtube'
        : 'spotify';
      card.music.external[service] = url;
      toast(`Lien enregistré sous « ${service} ».`);
      setDirty();
      paintPanel();
    });

    root.append(
      h('hr', { style: 'border:0;border-top:1px solid var(--admin-line);margin:1.5rem 0' }),
      h('div.afield-row', {}, [
        field({
          label: 'Titre du morceau',
          path: 'music.trackTitle',
          value: card.music?.trackTitle,
          onInput: (v) => ((card.music.trackTitle = v), setDirty(), paintPreview(), paintTabs())
        }),
        field({
          label: 'Artiste',
          path: 'music.artist',
          value: card.music?.artist,
          onInput: (v) => ((card.music.artist = v), setDirty(), paintPreview())
        })
      ]),
      h('div.afield-row', {}, [
        field({ label: 'Album', path: 'music.album', value: card.music?.album, onInput: (v) => ((card.music.album = v), setDirty()) }),
        field({ label: 'Année', path: 'music.year', type: 'number', value: card.music?.year || '', attrs: { min: '1000', max: '2200' }, onInput: (v) => ((card.music.year = v || null), setDirty()) }),
        field({ label: 'Genre', path: 'music.genre', value: card.music?.genre, onInput: (v) => ((card.music.genre = v), setDirty()) })
      ]),
      h('div.afield-row', {}, [
        field({
          label: 'Tempo (BPM)',
          path: 'music.bpm',
          type: 'number',
          value: card.music?.bpm,
          attrs: { min: '20', max: '300' },
          hint: 'Sert à générer l’extrait quand aucun fichier n’est fourni.',
          onInput: (v) => ((card.music.bpm = v), setDirty())
        }),
        field({
          label: 'Tonalité',
          path: 'music.key',
          value: card.music?.key,
          hint: 'Notation : C, Ebm, F#…',
          onInput: (v) => ((card.music.key = v), setDirty())
        }),
        field({
          label: 'Durée (s)',
          path: 'music.duration',
          type: 'number',
          value: card.music?.duration,
          attrs: { min: '1', max: '7200' },
          onInput: (v) => ((card.music.duration = v), setDirty())
        }),
        field({ label: 'ISRC', path: 'music.isrc', value: card.music?.isrc, onInput: (v) => ((card.music.isrc = v), setDirty()) })
      ]),
      field({
        label: 'Note sur ce morceau',
        path: 'music.note',
        type: 'textarea',
        value: card.music?.note,
        hint: 'Pourquoi celui-là, à quel moment il passe, à quel volume.',
        attrs: { maxlength: '400', style: 'min-height:4.5rem' },
        onInput: (v) => ((card.music.note = v), setDirty())
      }),
      field({ type: 'checkbox', label: 'Contenu explicite', path: 'music.explicit', value: card.music?.explicit, onInput: (v) => ((card.music.explicit = v), setDirty()) })
    );

    /* --- Liens plateformes --- */
    root.append(h('h2', { style: 'font-size:.875rem;margin-top:1.5rem' }, ['Liens d’écoute']));
    for (const [key, label] of [
      ['spotify', 'Spotify'],
      ['apple', 'Apple Music'],
      ['deezer', 'Deezer'],
      ['youtube', 'YouTube']
    ]) {
      root.append(
        field({
          label,
          path: `music.external.${key}`,
          type: 'url',
          value: card.music?.external?.[key],
          onInput: (v) => ((card.music.external[key] = v), setDirty())
        })
      );
    }

    /* --- Pochette --- */
    root.append(h('hr', { style: 'border:0;border-top:1px solid var(--admin-line);margin:1.5rem 0' }));
    root.append(h('h2', { style: 'font-size:.875rem;margin-bottom:.75rem' }, ['Pochette — identité visuelle de la carte']));

    const swatches = h('div.swatches', {});
    function paintSwatches() {
      const c = card.music.coverColors || {};
      swatches.textContent = '';
      for (const [label, key] of [
        ['Dominante', 'dominant'],
        ['Accent', 'accent'],
        ['Fond', 'bg']
      ]) {
        swatches.append(
          h('div', { style: 'display:grid;gap:.25rem;justify-items:center' }, [
            h('span.swatch', { style: `background:${esc(c[key] || '#ccc')}` }),
            h('span.tiny', {}, [label]),
            h('span.mono', { style: 'font-size:10px;color:var(--admin-muted)' }, [c[key] || ''])
          ])
        );
      }
    }

    root.append(
      uploadField({
        label: 'Image de pochette',
        kind: 'covers',
        value: card.music?.coverUrl,
        accept: 'image/png,image/jpeg,image/webp,image/gif',
        hint: 'Carrée de préférence. Les couleurs dominantes sont extraites automatiquement et alimentent le fragment 3D.',
        onValue: async (url) => {
          card.music.coverUrl = url;
          if (url) {
            const colors = await dominantColors(url);
            card.music.coverColors = colors;
            card.visual.accent = colors.dominant;
            card.visual.textureUrl = url;
          }
          paintSwatches();
          paintPreview();
          setDirty();
        }
      }),
      h('div.afield', { style: 'margin-top:1rem' }, [h('span.alabel', {}, ['Couleurs de la carte']), swatches]),
      h('div.afield-row', {}, [
        colorField('Dominante', card.music.coverColors.dominant, (v) => {
          card.music.coverColors.dominant = v;
          card.visual.accent = v;
          paintSwatches();
          paintPreview();
          setDirty();
        }),
        colorField('Accent', card.music.coverColors.accent, (v) => {
          card.music.coverColors.accent = v;
          paintSwatches();
          paintPreview();
          setDirty();
        }),
        colorField('Fond', card.music.coverColors.bg, (v) => {
          card.music.coverColors.bg = v;
          paintSwatches();
          setDirty();
        })
      ])
    );
    paintSwatches();

    /* --- Extrait audio --- */
    root.append(h('hr', { style: 'border:0;border-top:1px solid var(--admin-line);margin:1.5rem 0' }));
    root.append(
      h('h2', { style: 'font-size:.875rem;margin-bottom:.75rem' }, ['Extrait audio']),
      h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
        card.music?.preview?.url
          ? 'Un fichier est hébergé. La lecture est bornée par le début et la fin ci-dessous.'
          : 'Aucun fichier fourni : l’extrait est généré dans le navigateur d’après le tempo et la tonalité. Téléversez un mp3 pour un extrait réel.'
      ])
    );

    root.append(
      uploadField({
        label: 'Fichier audio (mp3, wav, ogg, m4a)',
        kind: 'previews',
        value: card.music?.preview?.url,
        accept: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/webm',
        onValue: (url) => {
          card.music.preview.url = url;
          card.music.preview.synth = false;
          setDirty();
          paintPanel();
        }
      }),
      h('div.afield-row', { style: 'margin-top:1rem' }, [
        field({
          label: 'Début (s)',
          path: 'music.preview.start',
          type: 'number',
          value: card.music?.preview?.start,
          attrs: { min: '0', max: '7200', step: '1' },
          onInput: (v) => ((card.music.preview.start = v), setDirty())
        }),
        field({
          label: 'Fin (s)',
          path: 'music.preview.end',
          type: 'number',
          value: card.music?.preview?.end,
          attrs: { min: '0', max: '7200', step: '1' },
          onInput: (v) => ((card.music.preview.end = v), setDirty())
        }),
        field({
          label: 'Volume',
          path: 'music.preview.volume',
          type: 'number',
          value: card.music?.preview?.volume,
          attrs: { min: '0', max: '1', step: '0.05' },
          onInput: (v) => ((card.music.preview.volume = v), setDirty())
        })
      ]),
      h('p.tiny', { style: 'color:var(--admin-muted)' }, [
        `Extrait : ${formatDuration(
          Math.max(0, (card.music?.preview?.end || 60) - (card.music?.preview?.start || 0))
        )}`
      ])
    );
  }

  /* ---------------- Bloc rôle ---------------- */

  function roleBlock(root) {
    root.append(
      h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
        'Le rôle est un libellé libre : c’est ce qui rend la carte universelle. Le type, lui, sert aux filtres et aux statistiques.'
      ]),
      h('div.afield-row', {}, [
        field({
          label: 'Rôle (libellé libre)',
          path: 'role.label',
          value: card.role?.label,
          hint: 'Témoin, invitée, saxophoniste, cliente, directrice artistique…',
          onInput: (v) => ((card.role.label = v), setDirty(), paintPreview(), paintTabs())
        }),
        field({
          label: 'Type',
          path: 'role.type',
          type: 'select',
          value: card.role?.type,
          options: ROLE_TYPES,
          onInput: (v) => ((card.role.type = v), setDirty())
        }),
        field({
          label: 'Organisation',
          path: 'role.organization',
          value: card.role?.organization,
          onInput: (v) => ((card.role.organization = v), setDirty())
        })
      ]),
      h('div.afield-row', {}, [
        field({
          label: 'Moment',
          path: 'role.moment',
          value: card.role?.moment,
          hint: 'Repère libre dans le déroulé : « Ouverture de bal », « Cérémonie », « Projection »…',
          onInput: (v) => ((card.role.moment = v), setDirty(), paintPreview())
        }),
        field({ label: 'Début', path: 'role.momentStart', type: 'time', value: card.role?.momentStart, onInput: (v) => ((card.role.momentStart = v), setDirty()) }),
        field({ label: 'Fin', path: 'role.momentEnd', type: 'time', value: card.role?.momentEnd, onInput: (v) => ((card.role.momentEnd = v), setDirty()) })
      ]),
      field({
        label: 'Étiquettes',
        path: 'role.tags',
        value: (card.role?.tags || []).join(', '),
        hint: 'Séparées par des virgules.',
        onInput: (v) => ((card.role.tags = v.split(',').map((s) => s.trim()).filter(Boolean)), setDirty())
      })
    );

    const boxes = h('div.stack', {});
    for (const p of projects) {
      const checked = (card.role?.projectIds || []).includes(p.id);
      const input = h('input', { type: 'checkbox' });
      input.checked = checked;
      input.addEventListener('change', () => {
        const ids = new Set(card.role.projectIds || []);
        if (input.checked) ids.add(p.id);
        else ids.delete(p.id);
        card.role.projectIds = [...ids];
        setDirty();
      });
      boxes.append(
        h('label.acheck', {}, [
          input,
          h('span', {}, [
            p.title || 'Sans titre',
            h('span.tiny', { style: 'display:block;color:var(--admin-muted)' }, [
              `${p.status === 'published' ? 'Publié' : 'Brouillon'} · ${p.category || ''}`
            ])
          ])
        ])
      );
    }
    root.append(
      h('h2', { style: 'font-size:.875rem;margin-top:1.5rem;margin-bottom:.75rem' }, ['Projets rattachés']),
      projects.length
        ? boxes
        : h('p.small', { style: 'color:var(--admin-muted)' }, ['Aucun projet créé pour l’instant.'])
    );
  }

  /* ---------------- Bloc présence ---------------- */

  function presenceBlock(root) {
    const rsvpRow = h('div.afield', {}, [h('span.alabel', {}, ['Réponse'])]);
    const group = h('div.row', {});
    for (const [value, label] of [
      ['confirmed', 'Confirmée'],
      ['maybe', 'Peut-être'],
      ['pending', 'En attente'],
      ['declined', 'Absente']
    ]) {
      const input = h('input', { type: 'radio', name: 'rsvp', value });
      input.checked = (card.presence?.rsvp || 'pending') === value;
      input.addEventListener('change', () => {
        card.presence.rsvp = value;
        setDirty();
        paintTabs();
      });
      group.append(h('label.acheck', {}, [input, h('span', {}, [label])]));
    }
    rsvpRow.append(group);

    const moments = ['ceremonie', 'cocktail', 'diner', 'soiree', 'nuit', 'conception', 'rendu', 'diffusion'];
    const momentBox = h('div.afield', {}, [h('span.alabel', {}, ['Moments couverts'])]);
    const chips = h('div.row', {});
    for (const m of moments) {
      const input = h('input', { type: 'checkbox' });
      input.checked = (card.presence?.attendMoments || []).includes(m);
      input.addEventListener('change', () => {
        const set = new Set(card.presence.attendMoments || []);
        if (input.checked) set.add(m);
        else set.delete(m);
        card.presence.attendMoments = [...set];
        setDirty();
      });
      chips.append(h('label.acheck', {}, [input, h('span', {}, [m])]));
    }
    momentBox.append(chips);

    root.append(
      rsvpRow,
      h('div.afield-row', {}, [
        field({ label: 'Arrivée', path: 'presence.arrival', type: 'time', value: card.presence?.arrival, onInput: (v) => ((card.presence.arrival = v), setDirty()) }),
        field({ label: 'Départ', path: 'presence.departure', type: 'time', value: card.presence?.departure, onInput: (v) => ((card.presence.departure = v), setDirty()) }),
        field({
          label: 'Accompagnants',
          path: 'presence.companions',
          type: 'number',
          value: card.presence?.companions ?? 0,
          attrs: { min: '0', max: '50' },
          onInput: (v) => ((card.presence.companions = v), setDirty())
        })
      ]),
      momentBox,
      h('div.afield-row', {}, [
        field({ label: 'Table', path: 'presence.table', value: card.presence?.table, onInput: (v) => ((card.presence.table = v), setDirty()) }),
        field({ label: 'Groupe', path: 'presence.group', value: card.presence?.group, onInput: (v) => ((card.presence.group = v), setDirty()) }),
        field({ label: 'Contact le jour même', path: 'presence.contactDayOf', value: card.presence?.contactDayOf, onInput: (v) => ((card.presence.contactDayOf = v), setDirty()) })
      ]),
      field({ label: 'Régime alimentaire', path: 'presence.dietary', value: card.presence?.dietary, onInput: (v) => ((card.presence.dietary = v), setDirty()) }),
      field({
        label: 'Accessibilité',
        path: 'presence.accessibility',
        type: 'textarea',
        value: card.presence?.accessibility,
        attrs: { style: 'min-height:4.5rem' },
        onInput: (v) => ((card.presence.accessibility = v), setDirty())
      }),
      h('h2', { style: 'font-size:.875rem;margin-top:1rem;margin-bottom:.75rem' }, ['Transport']),
      h('div.afield-row', {}, [
        field({ label: 'Mode', path: 'presence.transport.mode', value: card.presence?.transport?.mode, onInput: (v) => ((card.presence.transport.mode = v), setDirty()) }),
        field({ label: 'Depuis', path: 'presence.transport.from', value: card.presence?.transport?.from, onInput: (v) => ((card.presence.transport.from = v), setDirty()) }),
        field({
          label: 'Places',
          path: 'presence.transport.seats',
          type: 'number',
          value: card.presence?.transport?.seats ?? 0,
          attrs: { min: '0', max: '20' },
          onInput: (v) => ((card.presence.transport.seats = v), setDirty())
        })
      ])
    );
  }

  /* ---------------- Bloc apparence 3D ---------------- */

  function visualBlock(root) {
    const o = card.visual.orbit;

    function slider(label, path, value, min, max, step, onChange) {
      const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
      const out = h('output', {}, [String(value)]);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = String(v);
        onChange(v);
      });
      return h('div.slider-row', {}, [h('label', {}, [label, out]), input]);
    }

    root.append(
      h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1.25rem' }, [
        'Ces réglages déterminent la position du fragment dans le hero. L’aperçu de droite se met à jour immédiatement.'
      ]),
      slider('Rayon orbital', 'radius', o.radius, 2, 7, 0.05, (v) => {
        card.visual.orbit.radius = v;
        preview?.update({ card });
        setDirty();
      }),
      slider('Vitesse', 'speed', o.speed, -1, 1, 0.01, (v) => {
        card.visual.orbit.speed = v;
        preview?.update({ card });
        setDirty();
      }),
      slider('Phase (angle de départ)', 'phase', o.phase, 0, 6.28, 0.01, (v) => {
        card.visual.orbit.phase = v;
        preview?.update({ card });
        setDirty();
      }),
      slider('Hauteur', 'yBase', o.yBase, -2.5, 2.5, 0.05, (v) => {
        card.visual.orbit.yBase = v;
        preview?.update({ card });
        setDirty();
      }),
      slider('Taille du fragment', 'size', o.size, 0.03, 0.4, 0.005, (v) => {
        card.visual.orbit.size = v;
        preview?.update({ card });
        setDirty();
      }),
      h('hr', { style: 'border:0;border-top:1px solid var(--admin-line);margin:1.5rem 0' }),
      colorField('Couleur du fragment', card.visual?.accent, (v) => {
        card.visual.accent = v;
        paintPreview();
        setDirty();
      }),
      field({
        label: 'Forme du cœur associée',
        path: 'visual.geometry',
        type: 'select',
        value: card.visual?.geometry,
        options: [
          ['icosa', 'Icosaèdre'],
          ['knot', 'Nœud torique']
        ],
        hint: 'Forme vers laquelle bascule le hero quand cette carte est sélectionnée.',
        onInput: (v) => {
          card.visual.geometry = v;
          preview?.update({ card });
          setDirty();
        }
      }),
      field({
        type: 'checkbox',
        label: 'La lumière pulse pendant la lecture',
        path: 'visual.emitOnPlay',
        value: card.visual?.emitOnPlay !== false,
        onInput: (v) => ((card.visual.emitOnPlay = v), setDirty())
      }),
      uploadField({
        label: 'Texture plaquée sur le fragment',
        kind: 'covers',
        value: card.visual?.textureUrl,
        hint: 'Laisser vide pour utiliser la pochette du morceau.',
        onValue: (url) => {
          card.visual.textureUrl = url;
          paintPreview();
          setDirty();
        }
      }),
      h('div.row', { style: 'margin-top:1rem' }, [
        h('button.abtn', {
          type: 'button',
          onclick: () => {
            card.visual.orbit = {
              radius: 3.2 + Math.random() * 1.5,
              speed: (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? -1 : 1),
              phase: Math.random() * Math.PI * 2,
              yBase: (Math.random() - 0.5) * 2.6,
              size: 0.07 + Math.random() * 0.09
            };
            preview?.update({ card });
            paintPanel();
            setDirty();
            toast('Position tirée au sort.');
          }
        }, ['Tirer une position au sort']),
        h('button.abtn.abtn--ghost', {
          type: 'button',
          onclick: () => {
            card.visual.orbit = { radius: 3.8, speed: 0.2, phase: 0, yBase: 0, size: 0.11 };
            preview?.update({ card });
            paintPanel();
            setDirty();
          }
        }, ['Réinitialiser'])
      ])
    );
  }

  /* ---------------- Bloc publication ---------------- */

  function publishBlock(root) {
    const shareBox = h('div.stack', {});

    async function loadShare(regenerate = false) {
      if (isNew || !saved) {
        shareBox.textContent = '';
        shareBox.append(
          h('p.small', { style: 'color:var(--admin-muted)' }, [
            'Enregistrez la carte pour générer son lien de partage.'
          ])
        );
        return;
      }
      try {
        const { url, qr } = await api.shareCard(card.id, { regenerate });
        const linkInput = h('input', { type: 'text', value: url, readonly: 'true' });
        shareBox.textContent = '';
        shareBox.append(
          h('div.share-link', {}, [
            linkInput,
            h('button.abtn.abtn--sm', {
              type: 'button',
              onclick: async () => {
                await navigator.clipboard?.writeText(url).catch(() => linkInput.select());
                toast('Lien copié.');
              }
            }, ['Copier'])
          ]),
          h('p.tiny', { style: 'color:var(--admin-muted)' }, [
            'Ce lien permet à la personne de compléter sa carte sans créer de compte. Il ne donne accès à aucune autre donnée.'
          ]),
          qr ? h('div.qr-box', {}, [h('img', { src: qr, alt: 'QR code du lien de partage', width: '288', height: '288' })]) : null,
          h('div.row', {}, [
            h('a.abtn.abtn--sm', { href: `/carte/r/${url.split('/').pop()}`, target: '_blank', rel: 'noopener' }, ['Ouvrir le formulaire ↗']),
            h('button.abtn.abtn--sm.abtn--danger', {
              type: 'button',
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Régénérer le lien ?',
                  message: 'L’ancien lien cessera immédiatement de fonctionner. À n’utiliser que si le lien a été diffusé trop largement.',
                  confirmLabel: 'Régénérer',
                  danger: true
                });
                if (ok) loadShare(true);
              }
            }, ['Régénérer'])
          ])
        );
      } catch (err) {
        shareBox.textContent = '';
        shareBox.append(h('p.small', { style: 'color:#e08a80' }, [err.message]));
      }
    }

    root.append(
      h('div.afield-row', {}, [
        field({
          label: 'Statut',
          path: 'status',
          type: 'select',
          value: card.status,
          options: [
            ['draft', 'Brouillon'],
            ['published', 'Publié'],
            ['archived', 'Archivé']
          ],
          hint: 'Publié = visible sur le site et présent dans le hero.',
          onInput: (v) => ((card.status = v), setDirty(), paintTabs())
        }),
        field({
          label: 'Ordre',
          path: 'publish.order',
          type: 'number',
          value: card.publish?.order ?? 50,
          attrs: { min: '0', max: '9999' },
          onInput: (v) => ((card.publish.order = v), setDirty())
        })
      ]),
      field({
        type: 'checkbox',
        label: 'Mettre en avant (reprise dans le hero et sur l’accueil)',
        path: 'publish.featured',
        value: card.publish?.featured,
        onInput: (v) => ((card.publish.featured = v), setDirty())
      }),
      field({
        label: 'Slug',
        path: 'slug',
        value: card.slug,
        hint: `Adresse publique : /carte/${card.slug || '…'}`,
        onInput: (v) => ((card.slug = v), setDirty())
      }),
      field({
        type: 'checkbox',
        label: 'Autoriser le remplissage par lien privé',
        path: 'publish.shareEnabled',
        value: card.publish?.shareEnabled !== false,
        onInput: (v) => ((card.publish.shareEnabled = v), setDirty(), loadShare())
      }),
      field({
        label: 'Expiration du lien (facultatif)',
        path: 'publish.shareExpiresAt',
        type: 'date',
        value: (card.publish?.shareExpiresAt || '').slice(0, 10),
        onInput: (v) => ((card.publish.shareExpiresAt = v), setDirty())
      }),
      h('h2', { style: 'font-size:.875rem;margin:1.5rem 0 .75rem' }, ['Lien de partage']),
      shareBox,
      h('hr', { style: 'border:0;border-top:1px solid var(--admin-line);margin:1.5rem 0' }),
      h('h2', { style: 'font-size:.875rem;margin-bottom:.75rem' }, ['SEO']),
      countedField(
        { label: 'Titre', path: 'publish.seo.title', value: card.publish?.seo?.title, onInput: (v) => ((card.publish.seo.title = v), setDirty()) },
        { max: 60 }
      ),
      countedField(
        {
          label: 'Description',
          path: 'publish.seo.description',
          type: 'textarea',
          value: card.publish?.seo?.description,
          attrs: { style: 'min-height:4.5rem' },
          onInput: (v) => ((card.publish.seo.description = v), setDirty())
        },
        { max: 160 }
      )
    );
    loadShare();
  }

  /* ---------------- Helpers de champ ---------------- */

  function colorField(label, value, onChange) {
    const input = h('input', { type: 'color', value: value || '#b5541d' });
    const hexOut = h('span.mono', { style: 'font-size:10px;color:var(--admin-muted)' }, [value || '']);
    input.addEventListener('input', () => {
      hexOut.textContent = input.value;
      onChange(input.value);
    });
    return h('div.afield', {}, [h('label', {}, [label]), input, hexOut]);
  }

  function uploadField({ label, kind, value, accept, hint, onValue }) {
    const input = h('input', { type: 'text', value: value || '' });
    const file = h('input', { type: 'file', accept: accept || 'image/*' });
    const dz = h('div.dropzone', { tabindex: '0', role: 'button', style: 'padding:1rem' }, [
      'Cliquer ou déposer un fichier',
      file
    ]);
    const handle = async (f) => {
      if (!f) return;
      try {
        const data = await readFileAsDataURL(f);
        const res = await api.upload(data, kind, f.name);
        input.value = res.url;
        onValue(res.url);
        toast('Fichier téléversé.');
      } catch (err) {
        toast(err.message, { error: true });
      }
    };
    dz.addEventListener('click', () => file.click());
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        file.click();
      }
    });
    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('is-over');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove('is-over');
      })
    );
    dz.addEventListener('drop', (e) => handle(e.dataTransfer?.files?.[0]));
    file.addEventListener('change', () => handle(file.files?.[0]));
    input.addEventListener('input', () => onValue(input.value.trim()));

    return h('div.afield', {}, [
      h('label', {}, [label]),
      dz,
      input,
      hint ? h('span.ahint', {}, [hint]) : null
    ]);
  }

  /* ---------------- Actions ---------------- */

  async function persist({ silent = false } = {}) {
    try {
      const payload = structuredClone(card);
      const result = saved ? await api.saveCard(card.id, payload) : await api.createCard(payload);
      card = result.card;
      saved = true;
      markDirty(false);
      if (!silent) toast('Carte enregistrée.');
      if (isNew) navigate(`#/cartes/${card.id}`);
      paintActions();
      return card;
    } catch (err) {
      toast(err.message, { error: true });
      return null;
    }
  }

  function paintActions() {
    actions.textContent = '';
    actions.append(
      h('button.abtn.abtn--primary', { type: 'button', onclick: () => persist() }, ['Enregistrer']),
      card.status === 'published'
        ? h('button.abtn', {
            type: 'button',
            onclick: async () => {
              const c = await persist({ silent: true });
              if (!c) return;
              await api.unpublishCard(c.id);
              card.status = 'draft';
              toast('Carte retirée du site et du hero.');
              paintActions();
              paintTabs();
            }
          }, ['Dépublier'])
        : h('button.abtn', {
            type: 'button',
            onclick: async () => {
              if (!card.identity?.displayName) {
                toast('Donnez au moins un nom affiché avant de publier.', { error: true });
                activeBlock = 'identity';
                paintTabs();
                paintPanel();
                return;
              }
              const c = await persist({ silent: true });
              if (!c) return;
              await api.publishCard(c.id);
              card.status = 'published';
              toast('Carte publiée — elle rejoint le hero.');
              paintActions();
              paintTabs();
            }
          }, ['Publier']),
      statusPill(card.status),
      h('span.spacer', {}),
      card.slug
        ? h('a.abtn.abtn--ghost', { href: `/admin/apercu/carte/${card.slug}`, target: '_blank', rel: 'noopener' }, ['Aperçu'])
        : null,
      !isNew
        ? h('button.abtn', {
            type: 'button',
            onclick: async () => {
              const { card: copy } = await api.duplicateCard(card.id);
              toast('Copie créée en brouillon.');
              navigate(`#/cartes/${copy.id}`);
            }
          }, ['Dupliquer'])
        : null,
      !isNew
        ? h('button.abtn.abtn--danger', {
            type: 'button',
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Supprimer cette carte ?',
                message: `« ${card.identity?.displayName || card.slug} » sera définitivement retirée, ainsi que des crédits des projets qui la citaient.`,
                confirmLabel: 'Supprimer',
                danger: true
              });
              if (!ok) return;
              await api.deleteCard(card.id);
              markDirty(false);
              toast('Carte supprimée.');
              navigate('#/cartes');
            }
          }, ['Supprimer'])
        : null
    );
  }

  /* ---------------- Autosauvegarde ---------------- */

  let autosaveTimer = 0;
  const autosave = () => {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      if (markDirty && saved) persist({ silent: true });
    }, 4000);
  };
  const onAnyInput = () => autosave();
  panelEl.addEventListener('input', onAnyInput);
  panelEl.addEventListener('change', onAnyInput);

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      persist();
    }
  };
  document.addEventListener('keydown', onKey);

  onDispose?.(() => {
    document.removeEventListener('keydown', onKey);
    clearTimeout(autosaveTimer);
    stopAudio();
    preview?.dispose();
    preview = null;
  });

  paintTabs();
  paintPanel();
  paintPreview();
  paintActions();
  if (isNew) setDirty(true);
}
