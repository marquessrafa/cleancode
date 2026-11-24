// Tradução dos textos do processo principal (menus, notificações, mensagens e rótulos que as telas recebem prontos).
import { LANG } from './lang';
import { makeT, LOCALES } from '../src/locales/core';

export { LANG };
export const LOCALE = LOCALES[LANG];
export const t = makeT(LANG);
