// Ponto único de acesso ao SO para o processo principal.
// fs: primitivas de arquivos/unidades; system: integração (apps, hardware, janela, atualizador…).
import type { SystemApi } from './types';

export * from './fs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const system: SystemApi = (process.platform === 'win32' ? require('./win32') : require('./darwin')).default;
