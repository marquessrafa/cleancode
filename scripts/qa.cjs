// Roteiro de QA visual via CDP: executa passos [js, esperaMs, arquivo.png?] e coleta erros do console.
// uso: node scripts/qa.cjs <porta> <pasta-saida> <passos.json>
const http = require('http');
const fs = require('fs');
const path = require('path');
const [port, outDir, stepsFile] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
http.get(`http://127.0.0.1:${port}/json`, (res) => {
  let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => {
    const t = JSON.parse(b).find((x) => x.type === 'page');
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let id = 0; const pend = new Map(); const errors = []; const outputs = [];
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d); pend.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) errors.push(d.params.type + ': ' + d.params.args.map((a) => a.value || a.description).join(' ').slice(0, 300));
    };
    ws.onopen = async () => {
      await send('Runtime.enable');
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const [js, wait, file] of steps) {
        if (js) { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); if (r.result?.value !== undefined) outputs.push(String(r.result.value).slice(0, 300)); if (r.exceptionDetails) errors.push('step: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); }
        await new Promise((r) => setTimeout(r, wait || 300));
        if (file) { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, file), Buffer.from(s.data, 'base64')); }
      }
      console.log(JSON.stringify({ outputs, errors: [...new Set(errors)].slice(0, 30) }, null, 1));
      ws.close(); process.exit(0);
    };
  });
});
