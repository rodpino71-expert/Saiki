import { describe, it, expect } from 'vitest';
import { calcularPuntaje } from '../puntaje/puntaje';
import { resetResiliente } from '../puntaje/reset';
import { Ciclo, Tarea } from '../modelo/tipos';
import { Prioridad, EstadoTarea, SemaforoDia } from '../modelo/enums';

const AHORA = new Date('2026-07-13T10:00:00');

// Test 20: TEST DE FILOSOFÍA — 0 tareas HECHA, 100% días VERDES → PUNTAJE ≥ 80
it('Test 20: mes con 0 tareas HECHA y 100% días VERDES → puntaje ≥ 80', () => {
  const N = 20; // 20 días planificados
  const resultado = calcularPuntaje({
    dias_verdes: N,
    dias_ambar: 0,
    dias_planificados: N,
    descansos_R4_pct: 1.0,    // 100% — sin tareas de alta intensidad, R4 no aplica
    dias_sin_R2_pct: 1.0,     // 100% — nunca superó el límite de 2 tareas altas
    dias_dentro_horario_pct: 1.0, // 100%
    EAM_normalizado: 0,       // sin datos ex-post → sin penalización
  });
  // IEC = 40×(20+0)/20 = 40
  // IR  = 30×(0.4×1+0.3×1+0.3×1) = 30
  // IRe = 30×(1−0) = 30
  // Total = 100
  expect(resultado.total).toBeGreaterThanOrEqual(80);
  expect(resultado.umbral).toBe('Sostenible');
});

// Test 24: Reset Resiliente — histórico intacto, ciclo archivado, I_sostenible × 0.75
it('Test 24: Reset Resiliente conserva histórico y reduce I_sostenible al 75%', () => {
  const tarea: Tarea = {
    id: 't1',
    nombre: 'Tarea ejemplo',
    prioridad: Prioridad.P2,
    duracion_estimada_min: 60,
    ventana_inicio: new Date('2026-07-13T09:00:00'),
    ventana_fin: new Date('2026-07-13T11:00:00'),
    dimensiones: { C: 3, A: 3, R: 3 },
    estado: EstadoTarea.POR_HACER,
    reclasificaciones: [],
    creado_en: AHORA,
  };

  const ciclo_actual: Ciclo = {
    id: 'ciclo-1',
    tareas: [tarea],
    datos_dias: [
      { fecha: '2026-07-01', semaforo: SemaforoDia.VERDE, descansos_R4_respetados: true, R2_cumplida: true, cerrado_dentro_horario: true },
    ],
    I_sostenible: 3.0,
    inicio: new Date('2026-07-01'),
  };

  const historico_previo: Ciclo[] = [];
  const { ciclo_archivado, ciclo_nuevo, historico_completo } = resetResiliente(
    ciclo_actual,
    historico_previo,
    AHORA
  );

  // El histórico incluye el ciclo archivado
  expect(historico_completo).toHaveLength(1);
  expect(historico_completo[0].id).toBe('ciclo-1');

  // El ciclo archivado tiene fecha de archivo
  expect(ciclo_archivado.archivado_en).toBeDefined();

  // El ciclo nuevo tiene I_sostenible reducido
  expect(ciclo_nuevo.I_sostenible).toBeCloseTo(3.0 * 0.75, 5);

  // El ciclo nuevo NO tiene el histórico borrado — las tareas base se preservan (filtradas por P4/P3)
  expect(ciclo_nuevo.tareas.length).toBeGreaterThanOrEqual(1);

  // La tarea P2 sobrevive al reset
  expect(ciclo_nuevo.tareas.find(t => t.id === 't1')).toBeDefined();
});

// Verificación adicional: puntaje tensionado y sobrecarga
it('umbrales de puntaje son correctos', () => {
  const tensionado = calcularPuntaje({
    dias_verdes: 14, dias_ambar: 6, dias_planificados: 20,
    descansos_R4_pct: 0.7, dias_sin_R2_pct: 0.8, dias_dentro_horario_pct: 0.6,
    EAM_normalizado: 0.3,
  });
  expect(tensionado.total).toBeGreaterThanOrEqual(40);

  const sobrecarga = calcularPuntaje({
    dias_verdes: 4, dias_ambar: 4, dias_planificados: 20,
    descansos_R4_pct: 0.3, dias_sin_R2_pct: 0.3, dias_dentro_horario_pct: 0.3,
    EAM_normalizado: 0.7,
  });
  expect(sobrecarga.total).toBeLessThan(60);
});
