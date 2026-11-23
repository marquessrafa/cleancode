// Motor 3D do Monitor de hardware: three.js com materiais PBR, ambiente para reflexos, brilho neon
// (UnrealBloomPass) e órbita suave com o mouse. A renderização pausa quando o visualizador sai da tela
// ou a janela fica oculta. Também traz as peças reutilizáveis: caixa chanfrada, ventoinha, faixa de LED
// RGB, texturas geradas em canvas (trilhas de placa, telas, texto gravado).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export { THREE };

/** Dados ao vivo que os modelos usam para se animar (todos opcionais, 0..1 quando for proporção). */
export interface Live {
  load?: number;          // carga da CPU 0..1
  cores?: number[];       // carga por núcleo 0..1
  gpu?: number;           // uso da GPU 0..1
  fanRpm?: number;        // rotação das ventoinhas da GPU
  mem?: number;           // memória em uso 0..1
  watts?: number;         // consumo total
  battery?: number;       // carga 0..1 (notebook)
  charging?: boolean;
  disk?: number;          // atividade de disco 0..1
  temps?: Record<string, number>; // temperatura por peça (cpu, gpu, ram, board, disk, psu)
  accent: THREE.Color;
}
export interface Model { group: THREE.Group; update?: (live: Live, t: number, dt: number) => void; focus?: { distance: number; target?: [number, number, number]; height?: number } }

// ---------- materiais ----------
export const mat = {
  metal: (color = 0x9aa1ab, rough = 0.32) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough }),
  dark: (color = 0x16181d, rough = 0.55) => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: rough }),
  plastic: (color = 0x1b1d22, rough = 0.7) => new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: rough }),
  pcb: (color = 0x0e3b2c) => new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.25 }),
  glow: (color: THREE.ColorRepresentation, intensity = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x9fb4c8, metalness: 0, roughness: 0.04, transmission: 0.92, thickness: 0.02, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
};

// ---------- geometria ----------
export function rbox(w: number, h: number, d: number, r = 0.02, m: THREE.Material = mat.dark(), seg = 3) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
export function box(w: number, h: number, d: number, m: THREE.Material) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }
export function cyl(rTop: number, rBot: number, h: number, m: THREE.Material, seg = 32) { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m); mesh.castShadow = true; return mesh; }
/** Prisma com contorno 2D (x, y) extrudado em profundidade, com chanfro: dissipadores e coberturas angulares. */
export function extrude(points: [number, number][], depth: number, m: THREE.Material, bevel = 0.006) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12 });
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
/** Retângulo arredondado como Shape (para placas, tampas e telas). */
export function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
export function slab(w: number, h: number, depth: number, r: number, m: THREE.Material, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

// ---------- texturas geradas ----------
export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
/** Trilhas de circuito impresso (placa-mãe, placa de vídeo, SSD). */
export function pcbTexture(base = '#0b0d10', line = 'rgba(80,95,110,0.35)', seed = 1, size = 1024) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(size, size, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, size, size);
    c.strokeStyle = line; c.lineWidth = 2;
    for (let i = 0; i < 260; i++) {
      let x = rnd() * size, y = rnd() * size; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { if (rnd() > 0.5) x += (rnd() - 0.5) * 220; else y += (rnd() - 0.5) * 220; c.lineTo(x, y); }
      c.stroke();
      c.fillStyle = line; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 1600; i++) c.fillRect(rnd() * size, rnd() * size, 2, 2);
  });
}
/** Texto gravado (tampa do processador, etiquetas), sem marcas. */
export function labelTexture(lines: { text: string; size: number; weight?: number; alpha?: number }[], w = 1024, h = 1024, bg = '#b9bdc3', fg = '#3c4047') {
  return canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    // escovado
    for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`; c.fillRect(0, y, w, 1); }
    let y = h * 0.34;
    for (const l of lines) { c.fillStyle = fg; c.globalAlpha = l.alpha ?? 0.85; c.font = `${l.weight || 700} ${l.size}px "SF Mono", Menlo, Consolas, monospace`; c.fillText(l.text, w * 0.14, y); y += l.size * 1.45; }
    c.globalAlpha = 1;
  });
}

// ---------- peças reutilizáveis ----------
/** Ventoinha: aro, pás curvas inclinadas e cubo; gira em update(speed). */
export function fan(radius: number, opts: { blades?: number; frame?: boolean; ring?: THREE.Material; hub?: THREE.Material; blade?: THREE.Material } = {}) {
  const g = new THREE.Group();
  const blades = new THREE.Group();
  const n = opts.blades ?? 9;
  const bladeMat = opts.blade ?? new THREE.MeshStandardMaterial({ color: 0x131417, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) {
    const s = new THREE.Shape();
    const r0 = radius * 0.28, r1 = radius * 0.93;
    s.moveTo(r0, -radius * 0.1);
    s.bezierCurveTo(r0 + radius * 0.25, -radius * 0.34, r1 - radius * 0.1, -radius * 0.26, r1, radius * 0.06);
    s.bezierCurveTo(r1 - radius * 0.14, radius * 0.36, r0 + radius * 0.2, radius * 0.34, r0, radius * 0.2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: radius * 0.012, bevelEnabled: false });
    const m = new THREE.Mesh(geo, bladeMat);
    m.rotation.z = (i / n) * Math.PI * 2; m.rotation.x = 0.0; m.rotateOnAxis(new THREE.Vector3(1, 0, 0), 0.32);
    blades.add(m);
  }
  g.add(blades);
  const hub = cyl(radius * 0.27, radius * 0.27, radius * 0.08, opts.hub ?? mat.dark(0x101114, 0.4), 40); hub.rotation.x = Math.PI / 2; hub.position.z = radius * 0.03; g.add(hub);
  const hubCap = cyl(radius * 0.2, radius * 0.2, radius * 0.02, mat.metal(0x2a2d33, 0.25), 40); hubCap.rotation.x = Math.PI / 2; hubCap.position.z = radius * 0.075; g.add(hubCap);
  if (opts.frame !== false) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.0, radius * 0.045, 12, 64), opts.ring ?? mat.dark(0x15171b, 0.5)); g.add(ring);
  }
  let angle = 0;
  return { group: g, blades, spin(speed: number, dt: number) { angle += speed * dt; blades.rotation.z = angle; } };
}
/** Faixa de LED: segmentos com cor própria; update recolore em arco-íris ou na cor de destaque. */
export function ledStrip(len: number, count: number, thickness = 0.01, depth = 0.01, vertical = false) {
  const g = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const seg = len / count;
  for (let i = 0; i < count; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 2.4, roughness: 0.3 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(vertical ? thickness : seg * 0.82, vertical ? seg * 0.82 : thickness, depth), m);
    if (vertical) b.position.y = -len / 2 + seg * (i + 0.5); else b.position.x = -len / 2 + seg * (i + 0.5);
    g.add(b); mats.push(m);
  }
  return {
    group: g,
    update(t: number, accent: THREE.Color, mode: 'rainbow' | 'accent' | 'wave' = 'rainbow', level = 1) {
      for (let i = 0; i < mats.length; i++) {
        const c = mats[i].emissive;
        if (mode === 'rainbow') c.setHSL(((i / mats.length) + t * 0.08) % 1, 0.9, 0.55);
        else if (mode === 'wave') { const h = accent.getHSL({ h: 0, s: 0, l: 0 }).h; c.setHSL((h + Math.sin(i * 0.35 + t * 1.6) * 0.12 + 1) % 1, 0.95, 0.55); }
        else c.copy(accent);
        mats[i].emissiveIntensity = (mode === 'accent' ? 1.6 + Math.sin(t * 2 + i * 0.3) * 0.6 : 2.2) * level;
      }
    },
  };
}
/** Anel de LED (ventoinhas RGB). */
export function ledRing(radius: number, tube = 0.008) {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffffff), emissiveIntensity: 2.4 });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 80), m);
  return { mesh, update(t: number, offset = 0) { m.emissive.setHSL((t * 0.07 + offset) % 1, 0.9, 0.55); } };
}
/** Cor de temperatura (azul frio → verde → amarelo → vermelho). */
export function tempColor(c: number) {
  const k = Math.max(0, Math.min(1, (c - 30) / 65));
  return new THREE.Color().setHSL((1 - k) * 0.62, 0.95, 0.5);
}

// ---------- visualizador ----------
export interface ViewerHandle { setLive: (l: Partial<Live>) => void; dispose: () => void; setHeat: (on: boolean) => void; renderOnce: (t?: number) => string }
export function createViewer(host: HTMLElement, build: () => Model, opts: { bloom?: number; autoRotate?: boolean; heat?: boolean } = {}): ViewerHandle {
  const testMode = location.hash.startsWith('#hw3d-test');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: testMode });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  // canvas fora do fluxo do layout: senão ele empurra o tamanho do contêiner (laço de redimensionamento)
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const scene = new THREE.Scene();
  // o brilho (bloom) não preserva transparência: o fundo da cena acompanha a superfície do app
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  scene.background = new THREE.Color(surface && !surface.startsWith('var') ? surface : '#141518');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  (scene as any).environmentIntensity = 0.55; // reflexos suaves (metal escuro continua escuro)
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb7ff, 0.9); rim.position.set(-3, 1.5, -2); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.28 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const model = build();
  // centraliza e apoia no chão
  const bb = new THREE.Box3().setFromObject(model.group);
  const center = bb.getCenter(new THREE.Vector3()); const size = bb.getSize(new THREE.Vector3());
  model.group.position.sub(new THREE.Vector3(center.x, bb.min.y, center.z));
  floor.position.y = 0;
  scene.add(model.group);
  const radius = Math.max(size.x, size.y, size.z);
  const dist = model.focus?.distance ?? radius * 2.1;
  const target = new THREE.Vector3(...(model.focus?.target ?? [0, size.y * 0.45, 0]));
  const camH = model.focus?.height ?? size.y * 0.65 + radius * 0.35;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // só o que é emissivo (LEDs, telas) ultrapassa o limiar e brilha
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), opts.bloom ?? 0.6, 0.45, 0.96);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const live: Live = { accent: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3ddc97') };
  let az = -0.6, el = 0.0, targetAz = az, dragging = false, lastX = 0, lastY = 0, hover = { x: 0, y: 0 };
  const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; host.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect(); hover = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
    if (!dragging) return; targetAz -= (e.clientX - lastX) * 0.008; el = Math.max(-0.35, Math.min(0.5, el + (e.clientY - lastY) * 0.004)); lastX = e.clientX; lastY = e.clientY;
  };
  const onUp = () => { dragging = false; };
  host.addEventListener('pointerdown', onDown); host.addEventListener('pointermove', onMove); host.addEventListener('pointerup', onUp); host.addEventListener('pointerleave', () => { hover = { x: 0, y: 0 }; });

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  let visible = true;
  const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; }, { threshold: 0.01 }); io.observe(host);
  let raf = 0, last = performance.now(), t = 0, alive = true;
  const step = (dt: number) => {
    t += dt;
    if (opts.autoRotate !== false && !dragging) targetAz += dt * 0.12;
    az += (targetAz - az) * Math.min(1, dt * 6);
    const a = az + hover.x * 0.25, e2 = el + hover.y * 0.12;
    camera.position.set(target.x + Math.sin(a) * dist * Math.cos(e2), camH + Math.sin(e2) * dist, target.z + Math.cos(a) * dist * Math.cos(e2));
    camera.lookAt(target);
    model.update?.(live, t, dt);
    composer.render();
  };
  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden || host.offsetParent === null) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt);
  };
  raf = requestAnimationFrame(frame);

  return {
    renderOnce(tt = 2) { resize(); for (let i = 0; i < 3; i++) step(tt / 3); return renderer.domElement.toDataURL('image/png'); },
    setLive(l) { Object.assign(live, l); },
    setHeat() { /* reservado */ },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener('pointerdown', onDown); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerup', onUp);
      scene.traverse((o: any) => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((m: any) => { Object.values(m).forEach((v: any) => v?.isTexture && v.dispose()); m.dispose?.(); }); });
      composer.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
