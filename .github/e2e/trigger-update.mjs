// Teste ponta a ponta da atualização no Windows: conecta no CleanCode instalado (porta de depuração 9333),
// espera ele encontrar a versão nova e clica em "Atualizar" pelo próprio app (cc.updateStart()).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json')).json();
      const t = list.find((x) => x.type === 'page' && /index\.html(?!#panel)/.test(x.url));
      if (t) return t;
    } catch { /* o app ainda está abrindo */ }
    await sleep(1000);
  }
  throw new Error('o CleanCode não abriu a porta de depuração');
}
const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
await new Promise((r) => (ws.onopen = r));
const ev = (expr) => new Promise((r) => { const i = ++id; pend.set(i, (d) => r(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
console.log('versão instalada:', await ev('window.cc.info().then((i) => i.version)'));
let st;
for (let i = 0; i < 60; i++) {
  await ev('window.cc.updateCheck().catch(() => null)');
  st = await ev('window.cc.updateState()');
  console.log('estado:', st?.status, st?.info?.version || '');
  if (st && ['available', 'ready', 'downloading'].includes(st.status)) break;
  await sleep(5000);
}
if (!st || !['available', 'ready', 'downloading'].includes(st.status)) { console.log('nenhuma atualização encontrada'); process.exit(2); }
console.log('clicando em Atualizar…');
ev('window.cc.updateStart().then(() => "ok", (e) => "erro: " + e.message)').then((r) => console.log('updateStart:', r));
for (let i = 0; i < 40; i++) { const s = await ev('window.cc.updateState()').catch(() => null); if (!s) { console.log('o app fechou'); break; } console.log('estado:', s.status, 'etapa', s.step ?? '-'); await sleep(1000); }
process.exit(0);
