import { SemaforoDia } from '../modelo/enums';
import { ReglaViolada } from '../modelo/tipos';

export function calcularSemaforo(
  suma_CC: number,
  PB: number,
  reglas_violadas: ReglaViolada[]
): SemaforoDia {
  if (reglas_violadas.length > 0) return SemaforoDia.ROJO;
  if (suma_CC > 0.85 * PB) return SemaforoDia.AMBAR;
  return SemaforoDia.VERDE;
}
