// Localiza a pasta de publicação de atualizações pelo identificador gravado no app,
// mesmo que a pasta do projeto tenha sido movida para outro lugar.
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as W from './platform/fs';
import { FEED_FILE } from './updater';

const MARKER = 'cleancode-feed.json';
const SKIP = /^(node_modules|\.git|\.svn|appdata|windows|program files( \(x86\))?|programdata|\$recycle\.bin|system volume information|recovery|perflogs|msocache|windowsapps|dist|dist-electron|release-build|win-unpacked|\$windows\.~ws|\$windows\.~bt|config\.msi|library|system|private|volumes|cores)$/i;

/** A pasta contém o marcador com o mesmo identificador? */
export function isFeed(dir: string, id: string): boolean {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8'));
    return j && j.id === id && fs.existsSync(path.join(dir, FEED_FILE));
  } catch { return false; }
}

function roots(hint: string): string[] {
  const home = os.homedir();
  const out = new Set<string>();
  // ao redor do último local conhecido (ex.: pasta renomeada ou movida para perto)
  if (hint) { let p = path.dirname(hint); for (let i = 0; i < 3 && p && p !== path.dirname(p); i++) { out.add(p); p = path.dirname(p); } }
  for (const sub of ['Desktop', 'Área de Trabalho', 'Documents', 'Documentos', 'Downloads', 'source', 'repos', 'Projects', 'Projetos', 'dev', 'code']) out.add(path.join(home, sub));
  try { for (const e of fs.readdirSync(home, { withFileTypes: true })) if (e.isDirectory() && /^OneDrive/i.test(e.name)) { out.add(path.join(home, e.name)); out.add(path.join(home, e.name, 'Desktop')); out.add(path.join(home, e.name, 'Documents')); } } catch { /* */ }
  out.add(home);
  for (const d of W.drives()) if (d.type === 'Local' || d.type === 'Removível') out.add(d.root);
  return [...out].filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}

/** Busca em largura, limitada em profundidade e tempo, sem bloquear o processo. */
export async function locateFeed(id: string, hint: string, opts = { depth: 4, budgetMs: 6000, maxDirs: 40000 }): Promise<string | null> {
  if (hint && isFeed(hint, id)) return hint;
  const deadline = Date.now() + opts.budgetMs;
  const seen = new Set<string>();
  let visited = 0;
  for (const root of roots(hint)) {
    let level: string[] = [root];
    for (let depth = 0; depth <= opts.depth && level.length; depth++) {
      const next: string[] = [];
      for (const dir of level) {
        const key = dir.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (++visited > opts.maxDirs || Date.now() > deadline) return null;
        if (path.basename(dir).toLowerCase() === 'release' && isFeed(dir, id)) return dir;
        let ents: fs.Dirent[];
        try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) {
          if (!e.isDirectory() || e.isSymbolicLink() || SKIP.test(e.name) || e.name.startsWith('.')) continue;
          const child = path.join(dir, e.name);
          if (e.name.toLowerCase() === 'release' && isFeed(child, id)) return child;
          next.push(child);
        }
      }
      level = next;
    }
  }
  return null;
}
