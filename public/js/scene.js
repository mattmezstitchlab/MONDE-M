/**
 * Scène 3D du hero.
 *
 * Reprise fidèle de la scène d'origine (icosaèdre ↔ nœud torique, respiration
 * des sommets, fragments en orbite, poussière, parallaxe, inertie) avec trois
 * changements structurels décrits dans docs/AUDIT.md §8 :
 *
 *  1. les fragments sont alimentés par les **cartes publiées** au lieu de
 *     `Math.random()` — la scène devient reproductible et pilotable depuis
 *     l'espace éditeur ;
 *  2. la respiration des sommets passe par un **vertex shader** au lieu d'une
 *     réécriture du buffer CPU à chaque frame ;
 *  3. la boucle de rendu est **suspendue** hors viewport et onglet masqué.
 *
 * Le module expose une API minimale (`createScene`) et ne connaît rien du DOM
 * environnant : il signale les événements, l'appelant décide de l'affichage.
 */

/* global THREE */

const DEFAULTS = {
  bg: 0xf6f6f3,
  ink: 0x161616,
  accents: [0xb5541d, 0x2e5cff],
  idleSpin: 0.0016,
  parallax: 0.7,
  zoomMin: 6,
  zoomMax: 14,
  breatheAmp: 0.055,
  breatheAmpKnot: 0.03,
  dustCount: 320,
  fragmentCount: 12,
  showDust: true
};

/** Conversion `#rrggbb` -> 0xrrggbb, avec repli. */
function hex(value, fallback = 0xb5541d) {
  if (typeof value === 'number') return value;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  return m ? parseInt(m[1], 16) : fallback;
}

export function createScene(canvas, options = {}) {
  if (!window.THREE) {
    throw new Error('three.js n’est pas chargé.');
  }
  const cfg = { ...DEFAULTS, ...options };
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const reducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  /* ---------------- Scène / caméra / rendu ---------------- */

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(cfg.bg, 13, 28);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.6, 9.5);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (err) {
    // Repli sans WebGL : l'appelant affiche la liste textuelle des cartes.
    throw Object.assign(new Error('WebGL indisponible.'), { code: 'NO_WEBGL', cause: err });
  }

  const dpr = Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(cfg.bg, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // La lumière directionnelle est fixe : une seule passe d'ombre suffit,
  // recalculée uniquement pendant le morph (gain d'une passe complète/frame).
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  /* ---------------- Lumières ---------------- */

  scene.add(new THREE.AmbientLight(0xffffff, 0.78));

  const sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(6, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(reducedMotion ? 1024 : 2048, reducedMotion ? 1024 : 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 32;
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const accentLight = new THREE.PointLight(cfg.accents[0], 0.8, 32);
  accentLight.position.set(-5, 3.5, -4);
  scene.add(accentLight);

  /* ---------------- Sol et grille ---------------- */

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3.4;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(34, 34, 0xcfcfc8, 0xe3e3db);
  grid.position.y = -3.39;
  scene.add(grid);

  /* ---------------- Monde ---------------- */

  const world = new THREE.Group();
  scene.add(world);

  const coreGroup = new THREE.Group();
  world.add(coreGroup);

  const geoA = new THREE.IcosahedronGeometry(1.8, 1);
  const geoB = new THREE.TorusKnotGeometry(1.12, 0.38, 180, 24, 2, 3);

  /**
   * Matériau « respirant » : le déplacement des sommets est calculé dans le
   * vertex shader à partir de la position de base, ce qui supprime la
   * réécriture CPU du buffer à chaque frame (audit §2.4, performance).
   */
  function breathingMaterial({ color, wireframe = false, opacity = 1, amp }) {
    const base = wireframe
      ? new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity, color })
      : new THREE.MeshStandardMaterial({
          color,
          roughness: 0.32,
          metalness: 0.25,
          flatShading: true
        });

    base.userData.uTime = { value: 0 };
    base.userData.uAmp = { value: reducedMotion ? 0 : amp };

    base.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = base.userData.uTime;
      shader.uniforms.uAmp = base.userData.uAmp;
      shader.vertexShader = `uniform float uTime;\nuniform float uAmp;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        // Même formule que la version CPU d'origine : chaque sommet est
        // poussé le long de sa normale par une sinusoïde composite. Le
        // garde-fou sur la longueur évite un normalize() dégénéré au centre.
        `#include <begin_vertex>
         float vLen = max(length(position), 0.0001);
         float vWave = sin(uTime * 1.6 + position.x * 1.9 + position.y * 1.4 + position.z * 1.7) * uAmp;
         transformed += (position / vLen) * vWave;`
      );
    };
    return base;
  }

  const matA = breathingMaterial({ color: cfg.ink, amp: cfg.breatheAmp });
  const matB = breathingMaterial({ color: cfg.ink, amp: cfg.breatheAmpKnot });
  const wireA = breathingMaterial({ color: cfg.accents[0], wireframe: true, opacity: 0.28, amp: cfg.breatheAmp });
  const wireB = breathingMaterial({ color: cfg.accents[0], wireframe: true, opacity: 0.28, amp: cfg.breatheAmpKnot });

  const meshA = new THREE.Mesh(geoA, matA);
  const meshB = new THREE.Mesh(geoB, matB);
  meshA.castShadow = meshB.castShadow = true;
  meshB.visible = false;

  const wireMeshA = new THREE.Mesh(geoA, wireA);
  const wireMeshB = new THREE.Mesh(geoB, wireB);
  wireMeshA.scale.setScalar(1.02);
  wireMeshB.scale.setScalar(1.02);
  wireMeshB.visible = false;
  coreGroup.add(meshA, meshB, wireMeshA, wireMeshB);

  /* ---------------- Poussière ---------------- */

  const dustCount = cfg.showDust ? cfg.dustCount : 0;
  let dust = null;
  if (dustCount > 0) {
    const arr = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 3.6 + Math.random() * 5.4;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(ph) * 0.8;
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    dust = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: 0x8f8f88, size: 0.035, transparent: true, opacity: 0.6 })
    );
    world.add(dust);
  }

  /* ---------------- Fragments = cartes ---------------- */

  const orbGroup = new THREE.Group();
  world.add(orbGroup);

  const inkCol = new THREE.Color(cfg.ink);
  const accentCol = new THREE.Color(cfg.accents[0]);
  let orbs = [];

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  /**
   * Construit les fragments à partir des cartes. Sans carte, on retombe sur
   * la composition aléatoire d'origine pour que le hero ne soit jamais vide.
   */
  function setFragments(cards) {
    for (const orb of orbs) {
      orbGroup.remove(orb);
      orb.geometry.dispose();
      orb.material.dispose();
    }
    orbs = [];

    const list = Array.isArray(cards) && cards.length ? cards : null;
    const count = list ? Math.min(list.length, cfg.fragmentCount) : cfg.fragmentCount;

    for (let i = 0; i < count; i++) {
      const card = list ? list[i] : null;
      const v = card?.visual?.orbit || {};
      const color = hex(card?.cover?.dominant || card?.visual?.accent, cfg.ink);

      const size = Number.isFinite(v.size) ? v.size : 0.07 + Math.random() * 0.09;
      const material = new THREE.MeshStandardMaterial({
        color: card ? color : cfg.ink,
        roughness: 0.35,
        metalness: 0.2,
        emissive: new THREE.Color(color),
        emissiveIntensity: card ? 0.12 : 0
      });

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 16), material);
      mesh.castShadow = true;

      mesh.userData = {
        orb: true,
        index: i,
        card: card || null,
        baseColor: new THREE.Color(card ? color : cfg.ink),
        hoverColor: new THREE.Color(color),
        theta: Number.isFinite(v.phase) ? v.phase : Math.random() * Math.PI * 2,
        radius: Number.isFinite(v.radius) ? v.radius : 3.2 + Math.random() * 1.5,
        speed: Number.isFinite(v.speed) ? v.speed : (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? -1 : 1),
        yBase: Number.isFinite(v.yBase) ? v.yBase : (Math.random() - 0.5) * 2.6,
        bob: Math.random() * Math.PI * 2,
        hover: false,
        pulse: 0,
        scale: 1,
        energy: 0
      };

      // La pochette, quand elle existe, est plaquée sur le fragment :
      // c'est l'identité visuelle de la carte dans la scène.
      const textureUrl = card?.coverUrl || card?.visual?.textureUrl;
      if (textureUrl) {
        loader.load(
          textureUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
            material.map = tex;
            material.color.set(0xffffff);
            material.needsUpdate = true;
          },
          undefined,
          () => {
            /* pochette indisponible : on garde la couleur dominante */
          }
        );
      }

      orbGroup.add(mesh);
      orbs.push(mesh);
    }
    renderer.shadowMap.needsUpdate = true;
    return orbs.length;
  }

  /* ---------------- État ---------------- */

  let current = 'icosa';
  let accentIdx = 0;
  let morphT = 0;
  let swapped = false;
  let flash = 0;
  let selected = -1;
  let energy = 0; // niveau audio courant, 0..1

  function setAccent(colorValue) {
    const c = new THREE.Color(hex(colorValue, cfg.accents[accentIdx]));
    wireA.color.copy(c);
    wireB.color.copy(c);
    accentLight.color.copy(c);
    accentCol.copy(c);
  }

  function swapForm() {
    current = current === 'icosa' ? 'knot' : 'icosa';
    const isA = current === 'icosa';
    meshA.visible = wireMeshA.visible = isA;
    meshB.visible = wireMeshB.visible = !isA;
    accentIdx = 1 - accentIdx;
    const nextAccent = cfg.accents[accentIdx];
    setAccent(nextAccent);
    document.documentElement.dataset.world = isA ? 'icosa' : 'knot';
    document.documentElement.style.setProperty(
      '--accent',
      `#${new THREE.Color(nextAccent).getHexString()}`
    );
    renderer.shadowMap.needsUpdate = true;
    onEvent('morph', { form: current });
  }

  function triggerMorph() {
    if (morphT > 0 || reducedMotion) {
      if (reducedMotion) swapForm(); // fondu immédiat plutôt qu'animation
      return;
    }
    morphT = 1e-4;
    swapped = false;
  }

  /** Applique la géométrie et l'accent d'une carte ou d'un projet. */
  function applyContext({ geometry, accent } = {}) {
    if (geometry && geometry !== current) triggerMorph();
    if (accent) setAccent(accent);
  }

  /* ---------------- Interaction ---------------- */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downTime = 0;
  let moved = 0;
  let inertiaX = 0;
  let inertiaY = 0;
  let camZ = 9.5;
  let camZTarget = 9.5;
  let parX = 0;
  let parY = 0;
  let parTX = 0;
  let parTY = 0;
  let hovered = null;
  let pinchStart = 0;
  const pointers = new Map();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.shadowMap.needsUpdate = true;
  }

  function pick(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const targets = orbs.concat([meshA.visible ? meshA : meshB]);
    const hits = raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0].object : null;
  }

  function hoverAt(cx, cy) {
    const obj = pick(cx, cy);
    if (hovered?.userData?.orb) hovered.userData.hover = false;
    hovered = obj;
    if (obj?.userData?.orb) {
      obj.userData.hover = true;
      const card = obj.userData.card;
      onEvent('hover', {
        index: obj.userData.index,
        card,
        label: card
          ? [card.name, [card.track, card.artist].filter(Boolean).join(' — ')]
              .filter(Boolean)
              .join(' · ')
          : `Fragment ${String(obj.userData.index + 1).padStart(2, '0')}`,
        x: cx,
        y: cy
      });
      canvas.classList.add('is-pointing');
    } else if (obj) {
      onEvent('hover', { index: -1, card: null, label: 'Clic · transformer', x: cx, y: cy });
      canvas.classList.add('is-pointing');
    } else {
      onEvent('hover', { index: -1, card: null, label: null, x: cx, y: cy });
      canvas.classList.remove('is-pointing');
    }
  }

  function clearHover() {
    if (hovered?.userData?.orb) hovered.userData.hover = false;
    hovered = null;
    canvas.classList.remove('is-pointing');
    onEvent('hover', { index: -1, card: null, label: null });
  }

  function selectByIndex(index) {
    selected = index >= 0 && index < orbs.length ? index : -1;
    if (selected >= 0) {
      orbs[selected].userData.pulse = 1;
      onEvent('select', { index: selected, card: orbs[selected].userData.card });
    } else {
      onEvent('select', { index: -1, card: null });
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      // Pince : zoom tactile, absent de la version d'origine (audit §2.4).
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      dragging = false;
      return;
    }
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    downTime = performance.now();
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture?.(e.pointerId);
    clearHover();
  });

  window.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const delta = (pinchStart - dist) * 0.02;
      camZTarget = THREE.MathUtils.clamp(camZTarget + delta, cfg.zoomMin, cfg.zoomMax);
      pinchStart = dist;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    parTX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    parTY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      const rx = dx * 0.005;
      const ry = dy * 0.004;
      world.rotation.y += rx;
      world.rotation.x = THREE.MathUtils.clamp(world.rotation.x + ry, -0.55, 0.55);
      inertiaY = rx;
      inertiaX = ry;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (e.target === canvas) {
      hoverAt(e.clientX, e.clientY);
      onEvent('pointer', { x: e.clientX, y: e.clientY });
    }
  });

  window.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('is-dragging');
    if (moved < 6 && performance.now() - downTime < 500) {
      const obj = pick(e.clientX, e.clientY);
      if (obj?.userData?.orb) {
        selectByIndex(obj.userData.index);
      } else if (obj) {
        triggerMorph();
      }
    }
  });

  window.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    dragging = false;
    canvas.classList.remove('is-dragging');
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      // On ne vole le geste que si le pointeur est sur le hero : sinon la
      // page doit pouvoir défiler (correction de l'audit §8.6).
      if (!options.captureWheel) return;
      e.preventDefault();
      camZTarget = THREE.MathUtils.clamp(camZTarget + e.deltaY * 0.006, cfg.zoomMin, cfg.zoomMax);
    },
    { passive: false }
  );

  canvas.addEventListener('pointerleave', clearHover);

  /* ---------------- Boucle ---------------- */

  const clock = new THREE.Clock();
  let running = true;
  let visible = true;
  let inView = true;
  let rafId = 0;

  function shouldRender() {
    return running && visible && inView;
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!shouldRender()) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Rotation libre + inertie
    if (!dragging) {
      world.rotation.y += (reducedMotion ? 0 : cfg.idleSpin) + inertiaY;
      world.rotation.x = THREE.MathUtils.clamp(world.rotation.x + inertiaX, -0.55, 0.55);
      inertiaY *= 0.95;
      inertiaX *= 0.95;
    }

    // Morph
    if (morphT > 0) {
      morphT += dt;
      const HALF = 0.45;
      const TOTAL = 1.15;
      if (morphT >= HALF && !swapped) {
        swapForm();
        swapped = true;
      }
      let s;
      if (morphT < HALF) {
        const k = morphT / HALF;
        s = 1 - k * k * k;
      } else {
        const k = Math.min((morphT - HALF) / (TOTAL - HALF), 1);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        s = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      }
      coreGroup.scale.setScalar(Math.max(s, 0.0001));
      coreGroup.rotation.y += dt * 7 * (1 - Math.min(Math.max(s, 0), 1) * 0.5);
      renderer.shadowMap.needsUpdate = true;
      if (morphT >= TOTAL) {
        morphT = 0;
        coreGroup.scale.setScalar(1);
      }
    }

    flash = Math.max(0, flash - dt * 2.1);
    // Le niveau audio module la lumière du fragment sélectionné.
    accentLight.intensity = 0.8 + flash * 2.4 + energy * 1.6;

    // Respiration pilotée par le shader
    matA.userData.uTime.value = t;
    matB.userData.uTime.value = t;
    wireA.userData.uTime.value = t;
    wireB.userData.uTime.value = t;

    // Rotation du cœur
    coreGroup.rotation.y += dt * 0.22;
    meshA.rotation.x += dt * 0.18;
    meshA.rotation.y += dt * 0.22;
    meshB.rotation.x -= dt * 0.14;
    meshB.rotation.y += dt * 0.18;
    wireMeshA.rotation.copy(meshA.rotation);
    wireMeshB.rotation.copy(meshB.rotation);

    // Fragments
    for (const m of orbs) {
      const u = m.userData;
      u.theta += u.speed * dt;
      // L'énergie audio écarte légèrement le fragment actif (audit §8.5).
      const spread = u.index === selected ? energy * 0.5 : 0;
      m.position.set(
        Math.cos(u.theta) * (u.radius + spread),
        u.yBase + Math.sin(t * 1.1 + u.bob) * 0.3,
        Math.sin(u.theta) * (u.radius + spread)
      );
      const target = (u.hover ? 1.8 : 1) + u.pulse * 1.1 + (u.index === selected ? energy * 0.5 : 0);
      u.scale += (target - u.scale) * 0.18;
      m.scale.setScalar(u.scale);
      const wanted = u.hover || u.index === selected ? u.hoverColor : u.baseColor;
      if (!m.material.map) m.material.color.lerp(wanted, 0.25);
      m.material.emissiveIntensity =
        (u.index === selected ? 0.25 + energy * 0.5 : u.hover ? 0.2 : 0.05);
      u.pulse = Math.max(0, u.pulse - dt * 1.4);
    }

    if (dust) {
      dust.rotation.y -= dt * 0.05;
      dust.rotation.x = Math.sin(t * 0.3) * 0.1;
    }

    // Caméra
    parX += (parTX - parX) * 0.05;
    parY += (parTY - parY) * 0.05;
    camZ += (camZTarget - camZ) * 0.08;
    camera.position.set(parX * cfg.parallax, 0.6 + parY * 0.5, camZ);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  /* ---------------- Visibilité ---------------- */

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) clock.getDelta(); // évite un saut de temps au retour
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting);
        if (inView) clock.getDelta();
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);
  }

  window.addEventListener('resize', resize);
  resize();
  document.documentElement.dataset.world = 'icosa';
  animate();

  /* ---------------- API publique ---------------- */

  return {
    setFragments,
    triggerMorph,
    applyContext,
    setAccent,
    selectByIndex,
    /** Niveau audio normalisé 0..1, injecté par le lecteur. */
    setEnergy(value) {
      energy = Math.min(1, Math.max(0, Number(value) || 0));
    },
    pulse(index = selected) {
      if (orbs[index]) orbs[index].userData.pulse = 1;
    },
    get form() {
      return current;
    },
    get fragmentCount() {
      return orbs.length;
    },
    setRunning(value) {
      running = Boolean(value);
      if (running) clock.getDelta();
    },
    resize,
    renderOnce() {
      renderer.render(scene, camera);
    },
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      for (const m of orbs) {
        m.geometry.dispose();
        m.material.dispose();
      }
      geoA.dispose();
      geoB.dispose();
      matA.dispose();
      matB.dispose();
      wireA.dispose();
      wireB.dispose();
      dust?.geometry.dispose();
      dust?.material.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
    }
  };
}
