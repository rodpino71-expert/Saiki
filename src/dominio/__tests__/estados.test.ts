import { describe, it, expect } from 'vitest';
import { Tarea } from '../modelo/tipos';
import { Prioridad, EstadoTarea, EventoTransicion } from '../modelo/enums';
import { transicionarEstado, ErrorTransicion } from '../estados/maquina';
import { iniciarCupo, semanaISO, LIMITE_CUPO } from '../estados/cupo_semanal';

const AHORA = new Date('2026-07-13T10:00:00');

function tareaEnEstado(estado: EstadoTarea, parcial: Partial<Tarea> = {}): Tarea {
  const { estado: _e, id: _id, nombre: _n, ...rest } = parcial;
  return {
    id: 'test-id',
    nombre: 'Tarea prueba',
    prioridad: Prioridad.P2,
    duracion_estimada_min: 60,
    ventana_inicio: new Date('2026-07-13T09:00:00'),
    ventana_fin: new Date('2026-07-13T11:00:00'),
    dimensiones: { C: 3, A: 3, R: 3 },
    estado,
    reclasificaciones: [],
    creado_en: new Date(),
    ...rest,
  };
}

function tareaAltaEnEstado(estado: EstadoTarea): Tarea {
  // I = (5+5+5+1)/4 = 4.0 >= 3.0 → carga alta, consume cupo
  return tareaEnEstado(estado, { dimensiones: { C: 5, A: 5, R: 5 } });
}

function tareaMediaEnEstado(estado: EstadoTarea): Tarea {
  // I = (3+4+4+1)/4 = 3.0 → carga media, consume cupo
  return tareaEnEstado(estado, { dimensiones: { C: 3, A: 4, R: 4 } });
}

const CUPO = iniciarCupo(AHORA);

// Test 11: POR_HACER → HECHA directa → PROHIBIDA
it('Test 11: POR_HACER → HECHA directa está PROHIBIDA', () => {
  const tarea = tareaEnEstado(EstadoTarea.POR_HACER);
  expect(() =>
    transicionarEstado(tarea, { evento: EventoTransicion.CONFIRMAR_HECHA, ahora: AHORA }, CUPO)
  ).toThrow(ErrorTransicion);
});

// Test 12: CIERRE_PENDIENTE → HECHA sin CONFIRMAR_HECHA → PROHIBIDA
it('Test 12: Solo CONFIRMAR_HECHA lleva a HECHA desde CIERRE_PENDIENTE', () => {
  const tarea = tareaEnEstado(EstadoTarea.CIERRE_PENDIENTE);
  // Verificar que INICIAR desde CIERRE_PENDIENTE también falla
  expect(() =>
    transicionarEstado(tarea, { evento: EventoTransicion.INICIAR, ahora: AHORA }, CUPO)
  ).toThrow(ErrorTransicion);
  // CONFIRMAR_HECHA sí funciona
  const { tarea: hecha } = transicionarEstado(
    tarea,
    { evento: EventoTransicion.CONFIRMAR_HECHA, ahora: AHORA },
    CUPO
  );
  expect(hecha.estado).toBe(EstadoTarea.HECHA);
});

// Test 13: Reprogramar sin reclasificar → PROHIBIDA
it('Test 13: REACTIVAR sin nuevas_dimensiones → PROHIBIDA', () => {
  const tarea = tareaEnEstado(EstadoTarea.REPROGRAMADA);
  // Simular REACTIVAR sin dimensiones (forzando el tipo para probar la guarda en runtime)
  expect(() =>
    transicionarEstado(
      tarea,
      {
        evento: EventoTransicion.REACTIVAR,
        ahora: AHORA,
        nuevas_dimensiones: undefined as any,
        nueva_ventana_inicio: new Date(),
        nueva_ventana_fin: new Date(),
      },
      CUPO
    )
  ).toThrow(ErrorTransicion);
});

// Test 14: Reprogramar carga baja → NO consume cupo
it('Test 14: reprogramar carga baja (I ≤ 2) no consume cupo', () => {
  // I = (1+1+1+1)/4 = 1.0 → carga baja
  let cupo = iniciarCupo(AHORA);
  for (let i = 0; i < 10; i++) {
    const tarea = tareaEnEstado(EstadoTarea.CIERRE_PENDIENTE, {
      dimensiones: { C: 1, A: 1, R: 1 },
    });
    const res = transicionarEstado(tarea, { evento: EventoTransicion.REPROGRAMAR, ahora: AHORA }, cupo);
    cupo = res.cupo;
  }
  expect(cupo.consumido).toBe(0);
  expect(cupo.limite).toBe(LIMITE_CUPO);
});

// Test 15: Reprogramar 3 veces la misma tarea alta → cupo agotado
it('Test 15: 3 reprogramaciones de carga alta agotan el cupo', () => {
  let cupo = iniciarCupo(AHORA);
  for (let i = 0; i < 3; i++) {
    const tarea = tareaAltaEnEstado(EstadoTarea.CIERRE_PENDIENTE);
    const res = transicionarEstado(tarea, { evento: EventoTransicion.REPROGRAMAR, ahora: AHORA }, cupo);
    cupo = res.cupo;
  }
  expect(cupo.consumido).toBe(3);
  // La 4ª debe fallar
  const tarea = tareaAltaEnEstado(EstadoTarea.CIERRE_PENDIENTE);
  expect(() =>
    transicionarEstado(tarea, { evento: EventoTransicion.REPROGRAMAR, ahora: AHORA }, cupo)
  ).toThrow(ErrorTransicion);
});

// Test 16: Con cupo agotado, tarea alta NO puede volver a POR_HACER
it('Test 16: cupo agotado — tarea alta en CIERRE_PENDIENTE no puede reprogramarse', () => {
  let cupo = { ...iniciarCupo(AHORA), consumido: 3 }; // cupo ya agotado
  const tarea = tareaAltaEnEstado(EstadoTarea.CIERRE_PENDIENTE);
  expect(() =>
    transicionarEstado(tarea, { evento: EventoTransicion.REPROGRAMAR, ahora: AHORA }, cupo)
  ).toThrow(ErrorTransicion);
  // Sí puede ir a DIVIDIDA
  const { tarea: dividida } = transicionarEstado(
    tarea,
    { evento: EventoTransicion.DIVIDIR, ahora: AHORA },
    cupo
  );
  expect(dividida.estado).toBe(EstadoTarea.DIVIDIDA);
  // Sí puede ir a DESCARTADA
  const { tarea: descartada } = transicionarEstado(
    tarea,
    { evento: EventoTransicion.DESCARTAR, ahora: AHORA },
    cupo
  );
  expect(descartada.estado).toBe(EstadoTarea.DESCARTADA);
});

// Test 17: Con cupo agotado, tarea baja sí puede reprogramarse
it('Test 17: cupo agotado — tarea baja puede reprogramarse igual', () => {
  const cupo = { ...iniciarCupo(AHORA), consumido: 3 };
  const tarea = tareaEnEstado(EstadoTarea.CIERRE_PENDIENTE, { dimensiones: { C: 1, A: 1, R: 1 } });
  const { tarea: reprog } = transicionarEstado(
    tarea,
    { evento: EventoTransicion.REPROGRAMAR, ahora: AHORA },
    cupo
  );
  expect(reprog.estado).toBe(EstadoTarea.REPROGRAMADA);
});

// Test 18: El cupo se reinicia al iniciar nueva semana
it('Test 18: cupo se reinicia al cambiar de semana', () => {
  // Consumir cupo esta semana
  let cupo = { semana_iso: semanaISO(AHORA), consumido: 3, limite: LIMITE_CUPO };
  // Siguiente semana
  const semana_siguiente = new Date('2026-07-20T10:00:00');
  const tarea = tareaAltaEnEstado(EstadoTarea.CIERRE_PENDIENTE);
  const { cupo: cupo_nuevo } = transicionarEstado(
    tarea,
    { evento: EventoTransicion.REPROGRAMAR, ahora: semana_siguiente },
    cupo
  );
  expect(cupo_nuevo.semana_iso).toBe(semanaISO(semana_siguiente));
  expect(cupo_nuevo.consumido).toBe(1); // reinició y consumió 1
});

// Test 19: Agotar cupo NO resta puntos. DESCARTADA suma (no penaliza)
it('Test 19: DESCARTAR es válido con cupo agotado y no resta puntos', () => {
  const cupo = { ...iniciarCupo(AHORA), consumido: 3 };
  const tarea = tareaAltaEnEstado(EstadoTarea.CIERRE_PENDIENTE);
  // Descartar no falla aunque el cupo esté agotado
  const { tarea: descartada, cupo: cupo_final } = transicionarEstado(
    tarea,
    { evento: EventoTransicion.DESCARTAR, ahora: AHORA },
    cupo
  );
  expect(descartada.estado).toBe(EstadoTarea.DESCARTADA);
  // El cupo no se incrementa por DESCARTAR
  expect(cupo_final.consumido).toBe(3);
});

// Test 21: Reclasificación versiona — tras 2 reclasificaciones hay 2 eventos recuperables
it('Test 21: reclasificaciones se versionan sin sobrescribir', () => {
  let cupo = iniciarCupo(AHORA);
  let tarea = tareaMediaEnEstado(EstadoTarea.CIERRE_PENDIENTE);

  // 1ª reprogramación
  let res = transicionarEstado(tarea, { evento: EventoTransicion.REPROGRAMAR, ahora: AHORA }, cupo);
  cupo = res.cupo;
  tarea = res.tarea;

  // 1ª reclasificación → REACTIVAR
  res = transicionarEstado(
    tarea,
    {
      evento: EventoTransicion.REACTIVAR,
      ahora: AHORA,
      nuevas_dimensiones: { C: 4, A: 4, R: 2 },
      nueva_ventana_inicio: new Date('2026-07-14T09:00:00'),
      nueva_ventana_fin: new Date('2026-07-14T11:00:00'),
    },
    cupo
  );
  tarea = res.tarea;
  expect(tarea.reclasificaciones).toHaveLength(1);
  expect(tarea.estado).toBe(EstadoTarea.POR_HACER);

  // Avanzar la tarea a CIERRE_PENDIENTE para 2ª reprogramación
  res = transicionarEstado(tarea, { evento: EventoTransicion.INICIAR, ahora: AHORA }, cupo);
  tarea = res.tarea;
  res = transicionarEstado(tarea, { evento: EventoTransicion.FINALIZAR, ahora: AHORA }, cupo);
  tarea = res.tarea;

  // 2ª reprogramación
  res = transicionarEstado(tarea, { evento: EventoTransicion.REPROGRAMAR, ahora: AHORA }, cupo);
  cupo = res.cupo;
  tarea = res.tarea;

  // 2ª reclasificación
  res = transicionarEstado(
    tarea,
    {
      evento: EventoTransicion.REACTIVAR,
      ahora: AHORA,
      nuevas_dimensiones: { C: 5, A: 4, R: 3 },
      nueva_ventana_inicio: new Date('2026-07-15T09:00:00'),
      nueva_ventana_fin: new Date('2026-07-15T11:00:00'),
    },
    cupo
  );
  tarea = res.tarea;

  // Debe haber 2 eventos de reclasificación, ambos recuperables
  expect(tarea.reclasificaciones).toHaveLength(2);
  expect(tarea.reclasificaciones[0].intento).toBe(1);
  expect(tarea.reclasificaciones[1].intento).toBe(2);
  // El antes del evento 1 NO fue sobrescrito por el evento 2
  expect(tarea.reclasificaciones[0].antes.C).toBe(3);
  expect(tarea.reclasificaciones[1].antes.C).toBe(4);
});
