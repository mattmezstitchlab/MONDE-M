/**
 * Aperçu 3D du configurateur de carte.
 *
 * Scène réduite : le cœur (icosaèdre ou nœud torique), le fragment de la
 * carte en surbrillance, et quelques fragments témoins pour situer l'échelle.
 * Réutilise le même three.js que le hero — aucun moteur de rendu séparé.
 */

/* global THREE */

function hex(value, fallback = 0xb5541d) {
  if (typeof value === 'number') return value;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  return m ? parseInt(m[1], 16) : fallback;
}

export function createPreviewScene(canvas, { card } = {}) {
  if (!window.THREE) throw new Error('three.js non chargé.');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f6f3);
  scene.fog = new THREE.Fog(0xf6f6f3, 9, 20);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.4, 8.2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(5, 8, 6);
  scene.add(key);
  const accentLight = new THREE.PointLight(0xb5541d, 1.1, 26);
  accentLight.position.set(-4, 2.5, -3);
  scene.add(accentLight);

  const world = new THREE.Group();
  scene.add(world);

  const geoIcosa = new THREE.IcosahedronGeometry(1.5, 1);
  const geoKnot = new THREE.TorusKnotGeometry(0.95, 0.32, 160, 20, 2, 3);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x161616,
    roughness: 0.32,
    metalness: 0.25,
    flatShading: true
  });
  const wireMat = new THREE.MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.3,
    color: 0xb5541d
  });
  const core = new THREE.Mesh(geoIcosa, coreMat);
  const wire = new THREE.Mesh(geoIcosa, wireMat);
  wire.scale.setScalar(1.02);
  world.add(core, wire);

  const grid = new THREE.GridHelper(24, 24, 0xcfcfc8, 0xe3e3db);
  grid.position.y = -2.9;
  world.add(grid);

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  let hero = null; // fragment de la carte éditée
  let ghosts = []; // fragments témoins
  let energy = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let inertia = 0;
  let running = true;
  let rafId = 0;

  function disposeFragments() {
    for (const m of [hero, ...ghosts].filter(Boolean)) {
      world.remove(m);
      m.geometry.dispose();
      m.material.map?.dispose();
      m.material.dispose();
    }
    hero = null;
    ghosts = [];
  }

  function update({ card: next }) {
    const c = next || card;
    const orbit = c?.visual?.orbit || {};
    const accent = hex(c?.visual?.accent || c?.music?.coverColors?.dominant, 0xb5541d);

    // Forme du cœur
    const wantKnot = c?.visual?.geometry === 'knot';
    const targetGeo = wantKnot ? geoKnot : geoIcosa;
    if (core.geometry !== targetGeo) {
      core.geometry = targetGeo;
      wire.geometry = targetGeo;
    }

    accentLight.color.setHex(accent);
    wireMat.color.setHex(accent);

    disposeFragments();

    const size = Number.isFinite(orbit.size) ? orbit.size : 0.11;
    const mat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.3,
      metalness: 0.25,
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.25
    });
    hero = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 18), mat);
    hero.userData = {
      theta: Number.isFinite(orbit.phase) ? orbit.phase : 0,
      radius: Number.isFinite(orbit.radius) ? orbit.radius : 3.8,
      speed: Number.isFinite(orbit.speed) ? orbit.speed : 0.2,
      yBase: Number.isFinite(orbit.yBase) ? orbit.yBase : 0
    };
    const textureUrl = c?.visual?.textureUrl || c?.music?.coverUrl;
    if (textureUrl) {
      loader.load(
        textureUrl,
        (tex) => {
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        },
        undefined,
        () => {}
      );
    }
    world.add(hero);

    // Quatre témoins fixes pour situer l'échelle et l'occupation.
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.4, metalness: 0.2 })
      );
      const angle = (i / 4) * Math.PI * 2 + 0.6;
      g.userData = {
        theta: angle,
        radius: 3.2 + (i % 2) * 0.9,
        speed: 0.13 * (i % 2 ? -1 : 1),
        yBase: (i - 1.5) * 0.7
      };
      world.add(g);
      ghosts.push(g);
    }
  }

  function resize() {
    const w = canvas.clientWidth || 320;
    const hgt = canvas.clientHeight || 320;
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    renderer.setSize(w, hgt, false);
  }

  const clock = new THREE.Clock();
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!running || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (!dragging) {
      world.rotation.y += (reduced ? 0 : 0.0022) + inertia;
      inertia *= 0.94;
    }
    core.rotation.y += dt * 0.22;
    core.rotation.x += dt * 0.1;
    wire.rotation.copy(core.rotation);

    for (const m of [hero, ...ghosts].filter(Boolean)) {
      const u = m.userData;
      u.theta += u.speed * dt;
      const spread = m === hero ? energy * 0.4 : 0;
      m.position.set(
        Math.cos(u.theta) * (u.radius + spread),
        u.yBase + Math.sin(t * 1.1) * 0.22,
        Math.sin(u.theta) * (u.radius + spread)
      );
      if (m === hero) {
        m.material.emissiveIntensity = 0.25 + energy * 0.8;
        const s = 1 + energy * 0.35;
        m.scale.setScalar(s);
      }
    }

    accentLight.intensity = 1.1 + energy * 1.8;
    renderer.render(scene, camera);
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    world.rotation.y += dx * 0.006;
    world.rotation.x = THREE.MathUtils.clamp(world.rotation.x + dy * 0.004, -0.5, 0.5);
    inertia = dx * 0.006;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(canvas);
  }
  window.addEventListener('resize', resize);
  resize();
  update({ card });
  animate();

  return {
    update,
    setEnergy(v) {
      energy = Math.min(1, Math.max(0, Number(v) || 0));
    },
    setRunning(v) {
      running = Boolean(v);
      if (running) clock.getDelta();
    },
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      disposeFragments();
      geoIcosa.dispose();
      geoKnot.dispose();
      coreMat.dispose();
      wireMat.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
    }
  };
}
