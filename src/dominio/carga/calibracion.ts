export function calcularBeta(cc_reales: number[], cc_estimadas: number[]): number {
  if (cc_reales.length === 0 || cc_estimadas.length === 0) return 1.0;
  const promedio_real = cc_reales.reduce((a, b) => a + b, 0) / cc_reales.length;
  const promedio_estimado = cc_estimadas.reduce((a, b) => a + b, 0) / cc_estimadas.length;
  if (promedio_estimado === 0) return 1.0;
  return promedio_real / promedio_estimado;
}

export function calcularEAM(cc_estimadas: number[], F_expost: number[], duraciones_min: number[]): number {
  const n = Math.min(cc_estimadas.length, F_expost.length, duraciones_min.length);
  if (n === 0) return 0;
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const cc_real = F_expost[i] * (duraciones_min[i] / 60);
    suma += Math.abs(cc_estimadas[i] - cc_real);
  }
  return suma / n;
}
