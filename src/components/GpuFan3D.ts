// Ventoinhas 3D das placas de vídeo no app. Usa o mesmo motor do modelador (src/hw3d/fanEngine.js) e as medidas de cada
// placa exportadas dele (public/gpus/fans3d.json). Um único desenhista WebGL faz todas as vistas (placa grande e cartões
// pequenos), uma de cada vez, e cada vista copia a imagem para o próprio canvas 2D.
// - A foto é a face da placa: fica na frente, com um furo em cada ventoinha; a ventoinha 3D aparece pelo furo.
// - Girando, as pás viram um borrão: as cópias são somadas com peso igual numa passada à parte, e o resultado vai por
//   cima da imagem (o miolo e o anel continuam na frente das pás).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createFanEngine, type FanBuild } from '../hw3d/fanEngine.js';
import type { GpuCard } from './GpuArt';

export interface FanProfile { medidas: Record<string, any>; ventoinhas: { cx: number; cy: number; r: number }[] | null }
let profiles: Promise<Record<string, FanProfile>> | null = null;
/** Medidas 3D de todas as placas (vazio se o arquivo não existir). */
export const loadFanProfiles = () => (profiles ??= fetch('./gpus/fans3d.json').then((r) => r.json()).then((j) => j.placas || {}).catch(() => ({})));

const SHARED: { r: THREE.WebGLRenderer | null; env: THREE.Texture | null; engine: ReturnType<typeof createFanEngine> | null } = { r: null, env: null, engine: null };
function shared() {
  if (!SHARED.r) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    SHARED.r = r; SHARED.env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; SHARED.engine = createFanEngine(THREE);
  }
  return SHARED as { r: THREE.WebGLRenderer; env: THREE.Texture; engine: ReturnType<typeof createFanEngine> };
}

/** Uma placa com as ventoinhas 3D, pronta para desenhar. */
export interface Fan3DScene {
  scene: THREE.Scene; fans: FanBuild[]; m: Record<string, any>; card: GpuCard; dispose(): void;
  sun: THREE.SpotLight; sunBg: THREE.SpotLight; angle: number; rpm: number;
}
export async function buildFan3DScene(card: GpuCard, prof: FanProfile, photo: HTMLImageElement): Promise<Fan3DScene> {
  const { env, engine } = shared();
  const m = prof.medidas || {};
  const scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = m.ambiente ?? 0.25;
  // luzes na mesma ordem do modelador: a primeira ilumina as pás e o miolo; a segunda, o dissipador e os canos
  const sun = new THREE.SpotLight(0xffffff, 1, 0, Math.PI / 4, 0.55, 2), sunBg = new THREE.SpotLight(0xffffff, 1, 0, Math.PI / 4, 0.55, 2);
  for (const l of [sun, sunBg]) { l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.layers.enableAll(); scene.add(l, l.target); }
  const W = card.w, H = card.h, layout = prof.ventoinhas?.length ? prof.ventoinhas : card.fans;
  // face da placa: a foto, com um furo em cada ventoinha (do tamanho da abertura)
  const tex = new THREE.Texture(photo); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const holes = document.createElement('canvas'); holes.width = W; holes.height = H;
  { const g = holes.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000';
    for (const f of layout) { g.beginPath(); g.arc(f.cx, f.cy, f.r * (m.abertura ?? 104) / 100, 0, Math.PI * 2); g.fill(); } }
  const holeTex = new THREE.CanvasTexture(holes);
  const s0 = layout[0].r / engine.R;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, alphaMap: holeTex, transparent: true, depthWrite: false, toneMapped: false }));
  face.position.z = 1.0 * s0; face.renderOrder = 50; scene.add(face);
  const fans = layout.map((f) => {
    const b = engine.makeFan(m, false); const s = f.r / engine.R;
    b.fan.scale.setScalar(s); b.fan.position.set(f.cx - W / 2, -(f.cy - H / 2), 0); scene.add(b.fan);
    return b;
  });
  return {
    scene, fans, m, card, sun, sunBg, angle: 0, rpm: 0,
    dispose() { scene.traverse((o: any) => { o.geometry?.dispose?.(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm: any) => { mm.map?.dispose?.(); mm.dispose?.(); }); } }); },
  };
}

// cenas guardadas por placa e por lugar (o widget abre e fecha muitas vezes; montar a cena e preparar os shaders,
// que são os programas da placa de vídeo, levava segundos). Os shaders já ficam prontos na primeira montagem.
const kept = new Map<string, Promise<Fan3DScene>>();
export function cachedFan3DScene(card: GpuCard, prof: FanProfile, photo: HTMLImageElement, slot: string) {
  const key = `${card.file}|${slot}`;
  let p = kept.get(key);
  if (!p) {
    p = buildFan3DScene(card, prof, photo).then((v) => { try { shared().r.compile(v.scene, new THREE.PerspectiveCamera()); } catch { /* compila no primeiro desenho */ } return v; });
    p.catch(() => kept.delete(key)); kept.set(key, p);
  }
  return p;
}

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/**
 * Desenha a placa: gira as ventoinhas pelo tempo (dt) e pelo RPM, posiciona as luzes e copia a imagem para o canvas 2D
 * (por cima do que já estiver nele). pxW e pxH: tamanho da imagem em pixels; camera: a câmera da vista.
 */
export function drawFan3D(v: Fan3DScene, camera: THREE.Camera, target: CanvasRenderingContext2D, pxW: number, pxH: number, rpm: number, dt: number) {
  const { r, engine } = shared();
  const m = v.m, d = Math.PI / 180;
  // o desenhista só cresce (mudar de tamanho a cada vista recriava a área de desenho e deixava tudo lento); cada vista
  // usa o canto de baixo à esquerda, do tamanho dela, e copia só essa parte
  const CW = Math.max(r.domElement.width, pxW), CH = Math.max(r.domElement.height, pxH);
  if (r.domElement.width !== CW || r.domElement.height !== CH) r.setSize(CW, CH, false);
  r.setViewport(0, 0, pxW, pxH); r.setScissor(0, 0, pxW, pxH); r.setScissorTest(true);
  const copy = () => target.drawImage(r.domElement, 0, CH - pxH, pxW, pxH, 0, 0, pxW, pxH);
  // giro (mesma conta do modelador)
  v.rpm += (rpm - v.rpm) * Math.min(1, dt * 8);
  // ventoinhas com muitas pás (20 ou mais, como a R9700): em rotação alta, a pá andaria várias vezes o espaço entre
  // pás por quadro e pareceria parada (efeito roda de carroça). Nelas, o giro mostrado fica em no máximo 35% desse
  // espaço por quadro, então dá para ver que gira; o borrão continua o da rotação real
  const step = Math.min((v.rpm / 60) * Math.PI * 2 * dt, Math.PI * 2), sg = m.giro ? 1 : -1, gapV = (Math.PI * 2) / Math.max(1, m.pas ?? 9);
  v.angle += sg * ((m.pas ?? 9) >= 20 ? Math.min(step, gapV * 0.35) : step);
  const spread = Math.min(step, (Math.PI * 2) / Math.max(1, m.pas ?? 9)) * (m.borrao ?? 1), spinning = step > 0.02 && spread > 0.002;
  for (const f of v.fans) {
    const rt = f.copies;
    rt.one.visible = true; rt.blur.visible = spinning;
    for (const mm of rt.solidMats) if (mm.colorWrite === spinning) { mm.colorWrite = !spinning; mm.depthWrite = !spinning; }
    rt.one.parent.rotation.z = v.angle - (m.fase ?? 0) * d; rt.u.uSpread.value = sg * spread;
    if (spinning) {
      const rot = rt.one.parent, c0 = rot.localToWorld(_a.set(0, 0, 0)).project(camera), c1 = rot.localToWorld(_b.set(rt.tip, 0, 0)).project(camera);
      const tipPx = Math.hypot((c1.x - c0.x) * pxW / 2, (c1.y - c0.y) * pxH / 2);
      // no app, no máximo 48 cópias (o modelador vai até 320): o borrão fica um pouco mais marcado, mas leve
      const want = Math.max(2, Math.min(rt.max, 48, Math.ceil(Math.abs(spread) * tipPx / (m.borraoPx ?? 6))));
      rt.u.uSamples.value = want; rt.blur.count = want * rt.n;
    }
  }
  // luzes (mesma conta do modelador, na escala da foto)
  const L0 = v.card.w * 1.5, size = v.card.w * 0.6;
  const place = (lt: THREE.SpotLight, dir: number, alt: number, dist: number, force: number) => {
    const L = L0 * dist; lt.position.set(Math.cos(dir * d) * Math.cos(alt * d) * L, Math.sin(dir * d) * Math.cos(alt * d) * L, Math.sin(alt * d) * L);
    lt.angle = Math.min(Math.PI / 2.2, Math.atan(size / L) * 1.6); lt.intensity = force * L0 * L0; lt.shadow.camera.near = L * 0.2; lt.shadow.camera.far = L * 2.5; lt.shadow.camera.updateProjectionMatrix();
    lt.shadow.radius = 1 + (1 - (m.dureza ?? 0.5)) * 12;
  };
  place(v.sun, m.luzDir ?? 125, m.luzAlt ?? 55, m.luzDist ?? 1.2, m.luzForca ?? 2.4);
  place(v.sunBg, m.bgDir ?? 125, m.bgAlt ?? 55, m.bgDist ?? 1.2, m.bgForca ?? 2.4);
  engine.bgShadeU.uBgShade.value = 1 - (m.escDiss ?? 0);
  engine.bladeLightU.uBladeOn.value = m.luzPas ? 1 : 0; engine.bladeLightU.uBladeForce.value = m.luzForca ?? 2.4;
  engine.bladeLightU.uBladeLight.value.set(Math.cos((m.luzDir ?? 125) * d) * Math.cos((m.luzAlt ?? 55) * d), Math.sin((m.luzDir ?? 125) * d) * Math.cos((m.luzAlt ?? 55) * d), Math.sin((m.luzAlt ?? 55) * d));
  // 1) a placa (as pás paradas, ou só a sombra delas quando giram)
  r.setRenderTarget(null); r.setClearColor(0x000000, 0); r.autoClear = true;
  (camera as any).layers.set(0); (camera as any).layers.enable(2);
  r.render(v.scene, camera);
  copy();
  // 2) o borrão: o miolo e o anel gravam a profundidade, e as cópias das pás se somam por cima (com transparência)
  if (spinning) {
    const ac = r.autoClear, su = r.shadowMap.autoUpdate; r.autoClear = false; r.shadowMap.autoUpdate = false; r.clear();
    (camera as any).layers.set(2); v.scene.overrideMaterial = depthOnly; r.render(v.scene, camera);
    v.scene.overrideMaterial = null; (camera as any).layers.set(1); r.render(v.scene, camera);
    (camera as any).layers.set(0); (camera as any).layers.enable(2); r.autoClear = ac; r.shadowMap.autoUpdate = su;
    copy();
  }
  r.setScissorTest(false);
}
