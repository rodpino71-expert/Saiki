import { Ciclo, Tarea } from '../modelo/tipos';
import { Prioridad } from '../modelo/enums';
import { derivarICCtarea } from '../planificacion/reglas';

export interface ResultadoReset {
  ciclo_archivado: Ciclo;
  ciclo_nuevo: Ciclo;
  historico_completo: Ciclo[];
}

export function resetResiliente(
  ciclo_actual: Ciclo,
  historico: Ciclo[],
  ahora: Date
): ResultadoReset {
  // Archivar el ciclo actual — el histórico NO se borra
  const ciclo_archivado: Ciclo = {
    ...ciclo_actual,
    fin: ahora,
    archivado_en: ahora,
  };

  // Limpiar P4 y P3 sin justificación vigente
  const tareasLimpias = ciclo_actual.tareas.filter((t: Tarea) => {
    if (t.prioridad === Prioridad.P4) return false;
    if (t.prioridad === Prioridad.P3) {
      const { I } = derivarICCtarea(t);
      if (I >= 4.0 && !t.justificacion) return false;
    }
    return true;
  });

  // Nuevo ciclo con I_sostenible reducido al 75% durante 14 días
  const ciclo_nuevo: Ciclo = {
    id: `ciclo-reset-${ahora.getTime()}`,
    tareas: tareasLimpias,
    datos_dias: [],
    I_sostenible: ciclo_actual.I_sostenible * 0.75,
    inicio: ahora,
  };

  // El histórico incluye todos los ciclos anteriores + el recién archivado
  const historico_completo = [...historico, ciclo_archivado];

  return { ciclo_archivado, ciclo_nuevo, historico_completo };
}
