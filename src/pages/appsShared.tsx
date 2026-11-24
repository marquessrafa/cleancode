import React, { useCallback, useEffect, useState } from 'react';
import { Package, Store, CheckCircle2, XCircle, Loader2, FolderTree } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, AppEntry, isMac } from '../lib/api';
import { fmtSize, fmtDate, fmtRelative } from '../lib/format';
import { Button, Card, cx } from '../components/ui';
import { t as tr } from '../lib/i18n';

let cache: AppEntry[] | null = null;
let inflight: Promise<AppEntry[]> | null = null; // uma leitura por vez, compartilhada entre telas

export function useApps() {
  const { tasks } = useApp();
  const [apps, setApps] = useState<AppEntry[] | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      if (!inflight || refresh) inflight = cc.appsList(refresh).finally(() => { inflight = null; });
      cache = await inflight; setApps(cache);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!cache) load(false); }, [load]);
  // quando uma desinstalação termina (mesmo com a tela fechada), atualiza a lista
  const doneUninstalls = tasks.filter((t) => t.kind === 'uninstall' && t.status === 'done').length;
  useEffect(() => { if (doneUninstalls) load(false); }, [doneUninstalls, load]);
  useEffect(() => cc.on.appSize((m) => {
    setApps((a) => {
      if (!a) return a;
      const n = a.map((x) => (x.id === m.id ? { ...x, size: m.size, sizeSource: 'calculado' } : x));
      cache = n; return n;
    });
  }), []);
  const remove = (ids: string[]) => setApps((a) => { const n = a?.filter((x) => !ids.includes(x.id)) || null; cache = n; return n; });
  return { apps, loading, reload: () => load(true), remove };
}

export function AppIcon({ app, size = 36 }: { app: AppEntry; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (app.icon) cc.appIcon(app.icon).then((s) => alive && setSrc(s || null));
    return () => { alive = false; };
  }, [app.icon]);
  // o ícone real aparece solto (os do macOS já têm o formato; os do Windows ganham cantos arredondados);
  // só quem não tem ícone fica com o quadrado genérico
  if (src) return <img src={src} draggable={false} className="shrink-0 select-none object-contain" style={{ width: size, height: size, borderRadius: isMac ? 0 : size * 0.22 }} alt="" />;
  return (
    <div className="flex shrink-0 items-center justify-center rounded-[22%] bg-gradient-to-b from-surface-2 to-[var(--line)] text-muted" style={{ width: size, height: size }}>
      {app.source === 'store' ? <Store size={size * 0.5} /> : <Package size={size * 0.5} />}
    </div>
  );
}

export const sourceLabel = (a: AppEntry) => (a.source === 'mac' ? a.origin || 'Aplicativos'
  : a.source === 'store' ? (isMac ? 'App Store' : 'Microsoft Store / MSIX')
  : `Win32 ${a.arch === '32' ? '32 bits' : '64 bits'} · ${a.hive === 'HKCU' ? tr("usuário") : tr("máquina")}`);
/** caminho curto para exibir (~/Library/...) */
const tilde = (p: string, home?: string) => (home && p.startsWith(home + '/') ? '~' + p.slice(home.length) : p);

/** Remove da lista (registro) programas órfãos, cujo desinstalador e pasta já não existem. */
export function useRemoveEntry(onDone: (ids: string[]) => void) {
  const { confirm, toast } = useApp();
  return async (items: AppEntry[]) => {
    const list = items.filter((a) => a.orphan && a.source === 'win32');
    if (!list.length) return;
    const r = await confirm({
      title: list.length === 1 ? tr("Remover \"{0}\" da lista?", list[0].name) : tr("Remover {0} entradas órfãs?", list.length),
      message: <>{tr("O desinstalador e a pasta destes programas não existem mais, porque os arquivos já foram apagados. Esta ação remove apenas a entrada que sobrou no registro do Windows, na lista \"Aplicativos instalados\". Para as entradas que valem para todos os usuários, o Windows pede permissão de administrador.")}</>,
      items: list.map((a) => ({ label: a.name, detail: a.hive === 'HKLM' ? tr("todos os usuários") : tr("este usuário") })),
      confirmLabel: tr("Remover da lista"),
    });
    if (!r.ok) return;
    const removed: string[] = [];
    for (const a of list) {
      const res = await cc.appRemoveEntry(a.id);
      if (res.ok) removed.push(a.id); else toast(`${a.name}: ${res.message}`, 'error');
    }
    if (removed.length) { onDone(removed); toast(tr("{0} entrada(s) removida(s) da lista", removed.length)); }
  };
}

/** Fluxo de desinstalação em lote com confirmação explícita e progresso. */
export function useUninstall(onDone: (removed: string[]) => void) {
  const { confirm, settings, toast, tasks, startUninstall, clearFinishedTasks, info } = useApp();
  // estado da desinstalação vem do gerenciador global (sobrevive à troca de tela)
  const job = [...tasks].reverse().find((t) => t.kind === 'uninstall');
  const running = job && (job.status === 'running' || Date.now() - (job.finishedAt || 0) < 10 * 60000)
    ? { items: job.items || [], status: job.itemStatus || {}, done: job.status !== 'running' } : null;
  void useEffect;

  const start = async (items: AppEntry[]) => {
    const orphans = items.filter((a) => a.orphan);
    const list = items.filter((a) => a.canUninstall && !a.orphan);
    if (orphans.length) toast(tr("{0} item(ns) órfão(s) ficaram de fora. Para tirar esses itens da lista, use a opção \"Remover da lista\" em cada um.", orphans.length), 'info');
    if (!list.length) { if (!orphans.length) toast(tr("Nenhum dos itens selecionados pode ser desinstalado."), 'error'); return; }
    const total = list.reduce((s, a) => s + (a.size || 0), 0);
    if (isMac) {
      // macOS: o app e os restos vão para a Lixeira (recuperáveis); a lista mostra exatamente o que sai
      const left = await cc.appLeftovers(list.map((a) => a.id)).catch(() => ({} as Record<string, { path: string; size: number; kind: string }[]>));
      const leftTotal = Object.values(left).flat().reduce((s, l) => s + l.size, 0);
      const items: { label: string; detail?: string }[] = [];
      for (const a of list) {
        items.push({ label: `${a.name}${a.version ? ' ' + a.version : ''}`, detail: a.size ? fmtSize(a.size) : undefined });
        for (const l of left[a.id] || []) items.push({ label: `   ↳ ${tilde(l.path, info?.home)}`, detail: `${l.kind} · ${fmtSize(l.size)}` });
      }
      const r = await confirm({
        title: list.length === 1 ? tr("Desinstalar {0}?", list[0].name) : tr("Desinstalar {0} apps?", list.length),
        message: <>{tr("Tudo vai para a")} <b>{tr("Lixeira")}</b>{tr(", então você consegue recuperar os apps até esvaziar a Lixeira. Antes de continuar, feche os apps. O espaço estimado é de")} <b>{fmtSize(total)}</b> {tr("nos apps")}{leftTotal ? <> + <b>{fmtSize(leftTotal)}</b> {tr("em restos")}</> : null}.</>,
        items,
        options: [
          { key: 'leftovers', label: tr("Mover o app e os restos para a Lixeira"), hint: tr("Também move as preferências, os caches e os outros dados do app que aparecem na lista acima.") },
          { key: 'app', label: tr("Mover só o app"), hint: tr("Mantém as configurações do app, caso você instale o app de novo depois.") },
        ],
        defaultOption: 'leftovers',
        danger: true, confirmLabel: tr("Mover para a Lixeira"), requireCheck: tr("Revisei a lista e quero remover estes apps."),
      });
      if (!r.ok) return;
      onDone(await startUninstall(list, r.option === 'leftovers'));
      return;
    }
    const r = await confirm({
      title: list.length === 1 ? tr("Desinstalar {0}?", list[0].name) : tr("Desinstalar {0} programas?", list.length),
      message: <>{tr("Os desinstaladores rodam um de cada vez. Alguns abrem a própria janela, e outros pedem permissão de administrador. O espaço estimado a liberar é de")} <b>{fmtSize(total)}</b>.</>,
      items: list.map((a) => ({ label: `${a.name}${a.version ? ' ' + a.version : ''}`, detail: a.size ? fmtSize(a.size) : undefined })),
      options: [
        { key: 'normal', label: tr("Usar o desinstalador de cada programa"), hint: tr("Esta é a opção mais segura, porque você acompanha cada etapa.") },
        { key: 'silent', label: tr("Silencioso quando disponível"), hint: tr("Usa o modo silencioso do fabricante, quando ele existe. Nesse modo, o desinstalador não faz perguntas.") },
      ],
      defaultOption: settings?.silentUninstall ? 'silent' : 'normal',
      danger: true, confirmLabel: tr("Desinstalar"), requireCheck: tr("Revisei a lista e quero remover estes programas."),
    });
    if (!r.ok) return;
    const ok = await startUninstall(list, r.option === 'silent');
    onDone(ok);
  };

  const panel = running && (
    <Card className="mb-4 anim-fade" title={running.done ? tr("Desinstalação concluída") : tr("A desinstalação está em andamento e continua mesmo se você trocar de tela.")} actions={running.done && <Button size="sm" variant="ghost" onClick={clearFinishedTasks}>{tr("Fechar")}</Button>}>
      <div className="space-y-1">
        {running.items.map((a) => {
          const s = running.status[a.id];
          return (
            <div key={a.id} className="flex items-center gap-3 text-[13px]">
              {s.status === 'running' ? <Loader2 size={15} className="animate-spin text-accent" /> : s.status === 'ok' ? <CheckCircle2 size={15} className="text-accent" /> : s.status === 'fail' ? <XCircle size={15} className="text-danger" /> : <span className="h-[15px] w-[15px] rounded-full border border-line-strong" />}
              <span className="flex-1 truncate">{a.name}</span>
              <span className={cx('text-xs', s.status === 'fail' ? 'text-danger' : 'text-muted')}>{s.status === 'pending' ? tr("Na fila") : s.status === 'running' ? tr("Desinstalando…") : s.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
  return { start, panel, busy: !!running && !running.done };
}

/** Programas instalados mais recentemente (sem componentes, apps do sistema e entradas órfãs). */
export function recentInstalls(apps: AppEntry[] | null, n: number): AppEntry[] {
  return (apps || []).filter((a) => a.installDate && a.canUninstall && !a.background && !a.orphan)
    .sort((a, b) => (b.installDate || 0) - (a.installDate || 0)).slice(0, n);
}

/** Pasta do programa para abrir na árvore (no Windows, a do executável quando o registro não informa). */
export const appFolder = (a: AppEntry) => a.location || (a.exes?.[0] ? a.exes[0].replace(/[\\/][^\\/]+$/, '') : undefined);

/** Faixa "Instalados recentemente": clique abre o dossiê; o botão da pasta abre na árvore. */
export function RecentInstalls({ apps, n = 8, compact }: { apps: AppEntry[] | null; n?: number; compact?: boolean }) {
  const { openDossier, startScan, go } = useApp();
  const list = recentInstalls(apps, n);
  if (!apps) return <div className={cx('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-4')}>{Array.from({ length: compact ? 4 : n }, (_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>;
  if (!list.length) return <div className="text-xs text-muted">{tr("Nenhum programa tem data de instalação registrada.")}</div>;
  return (
    <div className={cx(compact ? '-mx-1 space-y-0.5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4')}>
      {list.map((a) => {
        const dir = appFolder(a);
        return (
          <div key={a.id} className={cx('group flex items-center gap-2.5 rounded-lg transition-colors hover:bg-hover', compact ? 'px-1 py-1' : 'border border-line bg-surface px-2.5 py-2')}>
            <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => openDossier({ kind: 'app', app: a })} onMouseEnter={() => prefetchDossier(a)} onMouseLeave={cancelPrefetch} title={tr("Ver o dossiê")}>
              <AppIcon app={a} size={compact ? 34 : 40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{a.name}</span>
                <span className="block truncate text-[11px] text-faint" title={fmtDate(a.installDate, true)}>{tr("Instalado")} {fmtRelative(a.installDate).toLowerCase()}</span>
              </span>
            </button>
            {dir && <button className="shrink-0 rounded p-1 text-muted opacity-60 hover:bg-[var(--hover)] hover:text-fg group-hover:opacity-100" title={tr("Abrir a pasta na árvore")} onClick={async () => { await startScan(dir); go('explorer'); }}><FolderTree size={14} /></button>}
          </div>
        );
      })}
    </div>
  );
}

// abrir o Desinstalador já ordenado (Visão geral: "Ver todos" de maiores ou de recentes)
let pendingSort: string | null = null;
const SORT_EVENT = 'cc:uninstall-sort';
export function openUninstaller(go: (p: 'uninstall') => void, sort: 'size:false' | 'installDate:false') {
  pendingSort = sort;
  window.dispatchEvent(new CustomEvent(SORT_EVENT, { detail: sort }));
  go('uninstall');
}
const parseSort = (v: string) => { const [key, a] = v.split(':'); return { key, asc: a === 'true' }; };
/** Ordenação do Desinstalador que respeita o pedido da Visão geral. */
export function useUninstallSort() {
  const [sort, setSort] = useState(() => { const p = pendingSort; pendingSort = null; return parseSort(p || 'size:false'); });
  useEffect(() => {
    const h = (e: Event) => { pendingSort = null; setSort(parseSort((e as CustomEvent).detail)); };
    window.addEventListener(SORT_EVENT, h);
    return () => window.removeEventListener(SORT_EVENT, h);
  }, []);
  return [sort, setSort] as const;
}

/** Passar o mouse sobre um app já começa a ler o dossiê dele (o processo principal guarda o resultado). */
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
export function prefetchDossier(app: AppEntry) {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => { cc.dossierLocal({ kind: 'app', app }).catch(() => {}); }, 180);
}
export function cancelPrefetch() { if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; } }
