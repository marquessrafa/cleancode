// Modelos 3D de notebooks e Macs (sem marcas nem logotipos):
// - chip integrado (SoC) do Apple Silicon com CPU, GPU, Neural Engine e memória unificada no mesmo pacote;
// - processador BGA de notebook (soldado na placa) com GPU integrada no próprio chip;
// - GPU dedicada de notebook (chip na placa com memórias GDDR em volta);
// - memória SO-DIMM e memória soldada (LPDDR);
// - placa lógica de MacBook e placa-mãe de notebook Windows;
// - armazenamento integrado (chips NAND soldados, como nos Macs).
// As regiões do chip acendem conforme o uso real: cada núcleo da CPU pela sua carga, a GPU pelo uso.
import { THREE, Model, Live, mat, rbox, box, cyl, slab, canvasTex, pcbTexture, labelTexture, fan } from './core';
import { t as tr } from '../lib/i18n';

const accentHex = (l: Live) => '#' + l.accent.getHexString();
type Highlight = 'cpu' | 'gpu' | 'mem' | 'npu' | 'none';
type Rect = [number, number, number, number]; // x, y, w, h normalizados (0..1), origem no canto superior esquerdo

// ---------- materiais próprios ----------
const silicon = (map: THREE.Texture) => new THREE.MeshPhysicalMaterial({ map, metalness: 0.45, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.22, iridescence: 0.45, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 520] });
const epoxy = (map?: THREE.Texture) => new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0x0d0e10, map: map || null, metalness: 0.15, roughness: 0.62 });
const copper = () => new THREE.MeshStandardMaterial({ color: 0xc8794a, metalness: 1, roughness: 0.28 });
const shieldMat = () => new THREE.MeshStandardMaterial({ color: 0x7a8088, metalness: 1, roughness: 0.48 });
const glowAdd = (color = 0xffffff) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

function chipLabel(lines: string[], w = 512, h = 384, bg = '#0e0f12', fg = 'rgba(205,210,218,0.75)') {
  return canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    // textura fosca de epóxi
    for (let i = 0; i < 1600; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = fg; c.textBaseline = 'top';
    lines.forEach((t, i) => { c.font = `${i === 0 ? 600 : 500} ${i === 0 ? h * 0.13 : h * 0.1}px Menlo, Consolas, monospace`; c.fillText(t, w * 0.1, h * 0.18 + i * h * 0.17); });
    c.beginPath(); c.arc(w * 0.1, h * 0.86, h * 0.035, 0, Math.PI * 2); c.fill(); // marca do pino 1
  });
}

// ---------- desenho do die (planta do chip) ----------
interface DieLayout { cores: { r: Rect; e: boolean }[]; gpu: Rect[]; npu: Rect[]; mem: Rect[]; cache: Rect[]; misc: Rect[] }
function grid(r: Rect, cols: number, rows: number, n: number, pad = 0.12): Rect[] {
  const out: Rect[] = []; const cw = r[2] / cols, ch = r[3] / rows;
  for (let i = 0; i < n; i++) { const cx = i % cols, cy = Math.floor(i / cols); out.push([r[0] + cx * cw + cw * pad / 2, r[1] + cy * ch + ch * pad / 2, cw * (1 - pad), ch * (1 - pad)]); }
  return out;
}
function appleLayout(p: number, e: number, gpuCores: number): DieLayout {
  const pc = Math.max(2, p), ec = Math.max(2, e), gc = Math.max(4, gpuCores);
  const pCols = Math.ceil(pc / 2), eCols = Math.ceil(ec / 2);
  const gCols = Math.ceil(Math.sqrt(gc * 1.6)), gRows = Math.ceil(gc / gCols);
  const cores = [
    ...grid([0.05, 0.56, 0.22, 0.24], eCols, 2, ec, 0.18).map((r) => ({ r, e: true })),
    ...grid([0.05, 0.08, 0.36, 0.34], pCols, 2, pc, 0.14).map((r) => ({ r, e: false })),
  ];
  return {
    cores, gpu: grid([0.46, 0.08, 0.5, 0.52], gCols, gRows, gc, 0.12), npu: grid([0.3, 0.56, 0.12, 0.24], 2, 4, 8, 0.2),
    mem: [[0.04, 0.015, 0.92, 0.035], [0.04, 0.95, 0.92, 0.035]], cache: [[0.05, 0.43, 0.36, 0.1], [0.46, 0.64, 0.5, 0.14]], misc: [[0.05, 0.83, 0.37, 0.1], [0.46, 0.81, 0.24, 0.12], [0.72, 0.81, 0.24, 0.12]],
  };
}
function x86Layout(cores: number, gpuCells: number): DieLayout {
  const n = Math.max(2, Math.min(24, cores)); const cols = Math.ceil(n / 2);
  return {
    cores: grid([0.18, 0.1, 0.46, 0.8], cols, 2, n, 0.16).map((r) => ({ r, e: false })),
    gpu: grid([0.67, 0.1, 0.29, 0.8], 2, Math.ceil(gpuCells / 2), gpuCells, 0.14), npu: [],
    mem: [[0.03, 0.1, 0.07, 0.8]], cache: [[0.18, 0.47, 0.46, 0.06]], misc: [[0.11, 0.1, 0.05, 0.8]],
  };
}
function dieTexture(L: DieLayout, size = 1024, aspect = 1) {
  const W = size, H = Math.round(size / aspect);
  return canvasTex(W, H, (c) => {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2a2f3a'); g.addColorStop(0.5, '#1b1f27'); g.addColorStop(1, '#262a34');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // malha fina de interconexão
    c.strokeStyle = 'rgba(160,175,200,0.06)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    const R = (r: Rect) => [r[0] * W, r[1] * H, r[2] * W, r[3] * H] as const;
    const block = (r: Rect, fill: string, stroke: string, detail: (x: number, y: number, w: number, h: number) => void) => { const [x, y, w, h] = R(r); c.fillStyle = fill; c.fillRect(x, y, w, h); detail(x, y, w, h); c.strokeStyle = stroke; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); };
    // cache: células regulares (SRAM)
    L.cache.forEach((r) => block(r, '#3a3f4c', 'rgba(255,255,255,0.12)', (x, y, w, h) => { c.fillStyle = 'rgba(200,210,230,0.12)'; for (let yy = y + 3; yy < y + h - 2; yy += 4) for (let xx = x + 3; xx < x + w - 2; xx += 4) c.fillRect(xx, yy, 2, 2); }));
    // núcleos da CPU: lógica + L1 no canto
    L.cores.forEach(({ r, e }) => block(r, e ? '#2c3442' : '#323a4a', 'rgba(170,200,255,0.25)', (x, y, w, h) => {
      c.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 26; i++) c.fillRect(x + Math.random() * w * 0.8, y + Math.random() * h * 0.8, w * 0.2 * Math.random(), h * 0.12);
      c.fillStyle = '#454b5a'; c.fillRect(x + w * 0.62, y + h * 0.08, w * 0.3, h * 0.36);
      c.fillStyle = 'rgba(200,210,230,0.14)'; for (let yy = y + h * 0.1; yy < y + h * 0.42; yy += 3) c.fillRect(x + w * 0.64, yy, w * 0.26, 1);
    }));
    // GPU: núcleos com unidades de execução em listras
    L.gpu.forEach((r) => block(r, '#2a3140', 'rgba(150,255,210,0.18)', (x, y, w, h) => { c.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = 0; i < 4; i++) c.fillRect(x + w * 0.1, y + h * (0.12 + i * 0.21), w * 0.8, h * 0.12); }));
    L.npu.forEach((r) => block(r, '#30293f', 'rgba(210,170,255,0.22)', () => undefined));
    L.mem.forEach((r) => block(r, '#3d3424', 'rgba(255,210,120,0.25)', (x, y, w, h) => { c.fillStyle = 'rgba(255,220,150,0.18)'; for (let xx = x + 2; xx < x + w; xx += 7) c.fillRect(xx, y + 2, 3, h - 4); }));
    L.misc.forEach((r) => block(r, '#262c37', 'rgba(255,255,255,0.08)', (x, y, w, h) => { c.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 14; i++) c.fillRect(x + Math.random() * w * 0.85, y + Math.random() * h * 0.8, w * 0.15, h * 0.15); }));
    // anel de vedação na borda
    c.strokeStyle = 'rgba(210,190,140,0.35)'; c.lineWidth = 6; c.strokeRect(5, 5, W - 10, H - 10);
  });
}

// ---------- pacote do chip (reutilizado no SoC, na placa lógica e na placa do notebook) ----------
interface PackageOpts { vendor: 'apple' | 'intel' | 'amd'; pCores?: number; eCores?: number; cores?: number; gpuCores?: number; memChips?: number; memLabel?: string; highlight?: Highlight }
export function chipPackage(o: PackageOpts) {
  const g = new THREE.Group(); const apple = o.vendor === 'apple'; const hl = o.highlight || 'none';
  const memChips = apple ? Math.max(2, Math.min(4, o.memChips ?? 2)) : 0;
  const SW = apple ? (memChips > 2 ? 0.5 : 0.42) : 0.36, SD = apple ? 0.34 : 0.3;
  // substrato (verde-escuro no x86, preto no Apple Silicon) com moldura metálica
  const subMat = apple ? new THREE.MeshStandardMaterial({ map: pcbTexture('#101513', 'rgba(90,120,100,0.35)', 11, 512), metalness: 0.25, roughness: 0.55 }) : new THREE.MeshStandardMaterial({ color: 0x123423, metalness: 0.2, roughness: 0.5 });
  const sub = slab(SW, SD, 0.006, 0.01, subMat, 0.0015); sub.rotation.x = -Math.PI / 2; sub.position.y = 0.003; g.add(sub);
  if (apple) { const fm = shieldMat(); for (const [w, d, x, z] of [[SW, 0.008, 0, -SD / 2 + 0.004], [SW, 0.008, 0, SD / 2 - 0.004], [0.008, SD, -SW / 2 + 0.004, 0], [0.008, SD, SW / 2 - 0.004, 0]]) { const b = box(w, 0.004, d, fm); b.position.set(x, 0.0075, z); g.add(b); } }
  // die
  const dieW = apple ? 0.2 : 0.2, dieD = apple ? 0.165 : 0.11;
  const layout = apple ? appleLayout(o.pCores ?? 4, o.eCores ?? 4, o.gpuCores ?? 8) : x86Layout(o.cores ?? 8, o.vendor === 'amd' ? 12 : 8);
  const dieX = apple ? (memChips > 2 ? 0 : -SW * 0.17) : -0.02, dieZ = apple ? 0 : -0.035;
  const dieY = 0.0105;
  const die = box(dieW, 0.004, dieD, silicon(dieTexture(layout, 1024, dieW / dieD))); die.position.set(dieX, dieY - 0.002, dieZ); g.add(die);
  // segundo die (chipset/E/S) nos processadores Intel de notebook
  if (o.vendor === 'intel') { const pch = box(0.1, 0.004, 0.07, silicon(dieTexture({ cores: [], gpu: [], npu: [], mem: [[0.05, 0.05, 0.9, 0.12]], cache: [], misc: grid([0.05, 0.25, 0.9, 0.7], 4, 3, 12, 0.2) }, 512, 1.4))); pch.position.set(0.02, dieY - 0.002, 0.085); g.add(pch); }
  if (o.vendor === 'amd') { for (let i = 0; i < 3; i++) { const cap = box(0.012, 0.003, 0.006, mat.metal(0x8a8f96, 0.4)); cap.position.set(-0.08 + i * 0.05, 0.0075, 0.07); g.add(cap); } }
  // células acesas por cima do die
  const toWorld = (r: Rect, inset = 0) => { const w = r[2] * dieW, d = r[3] * dieD; return { x: dieX - dieW / 2 + (r[0] + r[2] / 2) * dieW, z: dieZ - dieD / 2 + (r[1] + r[3] / 2) * dieD, w: w - inset, d: d - inset }; };
  const cell = (r: Rect) => { const p = toWorld(r, 0.001); const m = glowAdd(); const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set(p.x, dieY + 0.0006, p.z); g.add(mesh); return m; };
  const coreCells = layout.cores.map((c) => ({ m: cell(c.r), e: c.e }));
  const gpuCells = layout.gpu.map(cell), npuCells = layout.npu.map(cell), memPhy = layout.mem.map(cell);
  // memória unificada no mesmo pacote (Apple Silicon)
  const memMats: THREE.MeshBasicMaterial[] = []; const traces: THREE.MeshBasicMaterial[] = [];
  if (apple) {
    const tex = chipLabel(['LPDDR5', o.memLabel || '', 'unificada']);
    const edgeTex = canvasTex(256, 320, (c) => { c.clearRect(0, 0, 256, 320); c.strokeStyle = '#fff'; c.lineWidth = 10; c.shadowColor = '#fff'; c.shadowBlur = 14; c.strokeRect(10, 10, 236, 300); });
    const spots: [number, number][] = memChips > 2 ? [[-SW * 0.38, -SD * 0.22], [-SW * 0.38, SD * 0.22], [SW * 0.38, -SD * 0.22], [SW * 0.38, SD * 0.22]] : [[SW * 0.27, -SD * 0.22], [SW * 0.27, SD * 0.22]];
    spots.forEach(([x, z]) => {
      const chip = rbox(0.085, 0.009, 0.11, 0.003, epoxy()); chip.position.set(x, 0.0105, z); g.add(chip);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.105), epoxy(tex)); top.rotation.x = -Math.PI / 2; top.rotation.z = Math.PI / 2; top.position.set(x, 0.0151, z); g.add(top);
      const m = glowAdd(); const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.102, 0.128), m); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.0062, z); g.add(ring); memMats.push(m);
      // contorno aceso no topo do chip
      const em = glowAdd(); em.map = edgeTex; const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.082, 0.107), em); edge.rotation.x = -Math.PI / 2; edge.position.set(x, 0.0153, z); g.add(edge); memMats.push(em);
      // trilhas die ↔ memória
      for (let i = 0; i < 5; i++) { const tm = glowAdd(); const dx = x - dieX; const t = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(dx) - dieW / 2 - 0.04, 0.0016), tm); t.rotation.x = -Math.PI / 2; t.position.set(dieX + Math.sign(dx) * (dieW / 2 + (Math.abs(dx) - dieW / 2 - 0.04) / 2), 0.00625, z * 0.6 + (i - 2) * 0.006); g.add(t); traces.push(tm); }
    });
  }
  // capacitores SMD em volta
  const capMat = mat.metal(0x8b9097, 0.4), capDark = mat.dark(0x3a3128, 0.6);
  for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1; const c = box(0.008, 0.003, 0.004, i % 3 ? capMat : capDark); c.position.set(-SW * 0.42 + (i / 18) * SW * 0.84, 0.0075, side * SD * 0.44); g.add(c); }
  const pin1 = new THREE.Mesh(new THREE.CircleGeometry(0.008, 3), mat.gold()); pin1.rotation.x = -Math.PI / 2; pin1.position.set(-SW / 2 + 0.014, 0.0072, SD / 2 - 0.014); g.add(pin1);
  const dimOf = (k: Highlight) => (hl === 'none' ? 0.35 : hl === k ? 1 : 0.03);
  return {
    group: g, size: [SW, SD] as [number, number],
    update(live: Live, t: number) {
      const a = live.accent; const cores = live.cores || []; const eN = coreCells.filter((c) => c.e).length;
      coreCells.forEach((c, i) => {
        // ordem das cargas: núcleos de eficiência primeiro (como o macOS lista)
        const li = apple ? (c.e ? i : i) : i; const v = cores.length ? cores[li % cores.length] ?? 0 : live.load ?? 0.2;
        c.m.color.copy(a).multiplyScalar(1.6); c.m.opacity = (0.06 + v * 0.85) * dimOf('cpu') + (hl === 'cpu' ? Math.sin(t * 6 + i) * 0.02 : 0);
        void eN;
      });
      const gu = live.gpu ?? 0.15;
      gpuCells.forEach((m, i) => { m.color.set(0x52ffc4).lerp(a, 0.4).multiplyScalar(1.6); m.opacity = (0.05 + gu * (0.6 + 0.4 * Math.sin(t * 4 - i * 0.7))) * dimOf('gpu'); });
      npuCells.forEach((m, i) => { m.color.set(0xb98cff).multiplyScalar(1.5); m.opacity = (0.08 + 0.1 * Math.sin(t * 2 + i)) * dimOf('npu'); });
      const mu = live.mem ?? 0.4;
      memPhy.forEach((m) => { m.color.set(0xffc46b).multiplyScalar(1.5); m.opacity = (0.1 + mu * 0.6) * dimOf('mem'); });
      memMats.forEach((m, i) => { m.color.copy(a).multiplyScalar(2); m.opacity = Math.min(1, (0.35 + mu * 0.6 + Math.sin(t * 2.5 + i) * 0.08) * dimOf('mem')); });
      traces.forEach((m, i) => { m.color.copy(a).multiplyScalar(2); m.opacity = (0.15 + 0.55 * Math.max(0, Math.sin(t * 5 - i * 0.9))) * dimOf('mem'); });
    },
  };
}

/** Chip integrado (Mac) ou processador de notebook, com destaque para a parte da aba atual. */
export function socModel(o: PackageOpts): Model {
  const g = new THREE.Group(); const p = chipPackage(o); g.add(p.group);
  return { group: g, focus: { distance: 0.6, target: [0, 0.0, 0], height: 0.46 }, orbit: { range: 1.2 }, update: (l, t) => p.update(l, t) };
}

// ======================= GPU DEDICADA DE NOTEBOOK =======================
export function gpuChipModel(o: { memChips?: number; name?: string } = {}): Model {
  const g = new THREE.Group();
  const pcb = slab(0.56, 0.44, 0.006, 0.01, new THREE.MeshStandardMaterial({ map: pcbTexture('#0b0d0f', 'rgba(80,100,120,0.45)', 21, 1024), metalness: 0.3, roughness: 0.55 }), 0.001); pcb.rotation.x = -Math.PI / 2; g.add(pcb);
  const sub = slab(0.17, 0.17, 0.004, 0.006, new THREE.MeshStandardMaterial({ color: 0x14281d, metalness: 0.3, roughness: 0.5 }), 0.001); sub.rotation.x = -Math.PI / 2; sub.position.y = 0.006; g.add(sub);
  const smCols = 6, smRows = 6;
  const L: DieLayout = { cores: [], gpu: grid([0.08, 0.08, 0.84, 0.7], smCols, smRows, smCols * smRows, 0.16), npu: [], mem: [[0.03, 0.82, 0.94, 0.06], [0.03, 0.9, 0.94, 0.06]], cache: [[0.08, 0.78, 0.84, 0.035]], misc: [] };
  const dw = 0.11;
  const die = box(dw, 0.004, dw, silicon(dieTexture(L, 1024))); die.position.y = 0.0095; g.add(die);
  const cells = L.gpu.map((r) => { const m = glowAdd(); const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r[2] * dw, r[3] * dw), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set(-dw / 2 + (r[0] + r[2] / 2) * dw, 0.0118, -dw / 2 + (r[1] + r[3] / 2) * dw); g.add(mesh); return m; });
  // memórias GDDR em volta
  const n = Math.max(2, Math.min(8, o.memChips ?? 4)); const tex = chipLabel(['GDDR6', '16 Gb', '']);
  const spots: [number, number, number][] = [[-0.16, -0.08, 0], [-0.16, 0.08, 0], [0.16, -0.08, 0], [0.16, 0.08, 0], [-0.07, -0.16, 1], [0.07, -0.16, 1], [-0.07, 0.16, 1], [0.07, 0.16, 1]].slice(0, n) as any;
  const memGlow: THREE.MeshBasicMaterial[] = [];
  spots.forEach(([x, z, r]) => {
    const c = rbox(0.07, 0.008, 0.06, 0.002, epoxy()); c.position.set(x, 0.007, z); c.rotation.y = r ? Math.PI / 2 : 0; g.add(c);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.056), epoxy(tex)); top.rotation.x = -Math.PI / 2; top.rotation.z = r ? Math.PI / 2 : 0; top.position.set(x, 0.0111, z); g.add(top);
    const m = glowAdd(); const halo = new THREE.Mesh(new THREE.PlaneGeometry(r ? 0.066 : 0.076, r ? 0.076 : 0.066), m); halo.rotation.x = -Math.PI / 2; halo.position.set(x, 0.0032, z); g.add(halo); memGlow.push(m);
  });
  // reguladores (indutores) e capacitores de polímero
  const ind = mat.dark(0x2a2c31, 0.5);
  for (let i = 0; i < 8; i++) { const b = rbox(0.022, 0.014, 0.022, 0.003, ind); b.position.set(-0.24 + i * 0.03, 0.009, -0.19); g.add(b); }
  for (let i = 0; i < 6; i++) { const c = cyl(0.006, 0.006, 0.012, mat.metal(0x9aa0a8, 0.35), 16); c.position.set(-0.23 + i * 0.035, 0.008, -0.155); g.add(c); }
  for (let i = 0; i < 24; i++) { const c = box(0.006, 0.002, 0.003, mat.metal(0x8b9097, 0.4)); c.position.set(-0.1 + (i % 12) * 0.018, 0.0045, i < 12 ? 0.105 : -0.105); g.add(c); }
  return {
    group: g, focus: { distance: 0.68, target: [0, 0, 0], height: 0.48 }, orbit: { range: 1.2 },
    update(live, t) {
      const u = live.gpu ?? 0.15;
      cells.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(1.6); m.opacity = 0.05 + u * (0.55 + 0.45 * Math.sin(t * 5 - (i % smCols) * 0.8 - Math.floor(i / smCols) * 0.5)); });
      memGlow.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(1.4); m.opacity = 0.1 + u * 0.5 * (0.6 + 0.4 * Math.sin(t * 7 + i)); });
    },
  };
}

// ======================= MEMÓRIA DE NOTEBOOK =======================
function soDimm(label: string) {
  const g = new THREE.Group(); const L = 0.27, H = 0.12;
  const shape = new THREE.Shape(); const r = 0.004, nx = -L * 0.08, notch = 0.007;
  shape.moveTo(-L / 2, 0); shape.lineTo(nx - notch / 2, 0); shape.lineTo(nx - notch / 2, 0.016); shape.lineTo(nx + notch / 2, 0.016); shape.lineTo(nx + notch / 2, 0); shape.lineTo(L / 2, 0);
  shape.lineTo(L / 2, H * 0.42); shape.absarc(L / 2, H * 0.5, 0.008, -Math.PI / 2, Math.PI / 2, true); shape.lineTo(L / 2, H - r); shape.lineTo(-L / 2, H); shape.lineTo(-L / 2, H * 0.58); shape.absarc(-L / 2, H * 0.5, 0.008, Math.PI / 2, -Math.PI / 2, true); shape.lineTo(-L / 2, 0);
  const pcb = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), new THREE.MeshStandardMaterial({ map: pcbTexture('#0f3a26', 'rgba(150,210,160,0.3)', 9, 512), metalness: 0.25, roughness: 0.55 }));
  pcb.geometry.translate(0, 0, -0.002); pcb.material && ((pcb.material as THREE.MeshStandardMaterial).map!.repeat.set(6, 6)); g.add(pcb);
  const fingers = box(L * 0.92, 0.012, 0.0045, mat.gold()); fingers.position.y = 0.007; g.add(fingers);
  const gap = box(notch * 1.2, 0.014, 0.005, new THREE.MeshStandardMaterial({ color: 0x0f3a26 })); gap.position.set(nx, 0.007, 0); g.add(gap);
  const chipTex = chipLabel(['DDR5', '16Gb', '']);
  const glow: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const x = -L * 0.36 + i * L * 0.24; const c = rbox(0.05, 0.05, 0.004, 0.0015, epoxy()); c.position.set(x, H * 0.55, 0.004); g.add(c);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.048), epoxy(chipTex)); top.position.set(x, H * 0.55, 0.0062); g.add(top);
    const m = glowAdd(); const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.056), m); halo.position.set(x, H * 0.55, 0.0022); g.add(halo); glow.push(m);
  }
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.03), new THREE.MeshStandardMaterial({ map: labelTexture([{ text: label.toUpperCase().slice(0, 20), size: 120 }, { text: tr("SO-DIMM"), size: 100, alpha: 0.6 }], 1024, 300, '#d9dde2', '#2d3137'), roughness: 0.6 }));
  lbl.position.set(L * 0.05, H * 0.18, -0.0022); lbl.rotation.y = Math.PI; g.add(lbl);
  const spd = box(0.008, 0.006, 0.002, epoxy()); spd.position.set(L * 0.38, H * 0.25, 0.003); g.add(spd);
  for (let i = 0; i < 14; i++) { const c = box(0.004, 0.002, 0.002, mat.metal(0x8b9097, 0.4)); c.position.set(-L * 0.42 + i * L * 0.062, H * 0.22, 0.003); g.add(c); }
  return { group: g, update(live: Live, t: number, off: number) { const mu = live.mem ?? 0.4; glow.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(1.5); m.opacity = 0.12 + mu * 0.6 * (0.7 + 0.3 * Math.sin(t * 4 + i + off)); }); } };
}
/** Pentes SO-DIMM deitados no soquete, como dentro de um notebook (um sobre o outro). */
export function soDimmModel(o: { count?: number; label?: string } = {}): Model {
  const g = new THREE.Group(); const n = Math.max(1, Math.min(2, o.count ?? 2));
  const sticks = Array.from({ length: n }, (_, i) => {
    const s = soDimm(o.label || 'Memória'); s.group.rotation.x = -Math.PI / 2 + 0.06; s.group.position.set(0, 0.014 + i * 0.04, 0.06 + i * 0.05); g.add(s.group);
    const sock = box(0.29, 0.012 + i * 0.04, 0.022, mat.plastic(0x101114)); sock.position.set(0, (0.012 + i * 0.04) / 2, 0.07 + i * 0.05); g.add(sock);
    return s;
  });
  const base = slab(0.42, 0.3, 0.005, 0.01, new THREE.MeshStandardMaterial({ map: pcbTexture('#0a0b0e', 'rgba(70,82,96,0.45)', 4, 512), metalness: 0.3, roughness: 0.55 }), 0.001); base.rotation.x = -Math.PI / 2; base.position.set(0, -0.003, 0.0); g.add(base);
  return { group: g, focus: { distance: 0.62, target: [0, 0.02, 0.0], height: 0.45 }, orbit: { range: 1.2 }, update(l, t) { sticks.forEach((s, i) => s.update(l, t, i * 1.3)); } };
}
/** Memória soldada (LPDDR) em volta do processador, como nos notebooks finos. */
export function solderedMemModel(o: { chips?: number; label?: string } = {}): Model {
  const g = new THREE.Group(); const n = Math.max(2, Math.min(8, o.chips ?? 4));
  const pcb = slab(0.5, 0.36, 0.006, 0.01, new THREE.MeshStandardMaterial({ map: pcbTexture('#0b0d10', 'rgba(80,95,110,0.45)', 13, 1024), metalness: 0.3, roughness: 0.55 }), 0.001); pcb.rotation.x = -Math.PI / 2; g.add(pcb);
  const tex = chipLabel(['LPDDR5X', o.label || '', '']); const glow: THREE.MeshBasicMaterial[] = []; const traces: THREE.MeshBasicMaterial[] = [];
  const cpuStub = rbox(0.14, 0.006, 0.12, 0.003, new THREE.MeshStandardMaterial({ color: 0x1f3a2b, metalness: 0.3, roughness: 0.5 })); cpuStub.position.set(0, 0.006, 0); g.add(cpuStub);
  const cpuDie = box(0.07, 0.003, 0.05, new THREE.MeshPhysicalMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.2, clearcoat: 1, iridescence: 0.5 })); cpuDie.position.set(0, 0.0105, 0); g.add(cpuDie);
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), cols = Math.ceil(n / 2); const x = side * 0.15, z = (k - (cols - 1) / 2) * 0.075;
    const c = rbox(0.08, 0.007, 0.06, 0.002, epoxy()); c.position.set(x, 0.0065, z); g.add(c);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.056), epoxy(tex)); top.rotation.x = -Math.PI / 2; top.position.set(x, 0.0102, z); g.add(top);
    const m = glowAdd(); const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.068), m); halo.rotation.x = -Math.PI / 2; halo.position.set(x, 0.0034, z); g.add(halo); glow.push(m);
    for (let j = 0; j < 3; j++) { const tm = glowAdd(); const t = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.0014), tm); t.rotation.x = -Math.PI / 2; t.position.set(side * 0.09, 0.0034, z * 0.5 + (j - 1) * 0.008); g.add(t); traces.push(tm); }
  }
  return {
    group: g, focus: { distance: 0.6, target: [0, 0, 0], height: 0.45 }, orbit: { range: 1.2 },
    update(live, t) { const mu = live.mem ?? 0.4; glow.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(1.5); m.opacity = 0.12 + mu * 0.6 * (0.7 + 0.3 * Math.sin(t * 3 + i)); }); traces.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(2); m.opacity = 0.1 + 0.6 * Math.max(0, Math.sin(t * 6 - i * 0.8)); }); },
  };
}

// ---------- peças de placa ----------
function boardShape(points: [number, number][], holes: [number, number, number][] = []) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  holes.forEach(([x, y, r]) => { const h = new THREE.Path(); h.absarc(x, y, r, 0, Math.PI * 2, false); s.holes.push(h); });
  return s;
}
function boardMesh(shape: THREE.Shape, base: string, line: string, seed: number) {
  const tex = pcbTexture(base, line, seed, 1024); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, curveSegments: 16 });
  // UV planar a partir de x/y
  const pos = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 1.6, pos.getY(i) * 1.6);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.55 })); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m;
}
function usbC(x: number, z: number, rotY: number) { const g = new THREE.Group(); const shell = rbox(0.034, 0.012, 0.03, 0.005, mat.metal(0x8f959d, 0.36)); shell.position.y = 0.012; g.add(shell); const hole = rbox(0.026, 0.006, 0.002, 0.003, mat.dark(0x050505)); hole.position.set(0, 0.012, 0.0155); g.add(hole); g.position.set(x, 0, z); g.rotation.y = rotY; return g; }
function connector(w: number, d: number, x: number, z: number, white = false) { const c = box(w, 0.006, d, mat.plastic(white ? 0xa9adb3 : 0x141518, 0.7)); c.position.set(x, 0.009, z); return c; }
function shield(w: number, d: number, x: number, z: number) { const s = rbox(w, 0.008, d, 0.002, shieldMat()); s.position.set(x, 0.01, z); return s; }
function nand(x: number, z: number, label: string, glow: THREE.MeshBasicMaterial[], g: THREE.Group, rot = 0) {
  const c = rbox(0.07, 0.007, 0.09, 0.002, epoxy()); c.position.set(x, 0.0095, z); c.rotation.y = rot; g.add(c);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.086), epoxy(chipLabel(['NAND', label, 'flash']))); top.rotation.x = -Math.PI / 2; top.rotation.z = rot + Math.PI / 2; top.position.set(x, 0.0131, z); g.add(top);
  const m = glowAdd(); const halo = new THREE.Mesh(new THREE.PlaneGeometry(rot ? 0.1 : 0.08, rot ? 0.08 : 0.1), m); halo.rotation.x = -Math.PI / 2; halo.position.set(x, 0.0064, z); g.add(halo); glow.push(m);
}
function blower(r: number) {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.022, 48, 1, true), mat.dark(0x1c1e22, 0.5)); housing.position.y = 0.011; g.add(housing);
  const lid = new THREE.Mesh(new THREE.RingGeometry(r * 0.42, r * 1.12, 48), mat.dark(0x222429, 0.45)); lid.rotation.x = -Math.PI / 2; lid.position.y = 0.0222; g.add(lid);
  const f = fan(r, { blades: 31, frame: false }); f.group.rotation.x = -Math.PI / 2; f.group.position.y = 0.012; g.add(f.group);
  const outlet = box(r * 1.3, 0.02, r * 0.5, mat.dark(0x1c1e22, 0.5)); outlet.position.set(0, 0.011, -r * 1.1); g.add(outlet);
  for (let i = 0; i < 14; i++) { const fin = box(0.0012, 0.018, r * 0.45, copper()); fin.position.set(-r * 0.6 + i * (r * 1.2 / 13), 0.011, -r * 1.36); g.add(fin); }
  return { group: g, spin: f.spin };
}

// ======================= PLACA LÓGICA DO MACBOOK =======================
export function macLogicBoardModel(o: { pro?: boolean; pCores?: number; eCores?: number; gpuCores?: number; memChips?: number; memLabel?: string; nandLabel?: string } = {}): Model {
  const g = new THREE.Group(); const pro = o.pro !== false;
  // contorno da placa: compacta, com recortes para as ventoinhas e para os conectores laterais
  const W = 0.5, H = 0.26;
  const pts: [number, number][] = [[-W / 2, -H / 2 + 0.03], [-W / 2 + 0.06, -H / 2 + 0.03], [-W / 2 + 0.08, -H / 2], [W / 2 - 0.08, -H / 2], [W / 2 - 0.06, -H / 2 + 0.03], [W / 2, -H / 2 + 0.03], [W / 2, H / 2 - 0.05], [W / 2 - 0.05, H / 2], [-W / 2 + 0.05, H / 2], [-W / 2, H / 2 - 0.05]];
  const board = boardMesh(boardShape(pts, [[-W / 2 + 0.03, H / 2 - 0.08, 0.006], [W / 2 - 0.03, H / 2 - 0.08, 0.006], [0, -H / 2 + 0.02, 0.006]]), '#0c0f16', 'rgba(70,95,140,0.4)', 31); g.add(board);
  // chip no centro (pacote com a memória unificada)
  const soc = chipPackage({ vendor: 'apple', pCores: o.pCores, eCores: o.eCores, gpuCores: o.gpuCores, memChips: o.memChips, memLabel: o.memLabel, highlight: 'none' });
  soc.group.scale.setScalar(0.48); soc.group.position.set(-0.02, 0.006, 0.0); g.add(soc.group);
  // armazenamento: chips NAND soldados ao lado do chip
  const nandGlow: THREE.MeshBasicMaterial[] = [];
  nand(0.13, -0.05, o.nandLabel || '', nandGlow, g); nand(0.13, 0.05, o.nandLabel || '', nandGlow, g);
  // blindagens metálicas (rádio Wi-Fi/Bluetooth, gerenciamento de energia, áudio)
  g.add(shield(0.08, 0.06, -0.17, -0.06), shield(0.06, 0.07, -0.18, 0.05), shield(0.05, 0.05, 0.21, 0.0));
  // reguladores e indutores
  for (let i = 0; i < 6; i++) { const b = rbox(0.012, 0.008, 0.012, 0.002, mat.dark(0x2a2c31, 0.5)); b.position.set(-0.09 + i * 0.016, 0.01, -0.105); g.add(b); }
  for (let i = 0; i < 40; i++) { const c = box(0.005, 0.002, 0.0025, mat.metal(0x8b9097, 0.4)); c.position.set(-0.2 + (i % 20) * 0.02, 0.0072, i < 20 ? 0.105 : -0.085); g.add(c); }
  // conectores: tela, bateria, teclado/trackpad, alto-falantes
  g.add(connector(0.06, 0.012, 0.0, 0.118), connector(0.04, 0.012, 0.1, 0.118, true), connector(0.05, 0.014, -0.12, -0.11), connector(0.022, 0.01, 0.21, 0.08), connector(0.022, 0.01, -0.23, 0.08));
  const flex = box(0.05, 0.001, 0.06, new THREE.MeshStandardMaterial({ color: 0x7a4f26, metalness: 0.2, roughness: 0.6 })); flex.position.set(0, 0.0075, 0.155); g.add(flex);
  // portas USB-C (e HDMI/SD no Pro) nas extremidades
  g.add(usbC(-W / 2 - 0.004, -0.02, -Math.PI / 2), usbC(-W / 2 - 0.004, 0.025, -Math.PI / 2));
  if (pro) { g.add(usbC(W / 2 + 0.004, 0.025, Math.PI / 2)); const hdmi = rbox(0.03, 0.014, 0.04, 0.003, mat.metal(0x8f959d, 0.36)); hdmi.position.set(W / 2 + 0.004, 0.013, -0.03); g.add(hdmi); }
  // ventoinhas nas pontas (só nos modelos com ventilação ativa)
  const fans: ReturnType<typeof blower>[] = [];
  if (pro) for (const sx of [-1, 1]) { const b = blower(0.045); b.group.position.set(sx * (W / 2 + 0.07), 0, -0.04); b.group.rotation.y = sx > 0 ? Math.PI : 0; g.add(b.group); fans.push(b); }
  return {
    group: g, focus: { distance: 0.78, target: [0, 0, 0], height: 0.5 }, orbit: { range: 1.4 },
    update(live, t, dt) {
      soc.update(live, t);
      const d = live.disk ?? 0.2; nandGlow.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(1.4); m.opacity = 0.1 + d * 0.6 * (0.6 + 0.4 * Math.abs(Math.sin(t * 8 + i))); });
      const sp = live.fanRpm ? (live.fanRpm / 60) * Math.PI * 2 * 0.3 : 2 + (live.load ?? 0.2) * 20; fans.forEach((f) => f.spin(sp, dt));
    },
  };
}

// ======================= PLACA-MÃE DE NOTEBOOK WINDOWS =======================
export function laptopBoardModel(o: { vendor?: 'intel' | 'amd'; cores?: number; dgpu?: boolean; sodimm?: number; soldered?: boolean } = {}): Model {
  const g = new THREE.Group(); const W = 0.66, H = 0.3;
  const pts: [number, number][] = [[-W / 2, -H / 2], [W * 0.1, -H / 2], [W * 0.14, -H / 2 + 0.05], [W / 2, -H / 2 + 0.05], [W / 2, H / 2], [-W / 2 + 0.12, H / 2], [-W / 2 + 0.1, H / 2 - 0.04], [-W / 2, H / 2 - 0.04]];
  const board = boardMesh(boardShape(pts, [[-W / 2 + 0.02, -H / 2 + 0.02, 0.006], [W / 2 - 0.02, H / 2 - 0.02, 0.006], [0.05, H / 2 - 0.02, 0.006]]), '#0a0b0e', 'rgba(70,82,96,0.45)', 17); g.add(board);
  const cpu = chipPackage({ vendor: o.vendor || 'intel', cores: o.cores, highlight: 'none' }); cpu.group.scale.setScalar(0.42); cpu.group.position.set(-0.08, 0.006, 0.0); g.add(cpu.group);
  let gpuUpd: ((l: Live, t: number) => void) | null = null;
  if (o.dgpu) {
    const gp = gpuChipModel({ memChips: 4 }); gp.group.scale.setScalar(0.42); gp.group.position.set(0.11, 0.0, 0.01);
    // usa só o chip e as memórias (sem a placa de fundo do modelo isolado)
    gp.group.children[0].visible = false; g.add(gp.group); gpuUpd = (l, t) => gp.update!(l, t, 0);
  }
  // memória: soquetes SO-DIMM com pentes deitados, ou chips soldados ao redor do processador
  const memUpd: ((l: Live, t: number) => void)[] = [];
  const nS = o.soldered ? 0 : Math.max(1, Math.min(2, o.sodimm ?? 1));
  for (let i = 0; i < nS; i++) {
    const s = soDimm('Memória'); s.group.scale.setScalar(0.5); s.group.rotation.x = -Math.PI / 2; s.group.rotation.z = Math.PI; s.group.position.set(-0.08, 0.016 + i * 0.012, 0.12 + i * 0.004); g.add(s.group);
    const sock = box(0.145, 0.01, 0.012, mat.plastic(0x101114)); sock.position.set(-0.08, 0.011 + i * 0.012, 0.09); g.add(sock);
    memUpd.push((l, t) => s.update(l, t, i));
  }
  if (o.soldered) {
    const glow: THREE.MeshBasicMaterial[] = []; const tex = chipLabel(['LPDDR5X', '', '']);
    [[-0.17, -0.04], [-0.17, 0.04], [0.0, -0.04], [0.0, 0.04]].forEach(([x, z]) => { const c = rbox(0.035, 0.005, 0.03, 0.0015, epoxy()); c.position.set(x, 0.0085, z); g.add(c); const top = new THREE.Mesh(new THREE.PlaneGeometry(0.033, 0.028), epoxy(tex)); top.rotation.x = -Math.PI / 2; top.position.set(x, 0.0112, z); g.add(top); const m = glowAdd(); const h = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.037), m); h.rotation.x = -Math.PI / 2; h.position.set(x, 0.0064, z); g.add(h); glow.push(m); });
    memUpd.push((l, t) => glow.forEach((m, i) => { m.color.copy(l.accent).multiplyScalar(1.5); m.opacity = 0.12 + (l.mem ?? 0.4) * 0.6 * (0.7 + 0.3 * Math.sin(t * 3 + i)); }));
  }
  // SSD M.2 2280 deitado
  const ssd = new THREE.Group(); const sp = box(0.16, 0.003, 0.044, new THREE.MeshStandardMaterial({ map: pcbTexture('#08090b', 'rgba(70,90,110,0.5)', 3, 256), metalness: 0.3, roughness: 0.5 })); ssd.add(sp);
  for (let i = 0; i < 2; i++) { const c = rbox(0.04, 0.004, 0.032, 0.001, epoxy()); c.position.set(-0.04 + i * 0.05, 0.0035, 0); ssd.add(c); }
  const ctrl = rbox(0.022, 0.004, 0.022, 0.001, epoxy()); ctrl.position.set(0.06, 0.0035, 0); ssd.add(ctrl);
  const ssdGlow = glowAdd(); const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.052), ssdGlow); sh.rotation.x = -Math.PI / 2; sh.position.y = -0.0018; ssd.add(sh);
  ssd.position.set(0.2, 0.011, -0.07); g.add(ssd); g.add(connector(0.012, 0.03, 0.285, -0.07));
  // tubos de calor de cobre do chip até as ventoinhas (passando ao lado dos chips)
  const pipeMat = copper(); const fans: ReturnType<typeof blower>[] = [];
  const pipe = (pts3: [number, number, number][]) => { const c = new THREE.CatmullRomCurve3(pts3.map(([x, y, z]) => new THREE.Vector3(x, y, z))); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 60, 0.006, 10, false), pipeMat); m.castShadow = true; g.add(m); };
  pipe([[-0.15, 0.02, -0.07], [-0.22, 0.02, -0.08], [-0.27, 0.02, -0.06]]);
  pipe([[-0.0, 0.02, -0.075], [0.05, 0.02, -0.11], [0.2, 0.02, -0.13], [0.27, 0.02, -0.1]]);
  for (const [x, z, r] of [[-0.3, -0.03, 0], [0.3, -0.05, Math.PI]] as const) { const b = blower(0.05); b.group.position.set(x, 0.006, z); b.group.rotation.y = r; g.add(b.group); fans.push(b); }
  // portas na traseira: USB-A, HDMI, RJ-45, USB-C e conector de energia
  const back = -H / 2 + 0.002;
  const usbA = (x: number) => { const s = rbox(0.032, 0.016, 0.03, 0.002, mat.metal(0x8f959d, 0.36)); s.position.set(x, 0.014, back + 0.012); g.add(s); const tongue = box(0.024, 0.004, 0.026, mat.plastic(0x2a6fd6)); tongue.position.set(x, 0.012, back + 0.013); g.add(tongue); };
  usbA(-0.26); usbA(-0.21);
  const hdmi = rbox(0.034, 0.014, 0.03, 0.003, mat.metal(0x8f959d, 0.36)); hdmi.position.set(-0.155, 0.013, back + 0.012); g.add(hdmi);
  const rj = rbox(0.036, 0.03, 0.04, 0.002, mat.plastic(0x15161a)); rj.position.set(-0.1, 0.021, back + 0.016); g.add(rj);
  g.add(usbC(-0.045, back + 0.012, Math.PI));
  const dc = cyl(0.01, 0.01, 0.03, mat.plastic(0x101114), 20); dc.rotation.x = Math.PI / 2; dc.position.set(0.0, 0.016, back + 0.012); g.add(dc);
  // conectores internos, capacitores, blindagem do Wi-Fi
  g.add(connector(0.05, 0.012, 0.15, 0.13), connector(0.03, 0.01, 0.26, 0.13, true), connector(0.04, 0.012, -0.24, 0.1), shield(0.05, 0.05, 0.27, 0.06));
  for (let i = 0; i < 50; i++) { const c = box(0.005, 0.002, 0.0025, mat.metal(0x8b9097, 0.4)); c.position.set(-0.3 + (i % 25) * 0.024, 0.0072, i < 25 ? -0.02 + 0.13 : 0.05 - 0.1); g.add(c); }
  return {
    group: g, focus: { distance: 0.86, target: [0, 0, 0], height: 0.5 }, orbit: { range: 1.4 },
    update(live, t, dt) {
      cpu.update(live, t); gpuUpd?.(live, t); memUpd.forEach((u) => u(live, t));
      ssdGlow.color.copy(live.accent).multiplyScalar(1.4); ssdGlow.opacity = 0.1 + (live.disk ?? 0.2) * 0.6 * (0.6 + 0.4 * Math.abs(Math.sin(t * 9)));
      const s = live.fanRpm ? (live.fanRpm / 60) * Math.PI * 2 * 0.3 : 2 + Math.max(live.load ?? 0.2, live.gpu ?? 0) * 22; fans.forEach((f) => f.spin(s, dt));
    },
  };
}

// ======================= ARMAZENAMENTO INTEGRADO (Mac) =======================
export function onboardFlashModel(o: { label?: string; chips?: number } = {}): Model {
  const g = new THREE.Group(); const n = Math.max(1, Math.min(4, o.chips ?? 2));
  const board = boardMesh(boardShape([[-0.26, -0.13], [0.24, -0.13], [0.24, 0.13], [-0.26, 0.13]]), '#0c0f16', 'rgba(70,95,140,0.4)', 41); g.add(board);
  const glow: THREE.MeshBasicMaterial[] = [];
  const xs = n === 1 ? [0.06] : n === 2 ? [0.0, 0.11] : [-0.05, 0.05, 0.15, 0.25].slice(0, n);
  xs.forEach((x, i) => nand(x - 0.03, (i % 2 ? 0.02 : -0.02) * (n > 2 ? 1 : 0), o.label || '', glow, g));
  // controlador fica dentro do chip principal: pacote do SoC reduzido à esquerda, com trilhas até a NAND
  const soc = rbox(0.14, 0.008, 0.12, 0.004, new THREE.MeshStandardMaterial({ color: 0x14181a, metalness: 0.3, roughness: 0.5 })); soc.position.set(-0.17, 0.008, 0); g.add(soc);
  const sd = box(0.08, 0.003, 0.065, new THREE.MeshPhysicalMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.2, clearcoat: 1, iridescence: 0.5 })); sd.position.set(-0.17, 0.0135, 0); g.add(sd);
  const traces: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 6; i++) { const m = glowAdd(); const t = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0016), m); t.rotation.x = -Math.PI / 2; t.position.set(-0.075, 0.0064, (i - 2.5) * 0.008); g.add(t); traces.push(m); }
  for (let i = 0; i < 20; i++) { const c = box(0.005, 0.002, 0.0025, mat.metal(0x8b9097, 0.4)); c.position.set(-0.22 + i * 0.022, 0.0072, 0.11); g.add(c); }
  return {
    group: g, focus: { distance: 0.52, target: [0, 0, 0], height: 0.4 }, orbit: { range: 1.2 },
    update(live, t) {
      const d = live.disk ?? 0.2;
      glow.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(1.4); m.opacity = 0.12 + d * 0.6 * (0.6 + 0.4 * Math.abs(Math.sin(t * 8 + i))); });
      traces.forEach((m, i) => { m.color.copy(live.accent).multiplyScalar(2); m.opacity = 0.1 + (0.3 + d) * 0.6 * Math.max(0, Math.sin(t * 7 - i * 0.7)); });
    },
  };
}
export { accentHex };
