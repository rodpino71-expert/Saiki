import { Tarea, ConfiguracionDia, ResultadoEvaluacion } from '../modelo/tipos';
import { calcularPB } from '../carga/calcular_PB';
import { verificarReglas, derivarICCtarea } from './reglas';
import { calcularSemaforo } from './semaforo';
import { generarAccionesCorrectivas } from './acciones';
import { advertenciaBeta } from './beta';
import { SemaforoDia } from '../modelo/enums';

export function evaluarDia(
  tareas: Tarea[],
  config: ConfiguracionDia,
  beta: number = 1.0
): ResultadoEvaluacion {
  const PB = calcularPB(config.horas_utiles, config.I_sostenible);
  const cargasTareas = tareas.map(t => ({ ...derivarICCtarea(t) }));
  const suma_CC = cargasTareas.reduce((s, ct) => s + ct.CC, 0);
  const reglas_violadas = verificarReglas(tareas, config);
  const semaforo = calcularSemaforo(suma_CC, PB, reglas_violadas);

  const acciones_correctivas =
    semaforo === SemaforoDia.ROJO
      ? generarAccionesCorrectivas(tareas, config)
      : [];

  const advertencia_beta = advertenciaBeta(suma_CC, beta, PB);

  return { semaforo, suma_CC, presupuesto_base: PB, reglas_violadas, acciones_correctivas, advertencia_beta };
}
