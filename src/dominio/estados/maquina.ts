import { Tarea, EntradaTransicion, CupoSemanal, EventoReclasificacion, SnapshotCarga } from '../modelo/tipos';
import { EstadoTarea, EventoTransicion } from '../modelo/enums';
import { derivarICCtarea } from '../planificacion/reglas';
import { calcularT } from '../carga/derivar_T';
import { calcularI } from '../carga/calcular_I';
import { calcularCC } from '../carga/calcular_CC';
import { cupoAgotado, consumirCupo, semanaISO, LIMITE_CUPO } from './cupo_semanal';

const ESTADOS_TERMINALES = new Set([
  EstadoTarea.HECHA,
  EstadoTarea.DESCARTADA,
  EstadoTarea.DELEGADA,
  EstadoTarea.DIVIDIDA,
]);

function esTerminal(estado: EstadoTarea): boolean {
  return ESTADOS_TERMINALES.has(estado);
}

export class ErrorTransicion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorTransicion';
  }
}

function snapshotDeTarea(tarea: Tarea): SnapshotCarga {
  const ventana_min = (tarea.ventana_fin.getTime() - tarea.ventana_inicio.getTime()) / 60_000;
  const T = calcularT(ventana_min, tarea.duracion_estimada_min);
  const { C, A, R } = tarea.dimensiones;
  const I = calcularI(C, A, R, T);
  const CC = calcularCC(I, tarea.duracion_estimada_min);
  return { C, A, R, T, I, CC };
}

export interface ResultadoTransicion {
  tarea: Tarea;
  cupo: CupoSemanal;
}

export function transicionarEstado(
  tarea: Tarea,
  entrada: EntradaTransicion,
  cupo: CupoSemanal
): ResultadoTransicion {
  const { evento, ahora } = entrada;

  if (esTerminal(tarea.estado) && evento !== EventoTransicion.DESCARTAR) {
    throw new ErrorTransicion(`La tarea "${tarea.nombre}" está en estado terminal (${tarea.estado}) y no puede transicionarse.`);
  }

  switch (evento) {
    case EventoTransicion.INICIAR: {
      if (tarea.estado !== EstadoTarea.POR_HACER) {
        throw new ErrorTransicion(`INICIAR solo válido desde POR_HACER (estado actual: ${tarea.estado})`);
      }
      return { tarea: { ...tarea, estado: EstadoTarea.EN_PROGRESO }, cupo };
    }

    case EventoTransicion.FINALIZAR: {
      if (tarea.estado !== EstadoTarea.EN_PROGRESO) {
        throw new ErrorTransicion(`FINALIZAR solo válido desde EN_PROGRESO (estado actual: ${tarea.estado})`);
      }
      return { tarea: { ...tarea, estado: EstadoTarea.CIERRE_PENDIENTE }, cupo };
    }

    case EventoTransicion.CONFIRMAR_HECHA: {
      // Única ruta a HECHA: clic explícito desde CIERRE_PENDIENTE
      if (tarea.estado !== EstadoTarea.CIERRE_PENDIENTE) {
        throw new ErrorTransicion(
          `CONFIRMAR_HECHA solo válido desde CIERRE_PENDIENTE. ` +
          `Ruta directa POR_HACER → HECHA está PROHIBIDA (estado actual: ${tarea.estado})`
        );
      }
      return { tarea: { ...tarea, estado: EstadoTarea.HECHA }, cupo };
    }

    case EventoTransicion.REPROGRAMAR: {
      if (tarea.estado !== EstadoTarea.CIERRE_PENDIENTE) {
        throw new ErrorTransicion(`REPROGRAMAR solo válido desde CIERRE_PENDIENTE (estado actual: ${tarea.estado})`);
      }
      const { I } = derivarICCtarea(tarea);
      const esCargaMediaOAlta = I >= 3.0;

      if (esCargaMediaOAlta) {
        // Reiniciar cupo automáticamente si cambió la semana antes de verificar agotamiento
        const semana_actual = semanaISO(ahora);
        const cupoEfectivo = cupo.semana_iso !== semana_actual
          ? { semana_iso: semana_actual, consumido: 0, limite: LIMITE_CUPO }
          : cupo;

        if (cupoAgotado(cupoEfectivo)) {
          throw new ErrorTransicion(
            'Ya usaste tu margen de reprogramación esta semana. ' +
            'Esta tarea no vuelve al tablero como está: pártela (DIVIDIR) o suéltala (DESCARTAR).'
          );
        }
        const nuevoCupo = consumirCupo(cupoEfectivo, ahora);
        return { tarea: { ...tarea, estado: EstadoTarea.REPROGRAMADA }, cupo: nuevoCupo };
      }

      // Carga baja: no consume cupo
      return { tarea: { ...tarea, estado: EstadoTarea.REPROGRAMADA }, cupo };
    }

    case EventoTransicion.REACTIVAR: {
      if (tarea.estado !== EstadoTarea.REPROGRAMADA) {
        throw new ErrorTransicion(`REACTIVAR solo válido desde REPROGRAMADA (estado actual: ${tarea.estado})`);
      }
      // REACTIVAR requiere reclasificación obligatoria
      const { nuevas_dimensiones, nueva_ventana_inicio, nueva_ventana_fin } = entrada;
      if (!nuevas_dimensiones) {
        throw new ErrorTransicion('REACTIVAR sin reclasificar carga está PROHIBIDO. Proporciona nuevas_dimensiones.');
      }

      const antes = snapshotDeTarea(tarea);

      const ventana_nueva_min = (nueva_ventana_fin.getTime() - nueva_ventana_inicio.getTime()) / 60_000;
      const T_nuevo = calcularT(ventana_nueva_min, tarea.duracion_estimada_min);
      const { C, A, R } = nuevas_dimensiones;
      const I_nuevo = calcularI(C, A, R, T_nuevo);
      const CC_nuevo = calcularCC(I_nuevo, tarea.duracion_estimada_min);
      const despues: SnapshotCarga = { C, A, R, T: T_nuevo, I: I_nuevo, CC: CC_nuevo };

      const evento_reclass: EventoReclasificacion = {
        intento: tarea.reclasificaciones.length + 1,
        antes,
        despues,
        delta_I: Math.round((I_nuevo - antes.I) * 10) / 10,
        delta_CC: Math.round((CC_nuevo - antes.CC) * 100) / 100,
        momento: ahora,
      };

      const tareaReactivada: Tarea = {
        ...tarea,
        dimensiones: nuevas_dimensiones,
        ventana_inicio: nueva_ventana_inicio,
        ventana_fin: nueva_ventana_fin,
        estado: EstadoTarea.POR_HACER,
        reclasificaciones: [...tarea.reclasificaciones, evento_reclass],
      };

      return { tarea: tareaReactivada, cupo };
    }

    case EventoTransicion.DESCARTAR: {
      if (esTerminal(tarea.estado) && tarea.estado !== EstadoTarea.DESCARTADA) {
        throw new ErrorTransicion(`No se puede DESCARTAR una tarea ya en estado terminal (${tarea.estado})`);
      }
      return { tarea: { ...tarea, estado: EstadoTarea.DESCARTADA }, cupo };
    }

    case EventoTransicion.DELEGAR: {
      return { tarea: { ...tarea, estado: EstadoTarea.DELEGADA }, cupo };
    }

    case EventoTransicion.DIVIDIR: {
      return { tarea: { ...tarea, estado: EstadoTarea.DIVIDIDA }, cupo };
    }

    default: {
      const _exhaustivo: never = entrada;
      throw new ErrorTransicion(`Evento desconocido: ${JSON.stringify(_exhaustivo)}`);
    }
  }
}
