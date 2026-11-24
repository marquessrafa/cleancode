// Proteção: estado das defesas do sistema, o que inicia sozinho (com assinatura e local verificados)
// e extensões de navegador. Não substitui o antivírus do SO; mostra o que merece atenção.
import React, { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, ExternalLink, FolderOpen, Puzzle, Power, RotateCcw, Info, Globe, ScanLine, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, ProtectionReport, PersistenceFinding, isMac, OS_NAME, FILE_MANAGER } from '../lib/api';
import { fmtNum } from '../lib/format';
import { Badge, Button, cx, Segmented } from '../components/ui';
import { Float3D } from './maint';
import { PageBody } from './common';

const SIG_LABEL: Record<string, string> = {
  apple: isMac ? 'Apple' : 'Microsoft', developer: 'Assinado', adhoc: 'Assinatura sem desenvolvedor', unsigned: 'Sem assinatura',
  invalid: 'Assinatura inválida', missing: 'Programa ausente', unknown: 'Não verificado',
};
const KIND_LABEL: Record<string, string> = { login: 'Item de login', agent: 'Agente', daemon: 'Serviço', run: 'Inicialização', folder: 'Pasta Inicializar', task: 'Tarefa agendada' };

function Shield({ state, size = 220, active }: { state: 'idle' | 'good' | 'warn' | 'risk'; size?: number; active?: boolean }) {
  const tone = state === 'risk' ? 'var(--danger)' : state === 'warn' ? 'var(--warn)' : 'var(--accent)';
  const Icon = state === 'risk' ? ShieldX : state === 'warn' ? ShieldAlert : ShieldCheck;
  return <Float3D icon={<Icon />} active={active} tone={tone} size={size} />;
}

export default function Protection() {
  const { toast, confirm } = useApp();
  const [phase, setPhase] = useState<'intro' | 'scanning' | 'done'>('intro');
  const [rep, setRep] = useState<ProtectionReport | null>(null);
  const [filter, setFilter] = useState<'attention' | 'all'>('attention');
  const [busy, setBusy] = useState<string | null>(null);
  useRunning('protection', phase === 'scanning' ? 'Proteção: verificando' : null);
  const [qs, setQs] = useState<{ running: boolean; result?: { ok: boolean; message: string } }>({ running: false });

  const scan = async () => { setPhase('scanning'); try { setRep(await cc.protectionScan()); } finally { setPhase('done'); } };
  const issues = useMemo(() => {
    if (!rep) return { critical: 0, checks: 0, risk: 0, warn: 0 };
    return {
      critical: rep.checks.filter((c) => c.ok === false && c.critical).length,
      checks: rep.checks.filter((c) => c.ok === false).length,
      risk: rep.persistence.filter((p) => p.level === 'risk').length,
      warn: rep.persistence.filter((p) => p.level === 'warn').length,
    };
  }, [rep]);
  const state: 'good' | 'warn' | 'risk' = issues.critical || issues.risk ? 'risk' : issues.checks || issues.warn ? 'warn' : 'good';
  const headline = state === 'good' ? 'Tudo certo' : state === 'warn' ? 'Alguns pontos de atenção' : 'Precisa da sua atenção';

  const disable = async (f: PersistenceFinding) => {
    if (!f.startupId) return;
    const r = await confirm({ title: `${f.control === 'remove' ? 'Remover' : 'Desativar'} "${f.name}"?`, message: <>Ele deixa de iniciar sozinho. {f.reasons.length ? <>Motivo: {f.reasons.join('; ').toLowerCase()}.</> : null} Dá para reativar em Desempenho › Itens de início.</>, confirmLabel: f.control === 'remove' ? 'Remover' : 'Desativar', danger: f.level === 'risk' });
    if (!r.ok) return;
    setBusy(f.id);
    const res = await cc.perfSetStartup(f.startupId, false);
    setBusy(null);
    toast(`${f.name}: ${res.message}`, res.ok ? 'ok' : 'error');
    if (res.ok) setRep((x) => x && { ...x, persistence: x.persistence.map((p) => (p.id === f.id ? { ...p, enabled: false } : p)) });
  };
  const quick = async () => { setQs({ running: true }); const r = await cc.protectionQuickScan(); setQs({ running: false, result: r }); toast(r.message, r.ok ? 'ok' : 'error'); };

  if (phase !== 'done' || !rep) {
    return (
      <PageBody>
        <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center gap-10 py-6 lg:flex-row lg:gap-16">
          <div className="anim-pop"><Shield state="idle" size={280} active={phase === 'scanning'} /></div>
          <div className="max-w-md anim-page">
            <h1 className="text-[40px] font-semibold leading-tight tracking-tight text-fg">Proteção</h1>
            <p className="mt-2 text-[15px] text-muted">Confere as defesas do {OS_NAME}, a assinatura de tudo o que inicia sozinho e as extensões dos navegadores.</p>
            <div className="mt-6 space-y-3">
              {[
                { icon: <ShieldCheck size={16} />, t: isMac ? 'Gatekeeper, SIP, XProtect, FileVault e firewall' : 'Defender, firewall, UAC e SmartScreen' },
                { icon: <Power size={16} />, t: 'Itens que iniciam sozinhos: assinatura e local' },
                { icon: <Puzzle size={16} />, t: 'Extensões de navegador com acesso a todos os sites' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-[14px] font-medium text-fg anim-page" style={{ animationDelay: `${80 + i * 60}ms` }}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">{f.icon}</span>{f.t}
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted"><Info size={13} className="mt-0.5 shrink-0" />Não substitui um antivírus: a detecção de malware conhecido fica com o {isMac ? 'XProtect da Apple' : 'Microsoft Defender'}, cujo estado aparece aqui.</div>
            {phase === 'scanning' ? (
              <div className="mt-8 flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin text-accent" /> Verificando assinaturas e configurações…</div>
            ) : (
              <button onClick={scan} className="relative mt-8 flex h-28 w-28 items-center justify-center rounded-full text-[17px] font-semibold text-accent-fg transition-transform hover:scale-105 active:scale-95"
                style={{ background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 55%, #ffffff), var(--accent) 60%)', boxShadow: '0 10px 40px color-mix(in srgb, var(--accent) 45%, transparent)' }}>
                <span className="absolute inset-0 rounded-full anim-ping-soft" style={{ boxShadow: '0 0 0 2px var(--accent)' }} />
                Verificar
              </button>
            )}
          </div>
        </div>
      </PageBody>
    );
  }

  const shown = rep.persistence.filter((p) => filter === 'all' || p.level !== 'ok');
  const allSites = rep.extensions.filter((e) => e.allSites).length;
  return (
    <PageBody>
      <div className="mb-6 flex flex-wrap items-center gap-6 anim-page">
        <Shield state={state} size={120} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted">Proteção</div>
          <div className="text-[30px] font-semibold leading-tight tracking-tight text-fg">{headline}</div>
          <div className="mt-1 text-sm text-muted">
            {issues.checks ? `${issues.checks} defesa(s) desligada(s)` : 'Defesas do sistema ligadas'} · {issues.risk ? `${issues.risk} item(ns) suspeito(s)` : 'nenhum item suspeito'}{issues.warn ? ` · ${issues.warn} para revisar` : ''} · {fmtNum(rep.persistence.length)} itens analisados
          </div>
        </div>
        <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={scan}>Verificar de novo</Button>
      </div>

      {/* defesas do sistema */}
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Defesas do {OS_NAME}</div>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rep.checks.map((c, i) => (
          <div key={c.id} className={cx('rounded-xl border bg-surface p-4 anim-page', c.ok === false && c.critical ? 'border-danger/40' : 'border-line')} style={{ animationDelay: `${i * 35}ms` }}>
            <div className="flex items-start gap-3">
              <span className={cx('mt-0.5', c.ok ? 'text-accent' : c.ok === false ? (c.critical ? 'text-danger' : 'text-warn') : 'text-faint')}>{c.ok ? <CheckCircle2 size={18} /> : c.ok === false ? (c.critical ? <XCircle size={18} /> : <AlertTriangle size={18} />) : <HelpCircle size={18} />}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-fg">{c.name}</div>
                <div className="mt-0.5 text-xs text-muted">{c.detail}</div>
                {c.ok === false && c.settingsUrl && <button onClick={() => cc.openSystemSettings(c.settingsUrl!)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Abrir ajustes <ExternalLink size={11} /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {rep.quickScanName && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <ScanLine size={18} className="text-accent" />
          <div className="min-w-0 flex-1"><div className="text-[14px] font-medium text-fg">{rep.quickScanName}</div><div className="text-xs text-muted">{qs.result ? qs.result.message : 'Procura vírus nos locais mais comuns. A verificação leva alguns minutos.'}</div></div>
          <Button variant="primary" icon={qs.running ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} disabled={qs.running} onClick={quick}>{qs.running ? 'Verificando…' : 'Verificar agora'}</Button>
        </div>
      )}

      {/* o que inicia sozinho */}
      <div className="mb-2 flex items-center gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">O que inicia sozinho</div>
        <div className="flex-1" />
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'attention', label: `Para revisar (${issues.risk + issues.warn})` }, { value: 'all', label: `Todos (${rep.persistence.length})` }]} />
      </div>
      <div className="mb-6 overflow-hidden rounded-xl border border-line bg-surface">
        {!shown.length ? <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted"><CheckCircle2 size={16} className="text-accent" /> Todos os itens têm assinatura e estão nos locais esperados.</div> : shown.map((f, i) => (
          <div key={f.id} className={cx('group flex items-start gap-3 px-4 py-3', i > 0 && 'border-t border-line', !f.enabled && 'opacity-60')}>
            <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', f.level === 'risk' ? 'bg-danger' : f.level === 'warn' ? 'bg-warn' : 'bg-accent')} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-fg">
                <span className="truncate">{f.name}</span><Badge>{KIND_LABEL[f.kind] || f.kind}</Badge>
                <Badge tone={f.signature.status === 'developer' || f.signature.status === 'apple' ? 'accent' : f.signature.status === 'invalid' ? 'danger' : 'warn'}>{SIG_LABEL[f.signature.status]}{f.signature.signer && f.signature.status !== 'apple' ? `: ${f.signature.signer}` : ''}</Badge>
                {!f.enabled && <Badge>desativado</Badge>}
              </div>
              <div className="truncate text-xs text-faint" title={f.detail}>{f.executable || f.detail}</div>
              {f.reasons.length > 0 && <div className={cx('mt-0.5 text-xs', f.level === 'risk' ? 'text-danger' : 'text-warn')}>{f.reasons.join(' · ')}</div>}
            </div>
            {f.executable.startsWith('/') && <button title={`Mostrar no ${FILE_MANAGER}`} onClick={() => cc.showInFolder(f.executable)} className="mt-0.5 rounded p-1 text-faint opacity-0 hover:text-fg group-hover:opacity-100"><FolderOpen size={14} /></button>}
            {f.startupId && f.enabled && f.control !== 'none' && f.level !== 'ok' && (
              <Button size="sm" variant="outline" icon={busy === f.id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />} disabled={busy === f.id} onClick={() => disable(f)}>{f.control === 'remove' ? 'Remover' : 'Desativar'}</Button>
            )}
          </div>
        ))}
      </div>

      {/* extensões */}
      <div className="mb-2 flex items-baseline gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-faint">Extensões de navegador</span><span className="text-xs text-faint">· {fmtNum(rep.extensions.length)} instaladas{allSites ? ` · ${allSites} com acesso a todos os sites` : ''}</span></div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {!rep.extensions.length ? <div className="px-4 py-6 text-sm text-muted">Nenhuma extensão encontrada.</div> : rep.extensions.map((e, i) => (
          <div key={e.id} className={cx('group flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
            <Puzzle size={15} className="shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-fg"><span className="truncate">{e.name}</span>{e.allSites && <Badge tone="warn"><Globe size={10} className="mr-1 inline" />todos os sites</Badge>}</div>
              <div className="text-xs text-faint">{e.browser}{e.profile ? ` · ${e.profile}` : ''}{e.version ? ` · versão ${e.version}` : ''}</div>
            </div>
            <button title={`Mostrar no ${FILE_MANAGER}`} onClick={() => cc.showInFolder(e.path)} className="rounded p-1 text-faint opacity-0 hover:text-fg group-hover:opacity-100"><FolderOpen size={14} /></button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">Para remover uma extensão, use o menu Extensões do próprio navegador. É normal que bloqueadores de anúncio e gerenciadores de senha tenham acesso a todos os sites. Mesmo assim, desconfie das extensões que você não reconhece.</p>
    </PageBody>
  );
}
