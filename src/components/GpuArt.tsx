// Foto da placa de vídeo com as ventoinhas girando na rotação real, na tela Ventoinhas.
// As fotos ficam em public/gpus/ (cedidas pela TechPowerUp), já recortadas e sem o logotipo do miolo. O arquivo
// gpus.json traz, para cada modelo, o tamanho da foto, a área da placa e o centro e o raio de cada ventoinha.
// Dois jeitos de mostrar:
// - GpuTileArt: no cartão pequeno, a placa em 3D, de perto e em perspectiva. Um único desenhista WebGL faz a imagem
//   de todos os cartões, um de cada vez, porque o navegador limita quantos desenhistas WebGL podem existir juntos.
// - GpuHero: no cabeçalho do painel de edição, a placa de frente, como na foto, grande e centralizada, mostrando a
//   metade de cima. Esse é desenhado em 2D, porque não precisa de perspectiva.
// Nos dois, a ventoinha é um recorte redondo da própria foto que gira no eixo do miolo. Para parecer com o que o olho
// vê, cada quadro mistura várias posições do giro daquele instante (borrão de movimento).
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface GpuCard { name: string; file: string; w: number; h: number; box: { x0: number; y0: number; x1: number; y1: number }; fans: { cx: number; cy: number; r: number }[] }

const BASE = './gpus/';
let catalog: Promise<GpuCard[]> | null = null;
const loadCatalog = () => (catalog ??= fetch(BASE + 'gpus.json').then((r) => r.json()).then((j) => j.cards as GpuCard[]).catch(() => []));

// nome do sensor (por exemplo, "AMD Radeon RX 6800 XT") para a foto: vale o modelo mais comprido cujas palavras
// aparecem todas no nome. A quantidade de memória no fim do nome da foto ("12 GB") é opcional.
const words = (s: string) => s.toLowerCase().replace(/\(tm\)|®|™/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !['amd', 'nvidia', 'intel', 'graphics'].includes(w));
export function matchGpu(hw: string, cards: GpuCard[]): GpuCard | null {
  const have = new Set(words(hw));
  if (have.has('laptop') || have.has('mobile') || have.has('max') && have.has('q')) return null;
  let best: GpuCard | null = null, bestLen = 0;
  for (const c of cards) {
    const full = words(c.name), short = full.join(' ').replace(/ \d+ gb$/, '').split(' ');
    for (const ws of [full, short]) if (ws.every((w) => have.has(w)) && ws.length > bestLen) { best = c; bestLen = ws.length; }
  }
  return best;
}
/** Todas as placas com foto (usado pela galeria da prévia das ventoinhas). */
export function useGpuCatalog(): GpuCard[] | null {
  const [list, setList] = useState<GpuCard[] | null>(null);
  useEffect(() => { let alive = true; loadCatalog().then((cs) => alive && setList(cs)); return () => { alive = false; }; }, []);
  return list;
}
export function useGpuCard(hw: string | undefined): GpuCard | null {
  const [card, setCard] = useState<GpuCard | null>(null);
  useEffect(() => { let alive = true; if (!hw) { setCard(null); return; } loadCatalog().then((cs) => alive && setCard(matchGpu(hw, cs))); return () => { alive = false; }; }, [hw]);
  return card;
}

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(file: string) {
  let p = images.get(file);
  if (!p) { p = new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = BASE + file; }); images.set(file, p); }
  return p;
}

/** Ângulo da ventoinha: gira na rotação real (rpm/60 voltas por segundo); o RPM mostrado chega ao lido em menos de 1 segundo. */
/** maxStep (opcional): o máximo que as pás andam em cada imagem da tela. Em rotação alta, a pá daria quase uma volta
 *  entre duas imagens e o borrão viraria um disco parado. O passo precisa ficar abaixo da metade do espaço entre duas
 *  pás; senão o olho vê as pás andando para trás aos trancos (o efeito da roda de carroça). blur aumenta o rastro em
 *  relação ao passo, até spreadMax, para o giro continuar parecendo rápido. */
export function spinner(initial: number, maxStep = Infinity, blur = 1, spreadMax = Math.PI * 2) {
  let rpm = initial, angle = Math.random() * 6;
  return (target: number, dt: number) => {
    rpm += (target - rpm) * Math.min(1, dt * 3);
    const w = (Math.max(0, rpm) / 60) * Math.PI * 2;
    const step = Math.min(w * dt, maxStep);
    angle -= step;
    return { angle, spread: Math.min(step * blur, spreadMax, Math.PI * 2) };
  };
}
// A placa de vídeo gira na velocidade real, sem limite de passo. O borrão cobre todo o caminho que a pá anda entre duas
// imagens da tela, como numa câmera. Assim, em rotação alta a ventoinha vira um disco borrado, igual a uma ventoinha de
// verdade, e o olho não vê as pás andando para trás. Com 32 cópias, o borrão fica liso mesmo quando a pá anda quase uma volta.
const SAMPLES = 32;
const realSpin = (rpm: number) => spinner(rpm, Infinity, 1, Math.PI * 2);

// ---------- fundo tecnológico atrás da placa grande ----------
// Uma malha de pontos em ondas, na cor de destaque, que some perto das laterais.
export function techBackground(g: CanvasRenderingContext2D, W: number, H: number, t: number, rgb: string, cx: number, cy: number) {
  const edge = (x: number) => Math.max(0, Math.min(1, x / (W * 0.12), (W - x) / (W * 0.12)));
  g.save(); g.globalCompositeOperation = 'lighter';
  // 1. malha de pontos em ondas, com as fileiras de trás menores e mais apagadas
  const rows = 14, step = 11;
  for (let j = 0; j < rows; j++) {
    const depth = 0.35 + (0.65 * j) / (rows - 1), y0 = H * 0.06 + j * ((H * 0.98) / rows);
    for (let x = 0; x <= W; x += step) {
      const wv = Math.sin(x * 0.011 + t * 0.9 + j * 0.55) * 9 + Math.sin(x * 0.027 - t * 1.4 + j * 1.3) * 4;
      const lift = (wv + 13) / 26;
      const a = Math.min(0.95, edge(x) * depth * (0.35 + 0.75 * lift));
      if (a < 0.02) continue;
      g.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
      g.beginPath(); g.arc(x + Math.sin(t * 0.3 + j) * 6, y0 + wv * depth, 0.5 + 1.1 * lift * depth, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}
// cor de destaque do tema em "r,g,b", lida do próprio elemento
export function accentRgb(el: HTMLElement) {
  const g = document.createElement('canvas').getContext('2d')!;
  g.fillStyle = getComputedStyle(el).getPropertyValue('--accent').trim() || '#2fd6a0';
  const c = g.fillStyle as string;
  if (c.startsWith('#')) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',');
  return (c.match(/\d+/g) || ['47', '214', '160']).slice(0, 3).join(',');
}

// ---------- cabeçalho do painel: a placa de frente ----------
/** Largura da janela a partir da qual a placa grande fica à esquerda, com o nome ao lado (igual ao min-[1500px] das classes). */
export const WIDE = 1500;
export function GpuHero({ card, rpm, height = 190 }: { card: GpuCard; rpm?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rpmRef = useRef(rpm || 0); rpmRef.current = rpm || 0;
  useEffect(() => {
    const cv = ref.current!; const g = cv.getContext('2d')!;
    let raf = 0, alive = true, visible = true, last = performance.now();
    const spin = realSpin(rpmRef.current);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(cv);
    const rgb = accentRgb(cv), t0 = performance.now();
    loadImage(card.file).then((img) => {
      if (!alive) return;
      // cada ventoinha vira um recorte redondo da foto, no tamanho original
      const sprites = card.fans.map((f) => {
        const s = document.createElement('canvas'); s.width = s.height = Math.ceil(f.r * 2);
        const sg = s.getContext('2d')!; sg.drawImage(img, f.cx - f.r, f.cy - f.r, f.r * 2, f.r * 2, 0, 0, f.r * 2, f.r * 2);
        sg.globalCompositeOperation = 'destination-in'; sg.beginPath(); sg.arc(f.r, f.r, f.r, 0, Math.PI * 2); sg.fill();
        return s;
      });
      const frame = (now: number) => {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        const { angle, spread } = spin(rpmRef.current, dt);
        if (!visible || document.hidden) return;
        const dpr = Math.min(2, devicePixelRatio), W = cv.clientWidth, H = cv.clientHeight;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
        // tela larga: a placa inteira, alinhada à esquerda com o resto da página, sumindo para a direita.
        // tela estreita: a placa no centro, sumindo para baixo (a máscara do bloco troca junto, pela classe gpu-hero)
        const b = card.box, bw = b.x1 - b.x0, bh = b.y1 - b.y0, side = window.innerWidth >= WIDE;
        const s = side ? Math.min((H * 0.84) / bh, (W * 0.55) / bw) : Math.min((H * 0.86) / bh, (W * 0.62) / bw);
        const ox = side ? -b.x0 * s : W / 2 - (b.x0 + bw / 2) * s, oy = H / 2 - (b.y0 + bh / 2) * s;
        techBackground(g, W, H, (now - t0) / 1000, rgb, W / 2, H * 0.75);
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, ox, oy, card.w * s, card.h * s);
        card.fans.forEach((f, i) => {
          g.save(); g.translate(ox + f.cx * s, oy + f.cy * s);
          for (let k = 1; k <= SAMPLES; k++) {
            g.globalAlpha = 1 / k;
            g.rotate(k === 1 ? angle : spread / SAMPLES);
            g.drawImage(sprites[i], -f.r * s, -f.r * s, f.r * 2 * s, f.r * 2 * s);
          }
          g.restore();
        });
      };
      raf = requestAnimationFrame(frame);
    });
    return () => { alive = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, [card]);
  return (
    <div className="pointer-events-none relative w-full" style={{ height }}>
      {/* a placa some para baixo (tela estreita) ou para a direita (tela larga), onde ficam o nome e o RPM */}
      <div className="gpu-hero absolute inset-0 overflow-hidden">
        <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}

// ---------- cartão pequeno: a placa em 3D, com um desenhista só para todos ----------
interface TileEntry { cv: HTMLCanvasElement; rpm: () => number; visible: boolean; view?: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; fans: THREE.Group[]; target: THREE.Vector3; r: number; seed: number }; spin: ReturnType<typeof spinner> }
const tiles = new Set<TileEntry>();
let renderer: THREE.WebGLRenderer | null = null, loopOn = false, lastT = 0;
const texCache = new Map<string, Promise<THREE.Texture>>();
function texture(file: string) {
  let p = texCache.get(file);
  if (!p) { p = loadImage(file).then((img) => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; return t; }); texCache.set(file, p); }
  return p;
}

async function buildView(card: GpuCard) {
  const tex = await texture(card.file);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223030, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-500, 600, 900); scene.add(key);
  const P = (x: number, y: number) => new THREE.Vector2(x - card.w / 2, card.h / 2 - y);
  // corpo com espessura, um pouco menor que a silhueta para não aparecer nos cantos arredondados
  const b = card.box, bw = b.x1 - b.x0, bh = b.y1 - b.y0, depth = bh * 0.3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.96, bh * 0.9, depth), new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.6, roughness: 0.45 }));
  const bc = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); body.position.set(bc.x, bc.y, -depth / 2 - 1); scene.add(body);
  // a frente e as ventoinhas mostram a foto exatamente como ela é (a luz do estúdio já está na foto)
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(card.w, card.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })));
  const fans: THREE.Group[] = [];
  for (const f of card.fans) {
    const geo = new THREE.CircleGeometry(f.r, 72);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (f.cx + pos.getX(i)) / card.w, 1 - (f.cy - pos.getY(i)) / card.h);
    const c = P(f.cx, f.cy), holder = new THREE.Group(); holder.position.set(c.x, c.y, 3); scene.add(holder);
    for (let k = 1; k <= SAMPLES; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: k > 1, opacity: 1 / k, depthWrite: k === 1 }));
      m.renderOrder = 10 + k; holder.add(m);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(f.r - 2, f.r + 5, 72), new THREE.MeshBasicMaterial({ color: 0x0c0d0f }));
    ring.position.set(c.x, c.y, 1.5); scene.add(ring);
    fans.push(holder);
  }
  const focus = card.fans[0];
  const t = P(focus.cx, focus.cy);
  return { scene, camera: new THREE.PerspectiveCamera(30, 1, 10, 8000), fans, target: new THREE.Vector3(t.x, t.y, -depth * 0.2), r: focus.r, seed: Math.random() * 6 };
}

function loop(now: number) {
  if (!tiles.size) { loopOn = false; return; }
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (document.hidden || !renderer) return;
  const dpr = Math.min(2, devicePixelRatio);
  for (const e of tiles) {
    const { angle, spread } = e.spin(e.rpm(), dt);
    if (!e.visible || !e.view) continue;
    const W = e.cv.clientWidth, H = e.cv.clientHeight; if (!W || !H) continue;
    const size = renderer.getSize(new THREE.Vector2());
    if (size.x !== W || size.y !== H) renderer.setSize(W, H, false);
    const v = e.view, cam = v.camera;
    for (const h of v.fans) h.children.forEach((m, k) => { m.rotation.z = angle + spread * (k / SAMPLES); });
    // câmera de perto, da esquerda para a direita: a primeira ventoinha com o centro a 15% da largura do cartão, então a
    // ponta da placa sai pela borda da esquerda e não sobra espaço vazio
    cam.aspect = W / H;
    const d = (v.r * (H / 2)) / (H * 0.4 * Math.tan((cam.fov * Math.PI) / 360));
    const yaw = -0.6 + Math.sin(now * 0.00035 + v.seed) * 0.04, pitch = 0.24;
    cam.position.set(v.target.x + Math.sin(yaw) * Math.cos(pitch) * d, v.target.y + Math.sin(pitch) * d, v.target.z + Math.cos(yaw) * Math.cos(pitch) * d);
    cam.lookAt(v.target);
    cam.setViewOffset(W, H, W * 0.35, 0, W, H);
    cam.updateProjectionMatrix();
    renderer.render(v.scene, cam);
    if (e.cv.width !== Math.round(W * dpr)) { e.cv.width = Math.round(W * dpr); e.cv.height = Math.round(H * dpr); }
    const g = e.cv.getContext('2d')!; g.clearRect(0, 0, e.cv.width, e.cv.height); g.drawImage(renderer.domElement, 0, 0, e.cv.width, e.cv.height);
  }
}

export function GpuTileArt({ card, rpm }: { card: GpuCard; rpm?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rpmRef = useRef(rpm || 0); rpmRef.current = rpm || 0;
  useEffect(() => {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const e: TileEntry = { cv: ref.current!, rpm: () => rpmRef.current, visible: true, spin: realSpin(rpmRef.current) };
    let alive = true;
    buildView(card).then((v) => { if (alive) e.view = v; });
    const io = new IntersectionObserver(([x]) => { e.visible = x.isIntersecting; });
    io.observe(e.cv);
    tiles.add(e);
    if (!loopOn) { loopOn = true; lastT = performance.now(); requestAnimationFrame(loop); }
    return () => { alive = false; tiles.delete(e); io.disconnect(); };
  }, [card]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
