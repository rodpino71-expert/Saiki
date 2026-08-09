import { Tarea, AccionCorrectiva } from '../modelo/tipos';
import { derivarICCtarea } from './reglas';
import { calcularPB } from '../carga/calcular_PB';
import { verificarReglas } from './reglas';
import { ConfiguracionDia } from '../modelo/tipos';

export function generarAccionesCorrectivas(
  tareas: Tarea[],
  config: ConfiguracionDia
): AccionCorrectiva[] {
  const PB = calcularPB(config.horas_utiles, config.I_sostenible);
  const acciones: AccionCorrectiva[] = [];

  const cargasTareas = tareas.map(t => ({ tarea: t, ...derivarICCtarea(t) }));
  const suma_CC_actual = cargasTareas.reduce((s, ct) => s + ct.CC, 0);

  const ordenadas = [...cargasTareas].sort((a, b) => b.CC - a.CC);

  for (const ct of ordenadas) {
    if (acciones.length >= 2) break;

    const restantes = tareas.filter(t => t.id !== ct.tarea.id);
    const suma_sin_esta = suma_CC_actual - ct.CC;

    acciones.push({
      tipo: 'MOVER',
      tarea_id: ct.tarea.id,
      tarea_nombre: ct.tarea.nombre,
      delta_CC: -ct.CC,
    });
  }

  if (acciones.length < 2 && ordenadas.length > 0) {
    const masGrande = ordenadas[0];
    const mitad = masGrande.CC / 2;

    acciones.push({
      tipo: 'DIVIDIR',
      tarea_id: masGrande.tarea.id,
      tarea_nombre: masGrande.tarea.nombre,
      delta_CC: -mitad,
    });
  }

  return acciones;
}
