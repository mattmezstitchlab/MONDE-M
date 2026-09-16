/** Client HTTP de l'espace éditeur. */

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401) {
    // Session expirée : retour à la connexion en conservant la cible.
    const target = encodeURIComponent(location.pathname + location.search);
    location.href = `/admin/login?redirect=${target}`;
    throw new Error('Session expirée.');
  }

  const text = await res.text();
  const json = text ? safeParse(text) : {};
  if (!res.ok) {
    const err = new Error(json.error || `Erreur ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export const api = {
  overview: () => request('/api/admin/overview'),
  audit: (limit = 60) => request(`/api/admin/audit?limit=${limit}`),

  projects: (params = '') => request(`/api/admin/projects${params}`),
  project: (id) => request(`/api/admin/projects/${encodeURIComponent(id)}`),
  createProject: (body) => request('/api/admin/projects', { method: 'POST', body }),
  saveProject: (id, body) =>
    request(`/api/admin/projects/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  publishProject: (id) =>
    request(`/api/admin/projects/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  unpublishProject: (id) =>
    request(`/api/admin/projects/${encodeURIComponent(id)}/unpublish`, { method: 'POST' }),
  duplicateProject: (id) =>
    request(`/api/admin/projects/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  deleteProject: (id) =>
    request(`/api/admin/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reorderProjects: (ids) => request('/api/admin/projects/reorder', { method: 'POST', body: { ids } }),

  cards: (params = '') => request(`/api/admin/cards${params}`),
  card: (id) => request(`/api/admin/cards/${encodeURIComponent(id)}`),
  createCard: (body) => request('/api/admin/cards', { method: 'POST', body }),
  saveCard: (id, body) =>
    request(`/api/admin/cards/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  patchCard: (id, body) =>
    request(`/api/admin/cards/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  publishCard: (id) => request(`/api/admin/cards/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  unpublishCard: (id) =>
    request(`/api/admin/cards/${encodeURIComponent(id)}/unpublish`, { method: 'POST' }),
  duplicateCard: (id) =>
    request(`/api/admin/cards/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  deleteCard: (id) => request(`/api/admin/cards/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reorderCards: (ids) => request('/api/admin/cards/reorder', { method: 'POST', body: { ids } }),
  importCards: (cards) => request('/api/admin/cards/import', { method: 'POST', body: { cards } }),
  shareCard: (id, body = {}) =>
    request(`/api/admin/cards/${encodeURIComponent(id)}/share`, {
      method: 'POST',
      body: { baseUrl: location.origin, ...body }
    }),

  hero: () => request('/api/admin/hero'),
  saveHero: (body) => request('/api/admin/hero', { method: 'PUT', body }),
  resetHero: () => request('/api/admin/hero/reset', { method: 'POST' }),
  settings: () => request('/api/admin/settings'),
  saveSettings: (body) => request('/api/admin/settings', { method: 'PUT', body }),

  upload: (data, kind = 'uploads', filename = '') =>
    request('/api/admin/media', { method: 'POST', body: { data, kind, filename } }),
  deleteMedia: (url) => request('/api/admin/media', { method: 'DELETE', body: { url } }),

  credentials: (body) => request('/api/admin/credentials', { method: 'PUT', body }),
  exportAll: () => request('/api/admin/export'),
  reset: () => request('/api/admin/reset', { method: 'POST', body: { confirm: 'REINITIALISER' } }),

  publicHero: () => request('/api/public/hero'),
  publicCards: () => request('/api/public/cards')
};
