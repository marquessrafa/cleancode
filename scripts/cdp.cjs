// Utilitário de teste: conecta ao Electron via CDP, executa JS e captura tela.
// uso: node scripts/cdp.cjs <porta> <saida.png|-> [js]
const http = require('http');
const fs = require('fs');
const [port, out, js] = process.argv.slice(2);
http.get(`http://127.0.0.1:${port}/json`, (res) => {
  let b = ''; res.on('data', (d) => (b += d)); res.on('end', async () => {
    const pages = JSON.parse(b).filter((x) => x.type === 'page' && !x.url.startsWith('devtools'));
    const want = process.env.CDP_URL;
    const t = (want === 'main' && pages.find((x) => !x.url.includes('#'))) || (want && want !== 'main' && pages.find((x) => x.url.includes(want))) || pages.find((x) => x.url.includes('index.html') || x.url.includes('localhost:5173')) || pages[0];
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let id = 0; const pend = new Map();
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d); pend.delete(d.id); } };
    ws.onopen = async () => {
      if (js) {
        const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
        console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r).slice(0, 4000));
      }
      if (out && out !== '-') {
        await new Promise((r) => setTimeout(r, 400));
        const s = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(out, Buffer.from(s.data, 'base64'));
        console.log('screenshot', out);
      }
      ws.close(); process.exit(0);
    };
  });
}).on('error', (e) => { console.error(e.message); process.exit(1); });
