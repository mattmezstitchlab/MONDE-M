/** Tableau de bord : comptes, activité récente, alertes, journal. */
import { api } from '../api.js';
import { h, esc, relativeTime, formatDate, STATUS_LABEL } from '../ui.js';

export async function renderDashboard({ main, navigate }) {
  const [overview, log] = await Promise.all([api.overview(), api.audit(30).catch(() => ({ entries: [] }))]);
  const { stats, recent, alerts } = overview;

  main.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, ['Tableau de bord']),
        h('p', {}, [
          'Ce qui est publié apparaît immédiatement sur le site : le hero, les projets et les cartes.'
        ])
      ]),
      h('div.row', {}, [
        h('a.abtn.abtn--primary', { href: '#/projets/nouveau' }, ['+ Nouveau projet']),
        h('a.abtn', { href: '#/cartes/nouvelle' }, ['+ Nouvelle carte'])
      ])
    ])
  );

  /* ---------------- Statistiques ---------------- */

  const statItems = [
    ['Projets publiés', stats.projects.published, `${stats.projects.draft} brouillon${stats.projects.draft > 1 ? 's' : ''}`],
    ['Cartes publiées', stats.cards.published, `${stats.cards.featured} en avant`],
    ['Cartes avec morceau', stats.cards.withTrack, `${stats.cards.total} au total`],
    ['Sans pochette', stats.cards.missingCover, stats.cards.missingCover ? 'à compléter' : 'tout est couvert'],
    ['Présences confirmées', stats.cards.rsvp.confirmed, `${stats.cards.rsvp.pending} en attente`]
  ];

  main.append(
    h(
      'dl.stat-grid',
      {},
      statItems.map(([label, value, sub]) =>
        h('div.stat', {}, [
          h('dt', {}, [label]),
          h('dd', {}, [String(value), sub ? h('small', {}, [sub]) : null])
        ])
      )
    )
  );

  const grid = h('div.panel-grid', {});

  /* ---------------- Activité récente ---------------- */

  const recentPanel = h('div.panel', {}, [h('h2', {}, ['Modifiés récemment'])]);
  if (!recent.length) {
    recentPanel.append(h('p.small', { style: 'color:var(--admin-muted)' }, ['Rien pour l’instant.']));
  } else {
    const table = h('table.admin-table', {}, [
      h('thead', {}, [
        h('tr', {}, [h('th', {}, ['Élément']), h('th', {}, ['Statut']), h('th', {}, ['Modifié'])])
      ])
    ]);
    const tbody = h('tbody', {});
    for (const item of recent) {
      const target =
        item.kind === 'project' ? `#/projets/${item.id}` : `#/cartes/${item.id}`;
      tbody.append(
        h('tr', {}, [
          h('td', {}, [
            h('a', { href: target, style: 'text-decoration:none' }, [
              h('div.cell-main', {}, [
                h('div', {}, [
                  h('strong', {}, [item.title || 'Sans titre']),
                  h('span', {}, [item.subtitle || (item.kind === 'project' ? 'Projet' : 'Carte')])
                ])
              ])
            ])
          ]),
          h('td', {}, [
            h('span.pill', { class: `pill--${item.status}` }, [STATUS_LABEL[item.status] || item.status])
          ]),
          h('td', { class: 'tiny' }, [relativeTime(item.updatedAt)])
        ])
      );
    }
    table.append(tbody);
    recentPanel.append(table);
  }

  /* ---------------- Alertes ---------------- */

  const alertPanel = h('div.panel', {}, [h('h2', {}, ['À compléter'])]);
  if (!alerts.length) {
    alertPanel.append(
      h('p.small', { style: 'color:var(--admin-muted)' }, ['Aucune alerte. Tout est en ordre.'])
    );
  } else {
    alertPanel.append(
      h(
        'ul.alert-list',
        {},
        alerts.map((a) => h('li', { dataset: { level: a.level } }, [a.text]))
      )
    );
  }

  grid.append(recentPanel, alertPanel);
  main.append(grid);

  /* ---------------- Journal ---------------- */

  const logPanel = h('div.panel', {}, [
    h('h2', {}, ['Journal des actions']),
    h('p.small', { style: 'color:var(--admin-muted);margin-bottom:1rem' }, [
      'Les 30 dernières opérations d’édition. 500 entrées conservées.'
    ])
  ]);
  if (!log.entries.length) {
    logPanel.append(h('p.small', { style: 'color:var(--admin-muted)' }, ['Journal vide.']));
  } else {
    const wrap = h('div.log', {});
    for (const entry of log.entries) {
      wrap.append(
        h('div', {}, [
          h('time', {}, [formatDate(entry.at)]),
          ` ${esc(entry.action)} · ${esc(entry.type)} · ${esc(entry.target)}`,
          entry.detail ? h('span', { style: 'opacity:.6' }, [` — ${entry.detail}`]) : null
        ])
      );
    }
    logPanel.append(wrap);
  }
  main.append(logPanel);

  /* ---------------- Raccourcis ---------------- */

  main.append(
    h('div.panel', {}, [
      h('h2', {}, ['Aller à']),
      h('div.row', {}, [
        h('a.abtn', { href: '#/projets' }, ['Gérer les projets']),
        h('a.abtn', { href: '#/cartes' }, ['Gérer les cartes']),
        h('a.abtn', { href: '#/hero' }, ['Régler le hero 3D']),
        h('a.abtn', { href: '#/parametres' }, ['Paramètres du site']),
        h('a.abtn.abtn--ghost', { href: '/', target: '_blank', rel: 'noopener' }, ['Voir le site ↗'])
      ])
    ])
  );
}
