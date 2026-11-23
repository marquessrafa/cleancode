import React from 'react';
import { Copy, ExternalLink, FolderOpen, FolderInput, Trash2, Info, RefreshCw, FolderPlus, Skull } from 'lucide-react';
import { cc, FILE_MANAGER } from './api';
import { useApp } from './store';
import { fmtSize } from './format';
import type { MenuItem } from '../components/ui';

export interface Target { id?: number; path: string; name: string; size?: number; kind: 'dir' | 'file' }

/** Ações sobre arquivos/pastas com confirmação explícita. Preferência: Lixeira. */
export function useFileActions(onChanged?: () => void) {
  const { active, confirm, toast, settings, bump } = useApp();
  const units = settings?.units || 'auto';

  const removeFromScan = async (targets: Target[]) => {
    if (!active) return;
    const ids = targets.filter((t) => t.id !== undefined).map((t) => t.id!);
    if (ids.length) await cc.scanQuery(active.id, 'removeItems', ids);
    bump(); onChanged?.();
  };

  const del = async (targets: Target[]) => {
    if (!targets.length) return;
    const total = targets.reduce((s, t) => s + (t.size || 0), 0);
    const r = await confirm({
      title: targets.length === 1 ? `Excluir "${targets[0].name}"?` : `Excluir ${targets.length} itens?`,
      message: <>Espaço a liberar: <b>{fmtSize(total, units)}</b>. Por padrão os itens vão para a Lixeira e podem ser restaurados.</>,
      items: targets.slice(0, 50).map((t) => ({ label: t.path, detail: t.size != null ? fmtSize(t.size, units) : undefined })),
      danger: true,
      options: [
        { key: 'trash', label: 'Enviar para a Lixeira', hint: 'Recomendado: dá para restaurar depois.' },
        { key: 'permanent', label: 'Excluir permanentemente', hint: 'Não pode ser desfeito.' },
      ],
      defaultOption: 'trash',
      confirmLabel: 'Excluir',
      requireCheck: 'Revisei a lista e quero excluir estes itens.',
    });
    if (!r.ok) return;
    const paths = targets.map((t) => t.path);
    const res = r.option === 'permanent' ? await cc.deletePermanent(paths) : await cc.trash(paths);
    const ok = targets.filter((t) => res.find((x) => x.path === t.path)?.ok);
    const fail = res.filter((x) => !x.ok);
    await removeFromScan(ok);
    if (ok.length) toast(`${ok.length} ${ok.length === 1 ? 'item' : 'itens'} ${r.option === 'permanent' ? 'excluído(s)' : 'enviado(s) para a Lixeira'}`);
    if (fail.length) toast(`Falha em ${fail.length}: ${fail[0].error}`, 'error');
  };

  const move = async (targets: Target[]) => {
    if (!targets.length) return;
    const r = await confirm({
      title: `Mover ${targets.length === 1 ? `"${targets[0].name}"` : `${targets.length} itens`}?`,
      message: 'Em seguida você escolhe a pasta de destino.',
      items: targets.slice(0, 50).map((t) => ({ label: t.path })),
      confirmLabel: 'Escolher destino…',
    });
    if (!r.ok) return;
    const res = await cc.move(targets.map((t) => t.path));
    if (!res) return;
    const ok = targets.filter((t) => res.results.find((x) => x.path === t.path)?.ok);
    await removeFromScan(ok);
    const fail = res.results.filter((x) => !x.ok);
    if (ok.length) toast(`${ok.length} item(ns) movido(s) para ${res.dest}`);
    if (fail.length) toast(`Falha em ${fail.length}: ${fail[0].error}`, 'error');
  };

  const menu = (targets: Target[], extra: MenuItem[] = []): MenuItem[] => {
    const one = targets.length === 1 ? targets[0] : null;
    return [
      { label: 'Abrir', icon: <ExternalLink />, onClick: () => one && cc.open(one.path), disabled: !one },
      { label: `Mostrar no ${FILE_MANAGER}`, icon: <FolderOpen />, onClick: () => one && cc.showInFolder(one.path), disabled: !one },
      { label: 'Copiar caminho', icon: <Copy />, onClick: () => { cc.copyText(targets.map((t) => t.path).join('\r\n')); toast('Caminho copiado'); } },
      { label: 'Propriedades', icon: <Info />, onClick: () => one && cc.properties(one.path), disabled: !one },
      ...extra,
      { separator: true },
      { label: 'Mover para…', icon: <FolderInput />, onClick: () => move(targets) },
      { label: targets.length > 1 ? `Excluir ${targets.length} itens…` : 'Excluir…', icon: <Trash2 />, danger: true, onClick: () => del(targets) },
    ];
  };

  return { del, move, menu, removeFromScan };
}

export const ICONS = { RefreshCw, FolderPlus, Skull };
