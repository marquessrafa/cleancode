// Motor 3D do Monitor de hardware: three.js com materiais PBR foscos, reflexo leve e câmera automática que
// passeia pelo modelo. A renderização pausa quando o visualizador sai da tela
// ou a janela fica oculta. Também traz as peças reutilizáveis: caixa chanfrada, ventoinha, faixa de LED
// RGB, texturas geradas em canvas (trilhas de placa, telas, texto gravado).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
export interface Model { group: THREE.Group; update?: (live: Live, t: number, dt: number) => void; focus?: { distance: number; target?: [number, number, number]; height?: number }; orbit?: { auto?: boolean; range?: number; start?: number; keepWhole?: boolean; maxEl?: number; span?: number };
  /** pontos de interesse para os zooms grandes: posição (no espaço do modelo, ou função que devolve a posição no
   *  mundo, para peças que se mexem), distância da câmera em unidades reais, e direção (az relativo à frente, el) */
  pois?: { at: [number, number, number] | (() => THREE.Vector3); d: number; az?: number; el?: number }[] }

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
/** Quanto o canvas passa do espaço reservado, em cada lado: o 3D vaza por trás dos blocos vizinhos e some em fade. */
export const OVERFLOW = 150;

/** Deixa os materiais foscos: menos metal e reflexo, e brilho bem mais fraco. A atenuação do brilho fica no
 *  shader, porque os modelos recalculam a intensidade dos LEDs e dos núcleos a cada quadro. */
const EMISSIVE_DAMP = 0.42, BASIC_DAMP = 0.72, ADDITIVE_DAMP = 0.45;
function matte(root: THREE.Object3D) {
  root.traverse((o: any) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (m.userData.matte) continue;
      m.userData.matte = true;
      if (m instanceof THREE.MeshBasicMaterial) {
        const additive = m.blending === THREE.AdditiveBlending;
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
            ${additive ? `diffuseColor.a *= ${ADDITIVE_DAMP.toFixed(2)};` : `diffuseColor.rgb *= ${BASIC_DAMP.toFixed(2)};`}`);
        };
        m.customProgramCacheKey = () => (additive ? 'matte-add' : 'matte-basic');
        m.needsUpdate = true;
        continue;
      }
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.roughness = Math.max(m.roughness, m.metalness > 0.5 ? 0.55 : 0.68);
      m.metalness = m.metalness * 0.75;
      m.envMapIntensity = 0.6;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance *= ${EMISSIVE_DAMP.toFixed(2)};`);
      };
      m.customProgramCacheKey = () => 'matte-std';
      m.needsUpdate = true;
    }
  });
}

/** Circuito animado no fundo do 3D: trilhas que saem de trás do componente (centro) até as bordas, com pulsos
 *  de energia correndo para fora. As trilhas ficam desenhadas num canvas fixo; só os pulsos são redesenhados. */
function circuitLayer(parent: HTMLElement) {
  const cv = document.createElement('canvas');
  Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  parent.appendChild(cv);
  const ctx = cv.getContext('2d')!;
  const still = document.createElement('canvas');
  const sctx = still.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const ac = new THREE.Color(css.getPropertyValue('--accent').trim() || '#3ddc97');
  const [ar, ag, ab] = [ac.r, ac.g, ac.b].map((v) => Math.round(v * 255));
  const rgba = (a: number) => `rgba(${ar},${ag},${ab},${a})`;
  const dark = document.documentElement.classList.contains('dark');
  type Trace = { pts: [number, number][]; len: number; segs: number[]; pulses: { s: number; v: number; l: number }[] };
  let traces: Trace[] = [], W = 0, H = 0;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const build = () => {
    traces = [];
    const cx = W / 2, cy = H / 2, G = 18; // trilhas na grade de 18 px, como numa placa
    const snap = (v: number) => Math.round(v / G) * G;
    const n = Math.round(Math.min(64, Math.max(28, (W * H) / 26000)));
    for (let i = 0; i < n; i++) {
      // nasce embaixo do componente e segue para uma borda, com curvas de 90° e 45°
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      let x = snap(cx + Math.cos(ang) * W * 0.07 * Math.random()), y = snap(cy + Math.sin(ang) * H * 0.07 * Math.random());
      const pts: [number, number][] = [[x, y]];
      let hor = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang));
      const sx = Math.sign(Math.cos(ang)) || 1, sy = Math.sign(Math.sin(ang)) || 1;
      for (let k = 0; k < 7 && x > 0 && x < W && y > 0 && y < H; k++) {
        const step = snap(G * (3 + Math.random() * 9));
        if (Math.random() < 0.28) { x += sx * step * 0.7; y += sy * step * 0.7; } // diagonal
        else if (hor) x += sx * step; else y += sy * step;
        pts.push([snap(x), snap(y)]);
        if (Math.random() < 0.55) hor = !hor;
      }
      const segs: number[] = []; let len = 0;
      for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); segs.push(d); len += d; }
      if (len < G * 4) continue;
      const pulses = Array.from({ length: Math.random() < 0.5 ? 1 : 2 }, () => ({ s: -Math.random() * len, v: 50 + Math.random() * 90, l: 26 + Math.random() * 40 }));
      traces.push({ pts, len, segs, pulses });
    }
    // trilhas e terminais (fixos)
    still.width = cv.width; still.height = cv.height;
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sctx.clearRect(0, 0, W, H);
    sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    sctx.strokeStyle = rgba(dark ? 0.26 : 0.34);
    sctx.lineWidth = 1.2;
    for (const t of traces) {
      sctx.beginPath(); t.pts.forEach(([x, y], k) => (k ? sctx.lineTo(x, y) : sctx.moveTo(x, y))); sctx.stroke();
      const [ex, ey] = t.pts[t.pts.length - 1];
      sctx.fillStyle = rgba(dark ? 0.4 : 0.5);
      sctx.beginPath(); sctx.arc(ex, ey, 2.4, 0, Math.PI * 2); sctx.fill();
      for (let k = 1; k < t.pts.length - 1; k++) if (k % 2 === 0) { sctx.beginPath(); sctx.arc(t.pts[k][0], t.pts[k][1], 1.4, 0, Math.PI * 2); sctx.fill(); }
    }
  };
  const at = (t: Trace, s: number): [number, number] => {
    let acc = 0;
    for (let k = 0; k < t.segs.length; k++) {
      if (s <= acc + t.segs[k]) { const f = (s - acc) / t.segs[k]; const a = t.pts[k], b = t.pts[k + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
      acc += t.segs[k];
    }
    return t.pts[t.pts.length - 1];
  };
  return {
    resize(w: number, h: number) { W = w; H = h; cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); build(); },
    draw(dt: number) {
      if (!W) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(still, 0, 0);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.lineCap = 'round';
      for (const t of traces) {
        for (const p of t.pulses) {
          p.s += p.v * dt;
          if (p.s - p.l > t.len) { p.s = -Math.random() * t.len * 0.8; p.v = 50 + Math.random() * 90; }
          if (p.s <= 0) continue;
          // pulso: um trecho curto mais claro na ponta, esmaecendo para trás
          const N = 8;
          for (let k = 0; k < N; k++) {
            const s1 = Math.max(0, p.s - (p.l * k) / N), s0 = Math.max(0, p.s - (p.l * (k + 1)) / N);
            if (s1 <= 0 || s0 >= t.len) continue;
            const [x0, y0] = at(t, Math.min(t.len, s0)), [x1, y1] = at(t, Math.min(t.len, s1));
            ctx.strokeStyle = rgba(0.9 - k * 0.1);
            ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          }
          const [hx, hy] = at(t, Math.min(t.len, p.s));
          ctx.fillStyle = `rgba(${Math.round(ar + (255 - ar) * 0.4)},${Math.round(ag + (255 - ag) * 0.4)},${Math.round(ab + (255 - ab) * 0.4)},0.95)`;
          ctx.beginPath(); ctx.arc(hx, hy, 1.9, 0, Math.PI * 2); ctx.fill();
        }
      }
    },
    dispose() { cv.remove(); },
  };
}

export function createViewer(host: HTMLElement, build: () => Model, opts: { bloom?: number; autoRotate?: boolean; heat?: boolean } = {}): ViewerHandle {
  const testMode = location.hash.startsWith('#hw3d-test');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: testMode });
  // telas de densidade 1 (comuns no Windows) serrilham mesmo com MSAA: renderiza em resolução maior
  renderer.setPixelRatio(Math.min(2, Math.max(window.devicePixelRatio, 1.6)));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const cv = renderer.domElement;
  // canvas maior que o espaço do 3D e atrás do conteúdo da página; as bordas somem em fade + desfoque
  const fadeMask = 'radial-gradient(closest-side, #000 52%, rgba(0,0,0,.55) 74%, transparent 100%)';
  Object.assign(cv.style, { position: 'absolute', inset: `-${OVERFLOW}px`, width: `calc(100% + ${OVERFLOW * 2}px)`, height: `calc(100% + ${OVERFLOW * 2}px)`, display: 'block', zIndex: '-1', pointerEvents: 'none', webkitMaskImage: fadeMask, maskImage: fadeMask });
  const blur = document.createElement('div');
  const ringMask = 'radial-gradient(closest-side, transparent 46%, #000 88%)';
  Object.assign(blur.style, { position: 'absolute', inset: `-${OVERFLOW}px`, zIndex: '-1', pointerEvents: 'none', backdropFilter: 'blur(22px)', webkitBackdropFilter: 'blur(22px)', webkitMaskImage: ringMask, maskImage: ringMask });
  // fundo tecnológico por trás do 3D (degradê, brilho na cor de destaque e grade), também em fade por baixo do conteúdo
  const back = document.createElement('div');
  back.className = 'hw-backdrop';
  Object.assign(back.style, { position: 'absolute', inset: `-${OVERFLOW}px`, zIndex: '-1', pointerEvents: 'none', webkitMaskImage: fadeMask, maskImage: fadeMask });
  const circuit = circuitLayer(back);
  host.appendChild(back); host.appendChild(cv); host.appendChild(blur);
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  (scene as any).environmentIntensity = 0.35; // reflexo bem leve
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);

  const key = new THREE.DirectionalLight(0xffffff, 1.35); key.position.set(2, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.radius = 4; scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd2ff, 0.5); rim.position.set(-3, 1.5, -2); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x20242c, 0.35));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.22 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const model = build();
  matte(model.group);
  // centraliza e apoia no chão
  const bb = new THREE.Box3().setFromObject(model.group);
  const center = bb.getCenter(new THREE.Vector3()); const size = bb.getSize(new THREE.Vector3());
  model.group.position.sub(new THREE.Vector3(center.x, bb.min.y, center.z));
  floor.position.y = 0;
  scene.add(model.group);
  const radius = Math.max(size.x, size.y, size.z);
  const baseDist = model.focus?.distance ?? radius * 2.1;
  const baseTarget = new THREE.Vector3(...(model.focus?.target ?? [0, size.y * 0.45, 0]));
  const camH = model.focus?.height ?? size.y * 0.65 + radius * 0.35;

  const live: Live = { accent: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3ddc97') };
  void opts;

  // ---------- câmera automática ----------
  // Dois tempos, em loop: TROCA rápida (~1,2 s) para um novo ângulo, com arranque forte, e ESTABILIZAÇÃO lenta
  // (3,5–5 s) em que a câmera continua andando devagar (girando, aproximando ou subindo um pouco). A troca é uma
  // curva Hermite que sai com a velocidade da deriva atual e chega com a velocidade da próxima: nunca para.
  // keepWhole (notebook): sem planos rentes de perto, para o aparelho não sair do quadro.
  const keepWhole = !!model.orbit?.keepWhole;
  const az0 = model.orbit?.start ?? -0.6;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const sign = () => (Math.random() < 0.5 ? -1 : 1);
  type Pose = [number, number, number, number, number, number]; // az, el, dist, tx, ty, tz
  // 16 planos em volta da FRENTE do componente (até ±80° para cada lado), com bastante aproximação; a parte de
  // trás quase não aparece (só um plano raro das costas da tampa no notebook). Evita repetir os últimos 4.
  const front = az0 + (keepWhole ? 0.45 : 0);
  type Shot = { name: string; w: number; make: (s: number) => { daz: number; el: number; dist: number; tgt: [number, number, number] } };
  const S: Shot[] = [
    { name: 'hero', w: 1.2, make: (s) => ({ daz: s * rnd(0.55, 0.8), el: rnd(0.22, 0.36), dist: rnd(0.95, 1.05), tgt: mid() }) },
    { name: 'frente', w: 1, make: () => ({ daz: rnd(-0.12, 0.12), el: rnd(0.1, 0.22), dist: rnd(0.9, 1.0), tgt: mid() }) },
    { name: 'cima', w: 1, make: (s) => ({ daz: s * rnd(0.1, 0.4), el: rnd(0.95, 1.08), dist: rnd(0.95, 1.05), tgt: mid() }) },
    { name: 'alto 3/4', w: 1, make: (s) => ({ daz: s * rnd(0.7, 1.0), el: rnd(0.6, 0.78), dist: rnd(0.85, 0.95), tgt: mid() }) },
    { name: 'baixo', w: 0.9, make: (s) => ({ daz: s * rnd(0.3, 0.7), el: rnd(keepWhole ? 0.05 : 0.0, 0.08), dist: rnd(0.85, 0.95), tgt: mid() }) },
    { name: 'perfil', w: 0.8, make: (s) => ({ daz: s * rnd(1.25, 1.4), el: rnd(0.1, 0.2), dist: rnd(0.9, 1.0), tgt: mid() }) },
    { name: 'aberto', w: 0.8, make: (s) => ({ daz: s * rnd(0.3, 0.6), el: rnd(0.38, 0.5), dist: rnd(1.25, 1.4), tgt: mid() }) },
    { name: 'detalhe centro', w: 1.3, make: (s) => ({ daz: s * rnd(0.1, 0.5), el: rnd(0.3, 0.55), dist: rnd(0.38, 0.46), tgt: [rnd(-0.1, 0.1) * size.x, rnd(0.35, 0.65) * size.y, rnd(-0.1, 0.1) * size.z] }) },
    { name: 'detalhe esquerda', w: 1.1, make: () => ({ daz: -rnd(0.3, 0.8), el: rnd(0.2, 0.45), dist: rnd(0.38, 0.46), tgt: [-rnd(0.18, 0.32) * size.x, rnd(0.25, 0.7) * size.y, rnd(-0.15, 0.2) * size.z] }) },
    { name: 'detalhe direita', w: 1.1, make: () => ({ daz: rnd(0.3, 0.8), el: rnd(0.2, 0.45), dist: rnd(0.38, 0.46), tgt: [rnd(0.18, 0.32) * size.x, rnd(0.25, 0.7) * size.y, rnd(-0.15, 0.2) * size.z] }) },
    { name: 'macro de cima', w: 1, make: (s) => ({ daz: s * rnd(0.05, 0.35), el: rnd(0.8, 0.95), dist: rnd(0.34, 0.42), tgt: [rnd(-0.2, 0.2) * size.x, rnd(0.4, 0.8) * size.y, rnd(-0.15, 0.15) * size.z] }) },
    { name: 'rasante', w: 1, make: (s) => ({ daz: s * rnd(0.7, 1.1), el: rnd(0.05, 0.14), dist: rnd(0.44, 0.52), tgt: [rnd(-0.2, 0.2) * size.x, rnd(0.3, 0.6) * size.y, rnd(0, 0.25) * size.z] }) },
    { name: 'mergulho', w: 0.9, make: (s) => ({ daz: s * rnd(0.25, 0.55), el: rnd(0.5, 0.65), dist: rnd(0.4, 0.48), tgt: [rnd(-0.15, 0.15) * size.x, rnd(0.35, 0.7) * size.y, rnd(-0.1, 0.15) * size.z] }) },
    { name: 'frente perto', w: 1, make: () => ({ daz: rnd(-0.15, 0.15), el: rnd(0.18, 0.32), dist: rnd(0.42, 0.5), tgt: [rnd(-0.12, 0.12) * size.x, rnd(0.4, 0.7) * size.y, rnd(0, 0.2) * size.z] }) },
    { name: 'canto', w: 0.9, make: (s) => ({ daz: s * rnd(0.85, 1.15), el: rnd(0.3, 0.45), dist: rnd(0.46, 0.54), tgt: [s * rnd(0.15, 0.3) * size.x, rnd(0.3, 0.6) * size.y, rnd(0.1, 0.25) * size.z] }) },
    { name: 'lateral alta', w: 0.8, make: (s) => ({ daz: s * rnd(1.1, 1.35), el: rnd(0.45, 0.62), dist: rnd(0.8, 0.95), tgt: mid() }) },
  ];
  // notebook: os zooms vêm dos pontos de interesse (tela, teclas, portas); sem aproximações genéricas que o cortam
  if (keepWhole) for (let i = S.length - 1; i >= 0; i--) if (/detalhe|macro|rasante|mergulho|perto|canto/.test(S[i].name)) S.splice(i, 1);
  // zoom grande nos pontos de interesse do modelo: cada um conta como um plano próprio
  // no notebook os zooms ficam mais afastados e variam bastante (nem todos perto); nos outros, aproximação firme
  (model.pois || []).forEach((poi, i) => S.push({ name: 'poi' + i, w: keepWhole ? 0.8 : 1.4, make: () => {
    const w = typeof poi.at === 'function' ? poi.at() : new THREE.Vector3(...poi.at).add(model.group.position);
    return { daz: (poi.az ?? rnd(-0.3, 0.3)) + rnd(-0.12, 0.12), el: (poi.el ?? 0.3) + rnd(-0.05, 0.06), dist: (poi.d * 1.8 * (keepWhole ? 1.9 * rnd(0.85, 1.5) : rnd(0.92, 1.1))) / (baseDist * fovFit), tgt: [w.x, w.y, w.z] };
  } }));
  if (keepWhole) S.push({ name: 'costas', w: 0.35, make: (s) => ({ daz: Math.PI + s * rnd(0.3, 0.6), el: rnd(0.35, 0.55), dist: rnd(1.0, 1.12), tgt: mid() }) });
  const recent: string[] = [];
  const mid = (): [number, number, number] => [baseTarget.x, baseTarget.y, baseTarget.z];
  /** novo plano: pose de chegada e a deriva lenta que ele terá depois de chegar (unidades por segundo) */
  const nextShot = (prev: Pose): { pose: Pose; drift: Pose } => {
    const opts = S.filter((x) => !recent.includes(x.name));
    let r = Math.random() * opts.reduce((a, x) => a + x.w, 0), shot = opts[0];
    for (const x of opts) { r -= x.w; if (r <= 0) { shot = x; break; } }
    recent.push(shot.name); if (recent.length > 4) recent.shift();
    // lado oposto ao atual na maioria das vezes, para a troca cruzar a frente
    const side = Math.sign(prev[0] - front) || 1;
    const sg = Math.random() < 0.7 ? -side : side;
    const m = shot.make(sg);
    // peças em pé (placa-mãe): sem vista de cima nem de perfil, que só mostram a borda
    if (model.orbit?.maxEl !== undefined) m.el = Math.min(m.el, model.orbit.maxEl);
    if (model.orbit?.span !== undefined && shot.name !== 'costas') m.daz = Math.max(-model.orbit.span, Math.min(model.orbit.span, m.daz));
    let az = front + m.daz;
    // a câmera vai pelo caminho mais curto e nunca dá a volta por trás (exceto no plano das costas)
    while (az - prev[0] > Math.PI) az -= Math.PI * 2; while (az - prev[0] < -Math.PI) az += Math.PI * 2;
    const back = shot.name === 'costas';
    // a estabilização segue no mesmo sentido do movimento da troca, mais devagar (sem voltar)
    const zoom = m.dist < 0.55;
    const drift: Pose = [(Math.sign(az - prev[0]) || sg) * (zoom ? rnd(0.02, 0.045) : rnd(0.05, 0.1)), rnd(-0.01, 0.012), zoom ? -m.dist * rnd(0.025, 0.045) : keepWhole ? rnd(-0.006, 0.006) : rnd(-0.018, 0.004), 0, 0, 0];
    void back;
    return { pose: [az, m.el, m.dist, m.tgt[0], m.tgt[1], m.tgt[2]], drift };
  };
  const m0 = mid();
  let cur: Pose = [az0, 0.25, keepWhole ? 1.05 : 1.0, m0[0], m0[1], m0[2]];
  let vel: Pose = [0.07, 0, 0, 0, 0, 0];
  let phase: 'hold' | 'cut' = 'hold', segT = 0, segDur = rnd(3, 4);
  let cutFrom: Pose = cur, cutTo: Pose = cur, vFrom: Pose = vel, vTo: Pose = vel;
  const hermite = (p1: number, p2: number, m1: number, m2: number, T: number, u: number) => {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * T * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * T * m2;
  };
  let fovFit = 1; // o canvas é maior que o espaço do 3D: afasta a câmera na mesma proporção para manter o tamanho

  const resize = () => {
    const hw = host.clientWidth || 1, hh = host.clientHeight || 1;
    const w = hw + OVERFLOW * 2, h = hh + OVERFLOW * 2;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    fovFit = h / hh;
    circuit.resize(w, h);
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  let visible = true;
  const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; }, { threshold: 0.01 }); io.observe(host);
  let raf = 0, last = performance.now(), t = 0, alive = true;
  const step = (dt: number) => {
    t += dt;
    segT += dt;
    if (segT >= segDur) {
      segT = 0;
      if (phase === 'hold') {
        const n = nextShot(cur);
        cutFrom = [...cur] as Pose; cutTo = n.pose; vFrom = [...vel] as Pose; vTo = n.drift;
        phase = 'cut'; segDur = rnd(1.0, 1.4);
      } else { cur = [...cutTo] as Pose; vel = [...vTo] as Pose; phase = 'hold'; segDur = rnd(3.5, 5); }
    }
    if (phase === 'cut') {
      const u = Math.min(1, segT / segDur);
      for (let k = 0; k < 6; k++) cur[k] = hermite(cutFrom[k], cutTo[k], vFrom[k], vTo[k], segDur, u);
    } else {
      for (let k = 0; k < 6; k++) cur[k] += vel[k] * dt; // estabilização: segue andando devagar
      const span = model.orbit?.span ?? 1.45;
      if (recent[recent.length - 1] !== 'costas') cur[0] = Math.max(front - span, Math.min(front + span, cur[0]));
    }
    const az = cur[0], el = Math.max(-0.05, Math.min(1.1, cur[1])), dk = Math.max(0.05, cur[2]);
    const dist = baseDist * fovFit * dk;
    const tgt = new THREE.Vector3(cur[3], cur[4], cur[5]);
    // a altura acima do foco cresce junto com a distância: o ângulo de visão se mantém
    camera.position.set(tgt.x + Math.sin(az) * dist * Math.cos(el), tgt.y + (camH - baseTarget.y) * fovFit * dk + Math.sin(el) * dist, tgt.z + Math.cos(az) * dist * Math.cos(el));
    circuit.draw(dt);
    camera.lookAt(tgt);
    model.update?.(live, t, dt);
    renderer.render(scene, camera);
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
      scene.traverse((o: any) => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((m: any) => { Object.values(m).forEach((v: any) => v?.isTexture && v.dispose()); m.dispose?.(); }); });
      pmrem.dispose(); renderer.dispose(); cv.remove(); blur.remove(); back.remove(); circuit.dispose();
    },
  };
}
