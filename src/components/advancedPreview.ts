// Prévia do popup de mapeamento dos sensores, só na versão de desenvolvimento.
// Abra com: npm run preview:sensores (resultado com avisos), preview:sensores:ok (tudo mapeado) ou
// preview:sensores:falha (uma peça com falha). O app instalado nunca entra neste modo: o processo principal
// só repassa a variável CLEANCODE_PREVIEW_SENSORS quando o app não está empacotado.
// Os textos de exemplo ficam em português, porque servem só para testar a tela.
import { cc, type HwCheck } from '../lib/api';

export const PREVIEW = (cc as any).previewSensors ? String((cc as any).previewSensors) : '';

const cpu = (status: HwCheck['status']): HwCheck => status === 'fail'
  ? { id: 'cpu', name: '13th Gen Intel Core i7-13700K', status: 'fail', detail: 'Nenhum dado mapeado.', found: [], missing: [
      { what: 'Temperatura', why: 'A abertura dessa peça passou de 20 segundos, então o programa dos sensores seguiu sem ela.' },
      { what: 'Consumo', why: 'A abertura dessa peça passou de 20 segundos, então o programa dos sensores seguiu sem ela.' }] }
  : { id: 'cpu', name: '13th Gen Intel Core i7-13700K', status, detail: status === 'ok' ? 'Tudo mapeado.' : '4 de 5 dados mapeados.',
      found: [{ what: 'Temperatura', value: '48 °C' }, { what: 'Consumo', value: '65,3 W' }, { what: 'Frequência dos núcleos', value: '5.300 MHz' }, { what: 'Carga', value: '21 %' }, ...(status === 'ok' ? [{ what: 'Tensão', value: '1,21 V' }] : [])],
      missing: status === 'ok' ? [] : [{ what: 'Tensão', why: 'Este processador não informa a tensão ao LibreHardwareMonitor. Em muitos modelos, a tensão só aparece pela placa-mãe.' }] };

/** Resultado de exemplo, parecido com um PC Intel com placa de vídeo AMD. */
export function previewChecks(kind: string): HwCheck[] {
  const ok = kind === 'ok', fail = kind === 'falha';
  return [
    cpu(ok ? 'ok' : fail ? 'fail' : 'warn'),
    { id: 'gpu', name: 'AMD Radeon RX 6800 XT', status: 'ok', detail: 'Tudo mapeado.', found: [{ what: 'Temperatura', value: '48 °C' }, { what: 'Carga', value: '52 %' }, { what: 'Memória de vídeo', value: '6.912 MB' }, { what: 'Consumo', value: '38,2 W' }, { what: 'Ventoinha', value: '1.044 RPM' }], missing: [] },
    ok ? { id: 'ram', status: 'ok', detail: 'Tudo mapeado.', found: [{ what: 'Uso', value: '43 %' }, { what: 'Temperatura dos pentes', value: '41 °C' }], missing: [] }
      : { id: 'ram', status: 'warn', detail: '1 de 2 dados mapeados.', found: [{ what: 'Uso', value: '43 %' }], missing: [{ what: 'Temperatura dos pentes', why: 'Os pentes de memória não informaram a temperatura. Muitos pentes DDR4 e alguns DDR5 não têm esse sensor.' }] },
    { id: 'board', name: 'ROG STRIX Z790-A GAMING WIFI', status: 'ok', detail: 'Tudo mapeado.', found: [{ what: 'Temperaturas', value: '36 °C' }, { what: 'Ventoinhas', value: '812 RPM' }, { what: 'Tensões', value: '1,21 V' }], missing: [] },
    ok ? { id: 'disk', status: 'ok', detail: 'Tudo mapeado.', found: [{ what: 'XPG GAMMIX S70 BLADE', value: '53 °C' }, { what: 'NX-1TB', value: '41 °C' }], missing: [] }
      : { id: 'disk', status: 'warn', detail: '2 de 3 discos com temperatura.', found: [{ what: 'XPG GAMMIX S70 BLADE', value: '53 °C' }, { what: 'NX-1TB', value: '41 °C' }], missing: [{ what: 'Disco USB', why: 'O disco não informou a temperatura. Discos USB, cartões de memória e controladoras RAID costumam esconder esse dado.' }] },
    fail ? { id: 'power', status: 'fail', detail: '1 de 2 dados mapeados.', found: [{ what: 'Consumo da placa de vídeo', value: '38,2 W' }], missing: [{ what: 'Consumo do processador', why: 'A abertura dessa peça passou de 20 segundos, então o programa dos sensores seguiu sem ela.' }] }
      : { id: 'power', status: 'ok', detail: 'Tudo mapeado.', found: [{ what: 'Consumo do processador', value: '65,3 W' }, { what: 'Consumo da placa de vídeo', value: '38,2 W' }], missing: [] },
  ];
}

/** Imita a ativação: manda as etapas uma por uma e devolve o resultado de exemplo. */
export function previewActivate(onStep: (step: number, driverPresent: boolean) => void): Promise<{ ok: boolean; message: string; checks: HwCheck[] }> {
  return new Promise((resolve) => {
    [0, 1, 2, 3, 4].forEach((i) => setTimeout(() => onStep(i, true), i * 1100));
    setTimeout(() => resolve({ ok: true, message: 'Monitoramento avançado ativo', checks: previewChecks(PREVIEW) }), 5800);
  });
}
