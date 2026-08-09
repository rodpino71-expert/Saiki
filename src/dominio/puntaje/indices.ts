export function calcularIEC(
  dias_verdes: number,
  dias_ambar: number,
  dias_planificados: number
): number {
  if (dias_planificados === 0) return 0;
  return 40 * (dias_verdes + 0.5 * dias_ambar) / dias_planificados;
}

export function calcularIR(
  descansos_R4_pct: number,
  dias_sin_R2_pct: number,
  dias_dentro_horario_pct: number
): number {
  return 30 * (0.40 * descansos_R4_pct + 0.30 * dias_sin_R2_pct + 0.30 * dias_dentro_horario_pct);
}

export function calcularIRe(EAM_normalizado: number): number {
  return 30 * (1 - Math.min(1, Math.max(0, EAM_normalizado)));
}
