// Captura a tela de um alvo CDP cuja URL contém um trecho (ex.: notify.html).
// uso: node scripts/cdp-target.cjs <porta> <trecho-url> <saida.png> [timeoutMs]
const http = require('http');
const fs = require('fs');
const [port, frag, out, timeout = '40000'] = process.argv.slice(2);
const deadline = Date.now() + +timeout;
function poll() {
  http.get(`http://127.0.0.1:${port}/json`, (res) => {
    let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => {
      const t = JSON.parse(b).find((x) => x.type === 'page' && x.url.includes(frag));
      if (!t) { if (Date.now() > deadline) { console.log('não apareceu'); process.exit(2); } return setTimeout(poll, 500); }
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      let id = 0; const pend = new Map();
      const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d); pend.delete(d.id); } };
      ws.onopen = async () => {
        await new Promise((r) => setTimeout(r, 700));
        const txt = await send('Runtime.evaluate', { expression: "document.getElementById('card').innerText", returnByValue: true });
        const s = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(out, Buffer.from(s.data, 'base64'));
        console.log('popup:', JSON.stringify(txt.result?.value), decodeURIComponent(t.url.split('?')[1] || '').slice(0, 200));
        ws.close(); process.exit(0);
      };
    });
  }).on('error', () => setTimeout(poll, 500));
}
poll();
