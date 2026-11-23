// Atualizador embutido: lê o latest.yml gerado pelo electron-builder (pasta local ou URL),
// baixa/copia o instalador e confere o SHA-512. A instalação é por SO (platform/*: installUpdate).
import { app, net } from 'electron';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface UpdateInfo { version: string; file: string; sha512: string; size: number; date?: string; source: string; base?: string }

const isUrl = (s: string) => /^https?:\/\//i.test(s);
/** Cada SO tem o próprio feed (o electron-builder usa latest.yml no Windows e latest-mac.yml no macOS). */
export const FEED_FILE = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';

export function newer(a: string, b: string): boolean {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

// Desde a 1.3.0 o feed traz uma entrada por arquitetura (pathArm64, pathX64, pathIa32...) e,
// quando vem do repositório, a pasta do Release onde estão os arquivos (base). O "path" do topo
// continua apontando para um arquivo que serve às versões antigas do atualizador.
const ARCH_KEY: Record<string, string> = { arm64: 'Arm64', x64: 'X64', ia32: 'Ia32' };
// build Intel rodando no Apple Silicon pelo Rosetta (ex.: veio do .zip Intel do topo do feed):
// baixa o build Apple Silicon para voltar a rodar nativo
let nativeArch: string | null = null;
function updateArch() {
  if (nativeArch) return nativeArch;
  nativeArch = process.arch;
  if (process.platform === 'darwin' && process.arch === 'x64') {
    try { if (execFileSync('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated'], { encoding: 'utf8', timeout: 3000 }).trim() === '1') nativeArch = 'arm64'; } catch { /* Mac Intel */ }
  }
  return nativeArch;
}
function parseLatest(yml: string) {
  const top = (k: string) => new RegExp(`^${k}:\\s*['"]?([^'"\\r\\n]+)`, 'm').exec(yml)?.[1].trim();
  const size = /^\s+size:\s*(\d+)/m.exec(yml)?.[1];
  const a = ARCH_KEY[updateArch()];
  const archFile = a ? top(`path${a}`) : undefined;
  if (archFile && top(`sha512${a}`)) return { version: top('version'), file: archFile, sha512: top(`sha512${a}`), size: Number(top(`size${a}`)) || 0, date: top('releaseDate'), base: top('base') };
  return { version: top('version'), file: top('path'), sha512: top('sha512'), size: size ? +size : 0, date: top('releaseDate'), base: top('base') };
}

async function readText(source: string, name: string): Promise<string> {
  if (isUrl(source)) {
    const r = await net.fetch(source.replace(/\/+$/, '') + '/' + name, { cache: 'no-store' } as any);
    if (!r.ok) throw new Error(`HTTP ${r.status} ao ler ${name}`);
    return r.text();
  }
  return fs.promises.readFile(path.join(source, name), 'utf8');
}

export async function checkForUpdate(source: string): Promise<UpdateInfo | null> {
  if (!source) throw new Error('Nenhuma fonte de atualizações configurada');
  // feed no repositório (raw.githubusercontent, com cache de até 5 min) + o mesmo arquivo nos anexos
  // do Release mais recente: lê os dois e fica com a versão mais nova
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//.exec(source);
  const sources = m ? [source, `https://github.com/${m[1]}/${m[2]}/releases/latest/download`] : [source];
  const read = await Promise.allSettled(sources.map((s) => readText(s, FEED_FILE)));
  const ok = read.map((r, i) => (r.status === 'fulfilled' ? { text: r.value, src: sources[i] } : null)).filter(Boolean) as { text: string; src: string }[];
  if (!ok.length) {
    const err: any = (read[0] as PromiseRejectedResult).reason;
    // feed do Mac ainda não publicado nesta fonte: sem atualização (e não um erro)
    if (process.platform === 'darwin' && (err?.code === 'ENOENT' || /HTTP 404/.test(String(err?.message)))) return null;
    throw err;
  }
  const best = ok.map((o) => ({ ...o, v: parseLatest(o.text).version || '0' })).sort((a, b) => (newer(a.v, b.v) ? -1 : newer(b.v, a.v) ? 1 : 0))[0];
  return finish(best.text, source);
}
function finish(text: string, source: string): UpdateInfo | null {
  const meta = parseLatest(text);
  if (!meta.version || !meta.file || !meta.sha512) throw new Error(`${FEED_FILE} inválido`);
  if (!newer(meta.version, app.getVersion())) return null;
  return { version: meta.version, file: meta.file, sha512: meta.sha512, size: meta.size, date: meta.date, source, base: meta.base && isUrl(meta.base) ? meta.base : undefined };
}

export async function downloadUpdate(info: UpdateInfo, onProgress: (done: number, total: number) => void): Promise<string> {
  const dir = path.join(app.getPath('temp'), 'cleancode-update');
  await fs.promises.mkdir(dir, { recursive: true });
  const dest = path.join(dir, path.basename(info.file));
  const hash = crypto.createHash('sha512');
  const out = fs.createWriteStream(dest);
  let done = 0;
  const write = (chunk: Buffer) => new Promise<void>((res, rej) => { hash.update(chunk); done += chunk.length; onProgress(done, info.size); out.write(chunk, (e) => (e ? rej(e) : res())); });
  try {
    if (isUrl(info.source) || info.base) {
      const r = await net.fetch((info.base || info.source).replace(/\/+$/, '') + '/' + encodeURIComponent(info.file).replace(/%2F/g, '/'), { cache: 'no-store' } as any);
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} ao baixar o instalador`);
      const reader = (r.body as any).getReader();
      for (;;) { const { value, done: end } = await reader.read(); if (end) break; await write(Buffer.from(value)); }
    } else {
      const rs = fs.createReadStream(path.join(info.source, info.file), { highWaterMark: 1 << 20 });
      for await (const chunk of rs) await write(chunk as Buffer);
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
  if (hash.digest('base64') !== info.sha512) { fs.unlink(dest, () => {}); throw new Error('Falha na verificação de integridade (SHA-512) do instalador'); }
  return dest;
}
