import { AdvertenciaBeta } from '../modelo/tipos';

export function advertenciaBeta(
  cc_planificada: number,
  beta: number,
  PB: number
): AdvertenciaBeta | null {
  const cc_proyectada = cc_planificada * beta;
  if (cc_proyectada <= PB) return null;

  return {
    beta,
    cc_planificada,
    cc_proyectada,
    PB,
  };
}
