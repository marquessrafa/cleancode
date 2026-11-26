// Grava as imagens animadas do README (WebP animado) direto do app, pelo protocolo de depuração do Chromium (CDP).
//
// Como usar (Windows, PowerShell, na pasta do projeto):
//   npm run build
//   $env:CLEANCODE_PROFILE='readme'; $env:CLEANCODE_LANG='pt'; $env:CLEANCODE_PREVIEW_FANS='1'
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333 "C:\Windows"
//   node scripts/readme-shots.cjs 9333 docs/screenshots [cena1,cena2...]
//
// - O caminho no fim do comando do Electron faz o app analisar essa pasta (as telas de Análise de disco precisam de uma
//   análise). Use uma pasta sem dados pessoais e sem a lista dos seus programas, como "C:\Windows".
// - Privacidade (AGENTS.md, seção 6): antes de cada gravação, o script troca nomes de usuário, nome do computador,
//   endereços IP e MAC por valores genéricos em todo o texto da tela, e continua trocando enquanto a tela muda.
//   Textos desenhados em canvas não passam por essa troca, então o script desliga os rótulos do treemap.
// - Cada cena vira um WebP animado: o Chromium grava cada quadro como WebP (Page.captureScreenshot), e o script junta os
//   quadros num arquivo só (contêiner RIFF com os blocos VP8X, ANIM e ANMF). Quadros iguais em sequência viram um quadro
//   mais longo, para o arquivo ficar menor.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const [port, outDir, only] = process.argv.slice(2);
if (!port || !outDir) { console.error('uso: node scripts/readme-shots.cjs <porta> <pasta-saida> [cenas]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

// ---------- dados pessoais que nunca podem aparecer ----------
function personal() {
  const words = new Set([os.userInfo().username, os.hostname(), process.env.USERNAME, process.env.COMPUTERNAME].filter(Boolean));
  try { // nome completo da conta do Windows
    const full = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_UserAccount -Filter \\"Name=\'$env:USERNAME\'\\").FullName"', { encoding: 'utf8' }).trim();
    // o nome completo inteiro, e cada parte com 5 letras ou mais (partes curtas, como "GPT", trocariam nomes de programas)
    if (full) { words.add(full); full.split(/\s+/).filter((w) => w.length >= 5).forEach((w) => words.add(w)); }
  } catch { /* sem nome completo */ }
  try { // nome da rede Wi-Fi
    const ssid = /^\s*SSID\s*:\s*(.+)$/m.exec(execSync('netsh wlan show interfaces', { encoding: 'utf8' }));
    if (ssid && ssid[1].trim()) words.add(ssid[1].trim());
  } catch { /* sem Wi-Fi */ }
  return [...words].filter((w) => w && w.length > 2).sort((a, b) => b.length - a.length);
}
const SECRETS = personal();
// só os endereços IP e MAC deste PC (um padrão genérico trocaria números de versão, como 26.0.1.12)
const NETS = Object.values(os.networkInterfaces()).flat().filter((n) => n && !n.internal);
const IPS = [...new Set(NETS.filter((n) => n.family === 'IPv4' || n.family === 4).map((n) => n.address))];
const MACS = [...new Set(NETS.map((n) => n.mac).filter((m) => m && m !== '00:00:00:00:00:00'))];
// troca de texto na página: usuário e computador viram nomes genéricos; IPs e endereços MAC viram exemplos
const SCRUB = `(() => {
  const words = ${JSON.stringify(SECRETS)}, ips = ${JSON.stringify(IPS)}, macs = ${JSON.stringify(MACS)};
  const esc = (s) => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  const re = words.length ? new RegExp(words.map(esc).join('|'), 'gi') : null;
  const fix = (t) => {
    let s = t;
    if (re) s = s.replace(re, (m) => (m.toUpperCase() === m && m.length > 4 ? 'MEU-PC' : 'Usuario'));
    for (const ip of ips) s = s.split(ip).join('192.168.0.10');
    for (const mac of macs) { s = s.split(mac).join('00:11:22:33:44:55'); s = s.split(mac.toUpperCase()).join('00:11:22:33:44:55'); s = s.split(mac.replace(/:/g, '-').toUpperCase()).join('00-11-22-33-44-55'); }
    return s;
  };
  const walk = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    root.querySelectorAll && root.querySelectorAll('input,textarea').forEach((i) => { const v = fix(i.value); if (v !== i.value) i.value = v; });
    root.querySelectorAll && root.querySelectorAll('[title]').forEach((e) => { const v = fix(e.title); if (v !== e.title) e.title = v; });
  };
  walk(document.body);
  if (!window.__ccScrub) {
    window.__ccScrub = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') { const v = fix(m.target.nodeValue); if (v !== m.target.nodeValue) m.target.nodeValue = v; } else m.addedNodes.forEach((n) => n.nodeType === 3 ? (n.nodeValue = fix(n.nodeValue)) : n.nodeType === 1 && walk(n)); } });
    window.__ccScrub.observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  // a faixa "prévia com ventoinhas simuladas" é só para quem desenvolve: some nas capturas
  document.querySelectorAll('div').forEach((d) => { if (d.children.length === 2 && /prévia com ventoinhas simuladas/i.test(d.textContent || '') && d.className.includes('rounded-xl')) d.remove(); });
  return true;
})()`;

// ---------- WebP animado ----------
function chunks(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('não é WebP');
  const out = []; let o = 12;
  while (o + 8 <= buf.length) { const id = buf.toString('ascii', o, o + 4), len = buf.readUInt32LE(o + 4); out.push({ id, data: buf.subarray(o + 8, o + 8 + len) }); o += 8 + len + (len & 1); }
  return out;
}
function frameSize(cs) {
  const vp8 = cs.find((c) => c.id === 'VP8 ');
  if (vp8) return { w: vp8.data.readUInt16LE(6) & 0x3fff, h: vp8.data.readUInt16LE(8) & 0x3fff };
  const l = cs.find((c) => c.id === 'VP8L');
  if (l) { const b = l.data.readUInt32LE(1); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  throw new Error('quadro sem imagem');
}
const u24 = (n) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255]);
const chunk = (id, data) => { const h = Buffer.alloc(8); h.write(id, 0, 'ascii'); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
function animatedWebp(frames) {
  // junta quadros iguais em sequência
  const merged = [];
  for (const f of frames) { const last = merged[merged.length - 1]; if (last && last.buf.equals(f.buf)) last.ms += f.ms; else merged.push({ ...f }); }
  const parsed = merged.map((f) => { const cs = chunks(f.buf); return { cs, ms: f.ms, ...frameSize(cs) }; });
  const W = Math.max(...parsed.map((p) => p.w)), H = Math.max(...parsed.map((p) => p.h));
  const vp8x = Buffer.concat([Buffer.from([0x02 | (parsed.some((p) => p.cs.some((c) => c.id === 'ALPH')) ? 0x10 : 0), 0, 0, 0]), u24(W - 1), u24(H - 1)]);
  const anim = Buffer.from([0, 0, 0, 0, 0, 0]); // cor de fundo e repetição sem fim
  const anmfs = parsed.map((p) => {
    const body = Buffer.concat(p.cs.filter((c) => ['ALPH', 'VP8 ', 'VP8L'].includes(c.id)).map((c) => chunk(c.id, c.data)));
    const head = Buffer.concat([u24(0), u24(0), u24(p.w - 1), u24(p.h - 1), u24(Math.min(0xffffff, Math.round(p.ms))), Buffer.from([0x02])]); // sem mistura com o quadro anterior
    return chunk('ANMF', Buffer.concat([head, body]));
  });
  const payload = Buffer.concat([Buffer.from('WEBP'), chunk('VP8X', vp8x), chunk('ANIM', anim), ...anmfs]);
  const riff = Buffer.alloc(8); riff.write('RIFF', 0, 'ascii'); riff.writeUInt32LE(payload.length, 4);
  return { buf: Buffer.concat([riff, payload]), frames: parsed.length, W, H };
}

// ---------- cenas ----------
// nav: item da barra lateral. tab: aba da tela. run: ações antes e durante a gravação. frames e every (ms) definem a duração.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCENES = [
  { file: 'hero', nav: 'Monitor de hardware', tab: 'Visão geral', frames: 48, every: 110, wait: 4000, w: 1600, h: 900, scale: 0.75 },
  { file: 'overview', nav: 'Visão geral', frames: 24, every: 140, scroll: 260 },
  { file: 'visual', nav: 'Visualizações', frames: 24, every: 140, wait: 2500, hover: true },
  { file: 'types', nav: 'Tipos de arquivo', frames: 20, every: 150, scroll: 300 },
  { file: 'smartcare', nav: 'Cuidados Inteligentes', frames: 20, every: 150, scroll: 240 },
  { file: 'cleanup', nav: 'Limpeza', frames: 20, every: 150, scroll: 300 },
  { file: 'performance', nav: 'Desempenho', frames: 20, every: 150, scroll: 300 },
  { file: 'protection', nav: 'Proteção', frames: 20, every: 150, scroll: 300 },
  { file: 'repairs', nav: 'Registro', frames: 20, every: 150, scroll: 300 },
  { file: 'browsers', nav: 'Navegadores', frames: 20, every: 150, scroll: 300 },
  { file: 'game', nav: 'Modo Jogo', frames: 20, every: 150, scroll: 300 },
  { file: 'hardware', nav: 'Monitor de hardware', tab: 'Visão geral', frames: 36, every: 110, wait: 3500 },
  { file: 'hw-cpu', nav: 'Monitor de hardware', tab: 'Processador', frames: 36, every: 110, wait: 3000 },
  { file: 'hw-gpu', nav: 'Monitor de hardware', tab: 'Placa de vídeo', frames: 36, every: 110, wait: 3000 },
  { file: 'hw-ram', nav: 'Monitor de hardware', tab: 'Memória', frames: 36, every: 110, wait: 3000 },
  { file: 'hw-power', nav: 'Monitor de hardware', tab: 'Energia', frames: 36, every: 110, wait: 3000 },
  { file: 'hw-board', nav: 'Monitor de hardware', tab: 'Placa-mãe', frames: 36, every: 110, wait: 3000 },
  { file: 'hw-sensors', nav: 'Monitor de hardware', tab: 'Sensores', frames: 24, every: 140, wait: 3000, scroll: 300 },
  { file: 'hw-storage', nav: 'Monitor de hardware', tab: 'Armazenamento', frames: 36, every: 110, wait: 3000 },
  { file: 'fans', nav: 'Ventoinhas', frames: 36, every: 110, wait: 2500, fans: true },
  { file: 'uninstall', nav: 'Desinstalador', frames: 20, every: 150, wait: 4000, scroll: 300 },
  // o painel tem duas colunas (detalhe à esquerda e principal à direita, 436 + 12 + 448 px, com 10 px de margem)
  { file: 'panel', panel: null, frames: 24, every: 140, w: 916, h: 800, scale: 0.8, clip: { x: 458, y: 0, width: 448, height: 800 } },
  { file: 'panel-cpu', panel: 'cpu', frames: 24, every: 140, w: 916, h: 800, scale: 0.7 },
  { file: 'panel-memory', panel: 'memory', frames: 24, every: 140, w: 916, h: 800, scale: 0.7 },
  { file: 'panel-gpu', panel: 'gpu', frames: 24, every: 140, w: 916, h: 800, scale: 0.7 },
  { file: 'panel-power', panel: 'power', frames: 24, every: 140, w: 916, h: 800, scale: 0.7 },
  { file: 'panel-storage', panel: 'storage', frames: 24, every: 140, w: 916, h: 800, scale: 0.7 },
  { file: 'panel-network', panel: 'network', frames: 24, every: 140, w: 916, h: 800, scale: 0.7 },
];

http.get(`http://127.0.0.1:${port}/json`, (res) => {
  let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => {
    const t = JSON.parse(b).find((x) => x.type === 'page' && !x.url.startsWith('devtools'));
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let id = 0; const pend = new Map();
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = (js) => send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }).then((r) => r.result?.value);
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d); pend.delete(d.id); } };
    const clickNav = (label) => ev(`(() => { const el = [...document.querySelectorAll('aside button, aside a, aside [role=button], aside div')].find((e) => e.children.length < 3 && e.textContent.trim() === ${JSON.stringify(label)}); el && el.click(); return !!el; })()`);
    const clickTab = (label) => ev(`(() => { const el = [...document.querySelectorAll('main button, button')].find((e) => e.textContent.trim() === ${JSON.stringify(label)} && !e.closest('aside')); el && el.click(); return !!el; })()`);
    const scroller = `(document.querySelectorAll('.overflow-y-auto')[1] || document.querySelector('.overflow-y-auto') || document.scrollingElement)`;
    ws.onopen = async () => {
      await send('Runtime.enable');
      // o painel só lê os dados com a janela visível: a janela de captura conta como visível mesmo atrás de outras janelas
      const visible = `Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });`;
      await send('Page.enable');
      await send('Page.addScriptToEvaluateOnNewDocument', { source: visible });
      await ev(visible + ' true');
      // rótulos do treemap ficam desligados (o canvas não passa pela troca de dados pessoais)
      await ev(`(async () => { const s = await window.cc.settingsGet(); await window.cc.settingsSet({ treemap: { ...s.treemap, labels: false } }); return true; })()`);
      const list = only ? SCENES.filter((s) => only.split(',').includes(s.file)) : SCENES;
      for (const sc of list) {
        const W = sc.w || 1440, H = sc.h || 900, S = sc.scale || 0.7;
        await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
        if (sc.panel !== undefined) {
          if (!(await ev('location.hash')).includes('panel')) { await ev(`location.hash = '#panel'; location.reload(); true`); await sleep(5000); }
          await ev(`(() => { document.querySelector('[data-cc-close]')?.click(); return true; })()`);
          if (sc.panel) {
            // abre o detalhe pelo cartão do painel (o texto de cada cartão começa pelo nome da peça)
            // cada cartão é achado pelo começo do texto; o de energia é o que mostra watts (o outro "Energia" é o da bateria)
            const match = { cpu: '^CPU', memory: '^Memória', gpu: '^GPU', power: '^Energia.*(W agora|Sem leitura)', storage: '^[A-Z]:\\\\', network: '^Rede' }[sc.panel];
            await ev(`(() => { const re = new RegExp(${JSON.stringify(match)}, 's'); const els = [...document.querySelectorAll('div, button')].filter((e) => re.test((e.innerText || '').trim()) && getComputedStyle(e).cursor === 'pointer'); els.sort((a, b) => a.innerText.length - b.innerText.length); const el = els[0]; el && el.click(); return !!el; })()`);
          }
          await sleep(2500);
        } else {
          if ((await ev('location.hash')).includes('panel')) { await ev(`location.hash = ''; location.reload(); true`); await sleep(6000); }
          await ev(`[...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Começar a usar')?.click(); true`);
          await clickNav(sc.nav); await sleep(1200);
          if (sc.tab) { await clickTab(sc.tab); }
          await ev(`${scroller}?.scrollTo(0, 0); true`);
          await sleep(sc.wait || 2000);
        }
        await ev(SCRUB);
        const frames = [];
        for (let i = 0; i < sc.frames; i++) {
          const t0 = Date.now();
          if (sc.scroll) await ev(`${scroller}?.scrollTo({ top: ${Math.round(sc.scroll * Math.sin((i / sc.frames) * Math.PI))}, behavior: 'instant' }); true`);
          if (sc.hover) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(W * (0.35 + 0.4 * (i / sc.frames))), y: Math.round(H * (0.45 + 0.1 * Math.sin(i / 3))) });
          if (sc.fans && i === Math.floor(sc.frames * 0.45)) await ev(`(() => { const b = [...document.querySelectorAll('button')].filter((e) => /RPM/.test(e.textContent) && e.querySelector('svg')); b[1]?.click(); return true; })()`);
          await ev(SCRUB);
          const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 62, clip: { ...(sc.clip || { x: 0, y: 0, width: W, height: H }), scale: S } });
          frames.push({ buf: Buffer.from(shot.data, 'base64'), ms: sc.every });
          const left = sc.every - (Date.now() - t0); if (left > 0) await sleep(left);
        }
        const out = animatedWebp(frames);
        const file = path.join(outDir, sc.file + '.webp');
        fs.writeFileSync(file, out.buf);
        console.log(`${sc.file}.webp  ${out.W}x${out.H}  ${out.frames} quadros  ${(out.buf.length / 1024).toFixed(0)} KB`);
      }
      await send('Emulation.clearDeviceMetricsOverride');
      ws.close(); process.exit(0);
    };
  });
}).on('error', (e) => { console.error(e.message); process.exit(1); });
