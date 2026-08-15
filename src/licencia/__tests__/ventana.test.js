import { describe, it, expect } from 'vitest';
import { DIAS_REVALIDACION, DIAS_GRACIA, necesitaRevalidar, dentroDePeriodoDeGracia } from '../ventana.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const ISSUED_AT = 1_000_000_000; // arbitrary fixed epoch ms, deterministic

describe('constants', () => {
  it('matches the 7-day / 14-day contract from the backend spec', () => {
    expect(DIAS_REVALIDACION).toBe(7);
    expect(DIAS_GRACIA).toBe(14);
  });
});

describe('necesitaRevalidar', () => {
  it('is false before 7 days have passed', () => {
    const ahora = ISSUED_AT + 6.9 * MS_POR_DIA;
    expect(necesitaRevalidar(ISSUED_AT, ahora)).toBe(false);
  });

  it('is true at exactly 7 days', () => {
    const ahora = ISSUED_AT + 7 * MS_POR_DIA;
    expect(necesitaRevalidar(ISSUED_AT, ahora)).toBe(true);
  });

  it('is true well past 7 days', () => {
    const ahora = ISSUED_AT + 30 * MS_POR_DIA;
    expect(necesitaRevalidar(ISSUED_AT, ahora)).toBe(true);
  });
});

describe('dentroDePeriodoDeGracia', () => {
  it('is true just before 14 days', () => {
    const ahora = ISSUED_AT + 13.9 * MS_POR_DIA;
    expect(dentroDePeriodoDeGracia(ISSUED_AT, ahora)).toBe(true);
  });

  it('is false at exactly 14 days', () => {
    const ahora = ISSUED_AT + 14 * MS_POR_DIA;
    expect(dentroDePeriodoDeGracia(ISSUED_AT, ahora)).toBe(false);
  });

  it('is false well past 14 days', () => {
    const ahora = ISSUED_AT + 30 * MS_POR_DIA;
    expect(dentroDePeriodoDeGracia(ISSUED_AT, ahora)).toBe(false);
  });
});
