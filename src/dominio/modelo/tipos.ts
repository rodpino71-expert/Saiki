import { Prioridad, EstadoTarea, SemaforoDia, EventoTransicion } from './enums';

export interface Dimensiones {
  C: number; // 1-5 complejidad cognitiva
  A: number; // 1-5 demanda atencional
  R: number; // 1-5 responsabilidad/coste del error
}

export interface SnapshotCarga {
  C: number;
  A: number;
  R: number;
  T: number;
  I: number;
  CC: number;
}

export interface EventoReclasificacion {
  intento: number;
  antes: SnapshotCarga;
  despues: SnapshotCarga;
  delta_I: number;
  delta_CC: number;
  momento: Date;
}

export interface Tarea {
  id: string;
  nombre: string;
  nota?: string;
  prioridad: Prioridad;
  duracion_estimada_min: number;
  ventana_inicio: Date;
  ventana_fin: Date;
  dimensiones: Dimensiones;
  justificacion?: string;
  F_expost?: number; // 1-5, declarada al cerrar
  estado: EstadoTarea;
  reclasificaciones: EventoReclasificacion[];
  creado_en: Date;
}

export interface ConfiguracionDia {
  horas_utiles: number;
  I_sostenible: number;
}

export interface ReglaViolada {
  codigo: string;
  tarea_ids: string[];
  valor: number;
  limite: number;
}

export interface RechazoAdmision {
  codigo: 'R5' | 'R6';
  tarea_id: string;
  tarea_nombre: string;
}

export interface BloqueDescanso {
  id: string;
  inicio: Date;
  fin: Date;
  duracion_min: number;
  tarea_anterior_id: string;
  tarea_anterior_nombre: string;
}

export interface AccionCorrectiva {
  tipo: 'MOVER' | 'DIVIDIR';
  tarea_id: string;
  tarea_nombre: string;
  dia_destino?: string;
  delta_CC: number;
}

export interface AdvertenciaBeta {
  beta: number;
  cc_planificada: number;
  cc_proyectada: number;
  PB: number;
}

export interface ResultadoEvaluacion {
  semaforo: SemaforoDia;
  suma_CC: number;
  presupuesto_base: number;
  reglas_violadas: ReglaViolada[];
  acciones_correctivas: AccionCorrectiva[];
  advertencia_beta: AdvertenciaBeta | null;
}

export interface CupoSemanal {
  semana_iso: string;
  consumido: number;
  limite: number;
}

export interface DatosDia {
  fecha: string;
  semaforo: SemaforoDia;
  descansos_R4_respetados: boolean;
  R2_cumplida: boolean;
  cerrado_dentro_horario: boolean;
}

export interface DatosMes {
  dias_verdes: number;
  dias_ambar: number;
  dias_planificados: number;
  descansos_R4_pct: number;
  dias_sin_R2_pct: number;
  dias_dentro_horario_pct: number;
  EAM_normalizado: number;
}

export interface Ciclo {
  id: string;
  tareas: Tarea[];
  datos_dias: DatosDia[];
  I_sostenible: number;
  inicio: Date;
  fin?: Date;
  archivado_en?: Date;
}

export interface EntradaDiario {
  momento: Date;
  disparador: string;
  pregunta: string;
  respuesta?: string;
}

export type EntradaTransicion =
  | { evento: EventoTransicion.INICIAR; ahora: Date }
  | { evento: EventoTransicion.FINALIZAR; ahora: Date }
  | { evento: EventoTransicion.CONFIRMAR_HECHA; ahora: Date }
  | { evento: EventoTransicion.REPROGRAMAR; ahora: Date }
  | {
      evento: EventoTransicion.REACTIVAR;
      ahora: Date;
      nuevas_dimensiones: Dimensiones;
      nueva_ventana_inicio: Date;
      nueva_ventana_fin: Date;
    }
  | { evento: EventoTransicion.DESCARTAR; ahora: Date }
  | { evento: EventoTransicion.DELEGAR; ahora: Date }
  | { evento: EventoTransicion.DIVIDIR; ahora: Date };
