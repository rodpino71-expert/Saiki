import { Tarea, BloqueDescanso } from '../modelo/tipos';
import { derivarICCtarea } from './reglas';

export const MINUTOS_DESCANSO_POR_BLOQUE = 15;
export const MINUTOS_BLOQUE_BASE = 60;

/**
 * Calcula los minutos de descanso obligatorio tras un bloque con I ≥ 4.0.
 * Fórmula: ceil(duración / 60) × 15 min.
 * Si I < 4.0, no hay descanso obligatorio (retorna 0).
 */
export function descansoObligatorio(duracion_min: number, I: number): number {
  if (I < 4.0) return 0;
  const bloques = Math.ceil(duracion_min / MINUTOS_BLOQUE_BASE);
  return bloques * MINUTOS_DESCANSO_POR_BLOQUE;
}

/**
 * Verifica que entre tareas consecutivas haya suficiente espacio
 * para el descanso obligatorio de la tarea anterior.
 *
 * Retorna las tareas donde falta descanso obligatorio.
 */
export function verificarDescansos(tareas: Tarea[]): {
  tarea_id: string;
  nombre: string;
  descanso_requerido_min: number;
  espacio_disponible_min: number;
  faltante_min: number;
}[] {
  const ordenadas = [...tareas].sort(
    (a, b) => a.ventana_inicio.getTime() - b.ventana_inicio.getTime()
  );

  const problemas: {
    tarea_id: string;
    nombre: string;
    descanso_requerido_min: number;
    espacio_disponible_min: number;
    faltante_min: number;
  }[] = [];

  for (let i = 0; i < ordenadas.length - 1; i++) {
    const actual = ordenadas[i];
    const siguiente = ordenadas[i + 1];

    const { I } = derivarICCtarea(actual);
    const descanso = descansoObligatorio(actual.duracion_estimada_min, I);

    if (descanso === 0) continue;

    const fin_actual = actual.ventana_fin.getTime();
    const inicio_siguiente = siguiente.ventana_inicio.getTime();
    const espacio_disponible = (inicio_siguiente - fin_actual) / 60_000;

    if (espacio_disponible < descanso) {
      problemas.push({
        tarea_id: actual.id,
        nombre: actual.nombre,
        descanso_requerido_min: descanso,
        espacio_disponible_min: espacio_disponible,
        faltante_min: descanso - espacio_disponible,
      });
    }
  }

  return problemas;
}

/**
 * Suma total de minutos de descanso obligatorio que el sistema
 * debe reservar. Cada tarea con I ≥ 4.0 genera un descanso tras ella,
 * independientemente de si hay tarea siguiente.
 */
export function totalDescansosObligatorios(tareas: Tarea[]): number {
  const ordenadas = [...tareas].sort(
    (a, b) => a.ventana_inicio.getTime() - b.ventana_inicio.getTime()
  );

  let total = 0;
  for (const tarea of ordenadas) {
    const { I } = derivarICCtarea(tarea);
    total += descansoObligatorio(tarea.duracion_estimada_min, I);
  }
  return total;
}

/**
 * Reserva bloques de descanso obligatorio en el calendario.
 * Coloca cada descanso justo después de la tarea que lo genera,
 * dentro del hueco disponible hasta la siguiente tarea.
 *
 * Si el descanso obligatorio NO cabe completo en el hueco,
 * NO reserva nada: el día está mal planificado (R4 lo detecta).
 *
 * Son bloques, no tareas: sin dimensiones, sin UC, y no se borran sin confirmar.
 */
export function reservarDescansos(tareas: Tarea[]): BloqueDescanso[] {
  const ordenadas = [...tareas].sort(
    (a, b) => a.ventana_inicio.getTime() - b.ventana_inicio.getTime()
  );

  const bloques: BloqueDescanso[] = [];

  for (let i = 0; i < ordenadas.length - 1; i++) {
    const actual = ordenadas[i];
    const siguiente = ordenadas[i + 1];

    const { I } = derivarICCtarea(actual);
    const descanso_min = descansoObligatorio(actual.duracion_estimada_min, I);

    if (descanso_min === 0) continue;

    const fin_actual = actual.ventana_fin.getTime();
    const inicio_siguiente = siguiente.ventana_inicio.getTime();
    const espacio_disponible_min = (inicio_siguiente - fin_actual) / 60_000;

    if (espacio_disponible_min < descanso_min) continue;

    const inicio = new Date(fin_actual);
    const fin = new Date(fin_actual + descanso_min * 60_000);

    bloques.push({
      id: `descanso-${actual.id}-${i}`,
      inicio,
      fin,
      duracion_min: descanso_min,
      tarea_anterior_id: actual.id,
      tarea_anterior_nombre: actual.nombre,
    });
  }

  return bloques;
}
