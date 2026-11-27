// Animações pausadas: a janela está escondida ou o widget da bandeja está aberto por cima dela. Com o widget aberto, a
// janela principal fica atrás dele; desenhar as placas 3D e as ventoinhas nas duas janelas ao mesmo tempo deixava a
// abertura do widget travada. O processo principal marca data-paused="1" na janela enquanto o widget fica aberto.
export const paused = () => document.hidden || document.documentElement.dataset.paused === '1';
/**
 * Limita um desenho animado a cerca de 60 quadros por segundo. Em monitores de 144 Hz ou mais, cada quadro tem só 4 a
 * 7 milissegundos; desenhar as placas e as ventoinhas em todos eles deixava a rolagem da tela travada. Devolve o tempo
 * desde o último desenho, em segundos, ou 0 quando ainda não é hora de desenhar.
 */
export function due(gate: { t: number }, now: number): number {
  const d = now - gate.t;
  if (d < 15.5) return 0;
  gate.t = now;
  return Math.min(0.1, d / 1000);
}
