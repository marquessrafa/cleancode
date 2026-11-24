// Núcleo dos idiomas do CleanCode, usado pelas janelas (src/lib/i18n.ts) e pelo processo principal (electron/i18n.ts).
//
// Como funciona:
// - O texto em português do Brasil é a chave. Por isso, o código continua legível: t('Limpar a Lixeira').
// - Os arquivos en.json e es.json traduzem cada chave. Quando uma chave não tem tradução, o texto em português aparece.
// - Valores que mudam ficam marcados com {0}, {1}… na chave e são passados depois do texto: t('{0} itens', n).
import en from './en.json';
import es from './es.json';

export type Lang = 'pt' | 'en' | 'es';
export type LangSetting = 'auto' | Lang;

/** Nome de cada idioma no próprio idioma (aparece nas Configurações). */
export const LANG_NAMES: Record<Lang, string> = { pt: 'Português (Brasil)', en: 'English', es: 'Español' };
/** Código usado para formatar números e datas. */
export const LOCALES: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

const DICTS: Record<Lang, Record<string, string> | null> = { pt: null, en: en as Record<string, string>, es: es as Record<string, string> };

/** Escolhe o idioma a partir do primeiro idioma preferido do computador. Se o idioma não for português nem espanhol, usa o inglês. */
export function pickLang(preferred: (string | undefined)[]): Lang {
  const first = (preferred.find(Boolean) || '').toLowerCase();
  if (first.startsWith('pt')) return 'pt';
  if (first.startsWith('es')) return 'es';
  return 'en';
}

/** Cria a função de tradução de um idioma. */
export function makeT(lang: Lang) {
  const dict = DICTS[lang];
  return function t(text: string, ...args: unknown[]): string {
    let out = (dict && dict[text]) || text;
    if (args.length) out = out.replace(/\{(\d+)\}/g, (m, i) => (args[+i] === undefined || args[+i] === null ? '' : String(args[+i])));
    return out;
  };
}
