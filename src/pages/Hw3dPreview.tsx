// Pré-visualização dos modelos 3D do Monitor de hardware (rota #hw3d-preview): mostra os modelos de PC, notebook e
// Mac lado a lado, para conferir em qualquer sistema. #hw3d-preview=<id> mostra um só, grande.
import React from 'react';
import Viewer3D from '../hw3d/Viewer';
import { gpuModel, cpuModel, ramModel, boardModel, ssdModel, powerModel, pcModel, laptopModel } from '../hw3d/models';
import { socModel, gpuChipModel, soDimmModel, solderedMemModel, laptopBoardModel } from '../hw3d/mobile';

const MODELS: { id: string; label: string; build: () => any }[] = [
  { id: 'pc', label: 'PC (gabinete)', build: () => pcModel({ sticks: 2 }) },
  { id: 'gpu', label: 'Placa de vídeo', build: () => gpuModel({ fans: 3 }) },
  { id: 'cpu', label: 'Processador', build: () => cpuModel({ name: 'Ryzen 7 7800X3D', sub: 'x64', cores: 8 }) },
  { id: 'ram', label: 'Memória', build: () => ramModel({ count: 2 }) },
  { id: 'board', label: 'Placa-mãe', build: () => boardModel({ dimms: 4, sticks: 2, cpu: { name: 'Ryzen 7 7800X3D', sub: 'x64', cores: 8 } }) },
  { id: 'psu', label: 'Fonte', build: () => powerModel({}) },
  { id: 'ssd', label: 'SSD NVMe', build: () => ssdModel({ kind: 'nvme', label: 'SSD NVMe' }) },
  { id: 'laptop', label: 'Notebook (Windows)', build: () => laptopModel({}) },
  { id: 'mac', label: 'MacBook', build: () => laptopModel({ mac: true }) },
  { id: 'battery', label: 'Energia (notebook/Mac)', build: () => powerModel({ laptop: true }) },
  { id: 'nb-cpu-intel', label: 'Notebook: processador Intel', build: () => socModel({ vendor: 'intel', cores: 14, highlight: 'cpu' }) },
  { id: 'nb-cpu-amd', label: 'Notebook: processador AMD', build: () => socModel({ vendor: 'amd', cores: 8, highlight: 'cpu' }) },
  { id: 'nb-igpu', label: 'Notebook: GPU integrada', build: () => socModel({ vendor: 'intel', cores: 14, highlight: 'gpu' }) },
  { id: 'nb-dgpu', label: 'Notebook: GPU dedicada', build: () => gpuChipModel({ memChips: 4 }) },
  { id: 'nb-sodimm', label: 'Notebook: memória SO-DIMM', build: () => soDimmModel({ count: 2 }) },
  { id: 'nb-soldered', label: 'Notebook: memória soldada', build: () => solderedMemModel({ chips: 4, label: '8 GB' }) },
  { id: 'nb-board', label: 'Notebook: placa', build: () => laptopBoardModel({ vendor: 'intel', cores: 14, dgpu: true, sodimm: 2 }) },
];
const live = { load: 0.45, cores: [0.5, 0.3, 0.7, 0.2, 0.4, 0.6, 0.3, 0.5], gpu: 0.6, fanRpm: 1400, mem: 0.55, watts: 85, battery: 0.72, charging: true, disk: 0.4, temps: { cpu: 58, gpu: 62 } };

export default function Hw3dPreview() {
  React.useLayoutEffect(() => { document.documentElement.classList.add('dark'); document.documentElement.dataset.accent = 'green'; }, []);
  const only = decodeURIComponent(location.hash.split('=')[1] || '');
  const list = only ? MODELS.filter((m) => m.id === only) : MODELS;
  return (
    <div className="relative z-0 min-h-screen bg-bg p-10 text-fg">
      <div className={only ? '' : 'grid grid-cols-2 gap-x-16 gap-y-24 xl:grid-cols-3'}>
        {list.map((m) => (
          <div key={m.id} className="relative isolate">
            <div className="relative z-10 mb-2 text-[13px] font-semibold text-muted">{m.label}</div>
            <Viewer3D build={m.build} buildKey={`preview-${m.id}`} live={live} height={only ? 620 : 300} />
          </div>
        ))}
      </div>
    </div>
  );
}
