// Primitivas de sistema de arquivos do SO atual. Pode ser importado pelos workers.
// O módulo nativo é carregado com require() para que só o do SO em uso seja avaliado
// (o do Windows carrega o koffi e as DLLs do sistema logo ao ser importado).
import type { NativeFs } from './types';

export * from './types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl: NativeFs = process.platform === 'win32' ? require('./win32/native') : require('./darwin/native');

export const { sep, listDir, compressedSize, clusterSize, rootOf, drives, ownerOf, isAdmin } = impl;
export const isWin = process.platform === 'win32';
export const isMac = process.platform === 'darwin';

/** Junta pasta + nome com o separador do SO, sem duplicar o separador da raiz. */
export function join(dir: string, name: string): string {
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}
