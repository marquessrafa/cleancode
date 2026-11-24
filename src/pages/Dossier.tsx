// Dossiê de um programa, app ou jogo: tudo o que o sistema sabe dele (assinatura, versão, tecnologias,
// licenças, dados no perfil, uso) e, se a pessoa permitir, o que é público (quem criou, licença, data de
// lançamento, resumo da Wikipedia, App Store, Steam). Abre a pasta do programa na árvore.
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, Calendar, Clock, Code2, ExternalLink, FileText, FolderOpen, FolderTree, Gamepad2, Globe,
  HardDrive, Info, Layers, RefreshCw, ShieldCheck, ShieldAlert, Trash2, WifiOff,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, isMac, FILE_MANAGER, DossierFact, DossierLocal, DossierOnline, DossierGroup, DossierFile } from '../lib/api';
import { fmtDate, fmtRelative, fmtSize } from '../lib/format';
import { Badge, Button, Card, cx, Toggle } from '../components/ui';
import { PageBody } from './common';
import { AppIcon, useUninstall } from './appsShared';

const ONLINE_KEY = 'cc.dossier.online';
const onlineAllowed = () => { try { return localStorage.getItem(ONLINE_KEY) !== '0'; } catch { return true; } };

const GROUPS: { id: DossierGroup; title: string; icon: React.ReactNode }[] = [
  { id: 'about', title: 'Sobre', icon: <Info size={14} /> },
  { id: 'install', title: 'Instalação', icon: <HardDrive size={14} /> },
  { id: 'usage', title: 'Uso', icon: <Clock size={14} /> },
  { id: 'tech', title: 'Técnico', icon: <Code2 size={14} /> },
  { id: 'security', title: 'Segurança', icon: <ShieldCheck size={14} /> },
];

/** compara versões "1.2.10" x "1.2.9" (só os números) */
function cmpVer(a: string, b: string) {
  const x = a.split(/[^\d]+/).filter(Boolean).map(Number), y = b.split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

function Value({ f }: { f: DossierFact }) {
  const { settings } = useApp();
  const tone = f.tone === 'ok' ? 'text-accent' : f.tone === 'warn' ? 'text-warn' : f.tone === 'danger' ? 'text-danger' : 'text-fg';
  const v = f.value;
  switch (f.kind) {
    case 'date': return <span className={tone}>{fmtDate(+v)} <span className="text-faint">· {fmtRelative(+v)}</span></span>;
    case 'size': return <span className={cx(tone, 'tnum')}>{fmtSize(+v, settings?.units)}</span>;
    case 'url': return <button className="inline-flex min-w-0 max-w-full items-center gap-1 text-accent hover:underline" onClick={() => cc.openLink(String(v))}><span className="truncate">{String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span><ExternalLink size={11} className="shrink-0" /></button>;
    case 'path': return <button className="min-w-0 max-w-full truncate text-left font-mono text-[11.5px] text-fg hover:text-accent" title={`Mostrar no ${FILE_MANAGER}`} onClick={() => cc.showInFolder(String(v))}>{String(v)}</button>;
    case 'mono': return <span className={cx('break-all font-mono text-[11.5px]', tone)}>{String(v)}</span>;
    default: return <span className={cx('whitespace-pre-line break-words', tone)}>{String(v)}</span>;
  }
}

function FactList({ facts }: { facts: DossierFact[] }) {
  return (
    <dl className="divide-y divide-line">
      {facts.map((f, i) => (
        <div key={f.label + i} className="grid grid-cols-[150px_1fr] gap-3 py-2 text-[12.5px] first:pt-0 last:pb-0">
          <dt className="text-muted">{f.label}</dt>
          <dd className="min-w-0" title={f.hint}><Value f={f} />{f.hint && f.hint !== 'Wikidata' && f.hint !== 'App Store' && f.hint !== 'Steam' && <div className="mt-0.5 text-[11px] text-faint">{f.hint}</div>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Files({ files, onTree, empty }: { files: DossierFile[]; onTree?: (p: string) => void; empty: string }) {
  const { settings } = useApp();
  const [all, setAll] = useState(false);
  if (!files.length) return <div className="text-[12.5px] text-muted">{empty}</div>;
  const shown = all ? files : files.slice(0, 6);
  return (
    <div className="-mx-2 space-y-0.5">
      {shown.map((f) => (
        <div key={f.path} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] text-fg" title={f.path}>{f.path.split(/[\\/]/).pop()}</div>
            <div className="truncate text-[11px] text-faint">{f.kind} · {f.path}</div>
          </div>
          <span className="text-xs text-muted tnum">{f.size < 0 ? <span className="inline-block h-3 w-12 animate-pulse rounded bg-[var(--line)] align-middle" /> : fmtSize(f.size, settings?.units)}</span>
          {onTree && <button className="rounded p-1 text-muted opacity-0 hover:bg-[var(--hover)] hover:text-fg group-hover:opacity-100" title="Abrir na árvore" onClick={() => onTree(f.path)}><FolderTree size={13} /></button>}
          <button className="rounded p-1 text-muted opacity-0 hover:bg-[var(--hover)] hover:text-fg group-hover:opacity-100" title={onTree ? `Mostrar no ${FILE_MANAGER}` : 'Abrir'} onClick={() => (onTree ? cc.showInFolder(f.path) : cc.openLocation(f.path))}>{onTree ? <FolderOpen size={13} /> : <FileText size={13} />}</button>
        </div>
      ))}
      {files.length > 6 && <button className="px-2 pt-1 text-[12px] text-accent hover:underline" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : `Mostrar todos (${files.length})`}</button>}
    </div>
  );
}

export default function DossierPage() {
  const { dossier, go, startScan, navBack, canBack } = useApp();
  const [local, setLocal] = useState<DossierLocal | null>(null);
  const [online, setOnline] = useState<DossierOnline | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [allow, setAllow] = useState(onlineAllowed);
  const un = useUninstall(() => go(dossier?.from || 'uninstall'));
  const t = dossier?.target;
  const key = t ? (t.kind === 'app' ? t.app.id : t.game.id) : '';

  useEffect(() => {
    if (!t) return;
    let alive = true;
    setLocal(null); setOnline(null);
    cc.dossierLocal(t).then((d) => {
      if (!alive) return;
      setLocal(d);
      // tamanhos das pastas de dados chegam depois (worker)
      const pending = d.data.filter((x) => x.size < 0).map((x) => x.path);
      // macOS: avaliação do Gatekeeper chega depois (leva segundos em apps grandes)
      if (isMac && d.folder?.endsWith('.app')) cc.dossierGatekeeper(d.folder).then((g) => g && alive && setLocal((cur) => (cur && !cur.facts.some((x) => x.label === 'Gatekeeper') ? {
        ...cur, facts: [...cur.facts.filter((x) => x.label !== 'Notarização' || !/notariz/i.test(g.badge.label)), g.fact], badges: [...cur.badges, g.badge],
      } : cur))).catch(() => {});
      if (pending.length) cc.dossierSizes(pending).then((sz) => alive && setLocal((cur) => (cur ? { ...cur, data: cur.data.map((x) => (x.path in sz ? { ...x, size: sz[x.path] } : x)) } : cur))).catch(() => {});
    }).catch(() => alive && setLocal({ facts: [], badges: [], tech: [], licenses: [], data: [], query: { name: t.kind === 'app' ? t.app.name : t.game.name, kind: t.kind } }));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOnline = (refresh = false) => {
    if (!local) return;
    setOnlineBusy(true);
    cc.dossierOnline(local.query, refresh).then(setOnline).catch(() => setOnline({ facts: [], sources: [], error: 'Sem conexão.' })).finally(() => setOnlineBusy(false));
  };
  useEffect(() => { if (local && allow) fetchOnline(); }, [local, allow]); // eslint-disable-line react-hooks/exhaustive-deps

  const facts = useMemo(() => {
    const by: Record<DossierGroup, DossierFact[]> = { about: [], install: [], usage: [], tech: [], security: [] };
    for (const f of local?.facts || []) by[f.group].push(f);
    if (local?.data.length) {
      const measuring = local.data.some((x) => x.size < 0);
      const total = local.data.reduce((s, x) => s + Math.max(0, x.size), 0);
      by.install.push(measuring ? { group: 'install', label: isMac ? 'Dados em ~/Library' : 'Dados no AppData', value: 'medindo…' } : { group: 'install', label: isMac ? 'Dados em ~/Library' : 'Dados no AppData', value: total, kind: 'size' });
    }
    // o que é público entra em "Sobre", sem repetir rótulos que o sistema já deu
    const have = new Set(by.about.map((f) => f.label));
    for (const f of online?.facts || []) if (!have.has(f.label)) by.about.push(f);
    return by;
  }, [local, online]);

  if (!t) return <PageBody><Button icon={<ArrowLeft size={14} />} onClick={() => go('uninstall')}>Voltar</Button></PageBody>;
  const app = t.kind === 'app' ? t.app : null;
  const game = t.kind === 'game' ? t.game : null;
  const name = app?.name || game!.name;
  const version = app?.version;
  const publisher = app?.publisher || facts.about.find((f) => /desenvolvedor/i.test(f.label))?.value;
  const latest = online?.latest;
  const outdated = version && latest && /\d/.test(latest) && cmpVer(version, latest) < 0;
  const openTree = async (p: string) => { await startScan(p); go('explorer'); };
  const dataTotal = (local?.data || []).reduce((s, d) => s + Math.max(0, d.size), 0);

  return (
    <PageBody>
      <button onClick={() => (canBack ? navBack() : go(dossier!.from))} className="mb-3 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-muted hover:bg-hover hover:text-fg">
        <ArrowLeft size={14} /> Voltar
      </button>
      {un.panel}

      {/* cabeçalho */}
      <div className="mb-4 flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 md:flex-row md:items-center anim-fade">
        {app ? <AppIcon app={app} size={96} /> : <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2"><Gamepad2 size={34} className="text-accent" /></div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-fg">{name}</h1>
            {version && <span className="text-[14px] text-muted">{version}</span>}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted">{publisher ? String(publisher) : game ? 'Jogo' : 'Fabricante desconhecido'}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {local?.running && <Badge tone="accent">Em execução</Badge>}
            {local?.badges.map((b) => <Badge key={b.label} tone={b.tone === 'ok' ? 'accent' : b.tone === 'warn' ? 'warn' : b.tone === 'danger' ? 'danger' : 'default'} title={b.hint}>{b.label}</Badge>)}
            {outdated && <Badge tone="warn" title="Versão mais recente segundo as fontes públicas">Há versão mais nova: {latest}</Badge>}
            {!local && <span className="skeleton h-5 w-40 rounded" />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
          <Button variant="primary" icon={<FolderTree size={14} />} disabled={!local?.folder} onClick={() => local?.folder && openTree(local.folder)}>Abrir na árvore</Button>
          <Button icon={<FolderOpen size={14} />} disabled={!local?.folder} onClick={() => local?.folder && cc.showInFolder(local.folder)}>Mostrar no {FILE_MANAGER}</Button>
          {app && <Button variant="outline" icon={<Trash2 size={14} />} disabled={!app.canUninstall || app.orphan || un.busy} onClick={() => un.start([app])}>Desinstalar</Button>}
        </div>
      </div>

      {/* resumo público */}
      <Card className="mb-4" title={<span className="flex items-center gap-2"><Globe size={14} /> Dossiê público</span>}
        actions={<div className="flex items-center gap-3">
          {allow && <Button size="sm" variant="ghost" icon={<RefreshCw size={12} className={onlineBusy ? 'animate-spin' : ''} />} disabled={onlineBusy || !local} onClick={() => fetchOnline(true)}>Atualizar</Button>}
          <Toggle checked={allow} onChange={(v) => { setAllow(v); try { localStorage.setItem(ONLINE_KEY, v ? '1' : '0'); } catch { /* */ } if (!v) setOnline(null); }} label="Buscar na internet" />
        </div>}>
        {!allow ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted"><WifiOff size={14} /> Desligado. Ligue para ver quem criou, licença, data de lançamento e um resumo. Só o nome do programa é enviado (Wikidata, Wikipedia{isMac ? ', App Store' : ''}, Steam).</div>
        ) : onlineBusy && !online ? (
          <div className="space-y-2"><div className="skeleton h-4 w-full rounded" /><div className="skeleton h-4 w-[92%] rounded" /><div className="skeleton h-4 w-[70%] rounded" /></div>
        ) : online?.summary ? (
          <div>
            <p className="max-w-[900px] text-[13px] leading-relaxed text-fg">{online.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
              <span>Fontes:</span>
              {online.sources.map((s) => <button key={s.url} className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => cc.openLink(s.url)}>{s.label} <ExternalLink size={10} /></button>)}
            </div>
          </div>
        ) : (
          <div className="text-[12.5px] text-muted">{online?.error || (online?.facts.length ? 'Sem resumo, mas há dados em "Sobre".' : 'Procurando…')}
            {!!online?.sources.length && <span className="ml-2">{online.sources.map((s) => <button key={s.url} className="ml-2 text-accent hover:underline" onClick={() => cc.openLink(s.url)}>{s.label}</button>)}</span>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {GROUPS.map((g) => {
          const list = facts[g.id];
          const loading = !local && g.id !== 'about';
          if (!loading && !list.length && g.id !== 'about') return null;
          return (
            <Card key={g.id} title={<span className="flex items-center gap-2">{g.id === 'security' && local?.badges.some((b) => b.tone === 'danger') ? <ShieldAlert size={14} className="text-danger" /> : g.icon} {g.title}</span>}>
              {loading || (!local && !list.length) ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-5 rounded" />)}</div>
                : list.length ? <FactList facts={list} /> : <div className="text-[12.5px] text-muted">Nada encontrado.</div>}
              {g.id === 'tech' && !!local?.tech.length && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  <Layers size={13} className="text-muted" />
                  {local.tech.map((x) => <Badge key={x}>{x}</Badge>)}
                </div>
              )}
            </Card>
          );
        })}
        {local && !facts.tech.length && !!local.tech.length && (
          <Card title={<span className="flex items-center gap-2"><Layers size={14} /> Tecnologias</span>}>
            <div className="flex flex-wrap gap-1.5">{local.tech.map((x) => <Badge key={x}>{x}</Badge>)}</div>
          </Card>
        )}
        <Card title={<span className="flex items-center gap-2"><BadgeCheck size={14} /> Licenças e avisos {local && <span className="text-xs font-normal text-faint">({local.licenses.length})</span>}</span>}>
          {!local ? <div className="skeleton h-10 rounded" /> : <Files files={local.licenses} empty="Nenhum arquivo de licença dentro do programa. Veja a licença em “Sobre”, quando houver." />}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Calendar size={14} /> Dados do programa no seu perfil {local && dataTotal > 0 && <span className="text-xs font-normal text-faint">({fmtSize(dataTotal)})</span>}</span>}>
          {!local ? <div className="skeleton h-10 rounded" /> : <Files files={local.data} onTree={(p) => openTree(p)} empty={isMac ? 'Nada em ~/Library com o identificador ou o nome deste app.' : 'Nenhuma pasta no AppData ou no ProgramData com o nome deste programa.'} />}
        </Card>
      </div>
      {local && local.data.length > 0 && <div className="mt-3 text-[11.5px] text-faint">Para limpar caches e sobras com segurança, use a tela {isMac ? 'Dados de apps' : 'AppData'}. <button className="text-accent hover:underline" onClick={() => go('appdata')}>Abrir</button></div>}
    </PageBody>
  );
}
