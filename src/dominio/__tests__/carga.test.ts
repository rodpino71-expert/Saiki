import { describe, it, expect } from 'vitest';
import { calcularT } from '../carga/derivar_T';
import { calcularI } from '../carga/calcular_I';
import { calcularCC } from '../carga/calcular_CC';
import { calcularPB } from '../carga/calcular_PB';

describe('Módulo de carga', () => {
  // Test 1: holgura 0 → T = 5
  it('T derivada: holgura 0 → T = 5', () => {
    // holgura = (ventana - duracion) / duracion = 0 cuando ventana == duracion
    expect(calcularT(60, 60)).toBe(5);
  });

  // Test 2: holgura 1.0 → T = 1
  it('T derivada: holgura 1.0 → T = 1', () => {
    // holgura = (120 - 60) / 60 = 1.0
    expect(calcularT(120, 60)).toBe(1);
  });

  // Test 3: C=A=R=5 con ventana justa → I = 5.0
  it('C=A=R=5 con ventana justa → I = 5.0', () => {
    const T = calcularT(60, 60); // holgura 0 → T=5
    expect(T).toBe(5);
    const I = calcularI(5, 5, 5, T);
    expect(I).toBe(5.0);
  });

  // Test 4: Tarea de 30 min con I = 4.0 → CC = 2.0 UC
  it('Tarea de 30 min con I = 4.0 → CC = 2.0 UC', () => {
    expect(calcularCC(4.0, 30)).toBe(2.0);
  });

  // Test 5: Jornada 8 h con I_sostenible = 3.0 → PB = 24.0 UC
  it('Jornada 8 h con I_sostenible 3.0 → PB = 24.0 UC', () => {
    expect(calcularPB(8, 3.0)).toBe(24.0);
  });

  // Cobertura adicional: rangos de T
  it('T derivada cubre todos los rangos de holgura', () => {
    expect(calcularT(200, 100)).toBe(1); // holgura = 1.0
    expect(calcularT(170, 100)).toBe(2); // holgura = 0.7
    expect(calcularT(130, 100)).toBe(3); // holgura = 0.3
    expect(calcularT(110, 100)).toBe(4); // holgura = 0.1
    expect(calcularT(104, 100)).toBe(5); // holgura = 0.04 < 0.05
  });

  it('calcularI redondea a 1 decimal', () => {
    // (3 + 4 + 2 + 3) / 4 = 3.0
    expect(calcularI(3, 4, 2, 3)).toBe(3.0);
    // (2 + 3 + 2 + 4) / 4 = 2.75 → 2.8
    expect(calcularI(2, 3, 2, 4)).toBe(2.8);
  });
});
