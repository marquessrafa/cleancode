// Modo Jogo: uma "sessão de jogo" que fecha o que pesa em segundo plano, libera memória e põe o
// sistema em desempenho máximo; ao encerrar, restaura o que foi mudado. Mais ajustes do SO para jogos,
// limpeza dos caches de shaders e a lista de jogos instalados (Steam, Epic, GOG, apps de jogos).
import React, { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Zap, MemoryStick, Power, Play, Square, Loader2, CheckCircle2, XCircle, Sparkles, RotateCcw, Rocket, FolderPlus, Folder, X } from 'lucide-react';
import { useApp, useRunning } from '../lib/store';
import { cc, isMac, GameInfo, GameStatus, GameStep } from '../lib/api';
import { fmtSize } from '../lib/format';
import { Badge, Button, Checkbox, Toggle, cx } from '../components/ui';
import { PageBody } from './common';
import { Hero, Orb } from './maint';

const SYS = /^(CleanCode|Electron|Finder|Dock|SystemUIServer|WindowServer|explorer|dwm|csrss|svchost|System|Registry|Idle|steam|steamwebhelper|EpicGamesLauncher|GalaxyClient)$/i;

export default function GameMode() {
  const { toast } = useApp();
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  useEffect(() => { cc.gameDirs().then(setDirs).catch(() => {}); }, []);
  const refreshGames = () => cc.gameGames().then(setGames).catch(() => {});
  const addDir = async () => { const d = await cc.gameAddDir(); setDirs(d); refreshGames(); };
  const removeDir = async (dir: string) => { setDirs(await cc.gameRemoveDir(dir)); refreshGames(); };
  const [apps, setApps] = useState<{ name: string; mem: number; cpu: number; pids: number[] }[]>([]);
  const [close, setClose] = useState<Set<string>>(new Set());
  const [power, setPower] = useState(true);
  const [freeMem, setFreeMem] = useState(true);
  const [game, setGame] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<GameStep[]>([]);
  const [started, setStarted] = useState(false);
  useRunning('game', status?.session ? 'Modo Jogo ativo' : busy === 'start' ? 'Modo Jogo: ativando' : null);

  const load = async () => {
    setBusy('load');
    try {
      const [st, gs, procs] = await Promise.all([cc.gameStatus(), cc.gameGames().catch(() => []), cc.perfProcesses().catch(() => [])]);
      setStatus(st); setGames(gs);
      const g = new Map<string, { name: string; mem: number; cpu: number; pids: number[] }>();
      // no Mac só apps de verdade (.app): processos de terminal não respondem ao pedido de fechar
      for (const p of procs) { if (SYS.test(p.name) || (isMac && !(p.path || '').includes('.app/'))) continue; const x = g.get(p.name) || { name: p.name, mem: 0, cpu: 0, pids: [] }; x.mem += p.mem; x.cpu += p.cpu; x.pids.push(p.pid); g.set(p.name, x); }
      const list = [...g.values()].sort((a, b) => b.mem - a.mem).slice(0, 14);
      setApps(list);
      // pré-seleção: o que pesa bastante (mais de 400 MB)
      setClose(new Set(list.filter((a) => a.mem > 400 * 1048576).map((a) => a.name)));
      setStarted(true);
    } finally { setBusy(null); }
  };
  useEffect(() => { cc.gameStatus().then((st) => { if (st.session) { setStatus(st); load(); } }).catch(() => null); }, []);
  const chosenGame = games.find((g) => g.id === game);
  const freeing = useMemo(() => apps.filter((a) => close.has(a.name)).reduce((s, a) => s + a.mem, 0), [apps, close]);

  const start = async () => {
    setBusy('start'); setSteps([]);
    try {
      const r = await cc.gameStart({ close: apps.filter((a) => close.has(a.name)).map((a) => ({ name: a.name, pids: a.pids })), power, freeMemory: freeMem, boostDir: chosenGame?.dir });
      setSteps(r.steps);
      if (chosenGame) await cc.gameLaunch(chosenGame.launch);
      setStatus(await cc.gameStatus());
      toast(chosenGame ? `Modo Jogo ativo · abrindo ${chosenGame.name}` : 'Modo Jogo ativo', 'ok');
    } finally { setBusy(null); }
  };
  const stop = async () => {
    setBusy('stop');
    try { const r = await cc.gameStop(); setSteps(r.steps); setStatus(await cc.gameStatus()); toast('Modo Jogo encerrado: ajustes restaurados', 'ok'); } finally { setBusy(null); }
  };
  const setToggle = async (id: string, on: boolean) => {
    setBusy(`t:${id}`);
    const r = await cc.gameToggle(id, on);
    toast(r.message, r.ok ? 'ok' : 'error');
    setStatus(await cc.gameStatus()); setBusy(null);
  };
  const shaders = async () => {
    setBusy('shaders');
    const r = await cc.gameShaders();
    toast(`${fmtSize(r.freed)} de cache de shaders limpos`, 'ok');
    setStatus(await cc.gameStatus()); setBusy(null);
  };

  if (!started) {
    return (
      <Hero icon={<Gamepad2 size={46} />} title="Modo Jogo"
        text="Uma sessão de jogo: fecha o que pesa em segundo plano, libera memória e põe o sistema em desempenho máximo. Ao encerrar, tudo volta como estava."
        bullets={[
          { icon: <MemoryStick size={15} />, text: 'Fecha apps pesados e libera memória' },
          { icon: <Power size={15} />, text: isMac ? 'Desliga o Modo Pouca Energia durante a sessão' : 'Plano de energia de alto desempenho e prioridade alta para o jogo' },
          { icon: <Sparkles size={15} />, text: isMac ? 'Limpa caches de shaders Metal' : 'Ajustes do Windows para jogos e cache de shaders' },
        ]}
        note="O ganho maior vem de tirar programas pesados do caminho. Liberar memória sozinho rende pouco em FPS."
        action={{ label: 'Preparar', onClick: load }} busy={busy === 'load'} busyText="Lendo…" />
    );
  }

  const active = !!status?.session;
  return (
    <PageBody>
      <div className="flex items-center gap-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <Orb icon={<Gamepad2 size={30} />} active={active} size={130} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Modo Jogo {active ? <Badge tone="accent">ativo</Badge> : null}</h1>
          <p className="mt-1 text-[13px] text-muted">{active ? 'Sistema em desempenho máximo. Encerre quando terminar de jogar para restaurar os ajustes.' : `${close.size} app(s) para fechar · cerca de ${fmtSize(freeing)} de memória livre a mais`}</p>
          {status && <div className="mt-2 flex gap-4 text-[12px] text-muted"><span>Memória livre: {fmtSize(status.memory.free)} de {fmtSize(status.memory.total, 'auto', 0)}</span>{status.powerPlan && <span>Energia: {status.powerPlan}</span>}</div>}
        </div>
        <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={load} disabled={!!busy}>Atualizar</Button>
        {active
          ? <Button variant="primary" icon={<Square size={15} />} onClick={stop} loading={busy === 'stop'}>Encerrar sessão</Button>
          : <Button variant="primary" icon={<Play size={15} />} onClick={start} loading={busy === 'start'}>{chosenGame ? 'Ativar e jogar' : 'Ativar'}</Button>}
      </div>

      {steps.length > 0 && (
        <div className="anim-rise mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          {steps.map((s, i) => <div key={i} className="flex items-center gap-2 py-0.5 text-[13px]">{s.ok ? <CheckCircle2 size={14} className="text-[var(--accent)]" /> : <XCircle size={14} className="text-[var(--danger)]" />}<span className="font-medium">{s.label}</span><span className="text-muted">{s.message}</span></div>)}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3 text-[14px] font-semibold">Fechar durante o jogo</div>
          <div className="max-h-[360px] overflow-y-auto">
            {apps.map((a) => (
              <label key={a.name} className="flex cursor-pointer items-center gap-3 border-b border-[var(--line)] px-4 py-2 last:border-0 hover:bg-[var(--hover)]">
                <Checkbox checked={close.has(a.name)} onChange={(v) => setClose((s) => { const n = new Set(s); v ? n.add(a.name) : n.delete(a.name); return n; })} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{a.name}</span>
                <span className="text-[12px] tabular-nums text-muted">{fmtSize(a.mem)}</span>
              </label>
            ))}
          </div>
          <div className="px-4 py-2 text-[11px] text-muted">Os apps recebem um pedido normal para fechar (podem perguntar se você quer salvar).</div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-2 text-[14px] font-semibold">Na sessão</div>
            <Toggle checked={power} onChange={setPower} label={isMac ? 'Desligar o Modo Pouca Energia' : 'Plano de energia de alto desempenho'} hint={isMac ? 'Religa ao encerrar a sessão' : 'Volta o plano anterior ao encerrar'} />
            <div className="h-2" />
            <Toggle checked={freeMem} onChange={setFreeMem} label="Liberar memória" hint={isMac ? 'Pede sua senha (purge)' : 'Esvazia a memória em espera (pede administrador)'} />
            {games.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[12px] text-muted">Jogo (abre ao ativar{isMac ? '' : ' e ganha prioridade alta'})</div>
                <select value={game} onChange={(e) => setGame(e.target.value)} className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[13px]">
                  <option value="">Nenhum (só ativar)</option>
                  {games.map((g) => <option key={g.id} value={g.id}>{g.name} · {(g.store === 'app' ? 'App' : g.store === 'custom' ? 'Pasta' : g.store.toUpperCase())}</option>)}
                </select>
              </div>
            )}
          </div>

          {status && status.toggles.length > 0 && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="mb-2 text-[14px] font-semibold">Ajustes do {isMac ? 'macOS' : 'Windows'} para jogos</div>
              {status.toggles.map((t) => (
                <div key={t.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-medium">{t.label}{t.recommended !== t.on && <Badge tone="warn">{t.recommended ? 'recomendado ligar' : 'recomendado desligar'}</Badge>}{t.needsRestart && <Badge>reinício</Badge>}</div>
                    <div className="text-[12px] text-muted">{t.detail}</div>
                  </div>
                  {busy === `t:${t.id}` ? <Loader2 size={16} className="mt-1 animate-spin text-muted" /> : <Toggle checked={t.on} onChange={(v) => setToggle(t.id, v)} />}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <Rocket size={20} className="text-[var(--accent)]" />
            <div className="min-w-0 flex-1"><div className="text-[13px] font-medium">Cache de shaders {status ? `· ${fmtSize(status.shaderCache)}` : ''}</div><div className="text-[12px] text-muted">Limpe se um jogo engasga depois de atualizar o driver de vídeo ou o próprio jogo.</div></div>
            <Button size="sm" variant="ghost" onClick={shaders} loading={busy === 'shaders'} disabled={!status?.shaderCache}>Limpar</Button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <div className="text-[14px] font-semibold">Jogos instalados <span className="ml-1 text-[12px] font-normal text-muted">{games.length}</span></div>
          <div className="ml-auto"><Button size="sm" icon={<FolderPlus size={13} />} onClick={addDir}>Adicionar pasta de jogos</Button></div>
          <div className="w-full text-[12px] text-muted">Steam, Epic e GOG entram sozinhos. Para jogos instalados em outro lugar, adicione a pasta: cada subpasta com {isMac ? 'um app' : 'um executável'} vira um jogo.</div>
          {dirs.length > 0 && <div className="flex w-full flex-wrap gap-1.5">{dirs.map((d) => (
            <span key={d} className="flex max-w-full items-center gap-1.5 rounded-lg bg-[var(--surface-2)] py-1 pl-2.5 pr-1 text-[12px]"><Folder size={12} className="shrink-0 text-muted" /><span className="truncate">{d}</span>
              <button className="rounded p-0.5 text-muted hover:bg-[var(--hover)] hover:text-[var(--fg)]" title="Remover pasta" onClick={() => removeDir(d)}><X size={12} /></button></span>
          ))}</div>}
        </div>
      {games.length > 0 && (
        <div>
          <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-3">
            {games.map((g) => (
              <div key={g.id} className={cx('flex items-center gap-3 px-4 py-2.5', game === g.id && 'bg-[var(--accent-soft)]')}>
                <Gamepad2 size={16} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{g.name}</div><div className="text-[11px] text-muted">{(g.store === 'app' ? 'App' : g.store === 'custom' ? 'Pasta' : g.store.toUpperCase())}{g.size ? ` · ${fmtSize(g.size)}` : ''}</div></div>
                <Button size="sm" variant="ghost" icon={<Zap size={13} />} onClick={() => setGame(g.id)}>Escolher</Button>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </PageBody>
  );
}
