// Bomba de water cooler em 3D, para as saídas marcadas como bomba na tela Ventoinhas. É um modelo próprio do app,
// sem visor e sem marca: bloco branco quadrado com os cantos chanfrados, a ventoinha pequena embutida na frente,
// quatro suportes pretos de fixação, a plaquinha de contatos em cima e duas mangueiras brancas trançadas saindo por baixo.
// A ventoinha gira na rotação real, com borrão de movimento (várias cópias das pás, cada uma num instante do quadro).
// - PumpArt compact: o cartão pequeno, com a bomba de frente, bem enquadrada.
// - PumpArt: o painel, com o mesmo layout da placa de vídeo (à esquerda na tela larga, no centro na estreita).
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { accentRgb, spinner, techBackground, WIDE } from './GpuArt';
import { due, paused } from '../lib/pause';

const SAMPLES = 12;
const white = () => new THREE.MeshPhysicalMaterial({ color: 0xf1f2f4, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
const black = () => new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.2 });

function chamferShape(w: number, h: number, c: number) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c); s.lineTo(x - c, y); s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c); s.closePath();
  return s;
}
function braidTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d')!; g.fillStyle = '#e9ebee'; g.fillRect(0, 0, 64, 256);
  for (let y = -64; y < 320; y += 8) { g.strokeStyle = 'rgba(120,126,134,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 32); g.stroke(); g.beginPath(); g.moveTo(64, y); g.lineTo(0, y + 32); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 18); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Monta a bomba. A frente fica no plano XY, virada para +Z; as mangueiras saem por baixo (-Y). */
function buildPump() {
  const g = new THREE.Group();
  const W = 7, D = 3.6, R = 2.75;
  // corpo fundo, com cantos chanfrados e a abertura redonda da ventoinha
  const shape = chamferShape(W, W, 1.0);
  const hole = new THREE.Path(); hole.absarc(0, 0.15, R, 0, Math.PI * 2, true); shape.holes.push(hole);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 4, curveSegments: 64 }), white());
  body.position.z = -D; g.add(body);
  // dentro da abertura: parede escura e fundo preto atrás das pás, para dar profundidade
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, D, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.7, side: THREE.BackSide }));
  wall.rotation.x = Math.PI / 2; wall.position.set(0, 0.15, -D / 2); g.add(wall);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshBasicMaterial({ color: 0x050506 }));
  floor.position.set(0, 0.15, -D + 0.25); g.add(floor);
  // aro grande de fora, em volta da abertura: também tem LED (acende junto com o anel do miolo)
  const rimLed = new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.6, emissive: new THREE.Color(0x000000), emissiveIntensity: 0 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.1, 16, 96), rimLed); rim.position.set(0, 0.15, 0.12); g.add(rim);
  // ventoinha mais para dentro. As pás são desenhadas em 2D numa textura (com o borrão de movimento, como nas ventoinhas
  // da placa-mãe) e ficam num disco dentro do bloco, com o fundo preto atrás. Em 3D, cópias transparentes das pás
  // disputavam a ordem de desenho a cada imagem, e isso fazia o giro dar trancos e a luz piscar
  const fan = new THREE.Group(); fan.position.set(0, 0.15, -1.7); g.add(fan);
  const rh = 1.05, rt = R - 0.12, TEX = 512;
  const fanCanvas = document.createElement('canvas'); fanCanvas.width = fanCanvas.height = TEX;
  const fg = fanCanvas.getContext('2d')!;
  const fanTex = new THREE.CanvasTexture(fanCanvas); fanTex.colorSpace = THREE.SRGBColorSpace; fanTex.anisotropy = 4;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.02, 96), new THREE.MeshStandardMaterial({ map: fanTex, roughness: 0.65 }));
  fan.add(disc);
  const k = TEX / 2 / R; // pixels por unidade
  const bladePath = () => {
    const a0 = rh * k, a1 = rt * k;
    fg.beginPath(); fg.moveTo(a0, 0);
    fg.quadraticCurveTo(a1 * 0.75 * Math.cos(0.15), a1 * 0.75 * Math.sin(0.15), a1 * Math.cos(0.5), a1 * Math.sin(0.5));
    fg.arc(0, 0, a1, 0.5, 0.92);
    fg.quadraticCurveTo(a1 * 0.6 * Math.cos(0.7), a1 * 0.6 * Math.sin(0.7), a0 * Math.cos(0.42), a0 * Math.sin(0.42));
    fg.arc(0, 0, a0, 0.42, 0, true); fg.closePath();
  };
  // o giro roda o disco inteiro; a imagem das pás (com o borrão) só é redesenhada quando o borrão muda de verdade.
  // Antes, as 9 pás eram pintadas 12 vezes numa imagem de 512 pixels e enviadas à placa de vídeo a cada quadro, e só
  // isso dobrava o tempo de cada quadro da tela Ventoinhas
  let drawnSpread = NaN;
  const drawBlades = (angle: number, spread: number) => {
    disc.rotation.z = -angle;
    if (Math.abs(spread - drawnSpread) < 0.03) return;
    drawnSpread = spread;
    fg.setTransform(1, 0, 0, 1, 0, 0); fg.fillStyle = '#050506'; fg.fillRect(0, 0, TEX, TEX);
    fg.translate(TEX / 2, TEX / 2);
    for (let i = 1; i <= SAMPLES; i++) {
      fg.save(); fg.globalAlpha = 1 / i; fg.rotate((spread * (i - 1)) / SAMPLES);
      for (let b = 0; b < 9; b++) {
        fg.save(); fg.rotate((b / 9) * Math.PI * 2); bladePath();
        // cada pá clara na borda de ataque e mais escura na de saída, para as divisões aparecerem
        const gr = fg.createLinearGradient(rh * k, 0, rt * k * Math.cos(0.9), rt * k * Math.sin(0.9));
        gr.addColorStop(0, '#f4f5f7'); gr.addColorStop(0.6, '#dfe2e6'); gr.addColorStop(1, '#a9aeb5');
        fg.fillStyle = gr; fg.fill();
        fg.strokeStyle = 'rgba(0,0,0,.35)'; fg.lineWidth = 2; fg.stroke();
        fg.restore();
      }
      fg.restore();
    }
    fanTex.needsUpdate = true;
  };
  drawBlades(0, 0);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rh, rh * 1.02, 0.6, 64), white()); hub.rotation.x = Math.PI / 2; hub.position.z = 0.3; fan.add(hub);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(rh, 48, 16, 0, Math.PI * 2, 0, 0.45), white()); cap.rotation.x = Math.PI / 2; cap.position.z = 0.36; fan.add(cap);
  // LED no círculo central: um anel em volta do miolo, que acende na cor de destaque quando a bomba gira
  const led = new THREE.MeshStandardMaterial({ color: 0x1a1c20, emissive: new THREE.Color(0x000000), emissiveIntensity: 0, roughness: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(rh + 0.07, 0.07, 16, 96), led); ring.position.z = 0.62; fan.add(ring);
  // parafusos da frente
  for (const [x, y] of [[-2.85, 2.3], [2.85, 2.3], [-2.85, -2.3], [2.85, -2.3]]) { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20), black()); sc.rotation.x = Math.PI / 2; sc.position.set(x, y, 0.15); g.add(sc); }
  // suportes de fixação, atrás do corpo, nas diagonais
  const arm = new THREE.Shape(); arm.moveTo(0, -0.42); arm.lineTo(2.1, -0.42); arm.absarc(2.1, 0, 0.42, -Math.PI / 2, Math.PI / 2, false); arm.lineTo(0, 0.42); arm.closePath();
  const armHole = new THREE.Path(); armHole.absellipse(2.05, 0, 0.32, 0.18, 0, Math.PI * 2, true); arm.holes.push(armHole);
  const armGeo = new THREE.ExtrudeGeometry(arm, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  for (const ang of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) { const m = new THREE.Mesh(armGeo, black()); m.rotation.z = ang; m.position.set(Math.cos(ang) * 3.1, Math.sin(ang) * 3.1, -D - 0.2); g.add(m); }
  // plaquinha de contatos em cima
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.25), black()); plate.position.set(0.6, W / 2 + 0.25, -0.7); g.add(plate);
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8794a, metalness: 0.8, roughness: 0.35 });
  for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.05), copper); p.position.set(0.6 - 0.36 + (i % 4) * 0.24, W / 2 + 0.25 + (i < 4 ? 0.13 : -0.13), -0.56); g.add(p); }
  // mangueiras: saem por baixo do bloco, fazem a curva num joelho de metal (de descer para vir para a frente) e
  // depois descem até sair pela borda de baixo da imagem
  const braid = new THREE.MeshStandardMaterial({ map: braidTexture(), roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.22 });
  for (const [dx, off] of [[-1.15, 0], [1.15, 1.2]]) {
    const z = -D / 2, y1 = -W / 2 - 0.15;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 32), black()); base.position.set(dx, -W / 2 - 0.05, z); g.add(base);
    const elbow = new THREE.QuadraticBezierCurve3(new THREE.Vector3(dx, y1, z), new THREE.Vector3(dx, y1 - 1.1, z), new THREE.Vector3(dx, y1 - 1.1, z + 1.1));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(elbow, 32, 0.5, 24, false), metal));
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.35, 32), metal); collar.rotation.x = Math.PI / 2; collar.position.set(dx, y1 - 1.1, z + 1.15); g.add(collar);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dx, y1 - 1.1, z + 1.2), new THREE.Vector3(dx, y1 - 1.25, z + 2.4), new THREE.Vector3(dx + 0.4 + off * 0.4, y1 - 3.2, z + 3.6),
      new THREE.Vector3(dx + 1.2 + off, y1 - 8, z + 5), new THREE.Vector3(dx + 2 + off, y1 - 15, z + 6),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.42, 20, false), braid));
  }
  return { group: g, drawBlades, led, rimLed };
}

export function PumpArt({ rpm, compact, height = 300, size = 56 }: { rpm?: number; compact?: boolean; height?: number; size?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const rpmRef = useRef(rpm || 0); rpmRef.current = rpm || 0;
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const cv = renderer.domElement; Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    // no painel, o fundo de partículas fica num canvas 2D atrás do 3D
    const back = compact ? null : document.createElement('canvas');
    if (back) { Object.assign(back.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' }); el.appendChild(back); }
    el.appendChild(cv);
    const scene = new THREE.Scene(); const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-4, 6, 8); scene.add(key);
    const { group, drawBlades, led, rimLed } = buildPump(); scene.add(group);
    const camera = new THREE.PerspectiveCamera(compact ? 24 : 26, 1, 0.1, 200);
    const spin = spinner(rpmRef.current, 0.26, 2.3, 0.6), rgb = accentRgb(el), t0 = performance.now();
    led.emissive.setRGB(...(rgb.split(',').map((v) => +v / 255) as [number, number, number]), THREE.SRGBColorSpace);
    rimLed.emissive.copy(led.emissive);
    let on = rpmRef.current > 50 ? 1 : 0;
    let raf = 0, last = t0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
    const gate = { t: 0 };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const { angle, spread } = spin(rpmRef.current, dt);
      if (!visible || paused() || !due(gate, now)) return;
      const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
      const sz = renderer.getSize(new THREE.Vector2());
      if (sz.x !== W || sz.y !== H) renderer.setSize(W, H, false);
      const t = (now - t0) / 1000;
      drawBlades(-angle, -spread);
      // o LED acende devagar quando a bomba começa a girar e apaga quando ela para
      on += ((rpmRef.current > 50 ? 1 : 0) - on) * Math.min(1, dt * 3);
      led.emissiveIntensity = on * 2.4; rimLed.emissiveIntensity = on * 3.2; rimLed.envMapIntensity = 1 - on * 0.9;
      // o aro é branco apagado; aceso, ele escurece por baixo para a cor do LED aparecer (senão a luz some no branco)
      const base = 0.89 - on * 0.84; rimLed.color.setRGB(base, base, base, THREE.SRGBColorSpace);
      // o bloco gira devagar de um lado para o outro
      group.rotation.y = Math.sin(t * 0.55) * (compact ? 0.28 : 0.38);
      camera.aspect = W / H;
      if (compact) {
        // cartão pequeno: a bomba de frente, quase reta, ocupando o quadrado
        const az = -0.18, el2 = 0.12, d = 21;
        camera.position.set(Math.sin(az) * d, -0.4 + Math.sin(el2) * d, Math.cos(az) * d); camera.lookAt(0, -0.4, 0);
        camera.clearViewOffset();
      } else {
        // painel: em diagonal, com um balanço bem pequeno; na tela larga a bomba fica à esquerda
        const side = window.innerWidth >= WIDE;
        const az = -0.55 + Math.sin(t * 0.35) * 0.06, el2 = 0.32 + Math.sin(t * 0.23) * 0.03, d = 30;
        const target = new THREE.Vector3(0.6, -1.4, -0.5);
        camera.position.set(target.x + Math.sin(az) * Math.cos(el2) * d, target.y + Math.sin(el2) * d, target.z + Math.cos(az) * Math.cos(el2) * d); camera.lookAt(target);
        if (side) camera.setViewOffset(W, H, W * 0.26, 0, W, H); else camera.clearViewOffset();
        if (back) {
          const dpr = Math.min(2, devicePixelRatio); if (back.width !== Math.round(W * dpr)) { back.width = Math.round(W * dpr); back.height = Math.round(H * dpr); }
          const bg = back.getContext('2d')!; bg.setTransform(dpr, 0, 0, dpr, 0, 0); bg.clearRect(0, 0, W, H); techBackground(bg, W, H, t, rgb, side ? W * 0.24 : W / 2, H * 0.75);
        }
      }
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss(); cv.remove(); back?.remove(); };
  }, [compact]);
  if (compact) return <div ref={host} className="relative shrink-0 overflow-hidden rounded-md" style={{ width: size, height: size }} />;
  return (
    <div className="pointer-events-none relative w-full" style={{ height }}>
      <div ref={host} className="gpu-hero pump-hero absolute inset-0 overflow-hidden" />
    </div>
  );
}
