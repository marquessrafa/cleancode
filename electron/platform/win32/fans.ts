// Controle das ventoinhas no Windows, pela tarefa de administrador do LibreHardwareMonitor (helper cc-lhm).
// - O app grava o pedido em %LOCALAPPDATA%\CleanCode\fans.txt. A tarefa roda com a mesma conta e lê a mesma pasta,
//   e só essa conta (e os administradores) consegue gravar nela.
// - O pedido vale por 12 segundos, e o app renova a cada 3 segundos. Se o app travar ou fechar, o pedido vence e a
//   tarefa devolve cada ventoinha ao modo automático da placa.
// - A tarefa calcula as curvas com as leituras dela, uma vez por segundo, e aplica a proteção de temperatura
//   (100% quando o processador ou a placa de vídeo chega a 90 °C). O formato do arquivo está em Program.cs (Fans).
import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as Lhm from './lhm';
import { rivals } from './fanRivals';
import type { FanConfig, FanState, FanControlInfo, FanTempSource } from '../types';

const FILE = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CleanCode', 'fans.txt');
const LIFE = 12000, BEAT = 3000;

let config: Record<string, FanConfig> = {};
/** testes em andamento: velocidade fixa temporária, que não fica salva */
const tests = new Map<string, number>();
let paused = false;
let timer: ReturnType<typeof setInterval> | null = null;

const num = (v: number) => String(Math.round(v * 10) / 10);
/** Velocidade mínima de uma saída marcada como bomba do water cooler: uma bomba lenta ou parada esquenta o processador rápido. */
export const PUMP_MIN = 60;
// Placas de vídeo: o LibreHardwareMonitor 0.9.6 só controla placas AMD pela interface antiga do driver (Overdrive 5), e as placas
// AMD recentes ignoram esse comando sem dar erro. Por isso, o helper controla as placas AMD pelo ADLX, o SDK novo que vem no
// driver da AMD, e avisa no sensors.json (adlx: true) quando esse caminho funciona. Sem ADLX, e nas placas NVIDIA e Intel, a
// ventoinha da placa de vídeo fica só para leitura, com o selo "em breve".
let adlxOk = false;
const gpuLocked = (id: string) => id.startsWith('/gpu-') && !(adlxOk && id.startsWith('/gpu-amd/'));
function lines(until: number): string {
  const out = [`until\t${until}`];
  if (!until) return out.join('\n') + '\n';
  const floor = (id: string, p: number) => (config[id]?.pump ? Math.max(PUMP_MIN, p) : p);
  for (const [id, pct] of tests) if (!gpuLocked(id)) out.push(`fixed\t${id}\t${num(floor(id, pct))}`);
  for (const [id, c] of Object.entries(config)) {
    if (tests.has(id) || !c || c.mode === 'auto' || gpuLocked(id)) continue;
    if (c.mode === 'fixed' && typeof c.value === 'number') out.push(`fixed\t${id}\t${num(floor(id, c.value))}`);
    else if (c.mode === 'curve' && c.source && c.points?.length) out.push(`curve\t${id}\t${c.source}\t${c.points.map(([t, p]) => `${num(t)}:${num(floor(id, p))}`).join(',')}`);
  }
  return out.join('\n') + '\n';
}
/** Grava o pedido de uma vez (arquivo temporário e troca), para a tarefa nunca ler um pedido pela metade. */
function write(until: number) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, lines(until), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch { /* tenta de novo na próxima renovação */ }
}
const wanted = () => !paused && (tests.size > 0 || Object.values(config).some((c) => c && c.mode !== 'auto'));
function pump() {
  // atualiza se o caminho ADLX está disponível (o pedido das placas AMD só sai quando ele funciona)
  Lhm.snapshot().then((s) => { if (s) adlxOk = !!s.adlx; }).catch(() => {});
  if (wanted()) { write(Date.now() + LIFE); return; }
  write(0);
  if (timer) { clearInterval(timer); timer = null; }
}

/** Aplica as configurações salvas das ventoinhas (chamado ao abrir o app e a cada mudança). */
let started = false;
export function apply(cfg: Record<string, FanConfig> | undefined) {
  // ao sair do app, a tarefa solta as ventoinhas na hora (ela também fecha logo depois, quando percebe que o app fechou).
  // Só a cópia do app que aplicou as configurações faz isso: uma segunda cópia que abre e fecha logo não mexe em nada.
  if (!started) { started = true; app.on('will-quit', () => { paused = true; write(0); }); }
  config = cfg || {};
  pump();
  if (wanted() && !timer) timer = setInterval(pump, BEAT);
}
/** Teste de uma ventoinha: velocidade fixa temporária (pct) ou fim do teste (null). */
export function test(id: string, pct: number | null) {
  if (pct === null) tests.delete(id); else tests.set(id, Math.max(0, Math.min(100, pct)));
  apply(config);
}

// Antes de encerrar a tarefa (ativar de novo ou desativar), o app solta as ventoinhas e espera a tarefa devolver
// cada uma ao modo automático. Um processo encerrado à força deixaria a ventoinha na última velocidade.
Lhm.onTaskRestart(async () => {
  const had = wanted();
  paused = true; tests.clear(); pump();
  if (had) await new Promise((r) => setTimeout(r, 2500));
}, () => { paused = false; if (started) apply(config); });

const NOT_TEMP = /warning|critical|limit|alarm|threshold|distance|tjmax/i;
const KIND: Record<string, FanControlInfo['kind']> = { GpuAmd: 'gpu', GpuNvidia: 'gpu', GpuIntel: 'gpu', Motherboard: 'board', SuperIO: 'board', EmbeddedController: 'board', Cooler: 'cooler' };
const TEMP_KIND: Record<string, string> = { Cpu: 'cpu', GpuAmd: 'gpu', GpuNvidia: 'gpu', GpuIntel: 'gpu', Motherboard: 'board', SuperIO: 'board', Storage: 'disk', Memory: 'ram' };

/** Ventoinhas que aceitam controle, temperaturas que podem guiar uma curva e o que a tarefa aplicou em cada uma. */
export async function state(): Promise<FanState> {
  const s = await Lhm.snapshot().catch(() => null);
  if (s) adlxOk = !!s.adlx;
  const active = await Lhm.advancedActive().catch(() => false);
  const controls: FanControlInfo[] = [], temps: FanTempSource[] = [];
  const status = new Map((s?.fans || []).map((f) => [f.id, f]));
  const walk = (h: Lhm.LhmHardware, top: Lhm.LhmHardware) => {
    const sensors = h.sensors || [];
    for (const x of sensors) {
      if (!x.id) continue;
      if (x.type === 'Control') {
        const fan = sensors.find((y) => y.type === 'Fan' && y.name === x.name);
        controls.push({
          id: x.id, name: x.name, hw: top === h ? h.name : `${top.name} (${h.name})`, kind: KIND[h.type] || KIND[top.type] || 'other',
          pct: x.value ?? undefined, rpm: fan?.value ?? undefined, status: status.get(x.id), locked: gpuLocked(x.id) || undefined,
        });
      } else if (x.type === 'Temperature' && typeof x.value === 'number' && x.value > 0 && x.value < 125 && !NOT_TEMP.test(x.name)) {
        temps.push({ id: x.id, name: x.name, hw: h.name, kind: TEMP_KIND[h.type] || TEMP_KIND[top.type] || 'board', value: x.value });
      }
    }
    (h.sub || []).forEach((c) => walk(c, top));
  };
  (s?.hardware || []).forEach((h) => walk(h, h));
  return {
    available: !!Lhm.helperPath(), active, helperReady: !!s?.fanControl, controls, temps,
    emergency: (s?.fans || []).some((f) => f.mode === 'emergency'),
    // outro programa só é apontado com prova: uma ventoinha que mudou sozinha ou não seguiu o pedido
    rivals: rivals({
      board: controls.some((c) => c.kind !== 'gpu' && c.status?.error === 'refused'),
      usb: controls.some((c) => c.kind !== 'gpu' && c.status?.error === 'norpm'),
      gpu: controls.some((c) => c.kind === 'gpu' && (c.status?.error === 'refused' || c.status?.error === 'norpm')),
    }),
  };
}
