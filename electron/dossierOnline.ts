// Parte pública do dossiê, buscada só quando a pessoa abre a tela de um programa: Wikidata (quem
// desenvolveu, criadores, licença, lançamento, linguagem, site), resumo da Wikipedia, App Store (Mac) e
// Steam (jogos). Só o nome/identificador do programa é enviado. Resultado guardado por 14 dias.
import { app, net } from 'electron';
import fs from 'fs';
import path from 'path';
import type { DossierFact, DossierOnline, DossierQuery } from './platform/types';

const TTL = 14 * 86400000;
const cacheFile = () => path.join(app.getPath('userData'), 'dossier-cache.json');
let cache: Record<string, { at: number; v: DossierOnline }> | null = null;
function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); } catch { cache = {}; }
  return cache!;
}
function saveCache() { try { fs.writeFileSync(cacheFile(), JSON.stringify(cache)); } catch { /* */ } }

async function getJson(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await net.fetch(url, { signal: ctl.signal, headers: { 'User-Agent': `CleanCode/${app.getVersion()} (desktop app; github.com/marquessrafa/cleancode)`, Accept: 'application/json' } } as any);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Data da Wikidata respeitando a precisão (ano, mês ou dia). */
function wdDate(v: any): string | undefined {
  const m = /^\+?(-?\d{1,4})-(\d{2})-(\d{2})/.exec(v?.time || '');
  if (!m) return;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (v.precision <= 9 || !mo) return String(y);
  if (v.precision === 10 || !d) return `${MONTHS[mo - 1]} de ${y}`;
  return `${d} de ${MONTHS[mo - 1]} de ${y}`;
}
const brDate = (s?: string) => { if (!s) return; const t = Date.parse(s); return isNaN(t) ? undefined : new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }); };
const strip = (s?: string) => (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
const normName = (s: string) => s.toLowerCase()
  .replace(/\((x64|x86|64-bit|32-bit|64 bits|32 bits|user|machine)\)/g, '')
  .replace(/\b(for (windows|mac|macos)|desktop|x64|x86|64-bit|32-bit)\b/g, '')
  .replace(/\s+v?\d+(\.\d+)+.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

const SOFTWARE = /software|application|app\b|program|browser|editor|video game|game|client|tool|platform|ide\b|engine|messaging|player|service|suite|utility|launcher|emulator|operating system|framework|interpreter|compiler|antivirus|aplicativo|programa|jogo|navegador|ferramenta/i;

/** Item da Wikidata que corresponde ao programa (nome igual ou muito parecido e descrição de software). */
async function wikidataEntity(q: DossierQuery): Promise<{ id: string; desc?: string } | null> {
  const name = normName(q.name);
  if (name.length < 2) return null;
  for (const lang of ['en', 'pt']) {
    const r = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=10&language=${lang}&uselang=en&search=${encodeURIComponent(name)}`);
    const list: any[] = r?.search || [];
    const scored = list.map((c) => {
      const lbl = normName(c.label || c.match?.text || '');
      const d = String(c.description || '');
      let s = 0;
      if (lbl === name) s += 3; else if (lbl.startsWith(name) || name.startsWith(lbl)) s += lbl.length / Math.max(name.length, 1) > 0.6 ? 1.5 : 0;
      if (SOFTWARE.test(d)) s += 2;
      const isGame = /video game|jogo eletr|\bgame\b/i.test(d) && !/engine|company|developer|studio|publisher|launcher|platform|store/i.test(d);
      if (q.kind === 'game') s += isGame ? 1 : -1; else if (isGame) s -= 3;
      if (q.publisher && d.toLowerCase().includes(normName(q.publisher).split(' ')[0] || '~')) s += 1;
      if (/film|novel|album|song|band|person|human|fictional|episode|television|family name|given name|disambiguation/i.test(d)) s -= 4;
      return { c, s };
    }).filter((x) => x.s >= 4).sort((a, b) => b.s - a.s);
    if (scored[0]) return { id: scored[0].c.id, desc: scored[0].c.description };
  }
  return null;
}

async function labels(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=pt-br|pt|en|mul&ids=${ids.slice(i, i + 50).join('|')}`);
    for (const [id, e] of Object.entries<any>(r?.entities || {})) { const l = e.labels?.['pt-br']?.value || e.labels?.pt?.value || e.labels?.en?.value || e.labels?.mul?.value; if (l) out[id] = l; }
  }
  return out;
}

async function fromWikidata(q: DossierQuery, res: DossierOnline) {
  const hit = await wikidataEntity(q);
  if (!hit) return;
  const r = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|sitelinks|descriptions&languages=pt-br|pt|en|mul&ids=${hit.id}`);
  const e = r?.entities?.[hit.id];
  if (!e) return;
  const claims = e.claims || {};
  const vals = (p: string) => (claims[p] || []).filter((c: any) => c.rank !== 'deprecated' && c.mainsnak?.datavalue);
  const ids = (p: string) => vals(p).map((c: any) => c.mainsnak.datavalue.value?.id).filter(Boolean) as string[];
  const PROPS: [string, string][] = [['P178', 'Desenvolvedor'], ['P170', 'Criado por'], ['P123', 'Distribuidora'], ['P275', 'Licença'], ['P277', 'Linguagem de programação'], ['P136', 'Gênero'], ['P408', 'Motor gráfico'], ['P57', 'Direção'], ['P495', 'País de origem'], ['P306', 'Sistemas'], ['P400', 'Plataformas']];
  const all = [...new Set(PROPS.flatMap(([p]) => ids(p).slice(0, 8)))];
  // rótulos e resumo da Wikipedia ao mesmo tempo
  const wikiP = (async () => {
    for (const [site, host] of [['ptwiki', 'pt'], ['enwiki', 'en']] as const) {
      const title = e.sitelinks?.[site]?.title;
      if (!title) continue;
      const w = await getJson(`https://${host}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
      if (w?.extract) return { w, host, title };
    }
    return null;
  })();
  const L = all.length ? await labels(all) : {};
  const f = (label: string, value?: string, kind: DossierFact['kind'] = 'text', hint?: string) => { if (value) res.facts.push({ group: 'about', label, value, kind, hint: hint ?? 'Wikidata' }); };
  for (const [p, label] of PROPS) { const l = ids(p).slice(0, 8).map((x) => L[x]).filter(Boolean); f(label, l.join(', ')); }
  const dates = [...vals('P577'), ...vals('P571')].map((c: any) => c.mainsnak.datavalue.value).filter((v: any) => v?.time).sort((a: any, b: any) => a.time.localeCompare(b.time));
  f('Lançamento inicial', wdDate(dates[0]));
  // versão estável mais recente: a preferida, senão a de data mais nova
  const vers = vals('P348').map((c: any) => ({ v: String(c.mainsnak.datavalue.value), pref: c.rank === 'preferred', date: c.qualifiers?.P577?.[0]?.datavalue?.value, beta: !!c.qualifiers?.P548?.some((x: any) => x.datavalue?.value?.id && x.datavalue.value.id !== 'Q2804309') }));
  const stable = vers.filter((x: any) => !x.beta);
  const pick = stable.find((x: any) => x.pref) || stable.sort((a: any, b: any) => String(b.date?.time || '').localeCompare(String(a.date?.time || '')))[0];
  if (pick) { res.latest = pick.v; f('Versão estável mais recente', pick.v + (pick.date ? ` (${wdDate(pick.date)})` : '')); }
  const site = vals('P856')[0]?.mainsnak.datavalue.value;
  f('Site oficial', site, 'url');
  const repo = vals('P1324')[0]?.mainsnak.datavalue.value;
  f('Código-fonte', repo, 'url');
  const desc = e.descriptions?.['pt-br']?.value || e.descriptions?.pt?.value || e.descriptions?.en?.value;
  if (desc) res.facts.unshift({ group: 'about', label: 'O que é', value: desc, hint: 'Wikidata' });
  res.sources.push({ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${hit.id}` });
  const wk = await wikiP;
  if (wk) {
    const url = wk.w.content_urls?.desktop?.page || `https://${wk.host}.wikipedia.org/wiki/${encodeURIComponent(wk.title)}`;
    res.summary = wk.w.extract; res.summarySource = { label: `Wikipedia (${wk.host})`, url };
    res.sources.push({ label: `Wikipedia (${wk.host})`, url });
  }
}

async function fromAppStore(q: DossierQuery, res: DossierOnline) {
  const qs = q.adamId ? `id=${encodeURIComponent(q.adamId)}` : q.bundleId ? `bundleId=${encodeURIComponent(q.bundleId)}&entity=macSoftware` : '';
  if (!qs) return;
  let it: any = null;
  for (const c of ['br', 'us']) { const r = await getJson(`https://itunes.apple.com/lookup?${qs}&country=${c}`); if (r?.results?.[0]) { it = r.results[0]; break; } }
  if (!it) return;
  const f = (label: string, value: any, kind: DossierFact['kind'] = 'text') => { if (value) res.facts.push({ group: 'about', label, value, kind, hint: 'App Store' }); };
  f('Desenvolvedor (App Store)', it.artistName);
  if (it.sellerName && it.sellerName !== it.artistName) f('Vendedor', it.sellerName);
  f('Lançado na App Store em', brDate(it.releaseDate));
  f('Versão atual', it.version ? `${it.version}${it.currentVersionReleaseDate ? ` (${brDate(it.currentVersionReleaseDate)})` : ''}` : undefined);
  f('Categoria (App Store)', (it.genres || []).join(', ') || it.primaryGenreName);
  f('Preço', it.formattedPrice);
  if (it.averageUserRating) f('Avaliação', `${it.averageUserRating.toFixed(1)} de 5 (${Number(it.userRatingCount || 0).toLocaleString('pt-BR')} avaliações)`);
  f('Classificação indicativa', it.contentAdvisoryRating);
  f('Idiomas', (it.languageCodesISO2A || []).length ? `${it.languageCodesISO2A.length} (${it.languageCodesISO2A.slice(0, 8).join(', ')}${it.languageCodesISO2A.length > 8 ? '…' : ''})` : undefined);
  f('Site do desenvolvedor', it.sellerUrl, 'url');
  if (q.mas) f('Licença', 'Contrato de licença da App Store (EULA padrão da Apple ou do desenvolvedor)');
  if (it.version && !res.latest) res.latest = it.version;
  if (!res.summary && it.description) { res.summary = strip(it.description).slice(0, 900) + (it.description.length > 900 ? '…' : ''); res.summarySource = { label: 'App Store', url: it.trackViewUrl }; }
  if (it.trackViewUrl) res.sources.push({ label: 'App Store', url: it.trackViewUrl });
}

async function fromSteam(q: DossierQuery, res: DossierOnline) {
  if (!q.steamId) return;
  const r = await getJson(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(q.steamId)}&l=brazilian&cc=br`);
  const d = r?.[q.steamId]?.success ? r[q.steamId].data : null;
  if (!d) return;
  const f = (label: string, value: any, kind: DossierFact['kind'] = 'text') => { if (value) res.facts.push({ group: 'about', label, value, kind, hint: 'Steam' }); };
  f('Desenvolvedor', (d.developers || []).join(', '));
  f('Distribuidora', (d.publishers || []).join(', '));
  f('Lançamento', d.release_date?.coming_soon ? `Em breve (${d.release_date.date})` : d.release_date?.date);
  f('Gênero', (d.genres || []).map((g: any) => g.description).join(', '));
  f('Preço', d.is_free ? 'Gratuito' : d.price_overview?.final_formatted);
  if (d.metacritic?.score) f('Metacritic', `${d.metacritic.score} / 100`);
  if (d.recommendations?.total) f('Recomendações na Steam', Number(d.recommendations.total).toLocaleString('pt-BR'));
  if (d.required_age && +d.required_age > 0) f('Idade mínima', `${d.required_age} anos`);
  f('Recursos', (d.categories || []).map((c: any) => c.description).slice(0, 10).join(', '));
  f('Site oficial', d.website, 'url');
  if (d.pc_requirements?.minimum) f('Requisitos mínimos (PC)', strip(d.pc_requirements.minimum).replace(/^M[íi]nimos?:\s*/i, '').replace(/\n+/g, ' · ').slice(0, 500));
  if (!res.summary && d.short_description) { res.summary = strip(d.short_description); res.summarySource = { label: 'Steam', url: `https://store.steampowered.com/app/${q.steamId}` }; }
  res.sources.push({ label: 'Steam', url: `https://store.steampowered.com/app/${q.steamId}` });
}

export async function onlineDossier(q: DossierQuery, refresh = false): Promise<DossierOnline> {
  const key = JSON.stringify([q.name, q.bundleId, q.adamId, q.steamId, q.kind]);
  const c = loadCache();
  if (!refresh && c[key] && Date.now() - c[key].at < TTL) return c[key].v;
  // todas as fontes ao mesmo tempo; Steam e App Store (oficiais) vêm primeiro na lista, a Wikidata completa
  const store: DossierOnline = { facts: [], sources: [] }, wiki: DossierOnline = { facts: [], sources: [] };
  await Promise.all([fromSteam(q, store), fromAppStore(q, store), fromWikidata(q, wiki)]);
  const seen = new Set(store.facts.map((x) => x.label.replace(/ \(.*\)$/, '')));
  const res: DossierOnline = {
    facts: [...store.facts, ...wiki.facts.filter((x) => !seen.has(x.label))],
    sources: [...store.sources, ...wiki.sources],
    summary: wiki.summary || store.summary, summarySource: wiki.summary ? wiki.summarySource : store.summarySource,
    latest: store.latest || wiki.latest,
  };
  if (!res.facts.length && !res.summary) res.error = 'Nenhuma informação pública encontrada para este programa.';
  // só guarda quando alguma fonte respondeu (sem internet, tenta de novo na próxima)
  if (res.facts.length || res.summary) { c[key] = { at: Date.now(), v: res }; saveCache(); }
  return res;
}
