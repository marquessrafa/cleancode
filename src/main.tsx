import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProvider, useApp } from './lib/store';
import { Sidebar, TopBar, Toasts, ConfirmDialog } from './components/Shell';
import { ContextMenuHost } from './components/ui';
import Overview from './pages/Overview';
import Explorer from './pages/Explorer';
import Visual from './pages/Visual';
import Types from './pages/Types';
import Age from './pages/Age';
import Owners from './pages/Owners';
import TopFiles from './pages/TopFiles';
import Duplicates from './pages/Duplicates';
import SearchPage from './pages/Search';
import HistoryPage from './pages/History';
import Discover from './pages/Discover';
import Uninstaller from './pages/Uninstaller';
import Cleanup from './pages/Cleanup';
import Performance from './pages/Performance';
import ActivityPage from './pages/Activity';
import ProtectionPage from './pages/Protection';
import SmartCare from './pages/SmartCare';
import Clutter from './pages/Clutter';
import Repairs from './pages/Repairs';
import Browsers from './pages/Browsers';
import AppDataPage from './pages/AppData';
import GameMode from './pages/GameMode';
import Hardware from './pages/Hardware';
import FansPage from './pages/Fans';
import SettingsPage from './pages/Settings';
import { NeedsScan } from './pages/common';
import FdaHelper from './pages/FdaHelper';
import DossierPage from './pages/Dossier';
import Hw3dPreview from './pages/Hw3dPreview';
import { UpdateModal } from './components/UpdateModal';
import { FdaAssistantHost } from './components/FdaAssistant';
import Panel from './panel/Panel';
import WhatsNew from './components/WhatsNew';

// telas com tarefas longas ficam montadas depois da primeira visita: trocar de tela não perde o
// progresso nem o resultado (e a execução continua aparecendo no menu e na central do topo)
const KEEP_ALIVE = new Set<string>(['smartcare', 'cleanup', 'clutter', 'performance', 'protection', 'repairs', 'browsers', 'appdata', 'game', 'uninstall', 'discover']);

function Content({ page: forced }: { page?: string } = {}) {
  const { page: current, active, settings } = useApp();
  const page = (forced || current) as typeof current;
  if (!settings) return null;
  const needs = ['explorer', 'visual', 'types', 'age', 'owners', 'top', 'duplicates', 'search'].includes(page);
  if (needs && !active) return <NeedsScan />;
  switch (page) {
    case 'overview': return <Overview />;
    case 'explorer': return <Explorer />;
    case 'visual': return <Visual />;
    case 'types': return <Types />;
    case 'age': return <Age />;
    case 'owners': return <Owners />;
    case 'top': return <TopFiles />;
    case 'duplicates': return <Duplicates />;
    case 'search': return <SearchPage />;
    case 'history': return <HistoryPage />;
    case 'discover': return <Discover />;
    case 'uninstall': return <Uninstaller />;
    case 'cleanup': return <Cleanup />;
    case 'performance': return <Performance />;
    case 'activity': return <ActivityPage />;
    case 'protection': return <ProtectionPage />;
    case 'smartcare': return <SmartCare />;
    case 'clutter': return <Clutter />;
    case 'repairs': return <Repairs />;
    case 'browsers': return <Browsers />;
    case 'appdata': return <AppDataPage />;
    case 'game': return <GameMode />;
    case 'hardware': return <Hardware />;
    case 'fans': return <FansPage />;
    case 'settings': return <SettingsPage />;
    case 'dossier': return <DossierPage />;
  }
}

/** Primeiro bloco de cada tela (o que fica embaixo do brilho radial do topo): ganha fundo de vidro e o reflexo
 *  da luz na borda de cima. Detectado sozinho: o primeiro bloco com borda da tela visível e os que estão na mesma
 *  linha que ele (ex.: os quatro cards de resumo). Avisos coloridos e caixas tracejadas ficam de fora. */
function useGlint() {
  React.useEffect(() => {
    let raf = 0, markTimer: ReturnType<typeof setTimeout> | null = null;
    let marked: HTMLElement[] = [];
    const isBlock = (el: HTMLElement) => {
      if (/warn|danger|skeleton|dashed|accent-soft|bg-accent\b|anim-pop/.test(el.className)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 160 || r.height < 44) return false;
      const st = getComputedStyle(el);
      return parseFloat(st.borderTopWidth) >= 1 && st.borderTopStyle === 'solid' && st.position !== 'fixed';
    };
    const mark = () => {
      markTimer = null;
      const main = document.querySelector<HTMLElement>('main:not(.hidden)');
      const next: HTMLElement[] = [];
      if (main) {
        const cands = [...main.querySelectorAll<HTMLElement>('div[class*="border"][class*="rounded"], section[class*="border"][class*="rounded"]')];
        const first = cands.find(isBlock);
        if (first) {
          const top = first.getBoundingClientRect().top;
          next.push(first);
          for (const c of cands) {
            if (c === first || first.contains(c) || c.contains(first) || next.some((n) => n.contains(c) || c.contains(n))) continue;
            if (Math.abs(c.getBoundingClientRect().top - top) <= 6 && isBlock(c)) next.push(c);
          }
        }
      }
      for (const el of marked) if (!next.includes(el)) el.classList.remove('glint', 'glass-first', 'glint-in');
      for (const el of next) {
        // blocos com degradê próprio (ex.: os discos da Visão geral) são destaque: mantêm o fundo, só ganham a luz
        if (el.dataset.ownBg === undefined) el.dataset.ownBg = getComputedStyle(el).backgroundImage !== 'none' ? '1' : '0';
        el.classList.add('glint');
        // com overflow escondido, a linha sobre a borda seria cortada: fica logo abaixo dela
        el.classList.toggle('glint-in', getComputedStyle(el).overflow !== 'visible');
        if (el.dataset.ownBg !== '1') el.classList.add('glass-first');
      }
      marked = next;
      pos();
    };
    const pos = () => {
      raf = 0;
      // a luz vem do centro da área de conteúdo (sem o menu lateral), igual ao brilho do fundo
      const area = document.querySelector<HTMLElement>('main:not(.hidden)')?.getBoundingClientRect();
      const cx = area && area.width ? area.left + area.width / 2 : window.innerWidth / 2;
      document.documentElement.style.setProperty('--glow-x', `${cx}px`);
      for (const el of marked) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--gx', `${cx - r.left}px`);
        el.style.setProperty('--gy', `${-r.top}px`);
      }
    };
    const later = () => { if (!raf) raf = requestAnimationFrame(pos); if (!markTimer) markTimer = setTimeout(mark, 200); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pos); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', later);
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const iv = setInterval(later, 1500); // animações de layout (menu recolhendo, painéis abrindo)
    later();
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', later); mo.disconnect(); clearInterval(iv); if (raf) cancelAnimationFrame(raf); if (markTimer) clearTimeout(markTimer); };
  }, []);
}

function App() {
  const { page, settings } = useApp();
  useGlint();
  const [alive, setAlive] = React.useState<string[]>([]);
  React.useEffect(() => { if (KEEP_ALIVE.has(page)) setAlive((a) => (a.includes(page) ? a : [...a, page])); }, [page]);
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <div className="app-glow" />
      <TopBar />
      <div className="relative z-[1] flex min-h-0 flex-1">
        <Sidebar />
        {/* o menu flutua por cima; o conteúdo começa depois dele */}
        <div className={'relative min-w-0 flex-1 overflow-hidden transition-[padding] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ' + (settings?.sidebarCollapsed ? 'pl-[80px]' : 'pl-[252px]')}>
          {!KEEP_ALIVE.has(page) && <main key={page} className="h-full min-w-0 overflow-hidden anim-page"><Content /></main>}
          {(KEEP_ALIVE.has(page) && !alive.includes(page) ? [...alive, page] : alive).map((p) => (
            <main key={p} className={p === page ? 'h-full min-w-0 overflow-hidden anim-page' : 'hidden'}><Content page={p} /></main>
          ))}
        </div>
      </div>
      <Toasts />
      <ConfirmDialog />
      <ContextMenuHost />
      <WhatsNew />
      <UpdateModal />
      <FdaAssistantHost />
    </div>
  );
}

// a mesma página serve a janela principal e o painel da barra de menus (#panel)
// (a classe entra antes do primeiro quadro: sem ela o fundo do app aparece por um instante)
if (location.hash === '#panel' || location.hash === '#fda-helper') document.body.classList.add('panel-body');
createRoot(document.getElementById('root')!).render(
  location.hash === '#panel' ? <Panel /> : location.hash === '#fda-helper' ? <FdaHelper /> : location.hash.startsWith('#hw3d-preview') ? <Hw3dPreview /> : (
    <AppProvider>
      <App />
    </AppProvider>
  ),
);
