import { SemaforoDia } from '../dominio/modelo/enums';
import { ResultadoEvaluacion, AccionCorrectiva, AdvertenciaBeta, Tarea } from '../dominio/modelo/tipos';
import { derivarICCtarea } from '../dominio/planificacion/reglas';

/**
 * Genera una línea en lenguaje natural para el estado del día.
 * §4 de CAPA_HUMANA: "una sola línea arriba, en lenguaje natural".
 */
export function lineaEstadoDia(resultado: ResultadoEvaluacion, tareas: Tarea[]): string {
  const { semaforo, suma_CC, presupuesto_base } = resultado;
  const tareasAlta = tareas.filter(t => {
    const { I } = derivarICCtarea(t);
    return I >= 4.0;
  });

  if (semaforo === SemaforoDia.ROJO) {
    if (resultado.reglas_violadas.some(r => r.codigo === 'R4')) {
      return 'Hay bloques exigentes sin pausa entre medio. El cuerpo necesita ese respiro — sin él, el segundo bloque sale peor que el primero.';
    }
    if (resultado.reglas_violadas.some(r => r.codigo === 'R2')) {
      return `Son ${tareasAlta.length} tareas pesadas en un mismo día. Nadie puede sostener eso. ¿Miramos qué se puede mover?`;
    }
    if (suma_CC > presupuesto_base) {
      return 'El día tiene más de lo que puede cargar. Algo tiene que ceder — no es opcional.';
    }
    return 'El día está apretado. ¿Miramos qué podemos mover?';
  }

  if (semaforo === SemaforoDia.AMBAR) {
    return 'El día va lleno. Cuida los espacios entre bloques — son parte del trabajo, no tiempo perdido.';
  }

  // VERDE
  if (tareasAlta.length === 1) {
    const nombre = tareasAlta[0].nombre;
    const hora = tareasAlta[0].ventana_inicio.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return `Hoy va bien. Tienes "${nombre}" a las ${hora} — déjate el después libre.`;
  }

  if (tareasAlta.length === 0) {
    return 'Hoy va bien. Jornada tranquila.';
  }

  return 'Hoy va bien. Tienes un bloque exigente — déjate el después libre.';
}

/**
 * Traduce una acción correctiva a lenguaje natural.
 * §3 de CAPA_HUMANA: "El sistema tiene criterio, no sólo cálculo".
 */
export function textoAccionCorrectiva(accion: AccionCorrectiva): string {
  if (accion.tipo === 'MOVER') {
    return `Si mueves "${accion.tarea_nombre}" a otro día, el día te queda respirable.`;
  }

  if (accion.tipo === 'DIVIDIR') {
    return `"${accion.tarea_nombre}" es demasiado para un solo bloque. ¿La partimos en dos partes más manejables?`;
  }

  if (accion.tipo === 'DESCARTAR') {
    return `"${accion.tarea_nombre}" te va a costar caro y no es tuya. ¿La sueltas?`;
  }

  return accion.tarea_nombre;
}

/**
 * Genera el texto de una regla violada en lenguaje natural.
 */
export function textoReglaViolada(regla: { codigo: string; tarea_ids: string[]; valor: number; limite: number }): string {
  switch (regla.codigo) {
    case 'R1':
      return 'El día tiene más de lo que puede cargar. Algo tiene que ceder.';
    case 'R2':
      return 'Nadie puede sostener tantas tareas exigentes seguidas sin quedar en el piso.';
    case 'R3':
      return 'Demasiada intensidad concentrada. El día necesita espacios para respirar.';
    case 'R4':
      return 'Después de un bloque así de exigente, el cuerpo necesita al menos un cuarto de hora para volver a ser tú.';
    case 'R7':
      return 'Las horas no alcanzan para todo esto.';
    default:
      return 'Algo no está cuadrando. Vale la pena mirar.';
  }
}

/**
 * Genera el texto de una acción correctiva con efecto en lenguaje natural.
 */
export function textoEfectoAccion(accion: AccionCorrectiva, suma_CC_actual: number): string {
  if (accion.tipo === 'MOVER') {
    return 'El día respira. Queda margen para lo inesperado.';
  }
  if (accion.tipo === 'DIVIDIR') {
    return 'Dos bloques cortos son más llevaderos que uno largo. Y el resultado suele ser mejor.';
  }
  if (accion.tipo === 'DESCARTAR') {
    return 'Soltar algo a tiempo no es perder — es decidir.';
  }
  return 'El día queda más manejable.';
}

/**
 * Genera el mensaje cuando el cupo de reprogramaciones se agotó.
 * §5.2 del dominio.
 */
export function mensajeCupoAgotado(): string {
  return 'Ya usaste tu margen de reprogramación esta semana. Esta tarea no vuelve al tablero como está: pártela o suéltala.';
}

/**
 * Genera la advertencia de β en lenguaje natural.
 */
export function textoAdvertenciaBeta(adv: AdvertenciaBeta): string {
  return `Planificaste este día. Tu historial de las últimas semanas dice que las cosas suelen salir más pesadas de lo que parecen. El calendario dice que cabe — tus propios registros dicen que veamos con más cuidado.`;
}
