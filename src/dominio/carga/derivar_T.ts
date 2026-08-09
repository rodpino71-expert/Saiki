export function calcularT(ventana_disponible_min: number, duracion_estimada_min: number): number {
  if (duracion_estimada_min <= 0) throw new Error('duracion_estimada_min debe ser > 0');
  const holgura = (ventana_disponible_min - duracion_estimada_min) / duracion_estimada_min;
  if (holgura >= 1.0)  return 1;
  if (holgura >= 0.50) return 2;
  if (holgura >= 0.20) return 3;
  if (holgura >= 0.05) return 4;
  return 5;
}
