/**
 * Formulaire de remplissage par lien privé — sans compte.
 *
 * Reprend le parcours en trois étapes d'AIME (audit §3.2) : morceau,
 * identité, présence. La soumission passe par `/api/share/:token`, qui
 * n'accepte que les champs explicitement autorisés.
 */

const form = document.getElementById('fillForm');
const status = document.getElementById('fillStatus');
if (!form) {
  // Page sans formulaire : rien à faire.
}

function notify(kind, text) {
  if (!status) return;
  status.innerHTML = `<p class="notice notice--${kind}" style="margin-bottom:1.5rem">${text}</p>`;
  status.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readForm() {
  const fd = new FormData(form);
  const get = (k) => String(fd.get(k) ?? '').trim();

  const moments = fd.getAll('attendMoments').map(String);
  const link = get('spotify');

  // Le champ « lien d'écoute » est unique côté formulaire ; on le range dans
  // le service correspondant d'après son domaine, sans rien imposer.
  const external = {};
  if (link) {
    if (/spotify\./i.test(link)) external.spotify = link;
    else if (/(apple\.com|music\.apple)/i.test(link)) external.apple = link;
    else if (/deezer\./i.test(link)) external.deezer = link;
    else if (/(youtube\.com|youtu\.be)/i.test(link)) external.youtube = link;
    else external.spotify = link;
  }

  return {
    identity: {
      displayName: get('displayName'),
      bio: get('bio'),
      city: get('city')
    },
    contact: {
      email: get('email'),
      phone: get('phone')
    },
    music: {
      trackTitle: get('trackTitle'),
      artist: get('artist'),
      album: get('album'),
      genre: get('genre'),
      note: get('note'),
      external
    },
    role: {
      label: get('roleLabel')
    },
    presence: {
      rsvp: get('rsvp') || 'confirmed',
      arrival: get('arrival'),
      departure: get('departure'),
      attendMoments: moments,
      companions: Number(get('companions') || 0),
      dietary: get('dietary'),
      transport: {
        mode: get('transportMode'),
        from: get('transportFrom'),
        seats: Number(get('seats') || 0)
      }
    }
  };
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = form.dataset.token;
  const payload = readForm();

  if (!payload.identity.displayName) {
    notify('danger', 'Indique au moins le nom à afficher sur ta carte.');
    document.getElementById('displayName')?.focus();
    return;
  }
  if (!payload.music.trackTitle) {
    notify('warn', 'Ta carte n’a pas encore de morceau. Tu peux enregistrer et le compléter plus tard.');
  }

  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Enregistrement…';
  }

  try {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    notify('ok', 'Ta carte est enregistrée. Merci !');
    if (json.slug) {
      const link = document.createElement('p');
      link.className = 'small';
      link.style.marginTop = '.75rem';
      link.innerHTML = `<a href="/carte/${esc(json.slug)}">Voir ma carte publique →</a>`;
      status.appendChild(link);
    }
  } catch (err) {
    notify('danger', esc(err.message));
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.innerHTML = '<span class="dot" aria-hidden="true"></span>Enregistrer ma carte';
    }
  }
});
