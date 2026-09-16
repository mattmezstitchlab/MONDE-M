/**
 * Lecteur des pages de carte publiques.
 * Même moteur audio que le hero, sans scène 3D.
 */
import { createPlayer, spectrum, currentEnergy, setMasterVolume } from './audio.js';

const blocks = document.querySelectorAll('.player[data-card]');
if (!blocks.length) {
  // Rien à faire : la page ne contient pas de lecteur.
}

for (const block of blocks) {
  const button = block.querySelector('.play-btn');
  const fill = block.querySelector('.progress-fill');
  const bar = block.querySelector('.progress');
  const bars = block.querySelectorAll('.visualizer span');
  if (!button) continue;

  let preview = {};
  try {
    preview = JSON.parse(block.dataset.preview || '{}');
  } catch {
    preview = {};
  }

  let raf = 0;
  const player = createPlayer(
    {
      url: preview.url || block.dataset.src || '',
      start: preview.start,
      end: preview.end,
      volume: preview.volume ?? 0.8,
      bpm: Number(block.dataset.bpm) || 100,
      key: block.dataset.key || 'C'
    },
    {
      onTime: (t, d) => {
        const ratio = Math.min(100, (t / d) * 100);
        if (fill) fill.style.width = `${ratio}%`;
        if (bar) bar.setAttribute('aria-valuenow', String(Math.round(ratio)));
      },
      onEnd: () => setPlaying(false)
    }
  );

  function setPlaying(on) {
    button.setAttribute('aria-pressed', String(Boolean(on)));
    button.setAttribute('aria-label', on ? 'Mettre en pause' : 'Écouter l’extrait');
    if (!on) {
      cancelAnimationFrame(raf);
      bars.forEach((b) => (b.style.height = '12%'));
    }
  }

  function draw() {
    const tick = () => {
      if (!player.playing) return;
      raf = requestAnimationFrame(tick);
      const values = spectrum(bars.length || 24);
      bars.forEach((b, i) => {
        b.style.height = `${Math.max(8, values[i] * 100)}%`;
      });
    };
    tick();
  }

  button.addEventListener('click', async () => {
    if (player.playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    try {
      setMasterVolume(preview.volume ?? 0.8);
      await player.play();
      setPlaying(true);
      draw();
    } catch (err) {
      console.warn('[player] lecture impossible :', err.message);
      button.disabled = true;
      button.title = 'Lecture indisponible sur ce navigateur.';
    }
  });

  bar?.addEventListener('click', (e) => {
    const rect = bar.getBoundingClientRect();
    player.seek((e.clientX - rect.left) / rect.width);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && player.playing) {
      player.stop();
      setPlaying(false);
    }
  });
}
