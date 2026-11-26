// Jogos encontrados em qualquer pasta (ver gameFinderWorker.ts). A busca roda em segundo plano, o resultado fica salvo
// em games-found.json, na pasta de dados do app, e vale por 24 horas. Depois disso, a próxima consulta mostra a lista
// salva na hora e busca de novo em segundo plano.
import { app } from 'electron';
import { Worker } from 'worker_threads';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as W from './platform/fs';

export interface FoundGame { dir: string; name: string; kind: string }
interface Saved { at: number; list: FoundGame[] }

const file = () => path.join(app.getPath('userData'), 'games-found.json');
let saved: Saved | null = null;
let running: Promise<FoundGame[]> | null = null;
const listeners = new Set<(list: FoundGame[]) => void>();

function load(): Saved | null {
  if (saved) return saved;
  try { const s = JSON.parse(fs.readFileSync(file(), 'utf8')); if (s && Array.isArray(s.list)) saved = s; } catch { /* */ }
  return saved;
}
/** Avisa quando uma busca termina (o Desinstalador e o mapa atualizam a lista). */
export function onGamesFound(cb: (list: FoundGame[]) => void) { listeners.add(cb); return () => listeners.delete(cb); }

/** Onde procurar: todos os discos fixos no Windows; no Mac, Aplicativos, a pasta pessoal e os discos externos. */
function roots(): string[] {
  if (process.platform === 'win32') {
    try { return W.drives().filter((d) => d.total > 0 && !/cd|rom|remote|network|rede/i.test(d.type)).map((d) => d.root); } catch { return [(process.env.SystemDrive || 'C:') + '\\']; }
  }
  const out = ['/Applications', path.join(os.homedir(), 'Applications'), os.homedir()];
  try { for (const v of fs.readdirSync('/Volumes')) { const p = path.join('/Volumes', v); try { if (fs.realpathSync(p) !== '/') out.push(p); } catch { /* */ } } } catch { /* */ }
  return out.filter((p) => fs.existsSync(p));
}

/** Lista salva, sem esperar (pode estar vazia antes da primeira busca). */
export function foundGamesCached(): FoundGame[] { return load()?.list || []; }

/**
 * Lista de jogos encontrados. known: pastas dos jogos das lojas, que a busca pula.
 * Com a lista salva há menos de 24 horas (e sem refresh), devolve a lista salva.
 */
export function foundGames(known: string[], refresh = false): Promise<FoundGame[]> {
  const s = load();
  if (s && !refresh && Date.now() - s.at < 24 * 3600000) return Promise.resolve(s.list);
  if (running) return running;
  running = new Promise<FoundGame[]>((resolve) => {
    const w = new Worker(path.join(__dirname, 'gameFinderWorker.js'), { workerData: { roots: roots(), known } });
    const done = (list: FoundGame[] | null) => {
      w.terminate(); running = null;
      if (list) {
        saved = { at: Date.now(), list };
        try { fs.writeFileSync(file(), JSON.stringify(saved)); } catch { /* */ }
        for (const cb of listeners) { try { cb(list); } catch { /* */ } }
      }
      resolve(list || s?.list || []);
    };
    w.on('message', (m: any) => done(Array.isArray(m?.found) ? m.found : null));
    w.on('error', () => done(null));
  });
  return running;
}

/** Tira uma pasta da lista salva (depois que o jogo vai para a Lixeira). */
export function forgetFoundGame(dir: string) {
  const s = load(); if (!s) return;
  const k = dir.toLowerCase();
  s.list = s.list.filter((g) => g.dir.toLowerCase() !== k);
  try { fs.writeFileSync(file(), JSON.stringify(s)); } catch { /* */ }
}
