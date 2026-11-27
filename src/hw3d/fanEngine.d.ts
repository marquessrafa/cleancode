// Tipos do motor das ventoinhas 3D (o código fica em fanEngine.js, compartilhado com o modelador).
export const PARAMS: Record<string, any>;
export function defaults(): Record<string, any>;
export interface FanBuild {
  fan: any;
  copies: { one: any; blur: any; solidMats: any[]; u: { uSpread: { value: number }; uSamples: { value: number } }; n: number; max: number; tip: number };
}
export interface FanEngine {
  R: number;
  bladeLightU: any;
  bgShadeU: any;
  lightGroup: (mat: any, bg: boolean) => void;
  makeFan(medidas: Record<string, any>, withShroud?: boolean): FanBuild;
  ponta(medidas: Record<string, any>): number;
}
export function createFanEngine(three: any): FanEngine;
