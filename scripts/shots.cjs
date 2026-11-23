// Percorre as páginas pela barra lateral e salva capturas (uso em teste).
// uso: node scripts/shots.cjs <porta> <pasta-saida> <pasta-para-varrer>
const http = require('http');
const fs = require('fs');
const path = require('path');
const [port, outDir, scanPath] = process.argv.slice(2);
const pages = ['Explorador', 'Visualizações', 'Tipos de arquivo', 'Idade dos arquivos', 'Maiores arquivos', 'Pesquisa avançada', 'Histórico e comparação', 'Descoberta', 'Desinstalador', 'Configurações'];
http.get(`http://127.0.0.1:${port}/json`, (res) => {
  let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => {
    const t = JSON.parse(b).find((x) => x.type === 'page');
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let id = 0; const pend = new Map(); const errors = [];
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = (js) => send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }).then((r) => r.result?.value);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d); pend.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' '));
    };
    ws.onopen = async () => {
      await send('Runtime.enable');
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      // inicia varredura pela UI: o evento open-path é simulado pelo próprio store via scanStart + reload não é possível, então usa o botão de pasta recente
      for (const p of pages) {
        await ev(`[...document.querySelectorAll('aside button')].find(b=>b.textContent.trim()===${JSON.stringify(p)})?.click()`);
        await sleep(p === 'Descoberta' || p === 'Desinstalador' ? 3500 : 1500);
        const s = await send('Page.captureScreenshot', { format: 'png' });
        const f = path.join(outDir, 'shot-' + p.split(' ')[0].normalize('NFD').replace(/[^\w]/g, '') + '.png');
        fs.writeFileSync(f, Buffer.from(s.data, 'base64'));
      }
      console.log(JSON.stringify({ errors: errors.slice(0, 20) }));
      ws.close(); process.exit(0);
    };
  });
});
