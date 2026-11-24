// Exportação de relatórios: CSV, Excel, HTML, PDF/impressão (via HTML) e JSON.
import fs from 'fs';
import { t as tr, LOCALE } from './i18n';

export interface ExportMeta { root: string; node: string; date: number; totalSize: number; totalFiles: number; title?: string }

const COLS = [
  { key: 'path', label: tr("Caminho") },
  { key: 'name', label: tr("Nome") },
  { key: 'kind', label: tr("Tipo") },
  { key: 'level', label: tr("Nível") },
  { key: 'size', label: tr("Tamanho (bytes)") },
  { key: 'alloc', label: tr("Alocado (bytes)") },
  { key: 'files', label: tr("Arquivos") },
  { key: 'dirs', label: tr("Pastas") },
  { key: 'pct', label: tr("% do pai") },
  { key: 'mtime', label: tr("Última modificação") },
  { key: 'atime', label: tr("Último acesso") },
  { key: 'ctime', label: tr("Criação") },
];

export function fmtBytes(n: number) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0, v = Math.abs(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (n < 0 ? '-' : '') + v.toLocaleString(LOCALE, { maximumFractionDigits: i ? 1 : 0 }) + ' ' + u[i];
}
const fmtDate = (t: number) => (t ? new Date(t).toLocaleString(LOCALE) : '');
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function cell(r: any, key: string) {
  const v = r[key];
  if (key === 'kind') return v === 'file' ? tr("Arquivo") : tr("Pasta");
  if (key === 'pct') return v != null ? +(v * 100).toFixed(2) : '';
  if (key.endsWith('time')) return fmtDate(v);
  return v ?? '';
}

export interface Col { key: string; label: string }

export function toCSV(rows: any[], cols: Col[] = COLS): string {
  const q = (v: any) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [cols.map((c) => c.label).join(';')];
  for (const r of rows) lines.push(cols.map((c) => q(c.key === 'pct' ? String(cell(r, c.key)).replace('.', ',') : cell(r, c.key))).join(';'));
  return '﻿' + lines.join('\r\n');
}

export async function toXLSX(rows: any[], meta: ExportMeta, file: string, cols: Col[] = COLS) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CleanCode';
  const ws = wb.addWorksheet('Análise');
  ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: c.key === 'path' ? 70 : c.key === 'name' ? 34 : 18 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) {
    const o: any = {};
    for (const c of cols) {
      if (c.key.endsWith('time')) o[c.key] = r[c.key] ? new Date(r[c.key]) : null;
      else if (c.key === 'pct') o[c.key] = r.pct ?? null;
      else o[c.key] = cell(r, c.key);
    }
    ws.addRow(o);
  }
  for (const [k, f] of [['pct', '0.00%'], ['size', '#,##0'], ['alloc', '#,##0']]) if (cols.some((c) => c.key === k)) ws.getColumn(k).numFmt = f;
  ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
  const info = wb.addWorksheet('Resumo');
  info.addRows([
    [tr("Relatório CleanCode")], [tr("Raiz"), meta.root], [tr("Pasta"), meta.node], ['Data', new Date(meta.date)],
    [tr("Tamanho total"), fmtBytes(meta.totalSize)], [tr("Arquivos"), meta.totalFiles],
  ]);
  info.getColumn(1).width = 18; info.getColumn(2).width = 60;
  await wb.xlsx.writeFile(file);
}

export function toHTML(rows: any[], meta: ExportMeta, extras?: { ext?: any[]; top?: any[] }): string {
  const maxLevel = Math.max(0, ...rows.map((r) => r.level || 0));
  const body = rows.map((r) => {
    const pad = (r.level || 0) * 18;
    const pct = Math.max(0, Math.min(100, (r.pct || 0) * 100));
    return `<tr><td style="padding-left:${pad + 8}px"><span class="ico">${r.kind === 'file' ? '▫' : '▸'}</span>${esc(r.kind === 'file' ? r.name : r.level === 0 ? r.path : r.name)}</td>` +
      `<td class="n">${fmtBytes(r.size)}</td><td class="n">${fmtBytes(r.alloc)}</td><td class="n">${(r.files ?? 0).toLocaleString(LOCALE)}</td>` +
      `<td><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div><span class="p">${pct.toFixed(1)}%</span></td><td>${esc(fmtDate(r.mtime))}</td></tr>`;
  }).join('\n');
  const ext = extras?.ext?.length ? tr("<h2>Tipos de arquivo (top 15)</h2><table><thead><tr><th>Extensão</th><th class=\"n\">Tamanho</th><th class=\"n\">Arquivos</th></tr></thead><tbody>{0}</tbody></table>", extras.ext.slice(0, 15).map((e) => `<tr><td>${esc(e.ext ? '.' + e.ext : '(sem extensão)')}</td><td class="n">${fmtBytes(e.size)}</td><td class="n">${e.files.toLocaleString(LOCALE)}</td></tr>`).join('')) : '';
  const top = extras?.top?.length ? `<h2>${tr("Maiores arquivos")}</h2><table><thead><tr><th>${tr("Arquivo")}</th><th class="n">${tr("Tamanho")}</th><th>${tr("Modificado")}</th></tr></thead><tbody>${
    extras.top.map((f) => `<tr><td>${esc(f.path)}</td><td class="n">${fmtBytes(f.size)}</td><td>${esc(fmtDate(f.mtime))}</td></tr>`).join('')}</tbody></table>` : '';
  return `<!doctype html><html lang="${LOCALE}"><head><meta charset="utf-8"><title>${esc(meta.title || tr("Relatório CleanCode"))}</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;color:#1c1c1c;margin:32px;font-size:12px}
h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:28px 0 8px}
.meta{color:#666;margin-bottom:16px}.cards{display:flex;gap:12px;margin:16px 0}
.card{border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px}.card b{display:block;font-size:16px}
table{border-collapse:collapse;width:100%}th,td{padding:4px 8px;border-bottom:1px solid #eee;text-align:left;white-space:nowrap}
th{background:#f6f6f6;font-weight:600;position:sticky;top:0}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.bar{display:inline-block;width:80px;height:8px;background:#eee;border-radius:4px;vertical-align:middle;overflow:hidden}
.bar i{display:block;height:100%;background:#10a37f}.p{margin-left:6px;color:#555}.ico{color:#10a37f;margin-right:6px}
@media print{body{margin:12mm}th{position:static}}
</style></head><body>
<h1>${esc(meta.title || tr("Relatório de uso do disco"))}</h1>
<div class="meta">${esc(tr("Gerado pelo CleanCode em {0} · Raiz: {1} · Pasta: {2}", fmtDate(meta.date), meta.root, meta.node))}</div>
<div class="cards"><div class="card">${tr("Tamanho")}<b>${fmtBytes(meta.totalSize)}</b></div><div class="card">${tr("Arquivos")}<b>${meta.totalFiles.toLocaleString(LOCALE)}</b></div><div class="card">${tr("Níveis")}<b>${maxLevel}</b></div></div>
<h2>${tr("Estrutura de pastas")}</h2>
<table><thead><tr><th>${tr("Nome")}</th><th class="n">${tr("Tamanho")}</th><th class="n">${tr("Alocado")}</th><th class="n">${tr("Arquivos")}</th><th>${tr("% do pai")}</th><th>${tr("Modificado")}</th></tr></thead><tbody>
${body}
</tbody></table>${ext}${top}
</body></html>`;
}

export function writeText(file: string, s: string) { fs.writeFileSync(file, s, 'utf8'); }
