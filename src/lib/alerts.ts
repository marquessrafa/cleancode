// Alertas do menu: cada tela que tem uma ação para você fazer marca o alerta aqui, e o menu mostra um triângulo vermelho
// com uma exclamação ao lado dela. O motivo aparece quando você para o mouse em cima.
// - As telas de análise (Registro, Acúmulos, Limpeza e Cuidados Inteligentes) marcam depois de uma análise com algo a
//   resolver, e limpam quando você resolve.
// - As ventoinhas e a varredura do hardware são conferidas em segundo plano (useBackgroundAlerts), sem abrir a tela.
import { useEffect, useSyncExternalStore } from 'react';
import type { Page } from './store';
import { cc, isMac } from './api';
import { t as tr } from './i18n';

const alerts = new Map<Page, string>();
const listeners = new Set<() => void>();
let version = 0;

/** Marca (motivo) ou limpa (null) o alerta de uma tela. */
export function setAlert(page: Page, reason: string | null) {
  if ((alerts.get(page) ?? null) === reason) return;
  if (reason) alerts.set(page, reason); else alerts.delete(page);
  version++;
  listeners.forEach((l) => l());
}

/** Os alertas de agora (a tela e o motivo). */
export function useAlerts(): Map<Page, string> {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
  return alerts;
}

/** Confere, a cada minuto, as ventoinhas e a varredura do hardware (no Windows). */
export function useBackgroundAlerts() {
  useEffect(() => {
    if (isMac) return;
    let alive = true;
    const check = async () => {
      try {
        const s = await cc.fanState();
        if (!alive) return;
        const bad = s?.active ? s.controls.filter((c) => ['refused', 'norpm', 'notfound'].includes(c.status?.error || '')).length : 0;
        const rival = s?.rivals?.find((r) => !r.takenOver);
        setAlert('fans', rival ? tr("O {0} está brigando pelas ventoinhas.", rival.name)
          : bad ? tr("{0} ventoinhas não estão obedecendo.", bad)
            : s?.active && !s.helperReady ? tr("A tarefa de administrador das ventoinhas não está respondendo.") : null);
      } catch { /* confere de novo depois */ }
      try {
        const live: any = await cc.hardwareLive();
        if (!alive) return;
        const adv = live?.live?.advanced;
        const st = adv?.available ? adv.scan || (adv.active ? 'ok' : 'none') : 'ok';
        setAlert('hardware', st === 'partial' ? tr("A varredura do hardware terminou com erros. Faça a varredura de novo.")
          : st === 'none' ? tr("Faça a varredura do hardware para ver todos os sensores.") : null);
      } catch { /* confere de novo depois */ }
    };
    const first = setTimeout(check, 8000);
    const every = setInterval(() => { if (!document.hidden) check(); }, 60000);
    return () => { alive = false; clearTimeout(first); clearInterval(every); };
  }, []);
}
