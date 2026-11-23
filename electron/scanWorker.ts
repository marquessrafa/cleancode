// Worker de varredura: mantém a árvore completa em memória (layout colunar)
// e responde consultas enquanto a varredura ainda está em andamento.
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import crypto from 'crypto';
import * as W from './platform/fs';

const port = parentPort!;
const ROOT: string = workerData.root;
const CLUSTER: number = W.clusterSize(ROOT);

// ---------- armazenamento ----------
const dName: string[] = [], dParent: number[] = [], dChildren: number[][] = [];
const dFileStart: number[] = [], dFileCount: number[] = [], dAttr: number[] = [];
const dMtime: number[] = [], dCtime: number[] = [], dAtime: number[] = [];
const dErr: number[] = [], dRemoved: number[] = [], dDepth: number[] = [];
const aSize: number[] = [], aAlloc: number[] = [], aFiles: number[] = [], aDirs: number[] = [];
const aMtime: number[] = [], aAtime: number[] = [];
const dPath: (string | undefined)[] = [];

const fName: string[] = [], fDir: number[] = [], fSize: number[] = [], fAlloc: number[] = [];
const fMtime: number[] = [], fAtime: number[] = [], fCtime: number[] = [], fAttr: number[] = [];
const fRemoved: number[] = [], fPass: number[] = [];
const fOwner: number[] = [];
const owners: string[] = [];
const ownerIdx = new Map<string, number>();

const errors: { path: string; code: number }[] = [];
let stack: number[] = [];
let scanning = false, stopped = false;
let startedAt = Date.now(), finishedAt = 0;
let compare: Map<string, { size: number; files: number }> | null = null;
let compareDate = 0;

// ---------- filtro ----------
interface Rule { field: 'name' | 'path' | 'folder' | 'ext'; op: 'match' | 'notmatch'; kind: 'wildcard' | 'regex' | 'exact'; pattern: string }
interface Filter { rules: Rule[]; minSize?: number; maxSize?: number }
let filter: Filter | null = null;
let compiled: { rule: Rule; re: RegExp }[] = [];

export function wildcardToRe(p: string): RegExp {
  const s = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + s + '$', 'i');
}
function compile(r: Rule): RegExp {
  if (r.kind === 'regex') return new RegExp(r.pattern, 'i');
  if (r.kind === 'exact') return new RegExp('^' + r.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
  return wildcardToRe(r.pattern);
}
function extOf(n: string): string {
  const i = n.lastIndexOf('.');
  return i > 0 && i < n.length - 1 ? n.slice(i + 1).toLowerCase() : '';
}
function passes(i: number): boolean {
  if (!filter) return true;
  const s = fSize[i];
  if (filter.minSize && s < filter.minSize) return false;
  if (filter.maxSize && s > filter.maxSize) return false;
  if (!compiled.length) return true;
  let hasInclude = false, included = false;
  for (const { rule, re } of compiled) {
    let target: string;
    if (rule.field === 'name') target = fName[i];
    else if (rule.field === 'ext') target = extOf(fName[i]);
    else if (rule.field === 'path') target = join(dirPath(fDir[i]), fName[i]);
    else {
      // nome de alguma pasta ancestral
      let m = false;
      for (let d = fDir[i]; d > 0; d = dParent[d]) if (re.test(dName[d])) { m = true; break; }
      if (rule.op === 'match') { hasInclude = true; if (m) included = true; } else if (m) return false;
      continue;
    }
    const m = re.test(target);
    if (rule.op === 'match') { hasInclude = true; if (m) included = true; }
    else if (m) return false;
  }
  return !hasInclude || included;
}

// ---------- utilitários ----------
const join = W.join;
function dirPath(id: number): string {
  const c = dPath[id];
  if (c !== undefined) return c;
  const p = id === 0 ? ROOT : join(dirPath(dParent[id]), dName[id]);
  dPath[id] = p;
  return p;
}
function allocFor(path: string, size: number, attr: number, known?: number): number {
  if (known !== undefined) return known; // macOS: a listagem já traz os blocos alocados
  // REPARSE cobre arquivos compactados pelo WOF (CompactOS) e marcadores de nuvem
  if (attr & (W.ATTR.COMPRESSED | W.ATTR.SPARSE | W.ATTR.RECALL_ON_DATA_ACCESS | W.ATTR.OFFLINE | W.ATTR.REPARSE)) {
    const c = W.compressedSize(path);
    if (c >= 0) return Math.ceil(c / CLUSTER) * CLUSTER;
  }
  return Math.ceil(size / CLUSTER) * CLUSTER;
}
function newDir(name: string, parent: number, e: W.RawEntry | null): number {
  const id = dName.length;
  dName.push(name); dParent.push(parent); dChildren.push([]);
  dFileStart.push(0); dFileCount.push(0);
  dAttr.push(e ? e.attr : W.ATTR.DIRECTORY);
  dMtime.push(e ? e.mtime : 0); dCtime.push(e ? e.ctime : 0); dAtime.push(e ? e.atime : 0);
  dErr.push(0); dRemoved.push(0); dDepth.push(parent < 0 ? 0 : dDepth[parent] + 1);
  aSize.push(0); aAlloc.push(0); aFiles.push(0); aDirs.push(0);
  aMtime.push(e ? e.mtime : 0); aAtime.push(e ? e.atime : 0);
  dPath.push(undefined);
  if (parent >= 0) {
    dChildren[parent].push(id);
    for (let p = parent; p >= 0; p = dParent[p]) aDirs[p]++;
  }
  return id;
}
function addAgg(dir: number, size: number, alloc: number, files: number, mt: number, at: number) {
  for (let p = dir; p >= 0; p = dParent[p]) {
    aSize[p] += size; aAlloc[p] += alloc; aFiles[p] += files;
    if (mt > aMtime[p]) aMtime[p] = mt;
    if (at > aAtime[p]) aAtime[p] = at;
  }
}

// ---------- varredura ----------
function scanDir(id: number) {
  const path = dirPath(id);
  const start = fName.length;
  const err = W.listDir(path, (e) => {
    if (e.attr & W.ATTR.DIRECTORY) {
      const cid = newDir(e.name, id, e);
      if (!(e.attr & W.ATTR.REPARSE)) stack.push(cid);
    } else {
      const i = fName.length;
      fName.push(e.name); fDir.push(id); fSize.push(e.size);
      fAlloc.push(allocFor(join(path, e.name), e.size, e.attr, e.alloc));
      fMtime.push(e.mtime); fAtime.push(e.atime); fCtime.push(e.ctime); fAttr.push(e.attr);
      fRemoved.push(0); fOwner.push(-1);
      const ok = passes(i) ? 1 : 0;
      fPass.push(ok);
      if (ok) addAgg(id, e.size, fAlloc[i], 1, e.mtime, e.atime);
    }
  });
  dFileStart[id] = start;
  dFileCount[id] = fName.length - start;
  if (err) { dErr[id] = err; if (errors.length < 20000) errors.push({ path, code: err }); }
}

let lastPath = '';
function pump() {
  const t = Date.now();
  while (stack.length && !stopped && Date.now() - t < 40) {
    const id = stack.pop()!;
    lastPath = dirPath(id);
    scanDir(id);
  }
  if (stack.length && !stopped) {
    postProgress();
    setImmediate(pump);
  } else {
    scanning = false;
    finishedAt = Date.now();
    postProgress();
    port.postMessage({ type: 'done', stopped });
  }
}
function postProgress() {
  port.postMessage({
    type: 'progress',
    scanning, files: aFiles[0] || 0, dirs: aDirs[0] || 0, size: aSize[0] || 0, alloc: aAlloc[0] || 0,
    current: lastPath, errors: errors.length, elapsed: (finishedAt || Date.now()) - startedAt, pending: stack.length,
  });
}
function startScan() {
  newDir(ROOT, -1, null);
  try {
    const st = fs.statSync(ROOT);
    dMtime[0] = st.mtimeMs; dCtime[0] = st.birthtimeMs; dAtime[0] = st.atimeMs;
  } catch { /* raiz de unidade */ }
  stack = [0]; scanning = true; stopped = false; startedAt = Date.now();
  setImmediate(pump);
}

// ---------- consultas ----------
interface RowOpts { sortBy?: string; asc?: boolean; showFiles?: boolean; hideEmpty?: boolean }
function liveChildren(id: number, o: RowOpts): number[] {
  const out: number[] = [];
  for (const c of dChildren[id]) {
    if (dRemoved[c]) continue;
    if (o.hideEmpty && aFiles[c] === 0) continue;
    out.push(c);
  }
  return out;
}
function liveFiles(id: number): number[] {
  const out: number[] = [];
  const s = dFileStart[id], n = dFileCount[id];
  for (let i = s; i < s + n; i++) if (!fRemoved[i] && fPass[i]) out.push(i);
  return out;
}
function dirRow(id: number, parentSize: number, depth = 0, expanded = false, o: RowOpts = {}) {
  const path = compare ? dirPath(id) : undefined;
  const prev = compare && path ? compare.get(path.toLowerCase()) : undefined;
  return {
    id, kind: 'dir', name: dName[id], depth, expanded,
    size: aSize[id], alloc: aAlloc[id], files: aFiles[id], dirs: aDirs[id],
    pct: parentSize > 0 ? aSize[id] / parentSize : (id === 0 ? 1 : 0),
    mtime: aMtime[id], atime: aAtime[id], ctime: dCtime[id], attr: dAttr[id],
    err: dErr[id], link: (dAttr[id] & W.ATTR.REPARSE) ? 1 : 0, level: dDepth[id],
    hasChildren: liveChildren(id, o).length > 0 || (!!o.showFiles && dFileCount[id] > 0),
    prevSize: prev ? prev.size : (compare ? -1 : undefined),
    prevFiles: prev ? prev.files : undefined,
  };
}
function fileRow(i: number, parentSize: number, depth = 0) {
  return {
    id: -(i + 1), kind: 'file', name: fName[i], depth, expanded: false,
    size: fSize[i], alloc: fAlloc[i], files: 1, dirs: 0,
    pct: parentSize > 0 ? fSize[i] / parentSize : 0,
    mtime: fMtime[i], atime: fAtime[i], ctime: fCtime[i], attr: fAttr[i], err: 0, link: 0,
    level: dDepth[fDir[i]] + 1, hasChildren: false, owner: fOwner[i] >= 0 ? owners[fOwner[i]] : undefined,
  };
}
function metric(sortBy: string | undefined) {
  switch (sortBy) {
    case 'alloc': return (r: any) => r.alloc;
    case 'files': return (r: any) => r.files;
    case 'name': return null;
    case 'mtime': return (r: any) => r.mtime;
    case 'atime': return (r: any) => r.atime;
    case 'ctime': return (r: any) => r.ctime;
    default: return (r: any) => r.size;
  }
}
function sortRows(rows: any[], o: RowOpts) {
  const m = metric(o.sortBy);
  if (!m) rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }) * (o.asc ? 1 : -1));
  else rows.sort((a, b) => (m(a) - m(b)) * (o.asc ? 1 : -1));
  return rows;
}

function flatTree(expanded: number[], o: RowOpts & { limit?: number }) {
  const exp = new Set(expanded);
  const out: any[] = [];
  const limit = o.limit || 60000;
  const walk = (id: number, depth: number, parentSize: number) => {
    if (out.length >= limit) return;
    const isExp = exp.has(id);
    out.push(dirRow(id, parentSize, depth, isExp, o));
    if (!isExp) return;
    const rows: any[] = liveChildren(id, o).map((c) => dirRow(c, aSize[id], depth + 1, exp.has(c), o));
    if (o.showFiles) for (const f of liveFiles(id)) rows.push(fileRow(f, aSize[id], depth + 1));
    sortRows(rows, { ...o, asc: false });
    for (const r of rows) {
      if (out.length >= limit) return;
      if (r.kind === 'dir') walk(r.id, depth + 1, aSize[id]);
      else out.push(r);
    }
  };
  if (!dRemoved[0]) walk(0, 0, 0);
  return { rows: out, truncated: out.length >= limit };
}

function children(id: number, o: RowOpts) {
  if (id < 0 || id >= dName.length) return [];
  const rows: any[] = liveChildren(id, o).map((c) => dirRow(c, aSize[id], 0, false, o));
  for (const f of liveFiles(id)) rows.push(fileRow(f, aSize[id]));
  return sortRows(rows, o);
}

function nodeInfo(id: number) {
  if (id < 0) {
    const i = -id - 1;
    return { ...fileRow(i, aSize[fDir[i]]), path: join(dirPath(fDir[i]), fName[i]), crumbs: crumbs(fDir[i]) };
  }
  return { ...dirRow(id, id > 0 ? aSize[dParent[id]] : 0), path: dirPath(id), crumbs: crumbs(id), parent: dParent[id] };
}
function crumbs(id: number) {
  const out: { id: number; name: string }[] = [];
  for (let p = id; p >= 0; p = dParent[p]) out.unshift({ id: p, name: p === 0 ? ROOT : dName[p] });
  return out;
}
function findPath(path: string): number {
  const S = W.sep;
  const trail = (p: string) => (p.length > 1 && p.endsWith(S) ? p.replace(S === '/' ? /\/+$/ : /\\+$/, '') : p);
  const norm = trail((W.isWin ? path.replace(/\//g, '\\') : path).toLowerCase());
  const rootN = trail(ROOT.toLowerCase());
  if (norm === rootN) return 0;
  const prefix = rootN.endsWith(S) ? rootN : rootN + S;
  if (!norm.startsWith(prefix)) return -1;
  const parts = norm.slice(prefix.length).split(S).filter(Boolean);
  let id = 0;
  for (const part of parts) {
    const next = dChildren[id].find((c) => !dRemoved[c] && dName[c].toLowerCase() === part);
    if (next === undefined) return -1;
    id = next;
  }
  return id;
}

function forEachFile(id: number, cb: (i: number) => void) {
  if (id === 0) {
    for (let i = 0; i < fName.length; i++) if (!fRemoved[i] && fPass[i]) cb(i);
    return;
  }
  const st = [id];
  while (st.length) {
    const d = st.pop()!;
    if (dRemoved[d]) continue;
    const s = dFileStart[d], n = dFileCount[d];
    for (let i = s; i < s + n; i++) if (!fRemoved[i] && fPass[i]) cb(i);
    for (const c of dChildren[d]) st.push(c);
  }
}
function forEachDir(id: number, cb: (d: number) => void) {
  const st = [id];
  while (st.length) {
    const d = st.pop()!;
    if (dRemoved[d]) continue;
    cb(d);
    for (const c of dChildren[d]) st.push(c);
  }
}

function fileResult(i: number) {
  return { ...fileRow(i, 0), path: join(dirPath(fDir[i]), fName[i]), dir: dirPath(fDir[i]) };
}

function topFiles(id: number, n: number) {
  // seleção parcial com heap mínimo simples
  const heap: number[] = [];
  const less = (a: number, b: number) => fSize[a] < fSize[b];
  const up = (k: number) => { while (k > 0) { const p = (k - 1) >> 1; if (less(heap[k], heap[p])) { [heap[k], heap[p]] = [heap[p], heap[k]]; k = p; } else break; } };
  const down = (k: number) => {
    for (;;) {
      const l = 2 * k + 1, r = l + 1; let m = k;
      if (l < heap.length && less(heap[l], heap[m])) m = l;
      if (r < heap.length && less(heap[r], heap[m])) m = r;
      if (m === k) break; [heap[k], heap[m]] = [heap[m], heap[k]]; k = m;
    }
  };
  forEachFile(id, (i) => {
    if (heap.length < n) { heap.push(i); up(heap.length - 1); }
    else if (fSize[i] > fSize[heap[0]]) { heap[0] = i; down(0); }
  });
  return heap.sort((a, b) => fSize[b] - fSize[a]).map(fileResult);
}

function topDirs(id: number, n: number) {
  // pastas "folha" com mais arquivos próprios — útil para achar caches
  const list: { id: number; own: number }[] = [];
  forEachDir(id, (d) => {
    let own = 0; const s = dFileStart[d], c = dFileCount[d];
    for (let i = s; i < s + c; i++) if (!fRemoved[i] && fPass[i]) own += fSize[i];
    if (own > 0) list.push({ id: d, own });
  });
  list.sort((a, b) => b.own - a.own);
  return list.slice(0, n).map((x) => ({ ...dirRow(x.id, 0), own: x.own, path: dirPath(x.id) }));
}

function extStats(id: number) {
  const m = new Map<string, { ext: string; size: number; alloc: number; files: number }>();
  forEachFile(id, (i) => {
    const e = extOf(fName[i]);
    let r = m.get(e);
    if (!r) { r = { ext: e, size: 0, alloc: 0, files: 0 }; m.set(e, r); }
    r.size += fSize[i]; r.alloc += fAlloc[i]; r.files++;
  });
  return [...m.values()].sort((a, b) => b.size - a.size);
}

const DAY = 86400000;
const AGE_BUCKETS = [
  { key: 'm1', label: 'Menos de 1 mês', max: 30 * DAY },
  { key: 'm3', label: '1 a 3 meses', max: 91 * DAY },
  { key: 'm6', label: '3 a 6 meses', max: 182 * DAY },
  { key: 'y1', label: '6 a 12 meses', max: 365 * DAY },
  { key: 'y2', label: '1 a 2 anos', max: 730 * DAY },
  { key: 'y5', label: '2 a 5 anos', max: 1826 * DAY },
  { key: 'old', label: 'Mais de 5 anos', max: Infinity },
];
function ageStats(id: number, field: 'mtime' | 'atime' | 'ctime') {
  const arr = field === 'atime' ? fAtime : field === 'ctime' ? fCtime : fMtime;
  const now = Date.now();
  const res = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, size: 0, files: 0 }));
  const years = new Map<number, { year: number; size: number; files: number }>();
  forEachFile(id, (i) => {
    const t = arr[i];
    const age = now - t;
    let k = AGE_BUCKETS.findIndex((b) => age < b.max);
    if (k < 0) k = AGE_BUCKETS.length - 1;
    res[k].size += fSize[i]; res[k].files++;
    const y = t > 0 ? new Date(t).getFullYear() : 0;
    let yr = years.get(y);
    if (!yr) { yr = { year: y, size: 0, files: 0 }; years.set(y, yr); }
    yr.size += fSize[i]; yr.files++;
  });
  return { buckets: res, years: [...years.values()].sort((a, b) => a.year - b.year) };
}

function treemap(id: number, o: { maxDepth?: number; minFrac?: number; showFiles?: boolean; maxNodes?: number }) {
  const maxDepth = o.maxDepth ?? 4, minFrac = o.minFrac ?? 0.002, maxNodes = o.maxNodes ?? 4000;
  const total = aSize[id] || 1;
  let count = 0;
  const build = (d: number, depth: number): any => {
    count++;
    const node: any = { id: d, name: dName[d], size: aSize[d], kind: 'dir', children: [] };
    if (depth >= maxDepth || count > maxNodes) return node;
    const kids: any[] = [];
    for (const c of liveChildren(d, {})) if (aSize[c] / total >= minFrac) kids.push(c);
    kids.sort((a, b) => aSize[b] - aSize[a]);
    let used = 0;
    for (const c of kids) { if (count > maxNodes) break; const n = build(c, depth + 1); node.children.push(n); used += n.size; }
    if (o.showFiles) {
      const fl = liveFiles(d).filter((i) => fSize[i] / total >= minFrac).sort((a, b) => fSize[b] - fSize[a]);
      for (const i of fl) { if (count > maxNodes) break; count++; node.children.push({ id: -(i + 1), name: fName[i], size: fSize[i], kind: 'file', ext: extOf(fName[i]) }); used += fSize[i]; }
    }
    const rest = aSize[d] - used;
    if (node.children.length && rest > 0) node.children.push({ id: d, name: o.showFiles ? '(outros)' : '(arquivos e itens pequenos)', size: rest, kind: 'rest' });
    return node;
  };
  return build(id, 0);
}

function search(pattern: string, limit = 2000) {
  const p = pattern.trim();
  if (!p) return [];
  const re = /[*?]/.test(p) ? wildcardToRe(p) : null;
  const lc = p.toLowerCase();
  const test = (n: string) => (re ? re.test(n) : n.toLowerCase().includes(lc));
  const out: any[] = [];
  for (let d = 1; d < dName.length && out.length < limit; d++) {
    if (!dRemoved[d] && test(dName[d])) out.push({ ...dirRow(d, 0), path: dirPath(d) });
  }
  for (let i = 0; i < fName.length && out.length < limit; i++) {
    if (!fRemoved[i] && fPass[i] && test(fName[i])) out.push(fileResult(i));
  }
  return out.sort((a, b) => b.size - a.size);
}

interface Criteria {
  name?: string; minSize?: number; maxSize?: number;
  modBefore?: number; modAfter?: number; accBefore?: number; createdBefore?: number;
  attrs?: number; folders?: boolean; emptyFolders?: boolean; temp?: boolean; limit?: number; under?: number;
}
const TEMP_RE = /\.(tmp|temp|bak|old|chk|dmp|log|~.*)$|^~\$|^thumbs\.db$/i;
function customSearch(c: Criteria) {
  const limit = c.limit || 5000;
  const nameRe = c.name ? wildcardToRe(c.name.includes('*') || c.name.includes('?') ? c.name : `*${c.name}*`) : null;
  const out: any[] = [];
  const base = c.under ?? 0;
  if (c.emptyFolders) {
    forEachDir(base, (d) => { if (d !== base && aFiles[d] === 0 && out.length < limit) out.push({ ...dirRow(d, 0), path: dirPath(d) }); });
    return out;
  }
  if (c.folders) {
    forEachDir(base, (d) => {
      if (d === base || out.length >= limit) return;
      if (nameRe && !nameRe.test(dName[d])) return;
      if (c.minSize && aSize[d] < c.minSize) return;
      if (c.maxSize && aSize[d] > c.maxSize) return;
      if (c.modBefore && aMtime[d] > c.modBefore) return;
      if (c.modAfter && aMtime[d] < c.modAfter) return;
      out.push({ ...dirRow(d, 0), path: dirPath(d) });
    });
    return out.sort((a, b) => b.size - a.size);
  }
  forEachFile(base, (i) => {
    if (out.length >= limit * 4) return;
    if (nameRe && !nameRe.test(fName[i])) return;
    if (c.temp && !TEMP_RE.test(fName[i])) return;
    if (c.minSize && fSize[i] < c.minSize) return;
    if (c.maxSize && fSize[i] > c.maxSize) return;
    if (c.modBefore && fMtime[i] > c.modBefore) return;
    if (c.modAfter && fMtime[i] < c.modAfter) return;
    if (c.accBefore && fAtime[i] > c.accBefore) return;
    if (c.createdBefore && fCtime[i] > c.createdBefore) return;
    if (c.attrs && (fAttr[i] & c.attrs) !== c.attrs) return;
    out.push(i);
  });
  return out.sort((a, b) => fSize[b] - fSize[a]).slice(0, limit).map(fileResult);
}

// ---------- tarefas longas ----------
const cancelMethods = new Set<string>();
function runTask(id: number, gen: Generator<any, any, any>, method: string) {
  let last = 0;
  cancelMethods.delete(method);
  const step = () => {
    const t = Date.now();
    if (cancelMethods.has(method)) { cancelMethods.delete(method); port.postMessage({ type: 'reply', id, error: 'Cancelado' }); return; }
    try {
      while (Date.now() - t < 60) {
        const r = gen.next();
        if (r.done) { port.postMessage({ type: 'reply', id, result: r.value }); return; }
        if (r.value && Date.now() - last > 200) { last = Date.now(); port.postMessage({ type: 'taskProgress', id, method, progress: r.value }); }
      }
    } catch (e: any) { port.postMessage({ type: 'reply', id, error: String(e?.message || e) }); return; }
    setImmediate(step);
  };
  setImmediate(step);
}

function hashFile(path: string, limit: number): string {
  const h = crypto.createHash('sha1');
  const fd = fs.openSync(path, 'r');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    let pos = 0;
    while (pos < limit) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, limit - pos), pos);
      if (n <= 0) break;
      h.update(buf.subarray(0, n));
      pos += n;
    }
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function* duplicates(id: number, minSize: number): Generator<any, any, any> {
  const bySize = new Map<number, number[]>();
  forEachFile(id, (i) => {
    if (fSize[i] < minSize || (fAttr[i] & (W.ATTR.RECALL_ON_DATA_ACCESS | W.ATTR.OFFLINE))) return;
    let g = bySize.get(fSize[i]);
    if (!g) { g = []; bySize.set(fSize[i], g); }
    g.push(i);
  });
  const cands = [...bySize.values()].filter((g) => g.length > 1);
  const totalFiles = cands.reduce((s, g) => s + g.length, 0);
  let done = 0;
  const PART = 64 * 1024;
  const groups: number[][] = [];
  for (const g of cands) {
    const byPart = new Map<string, number[]>();
    for (const i of g) {
      done++;
      let k: string;
      try { k = hashFile(join(dirPath(fDir[i]), fName[i]), PART); } catch { continue; }
      let a = byPart.get(k); if (!a) { a = []; byPart.set(k, a); } a.push(i);
      yield { phase: 'Comparando início dos arquivos', done, total: totalFiles };
    }
    for (const pg of byPart.values()) {
      if (pg.length < 2) continue;
      if (fSize[pg[0]] <= PART) { groups.push(pg); continue; }
      const byFull = new Map<string, number[]>();
      for (const i of pg) {
        let k: string;
        try { k = hashFile(join(dirPath(fDir[i]), fName[i]), Infinity); } catch { continue; }
        let a = byFull.get(k); if (!a) { a = []; byFull.set(k, a); } a.push(i);
        yield { phase: 'Calculando hash completo (SHA-1)', done, total: totalFiles };
      }
      for (const fg of byFull.values()) if (fg.length > 1) groups.push(fg);
    }
  }
  const res = groups.map((g) => ({
    size: fSize[g[0]], count: g.length, wasted: fSize[g[0]] * (g.length - 1),
    files: g.map(fileResult),
  }));
  res.sort((a, b) => b.wasted - a.wasted);
  return res.slice(0, 3000);
}

function* ownerTask(id: number): Generator<any, any, any> {
  const list: number[] = [];
  forEachFile(id, (i) => list.push(i));
  const m = new Map<string, { owner: string; size: number; alloc: number; files: number }>();
  let done = 0;
  for (const i of list) {
    if (fOwner[i] < 0) {
      const o = W.ownerOf(join(dirPath(fDir[i]), fName[i]));
      let k = ownerIdx.get(o);
      if (k === undefined) { k = owners.length; owners.push(o); ownerIdx.set(o, k); }
      fOwner[i] = k;
    }
    const name = owners[fOwner[i]];
    let r = m.get(name);
    if (!r) { r = { owner: name, size: 0, alloc: 0, files: 0 }; m.set(name, r); }
    r.size += fSize[i]; r.alloc += fAlloc[i]; r.files++;
    done++;
    yield { phase: 'Lendo proprietários', done, total: list.length };
  }
  return [...m.values()].sort((a, b) => b.size - a.size);
}

// ---------- mutações ----------
function recomputeAll() {
  for (let d = 0; d < dName.length; d++) { aSize[d] = 0; aAlloc[d] = 0; aFiles[d] = 0; aMtime[d] = dRemoved[d] ? 0 : dMtime[d]; aAtime[d] = dRemoved[d] ? 0 : dAtime[d]; }
  for (let i = 0; i < fName.length; i++) {
    if (fRemoved[i]) continue;
    const ok = passes(i) ? 1 : 0;
    fPass[i] = ok;
    if (!ok) continue;
    const d = fDir[i];
    aSize[d] += fSize[i]; aAlloc[d] += fAlloc[i]; aFiles[d]++;
    if (fMtime[i] > aMtime[d]) aMtime[d] = fMtime[i];
    if (fAtime[i] > aAtime[d]) aAtime[d] = fAtime[i];
  }
  // propaga de baixo para cima (filhos sempre têm id maior que o pai)
  for (let d = dName.length - 1; d > 0; d--) {
    if (dRemoved[d]) continue;
    const p = dParent[d];
    aSize[p] += aSize[d]; aAlloc[p] += aAlloc[d]; aFiles[p] += aFiles[d];
    if (aMtime[d] > aMtime[p]) aMtime[p] = aMtime[d];
    if (aAtime[d] > aAtime[p]) aAtime[p] = aAtime[d];
  }
}
function removeItem(id: number) {
  if (id < 0) {
    const i = -id - 1;
    if (fRemoved[i]) return;
    fRemoved[i] = 1;
    if (fPass[i]) addAgg(fDir[i], -fSize[i], -fAlloc[i], -1, 0, 0);
    return;
  }
  if (id === 0 || dRemoved[id]) return;
  const sz = aSize[id], al = aAlloc[id], fl = aFiles[id], dirs = aDirs[id] + 1;
  forEachDir(id, markRemoved);
  for (let p = dParent[id]; p >= 0; p = dParent[p]) { aSize[p] -= sz; aAlloc[p] -= al; aFiles[p] -= fl; aDirs[p] -= dirs; }
}
function markRemoved(d: number) {
  dRemoved[d] = 1;
  const s = dFileStart[d], n = dFileCount[d];
  for (let i = s; i < s + n; i++) fRemoved[i] = 1;
}
function rescan(id: number) {
  if (scanning) return false;
  const sz = aSize[id], al = aAlloc[id], fl = aFiles[id], dirs = aDirs[id];
  for (const c of dChildren[id]) forEachDir(c, markRemoved);
  const s = dFileStart[id], n = dFileCount[id];
  for (let i = s; i < s + n; i++) fRemoved[i] = 1;
  for (let p = dParent[id]; p >= 0; p = dParent[p]) { aSize[p] -= sz; aAlloc[p] -= al; aFiles[p] -= fl; aDirs[p] -= dirs; }
  aSize[id] = 0; aAlloc[id] = 0; aFiles[id] = 0; aDirs[id] = 0;
  dChildren[id] = []; dErr[id] = 0;
  stack = [id]; scanning = true; stopped = false; startedAt = Date.now(); finishedAt = 0;
  setImmediate(pump);
  return true;
}
function renameDirTo(id: number, newName: string) {
  // usado após "mover": remove o item; o destino pode ser re-escaneado
  removeItem(id); return newName;
}

function snapshot() {
  const map = new Int32Array(dName.length).fill(-1);
  const names: string[] = [], parents: number[] = [], sizes: number[] = [], allocs: number[] = [], files: number[] = [];
  for (let d = 0; d < dName.length; d++) {
    if (dRemoved[d]) continue;
    map[d] = names.length;
    names.push(d === 0 ? ROOT : dName[d]);
    parents.push(d === 0 ? -1 : map[dParent[d]]);
    sizes.push(aSize[d]); allocs.push(aAlloc[d]); files.push(aFiles[d]);
  }
  return { version: 1, root: ROOT, date: Date.now(), names, parents, sizes, allocs, files, totalFiles: aFiles[0], totalSize: aSize[0] };
}
function loadCompare(snap: any) {
  if (!snap) { compare = null; compareDate = 0; return true; }
  const paths: string[] = [];
  compare = new Map();
  for (let k = 0; k < snap.names.length; k++) {
    const p = snap.parents[k] < 0 ? snap.names[k] : join(paths[snap.parents[k]], snap.names[k]);
    paths.push(p);
    compare.set(p.toLowerCase(), { size: snap.sizes[k], files: snap.files[k] });
  }
  compareDate = snap.date;
  return true;
}
function compareRoot() {
  if (!compare) return null;
  // pastas que deixaram de existir (no nível atual não é trivial; retornamos totais)
  const prev = compare.get(ROOT.toLowerCase());
  return { date: compareDate, prevSize: prev?.size ?? 0, prevFiles: prev?.files ?? 0, size: aSize[0], files: aFiles[0] };
}
function growth(id: number, n: number) {
  if (!compare) return [];
  const list: any[] = [];
  forEachDir(id, (d) => {
    if (d === id) return;
    const prev = compare!.get(dirPath(d).toLowerCase());
    const delta = aSize[d] - (prev ? prev.size : 0);
    if (delta !== 0) list.push({ ...dirRow(d, 0), path: dirPath(d), prevSize: prev ? prev.size : 0, delta, isNew: !prev });
  });
  // mantém apenas as pastas mais profundas que explicam o crescimento: ordena por |delta|
  list.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return list.slice(0, n);
}

function exportRows(id: number, maxDepth: number, includeFiles: boolean) {
  const out: any[] = [];
  const base = dDepth[id];
  const walk = (d: number) => {
    if (out.length > 200000) return;
    out.push({ ...dirRow(d, d > 0 ? aSize[dParent[d]] : 0), path: dirPath(d), level: dDepth[d] - base });
    if (includeFiles && d === id) for (const i of liveFiles(d)) out.push({ ...fileResult(i), level: 1 });
    if (dDepth[d] - base >= maxDepth) return;
    const kids = liveChildren(d, {}).sort((a, b) => aSize[b] - aSize[a]);
    for (const c of kids) walk(c);
  };
  walk(id);
  return out;
}

function summary() {
  return {
    root: ROOT, cluster: CLUSTER, scanning, files: aFiles[0] || 0, dirs: aDirs[0] || 0, size: aSize[0] || 0,
    alloc: aAlloc[0] || 0, errors: errors.length, elapsed: (finishedAt || Date.now()) - startedAt,
    filter, comparing: compare ? compareDate : 0,
  };
}

// ---------- roteamento ----------
const handlers: Record<string, (...a: any[]) => any> = {
  flatTree, children, nodeInfo, findPath, topFiles, topDirs, extStats, ageStats, treemap, search, customSearch,
  summary, snapshot, loadCompare, compareRoot, growth, exportRows,
  errors: () => errors.slice(0, 5000),
  setFilter: (f: Filter | null) => {
    filter = f && (f.rules?.length || f.minSize || f.maxSize) ? f : null;
    compiled = filter ? filter.rules.map((rule) => ({ rule, re: compile(rule) })) : [];
    recomputeAll();
    return true;
  },
  removeItems: (ids: number[]) => { for (const id of ids) removeItem(id); return true; },
  rescan, renameDirTo,
  cleanupStats: () => {
    const year = Date.now() - 365 * DAY;
    let tempSize = 0, tempCount = 0, oldSize = 0, oldCount = 0, empty = 0;
    for (let i = 0; i < fName.length; i++) {
      if (fRemoved[i] || !fPass[i]) continue;
      if (TEMP_RE.test(fName[i])) { tempSize += fSize[i]; tempCount++; }
      if (fSize[i] >= 100 * 1048576 && fMtime[i] < year) { oldSize += fSize[i]; oldCount++; }
    }
    for (let d = 1; d < dName.length; d++) if (!dRemoved[d] && aFiles[d] === 0 && !(dAttr[d] & W.ATTR.REPARSE)) empty++;
    return { tempSize, tempCount, oldSize, oldCount, empty };
  },
  idsToDepth: (id: number, depth: number, limit = 20000) => {
    const out: number[] = [];
    const base = dDepth[id];
    forEachDir(id, (d) => { if (out.length < limit && dDepth[d] - base < depth && dChildren[d].length) out.push(d); });
    return out;
  },
  stop: () => { stopped = true; return true; },
  pathOf: (id: number) => (id < 0 ? join(dirPath(fDir[-id - 1]), fName[-id - 1]) : dirPath(id)),
};

port.on('message', (msg: any) => {
  if (msg.type !== 'query') return;
  const { id, method, args } = msg;
  if (method === 'duplicates') return runTask(id, duplicates(args[0], args[1] ?? 1024 * 1024), method);
  if (method === 'owners') return runTask(id, ownerTask(args[0]), method);
  if (method === 'cancelTask') { cancelMethods.add(args[0]); return port.postMessage({ type: 'reply', id, result: true }); }
  const h = handlers[method];
  if (!h) return port.postMessage({ type: 'reply', id, error: 'método desconhecido: ' + method });
  try {
    port.postMessage({ type: 'reply', id, result: h(...(args || [])) });
  } catch (e: any) {
    port.postMessage({ type: 'reply', id, error: String(e?.message || e) });
  }
});

startScan();
