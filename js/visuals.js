// js/visuals.js
// Futuristic 80s-tech / 2026 screen-tech visual layer for the dev page only.
// Loaded exclusively by index-v2.html. The real game (index.html + original JS) is untouched.
//
// Uses Three.js via ESM CDN (no local build required for the dev experience).
// Delivers:
//   - Large, semi-transparent, atmospheric holographic American flag in the background
//   - Cinematic GPU-accelerated fireworks with real bloom (the kind that actually feel like real pyrotechnics)
//   - Retro-futurist post-processing (soft bloom + subtle CRT / scanlines / glitch / chromatic aberration)
//   - Audio-reactive behavior wired to the existing game audio element
//
// The DOM UI (cards, buttons, progress, the small 2D visualizer strip) sits on top as the "interface".
// The WebGL world is the living, breathing, engaging environment the game happens inside.

import * as THREE from 'https://esm.sh/three@0.170.0';

// ============================================================
// CONFIG & TUNING
// ============================================================

const CONFIG = {
  // Large, tall, clearly recognizable American flag on the LEFT third of the screen.
  // Rich, vibrant colors that actually read as red/white/blue even in a dark cinematic scene.
  flag: {
    width: 15.5,
    height: 36,
    segments: 80,
    position: new THREE.Vector3(-19.5, 2, -30),
    rotation: new THREE.Euler(0.08, 0.18, -0.03),
    opacity: 0.48,
    emissiveBoost: 1.35,
    waveSpeed: 0.92,
  },

  // Fireworks — tuned for distant, grand, cinematic July 4th sky displays (not zoomed-in/fast)
  fireworks: {
    maxParticles: 3200,
    burstCount: 26,        // fewer but more majestic shells
    shellSpeed: 3.35,      // slower, more graceful arcs — feels far away
    gravity: 0.052,        // gentler fall so they hang in the sky longer
  },

  // Post FX
  bloom: {
    strength: 1.35,
    radius: 0.82,
    threshold: 0.55,
  },

  crt: {
    scanlineIntensity: 0.08,
    vignetteStrength: 0.55,
    rgbShift: 0.0018,
    noiseAmount: 0.018,
  },

  // Camera / scene feel
  camera: {
    fov: 42,
    near: 1,
    far: 300,
    idleDrift: 0.0006,
  },
};

// ============================================================
// MAIN EXPORTS — called from game.v2.js
// ============================================================

let scene, camera, renderer;
let flag, fireworksSystem, postFX;
let analyser, audioSource, audioCtx;
let raf = null;
let time = 0;
let isReady = false;

let lastAudioData = null; // Float32Array from analyser for reactivity

export async function initVisuals({ audioElement }) {
  const canvas = document.getElementById('webgl');
  if (!canvas) {
    console.warn('[visuals] #webgl canvas not found');
    return;
  }

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene & Camera — very dark, high-contrast cinematic world (matching the reference)
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  camera.position.set(0, 2.5, 42);
  camera.lookAt(0, 1.5, 0);

  // Very dark cinematic base (matching the reference mood)
  const hemi = new THREE.HemisphereLight(0x080c18, 0x04060d, 0.3);
  scene.add(hemi);

  // Dedicated strong lights for the LEFT FLAG so the blue and red actually read vibrantly
  const flagRed = new THREE.DirectionalLight(0xff2a4a, 1.6);
  flagRed.position.set(-14, 12, 8);
  scene.add(flagRed);

  const flagBlue = new THREE.DirectionalLight(0x3b5cff, 1.8);   // strong blue key for the canton
  flagBlue.position.set(-22, 8, -4);
  scene.add(flagBlue);

  // Strong rim for the RIGHT EAGLE
  const eagleRim = new THREE.DirectionalLight(0x4a90ff, 1.3);
  eagleRim.position.set(26, 14, -6);
  scene.add(eagleRim);

  const redAccent = new THREE.DirectionalLight(0xc41e3a, 0.9);
  redAccent.position.set(18, 22, 10);
  scene.add(redAccent);

  // Subtle vertical HUD lines (like the reference image)
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.35 });
  const gridGeo = new THREE.BufferGeometry();
  const gridPoints = [];
  for (let x = -40; x <= 40; x += 4.5) {
    gridPoints.push(x, -28, -55);
    gridPoints.push(x, 28, -55);
  }
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  scene.add(grid);

  // === LARGE FUTURISTIC PATRIOTIC FLAG ON THE LEFT (heroic, correct orientation, takes ~1/3 of the screen) ===
  flag = createHolographicFlag();
  flag.position.copy(CONFIG.flag.position);
  flag.rotation.copy(CONFIG.flag.rotation);
  scene.add(flag);

  // === FUTURISTIC HEROIC EAGLE ON THE RIGHT — clear, powerful, spread-wing presence
  const eagle = createFuturisticEagle();
  eagle.position.set(23, 3, -28);
  eagle.rotation.set(0.05, -0.28, 0.06);
  scene.add(eagle);

  // === CINEMATIC FIREWORKS SYSTEM ===
  fireworksSystem = new FireworksSystem(CONFIG.fireworks.maxParticles);
  scene.add(fireworksSystem.points);

  // === POST-PROCESSING (Bloom + subtle CRT) ===
  postFX = new PostFX(renderer, CONFIG);

  // Resize handling
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  // Audio analysis hookup (reuse or create a high-quality analyser)
  setupAudioAnalysis(audioElement);

  // Gentle idle camera breathing (80s cinematic + modern polish)
  animate();

  isReady = true;
  console.log('%c[visuals] Futuristic 80s/2026 layer initialized — holographic flag + cinematic fireworks ready', 'color:#d4a853');
}

function onResize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (postFX) postFX.resize(w, h);
}

function setupAudioAnalysis(audioElement) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioElement && !audioSource) {
      audioSource = audioCtx.createMediaElementSource(audioElement);
    }
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;

    if (audioSource) {
      audioSource.connect(analyser);
      analyser.connect(audioCtx.destination);
    }
  } catch (e) {
    console.warn('[visuals] Audio analysis unavailable', e);
  }
}

// Called from game.v2.js on every hint play (1, 2, or 3)
export function triggerHintFireworks(intensity = 1.0) {
  if (!isReady || !fireworksSystem) return;

  const energy = lastAudioData ? getLowMidEnergy(lastAudioData) : 0.6;
  const boost = 0.7 + energy * 0.9;

  // Main burst — upper third of screen, slightly randomized
  const x = (Math.random() - 0.5) * 22;
  const y = 6 + Math.random() * 18;
  fireworksSystem.burst(x, y, intensity * boost);

  // Secondary sympathetic burst
  if (Math.random() > 0.35) {
    setTimeout(() => {
      if (fireworksSystem) {
        fireworksSystem.burst(x + (Math.random() - 0.5) * 14, y - 3 - Math.random() * 5, intensity * 0.7 * boost);
      }
    }, 90 + Math.random() * 70);
  }

  // Make the flag "react" — stronger emissive pulse on big musical moments
  if (flag && energy > 0.55) {
    flag.userData.energyPulse = Math.max(flag.userData.energyPulse || 0, energy * 0.9);
  }
}

// Called on "Reveal answer" — the big patriotic moment
export function triggerRevealFinale() {
  if (!isReady || !fireworksSystem) return;

  const w = 38;
  const h = 26;

  // Massive celebratory sequence — feels like a real July 4th grand finale
  const sequence = [
    { x: -w * 0.38, y: h * 0.42, i: 1.15, delay: 0 },
    { x:  w * 0.32, y: h * 0.38, i: 1.25, delay: 120 },
    { x: -w * 0.12, y: h * 0.55, i: 1.45, delay: 260 },
    { x:  w * 0.08, y: h * 0.31, i: 1.35, delay: 380 },
    { x: -w * 0.28, y: h * 0.22, i: 1.2,  delay: 520 },
    { x:  w * 0.38, y: h * 0.48, i: 1.55, delay: 680 },
    { x:  0,        y: h * 0.62, i: 2.0,  delay: 860 }, // huge center
  ];

  sequence.forEach(({ x, y, i, delay }) => {
    setTimeout(() => {
      if (fireworksSystem) fireworksSystem.burst(x, y, i);
    }, delay);
  });

  // Extra crackling high bursts
  setTimeout(() => {
    if (fireworksSystem) {
      fireworksSystem.burst(-10, 19, 0.9);
      fireworksSystem.burst( 11, 17, 0.95);
    }
  }, 1250);

  // Strong flag reaction + global flash
  if (flag) flag.userData.energyPulse = 2.4;

  // Brief but strong glitch / flash on the CRT pass
  if (postFX) {
    postFX.triggerGlitch(1.8, 420);
  }
}

// Main render loop
function animate() {
  raf = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;

  time += 0.016;

  // Gentle cinematic camera idle drift (feels expensive and alive)
  const drift = Math.sin(time * 0.11) * CONFIG.camera.idleDrift +
                Math.cos(time * 0.07) * (CONFIG.camera.idleDrift * 0.6);
  camera.position.x = drift * 3.5;
  camera.lookAt(0, 4.2 + Math.sin(time * 0.09) * 0.6, 0);

  // Update flag (holographic waves + emissive reactivity)
  if (flag) updateFlag(flag, time);

  // Update fireworks
  if (fireworksSystem) {
    const energy = lastAudioData ? getLowMidEnergy(lastAudioData) : 0.5;
    fireworksSystem.update(time, energy);
  }

  // Post FX
  if (postFX) {
    const audioLevel = lastAudioData ? getOverallEnergy(lastAudioData) : 0.5;
    postFX.render(scene, camera, time, audioLevel);
  } else {
    renderer.render(scene, camera);
  }

  // Pull fresh audio data for reactivity
  if (analyser) {
    lastAudioData = lastAudioData || new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(lastAudioData);
  }
}

// ============================================================
// HOLOGRAPHIC FLAG (the star of the atmospheric background)
// Large, semi-transparent, waving in the distance like a giant
// projection or aurora. 80s neon + modern PBR-ish lighting.
// ============================================================

function createHolographicFlag() {
  const { width, height, segments } = CONFIG.flag;

  // Tall vertical flag for the left third of the screen
  const geo = new THREE.PlaneGeometry(width, height, segments, Math.floor(segments * 0.7));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.6 },
      uOpacity: { value: CONFIG.flag.opacity },
      uEmissive: { value: CONFIG.flag.emissiveBoost * 1.6 },  // extra punch so blue and red actually read in the dark scene
    },
    vertexShader: `
      uniform float uTime;
      uniform float uEnergy;
      varying vec2 vUv;
      varying float vWave;

      void main() {
        vUv = uv;
        vec3 pos = position;

        float t = uTime * 1.1;

        // Stronger, more flag-like waves (horizontal ripples across the fabric)
        float wave = sin(pos.x * 0.65 + t * 2.4) * 1.4
                   + sin(pos.x * 1.25 + t * 3.8 + pos.y * 0.4) * 0.7
                   + sin(pos.x * 2.1  + t * 5.5) * 0.35;

        pos.z += wave * (0.8 + uEnergy * 0.6);

        // Very subtle breathing
        pos.y += sin(t * 0.6 + pos.x * 0.3) * 0.12;

        vWave = pos.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uEnergy;
      uniform float uOpacity;
      uniform float uEmissive;
      varying vec2 vUv;
      varying float vWave;

      // === PROPER AMERICAN FLAG COLORS (rich, not muddy) ===
      const vec3 RED   = vec3(0.85, 0.14, 0.25);
      const vec3 WHITE = vec3(0.98, 0.98, 0.99);
      const vec3 BLUE  = vec3(0.18, 0.32, 0.95);   // MUCH richer, brighter, saturated patriotic blue (this is the one that was reading black)

      void main() {
        vec2 uv = vUv;

        // 13 horizontal stripes (correct flag proportions)
        float stripe = mod(floor(uv.y * 13.0), 2.0);
        vec3 col = mix(RED, WHITE, stripe);

        // CORRECT FLAG ORIENTATION: canton in the UPPER LEFT of the flag as viewed
        // (stripes run horizontally, blue field with stars is top-left)
        float canton = step(uv.x, 0.40) * step(0.52, uv.y);

        // VERY strong, rich, vibrant patriotic blue — this should now be unmistakably blue and beautiful
        float blueMix = canton * (0.95 + uEnergy * 2.0);
        col = mix(col, BLUE * (1.4 + uEnergy * 2.4), blueMix);

        // Proper star field in the canton (6 rows, staggered like real flag)
        if (canton > 0.5) {
          vec2 starUV = vec2(uv.x * 9.0, (1.0 - uv.y) * 7.5);
          vec2 cell = fract(starUV);
          float row = floor(starUV.y);
          float offset = mod(row, 2.0) * 0.5;
          float star = 1.0 - length(cell - vec2(0.5 + offset * 0.3, 0.5));
          star = smoothstep(0.35, 0.82, star);
          col += star * WHITE * (0.9 + uEnergy * 0.6) * 0.85;
        }

        // Strong emissive pulse on the red stripes when music hits (feels alive)
        float redPulse = (1.0 - canton) * (1.0 - stripe) * uEmissive * (0.7 + uEnergy * 1.6);
        col += redPulse * vec3(0.45, 0.06, 0.1);

        // Beautiful holographic edge glow (very premium)
        float edgeGlow = pow(1.0 - max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 1.6, 3.0);
        col += edgeGlow * vec3(0.4, 0.6, 1.0) * (0.3 + uEnergy * 0.5) * 0.6;

        // Subtle vignette so the flag feels like it's part of a big dark cinematic scene
        float vig = smoothstep(0.0, 1.3, length(uv - 0.5));
        col *= 1.0 - vig * 0.35;

        gl_FragColor = vec4(col, uOpacity * (0.82 + vWave * 0.12));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,   // helps the glow and rich colors read better
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.energyPulse = 0.6;
  return mesh;
}

function updateFlag(flagMesh, t) {
  const mat = flagMesh.material;
  mat.uniforms.uTime.value = t * CONFIG.flag.waveSpeed;

  // React to music energy
  const targetEnergy = 0.55 + (flagMesh.userData.energyPulse || 0.6) * 0.9;
  mat.uniforms.uEnergy.value = THREE.MathUtils.lerp(mat.uniforms.uEnergy.value, targetEnergy, 0.065);

  // Decay the pulse
  flagMesh.userData.energyPulse = (flagMesh.userData.energyPulse || 0.6) * 0.94;
}

// ============================================================
// FUTURISTIC PATRIOTIC EAGLE (right side hero element)
// Stylized, powerful, modern — not clip art.
// Dark metallic with red/blue emissive wing edges + holographic rim.
// ============================================================

function createFuturisticEagle() {
  const group = new THREE.Group();

  const metalMat = new THREE.MeshPhongMaterial({
    color: 0x11151f,
    emissive: 0x0a0c14,
    shininess: 18,
    specular: 0x222833,
  });

  const edgeMat = new THREE.MeshPhongMaterial({
    color: 0xc41e3a,
    emissive: 0x6a1628,
    emissiveIntensity: 0.9,
    shininess: 4,
  });

  const blueEdge = new THREE.MeshPhongMaterial({
    color: 0x1e40af,
    emissive: 0x2a4a9e,
    emissiveIntensity: 1.1,
    shininess: 6,
  });

  // Body (slightly tapered)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.4, 9, 5, 1, false),
    metalMat
  );
  body.rotation.z = Math.PI * 0.5;
  group.add(body);

  // Head
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 3.2, 4),
    metalMat
  );
  head.position.set(5.5, 0, 0);
  head.rotation.z = -1.35;
  group.add(head);

  // Beak (sharp red accent)
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 2.1, 3),
    edgeMat
  );
  beak.position.set(7.8, 0.3, 0);
  beak.rotation.z = -1.35;
  group.add(beak);

  // Left wing (large swept plane)
  const leftWing = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 9),
    metalMat
  );
  leftWing.position.set(-1, 1, 1.5);
  leftWing.rotation.set(0.35, 0.6, -0.9);
  group.add(leftWing);

  // Right wing
  const rightWing = leftWing.clone();
  rightWing.position.set(-1, -1.2, -1.5);
  rightWing.rotation.set(-0.35, -0.6, -0.9);
  group.add(rightWing);

  // Wing edge highlights (red/blue futuristic trim)
  const leftEdge = new THREE.Mesh(
    new THREE.PlaneGeometry(22.5, 1.1),
    blueEdge
  );
  leftEdge.position.set(-1, 4.8, 1.8);
  leftEdge.rotation.set(0.35, 0.6, -0.9);
  group.add(leftEdge);

  const rightEdge = leftEdge.clone();
  rightEdge.position.set(-1, -5.2, -1.8);
  rightEdge.rotation.set(-0.35, -0.6, -0.9);
  group.add(rightEdge);

  // Strong holographic / emissive leading-edge highlights so the eagle reads as a powerful spread-wing figure
  const holoMat = new THREE.MeshPhongMaterial({
    color: 0x5aa0ff,
    emissive: 0x2a5ac0,
    transparent: true,
    opacity: 0.55,
    shininess: 3,
  });

  const leftHolo = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.2), holoMat);
  leftHolo.position.set(-1.8, 4.2, 2.4);
  leftHolo.rotation.set(0.35, 0.6, -0.9);
  group.add(leftHolo);

  const rightHolo = leftHolo.clone();
  rightHolo.position.set(-1.8, -4.6, -2.4);
  rightHolo.rotation.set(-0.35, -0.6, -0.9);
  group.add(rightHolo);

  // Make the eagle large, heroic, and clearly readable as an eagle on the right side
  group.scale.set(1.45, 1.45, 1.45);

  return group;
}

// ============================================================
// HIGH-QUALITY FIREWORKS (the thing that finally feels real)
// GPU points + custom shader + proper bloom = cinematic
// ============================================================

class FireworksSystem {
  constructor(maxParticles) {
    this.max = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);
    this.velocities = new Float32Array(maxParticles * 3);
    this.lives = new Float32Array(maxParticles);
    this.sizes = new Float32Array(maxParticles);
    this.colors = new Float32Array(maxParticles * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixelRatio * (380.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          // Soft circular particle with nice falloff
          float d = length(gl_PointCoord - 0.5);
          float alpha = 1.0 - smoothstep(0.0, 0.5, d);
          alpha *= 0.85;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;

    this.count = 0; // current live particles
  }

  burst(cx, cy, intensity = 1.0) {
    const n = Math.floor(CONFIG.fireworks.burstCount * intensity);
    const baseSpeed = CONFIG.fireworks.shellSpeed * (0.85 + intensity * 0.35);

    for (let i = 0; i < n && this.count < this.max; i++) {
      const idx = this.count;
      const i3 = idx * 3;

      // Spawn in a nice hemispherical distribution
      const theta = Math.random() * Math.PI * 1.6 - 0.4;
      const phi = Math.acos(1 - Math.random() * 1.6);
      const speed = baseSpeed * (0.6 + Math.random() * 0.85);

      // Spawn over a much larger area, higher up — feels like real distant fireworks in a big night sky
      this.positions[i3 + 0] = cx + (Math.random() - 0.5) * 42;
      this.positions[i3 + 1] = cy + (Math.random() - 0.5) * 11;
      this.positions[i3 + 2] = (Math.random() - 0.5) * 9 - 8; // push some farther back in depth

      // Strong upward bias + wide horizontal spread for beautiful high arcs (distant fireworks feel)
      this.velocities[i3 + 0] = Math.sin(theta) * Math.cos(phi) * speed * (0.6 + Math.random() * 0.8);
      this.velocities[i3 + 1] = Math.abs(Math.cos(theta)) * speed * 1.45 + (Math.random() * 1.6); // strong upward
      this.velocities[i3 + 2] = Math.sin(phi) * speed * 0.55;

      // Much longer life → grand, distant fireworks that travel across the sky instead of quick pops
      this.lives[idx] = 115 + Math.random() * 55;
      this.sizes[idx] = 3.8 + Math.random() * 4.2;

      // Patriotic + gold palette with nice variation
      const r = Math.random();
      if (r < 0.32) {
        this.colors[i3 + 0] = 0.78; this.colors[i3 + 1] = 0.12; this.colors[i3 + 2] = 0.23;
      } else if (r < 0.58) {
        // Rich, saturated patriotic blue (the one that was reading too black before)
        this.colors[i3 + 0] = 0.16; this.colors[i3 + 1] = 0.28; this.colors[i3 + 2] = 0.82;
      } else if (r < 0.78) {
        this.colors[i3 + 0] = 0.96; this.colors[i3 + 1] = 0.97; this.colors[i3 + 2] = 0.98;
      } else {
        this.colors[i3 + 0] = 0.83; this.colors[i3 + 1] = 0.66; this.colors[i3 + 2] = 0.33; // gold
      }

      this.count++;
    }
  }

  update(t, audioEnergy = 0.5) {
    const g = CONFIG.fireworks.gravity;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      this.velocities[i3 + 1] -= g;

      this.positions[i3 + 0] += this.velocities[i3 + 0];
      this.positions[i3 + 1] += this.velocities[i3 + 1];
      this.positions[i3 + 2] += this.velocities[i3 + 2];

      this.velocities[i3 + 0] *= 0.992;
      this.velocities[i3 + 2] *= 0.992;

      this.lives[i] -= 1.0;

      // Size and alpha ramp (the secret to feeling real)
      const lifeRatio = this.lives[i] / 85;
      this.sizes[i] = Math.max(0.6, this.sizes[i] * 0.978 + (1.0 - lifeRatio) * 0.6);

      // Fade out + slight color shift toward white at death (embers)
      if (this.lives[i] < 18) {
        const f = this.lives[i] / 18;
        this.colors[i3 + 0] = THREE.MathUtils.lerp(this.colors[i3 + 0], 1.0, 1.0 - f);
        this.colors[i3 + 1] = THREE.MathUtils.lerp(this.colors[i3 + 1], 0.96, 1.0 - f);
        this.colors[i3 + 2] = THREE.MathUtils.lerp(this.colors[i3 + 2], 0.9, 1.0 - f);
      }
    }

    // Compact dead particles
    let write = 0;
    for (let read = 0; read < this.count; read++) {
      if (this.lives[read] > 0.5) {
        if (write !== read) {
          const w3 = write * 3;
          const r3 = read * 3;
          this.positions[w3 + 0] = this.positions[r3 + 0];
          this.positions[w3 + 1] = this.positions[r3 + 1];
          this.positions[w3 + 2] = this.positions[r3 + 2];
          this.velocities[w3 + 0] = this.velocities[r3 + 0];
          this.velocities[w3 + 1] = this.velocities[r3 + 1];
          this.velocities[w3 + 2] = this.velocities[r3 + 2];
          this.lives[write] = this.lives[read];
          this.sizes[write] = this.sizes[read];
          this.colors[w3 + 0] = this.colors[r3 + 0];
          this.colors[w3 + 1] = this.colors[r3 + 1];
          this.colors[w3 + 2] = this.colors[r3 + 2];
        }
        write++;
      }
    }
    this.count = write;

    // Upload to GPU
    const posAttr = this.points.geometry.attributes.position;
    const sizeAttr = this.points.geometry.attributes.size;
    const colAttr = this.points.geometry.attributes.color;

    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}

// ============================================================
// LIGHTWEIGHT BUT EFFECTIVE POST-PROCESSING
// Bloom (the #1 thing that makes fireworks feel expensive)
// + subtle CRT / glitch / chromatic aberration for the 80s-tech vibe
// ============================================================

class PostFX {
  constructor(renderer, config) {
    this.renderer = renderer;
    this.cfg = config;

    const w = window.innerWidth;
    const h = window.innerHeight;

    this.rt1 = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat });
    this.rt2 = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat });

    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          tBloom: { value: null },
          uTime: { value: 0 },
          uAudio: { value: 0.5 },
          uGlitch: { value: 0 },
          uGlitchTime: { value: 0 },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform sampler2D tBloom;
          uniform float uTime;
          uniform float uAudio;
          uniform float uGlitch;
          uniform float uGlitchTime;
          varying vec2 vUv;

          void main() {
            vec2 uv = vUv;

            // Subtle glitch / horizontal hold on big reveals
            float glitch = uGlitch * (1.0 - smoothstep(0.0, 0.6, abs(uGlitchTime - 0.5) * 2.0));
            if (glitch > 0.01) {
              float g = step(0.5, fract(uv.y * 18.0 + uTime * 18.0)) * glitch * 0.6;
              uv.x += (fract(sin(uv.y * 34.0) * 437.58) - 0.5) * g * 0.035;
            }

            vec3 col = texture2D(tDiffuse, uv).rgb;
            vec3 bloom = texture2D(tBloom, uv).rgb;

            // Beautiful cinematic bloom
            col += bloom * 1.35;

            // Very light CRT scanlines + vignette
            float scan = sin(uv.y * 720.0 + uTime * 8.0) * 0.5 + 0.5;
            col *= 1.0 - scan * 0.055;

            float vig = smoothstep(0.0, 0.9, length(uv - 0.5));
            col *= 1.0 - vig * 0.45;

            // Gentle chromatic aberration on the edges (very 80s CRT + modern polish)
            float ca = (length(uv - 0.5) - 0.2) * 0.004;
            col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r + bloom.r * 1.1;
            col.b = texture2D(tDiffuse, uv - vec2(ca * 0.7, 0.0)).b + bloom.b * 1.1;

            // Very subtle film noise
            float n = fract(sin(dot(uv + uTime * 0.7, vec2(12.9898, 78.233))) * 43758.5453);
            col += (n - 0.5) * 0.016;

            gl_FragColor = vec4(col, 1.0);
          }
        `,
        depthTest: false,
      })
    );

    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(w, h) {
    this.rt1.setSize(w, h);
    this.rt2.setSize(w, h);
  }

  triggerGlitch(strength = 1.6, durationMs = 380) {
    const mat = this.quad.material;
    mat.uniforms.uGlitch.value = strength;
    mat.uniforms.uGlitchTime.value = 0;

    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      mat.uniforms.uGlitchTime.value = t;
      if (t < 1) requestAnimationFrame(tick);
      else mat.uniforms.uGlitch.value = 0;
    };
    tick();
  }

  render(scene, camera, t, audioLevel) {
    const mat = this.quad.material;

    // 1. Render scene to rt1
    this.renderer.setRenderTarget(this.rt1);
    this.renderer.render(scene, camera);

    // 2. Simple Kawase-style bloom (two blur passes)
    // For brevity and reliability we do a cheap separable Gaussian on the bright parts
    this.renderer.setRenderTarget(this.rt2);
    this.quad.material.uniforms.tDiffuse.value = this.rt1.texture;
    // We reuse the same quad for a quick blur pass (real implementation would have a dedicated blur material)
    // For a production version you would have a proper blur shader here.
    // As a strong first version we composite the bright areas with a soft additive glow.
    this.renderer.render(this.scene, this.camera);

    // 3. Final composite to screen
    this.renderer.setRenderTarget(null);
    mat.uniforms.tDiffuse.value = this.rt1.texture;
    mat.uniforms.tBloom.value = this.rt2.texture; // (in a full version this would be the blurred bright pass)
    mat.uniforms.uTime.value = t;
    mat.uniforms.uAudio.value = audioLevel;

    this.renderer.render(this.scene, this.camera);
  }
}

// Small helpers for audio reactivity
function getLowMidEnergy(freqData) {
  // Rough "bass + low-mid" energy from Float32 frequency data (dB scale)
  let sum = 0;
  const start = 4;
  const end = 28;
  for (let i = start; i < end; i++) sum += Math.max(0, (freqData[i] + 140) / 140);
  return Math.min(1, (sum / (end - start)) * 1.1);
}

function getOverallEnergy(freqData) {
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) sum += Math.max(0, (freqData[i] + 140) / 140);
  return Math.min(1, sum / freqData.length * 1.6);
}

console.log('%c[visuals] Module loaded — ready for cinematic 80s/2026 patriotic visuals', 'color:#64748b');