// Componente React do visualizador 3D: cria a cena uma vez por modelo e repassa os dados ao vivo.
import React, { useEffect, useRef } from 'react';
import { createViewer, Live, Model, ViewerHandle, THREE } from './core';

export type LiveInput = Omit<Partial<Live>, 'accent'>;

export default function Viewer3D({ build, buildKey, live, height = 420, className, bloom }: { build: () => Model; buildKey: string; live?: LiveInput; height?: number | string; className?: string; bloom?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ViewerHandle | null>(null);
  useEffect(() => {
    if (!host.current) return;
    let v: ViewerHandle | null = null;
    try { v = createViewer(host.current, build, { bloom }); } catch (e) { console.error('3D indisponível', e); }
    viewer.current = v;
    if (v) ((window as any).__hw3d ||= {})[buildKey] = v; // render sob demanda (capturas e testes)
    const key = buildKey;
    return () => { v?.dispose(); viewer.current = null; const w = (window as any).__hw3d; if (w && w[key] === v) delete w[key]; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey]);
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    viewer.current?.setLive({ ...(live || {}), ...(accent ? { accent: new THREE.Color(accent) } : {}) });
  });
  return <div ref={host} className={className} style={{ height, width: '100%', position: 'relative', minWidth: 0 }} />;
}
