import React, { useEffect, useState } from 'react';
import { Users, Play } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc } from '../lib/api';
import { fmtSize, fmtNum, fmtPct, PALETTE } from '../lib/format';
import { DataTable } from '../components/DataTable';
import { Button, Card, Empty, PageHeader, ProgressBar } from '../components/ui';
import { Donut, PageBody, ScopeBar } from './common';

export default function Owners() {
  const { active, settings, findTask, startScanTask, cancelTask } = useApp();
  const units = settings!.units;
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  // a tarefa fica no store global: continua rodando se você trocar de tela
  const task = findTask('owners', active!.id, nodeId);
  const busy = task?.status === 'running';
  const prog = task?.progress || null;
  const data: any[] | null = task?.status === 'done' ? task.result : null;
  const [sort, setSort] = useState({ key: 'size', asc: false });
  const run = () => startScanTask('owners', nodeId);
  void useEffect; void cc;
  const total = (data || []).reduce((s, o) => s + o.size, 0);
  return (
    <PageBody>
      <PageHeader title="Proprietários" icon={<Users size={18} />} description="Espaço ocupado por usuário (dono do arquivo no NTFS). A leitura dos donos é feita sob demanda para a pasta selecionada."
        actions={<Button variant="primary" icon={<Play size={14} />} loading={busy} disabled={!active!.done} onClick={run}>{data ? 'Analisar de novo' : 'Analisar proprietários'}</Button>} />
      <ScopeBar />
      {busy && (
        <Card className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted">
            <span>Lendo descritores de segurança… você pode navegar por outras telas enquanto isso.</span>
            <span className="flex items-center gap-3"><span className="tnum">{fmtNum(prog?.done)} / {fmtNum(prog?.total)}</span><Button size="sm" variant="ghost" onClick={() => task && cancelTask(task.key)}>Cancelar</Button></span>
          </div>
          <ProgressBar value={prog ? prog.done / (prog.total || 1) : 0} indeterminate={!prog} />
        </Card>
      )}
      {!data && !busy ? (
        <Card><Empty icon={<Users size={20} />} title={task?.status === 'cancelled' ? 'Análise cancelada' : task?.status === 'error' ? 'A análise falhou' : 'Clique em “Analisar proprietários”'} text={active!.done ? 'Em pastas muito grandes isso pode levar alguns minutos. Os donos ficam disponíveis também na coluna “Proprietário” do Explorador.' : 'Aguarde a varredura terminar.'} /></Card>
      ) : data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="flex items-center justify-center">
            <Donut data={data.slice(0, 10).map((o, i) => ({ label: o.owner, value: o.size, color: PALETTE[i % PALETTE.length] }))} size={240} thickness={40}
              center={<><div className="text-xs text-muted">{data.length} donos</div><div className="text-base font-semibold">{fmtSize(total, units)}</div></>} />
          </Card>
          <Card pad={false} title="Por proprietário">
            <div className="h-[380px]">
              <DataTable className="h-full" rows={data} rowKey={(r) => r.owner} sort={sort} onSort={setSort} columns={[
                { key: 'owner', label: 'Proprietário', width: 260, flex: true, sortable: true, sortValue: (r) => r.owner, render: (r) => r.owner },
                { key: 'size', label: 'Tamanho', width: 110, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtSize(r.size, units) },
                { key: 'alloc', label: 'Alocado', width: 110, align: 'right', sortable: true, sortValue: (r) => r.alloc, render: (r) => fmtSize(r.alloc, units) },
                { key: 'files', label: 'Arquivos', width: 100, align: 'right', sortable: true, sortValue: (r) => r.files, render: (r) => fmtNum(r.files) },
                { key: 'pct', label: '%', width: 80, align: 'right', sortable: true, sortValue: (r) => r.size, render: (r) => fmtPct(r.size / (total || 1)) },
              ]} />
            </div>
          </Card>
        </div>
      )}
    </PageBody>
  );
}
