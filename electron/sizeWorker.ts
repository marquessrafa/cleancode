// Calcula o tamanho de pastas de instalação em segundo plano.
import { parentPort, workerData } from 'worker_threads';
import * as W from './platform/fs';

const items: { id: string; path: string }[] = workerData.items;
for (const it of items) {
  const deadline = Date.now() + 20000;
  let total = 0;
  const stack = [it.path];
  while (stack.length && Date.now() < deadline) {
    const dir = stack.pop()!;
    W.listDir(dir, (e) => {
      if (e.attr & W.ATTR.DIRECTORY) { if (!(e.attr & W.ATTR.REPARSE)) stack.push(W.join(dir, e.name)); }
      else total += e.size;
    });
  }
  parentPort!.postMessage({ id: it.id, size: total, partial: stack.length > 0 });
}
parentPort!.postMessage({ done: true });
