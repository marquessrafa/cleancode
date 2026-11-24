// Monitor em segundo plano: crescimento do uso dos discos e novos programas instalados.
import { drives, system } from './platform';
import type { MonitorEvent } from './platform';
import { t, LOCALE } from './i18n';

export type { MonitorEvent };

export class Monitor {
  private timer: NodeJS.Timeout | null = null;
  private baseline = new Map<string, number>();
  private known: Set<string> | null = null;
  private tick = 0;
  private unwatch: (() => void) | null = null;
  private appsBusy = false;
  constructor(private getOpts: () => { disk: boolean; apps: boolean; thresholdMB: number }, private emit: (e: MonitorEvent) => void) {}

  start() {
    if (this.timer) return;
    this.resetBaseline();
    this.snapshotApps().then((s) => { this.known = s; });
    this.timer = setInterval(() => this.check().catch(() => {}), 30000);
    // onde o SO avisa (macOS: fs.watch em /Applications), confere os apps na hora em vez de esperar o próximo ciclo
    this.unwatch = system.watchInstalls?.(() => { if (this.getOpts().apps) this.checkApps().catch(() => {}); }) || null;
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.known = null; this.unwatch?.(); this.unwatch = null; }
  get running() { return !!this.timer; }

  state() {
    return { running: this.running, baseline: [...this.baseline.entries()], now: drives().map((d) => [d.root, d.used]), known: this.known?.size ?? null, opts: this.getOpts() };
  }

  resetBaseline() {
    this.baseline.clear();
    for (const d of drives()) if (d.total > 0) this.baseline.set(d.root, d.used);
  }

  private snapshotApps(): Promise<Set<string>> {
    return system.installedAppKeys();
  }

  async check() {
    const o = this.getOpts();
    // 1) crescimento de uso por unidade (a cada 30 s)
    if (o.disk) {
      const threshold = Math.max(50, o.thresholdMB) * 1048576;
      for (const d of drives()) {
        if (d.total <= 0) continue;
        const base = this.baseline.get(d.root);
        if (base === undefined || d.used < base) { this.baseline.set(d.root, d.used); continue; }
        const delta = d.used - base;
        if (delta >= threshold) {
          this.baseline.set(d.root, d.used);
          this.emit({ kind: 'disk', title: t("O uso do disco aumentou"), drive: /^[a-zA-Z]:/.test(d.root) ? d.root.slice(0, 2) : d.root, driveLabel: d.label, amount: delta, detail: t("Agora com {0} livres de {1}", fmt(d.free), fmt(d.total)) });
        }
      }
    }
    // 2) novos programas (a cada ~60 s)
    this.tick++;
    if (o.apps && this.tick % 2 === 0) await this.checkApps();
  }

  private async checkApps() {
    if (this.appsBusy) return;
    this.appsBusy = true;
    try {
      const now = await this.snapshotApps();
      if (this.known) {
        for (const key of now) {
          if (this.known.has(key)) continue;
          this.emit(await this.describeApp(key));
        }
      }
      this.known = now;
    } finally { this.appsBusy = false; }
  }

  private describeApp(key: string): Promise<MonitorEvent> {
    return system.describeInstalledApp(key);
  }
}

function fmt(n: number) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' ' + u[i];
}
