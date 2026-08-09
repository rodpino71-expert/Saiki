import { Dimensiones } from '../dominio/modelo/tipos';

export type SensacionTarea = 'liviana' | 'normal' | 'pesada' | 'vacio';

export interface OpcionSensacion {
  valor: SensacionTarea;
  label: string;
  description: string;
}

export const OPCIONES_SENSACION: OpcionSensacion[] = [
  { valor: 'liviana', label: 'Liviana', description: 'La hago con música puesta' },
  { valor: 'normal', label: 'Normal', description: 'Necesito concentrarme un rato' },
  { valor: 'pesada', label: 'Pesada', description: 'Necesito que nadie me hable' },
  { valor: 'vacio', label: 'De las que me dejan vacío', description: '' },
];

const MAPEO_SENSACION: Record<SensacionTarea, Dimensiones> = {
  liviana: { C: 2, A: 2, R: 2 },
  normal: { C: 3, A: 3, R: 3 },
  pesada: { C: 4, A: 4, R: 4 },
  vacio: { C: 5, A: 5, R: 4 },
};

/**
 * Convierte la sensación declarada por el usuario en dimensiones C, A, R.
 * El sistema deriva T, I y CC silenciosamente.
 */
export function sensacionADimensiones(sensacion: SensacionTarea): Dimensiones {
  return { ...MAPEO_SENSACION[sensacion] };
}

export type NivelRiesgo = 'no_mucho' | 'si_importa' | 'si_mucho';

export interface OpcionRiesgo {
  valor: NivelRiesgo;
  label: string;
  R: number;
}

export const OPCIONES_RIESGO: OpcionRiesgo[] = [
  { valor: 'no_mucho', label: 'No mucho', R: 2 },
  { valor: 'si_importa', label: 'Sí, importa', R: 4 },
  { valor: 'si_mucho', label: 'Sí, mucho', R: 5 },
];

/**
 * Ajusta solo R según la respuesta de afinado.
 * Las demás dimensiones quedan intactas.
 */
export function afinarR(dimensiones: Dimensiones, nivel: NivelRiesgo): Dimensiones {
  const opcion = OPCIONES_RIESGO.find(o => o.valor === nivel);
  if (!opcion) return dimensiones;
  return { ...dimensiones, R: opcion.R };
}
