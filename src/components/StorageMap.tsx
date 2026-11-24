// Mapa do armazenamento (Visão geral): o que ocupa o disco do sistema, por tipo de conteúdo, numa barra
// segmentada, com o atalho certo para cada categoria (desinstalar apps, revisar Downloads, limpar caches…).
import React, { useEffect, useMemo, useState } from 'react';
import {
  AppWindow, Code2, Cpu, Download, FileText, FolderCog, FolderTree, HardDrive, Image, Loader2, Mail, Archive, RefreshCw, Trash2, ArrowRight, Lightbulb,
} from 'lucide-react';
import { useApp } from '../lib/store';
import type { Page } from '../lib/store';
import { cc, AppEntry, Drive, StorageMap as SMap, isMac } from '../lib/api';
import { fmtSize, fmtPct, driveTag, fmtRelative } from '../lib/format';
import { cx } from './ui';
import { openUninstaller } from '../pages/appsShared';
import { t } from '../lib/i18n';

interface Seg { id: string; label: string; size: number; color: string; icon: React.ReactNode; hint: string; done: boolean; action?: () => void; actionLabel?: string; tree?: string }

const COLORS: Record<string, string> = {
  apps: '#6366f1', docs: '#3b82f6', downloads: '#06b6d4', media: '#ec4899', dev: '#f59e0b',
  caches: '#f97316', appdata: '#8b5cf6', mail: '#14b8a6', trash: '#ef4444', system: '#64748b',
};
const ICONS: Record<string, React.ReactNode> = {
  apps: <AppWindow size={15} />, docs: <FileText size={15} />, downloads: <Download size={15} />, media: <Image size={15} />, dev: <Code2 size={15} />,
  caches: <Archive size={15} />, appdata: <FolderCog size={15} />, mail: <Mail size={15} />, trash: <Trash2 size={15} />, system: <Cpu size={15} />,
};
const HINTS: Record<string, string> = {
  apps: t("Programas instalados"), docs: t("Documentos e Mesa"), downloads: t("Arquivos baixados"), media: t("Imagens, filmes e músicas da sua pasta pessoal"),
  dev: t("Ferramentas de programação, como SDKs, simuladores, caches de pacotes (npm, Gradle e Cargo) e Docker"), caches: t("O sistema e os apps criam esses arquivos de novo quando precisam"),
  appdata: t("Configurações e dados que os apps guardam no seu perfil"), mail: t("Mensagens e anexos guardados no Mac"), trash: t("Itens apagados que ainda ocupam espaço"),
  system: isMac ? t("O macOS, os arquivos do sistema, a memória virtual, os instantâneos e tudo o que fica fora das pastas acima") : t("O Windows, o arquivo de paginação, o arquivo de hibernação, os pontos de restauração e tudo o que fica fora das pastas acima"),
};

export function StorageMapCard({ drives, apps }: { drives: Drive[] | null; apps: AppEntry[] | null }) {
  const { settings, go, startScan } = useApp();
  const units = settings?.units || 'auto';
  const [map, setMap] = useState<SMap | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    cc.storageMap().then((m) => alive && setMap(m)).catch(() => {});
    const off = cc.on.storageProgress((m) => alive && setMap({ ...m, cats: m.cats.map((c) => ({ ...c })) }));
    return () => { alive = false; off(); };
  }, []);

  // disco do sistema (o mapa mede as pastas do usuário que ficam nele)
  const sys = useMemo(() => {
    const real = (drives || []).filter((d) => d.total > 0);
    if (!map) return real[0];
    const key = map.root.slice(0, 2).toLowerCase();
    return real.find((d) => (isMac ? d.root === '/' : d.root.toLowerCase().startsWith(key))) || real[0];
  }, [drives, map]);
  const others = (drives || []).filter((d) => d.total > 0 && d !== sys);

  const appsSize = useMemo(() => (apps || []).filter((a) => (isMac ? a.canUninstall : true)).reduce((s, a) => s + (a.size || 0), 0), [apps]);
  const go2 = (p: Page) => () => go(p);
  const scan = (p?: string) => (p ? async () => { await startScan(p); go('explorer'); } : undefined);

  const segs: Seg[] = useMemo(() => {
    if (!map || !sys) return [];
    const list: Seg[] = map.cats.map((c) => {
      const size = c.id === 'apps' ? appsSize : c.size;
      const done = c.id === 'apps' ? !!apps : c.done;
      const base = { id: c.id, label: c.label, size, done, color: COLORS[c.id] || '#94a3b8', icon: ICONS[c.id], hint: HINTS[c.id] || '', tree: c.paths[0] };
      switch (c.id) {
        case 'apps': return { ...base, action: () => openUninstaller(go, 'size:false'), actionLabel: t("Ver maiores") };
        case 'downloads': return { ...base, action: go2('clutter'), actionLabel: t("Revisar") };
        case 'docs': case 'media': return { ...base, action: go2('clutter'), actionLabel: t("Duplicados e grandes") };
        case 'dev': case 'caches': case 'trash': return { ...base, action: go2('cleanup'), actionLabel: t("Limpar") };
        case 'appdata': return { ...base, action: go2('appdata'), actionLabel: t("Analisar") };
        default: return { ...base, action: scan(c.paths[0]), actionLabel: t("Abrir na árvore") };
      }
    });
    const known = list.reduce((s, x) => s + x.size, 0);
    const allDone = map.done && !!apps;
    list.push({ id: 'system', label: t("Sistema e outros"), size: Math.max(0, sys.used - known), done: allDone, color: COLORS.system, icon: ICONS.system, hint: HINTS.system });
    return list.filter((x) => x.size > 0 || !x.done).sort((a, b) => (a.id === 'system' ? 1 : b.id === 'system' ? -1 : b.size - a.size));
  }, [map, sys, apps, appsSize]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sys) return <div className="skeleton h-[260px] rounded-lg" />;
  const total = sys.total;
  const pending = segs.filter((s) => !s.done).length;
  const hov = segs.find((s) => s.id === hover);
  // a maior oportunidade de liberar espaço entre o que dá para limpar ou revisar
  const tip = [...segs].filter((s) => ['downloads', 'caches', 'trash', 'dev'].includes(s.id) && s.done && s.size > 1024 ** 3).sort((a, b) => b.size - a.size)[0];

  return (
    <div className="rounded-lg border border-line bg-surface">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--on-accent)] shadow-md" style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))' }}><HardDrive size={16} /></span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg">{t("Mapa do armazenamento")}</div>
            <div className="truncate text-[11.5px] text-muted">{sys.label || t("Disco do sistema")} ({driveTag(sys.root)}{t(") · o que ocupa o espaço usado")}</div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-baseline gap-1.5 tnum">
          <span className="text-[20px] font-semibold tracking-tight text-fg">{fmtSize(sys.used, units)}</span>
          <span className="text-[12px] text-muted">{t("de")} {fmtSize(total, units)} · {fmtPct(sys.used / total, 0)} {t("usado")}</span>
        </div>
        {pending > 0 || (map && !map.done)
          ? <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><Loader2 size={12} className="animate-spin text-accent" /> {t("medindo pastas…")}</span>
          : <button className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-faint hover:bg-[var(--hover)] hover:text-fg" title={t("Medir de novo")} onClick={() => cc.storageMap(true).then(setMap)}><RefreshCw size={12} />{map?.at ? fmtRelative(map.at).replace(/^hoje$/, 'agora') : ''}</button>}
      </div>

      <div className="px-4 pb-4 pt-4">
        {/* barra segmentada */}
        <div className="relative">
          <div className="flex h-[22px] w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--line)_55%,transparent)] p-[3px] shadow-[inset_0_1px_3px_rgb(0_0_0/0.35)]" onMouseLeave={() => setHover(null)}>
            {segs.map((s, i) => (
              <div key={s.id}
                onMouseEnter={() => setHover(s.id)} onClick={s.action}
                className={cx('relative h-full cursor-pointer transition-[width,filter,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]', i === 0 && 'rounded-l-full', !s.done && 'animate-pulse', hover && hover !== s.id && 'opacity-45')}
                style={{
                  width: `${Math.max(s.size > 0 ? 0.6 : 0, (s.size / total) * 100)}%`, marginRight: 2,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${s.color} 88%, #fff), ${s.color} 55%, color-mix(in srgb, ${s.color} 70%, #000))`,
                  boxShadow: hover === s.id ? `0 0 14px ${s.color}` : undefined,
                }} />
            ))}
            {/* livre: listrado, sem cor */}
            <div className="h-full flex-1 rounded-r-full" style={{ background: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--fg) 7%, transparent) 0 6px, transparent 6px 12px)' }}
              onMouseEnter={() => setHover('free')} />
          </div>
          {/* régua */}
          <div className="mt-1.5 flex justify-between px-1 font-mono text-[10px] text-faint tnum">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{f === 0 ? '0' : fmtSize(total * f, units, 0)}</span>)}
          </div>
        </div>

        {/* leitura do segmento sob o mouse */}
        <div className="mt-2 flex h-5 items-center gap-2 text-[12px]">
          {hover === 'free' ? (
            <><span className="h-2 w-2 rounded-full bg-[var(--line-strong)]" /><span className="font-medium text-fg">{t("Livre")}</span><span className="text-muted tnum">{fmtSize(sys.free, units)} · {fmtPct(sys.free / total, 1)} {t("do disco")}</span></>
          ) : hov ? (
            <><span className="h-2 w-2 rounded-full" style={{ background: hov.color, boxShadow: `0 0 8px ${hov.color}` }} /><span className="font-medium text-fg">{t(hov.label)}</span><span className="text-muted tnum">{hov.done ? t("{0} · {1} do disco", fmtSize(hov.size, units), fmtPct(hov.size / total, 1)) : t("medindo…")}</span><span className="truncate text-faint">— {hov.hint}</span></>
          ) : <span className="text-faint">{t("Passe o mouse sobre a barra para ver cada parte. Depois, clique em uma parte para ver o que fazer com ela.")}</span>}
        </div>

        {/* categorias */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {segs.map((s) => (
            <div key={s.id} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}
              className={cx('group relative overflow-hidden rounded-lg border px-3 py-2.5 transition-colors', hover === s.id ? 'border-[var(--line-strong)] bg-[var(--hover)]' : 'border-line')}>
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }} />
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, color: s.color }}>{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-fg" title={s.hint}>{t(s.label)}</div>
                  <div className="text-[11px] text-muted tnum">{s.done ? t("{0} do disco{1}", fmtPct(s.size / total, 1), map?.cats.find((c) => c.id === s.id)?.partial ? ' (parcial)' : '') : t("medindo…")}</div>
                </div>
                <div className={cx('text-right text-[14px] font-semibold tnum', s.done ? 'text-fg' : 'text-faint')}>{s.done ? fmtSize(s.size, units) : <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-[var(--line)] align-middle" />}</div>
              </div>
              {(s.action || s.tree) && (
                <div className="mt-2 flex items-center gap-3 text-[11.5px] opacity-70 transition-opacity group-hover:opacity-100">
                  {s.action && <button className="inline-flex items-center gap-1 font-medium text-accent hover:underline" onClick={s.action}>{s.actionLabel} <ArrowRight size={11} /></button>}
                  {s.tree && s.id !== 'apps' && <button className="ml-auto inline-flex items-center gap-1 text-muted hover:text-fg" title={t("Abrir a pasta na árvore")} onClick={scan(s.tree)}><FolderTree size={12} /></button>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* dica */}
        {tip && (
          <button onClick={tip.action} className="mt-3 flex w-full items-center gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-3 py-2 text-left text-[12.5px] hover:bg-[color-mix(in_srgb,var(--accent)_11%,transparent)]">
            <Lightbulb size={14} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1"><b className="font-medium text-fg">{t(tip.label)}</b> <span className="text-muted">{t("ocupa")} {fmtSize(tip.size, units)} ({fmtPct(tip.size / total, 1)} {t("do disco).")} {tip.id === 'downloads' ? t("Esta pasta costuma ter instaladores e arquivos que já não servem.") : tip.id === 'trash' ? t("Quando você esvazia a Lixeira, o espaço fica livre na hora.") : tip.id === 'dev' ? t("Os simuladores, os SDKs antigos e os caches de pacotes podem ser criados de novo quando você precisar.") : t("Os apps criam de novo o que precisarem.")}</span></span>
            <span className="shrink-0 font-medium text-accent">{tip.actionLabel} →</span>
          </button>
        )}

        {/* outros discos */}
        {others.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-line pt-3">
            {others.map((d) => (
              <div key={d.root} className="flex items-center gap-3 text-[12px]">
                <HardDrive size={13} className="shrink-0 text-muted" />
                <span className="w-44 truncate text-fg">{d.label || t("Disco")} <span className="text-faint">({driveTag(d.root)})</span></span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-accent" style={{ width: `${(d.used / d.total) * 100}%` }} /></div>
                <span className="w-40 text-right text-muted tnum">{fmtSize(d.used, units)} {t("de")} {fmtSize(d.total, units)}</span>
                <button className="text-accent hover:underline" onClick={scan(d.root)}>{t("Analisar")}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
