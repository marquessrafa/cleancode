// Descobre o idioma do CleanCode antes de qualquer outro módulo carregar.
// Este arquivo precisa ser o primeiro import do main.ts, porque vários módulos montam textos assim que são carregados.
//
// A ordem é esta:
// 1. Se a pessoa escolheu um idioma nas Configurações, o CleanCode usa esse idioma.
// 2. Se a escolha for "Automático", o CleanCode usa o idioma do computador.
// 3. Se o idioma do computador não for português nem espanhol, o CleanCode usa o inglês.
import { app } from 'electron';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Lang, pickLang } from '../src/locales/core';

/** Mesma pasta de dados que o main.ts define (perfil isolado, desenvolvimento ou app instalado). */
function userDataDir(): string {
  if (process.env.CLEANCODE_PROFILE) return path.join(app.getPath('appData'), 'CleanCode-' + process.env.CLEANCODE_PROFILE.replace(/[^\w-]/g, ''));
  if (!app.isPackaged) return path.join(app.getPath('appData'), 'CleanCode-dev');
  return app.getPath('userData');
}

function savedChoice(): string | undefined {
  try { return JSON.parse(fs.readFileSync(path.join(userDataDir(), 'settings.json'), 'utf8')).language; } catch { return undefined; }
}

/** Idiomas preferidos do computador, do mais importante para o menos importante. */
export function systemLanguages(): string[] {
  if (process.env.CLEANCODE_LANG) return [process.env.CLEANCODE_LANG];
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('defaults', ['read', '-g', 'AppleLanguages'], { encoding: 'utf8', timeout: 1500 });
      const list = [...out.matchAll(/([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)/g)].map((m) => m[1]);
      if (list.length) return list;
    } catch { /* usa o Intl abaixo */ }
  }
  try { return [Intl.DateTimeFormat().resolvedOptions().locale]; } catch { return []; }
}

const choice = savedChoice();
export const LANG: Lang = choice === 'pt' || choice === 'en' || choice === 'es' ? choice : pickLang(systemLanguages());
