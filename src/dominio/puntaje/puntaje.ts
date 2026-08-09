import { DatosMes } from '../modelo/tipos';
import { calcularIEC, calcularIR, calcularIRe } from './indices';

export type UmbralPuntaje = 'Sostenible' | 'Tensionado' | 'Sobrecarga' | 'Riesgo alto';

export interface ResultadoPuntaje {
  IEC: number;
  IR: number;
  IRe: number;
  total: number;
  umbral: UmbralPuntaje;
}

export function calcularPuntaje(datos: DatosMes): ResultadoPuntaje {
  const IEC = calcularIEC(datos.dias_verdes, datos.dias_ambar, datos.dias_planificados);
  const IR = calcularIR(datos.descansos_R4_pct, datos.dias_sin_R2_pct, datos.dias_dentro_horario_pct);
  const IRe = calcularIRe(datos.EAM_normalizado);
  const total = IEC + IR + IRe;
  return { IEC, IR, IRe, total, umbral: calcularUmbral(total) };
}

export function calcularUmbral(puntaje: number): UmbralPuntaje {
  if (puntaje >= 80) return 'Sostenible';
  if (puntaje >= 60) return 'Tensionado';
  if (puntaje >= 40) return 'Sobrecarga';
  return 'Riesgo alto';
}
