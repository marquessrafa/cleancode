import React, { useState } from 'react';
import { Search as SearchIcon, Play, Sparkles } from 'lucide-react';
import { useApp } from '../lib/store';
import { cc, Row } from '../lib/api';
import { Button, Card, Checkbox, Input, PageHeader, Segmented } from '../components/ui';
import { PageBody, ScopeBar } from './common';
import { FileResults } from './FileResults';

const ATTRS: [number, string][] = [[2, 'Oculto'], [4, 'Sistema'], [1, 'Somente leitura'], [0x800, 'Compactado'], [0x4000, 'Criptografado'], [0x100, 'Temporário'], [0x400000, 'Somente na nuvem']];

export default function SearchPage() {
  const { active } = useApp();
  const nodeId = active!.selected < 0 ? 0 : active!.selected;
  const [what, setWhat] = useState<'files' | 'folders' | 'empty'>('files');
  const [f, setF] = useState({ name: '', minMB: '', maxMB: '', modBefore: '', modAfter: '', accBefore: '', createdBefore: '', temp: false });
  const [attrs, setAttrs] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const d = (s: string) => (s ? new Date(s + 'T23:59:59').getTime() : undefined);
  const run = async (override?: any) => {
    setBusy(true);
    const c = override || {
      under: nodeId, name: f.name || undefined, minSize: f.minMB ? +f.minMB * 1048576 : undefined, maxSize: f.maxMB ? +f.maxMB * 1048576 : undefined,
      modBefore: d(f.modBefore), modAfter: f.modAfter ? new Date(f.modAfter).getTime() : undefined, accBefore: d(f.accBefore), createdBefore: d(f.createdBefore),
      attrs: attrs || undefined, temp: f.temp, folders: what === 'folders', emptyFolders: what === 'empty', limit: 5000,
    };
    try { setRows(await cc.scanQuery(active!.id, 'customSearch', { under: nodeId, ...c })); } finally { setBusy(false); }
  };
  const year = Date.now() - 365 * 86400000;
  const presets = [
    { label: 'Arquivos temporários e de log', c: { temp: true } },
    { label: 'Grandes e sem uso há 1 ano (>100 MB)', c: { minSize: 100 * 1048576, accBefore: year } },
    { label: 'Instaladores .msi com mais de 1 ano', c: { name: '*.msi', modBefore: year } },
    { label: 'Imagens de disco (.iso)', c: { name: '*.iso' } },
    { label: 'Pastas vazias', c: { emptyFolders: true } },
    { label: 'Arquivos ocultos grandes (>10 MB)', c: { attrs: 2, minSize: 10 * 1048576 } },
    { label: 'Vídeos com mais de 1 GB', c: { name: '*.mp4', minSize: 1024 * 1048576 } },
  ];

  return (
    <PageBody>
      <PageHeader title="Pesquisa avançada" icon={<SearchIcon size={18} />} description="Procure arquivos combinando o nome, o tamanho, as datas e os atributos. No nome, o asterisco (*) vale por qualquer sequência de letras, e o ponto de interrogação (?) vale por uma letra. Depois, você pode exportar, mover ou mandar os resultados para a Lixeira." />
      <ScopeBar />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card title="Critérios">
            <Segmented value={what} onChange={setWhat} options={[{ value: 'files', label: 'Arquivos' }, { value: 'folders', label: 'Pastas' }, { value: 'empty', label: 'Pastas vazias' }]} />
            <div className="mt-3 space-y-2.5">
              <label className="block text-xs text-muted">Nome<Input className="mt-1" placeholder="ex.: *.iso, relatorio*" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && run()} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">Mínimo (MB)<Input className="mt-1" type="number" min="0" value={f.minMB} onChange={(e) => setF({ ...f, minMB: e.target.value })} /></label>
                <label className="text-xs text-muted">Máximo (MB)<Input className="mt-1" type="number" min="0" value={f.maxMB} onChange={(e) => setF({ ...f, maxMB: e.target.value })} /></label>
                <label className="text-xs text-muted">Modificado antes de<Input className="mt-1" type="date" value={f.modBefore} onChange={(e) => setF({ ...f, modBefore: e.target.value })} /></label>
                <label className="text-xs text-muted">Modificado depois de<Input className="mt-1" type="date" value={f.modAfter} onChange={(e) => setF({ ...f, modAfter: e.target.value })} /></label>
                <label className="text-xs text-muted">Acessado antes de<Input className="mt-1" type="date" value={f.accBefore} onChange={(e) => setF({ ...f, accBefore: e.target.value })} /></label>
                <label className="text-xs text-muted">Criado antes de<Input className="mt-1" type="date" value={f.createdBefore} onChange={(e) => setF({ ...f, createdBefore: e.target.value })} /></label>
              </div>
              {what === 'files' && (
                <div>
                  <div className="mb-1 text-xs text-muted">Atributos (o arquivo precisa ter todos os atributos marcados)</div>
                  <div className="grid grid-cols-2 gap-1">
                    {ATTRS.map(([b, l]) => (
                      <label key={b} className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={!!(attrs & b)} onChange={(v) => setAttrs(v ? attrs | b : attrs & ~b)} />{l}</label>
                    ))}
                    <label className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={f.temp} onChange={(v) => setF({ ...f, temp: v })} />Temporários/logs</label>
                  </div>
                </div>
              )}
              <Button variant="primary" className="w-full" icon={<Play size={14} />} loading={busy} onClick={() => run()}>Pesquisar</Button>
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Sparkles size={14} className="text-accent" /> Pesquisas prontas</span>}>
            <div className="-mx-2 space-y-0.5">
              {presets.map((p) => (
                <button key={p.label} onClick={() => run(p.c)} className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-hover">{p.label}</button>
              ))}
            </div>
          </Card>
        </div>
        <div>
          {rows ? <FileResults rows={rows} name="resultado da pesquisa" onChanged={() => run()} height={Math.max(420, window.innerHeight - 260)} />
            : <Card><div className="py-16 text-center text-xs text-muted">Escolha os critérios e clique em Pesquisar.</div></Card>}
        </div>
      </div>
    </PageBody>
  );
}
