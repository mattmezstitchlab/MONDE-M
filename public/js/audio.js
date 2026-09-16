/**
 * Lecteur d'extraits.
 *
 * Deux sources possibles (décision de cadrage : « liens + extraits hébergés ») :
 *
 *  1. **Fichier hébergé** — `preview.url` pointe vers un mp3/wav téléversé
 *     depuis l'espace éditeur. Lecture via `<audio>` + `MediaElementSource`,
 *     bornée par `preview.start` / `preview.end`.
 *  2. **Extrait généré** — à défaut de fichier, un motif de quelques mesures
 *     est synthétisé à la volée depuis `bpm` et la tonalité de la carte.
 *     C'est ce qui permet au jeu de démonstration, qui n'embarque aucun
 *     fichier audio, d'être réellement écoutable.
 *
 * Dans les deux cas un `AnalyserNode` alimente le visualiseur et l'énergie
 * lumineuse du fragment sélectionné dans la scène.
 */

const NOTE_OFFSETS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
};

/** `Ebm` -> fréquence en Hz (octave 3), ou `null` si la tonalité est illisible. */
export function keyToFrequency(key, octave = 3) {
  if (!key) return null;
  const m = /^([A-G])([#b]?)(m?)$/.exec(String(key).trim());
  if (!m) return null;
  const base = NOTE_OFFSETS[m[1] + m[2]];
  if (base === undefined) return null;
  // A4 = 440 Hz, MIDI 69.
  const midi = (octave + 1) * 12 + base;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Intervalle relatif en demi-tons selon le mode (majeur / mineur). */
function scaleFor(key) {
  const minor = /m$/.test(String(key || '').trim());
  return minor ? [0, 3, 5, 7, 10] : [0, 4, 5, 7, 11];
}

let ctx = null;
let analyser = null;
let master = null;
let freqData = null;

function ensureContext() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error('Web Audio indisponible sur ce navigateur.');
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.78;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  master.connect(analyser);
  analyser.connect(ctx.destination);
  return ctx;
}

/** Énergie normalisée 0..1, lue sur l'analyseur. */
export function currentEnergy() {
  if (!analyser || !freqData) return 0;
  analyser.getByteFrequencyData(freqData);
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) sum += freqData[i];
  return Math.min(1, sum / (freqData.length * 190));
}

/** Spectre réduit pour le visualiseur (tableau de 0..1). */
export function spectrum(bins = 24) {
  if (!analyser || !freqData) return new Array(bins).fill(0);
  analyser.getByteFrequencyData(freqData);
  const out = new Array(bins).fill(0);
  const per = Math.max(1, Math.floor(freqData.length / bins));
  for (let i = 0; i < bins; i++) {
    let sum = 0;
    for (let j = 0; j < per; j++) sum += freqData[i * per + j] || 0;
    out[i] = Math.min(1, sum / (per * 235));
  }
  return out;
}

export function setMasterVolume(v) {
  if (master && ctx) master.gain.setTargetAtTime(Math.min(1, Math.max(0, v)), ctx.currentTime, 0.05);
}

/* ------------------------------------------------------------------ */
/* Extrait généré                                                      */
/* ------------------------------------------------------------------ */

/**
 * Motif court : une basse sur le temps, un accord tenu, une ligne haute.
 * Bouclé jusqu'à `stop()`. Tout est arrêté proprement pour ne laisser
 * aucun oscillateur orphelin.
 */
function startSynth({ bpm = 100, key = 'C', duration = 30, volume = 0.8 }) {
  const ac = ensureContext();
  const root = keyToFrequency(key, 2) || 82.41;
  const scale = scaleFor(key);
  const beat = 60 / Math.max(20, Math.min(300, bpm));
  const started = ac.currentTime + 0.05;

  const voice = ac.createGain();
  voice.gain.value = 0;
  voice.connect(master);

  const nodes = [];
  const stopAt = started + Math.max(2, Math.min(120, duration));

  function tone(freq, at, len, { type = 'sine', gain = 0.16, attack = 0.02, release = 0.18 } = {}) {
    if (at >= stopAt) return;
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len + release);
    osc.connect(env);
    env.connect(voice);
    osc.start(at);
    osc.stop(at + len + release + 0.05);
    nodes.push(osc, env);
  }

  // Quatre mesures, puis bouclage par re-planification si besoin.
  const bars = 4;
  const beatsPerBar = 4;
  for (let bar = 0; bar < bars; bar++) {
    const barAt = started + bar * beatsPerBar * beat;
    for (let b = 0; b < beatsPerBar; b++) {
      const at = barAt + b * beat;
      // Basse sur chaque temps.
      tone(root, at, beat * 0.7, { type: 'triangle', gain: 0.2 });
      // Accords : fondamentale + tierce + quinte, tenus sur la mesure.
      if (b === 0) {
        for (const semi of [scale[0], scale[1], scale[2]]) {
          tone(root * 2 * Math.pow(2, semi / 12), at, beat * 3.4, {
            type: 'sine',
            gain: 0.075,
            attack: 0.25,
            release: 0.6
          });
        }
      }
      // Ligne haute sur les contretemps.
      if (b % 2 === 1) {
        const semi = scale[(bar + b) % scale.length];
        tone(root * 4 * Math.pow(2, semi / 12), at + beat * 0.5, beat * 0.4, {
          type: 'square',
          gain: 0.035
        });
      }
    }
  }

  // Fondu d'entrée (audit : `audio.fadeIn`).
  voice.gain.setValueAtTime(0.0001, started);
  voice.gain.exponentialRampToValueAtTime(Math.min(1, volume) * 0.9, started + 0.4);
  voice.gain.setValueAtTime(Math.min(1, volume) * 0.9, Math.max(started + 0.4, stopAt - 0.5));
  voice.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  return {
    voice,
    nodes,
    endsAt: stopAt,
    startedAt: started,
    stop(fade = 0.18) {
      const now = ac.currentTime;
      try {
        voice.gain.cancelScheduledValues(now);
        voice.gain.setValueAtTime(Math.max(0.0001, voice.gain.value), now);
        voice.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      } catch {
        /* déjà arrêté */
      }
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* déjà déconnecté */
          }
        }
        try {
          voice.disconnect();
        } catch {
          /* ignore */
        }
      }, (fade + 0.1) * 1000);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Lecteur unifié                                                      */
/* ------------------------------------------------------------------ */

/**
 * Crée un lecteur pour une carte.
 *
 * @param {{url?:string, synth?:boolean, start?:number, end?:number,
 *          volume?:number, bpm?:number, key?:string}} spec
 * @param {{onTime?:(t:number,d:number)=>void, onEnd?:()=>void}} handlers
 */
export function createPlayer(spec = {}, handlers = {}) {
  const volume = Number.isFinite(spec.volume) ? spec.volume : 0.8;
  const useFile = Boolean(spec.url);

  let audio = null;
  let source = null;
  let synth = null;
  let raf = 0;
  let playing = false;

  function loop() {
    if (!playing) return;
    raf = requestAnimationFrame(loop);
    if (useFile && audio) {
      if (spec.end && audio.currentTime >= Number(spec.end)) {
        handlers.onEnd?.();
        stop();
        return;
      }
      handlers.onTime?.(audio.currentTime - (Number(spec.start) || 0), duration());
    } else if (synth) {
      const t = ctx ? ctx.currentTime - synth.startedAt : 0;
      handlers.onTime?.(t, duration());
      if (ctx && ctx.currentTime >= synth.endsAt) {
        handlers.onEnd?.();
        stop();
      }
    }
  }

  function duration() {
    if (useFile && audio && Number.isFinite(audio.duration)) {
      const s = Number(spec.start) || 0;
      const e = Number(spec.end) || audio.duration;
      return Math.max(0.1, e - s);
    }
    return Math.max(2, Math.min(120, Number(spec.end) - Number(spec.start) || 30));
  }

  function play() {
    if (playing) return Promise.resolve();
    try {
      ensureContext();
    } catch (err) {
      return Promise.reject(err);
    }
    setMasterVolume(volume);

    if (useFile) {
      if (!audio) {
        audio = new Audio(spec.url);
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        try {
          source = ctx.createMediaElementSource(audio);
          source.connect(master);
        } catch {
          // Source déjà créée ou non supportée : lecture directe.
          audio.volume = volume;
        }
      }
      if (Number(spec.start)) audio.currentTime = Number(spec.start);
      const p = audio.play();
      playing = true;
      loop();
      return Promise.resolve(p).catch((err) => {
        playing = false;
        throw err;
      });
    }

    synth = startSynth({
      bpm: spec.bpm || 100,
      key: spec.key || 'C',
      duration: duration(),
      volume
    });
    playing = true;
    loop();
    return Promise.resolve();
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    if (synth) {
      synth.stop();
      synth = null;
    }
    if (audio) {
      audio.pause();
    }
  }

  function seek(ratio) {
    const d = duration();
    const t = Math.min(1, Math.max(0, ratio)) * d;
    if (useFile && audio) {
      audio.currentTime = (Number(spec.start) || 0) + t;
    } else if (synth) {
      // L'extrait généré n'est pas seekable : on le relance.
      synth.stop(0.05);
      synth = startSynth({
        bpm: spec.bpm || 100,
        key: spec.key || 'C',
        duration: Math.max(0.5, d - t),
        volume
      });
    }
  }

  return {
    play,
    stop,
    seek,
    get playing() {
      return playing;
    },
    get isSynth() {
      return !useFile;
    },
    destroy() {
      stop();
      if (audio) {
        audio.src = '';
        audio = null;
      }
    }
  };
}

/** Suspend tout le son (changement d'onglet, fermeture de panneau). */
export function suspendContext() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}
export function resumeContext() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}
