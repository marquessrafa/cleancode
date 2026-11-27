// Ventoinha de gabinete desenhada pelo app (sem foto e sem marca): moldura quadrada branca com cantos chanfrados,
// faixas de LED na diagonal dos cantos e nas laterais, nove pás translúcidas e o miolo com espelho infinito.
// Parada, ela fica apagada (branca, com o miolo preto). Quando gira, os LEDs acendem na cor de destaque do app, e a
// luz passa pelas pás. A rotação é a real, com o mesmo borrão de movimento da placa de vídeo.
// - FanSpinner: uma ventoinha, para o cartão pequeno.
// - FanTrioHero: três ventoinhas unidas lado a lado, de frente, com o mesmo layout da placa grande.
import React, { useEffect, useRef } from 'react';
import { accentRgb, spinner, techBackground, WIDE } from './GpuArt';
import { due, paused } from '../lib/pause';

const BLADES = 9, SAMPLES = 12;
const lit = (on: number, off: string, rgb: string, a = 1) => `rgba(${rgb},${(a * on).toFixed(3)})`;

function bladePath(g: CanvasRenderingContext2D, rh: number, rt: number) {
  g.beginPath();
  g.moveTo(Math.cos(0) * rh, Math.sin(0) * rh);
  g.quadraticCurveTo(Math.cos(0.15) * rt * 0.75, Math.sin(0.15) * rt * 0.75, Math.cos(0.55) * rt, Math.sin(0.55) * rt);
  g.arc(0, 0, rt, 0.55, 1.05);
  g.quadraticCurveTo(Math.cos(0.75) * rt * 0.6, Math.sin(0.75) * rt * 0.6, Math.cos(0.42) * rh, Math.sin(0.42) * rh);
  g.arc(0, 0, rh, 0.42, 0, true);
  g.closePath();
}

/** Desenha uma ventoinha com o canto de cima à esquerda em (x, y) e lado S. on: 0 (apagada) a 1 (acesa). */
export function drawFan(g: CanvasRenderingContext2D, x: number, y: number, S: number, angle: number, spread: number, on: number, rgb: string, t: number, leds: 'sides' | 'topBottom' = 'sides') {
  const cx = x + S / 2, cy = y + S / 2, R = S * 0.435, rh = S * 0.155, rt = S * 0.425;
  g.save();
  // moldura
  const fr = g.createLinearGradient(x, y, x + S, y + S); fr.addColorStop(0, '#f1f3f5'); fr.addColorStop(1, '#d2d6db');
  g.fillStyle = fr; g.beginPath(); g.roundRect(x, y, S, S, S * 0.035); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = Math.max(1, S * 0.004); g.stroke();
  // furos dos parafusos
  g.fillStyle = '#2a2d31';
  for (const [px, py] of [[0.075, 0.075], [0.925, 0.075], [0.075, 0.925], [0.925, 0.925]]) { g.beginPath(); g.roundRect(x + px * S - S * 0.022, y + py * S - S * 0.018, S * 0.044, S * 0.036, S * 0.01); g.fill(); }
  // faixas de LED em dois lados opostos, ligadas às diagonais dos cantos. Nos outros dois lados (onde uma ventoinha
  // encosta na outra) não existe LED. sides: esquerda e direita (ventoinha em pé); topBottom: em cima e embaixo (deitada)
  const runs: [number, number][][] = leds === 'sides'
    ? [[[0.25, 0.035], [0.035, 0.25], [0.035, 0.75], [0.25, 0.965]], [[0.75, 0.035], [0.965, 0.25], [0.965, 0.75], [0.75, 0.965]]]
    : [[[0.035, 0.25], [0.25, 0.035], [0.75, 0.035], [0.965, 0.25]], [[0.035, 0.75], [0.25, 0.965], [0.75, 0.965], [0.965, 0.75]]];
  g.beginPath(); for (const run of runs) run.forEach(([a, b], i) => (i ? g.lineTo(x + a * S, y + b * S) : g.moveTo(x + a * S, y + b * S)));
  g.lineCap = 'round';
  g.lineJoin = 'round'; g.lineWidth = S * 0.013;
  g.strokeStyle = 'rgba(150,156,164,.55)'; g.shadowBlur = 0; g.stroke();
  if (on > 0.01) { g.strokeStyle = lit(on, '', rgb); g.shadowColor = `rgba(${rgb},${on})`; g.shadowBlur = S * 0.05; g.stroke(); }
  g.shadowBlur = 0;
  // abertura: fundo claro (apagada) ou cheio de luz (acesa)
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
  const hole = g.createRadialGradient(cx, cy, rh, cx, cy, R);
  hole.addColorStop(0, '#c9cdd2'); hole.addColorStop(1, '#e4e7ea');
  g.fillStyle = hole; g.fill();
  if (on > 0.01) {
    const glow = g.createRadialGradient(cx, cy, rh, cx, cy, R);
    glow.addColorStop(0, `rgba(${rgb},${0.55 * on})`); glow.addColorStop(0.7, `rgba(${rgb},${0.85 * on})`); glow.addColorStop(1, `rgba(${rgb},${0.6 * on})`);
    g.fillStyle = glow; g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = S * 0.006; g.stroke();
  // pás translúcidas, com borrão de movimento (cada cópia é um instante do giro durante o quadro)
  g.save(); g.translate(cx, cy);
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
  for (let k = 1; k <= SAMPLES; k++) {
    g.save(); g.globalAlpha = 1 / k; g.rotate(angle + (spread * (k - 1)) / SAMPLES);
    for (let b = 0; b < BLADES; b++) {
      g.save(); g.rotate((b / BLADES) * Math.PI * 2); bladePath(g, rh, rt);
      g.fillStyle = on > 0.01 ? `rgba(${mix('255,255,255', rgb, on * 0.6)},0.82)` : 'rgba(250,251,252,.92)';
      g.fill(); g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = Math.max(0.6, S * 0.003); g.stroke();
      g.restore();
    }
    g.restore();
  }
  g.restore();
  // miolo: preto (apagado) ou túnel de espelho infinito (aceso)
  g.beginPath(); g.arc(cx, cy, rh, 0, Math.PI * 2); g.fillStyle = '#0b0c0e'; g.fill();
  g.strokeStyle = '#9aa0a8'; g.lineWidth = S * 0.012; g.stroke();
  if (on > 0.01) {
    for (let i = 0; i < 8; i++) {
      const r = rh * (0.92 - i * 0.105), pulse = 0.65 + 0.35 * Math.sin(t * 2 - i * 0.7);
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
      g.strokeStyle = `rgba(${rgb},${(on * pulse * (1 - i / 9)).toFixed(3)})`; g.lineWidth = Math.max(0.8, S * 0.006);
      g.shadowColor = `rgba(${rgb},${on * 0.8})`; g.shadowBlur = i < 2 ? S * 0.03 : 0; g.stroke();
    }
    g.shadowBlur = 0;
  }
  g.restore();
}
function mix(a: string, b: string, k: number) { const A = a.split(',').map(Number), B = b.split(',').map(Number); return A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(','); }

/** Liga o desenho a um canvas: gira na rotação real e acende os LEDs devagar quando a ventoinha começa a girar. */
function useFanCanvas(rpm: number | undefined, draw: (g: CanvasRenderingContext2D, W: number, H: number, angle: number, spread: number, on: number, rgb: string, t: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rpmRef = useRef(rpm || 0); rpmRef.current = rpm || 0;
  const drawRef = useRef(draw); drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current!, g = cv.getContext('2d')!;
    const spin = spinner(rpmRef.current, 0.26, 2.3, 0.6), rgb = accentRgb(cv), t0 = performance.now();
    let raf = 0, last = t0, visible = true, on = rpmRef.current > 50 ? 1 : 0;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(cv);
    const gate = { t: 0 };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const { angle, spread } = spin(rpmRef.current, dt);
      on += ((rpmRef.current > 50 ? 1 : 0) - on) * Math.min(1, dt * 3);
      if (!visible || paused() || !due(gate, now)) return;
      const dpr = Math.min(2, devicePixelRatio), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      drawRef.current(g, W, H, angle, spread, on, rgb, (now - t0) / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);
  return ref;
}

export function FanSpinner({ rpm, size = 54 }: { rpm?: number; size?: number }) {
  const ref = useFanCanvas(rpm, (g, W, H, angle, spread, on, rgb, t) => { const S = Math.min(W, H) * 0.96; drawFan(g, (W - S) / 2, (H - S) / 2, S, angle, spread, on, rgb, t); });
  return <canvas ref={ref} className="shrink-0" style={{ width: size, height: size }} />;
}

/** plain: sem o fundo de partículas e sem sumir nas bordas, com as três ventoinhas no centro (usado no widget). */
export function FanTrioHero({ rpm, height = 300, plain = false }: { rpm?: number; height?: number; plain?: boolean }) {
  const ref = useFanCanvas(rpm, (g, W, H, angle, spread, on, rgb, t) => {
    // tela larga: as três alinhadas à esquerda, sumindo para a direita; tela estreita: no centro, sumindo para baixo
    const side = !plain && window.innerWidth >= WIDE;
    // no widget (plain), as três ocupam quase toda a largura
    const S = plain ? Math.min(H * 0.96, (W * 0.96) / 3) : side ? Math.min(H * 0.78, (W * 0.44) / 3) : Math.min(H * 0.82, (W * 0.62) / 3);
    const x0 = side ? 2 : (W - S * 3) / 2, y0 = (H - S) / 2;
    if (!plain) techBackground(g, W, H, t, rgb, side ? S * 1.5 : W / 2, H * 0.75);
    for (let i = 0; i < 3; i++) drawFan(g, x0 + i * S, y0, S, angle + i * 0.7, spread, on, rgb, t, 'topBottom');
  });
  return (
    <div className="pointer-events-none relative w-full" style={{ height }}>
      <div className={plain ? 'absolute inset-0' : 'gpu-hero absolute inset-0 overflow-hidden'}><canvas ref={ref} className="absolute inset-0 h-full w-full" /></div>
    </div>
  );
}
