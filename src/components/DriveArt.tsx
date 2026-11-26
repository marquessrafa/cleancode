// Enfeites do cartão grande da Visão geral (o disco escolhido na aba):
// - DriveArt: o disco em 3D (SSD NVMe, SSD SATA, disco rígido ou externo), com o mesmo modelo do Monitor de hardware,
//   mas com a câmera quase parada: ela só balança devagar de um lado para o outro.
// - CardParticles: partículas na cor de destaque que sobem devagar e balançam, desenhadas em 2D.
// Os dois param de desenhar quando saem da tela ou quando a janela fica escondida.
import React, { useEffect, useRef } from 'react';
import { THREE } from '../hw3d/core';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ssdModel } from '../hw3d/models';

export type DriveKind = 'nvme' | 'sata' | 'hdd' | 'usb';
export function driveKind(hw?: { bus?: string; media?: string }): DriveKind {
  if (!hw) return 'sata';
  if (hw.bus === 'USB') return 'usb';
  if (hw.media === 'HD' || hw.media === 'HDD') return 'hdd';
  return hw.bus === 'NVMe' ? 'nvme' : 'sata';
}

const accentColor = () => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2fd6a0');

/**
 * area: o espaço do disco dentro do cartão (largura em fração do cartão, encostado na direita, e as margens de cima e de
 * baixo em pixels). O desenho ocupa o cartão inteiro, e a câmera só põe o disco no centro desse espaço. Assim, quando a
 * câmera balança, as pontas do disco podem passar um pouco do espaço sem ser cortadas. Antes, o desenho ficava preso
 * ao espaço, e as pontas sumiam numa borda invisível no meio do cartão.
 */
export function DriveArt({ kind, label, area = { w: 0.45, top: 40, bottom: 24 } }: { kind: DriveKind; label?: string; area?: { w: number; top: number; bottom: number } }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1, 2, 1.5); scene.add(key);
    const rim = new THREE.DirectionalLight(accentColor(), 1.2); rim.position.set(1.5, 0.6, -1.2); scene.add(rim);
    const model = ssdModel({ kind, label });
    scene.add(model.group);
    // enquadra o modelo inteiro: centro e raio da caixa que envolve o modelo
    const bb = new THREE.Box3().setFromObject(model.group), center = bb.getCenter(new THREE.Vector3()), radius = bb.getSize(new THREE.Vector3()).length() / 2;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    let raf = 0, visible = true; const t0 = performance.now(); let last = t0;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
    const live = { accent: accentColor(), disk: 0.25 } as any;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
      const size = renderer.getSize(new THREE.Vector2());
      if (size.x !== W || size.y !== H) renderer.setSize(W, H, false);
      // o disco ocupa o espaço do lado direito: a distância da câmera faz o modelo caber no lado menor desse espaço, e o
      // deslocamento da vista leva o centro do modelo para o centro do espaço
      const aw = W * area.w, ah = Math.max(1, H - area.top - area.bottom);
      const dist = (radius * 0.78 * H) / (tanHalf * Math.min(aw, ah));
      camera.aspect = W / H;
      camera.setViewOffset(W, H, W / 2 - (W - aw / 2), H / 2 - (area.top + ah / 2), W, H);
      const t = (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000); last = now;
      // movimento bem pequeno: a câmera balança uns 7 graus para cada lado e sobe e desce um pouco
      const az = -0.65 + Math.sin(t * 0.35) * 0.12, el2 = 0.5 + Math.sin(t * 0.23) * 0.05;
      camera.position.set(center.x + Math.sin(az) * Math.cos(el2) * dist, center.y + Math.sin(el2) * dist, center.z + Math.cos(az) * Math.cos(el2) * dist);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      model.group.position.y = Math.sin(t * 0.8) * radius * 0.02;
      model.update?.(live, t, dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, [kind, label, area.w, area.top, area.bottom]);
  return <div ref={host} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}

export function CardParticles({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, g = cv.getContext('2d')!;
    const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2fd6a0';
    const probe = document.createElement('canvas').getContext('2d')!; probe.fillStyle = c; const hex = String(probe.fillStyle);
    const rgb = hex.startsWith('#') ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',') : '47,214,160';
    const dots = Array.from({ length: 46 }, (_, i) => ({ x: (i * 0.6180339) % 1, y: (i * 0.38196 + 0.11) % 1, v: 5 + ((i * 37) % 13), p: i * 1.9, r: 0.7 + ((i * 13) % 10) / 9 }));
    let raf = 0, visible = true; const t0 = performance.now();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(cv);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const dpr = Math.min(2, devicePixelRatio), W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const t = (now - t0) / 1000;
      for (const d of dots) {
        const y = (((d.y * H - t * d.v) % H) + H) % H, x = d.x * W + Math.sin(t * 0.6 + d.p) * 12;
        const a = (0.25 + 0.3 * Math.sin(t * 1.8 + d.p)) * Math.min(1, y / (H * 0.2), (H - y) / (H * 0.2));
        if (a <= 0.02) continue;
        g.fillStyle = `rgba(${rgb},${a.toFixed(3)})`; g.beginPath(); g.arc(x, y, d.r, 0, Math.PI * 2); g.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);
  return <canvas ref={ref} className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
