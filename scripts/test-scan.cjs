// Teste de desempenho do worker de varredura fora do Electron.
const { Worker } = require('worker_threads');
const path = require('path');
const root = process.argv[2] || 'C:\\';
const w = new Worker(path.join(__dirname, '..', 'dist-electron', 'scanWorker.js'), { workerData: { root } });
let qid = 0; const pend = new Map();
const q = (method, ...args) => new Promise((res, rej) => { const id = ++qid; pend.set(id, { res, rej }); w.postMessage({ type: 'query', id, method, args }); });
const t0 = Date.now();
let midQueried = false;
w.on('message', async (m) => {
  if (m.type === 'reply') { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m.result); }
  if (m.type === 'progress' && !midQueried && m.files > 50000) {
    midQueried = true;
    const t = Date.now(); const r = await q('flatTree', [0], {}); console.log('consulta durante varredura:', r.rows.length, 'linhas em', Date.now() - t, 'ms');
  }
  if (m.type === 'done') {
    const s = await q('summary');
    console.log('tempo', Date.now() - t0, 'ms', 'arquivos', s.files, 'pastas', s.dirs, 'GB', (s.size / 1e9).toFixed(2), 'alocado GB', (s.alloc / 1e9).toFixed(2), 'erros', s.errors);
    let t = Date.now(); const top = await q('topFiles', 0, 5); console.log('top5', Date.now() - t, 'ms', top.map((f) => f.path + ' ' + (f.size / 1e6).toFixed(0) + 'MB'));
    t = Date.now(); const ext = await q('extStats', 0); console.log('ext', Date.now() - t, 'ms', ext.slice(0, 5).map((e) => e.ext + ':' + (e.size / 1e9).toFixed(2)));
    t = Date.now(); const tm = await q('treemap', 0, {}); console.log('treemap', Date.now() - t, 'ms', tm.children.length);
    t = Date.now(); await q('setFilter', { rules: [{ field: 'ext', op: 'match', kind: 'wildcard', pattern: 'dll' }] }); const s2 = await q('summary'); console.log('filtro dll', Date.now() - t, 'ms', (s2.size / 1e9).toFixed(2), 'GB');
    console.log('memória MB', (process.memoryUsage().rss / 1e6).toFixed(0));
    process.exit(0);
  }
});
w.on('error', (e) => { console.error('worker error', e); process.exit(1); });
