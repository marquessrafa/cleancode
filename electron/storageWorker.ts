// Mede as categorias do mapa de armazenamento (Visão geral): tamanho em disco de cada grupo de pastas,
// pulando subpastas que pertencem a outra categoria (para não contar duas vezes).
import { parentPort, workerData } from 'worker_threads';
import * as W from './platform/fs';

interface Cat { id: string; paths: string[]; exclude: string[] }
const cats: Cat[] = workerData.cats;
const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p).replace(/[\\/]+$/, '');

for (const c of cats) {
  const skip = new Set(c.exclude.map(norm));
  const deadline = Date.now() + 60000;
  let size = 0, files = 0;
  const stack = c.paths.filter((p) => !skip.has(norm(p)));
  while (stack.length && Date.now() < deadline) {
    const dir = stack.pop()!;
    W.listDir(dir, (e) => {
      if (e.attr & W.ATTR.DIRECTORY) {
        if (e.attr & W.ATTR.REPARSE) return;
        const p = W.join(dir, e.name);
        if (!skip.has(norm(p))) stack.push(p);
      } else { size += e.alloc ?? e.size; files++; }
    });
  }
  parentPort!.postMessage({ id: c.id, size, files, partial: stack.length > 0 });
}
parentPort!.postMessage({ done: true });
