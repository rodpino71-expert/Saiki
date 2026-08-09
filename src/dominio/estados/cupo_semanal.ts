import { CupoSemanal } from '../modelo/tipos';

export const LIMITE_CUPO = 3;

export function semanaISO(fecha: Date): string {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.valueOf() - yearStart.valueOf()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function iniciarCupo(ahora: Date): CupoSemanal {
  return { semana_iso: semanaISO(ahora), consumido: 0, limite: LIMITE_CUPO };
}

export function cupoAgotado(cupo: CupoSemanal): boolean {
  return cupo.consumido >= cupo.limite;
}

export function consumirCupo(cupo: CupoSemanal, ahora: Date): CupoSemanal {
  const semana_actual = semanaISO(ahora);
  // Reinicio automático si cambió la semana
  if (cupo.semana_iso !== semana_actual) {
    return { semana_iso: semana_actual, consumido: 1, limite: LIMITE_CUPO };
  }
  return { ...cupo, consumido: cupo.consumido + 1 };
}

export function reiniciarCupo(ahora: Date): CupoSemanal {
  return iniciarCupo(ahora);
}
