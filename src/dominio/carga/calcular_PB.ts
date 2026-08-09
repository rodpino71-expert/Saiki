export const I_SOSTENIBLE_DEFAULT = 3.0;

export function calcularPB(horas_utiles: number, I_sostenible: number = I_SOSTENIBLE_DEFAULT): number {
  return horas_utiles * I_sostenible;
}
