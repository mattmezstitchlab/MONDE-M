/**
 * Hero 3D — réglages de la scène et des textes.
 *
 * Tout ce qui est modifiable sans toucher au code : textes, palette,
 * géométrie, amplitude de respiration, densité de poussière, source des
 * fragments, comportement audio.
 */
import { api } from '../api.js';
import { h, esc, toast, field, confirmDialog } from '../ui.js';
import { createPreviewScene } from '../preview.js';
import { markDirty } from '../app.js';

export async function renderHero({ main, onDispose }) {
  const [{ hero }, { cards }] = await Promise.all([api.hero(), api.cards('?status=published')]);
  const draft = structuredClone(hero);

  main.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, ['Hero 3D']),
        h('p', {}, [
          'La scène reste celle d’origine : ce panneau règle ses textes, ses couleurs et sa composition. Les fragments sont alimentés par les cartes publiées.'
        ])
      ]),
      h('div.row', {}, [
        h('a.abtn.abtn--ghost', { href: '/', target: '_blank', rel: 'noopener' }, ['Voir le hero ↗'])
      ])
    ])
  );

  const actions = h('div.toolbar', {});
  main.append(actions);

  const grid = h('div.editor', { style: 'grid-template-columns:minmax(0,1fr) minmax(0,22rem)' });
  const left = h('div', { style: 'display:grid;gap:1.25rem;min-width:0' });
  const right = h('div.preview-col', {});
  grid.append(left, right);
  main.append(grid);

  /* ---------------- Aperçu ---------------- */

  const stage = h('div.preview-stage', {});
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  stage.append(canvas);
  right.append(
    stage,
    h('div.preview-card', {}, [
      h('p.tiny', { style: 'color:var(--admin-muted)' }, [
        'Aperçu indicatif : la scène réelle utilise la géométrie, la palette et la respiration définies ici, avec les fragments des cartes publiées.'
      ]),
      h('p.tiny', {}, [
        `${cards.length} carte${cards.length > 1 ? 's' : ''} publiée${cards.length > 1 ? 's' : ''} · `,
        h('strong', {}, [String(Math.min(cards.length, Number(draft.fragments?.count) || 12))]),
        ' fragment(s) affiché(s)'
      ])
    ])
  );

  let preview = null;
  const demoCard = cards[0] || null;
  function initPreview() {
    try {
      preview = createPreviewScene(canvas, { card: demoCard });
    } catch {
      stage.textContent = '';
      stage.append(h('p.tiny', { style: 'padding:1rem' }, ['Aperçu 3D indisponible sur ce navigateur.']));
      preview = null;
    }
  }
  initPreview();

  onDispose?.(() => {
    preview?.dispose();
    preview = null;
  });

  /* ---------------- Textes ---------------- */

  const textsPanel = h('div.panel', {}, [h('h2', {}, ['Textes du hero'])]);
  textsPanel.append(
    field({ label: 'Surtitre', path: 'eyebrow', value: draft.eyebrow, hint: 'Petites capitales au-dessus du titre.', onInput: (v) => ((draft.eyebrow = v), markDirty()) }),
    h('div.afield-row', {}, [
      field({ label: 'Titre — première ligne', path: 'title', value: draft.title, onInput: (v) => ((draft.title = v), markDirty()) }),
      field({
        label: 'Titre — seconde ligne (en accent)',
        path: 'titleAccent',
        value: draft.titleAccent,
        hint: 'Affichée en italique et dans la couleur d’accent.',
        onInput: (v) => ((draft.titleAccent = v), markDirty())
      })
    ]),
    countedArea('Description', draft.description, 320, (v) => ((draft.description = v), markDirty())),
    h('div.afield-row', {}, [
      field({ label: 'Bouton principal', path: 'ctaLabel', value: draft.ctaLabel, hint: 'Déclenche le morph.', onInput: (v) => ((draft.ctaLabel = v), markDirty()) }),
      field({ label: 'Bouton secondaire — libellé', path: 'secondaryCta.label', value: draft.secondaryCta?.label, onInput: (v) => ((draft.secondaryCta = { ...draft.secondaryCta, label: v }), markDirty()) }),
      field({ label: 'Bouton secondaire — cible', path: 'secondaryCta.href', value: draft.secondaryCta?.href, hint: 'Laisser vide pour masquer le bouton.', onInput: (v) => ((draft.secondaryCta = { ...draft.secondaryCta, href: v }), markDirty()) })
    ])
  );
  left.append(textsPanel);

  /* ---------------- Palette ---------------- */

  const palettePanel = h('div.panel', {}, [
    h('h2', {}, ['Palette']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      'Les accents sont repris par le wireframe, la lumière et les variables CSS du site : le morph change la couleur de toute la page.'
    ])
  ]);
  const accentList = h('div.repeater', {});
  function paintAccents() {
    accentList.textContent = '';
    (draft.palette.accents || []).forEach((value, i) => {
      const input = h('input', { type: 'color', value });
      const text = h('input', { type: 'text', value, style: 'font-family:var(--font-mono);font-size:11px' });
      input.addEventListener('input', () => {
        draft.palette.accents[i] = input.value;
        text.value = input.value;
        preview?.update({ card: { ...demoCard, visual: { accent: input.value } } });
        markDirty();
      });
      text.addEventListener('input', () => {
        if (/^#[0-9a-f]{6}$/i.test(text.value)) {
          draft.palette.accents[i] = text.value;
          input.value = text.value;
          markDirty();
        }
      });
      accentList.append(
        h('div.repeater-row', { style: 'grid-template-columns:auto 1fr auto' }, [
          input,
          text,
          h('button.icon-btn', {
            type: 'button',
            'aria-label': 'Retirer cet accent',
            onclick: () => {
              if (draft.palette.accents.length <= 2) {
                toast('Il faut au moins deux accents : le morph bascule de l’un à l’autre.', { error: true });
                return;
              }
              draft.palette.accents.splice(i, 1);
              paintAccents();
              markDirty();
            }
          }, ['×'])
        ])
      );
    });
  }
  palettePanel.append(
    h('div.afield-row', {}, [
      colorField('Fond', draft.palette.bg, (v) => ((draft.palette.bg = v), markDirty())),
      colorField('Encre', draft.palette.ink, (v) => ((draft.palette.ink = v), markDirty()))
    ]),
    h('div.afield-row', {}, [
      colorField('Texte secondaire', draft.palette.muted, (v) => ((draft.palette.muted = v), markDirty())),
      colorField('Texte 10-11px', draft.palette.mutedStrong, (v) => ((draft.palette.mutedStrong = v), markDirty()))
    ]),
    h('p.tiny', { style: 'color:var(--admin-muted);margin-bottom:.75rem' }, [
      'Sur fond #f6f6f3 : viser 4,5:1 minimum pour le texte courant, 5:1 pour les textes en dessous de 12px.'
    ]),
    h('span.alabel', { style: 'display:block;margin-bottom:.5rem;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--admin-muted)' }, [
      'Accents du morph'
    ]),
    accentList,
    h('button.abtn', {
      type: 'button',
      style: 'margin-top:.75rem',
      onclick: () => {
        draft.palette.accents.push('#b5541d');
        paintAccents();
        markDirty();
      }
    }, ['+ Ajouter un accent'])
  );
  paintAccents();
  left.append(palettePanel);

  /* ---------------- Géométrie et mouvement ---------------- */

  const geoPanel = h('div.panel', {}, [h('h2', {}, ['Géométrie et mouvement'])]);
  geoPanel.append(
    h('div.afield-row', {}, [
      field({
        label: 'Forme au repos',
        path: 'geometry.idle',
        type: 'select',
        value: draft.geometry.idle,
        options: [['icosa', 'Icosaèdre'], ['knot', 'Nœud torique']],
        onInput: (v) => {
          draft.geometry.idle = v;
          markDirty();
        }
      }),
      field({
        label: 'Forme après bascule',
        path: 'geometry.morphTarget',
        type: 'select',
        value: draft.geometry.morphTarget,
        options: [['knot', 'Nœud torique'], ['icosa', 'Icosaèdre']],
        onInput: (v) => ((draft.geometry.morphTarget = v), markDirty())
      })
    ]),
    rangeField('Amplitude de respiration (icosa)', draft.geometry.breatheAmp, 0, 0.2, 0.005, (v) => {
      draft.geometry.breatheAmp = v;
      markDirty();
    }),
    rangeField('Amplitude de respiration (nœud)', draft.geometry.breatheAmpKnot, 0, 0.2, 0.005, (v) => {
      draft.geometry.breatheAmpKnot = v;
      markDirty();
    }),
    h('hr', { style: 'border:0;border-top:1px solid var(--admin-line);margin:1.5rem 0' }),
    rangeField('Rotation libre', draft.motion.idleSpin, 0, 0.01, 0.0002, (v) => ((draft.motion.idleSpin = v), markDirty())),
    rangeField('Amplitude de parallaxe', draft.motion.parallax, 0, 2, 0.05, (v) => ((draft.motion.parallax = v), markDirty())),
    h('div.afield-row', {}, [
      field({ label: 'Zoom minimum', path: 'motion.zoomMin', type: 'number', value: draft.motion.zoomMin, attrs: { min: '3', max: '12', step: '0.5' }, onInput: (v) => ((draft.motion.zoomMin = v), markDirty()) }),
      field({ label: 'Zoom maximum', path: 'motion.zoomMax', type: 'number', value: draft.motion.zoomMax, attrs: { min: '8', max: '30', step: '0.5' }, onInput: (v) => ((draft.motion.zoomMax = v), markDirty()) })
    ]),
    field({
      label: 'Repli si mouvement réduit',
      path: 'motion.reducedMotionFallback',
      type: 'select',
      value: draft.motion.reducedMotionFallback,
      options: [['static', 'Scène statique'], ['slow', 'Rotation ralentie']],
      hint: 'Appliqué quand le visiteur a demandé « prefers-reduced-motion ». La respiration et le pulse sont coupés dans les deux cas.',
      onInput: (v) => ((draft.motion.reducedMotionFallback = v), markDirty())
    })
  );
  left.append(geoPanel);

  /* ---------------- Fragments ---------------- */

  const fragPanel = h('div.panel', {}, [
    h('h2', {}, ['Fragments']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      'Chaque fragment porte une carte publiée et mise en avant. Leur position, taille et couleur viennent du bloc « Apparence 3D » de chaque carte.'
    ])
  ]);
  fragPanel.append(
    field({
      label: 'Source des fragments',
      path: 'fragments.source',
      type: 'select',
      value: draft.fragments.source,
      options: [['cards', 'Cartes publiées'], ['none', 'Composition aléatoire (comportement d’origine)']],
      onInput: (v) => ((draft.fragments.source = v), markDirty())
    }),
    rangeField('Nombre de fragments', draft.fragments.count, 1, 24, 1, (v) => {
      draft.fragments.count = Math.round(v);
      markDirty();
    }),
    field({ type: 'checkbox', label: 'Afficher la poussière', path: 'fragments.showDust', value: draft.fragments.showDust !== false, onInput: (v) => ((draft.fragments.showDust = v), markDirty()) }),
    rangeField('Densité de poussière', draft.fragments.dustCount, 0, 1200, 20, (v) => {
      draft.fragments.dustCount = Math.round(v);
      markDirty();
    })
  );
  if (cards.length) {
    const list = h('div.stack', { style: 'margin-top:1rem' });
    cards
      .filter((c) => c.publish?.featured)
      .slice(0, Number(draft.fragments.count) || 12)
      .forEach((c, i) => {
        list.append(
          h('div.row', { style: 'gap:.6rem' }, [
            h('span.mono', { style: 'color:var(--admin-muted);width:1.5rem' }, [String(i + 1).padStart(2, '0')]),
            h('span.swatch', { style: `background:${esc(c.visual?.accent || '#b5541d')}` }),
            h('a', { href: `#/cartes/${c.id}`, style: 'font-size:.875rem;text-decoration:none' }, [
              c.identity?.displayName || 'Sans nom'
            ]),
            h('span.tiny', { style: 'color:var(--admin-muted)' }, [
              [c.music?.trackTitle, c.music?.artist].filter(Boolean).join(' — ')
            ])
          ])
        );
      });
    fragPanel.append(
      h('span.alabel', { style: 'display:block;margin:1rem 0 .5rem;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--admin-muted)' }, [
        'Composition actuelle'
      ]),
      list
    );
  }
  left.append(fragPanel);

  /* ---------------- Audio ---------------- */

  const audioPanel = h('div.panel', {}, [
    h('h2', {}, ['Audio']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      'L’extrait ne démarre jamais sans un geste du visiteur : c’est une contrainte des navigateurs, et un choix de confort.'
    ])
  ]);
  audioPanel.append(
    field({
      type: 'checkbox',
      label: 'Proposer l’extrait au premier clic sur la page',
      path: 'audio.autoplayPreview',
      value: draft.audio?.autoplayPreview,
      hint: 'Reste conditionné à une interaction : aucun son ne démarre au chargement.',
      onInput: (v) => ((draft.audio.autoplayPreview = v), markDirty())
    }),
    rangeField('Volume par défaut', draft.audio?.volume ?? 0.8, 0, 1, 0.05, (v) => ((draft.audio.volume = v), markDirty())),
    rangeField('Fondu d’entrée (s)', draft.audio?.fadeIn ?? 0.4, 0, 2, 0.1, (v) => ((draft.audio.fadeIn = v), markDirty()))
  );
  left.append(audioPanel);

  /* ---------------- Actions ---------------- */

  async function save() {
    try {
      const { hero: saved } = await api.saveHero(draft);
      Object.assign(draft, saved);
      markDirty(false);
      toast('Hero enregistré. Rechargez la page publique pour le voir.');
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  actions.append(
    h('button.abtn.abtn--primary', { type: 'button', onclick: save }, ['Enregistrer']),
    h('button.abtn', {
      type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Rétablir les réglages du hero ?',
          message:
            'Textes, palette, géométrie, mouvement, fragments et audio reviendront à leurs valeurs d’origine. Les projets et les cartes ne sont pas touchés.',
          confirmLabel: 'Rétablir le hero'
        });
        if (!ok) return;
        try {
          const { hero: restored } = await api.resetHero();
          // On repart de la valeur restaurée, y compris pour les blocs imbriqués.
          for (const key of Object.keys(draft)) delete draft[key];
          Object.assign(draft, structuredClone(restored));
          markDirty(false);
          toast('Réglages du hero rétablis.');
          location.reload();
        } catch (err) {
          toast(err.message, { error: true });
        }
      }
    }, ['Rétablir le hero']),
    h('span.spacer', {}),
    h('span.tiny', { style: 'color:var(--admin-muted)' }, [
      'Ctrl/Cmd + S pour enregistrer'
    ])
  );

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };
  document.addEventListener('keydown', onKey);
  const prevDispose = onDispose;
  prevDispose?.(() => {
    document.removeEventListener('keydown', onKey);
    preview?.dispose();
  });
}

/* ---------------- Helpers ---------------- */

function colorField(label, value, onChange) {
  const input = h('input', { type: 'color', value: value || '#b5541d' });
  const out = h('span.mono', { style: 'font-size:10px;color:var(--admin-muted)' }, [value || '']);
  input.addEventListener('input', () => {
    out.textContent = input.value;
    onChange(input.value);
  });
  return h('div.afield', {}, [h('label', {}, [label]), input, out]);
}

function rangeField(label, value, min, max, step, onChange) {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value ?? min) });
  const out = h('output', {}, [String(value ?? min)]);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = Number.isInteger(step) || step >= 1 ? String(Math.round(v)) : String(v);
    onChange(v);
  });
  return h('div.slider-row', { style: 'margin-bottom:1rem' }, [h('label', {}, [label, out]), input]);
}

function countedArea(label, value, max, onChange) {
  const wrap = field({
    label,
    path: 'description',
    type: 'textarea',
    value: value || '',
    attrs: { maxlength: String(max), style: 'min-height:5.5rem' },
    onInput: onChange
  });
  const counter = h('span.counter', {}, [`${String(value || '').length} / ${max}`]);
  wrap.querySelector('textarea')?.addEventListener('input', (e) => {
    counter.textContent = `${e.target.value.length} / ${max}`;
    counter.classList.toggle('is-over', e.target.value.length > max);
  });
  wrap.append(counter);
  return wrap;
}
