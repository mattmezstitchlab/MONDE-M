/** Utilitaires DOM de l'espace éditeur. */

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `h('div.panel', { onclick }, [children])` — construit un élément. */
export function h(selector, props = {}, children = []) {
  const [tag, ...classes] = selector.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className += ` ${value}`;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

let toastTimer = 0;
export function toast(message, { error = false, duration = 3200 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div#toast.toast', { role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.toggle('is-error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, duration);
}

/** Dialogue modal générique. Renvoie une promesse : `true` si confirmé. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    const ok = h(
      'button.abtn',
      {
        class: danger ? 'abtn--danger' : 'abtn--primary',
        type: 'button',
        onclick: () => close(true)
      },
      [confirmLabel]
    );
    const cancel = h('button.abtn', { type: 'button', onclick: () => close(false) }, ['Annuler']);
    const modal = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('h2', {}, [title]),
      h('p', { class: 'small', style: 'color:var(--admin-muted)' }, [message]),
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:.5rem' }, [cancel, ok])
    ]);
    const backdrop = h('div.modal-backdrop', { onclick: (e) => e.target === backdrop && close(false) }, [
      modal
    ]);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    ok.focus();
  });
}

/* ------------------------------------------------------------------ */
/* Formatage                                                           */
/* ------------------------------------------------------------------ */

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});
const timeFmt = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit'
});

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

export function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return formatDate(value);
}

export const STATUS_LABEL = { published: 'Publié', draft: 'Brouillon', archived: 'Archivé' };
export const RSVP_LABEL = {
  confirmed: 'Confirmée',
  maybe: 'Peut-être',
  pending: 'En attente',
  declined: 'Absente'
};
export const ROLE_TYPES = [
  ['guest', 'Invité'],
  ['artist', 'Artiste'],
  ['client', 'Client'],
  ['crew', 'Équipe'],
  ['partner', 'Partenaire'],
  ['staff', 'Prestataire']
];
export const CATEGORIES = [
  ['installation', 'Installation'],
  ['web', 'Web'],
  ['identite', 'Identité'],
  ['film', 'Film'],
  ['edition', 'Édition'],
  ['live', 'Live']
];

export function statusPill(status) {
  return h('span.pill', { class: `pill--${status}` }, [STATUS_LABEL[status] || status]);
}

export function rsvpPill(rsvp) {
  return h('span.pill', { class: `pill--${rsvp || 'pending'}` }, [RSVP_LABEL[rsvp] || '—']);
}

/** Pochette miniature : image si présente, sinon dégradé des couleurs dominantes. */
export function miniCover(card, size = '2.5rem') {
  const colors = card?.music?.coverColors || {};
  const style = `width:${size};height:${size};background:linear-gradient(140deg,${esc(
    colors.dominant || '#b5541d'
  )},${esc(colors.accent || '#141414')})`;
  if (card?.music?.coverUrl) {
    return h('span.mini-cover', { style }, [
      h('img', { src: card.music.coverUrl, alt: '', loading: 'lazy' })
    ]);
  }
  const initials = String(card?.identity?.displayName || '?').slice(0, 2).toUpperCase();
  return h('span.mini-cover', { style }, [initials]);
}

/* ------------------------------------------------------------------ */
/* Champs de formulaire                                                */
/* ------------------------------------------------------------------ */

/**
 * Construit un champ relié à un objet par chemin pointé.
 * `onInput` est appelé à chaque frappe avec `(value, path)`.
 */
export function field({ label, path, value, type = 'text', hint, onInput, attrs = {}, options }) {
  const id = `f_${path.replace(/[^a-z0-9]/gi, '_')}`;
  const common = { id, name: path, 'data-path': path, value: value ?? '', ...attrs };

  let input;
  if (type === 'textarea') {
    input = h('textarea', { id, name: path, 'data-path': path, ...attrs });
    input.value = value ?? '';
  } else if (type === 'select') {
    input = h('select', { id, name: path, 'data-path': path, ...attrs });
    for (const [val, text] of options || []) {
      const opt = h('option', { value: val }, [text]);
      if (String(val) === String(value ?? '')) opt.selected = true;
      input.append(opt);
    }
  } else if (type === 'checkbox') {
    input = h('input', { id, type: 'checkbox', name: path, 'data-path': path, ...attrs });
    input.checked = Boolean(value);
  } else {
    input = h('input', { type, ...common });
  }

  if (onInput) {
    const evt = type === 'checkbox' || type === 'select' || type === 'range' ? 'change' : 'input';
    input.addEventListener(evt, () => {
      const next =
        type === 'checkbox' ? input.checked : type === 'number' || type === 'range' ? Number(input.value) : input.value;
      onInput(next, path);
    });
  }

  if (type === 'checkbox') {
    return h('label.acheck', { for: id }, [input, h('span', {}, [label])]);
  }

  return h('div.afield', {}, [
    h('label', { for: id }, [label]),
    input,
    hint ? h('span.ahint', { html: hint }) : null
  ]);
}

/** Champ avec compteur de caractères — utile pour les limites SEO. */
export function countedField(config, { max = 160 } = {}) {
  const wrap = field(config);
  const input = wrap.querySelector('input, textarea');
  const counter = h('span.counter', {}, [`${String(config.value || '').length} / ${max}`]);
  const update = () => {
    const len = input.value.length;
    counter.textContent = `${len} / ${max}`;
    counter.classList.toggle('is-over', len > max);
  };
  input.addEventListener('input', update);
  wrap.append(counter);
  update();
  return wrap;
}

/** Glisser-déposer natif sur les lignes d'un tableau. */
export function makeSortable(tbody, onReorder) {
  let dragged = null;
  tbody.addEventListener('dragstart', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    dragged = row;
    row.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.id || '');
  });
  tbody.addEventListener('dragend', () => {
    dragged?.classList.remove('is-dragging');
    dragged = null;
  });
  tbody.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragged) return;
    const target = e.target.closest('tr');
    if (!target || target === dragged) return;
    const rect = target.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    tbody.insertBefore(dragged, after ? target.nextSibling : target);
  });
  tbody.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!onReorder) return;
    const ids = [...tbody.querySelectorAll('tr')].map((tr) => tr.dataset.id).filter(Boolean);
    onReorder(ids);
  });
}

/** Lecture d'un fichier en data URL, avec contrôle de taille. */
export function readFileAsDataURL(file, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Fichier trop lourd (${(file.size / 1048576).toFixed(1)} Mo). Limite : 8 Mo.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Extrait les couleurs dominantes d'une image, côté client.
 * Évite d'ajouter une dépendance de traitement d'image au serveur : le
 * navigateur décode, on échantillonne, on transmet le résultat.
 */
export function dominantColors(source) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map();
        let lumSum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (data[i + 3] < 128) continue;
          // Quantification grossière : 32 niveaux par canal suffisent.
          const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
          const entry = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
          entry.r += r;
          entry.g += g;
          entry.b += b;
          entry.n += 1;
          buckets.set(key, entry);
          lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          count += 1;
        }
        if (!buckets.size) {
          resolve({ dominant: '#b5541d', accent: '#141414', bg: '#f6f6f3' });
          return;
        }

        const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
        const top = sorted[0];
        const dominant = toHex(top.r / top.n, top.g / top.n, top.b / top.n);

        // L'accent est la couleur la plus saturée parmi les fréquentes.
        let accentEntry = top;
        let bestSat = -1;
        for (const entry of sorted.slice(0, 8)) {
          const r = entry.r / entry.n;
          const g = entry.g / entry.n;
          const b = entry.b / entry.n;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat > bestSat) {
            bestSat = sat;
            accentEntry = entry;
          }
        }
        const accent = toHex(
          accentEntry.r / accentEntry.n,
          accentEntry.g / accentEntry.n,
          accentEntry.b / accentEntry.n
        );

        const meanLum = count ? lumSum / count : 128;
        resolve({
          dominant,
          accent,
          bg: meanLum > 140 ? '#f6f6f3' : '#141414'
        });
      } catch {
        resolve({ dominant: '#b5541d', accent: '#141414', bg: '#f6f6f3' });
      }
    };
    img.onerror = () => resolve({ dominant: '#b5541d', accent: '#141414', bg: '#f6f6f3' });
    img.src = typeof source === 'string' ? source : source;
  });
}

function toHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
