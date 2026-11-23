// Temperatura, ventoinha e potência das GPUs no Windows, sem administrador: a mesma fonte do
// Gerenciador de Tarefas (D3DKMTQueryAdapterInfo com KMTQAITYPE_ADAPTERPERFDATA, WDDM 2.4+).
// Funciona com NVIDIA, AMD e Intel dedicadas; GPUs integradas costumam informar 0 (sem sensor).
import koffi from 'koffi';

const gdi32 = koffi.load('gdi32.dll');
const LUID = koffi.struct('CC_LUID', { lo: 'uint32', hi: 'int32' });
const ADAPTERINFO = koffi.struct('CC_D3DKMT_ADAPTERINFO', { hAdapter: 'uint32', luid: LUID, sources: 'uint32', precise: 'int32' });
koffi.struct('CC_D3DKMT_ENUMADAPTERS2', { num: 'uint32', adapters: 'void *' });
koffi.struct('CC_D3DKMT_QUERYADAPTERINFO', { hAdapter: 'uint32', type: 'int32', data: 'void *', size: 'uint32' });
koffi.struct('CC_D3DKMT_CLOSEADAPTER', { hAdapter: 'uint32' });
const PERFDATA = koffi.struct('CC_D3DKMT_ADAPTER_PERFDATA', {
  physIndex: 'uint32', memFreq: 'uint64', maxMemFreq: 'uint64', maxMemFreqOC: 'uint64', memBandwidth: 'uint64', pcieBandwidth: 'uint64',
  fanRPM: 'uint32', power: 'uint32', temperature: 'uint32', powerOverride: 'uint8',
});
const REGINFO = koffi.struct('CC_D3DKMT_ADAPTERREGISTRYINFO', { adapter: koffi.array('char16_t', 260), bios: koffi.array('char16_t', 260), dac: koffi.array('char16_t', 260), chip: koffi.array('char16_t', 260) });

const EnumAdapters2 = gdi32.func('int32 __stdcall D3DKMTEnumAdapters2(_Inout_ CC_D3DKMT_ENUMADAPTERS2 *p)');
const QueryAdapterInfo = gdi32.func('int32 __stdcall D3DKMTQueryAdapterInfo(CC_D3DKMT_QUERYADAPTERINFO *p)');
const CloseAdapter = gdi32.func('int32 __stdcall D3DKMTCloseAdapter(CC_D3DKMT_CLOSEADAPTER *p)');

const KMTQAITYPE_ADAPTERREGISTRYINFO = 8;
const KMTQAITYPE_ADAPTERPERFDATA = 62;

export interface GpuSensor { name: string; temp?: number; fanRPM?: number; powerPct?: number; memMHz?: number }

function query(h: number, type: number, struct: any, init?: Record<string, number>): any | null {
  const buf = koffi.alloc(struct, 1);
  try {
    if (init) koffi.encode(buf, struct, init);
    const q = { hAdapter: h, type, data: buf, size: koffi.sizeof(struct) };
    if (QueryAdapterInfo(q) !== 0) return null;
    return koffi.decode(buf, struct);
  } finally { koffi.free(buf); }
}

export function gpuSensors(): GpuSensor[] {
  const out: GpuSensor[] = [];
  const e: any = { num: 0, adapters: null };
  if (EnumAdapters2(e) !== 0 || !e.num) return out;
  const arr = koffi.alloc(ADAPTERINFO, e.num);
  try {
    e.adapters = arr;
    if (EnumAdapters2(e) !== 0) return out;
    const list: any[] = koffi.decode(arr, ADAPTERINFO, e.num);
    for (const a of list) {
      try {
        const reg = query(a.hAdapter, KMTQAITYPE_ADAPTERREGISTRYINFO, REGINFO);
        const name = String(reg?.adapter || '').replace(/\0.*$/, '').trim();
        if (!name || /Basic Render|Basic Display|Remote Display/i.test(name)) continue;
        const p = query(a.hAdapter, KMTQAITYPE_ADAPTERPERFDATA, PERFDATA, { physIndex: 0 });
        out.push({
          name,
          temp: p && p.temperature > 0 && p.temperature < 1500 ? p.temperature / 10 : undefined, // décimos de °C
          fanRPM: p && p.fanRPM > 0 ? p.fanRPM : undefined,
          powerPct: p && p.power > 0 ? p.power / 10 : undefined, // décimos de %
          memMHz: p && p.memFreq > 0 ? Math.round(Number(p.memFreq) / 1e6) : undefined,
        });
      } catch { /* adaptador sem suporte */ } finally {
        try { CloseAdapter({ hAdapter: a.hAdapter }); } catch { /* */ }
      }
    }
  } finally { koffi.free(arr); }
  // o mesmo adaptador pode aparecer mais de uma vez (uma por saída de vídeo)
  const seen = new Set<string>();
  return out.filter((g) => (seen.has(g.name) ? false : (seen.add(g.name), true)));
}
