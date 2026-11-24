// Partes do dossiê comuns ao macOS e ao Windows: tecnologias pelos arquivos do app, arquivos de licença
// e tamanho de pastas com limite de tempo.
import fs from 'fs';
import path from 'path';
import type { DossierFile } from './types';

/** Lista nomes até `depth` níveis (no máximo `cap` entradas), sem seguir links. */
export function walkNames(root: string, depth: number, cap = 4000): { rel: string; dir: boolean }[] {
  const out: { rel: string; dir: boolean }[] = [];
  const go = (dir: string, rel: string, d: number) => {
    if (out.length >= cap) return;
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= cap) return;
      const r = rel ? rel + '/' + e.name : e.name;
      const isDir = e.isDirectory() && !e.isSymbolicLink();
      out.push({ rel: r, dir: isDir });
      // pacotes de framework e de idiomas não ajudam a identificar nada
      if (isDir && d > 0 && !/\.(lproj|nib|storyboardc|car)$/i.test(e.name) && !/^(locales|_CodeSignature)$/i.test(e.name)) go(path.join(dir, e.name), r, d - 1);
    }
  };
  go(root, '', depth);
  return out;
}

const TECH: [RegExp, string][] = [
  [/(^|\/)Electron Framework\.framework$|(^|\/)resources\/app\.asar$|(^|\/)Resources\/app\.asar$/i, 'Electron'],
  [/(^|\/)nw\.dll$|(^|\/)nwjs Framework\.framework$/i, 'NW.js'],
  [/(^|\/)libcef\.dll$|Chromium Embedded Framework\.framework$/i, 'Chromium Embedded (CEF)'],
  [/Chrome Framework\.framework$|(^|\/)chrome_elf\.dll$|(^|\/)chrome\.dll$|Edge Framework\.framework$|(^|\/)msedge\.dll$/i, 'Chromium'],
  [/(^|\/)WebView2Loader\.dll$/i, 'WebView2'],
  [/(^|\/)Qt[56]?Core(\.dll|\.framework)$|(^|\/)QtCore\.framework$/i, 'Qt'],
  [/(^|\/)FlutterMacOS\.framework$|(^|\/)flutter_windows\.dll$/i, 'Flutter'],
  [/(^|\/)UnityPlayer\.(dll|dylib)$|(^|\/)UnityPlayer\.app$|(^|\/)Data\/Managed\/UnityEngine\.dll$|_Data\/Managed\/UnityEngine\.dll$/i, 'Unity'],
  [/(^|\/)Engine\/Binaries\/|(-Shipping\.exe$)|(^|\/)UE4Game|(^|\/)UnrealEngine/i, 'Unreal Engine'],
  [/(^|\/)godot[^/]*\.(exe|pck)$|\.pck$/i, 'Godot'],
  [/(^|\/)coreclr\.dll$|\.runtimeconfig\.json$|(^|\/)hostfxr\.dll$/i, '.NET'],
  [/(^|\/)(mono|MonoBleedingEdge)\//i, 'Mono'],
  [/(^|\/)(jre|jbr|jdk)[^/]*\/|(^|\/)java(w)?\.exe$|\.jar$/i, 'Java'],
  [/(^|\/)python3\d*\.(dll|dylib)$|(^|\/)Python\.framework$/i, 'Python'],
  [/(^|\/)Sparkle\.framework$/i, 'Sparkle (atualizações)'],
  [/(^|\/)Squirrel\.framework$|(^|\/)Update\.exe$/i, 'Squirrel (atualizações)'],
  [/(^|\/)steam_api(64)?\.(dll|dylib)$|(^|\/)libsteam_api\.dylib$/i, 'Steamworks'],
  [/(^|\/)EOSSDK-Win(32|64)-Shipping\.dll$|(^|\/)libEOSSDK/i, 'Epic Online Services'],
  [/(^|\/)(EasyAntiCheat|BattlEye)(\/|_|\.)/i, 'Anti-cheat'],
  [/(^|\/)vulkan-1\.dll$|(^|\/)libMoltenVK\.dylib$/i, 'Vulkan'],
  [/(^|\/)d3d12\.dll$|(^|\/)D3D12\//i, 'DirectX 12'],
  [/(^|\/)nvngx_dlss\.dll$/i, 'NVIDIA DLSS'],
  [/(^|\/)libxess\.dll$/i, 'Intel XeSS'],
  [/(^|\/)amd_fidelityfx/i, 'AMD FidelityFX'],
  [/(^|\/)ffmpeg(\.dll|\.dylib)$|(^|\/)libffmpeg\.(dylib|so)$|(^|\/)avcodec/i, 'FFmpeg'],
  [/(^|\/)libmono|(^|\/)GameAssembly\.dll$/i, 'Unity IL2CPP'],
  [/(^|\/)Tauri|(^|\/)tauri\.conf\.json$/i, 'Tauri'],
];

/** Tecnologias pelos nomes dos arquivos (até 4 níveis). */
export function detectTech(root: string, extra: string[] = []): string[] {
  const names = walkNames(root, 4);
  const found = new Set<string>(extra);
  for (const n of names) for (const [re, label] of TECH) if (re.test(n.rel)) found.add(label);
  if (found.has('Unity IL2CPP')) found.add('Unity');
  return [...found];
}

const LICENSE_RE = /^(licen[cs]e|eula|copying|notice|legal|third[-_ ]?party|credits|acknowledg|open[-_ ]?source|ossl|licenses?\.chromium|termsofservice|terms)/i;

/** Arquivos de licença, EULA e avisos de terceiros (até 3 níveis). */
export function findLicenses(root: string): DossierFile[] {
  const out: DossierFile[] = [];
  for (const n of walkNames(root, 3, 6000)) {
    if (n.dir) continue;
    const base = n.rel.split('/').pop()!;
    if (!LICENSE_RE.test(base) || !/(\.(txt|md|rtf|html?|pdf)|^[^.]+)$/i.test(base)) continue;
    const p = path.join(root, n.rel);
    let size = 0; try { size = fs.statSync(p).size; } catch { continue; }
    // avisos de terceiros citam várias licenças: não dá para deduzir uma só pelo texto
    const notice = /third|credits|acknowledg|open|chromium|notice/i.test(base);
    out.push({ path: p, size, kind: notice ? 'Avisos de terceiros' : licenseKind(p) || (/eula|terms/i.test(base) ? 'Contrato de uso (EULA)' : 'Licença') });
    if (out.length >= 40) break;
  }
  // a licença principal primeiro; traduções (LICENSE-fra.rtf) e avisos de terceiros depois
  const rank = (f: DossierFile) => (/avisos/i.test(f.kind) ? 20 : 0) + (/[-_.][a-z]{2,3}(-[a-z]{2,4})?\.(rtf|txt|html?)$/i.test(path.basename(f.path)) && !/\.(en|eng)\./i.test(f.path) ? 10 : 0) + f.path.split(/[\\/]/).length;
  return out.sort((a, b) => rank(a) - rank(b) || b.size - a.size);
}

/** Reconhece o tipo de licença pelos primeiros KB do arquivo. */
export function licenseKind(file: string): string | undefined {
  let txt = '';
  try { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(6000); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); txt = b.subarray(0, n).toString('utf8'); } catch { return; }
  const t = txt.replace(/\s+/g, ' ');
  if (/GNU GENERAL PUBLIC LICENSE/i.test(t)) return /Version 3/i.test(t) ? 'GPL 3.0' : /Version 2/i.test(t) ? 'GPL 2.0' : 'GPL';
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(t)) return 'LGPL';
  if (/GNU AFFERO/i.test(t)) return 'AGPL';
  if (/Mozilla Public License/i.test(t)) return 'MPL 2.0';
  if (/Apache License/i.test(t) && /Version 2\.0/i.test(t)) return 'Apache 2.0';
  if (/Permission is hereby granted, free of charge/i.test(t)) return 'MIT';
  if (/Redistribution and use in source and binary forms/i.test(t)) return 'BSD';
  if (/This is free and unencumbered software released into the public domain/i.test(t)) return 'Domínio público (Unlicense)';
  if (/END USER LICENSE AGREEMENT|LICENSE AGREEMENT|TERMS OF USE|CONTRATO DE LICEN/i.test(t)) return 'Contrato de uso (EULA)';
  return undefined;
}

/** Tamanho em disco de um arquivo ou pasta, parando no limite de tempo. */
export function sizeWithin(p: string, budgetMs = 1500): number {
  let st: fs.Stats;
  try { st = fs.lstatSync(p); } catch { return 0; }
  if (!st.isDirectory()) return st.size;
  const end = Date.now() + budgetMs;
  let total = 0;
  const stack = [p];
  while (stack.length && Date.now() < end) {
    const d = stack.pop()!;
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory() && !e.isSymbolicLink()) stack.push(f);
      else if (e.isFile()) { try { total += fs.statSync(f).size; } catch { /* */ } }
    }
  }
  return total;
}

/** Arquitetura de um executável: Mach-O (macOS) ou PE (Windows). */
export function binaryInfo(file: string): { archs: string[]; built?: number } {
  let b: Buffer;
  try { const fd = fs.openSync(file, 'r'); b = Buffer.alloc(4096); fs.readSync(fd, b, 0, 4096, 0); fs.closeSync(fd); } catch { return { archs: [] }; }
  const cpu = (t: number) => (t === 0x01000007 ? 'Intel 64 bits' : t === 0x0100000c ? 'Apple Silicon' : t === 7 ? 'Intel 32 bits' : t === 0x0200000c ? 'ARM64_32' : `cpu ${t}`);
  const m = b.readUInt32BE(0);
  if (m === 0xcafebabe || m === 0xcafebabf) {
    const n = b.readUInt32BE(4); const arr: string[] = [];
    const step = m === 0xcafebabf ? 32 : 20;
    for (let i = 0; i < Math.min(n, 8); i++) arr.push(cpu(b.readUInt32BE(8 + i * step)));
    return { archs: arr };
  }
  if (b.readUInt32LE(0) === 0xfeedfacf || b.readUInt32LE(0) === 0xfeedface) return { archs: [cpu(b.readUInt32LE(4))] };
  if (b.readUInt16LE(0) === 0x5a4d) {
    const pe = b.readUInt32LE(0x3c);
    if (pe + 24 > b.length || b.readUInt32LE(pe) !== 0x4550) return { archs: [] };
    const mach = b.readUInt16LE(pe + 4);
    const ts = b.readUInt32LE(pe + 8) * 1000;
    const arch = mach === 0x8664 ? 'x64' : mach === 0x14c ? 'x86 (32 bits)' : mach === 0xaa64 ? 'ARM64' : `0x${mach.toString(16)}`;
    // builds reproduzíveis gravam um hash no lugar da data: só vale se for plausível
    const ok = ts > Date.UTC(1998, 0, 1) && ts < Date.now() + 86400000;
    return { archs: [arch], built: ok ? ts : undefined };
  }
  return { archs: [] };
}
