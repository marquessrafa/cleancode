import React, { useEffect, useState } from 'react';
import { Copy, Play, ChevronRight, File, Trash2, Download, Wand2 } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, Row } from '../lib/api';
import { fmtSize, fmtNum, fmtDate } from '../lib/format';
import { useFileActions } from '../lib/actions';
import { Button, Card, Checkbox, cx, Dropdown, Empty, openContextMenu, PageHeader, ProgressBar, Select, Stat } from '../components/ui';
import { PageBody, ScopeBar } from './common';

interface Group { size: number; count: number; wasted: number; files: Row[] }

export default function Duplicates() {
  const { active, settings, findTask, startScanTask, cancelTask, updateTaskResult } = useApp();
  const units = settings!.units;
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  const [minSize, setMin] = useState(String(1024 * 1024));
  // a busca roda no gerenciador global: continua em segundo plano ao trocar de tela
  const task = findTask('duplicates', active!.id, nodeId);
  const busy = task?.status === 'running';
  const prog = task?.progress || null;
  const groups: Group[] | null = task?.status === 'done' ? task.result : null;
  const [open, setOpen] = useState<Set<number>>(new Set([0, 1, 2]));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const run = () => { setSel(new Set()); setOpen(new Set([0, 1, 2])); startScanTask('duplicates', nodeId, [+minSize]); };
  const actions = useFileActions(() => {
    // remove os excluídos do resultado guardado na tarefa
    if (task && groups) {
      updateTaskResult(task.key, groups.map((g) => ({ ...g, files: g.files.filter((f) => !sel.has(f.path!)) })).filter((g) => g.files.length > 1).map((g) => ({ ...g, count: g.files.length, wasted: g.size * (g.files.length - 1) })));
    }
    setSel(new Set());
  });
  void useEffect;
  const autoSelect = (keep: 'newest' | 'oldest' | 'shortest') => {
    const s = new Set<string>();
    for (const g of groups || []) {
      const sorted = [...g.files].sort((a, b) => keep === 'newest' ? b.mtime - a.mtime : keep === 'oldest' ? a.mtime - b.mtime : a.path!.length - b.path!.length);
      sorted.slice(1).forEach((f) => s.add(f.path!));
    }
    setSel(s);
  };
  const allFiles = (groups || []).flatMap((g) => g.files);
  const selRows = allFiles.filter((f) => sel.has(f.path!));
  const wasted = (groups || []).reduce((s, g) => s + g.wasted, 0);

  return (
    <PageBody>
      <PageHeader title="Arquivos duplicados" icon={<Copy size={18} />} description="Agrupa arquivos de mesmo tamanho e confirma com hash SHA-1 (início do arquivo e, se preciso, o conteúdo completo). Arquivos só na nuvem são ignorados."
        actions={<>
          <span className="text-xs text-muted">Tamanho mínimo</span>
          <Select className="w-28" value={minSize} onChange={setMin} options={[[4096, '4 KB'], [102400, '100 KB'], [1048576, '1 MB'], [10485760, '10 MB'], [104857600, '100 MB']].map(([v, l]) => ({ value: String(v), label: String(l) }))} />
          <Button variant="primary" icon={<Play size={14} />} loading={busy} disabled={!active!.done} onClick={run}>{groups ? 'Procurar de novo' : 'Procurar duplicados'}</Button>
        </>} />
      <ScopeBar />
      {busy && (
        <Card className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted">
            <span>{prog?.phase || 'Agrupando por tamanho…'} · continua em segundo plano se você sair desta tela</span>
            <span className="flex items-center gap-3"><span className="tnum">{fmtNum(prog?.done)} / {fmtNum(prog?.total)}</span><Button size="sm" variant="ghost" onClick={() => task && cancelTask(task.key)}>Cancelar</Button></span>
          </div>
          <ProgressBar value={prog ? prog.done / (prog.total || 1) : 0} indeterminate={!prog} />
        </Card>
      )}
      {!groups && !busy && <Card><Empty icon={<Copy size={20} />} title={task?.status === 'cancelled' ? 'Busca cancelada' : task?.status === 'error' ? 'A busca falhou' : 'Procure duplicados na pasta selecionada'} text={active!.done ? 'A busca lê o conteúdo dos arquivos candidatos e pode levar alguns minutos em discos grandes.' : 'Aguarde a varredura terminar.'} /></Card>}
      {groups && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Grupos de duplicados" value={fmtNum(groups.length)} />
            <Stat label="Arquivos envolvidos" value={fmtNum(allFiles.length)} />
            <Stat label="Espaço desperdiçado" value={fmtSize(wasted, units)} tone="warn" />
            <Stat label="Selecionados" value={fmtSize(selRows.reduce((s, f) => s + f.size, 0), units)} sub={`${sel.size} arquivo(s)`} />
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Dropdown trigger={<Button size="sm" icon={<Wand2 size={13} />}>Seleção automática</Button>} items={[
              { label: 'Manter o mais recente de cada grupo', onClick: () => autoSelect('newest') },
              { label: 'Manter o mais antigo de cada grupo', onClick: () => autoSelect('oldest') },
              { label: 'Manter o de caminho mais curto', onClick: () => autoSelect('shortest') },
              { separator: true }, { label: 'Limpar seleção', onClick: () => setSel(new Set()) },
            ]} />
            <div className="flex-1" />
            <Button size="sm" variant="ghost" icon={<Download size={13} />} onClick={() => cc.exportList(allFiles, 'xlsx', 'duplicados')}>Exportar</Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={13} />} disabled={!sel.size} onClick={() => actions.del(selRows.map((f) => ({ id: f.id, path: f.path!, name: f.name, size: f.size, kind: 'file' })))}>Excluir selecionados…</Button>
          </div>
          <div className="space-y-2">
            {groups.slice(0, 500).map((g, i) => {
              const isOpen = open.has(i);
              return (
                <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <button onClick={() => setOpen((o) => { const n = new Set(o); n.has(i) ? n.delete(i) : n.add(i); return n; })} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-hover">
                    <ChevronRight size={14} className={cx('text-faint transition-transform duration-200', isOpen && 'rotate-90')} />
                    <File size={14} className="text-faint" />
                    <span className="flex-1 truncate text-[13px] font-medium">{g.files[0].name}</span>
                    <span className="text-xs text-muted">{g.count} cópias de {fmtSize(g.size, units)}</span>
                    <span className="w-28 text-right text-xs text-warn tnum">{fmtSize(g.wasted, units)} a mais</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-line anim-fade">
                      {g.files.map((f) => (
                        <div key={f.path} onContextMenu={(e) => openContextMenu(e, actions.menu([{ id: f.id, path: f.path!, name: f.name, size: f.size, kind: 'file' }]))}
                          className={cx('flex items-center gap-3 border-b border-line/50 px-3 py-1.5 pl-10 text-xs last:border-0', sel.has(f.path!) ? 'bg-danger-soft' : 'hover:bg-hover')}>
                          <Checkbox checked={sel.has(f.path!)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(f.path!) : n.delete(f.path!); return n; })} />
                          <span className="flex-1 truncate text-fg" title={f.path}>{f.path}</span>
                          <span className="text-muted">{fmtDate(f.mtime, true)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </PageBody>
  );
}
