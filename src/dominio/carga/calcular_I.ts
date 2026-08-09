export function calcularI(C: number, A: number, R: number, T: number): number {
  const raw = (C + A + R + T) / 4;
  return Math.round(raw * 10) / 10;
}
