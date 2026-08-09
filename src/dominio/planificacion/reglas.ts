import { Tarea, ReglaViolada, RechazoAdmision, ConfiguracionDia } from '../modelo/tipos';
import { Prioridad } from '../modelo/enums';
import { calcularT } from '../carga/derivar_T';
import { calcularI } from '../carga/calcular_I';
import { calcularCC } from '../carga/calcular_CC';
import { calcularPB } from '../carga/calcular_PB';
import { verificarDescansos, totalDescansosObligatorios } from './descansos';

export function ventanaDisponibleMin(tarea: Tarea): number {
  return (tarea.ventana_fin.getTime() - tarea.ventana_inicio.getTime()) / 60_000;
}

export function derivarICCtarea(tarea: Tarea): { T: number; I: number; CC: number } {
  const ventana = ventanaDisponibleMin(tarea);
  const T = calcularT(ventana, tarea.duracion_estimada_min);
  const { C, A, R } = tarea.dimensiones;
  const I = calcularI(C, A, R, T);
  const CC = calcularCC(I, tarea.duracion_estimada_min);
  return { T, I, CC };
}

export function admitirTarea(tarea: Tarea): RechazoAdmision | null {
  if (tarea.prioridad === Prioridad.P4) {
    return { codigo: 'R5', tarea_id: tarea.id, tarea_nombre: tarea.nombre };
  }
  if (tarea.prioridad === Prioridad.P3) {
    const { I } = derivarICCtarea(tarea);
    if (I >= 4.0 && !tarea.justificacion) {
      return { codigo: 'R6', tarea_id: tarea.id, tarea_nombre: tarea.nombre };
    }
  }
  return null;
}

export function verificarReglas(
  tareas: Tarea[],
  config: ConfiguracionDia
): ReglaViolada[] {
  const PB = calcularPB(config.horas_utiles, config.I_sostenible);
  const violadas: ReglaViolada[] = [];

  const cargasTareas = tareas.map(t => ({ tarea: t, ...derivarICCtarea(t) }));
  const suma_CC = cargasTareas.reduce((s, ct) => s + ct.CC, 0);
  const duracion_total_min = tareas.reduce((s, t) => s + t.duracion_estimada_min, 0);
  const tareasAlta = cargasTareas.filter(ct => ct.I >= 4.0);
  const suma_CC_alta = tareasAlta.reduce((s, ct) => s + ct.CC, 0);

  // R1: Σ CC <= PB
  if (suma_CC > PB) {
    violadas.push({ codigo: 'R1', tarea_ids: tareas.map(t => t.id), valor: suma_CC, limite: PB });
  }

  // R2: máx 2 tareas con I >= 4.0
  if (tareasAlta.length > 2) {
    violadas.push({ codigo: 'R2', tarea_ids: tareasAlta.map(ct => ct.tarea.id), valor: tareasAlta.length, limite: 2 });
  }

  // R3: Σ CC alta <= 0.40 × PB
  const limite_R3 = 0.40 * PB;
  if (suma_CC_alta > limite_R3) {
    violadas.push({ codigo: 'R3', tarea_ids: tareasAlta.map(ct => ct.tarea.id), valor: suma_CC_alta, limite: limite_R3 });
  }

  // R4: descansos obligatorios tras bloques con I ≥ 4.0
  const problemasDescanso = verificarDescansos(tareas);
  for (const p of problemasDescanso) {
    violadas.push({
      codigo: 'R4',
      tarea_ids: [p.tarea_id],
      valor: p.espacio_disponible_min,
      limite: p.descanso_requerido_min,
    });
  }

  // R7: Σ duraciones + Σ descansos <= horas_utiles
  const descansos_min = totalDescansosObligatorios(tareas);
  const limite_R7 = config.horas_utiles * 60;
  const carga_total_min = duracion_total_min + descansos_min;
  if (carga_total_min > limite_R7) {
    violadas.push({ codigo: 'R7', tarea_ids: tareas.map(t => t.id), valor: carga_total_min, limite: limite_R7 });
  }

  return violadas;
}
