/** Projets — liste, filtres, réordonnancement et éditeur complet. */
import { api } from '../api.js';
import {
  h,
  esc,
  toast,
  confirmDialog,
  statusPill,
  miniCover,
  relativeTime,
  field,
  countedField,
  makeSortable,
  readFileAsDataURL,
  dominantColors,
  CATEGORIES
} from '../ui.js';
import { markDirty } from '../app.js';

/* ================================================================== */
/* LISTE                                                               */
/* ================================================================== */

export async function renderProjects({ main, query, navigate }) {
  const status = query.get('status') || 'all';
  const q = query.get('q') || '';
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (q) params.set('q', q);
  const { projects } = await api.projects(params.toString() ? `?${params}` : '');

  main.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, ['Projets']),
        h('p', {}, [
          `${projects.length} projet${projects.length > 1 ? 's' : ''} affiché${
            projects.length > 1 ? 's' : ''
          }. Glissez les lignes pour changer l’ordre d’apparition sur le site.`
        ])
      ]),
      h('a.abtn.abtn--primary', { href: '#/projets/nouveau' }, ['+ Nouveau projet'])
    ])
  );

  /* ---------------- Filtres ---------------- */

  const filterBar = h('div.toolbar', {});
  for (const [value, label] of [
    ['all', 'Tous'],
    ['published', 'Publiés'],
    ['draft', 'Brouillons'],
    ['archived', 'Archivés']
  ]) {
    filterBar.append(
      h(
        'a.abtn',
        {
          href: `#/projets?status=${value}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
          class: status === value ? 'abtn--primary' : ''
        },
        [label]
      )
    );
  }
  filterBar.append(h('span.spacer', {}));
  const search = h('input', {
    type: 'search',
    placeholder: 'Rechercher un projet…',
    value: q,
    'aria-label': 'Rechercher un projet',
    style:
      'background:var(--admin-bg);border:1px solid var(--admin-line);border-radius:6px;color:var(--admin-ink);padding:.5rem .7rem;font-size:.875rem;min-width:14rem'
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigate(`#/projets?status=${status}&q=${encodeURIComponent(search.value)}`);
    }
  });
  filterBar.append(search);
  main.append(filterBar);

  /* ---------------- Tableau ---------------- */

  if (!projects.length) {
    main.append(
      h('div.empty-state', {}, [
        h('h2', {}, ['Aucun projet ici']),
        h('p.small', {}, [q || status !== 'all' ? 'Élargissez les filtres.' : 'Publiez votre premier projet.']),
        h('a.abtn.abtn--primary', { href: '#/projets/nouveau' }, ['+ Nouveau projet'])
      ])
    );
    return;
  }

  const tbody = h('tbody', {});
  for (const p of projects) {
    const linkedCards = (p.credits || []).filter((c) => c.cardId).length;
    tbody.append(
      h(
        'tr',
        {
          dataset: { id: p.id },
          draggable: 'true'
        },
        [
          h('td', { class: 'num' }, [h('span.drag-handle', { title: 'Glisser pour réordonner' }, ['⠿'])]),
          h('td', {}, [
            h('div.cell-main', {}, [
              miniCover({ music: { coverUrl: p.cover?.url, coverColors: p.cover?.colors } }, '2.5rem'),
              h('div', { style: 'min-width:0' }, [
                h('strong', {}, [p.title || 'Sans titre']),
                h('span', {}, [p.subtitle || `/projets/${p.slug}`])
              ])
            ])
          ]),
          h('td', { class: 'tiny' }, [p.category || '—']),
          h('td', {}, [statusPill(p.status)]),
          h('td', { class: 'tiny' }, [
            `${linkedCards} carte${linkedCards > 1 ? 's' : ''}${p.featured ? ' · en avant' : ''}`
          ]),
          h('td', { class: 'tiny' }, [relativeTime(p.updatedAt)]),
          h('td', {}, [
            h('div.row', { style: 'flex-wrap:nowrap;gap:.35rem' }, [
              h('a.abtn.abtn--sm', { href: `#/projets/${p.id}` }, ['Éditer']),
              p.status === 'published'
                ? h(
                    'button.abtn.abtn--sm',
                    {
                      type: 'button',
                      onclick: async () => {
                        await api.unpublishProject(p.id);
                        toast(`« ${p.title} » retiré du site.`);
                        navigate(location.hash || '#/projets');
                      }
                    },
                    ['Dépublier']
                  )
                : h(
                    'button.abtn.abtn--sm.abtn--primary',
                    {
                      type: 'button',
                      onclick: async () => {
                        await api.publishProject(p.id);
                        toast(`« ${p.title} » publié.`);
                        navigate(location.hash || '#/projets');
                      }
                    },
                    ['Publier']
                  ),
              h(
                'a.abtn.abtn--sm.abtn--ghost',
                { href: `/projets/${p.slug}`, target: '_blank', rel: 'noopener', title: 'Voir la page publique' },
                ['↗']
              )
            ])
          ])
        ]
      )
    );
  }

  const table = h('table.admin-table', {}, [
    h('thead', {}, [
      h('tr', {}, [
        h('th', {}, ['Ordre']),
        h('th', {}, ['Projet']),
        h('th', {}, ['Catégorie']),
        h('th', {}, ['Statut']),
        h('th', {}, ['Crédits']),
        h('th', {}, ['Modifié']),
        h('th', {}, ['Actions'])
      ])
    ]),
    tbody
  ]);

  makeSortable(tbody, async (ids) => {
    try {
      await api.reorderProjects(ids);
      toast('Ordre enregistré.');
    } catch (err) {
      toast(err.message, { error: true });
    }
  });

  main.append(h('div.panel', { style: 'overflow-x:auto' }, [table]));
}

/* ================================================================== */
/* ÉDITEUR                                                             */
/* ================================================================== */

const EMPTY = {
  title: '',
  subtitle: '',
  slug: '',
  category: 'installation',
  status: 'draft',
  summary: '',
  body: '',
  client: '',
  year: new Date().getFullYear(),
  date: new Date().toISOString().slice(0, 10),
  order: 50,
  featured: false,
  tags: [],
  credits: [],
  links: [],
  gallery: [],
  cover: { url: '', alt: '', colors: { dominant: '#b5541d', accent: '#141414' } },
  media: { videoUrl: '', posterUrl: '', audioUrl: '' },
  hero: { mode: 'inherit', geometry: 'icosa', accent: '#b5541d' },
  seo: { title: '', description: '', ogImage: '', noindex: false }
};

export async function renderProjectEditor({ main, navigate, onDispose }, id) {
  const isNew = id === 'nouveau';
  const allCards = await api.cards().then((r) => r.cards);

  let project = isNew ? structuredClone(EMPTY) : (await api.project(id)).project;
  if (!project) {
    main.append(h('div.empty-state', {}, [h('h2', {}, ['Projet introuvable']), h('a.abtn', { href: '#/projets' }, ['Retour'])]));
    return;
  }

  let saved = !isNew;
  const setDirty = (v = true) => markDirty(v);

  main.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, [isNew ? 'Nouveau projet' : project.title || 'Projet']),
        h('p', {}, [
          isNew
            ? 'Renseignez l’essentiel, puis publiez. Un brouillon n’apparaît jamais sur le site.'
            : `Modifié ${relativeTime(project.updatedAt)} · /projets/${project.slug}`
        ])
      ]),
      h('div.row', {}, [
        h('a.abtn', { href: '#/projets' }, ['← Projets']),
        project.slug && !isNew
          ? h('a.abtn.abtn--ghost', { href: `/projets/${project.slug}`, target: '_blank', rel: 'noopener' }, ['Voir ↗'])
          : null
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

  /* ---------------- Identité du projet ---------------- */

  const identityPanel = h('div.panel', {}, [h('h2', {}, ['Le projet'])]);
  const titleField = field({
    label: 'Titre',
    path: 'title',
    value: project.title,
    onInput: (v) => {
      project.title = v;
      setDirty();
      if (!slugTouched) {
        project.slug = v
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 72);
        slugInput.value = project.slug;
      }
    }
  });
  const slugInput = h('input', { type: 'text', value: project.slug, id: 'f_slug' });
  let slugTouched = Boolean(project.slug && !isNew);
  slugInput.addEventListener('input', () => {
    slugTouched = true;
    project.slug = slugInput.value;
    setDirty();
  });
  identityPanel.append(
    titleField,
    field({
      label: 'Sous-titre',
      path: 'subtitle',
      value: project.subtitle,
      onInput: (v) => ((project.subtitle = v), setDirty())
    }),
    h('div.afield', {}, [
      h('label', { for: 'f_slug' }, ['Slug']),
      slugInput,
      h('span.ahint', {}, [`Adresse publique : /projets/${project.slug || '…'}`])
    ]),
    h('div.afield-row', {}, [
      field({
        label: 'Catégorie',
        path: 'category',
        type: 'select',
        value: project.category,
        options: CATEGORIES,
        onInput: (v) => ((project.category = v), setDirty())
      }),
      field({
        label: 'Statut',
        path: 'status',
        type: 'select',
        value: project.status,
        options: [
          ['draft', 'Brouillon'],
          ['published', 'Publié'],
          ['archived', 'Archivé']
        ],
        onInput: (v) => ((project.status = v), setDirty())
      }),
      field({
        label: 'Année',
        path: 'year',
        type: 'number',
        value: project.year,
        attrs: { min: '1900', max: '2200' },
        onInput: (v) => ((project.year = v), setDirty())
      }),
      field({
        label: 'Date',
        path: 'date',
        type: 'date',
        value: project.date,
        onInput: (v) => ((project.date = v), setDirty())
      })
    ]),
    field({
      label: 'Client',
      path: 'client',
      value: project.client,
      onInput: (v) => ((project.client = v), setDirty())
    }),
    field({
      label: 'Étiquettes',
      path: 'tagsText',
      value: (project.tags || []).join(', '),
      hint: 'Séparées par des virgules. Servent à la recherche et au SEO.',
      onInput: (v) => ((project.tags = v.split(',').map((s) => s.trim()).filter(Boolean)), setDirty())
    }),
    field({ type: 'checkbox', label: 'Mettre en avant sur l’accueil', path: 'featured', value: project.featured, onInput: (v) => ((project.featured = v), setDirty()) }),
    field({
      label: 'Ordre d’affichage',
      path: 'order',
      type: 'number',
      value: project.order ?? 50,
      hint: 'Plus petit = plus haut. Le glisser-déposer de la liste met ce champ à jour.',
      attrs: { min: '0', max: '9999' },
      onInput: (v) => ((project.order = v), setDirty())
    })
  );
  left.append(identityPanel);

  /* ---------------- Textes ---------------- */

  const textPanel = h('div.panel', {}, [h('h2', {}, ['Textes'])]);
  textPanel.append(
    countedField(
      {
        label: 'Chapô',
        path: 'summary',
        type: 'textarea',
        value: project.summary,
        hint: 'Une à deux phrases. Affiché dans la liste des projets et repris en description SEO.',
        onInput: (v) => ((project.summary = v), setDirty())
      },
      { max: 320 }
    ),
    field({
      label: 'Texte complet',
      path: 'body',
      type: 'textarea',
      value: project.body,
      hint: 'Paragraphes séparés par une ligne vide. Le texte est échappé à l’affichage.',
      attrs: { style: 'min-height:16rem' },
      onInput: (v) => ((project.body = v), setDirty())
    })
  );
  left.append(textPanel);

  /* ---------------- Couverture ---------------- */

  const coverPanel = h('div.panel', {}, [h('h2', {}, ['Couverture'])]);
  const swatches = h('div.swatches', {});
  const coverPreview = h('div.preview-cover', { style: 'aspect-ratio:16/9' });

  function paintCover() {
    const c = project.cover?.colors || {};
    coverPreview.textContent = '';
    if (project.cover?.url) {
      coverPreview.append(h('img', { src: project.cover.url, alt: project.cover.alt || '' }));
    } else {
      coverPreview.style.background = `linear-gradient(140deg, ${esc(c.dominant || '#b5541d')}, ${esc(
        c.accent || '#141414'
      )})`;
      coverPreview.append(project.title || 'Sans titre');
    }
    swatches.textContent = '';
    for (const [label, key] of [
      ['Dominante', 'dominant'],
      ['Accent', 'accent']
    ]) {
      swatches.append(
        h('div', { style: 'display:grid;gap:.25rem;justify-items:center' }, [
          h('span.swatch', { style: `background:${esc(c[key] || '#ccc')}` }),
          h('span', { class: 'tiny' }, [label])
        ])
      );
    }
  }

  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const dz = h('div.dropzone', { tabindex: '0', role: 'button' }, [
    'Cliquer ou déposer une image de couverture',
    h('span.ahint', { style: 'display:block;margin-top:.4rem' }, [
      'PNG, JPEG, WebP ou GIF — 8 Mo maximum. Les couleurs dominantes sont extraites automatiquement.'
    ]),
    fileInput
  ]);

  async function handleFile(file) {
    if (!file) return;
    try {
      const data = await readFileAsDataURL(file);
      const { url } = await api.upload(data, 'covers', file.name);
      project.cover = { ...project.cover, url };
      const colors = await dominantColors(url);
      project.cover.colors = { dominant: colors.dominant, accent: colors.accent };
      dzInput.value = url;
      paintCover();
      setDirty();
      toast('Couverture téléversée, couleurs extraites.');
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  const dzInput = h('input', {
    type: 'text',
    value: project.cover?.url || '',
    placeholder: '/media/covers/… ou https://…'
  });
  dzInput.addEventListener('input', () => {
    project.cover = { ...project.cover, url: dzInput.value.trim() };
    paintCover();
    setDirty();
  });

  dz.addEventListener('click', () => fileInput.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
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
  dz.addEventListener('drop', (e) => handleFile(e.dataTransfer?.files?.[0]));
  fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]));

  coverPanel.append(
    coverPreview,
    dz,
    h('div.afield', { style: 'margin-top:1rem' }, [
      h('label', {}, ['URL de l’image']),
      dzInput
    ]),
    field({
      label: 'Texte alternatif',
      path: 'cover.alt',
      value: project.cover?.alt || '',
      hint: 'Description pour les lecteurs d’écran et si l’image ne charge pas.',
      onInput: (v) => ((project.cover = { ...project.cover, alt: v }), setDirty())
    }),
    h('div.afield', {}, [h('span.alabel', {}, ['Couleurs extraites']), swatches]),
    h('div.afield-row', {}, [
      colorField('Dominante', 'cover.colors.dominant', project.cover?.colors?.dominant, (v) => {
        project.cover.colors.dominant = v;
        paintCover();
        setDirty();
      }),
      colorField('Accent', 'cover.colors.accent', project.cover?.colors?.accent, (v) => {
        project.cover.colors.accent = v;
        paintCover();
        setDirty();
      })
    ])
  );
  paintCover();
  left.append(coverPanel);

  /* ---------------- Crédits : lien vers les cartes ---------------- */

  const creditsPanel = h('div.panel', {}, [
    h('h2', {}, ['Crédits']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      'Chaque crédit peut pointer vers une carte : la page du projet affichera alors la pochette et le morceau de la personne.'
    ])
  ]);
  const creditsList = h('div.repeater', {});

  function paintCredits() {
    creditsList.textContent = '';
    if (!project.credits.length) {
      creditsList.append(h('p.small', { style: 'color:var(--admin-muted)' }, ['Aucun crédit.']));
    }
    project.credits.forEach((credit, index) => {
      const cardSelect = h('select', {});
      cardSelect.append(h('option', { value: '' }, ['— aucune carte —']));
      for (const card of allCards) {
        const label = `${card.identity?.displayName || 'Sans nom'}${
          card.music?.trackTitle ? ` · ${card.music.trackTitle}` : ''
        }`;
        const opt = h('option', { value: card.id }, [label]);
        if (card.id === credit.cardId) opt.selected = true;
        cardSelect.append(opt);
      }
      const roleInput = h('input', { type: 'text', value: credit.role || '', placeholder: 'Rôle' });
      const nameInput = h('input', { type: 'text', value: credit.name || '', placeholder: 'Nom' });
      roleInput.addEventListener('input', () => ((project.credits[index].role = roleInput.value), setDirty()));
      nameInput.addEventListener('input', () => ((project.credits[index].name = nameInput.value), setDirty()));
      cardSelect.addEventListener('change', () => {
        project.credits[index].cardId = cardSelect.value;
        const card = allCards.find((c) => c.id === cardSelect.value);
        if (card && !nameInput.value) {
          nameInput.value = card.identity?.displayName || '';
          project.credits[index].name = nameInput.value;
        }
        setDirty();
      });

      creditsList.append(
        h('div.repeater-row', { style: 'grid-template-columns:1fr 1fr 1.4fr auto' }, [
          roleInput,
          nameInput,
          cardSelect,
          h(
            'button.icon-btn',
            {
              type: 'button',
              title: 'Retirer ce crédit',
              'aria-label': 'Retirer ce crédit',
              onclick: () => {
                project.credits.splice(index, 1);
                paintCredits();
                setDirty();
              }
            },
            ['×']
          )
        ])
      );
    });
  }

  creditsPanel.append(
    creditsList,
    h('button.abtn', {
      type: 'button',
      style: 'margin-top:1rem',
      onclick: () => {
        project.credits.push({ role: '', name: '', cardId: '' });
        paintCredits();
        setDirty();
      }
    }, ['+ Ajouter un crédit'])
  );
  paintCredits();
  left.append(creditsPanel);

  /* ---------------- Liens et galerie ---------------- */

  const linksPanel = h('div.panel', {}, [h('h2', {}, ['Liens et galerie'])]);
  const linksList = h('div.repeater', {});
  function paintLinks() {
    linksList.textContent = '';
    if (!project.links.length) linksList.append(h('p.small', { style: 'color:var(--admin-muted)' }, ['Aucun lien.']));
    project.links.forEach((link, index) => {
      const label = h('input', { type: 'text', value: link.label || '', placeholder: 'Libellé' });
      const url = h('input', { type: 'url', value: link.url || '', placeholder: 'https://…' });
      label.addEventListener('input', () => ((project.links[index].label = label.value), setDirty()));
      url.addEventListener('input', () => ((project.links[index].url = url.value), setDirty()));
      linksList.append(
        h('div.repeater-row', {}, [
          label,
          url,
          h('button.icon-btn', {
            type: 'button',
            'aria-label': 'Retirer ce lien',
            onclick: () => {
              project.links.splice(index, 1);
              paintLinks();
              setDirty();
            }
          }, ['×'])
        ])
      );
    });
  }
  const galleryList = h('div.repeater', {});
  function paintGallery() {
    galleryList.textContent = '';
    if (!project.gallery.length) galleryList.append(h('p.small', { style: 'color:var(--admin-muted)' }, ['Aucune image.']));
    project.gallery.forEach((item, index) => {
      const url = h('input', { type: 'text', value: item.url || '', placeholder: '/media/uploads/…' });
      const caption = h('input', { type: 'text', value: item.caption || '', placeholder: 'Légende' });
      url.addEventListener('input', () => ((project.gallery[index].url = url.value), setDirty()));
      caption.addEventListener('input', () => ((project.gallery[index].caption = caption.value), setDirty()));
      galleryList.append(
        h('div.repeater-row', { style: 'grid-template-columns:1.6fr 1fr auto' }, [
          url,
          caption,
          h('button.icon-btn', {
            type: 'button',
            'aria-label': 'Retirer cette image',
            onclick: () => {
              project.gallery.splice(index, 1);
              paintGallery();
              setDirty();
            }
          }, ['×'])
        ])
      );
    });
  }
  const galleryFile = h('input', { type: 'file', accept: 'image/*', multiple: 'true' });
  galleryFile.addEventListener('change', async () => {
    const files = [...(galleryFile.files || [])];
    for (const file of files) {
      try {
        const data = await readFileAsDataURL(file);
        const { url } = await api.upload(data, 'uploads', file.name);
        project.gallery.push({ url, alt: '', caption: '', kind: 'image' });
      } catch (err) {
        toast(err.message, { error: true });
      }
    }
    galleryFile.value = '';
    paintGallery();
    setDirty();
    toast(`${files.length} image(s) ajoutée(s).`);
  });

  linksPanel.append(
    linksList,
    h('button.abtn', {
      type: 'button',
      style: 'margin-top:.75rem',
      onclick: () => {
        project.links.push({ label: '', url: '' });
        paintLinks();
        setDirty();
      }
    }, ['+ Ajouter un lien']),
    h('hr', { style: 'border:0;border-top:1px solid var(--admin-line);margin:1.5rem 0' }),
    h('h2', {}, ['Galerie']),
    galleryList,
    h('div.row', { style: 'margin-top:.75rem' }, [
      h('button.abtn', {
        type: 'button',
        onclick: () => {
          project.gallery.push({ url: '', alt: '', caption: '', kind: 'image' });
          paintGallery();
          setDirty();
        }
      }, ['+ Ajouter une ligne']),
      h('label.abtn', { style: 'cursor:pointer' }, ['Téléverser des images', galleryFile])
    ]),
    field({
      label: 'Vidéo (URL)',
      path: 'media.videoUrl',
      value: project.media?.videoUrl || '',
      onInput: (v) => ((project.media = { ...project.media, videoUrl: v }), setDirty())
    })
  );
  paintLinks();
  paintGallery();
  left.append(linksPanel);

  /* ---------------- Hero et SEO ---------------- */

  const seoPanel = h('div.panel', {}, [h('h2', {}, ['Hero et SEO'])]);
  seoPanel.append(
    h('div.afield-row', {}, [
      field({
        label: 'Effet sur le hero',
        path: 'hero.mode',
        type: 'select',
        value: project.hero?.mode || 'inherit',
        options: [
          ['inherit', 'Hériter du réglage global'],
          ['override', 'Imposer une forme et une couleur']
        ],
        onInput: (v) => ((project.hero = { ...project.hero, mode: v }), setDirty())
      }),
      field({
        label: 'Géométrie',
        path: 'hero.geometry',
        type: 'select',
        value: project.hero?.geometry || 'icosa',
        options: [
          ['icosa', 'Icosaèdre'],
          ['knot', 'Nœud torique']
        ],
        onInput: (v) => ((project.hero = { ...project.hero, geometry: v }), setDirty())
      }),
      colorField('Accent', 'hero.accent', project.hero?.accent, (v) => {
        project.hero.accent = v;
        setDirty();
      })
    ]),
    countedField(
      {
        label: 'Titre SEO',
        path: 'seo.title',
        value: project.seo?.title || '',
        hint: 'Repris dans l’onglet du navigateur et les résultats de recherche.',
        onInput: (v) => ((project.seo = { ...project.seo, title: v }), setDirty())
      },
      { max: 60 }
    ),
    countedField(
      {
        label: 'Description SEO',
        path: 'seo.description',
        type: 'textarea',
        value: project.seo?.description || '',
        attrs: { style: 'min-height:4.5rem' },
        onInput: (v) => ((project.seo = { ...project.seo, description: v }), setDirty())
      },
      { max: 160 }
    ),
    field({
      label: 'Image de partage (Open Graph)',
      path: 'seo.ogImage',
      value: project.seo?.ogImage || '',
      hint: 'Laisser vide pour reprendre la couverture.',
      onInput: (v) => ((project.seo = { ...project.seo, ogImage: v }), setDirty())
    }),
    field({
      type: 'checkbox',
      label: 'Exclure des moteurs de recherche (noindex)',
      path: 'seo.noindex',
      value: project.seo?.noindex,
      onInput: (v) => ((project.seo = { ...project.seo, noindex: v }), setDirty())
    })
  );
  left.append(seoPanel);

  /* ---------------- Colonne de droite : résumé ---------------- */

  const summaryPanel = h('div.preview-card', {}, [
    h('h2', { style: 'font-size:.875rem;font-weight:600;margin:0' }, ['Aperçu de la liste']),
    coverPreview,
    h('div', {}, [
      h('div.tiny', { style: 'letter-spacing:.1em;text-transform:uppercase' }, [project.category || '']),
      h('strong', { style: 'font-family:var(--font-display);font-size:1.2rem' }, [project.title || 'Sans titre']),
      h('p.small', { style: 'color:var(--admin-muted);margin-top:.35rem' }, [project.subtitle || ''])
    ])
  ]);
  right.append(summaryPanel);

  /* ---------------- Actions ---------------- */

  async function persist({ then } = {}) {
    const btns = actions.querySelectorAll('button');
    btns.forEach((b) => (b.disabled = true));
    try {
      const payload = structuredClone(project);
      const result = saved
        ? await api.saveProject(project.id, payload)
        : await api.createProject(payload);
      project = result.project;
      saved = true;
      setDirty(false);
      toast('Projet enregistré.');
      if (isNew) navigate(`#/projets/${project.id}`);
      then?.(project);
      return project;
    } catch (err) {
      toast(err.message, { error: true });
      return null;
    } finally {
      actions.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  }

  function paintActions() {
    actions.textContent = '';
    actions.append(
      h('button.abtn.abtn--primary', { type: 'button', onclick: () => persist() }, ['Enregistrer']),
      project.status === 'published'
        ? h(
            'button.abtn',
            {
              type: 'button',
              onclick: async () => {
                const p = await persist();
                if (!p) return;
                await api.unpublishProject(p.id);
                project.status = 'draft';
                toast('Projet retiré du site.');
                paintActions();
              }
            },
            ['Dépublier']
          )
        : h(
            'button.abtn',
            {
              type: 'button',
              onclick: async () => {
                const p = await persist();
                if (!p) return;
                await api.publishProject(p.id);
                project.status = 'published';
                toast('Projet publié — visible sur le site.');
                paintActions();
              }
            },
            ['Publier']
          ),
      statusPill(project.status),
      h('span.spacer', {}),
      project.slug
        ? h('a.abtn.abtn--ghost', { href: `/admin/apercu/projet/${project.slug}`, target: '_blank', rel: 'noopener' }, ['Aperçu'])
        : null,
      !isNew
        ? h(
            'button.abtn',
            {
              type: 'button',
              onclick: async () => {
                const { project: copy } = await api.duplicateProject(project.id);
                toast('Copie créée en brouillon.');
                navigate(`#/projets/${copy.id}`);
              }
            },
            ['Dupliquer']
          )
        : null,
      !isNew
        ? h(
            'button.abtn.abtn--danger',
            {
              type: 'button',
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Supprimer ce projet ?',
                  message: `« ${project.title} » sera définitivement retiré. Les cartes qui le citaient seront détachées, mais pas supprimées.`,
                  confirmLabel: 'Supprimer',
                  danger: true
                });
                if (!ok) return;
                await api.deleteProject(project.id);
                markDirty(false);
                toast('Projet supprimé.');
                navigate('#/projets');
              }
            },
            ['Supprimer']
          )
        : null
    );
  }
  paintActions();

  // Ctrl/Cmd + S pour enregistrer.
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      persist();
    }
  };
  document.addEventListener('keydown', onKey);
  onDispose?.(() => document.removeEventListener('keydown', onKey));

  if (isNew) setDirty(true);
}

function colorField(label, path, value, onChange) {
  const input = h('input', { type: 'color', value: value || '#b5541d', 'data-path': path });
  input.addEventListener('input', () => onChange(input.value));
  return h('div.afield', {}, [h('label', {}, [label]), input]);
}
