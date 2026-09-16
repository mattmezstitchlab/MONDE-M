/**
 * Hero — collage entre la scène 3D, les cartes publiées et le lecteur.
 *
 * Les données sont livrées par le serveur dans l'îlot `#hero-data` : aucun
 * aller-retour réseau n'est nécessaire pour le premier rendu, ce qui protège
 * le LCP (audit §9, performance).
 */
import { createScene } from './scene.js';
import { createPlayer, spectrum, currentEnergy, setMasterVolume, suspendContext, resumeContext } from './audio.js';

const island = document.getElementById('hero-data');
const data = island ? JSON.parse(island.textContent) : { hero: {}, fragments: [] };
const hero = data.hero || {};
const fragments = Array.isArray(data.fragments) ? data.fragments : [];

const canvas = document.getElementById('scene-canvas');
const tooltip = document.getElementById('tooltip');
const panel = document.getElementById('cardPanel');
const panelBody = document.getElementById('panelBody');
const panelClose = document.getElementById('panelClose');
const backdrop = document.getElementById('panelBackdrop');
const stateEl = document.getElementById('scene-state');
const morphBtn = document.getElementById('morphBtn');
const fragmentList = document.getElementById('fragmentList');

/* ------------------------------------------------------------------ */
/* Repli sans WebGL                                                    */
/* ------------------------------------------------------------------ */

let scene = null;
try {
  scene = createScene(canvas, {
    accents: (hero.palette?.accents || ['#b5541d', '#2e5cff']).map((c) => c),
    bg: hexToNumber(hero.palette?.bg || '#f6f6f3'),
    idleSpin: hero.motion?.idleSpin ?? 0.0016,
    parallax: hero.motion?.parallax ?? 0.7,
    zoomMin: hero.motion?.zoomMin ?? 6,
    zoomMax: hero.motion?.zoomMax ?? 14,
    breatheAmp: hero.geometry?.breatheAmp ?? 0.055,
    breatheAmpKnot: hero.geometry?.breatheAmpKnot ?? 0.03,
    dustCount: hero.fragments?.dustCount ?? 320,
    fragmentCount: hero.fragments?.count ?? 12,
    showDust: hero.fragments?.showDust !== false,
    // La molette ne capture le geste que tant que le hero occupe l'écran :
    // au-delà, la page doit défiler normalement.
    captureWheel: true,
    onEvent
  });
  const count = scene.setFragments(fragments);
  if (stateEl) stateEl.textContent = count ? `${count} CARTES` : 'ICOSPHÈRE';
} catch (err) {
  console.warn('[hero] scène indisponible :', err.message);
  canvas?.remove();
  document.querySelector('.hero-scrim')?.remove();
  const notice = document.createElement('div');
  notice.className = 'shell';
  notice.innerHTML =
    '<p class="notice notice--warn">La scène 3D n’a pas pu démarrer sur ce navigateur. Les cartes restent accessibles ci-dessous.</p>';
  document.querySelector('.hero-body')?.before(notice);
  if (fragmentList) fragmentList.classList.remove('visually-hidden-focusable');
}

function hexToNumber(value) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  return m ? parseInt(m[1], 16) : 0xf6f6f3;
}

/* ------------------------------------------------------------------ */
/* Événements de la scène                                              */
/* ------------------------------------------------------------------ */

function onEvent(type, payload) {
  if (!scene) return;
  switch (type) {
    case 'hover':
      if (payload.label && tooltip) {
        tooltip.textContent = payload.label.toUpperCase();
        tooltip.style.opacity = '1';
      } else if (tooltip) {
        tooltip.style.opacity = '0';
      }
      break;
    case 'pointer':
      if (tooltip) {
        tooltip.style.left = `${payload.x}px`;
        tooltip.style.top = `${payload.y}px`;
      }
      break;
    case 'morph':
      if (stateEl) {
        stateEl.textContent = payload.form === 'icosa' ? 'ICOSPHÈRE' : 'NŒUD TORIQUE';
      }
      break;
    case 'select':
      if (payload.card) openCard(payload.card);
      else closePanel();
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Panneau de carte                                                    */
/* ------------------------------------------------------------------ */

let player = null;
let visualRaf = 0;
let lastFocus = null;

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function coverHtml(f) {
  const c = f.cover || {};
  if (f.coverUrl) {
    return `<div class="cover"><img src="${esc(f.coverUrl)}" alt="Pochette de ${esc(
      f.track
    )}" width="360" height="360"></div>`;
  }
  const initials = esc(String(f.name || '?').slice(0, 2).toUpperCase());
  return `<div class="cover cover--fallback" role="img" aria-label="Pochette générée" style="background:linear-gradient(140deg, ${esc(
    c.dominant || '#b5541d'
  )}, ${esc(c.accent || '#141414')});color:rgba(255,255,255,.92)">${initials}</div>`;
}

function openCard(f) {
  if (!panel) return;
  lastFocus = document.activeElement;

  stopAudio();
  player = createPlayer(
    {
      url: f.preview?.url || '',
      start: f.preview?.start,
      end: f.preview?.end,
      volume: f.preview?.volume ?? hero.audio?.volume ?? 0.8,
      bpm: f.bpm,
      key: f.key
    },
    {
      onTime: (t, d) => {
        const fill = panel.querySelector('.progress-fill');
        const bar = panel.querySelector('.progress');
        if (fill) fill.style.width = `${Math.min(100, (t / d) * 100)}%`;
        if (bar) bar.setAttribute('aria-valuenow', String(Math.round((t / d) * 100)));
      },
      onEnd: () => setPlaying(false)
    }
  );

  const role = [f.role, f.moment].filter(Boolean).join(' · ');
  panelBody.innerHTML = `
    ${coverHtml(f)}
    <div class="stack" style="gap:.35rem">
      <h2 id="panelTitle" style="font-size:1.5rem">${esc(f.name)}</h2>
      ${role ? `<p class="eyebrow">${esc(role)}</p>` : ''}
    </div>
    <div class="player">
      <div class="player-row">
        <button class="play-btn" type="button" id="panelPlay" aria-pressed="false" aria-label="Écouter l’extrait de ${esc(
          f.name
        )}">
          <svg class="icon-play" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M0 0l14 8-14 8z" fill="currentColor"/></svg>
          <svg class="icon-pause" width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><rect width="4" height="16" fill="currentColor"/><rect x="8" width="4" height="16" fill="currentColor"/></svg>
        </button>
        <div style="flex:1">
          <strong>${esc(f.track || 'Morceau à choisir')}</strong>
          <div class="tiny">${esc(f.artist || '')}</div>
        </div>
      </div>
      <div class="progress" id="panelProgress" role="progressbar" aria-label="Progression" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill"></div></div>
      <div class="visualizer" id="panelVisual" aria-hidden="true">${'<span></span>'.repeat(24)}</div>
      ${player.isSynth ? '<p class="tiny">Extrait généré d’après le tempo et la tonalité de la carte.</p>' : ''}
    </div>
    ${f.url ? `<a class="btn btn--ghost btn--sm" href="${esc(f.url)}">Ouvrir la carte complète</a>` : ''}
  `;

  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  backdrop?.removeAttribute('hidden');
  requestAnimationFrame(() => backdrop?.classList.add('is-open'));
  panel.querySelector('#panelPlay')?.focus();

  panel.querySelector('#panelPlay')?.addEventListener('click', togglePlay);
  panel.querySelector('#panelProgress')?.addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    player?.seek((e.clientX - rect.left) / rect.width);
  });

  // La scène prend la couleur de la carte sélectionnée.
  const dominant = f.cover?.dominant || f.visual?.accent;
  if (dominant) {
    scene?.setAccent(dominant);
    document.documentElement.style.setProperty('--accent', dominant);
  }
}

function closePanel() {
  if (!panel?.classList.contains('is-open')) return;
  stopAudio();
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  backdrop?.classList.remove('is-open');
  setTimeout(() => backdrop?.setAttribute('hidden', ''), 350);
  lastFocus?.focus?.();
}

function setPlaying(on) {
  const btn = panel?.querySelector('#panelPlay');
  if (btn) btn.setAttribute('aria-pressed', String(Boolean(on)));
  if (!on) cancelAnimationFrame(visualRaf);
}

async function togglePlay() {
  if (!player) return;
  if (player.playing) {
    player.stop();
    setPlaying(false);
    scene?.setEnergy(0);
    return;
  }
  try {
    setMasterVolume(hero.audio?.volume ?? 0.8);
    await player.play();
    setPlaying(true);
    drawVisual();
  } catch (err) {
    console.warn('[hero] lecture impossible :', err.message);
    setPlaying(false);
  }
}

function drawVisual() {
  const bars = panel?.querySelectorAll('#panelVisual span');
  const tick = () => {
    if (!player?.playing) return;
    visualRaf = requestAnimationFrame(tick);
    const values = spectrum(bars?.length || 24);
    bars?.forEach((bar, i) => {
      bar.style.height = `${Math.max(8, values[i] * 100)}%`;
    });
    scene?.setEnergy(currentEnergy());
  };
  tick();
}

function stopAudio() {
  player?.destroy();
  player = null;
  cancelAnimationFrame(visualRaf);
  scene?.setEnergy(0);
  setPlaying(false);
}

panelClose?.addEventListener('click', closePanel);
backdrop?.addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanel();
});

/* ------------------------------------------------------------------ */
/* Boutons et liste accessible                                         */
/* ------------------------------------------------------------------ */

morphBtn?.addEventListener('click', () => {
  scene?.triggerMorph();
  closePanel();
});

fragmentList?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-fragment]');
  if (!btn) return;
  const index = Number(btn.dataset.fragment);
  const f = fragments[index];
  if (scene) scene.selectByIndex(index);
  else if (f) openCard(f);
});

// Navigation clavier dans la scène : les flèches parcourent les fragments.
let lastIndex = -1;
document.addEventListener('keydown', (e) => {
  if (!scene || panel?.classList.contains('is-open')) return;
  if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  if (document.activeElement?.closest('input, textarea, select')) return;
  const n = fragments.length;
  if (!n) return;
  e.preventDefault();
  const dir = e.key === 'ArrowRight' ? 1 : -1;
  const next = ((lastIndex + dir) % n + n) % n;
  lastIndex = next;
  scene.selectByIndex(next);
});

/* ------------------------------------------------------------------ */
/* Comportements de page                                               */
/* ------------------------------------------------------------------ */

// Le hero occupe l'écran : la molette ne zoome que tant qu'il est visible.
if (scene && canvas) {
  const heroEl = document.querySelector('.hero');
  if (heroEl && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio || 0;
        scene.setRunning(ratio > 0.02);
      },
      { threshold: [0, 0.02, 0.5, 1] }
    );
    io.observe(heroEl);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    suspendContext();
    stopAudio();
  } else {
    resumeContext();
  }
});

// Autoplay de l'extrait seulement si l'admin l'a explicitement demandé.
if (hero.audio?.autoplayPreview && fragments.length) {
  window.addEventListener(
    'pointerdown',
    () => {
      if (!player) scene?.selectByIndex(0);
    },
    { once: true }
  );
}
