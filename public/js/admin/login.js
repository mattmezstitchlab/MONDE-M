/** Connexion à l'espace éditeur. */

const form = document.getElementById('loginForm');
const status = document.getElementById('loginStatus');

function notify(kind, text) {
  if (!status) return;
  status.innerHTML = `<p class="notice notice--${kind}" style="margin-bottom:1rem">${text}</p>`;
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    notify('danger', 'Renseignez l’adresse e-mail et le mot de passe.');
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Connexion…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const remaining = Number.isFinite(json.remaining) ? json.remaining : null;
      notify(
        'danger',
        esc(json.error || 'Connexion impossible.') +
          (remaining !== null && remaining < 5 ? ` ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.` : '')
      );
      form.password.value = '';
      form.password.focus();
      return;
    }
    notify('ok', 'Connexion réussie.');
    const redirect = form.dataset.redirect || '/admin';
    // Garde-fou : n'accepter qu'un chemin interne, jamais une URL absolue.
    const safe = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/admin';
    location.href = safe;
  } catch (err) {
    notify('danger', esc(err.message || 'Erreur réseau.'));
  } finally {
    submit.disabled = false;
    submit.innerHTML = '<span class="dot" aria-hidden="true"></span>Se connecter';
  }
});

form?.email?.focus();
