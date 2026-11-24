// Prévia da tela de ventoinhas, só na versão de desenvolvimento (npm run preview:ventoinhas).
// Simula uma placa com sete saídas (duas com ventoinha ligada) e uma placa de vídeo. As ventoinhas simuladas obedecem
// à configuração e aos testes, para dar para conferir a tela sem o helper de administrador. O app instalado nunca
// entra neste modo: o processo principal só usa a prévia quando o app não está empacotado.
import type { FanConfig, FanState, FanControlInfo, FanTempSource } from './platform/types';

const BOARD = 'Placa-mãe de exemplo (Chip de sensores de exemplo)';
const FANS: { id: string; name: string; hw: string; kind: FanControlInfo['kind']; max: number; auto: number }[] = [
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `/lpc/exemplo/0/control/${i - 1}`, name: `Fan #${i}`, hw: BOARD, kind: 'board' as const, max: i === 2 ? 2900 : i === 5 ? 1600 : 0, auto: i === 2 ? 94 : 70 })),
  { id: '/gpu-amd/0/control/0', name: 'GPU Fan', hw: 'Placa de vídeo de exemplo', kind: 'gpu', max: 3000, auto: 35 },
];
const tests = new Map<string, number>();
const start = Date.now();

function interp(pts: [number, number][], t: number) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, pa] = pts[i - 1], [b, pb] = pts[i]; return pa + ((pb - pa) * (t - a)) / (b - a); }
  return pts[pts.length - 1][1];
}

export function previewTest(id: string, pct: number | null) { if (pct === null) tests.delete(id); else tests.set(id, pct); }
export function previewState(cfg: Record<string, FanConfig>): FanState {
  const s = (Date.now() - start) / 1000;
  const temps: FanTempSource[] = [
    { id: '/intelcpu/0/temperature/0', name: 'CPU Package', hw: 'Processador de exemplo', kind: 'cpu', value: Math.round(52 + 14 * Math.sin(s / 9)) },
    { id: '/gpu-amd/0/temperature/0', name: 'GPU Core', hw: 'Placa de vídeo de exemplo', kind: 'gpu', value: Math.round(44 + 8 * Math.sin(s / 13)) },
    { id: '/lpc/exemplo/0/temperature/0', name: 'Motherboard', hw: BOARD, kind: 'board', value: 36 },
  ];
  const controls: FanControlInfo[] = FANS.map((f) => {
    const c = cfg[f.id];
    let pct = f.auto, status: FanControlInfo['status'];
    const floor = (p: number) => (c?.pump ? Math.max(60, p) : p);
        if (f.kind === 'gpu') { /* placa AMD recente: só leitura, como no app de verdade */ }
    else if (tests.has(f.id)) { pct = floor(tests.get(f.id)!); status = { mode: 'fixed', pct, read: pct, error: null }; }
    else if (c?.mode === 'fixed' && typeof c.value === 'number') { pct = floor(c.value); status = { mode: 'fixed', pct, read: pct, error: null }; }
    else if (c?.mode === 'curve' && c.points?.length) {
      const t = temps.find((x) => x.id === c.source);
      if (t) { pct = floor(Math.round(interp(c.points, t.value))); status = { mode: 'curve', pct, read: pct, error: null }; }
      else status = { mode: 'curve', pct: null, error: 'nosource' };
    }
    return { id: f.id, name: f.name, hw: f.hw, kind: f.kind, pct, rpm: Math.round((f.max * pct) / 100), status, locked: f.kind === 'gpu' || undefined };
  });
  return { available: true, active: true, helperReady: true, controls, temps, emergency: false, preview: true };
}
