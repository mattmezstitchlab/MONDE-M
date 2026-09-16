/** Paramètres du site : identité, SEO, sections, pied de page, compte, données. */
import { api } from '../api.js';
import { h, esc, toast, field, confirmDialog } from '../ui.js';
import { markDirty } from '../app.js';

export async function renderSettings({ main, onDispose, email }) {
  const { settings } = await api.settings();
  const draft = structuredClone(settings);

  main.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, ['Paramètres']),
        h('p', {}, ['Identité du site, référencement, sections affichées, compte éditeur et données.'])
      ]),
      h('div.row', {}, [h('a.abtn.abtn--ghost', { href: '/', target: '_blank', rel: 'noopener' }, ['Voir le site ↗'])])
    ])
  );

  const actions = h('div.toolbar', {});
  main.append(actions);

  const grid = h('div', { style: 'display:grid;gap:1.25rem' });
  main.append(grid);

  /* ---------------- Identité ---------------- */

  const sitePanel = h('div.panel', {}, [h('h2', {}, ['Identité du site'])]);
  sitePanel.append(
    h('div.afield-row', {}, [
      field({
        label: 'Nom de marque',
        path: 'site.brand',
        value: draft.site?.brand,
        hint: 'Affiché dans l’en-tête, le pied de page et les métadonnées de partage.',
        onInput: (v) => ((draft.site.brand = v), markDirty())
      }),
      field({ label: 'Nom interne', path: 'site.name', value: draft.site?.name, onInput: (v) => ((draft.site.name = v), markDirty()) })
    ]),
    field({ label: 'Baseline', path: 'site.baseline', value: draft.site?.baseline, hint: 'Apparaît sous la marque dans le hero et le pied de page.', onInput: (v) => ((draft.site.baseline = v), markDirty()) }),
    field({
      label: 'Description du site',
      path: 'site.description',
      type: 'textarea',
      value: draft.site?.description,
      attrs: { style: 'min-height:5rem' },
      onInput: (v) => ((draft.site.description = v), markDirty())
    }),
    h('div.afield-row', {}, [
      field({ label: 'E-mail de contact', path: 'site.email', type: 'email', value: draft.site?.email, onInput: (v) => ((draft.site.email = v), markDirty()) }),
      field({
        label: 'URL canonique du site',
        path: 'site.url',
        type: 'url',
        value: draft.site?.url,
        hint: 'Sert aux balises canoniques, Open Graph et au sitemap. Exemple : https://monde-m.fr',
        onInput: (v) => ((draft.site.url = v), markDirty())
      })
    ])
  );
  grid.append(sitePanel);

  /* ---------------- SEO ---------------- */

  const seoPanel = h('div.panel', {}, [h('h2', {}, ['Référencement'])]);
  seoPanel.append(
    field({
      label: 'Gabarit de titre',
      path: 'seo.titleTemplate',
      value: draft.seo?.titleTemplate,
      hint: '%s est remplacé par le titre de la page.',
      onInput: (v) => ((draft.seo.titleTemplate = v), markDirty())
    }),
    countedFieldLocal('Titre par défaut', draft.seo?.defaultTitle, 60, (v) => ((draft.seo.defaultTitle = v), markDirty())),
    countedFieldLocal(
      'Description par défaut',
      draft.seo?.defaultDescription,
      160,
      (v) => ((draft.seo.defaultDescription = v), markDirty()),
      'textarea'
    ),
    field({
      label: 'Image de partage par défaut',
      path: 'seo.ogImage',
      value: draft.seo?.ogImage,
      hint: 'Reprise quand une page n’a pas d’image propre. 1200×630 recommandé.',
      onInput: (v) => ((draft.seo.ogImage = v), markDirty())
    }),
    field({ label: 'Compte X / Twitter', path: 'seo.twitter', value: draft.seo?.twitter, onInput: (v) => ((draft.seo.twitter = v), markDirty()) })
  );
  grid.append(seoPanel);

  /* ---------------- Sections ---------------- */

  const sectionsPanel = h('div.panel', {}, [
    h('h2', {}, ['Sections de l’accueil']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      'Le hero 3D est toujours affiché : c’est l’identité du site. Ces réglages portent sur ce qui suit.'
    ])
  ]);
  for (const [key, label, hint] of [
    ['showProjects', 'Section « Projets »', 'Les quatre projets publiés les mieux classés.'],
    ['showCards', 'Section « Cartes »', 'Le mur de pochettes des cartes publiées.'],
    ['showSteps', 'Section « Méthode »', 'Les quatre étapes : choisir, composer, publier, écouter.'],
    ['showFooter', 'Pied de page', 'Marque, navigation et contact.']
  ]) {
    sectionsPanel.append(
      field({
        type: 'checkbox',
        label,
        path: `sections.${key}`,
        value: draft.sections?.[key] !== false,
        hint,
        onInput: (v) => ((draft.sections[key] = v), markDirty())
      })
    );
  }
  grid.append(sectionsPanel);

  /* ---------------- Pied de page ---------------- */

  const footerPanel = h('div.panel', {}, [h('h2', {}, ['Pied de page'])]);
  footerPanel.append(
    h('div.afield-row', {}, [
      field({ label: 'Nom légal', path: 'footer.legalName', value: draft.footer?.legalName, onInput: (v) => ((draft.footer.legalName = v), markDirty()) }),
      field({ label: 'Adresse', path: 'footer.address', value: draft.footer?.address, onInput: (v) => ((draft.footer.address = v), markDirty()) })
    ])
  );
  const linksList = h('div.repeater', {});
  function paintLinks() {
    linksList.textContent = '';
    (draft.footer?.links || []).forEach((link, i) => {
      const label = h('input', { type: 'text', value: link.label || '', placeholder: 'Libellé' });
      const href = h('input', { type: 'text', value: link.href || '', placeholder: '/projets' });
      label.addEventListener('input', () => ((draft.footer.links[i].label = label.value), markDirty()));
      href.addEventListener('input', () => ((draft.footer.links[i].href = href.value), markDirty()));
      linksList.append(
        h('div.repeater-row', {}, [
          label,
          href,
          h('button.icon-btn', {
            type: 'button',
            'aria-label': 'Retirer ce lien',
            onclick: () => {
              draft.footer.links.splice(i, 1);
              paintLinks();
              markDirty();
            }
          }, ['×'])
        ])
      );
    });
  }
  footerPanel.append(
    linksList,
    h('button.abtn', {
      type: 'button',
      style: 'margin-top:.75rem',
      onclick: () => {
        draft.footer.links = draft.footer.links || [];
        draft.footer.links.push({ label: '', href: '' });
        paintLinks();
        markDirty();
      }
    }, ['+ Ajouter un lien'])
  );
  paintLinks();
  grid.append(footerPanel);

  /* ---------------- Compte ---------------- */

  const accountPanel = h('div.panel', {}, [
    h('h2', {}, ['Compte éditeur']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      `Connecté en tant que ${esc(email || '')}. Un seul compte éditeur existe ; les identifiants sont hachés (PBKDF2-SHA256, 210 000 itérations) et stockés dans data/auth.json.`
    ])
  ]);
  const emailInput = h('input', { type: 'email', value: email || '', autocomplete: 'username' });
  const passInput = h('input', { type: 'password', value: '', autocomplete: 'new-password', placeholder: 'Au moins 10 caractères' });
  const pass2Input = h('input', { type: 'password', value: '', autocomplete: 'new-password' });
  accountPanel.append(
    h('div.afield', {}, [h('label', { for: 'acc-email' }, ['Adresse e-mail']), emailInput]),
    h('div.afield', {}, [h('label', { for: 'acc-pass' }, ['Nouveau mot de passe']), passInput, h('span.ahint', {}, ['Laisser vide pour conserver le mot de passe actuel.'])]),
    h('div.afield', {}, [h('label', { for: 'acc-pass2' }, ['Confirmer']), pass2Input]),
    h('button.abtn', {
      type: 'button',
      onclick: async () => {
        const body = {};
        if (emailInput.value.trim()) body.email = emailInput.value.trim();
        if (passInput.value) {
          if (passInput.value !== pass2Input.value) {
            toast('Les deux mots de passe ne correspondent pas.', { error: true });
            return;
          }
          body.password = passInput.value;
        }
        if (!Object.keys(body).length) {
          toast('Rien à modifier.', { error: true });
          return;
        }
        try {
          await api.credentials(body);
          passInput.value = '';
          pass2Input.value = '';
          toast('Identifiants mis à jour.');
        } catch (err) {
          toast(err.message, { error: true });
        }
      }
    }, ['Mettre à jour'])
  );
  grid.append(accountPanel);

  /* ---------------- Données ---------------- */

  const dataPanel = h('div.panel', {}, [
    h('h2', {}, ['Données']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      'Les données sont stockées en JSON dans data/. L’export produit un fichier complet, réimportable en le replaçant dans ce dossier.'
    ])
  ]);
  dataPanel.append(
    h('div.row', {}, [
      h('button.abtn', {
        type: 'button',
        onclick: async () => {
          try {
            const data = await api.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = h('a', { href: url, download: `monde-m-export-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            toast('Export téléchargé.');
          } catch (err) {
            toast(err.message, { error: true });
          }
        }
      }, ['Exporter toutes les données']),
      h('a.abtn.abtn--ghost', { href: '/sitemap.xml', target: '_blank', rel: 'noopener' }, ['Voir le sitemap ↗']),
      h('a.abtn.abtn--ghost', { href: '/robots.txt', target: '_blank', rel: 'noopener' }, ['Voir robots.txt ↗']),
      h('button.abtn.abtn--danger', {
        type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Réinitialiser toutes les données ?',
            message:
              'Projets, cartes et réglages seront remplacés par le jeu de démonstration. Cette action est irréversible : exportez d’abord si nécessaire.',
            confirmLabel: 'Tout réinitialiser',
            danger: true
          });
          if (!ok) return;
          try {
            await api.reset();
            toast('Données réinitialisées.');
            setTimeout(() => location.reload(), 800);
          } catch (err) {
            toast(err.message, { error: true });
          }
        }
      }, ['Réinitialiser'])
    ])
  );
  grid.append(dataPanel);

  /* ---------------- Actions ---------------- */

  async function save() {
    try {
      const { settings: saved } = await api.saveSettings(draft);
      Object.assign(draft, saved);
      markDirty(false);
      toast('Paramètres enregistrés.');
    } catch (err) {
      toast(err.message, { error: true });
    }
  }

  actions.append(
    h('button.abtn.abtn--primary', { type: 'button', onclick: save }, ['Enregistrer']),
    h('span.spacer', {}),
    h('span.tiny', { style: 'color:var(--admin-muted)' }, ['Ctrl/Cmd + S pour enregistrer'])
  );

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };
  document.addEventListener('keydown', onKey);
  onDispose?.(() => document.removeEventListener('keydown', onKey));
}

function countedFieldLocal(label, value, max, onChange, type = 'text') {
  const wrap = field({
    label,
    path: label.replace(/\s/g, '_'),
    type,
    value: value || '',
    attrs: type === 'textarea' ? { maxlength: String(max), style: 'min-height:4.5rem' } : { maxlength: String(max) },
    onInput: onChange
  });
  const counter = h('span.counter', {}, [`${String(value || '').length} / ${max}`]);
  wrap.querySelector('input, textarea')?.addEventListener('input', (e) => {
    counter.textContent = `${e.target.value.length} / ${max}`;
    counter.classList.toggle('is-over', e.target.value.length > max);
  });
  wrap.append(counter);
  return wrap;
}
