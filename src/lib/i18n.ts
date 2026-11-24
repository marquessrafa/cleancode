// Tradução dos textos das janelas. O idioma vem do processo principal (window.cc.lang), que já considera
// a escolha das Configurações e o idioma do computador. Sem essa informação, usa o idioma do navegador.
import { makeT, pickLang, Lang, LOCALES } from '../locales/core';

const fromMain = (globalThis as any).cc?.lang;
export const LANG: Lang = fromMain === 'pt' || fromMain === 'en' || fromMain === 'es' ? fromMain : pickLang([typeof navigator !== 'undefined' ? navigator.language : undefined]);
/** Código para formatar números e datas no idioma atual (por exemplo, pt-BR ou en-US). */
export const LOCALE = LOCALES[LANG];
export const t = makeT(LANG);

if (typeof document !== 'undefined') document.documentElement.lang = LOCALE;
