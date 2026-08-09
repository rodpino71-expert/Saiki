import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Tarea } from '../modelo/tipos';
import { Prioridad, EstadoTarea, SemaforoDia } from '../modelo/enums';
import { evaluarDia, admitirTarea } from '../planificacion';
import { advertenciaBeta } from '../planificacion/beta';

function tareaBase({ nombre, dimensiones, prioridad, ...rest }: Partial<Tarea> & Pick<Tarea, 'nombre' | 'dimensiones' | 'prioridad'>): Tarea {
  const ventana_inicio = new Date('2026-07-13T09:00:00');
  const ventana_fin = new Date('2026-07-13T11:00:00');
  return {
    id: Math.random().toString(36).slice(2),
    nombre,
    duracion_estimada_min: 60,
    ventana_inicio,
    ventana_fin,
    dimensiones,
    prioridad,
    estado: EstadoTarea.POR_HACER,
    reclasificaciones: [],
    creado_en: new Date(),
    ...rest,
  };
}

const CONFIG_8H = { horas_utiles: 8, I_sostenible: 3.0 }; // PB = 24 UC

// Test 6: Σ CC = 22.0 con PB = 24 → ÁMBAR
it('Test 6: Σ CC = 22.0 con PB = 24 → ÁMBAR', () => {
  // 4 tareas con I=2.75 × 2h cada una → CC = 2.75 × 2 = 5.5 por tarea → 4×5.5=22.0
  // I=2.75: (C+A+R+T)/4=2.75 con T=1 (holgura 1.0) → C+A+R=10 → 4+3+3=10
  const tareas = Array.from({ length: 4 }, (_, i) =>
    tareaBase({
      nombre: `Tarea ${i}`,
      prioridad: Prioridad.P2,
      dimensiones: { C: 4, A: 3, R: 3 },
      duracion_estimada_min: 120, // 2h → CC = 2.75 × 2 = 5.5
      ventana_inicio: new Date('2026-07-13T09:00:00'),
      ventana_fin: new Date('2026-07-13T13:00:00'), // 240min ventana, 120min tarea → holgura 1.0 → T=1
    })
  );
  const resultado = evaluarDia(tareas, CONFIG_8H);
  // El invariante es que esté en zona ÁMBAR: 0.85×PB < Σ CC ≤ PB
  expect(resultado.suma_CC).toBeGreaterThan(0.85 * 24); // > 20.4
  expect(resultado.suma_CC).toBeLessThanOrEqual(24);
  expect(resultado.semaforo).toBe(SemaforoDia.AMBAR);
});

// Test 7: 3 tareas con I ≥ 4 → ROJO por R2
it('Test 7: 3 tareas con I ≥ 4 → ROJO por R2', () => {
  // I alta: C=5, A=5, R=5, T=1 → (16/4) = 4.0
  const tareas = Array.from({ length: 3 }, (_, i) =>
    tareaBase({
      nombre: `Alta ${i}`,
      prioridad: Prioridad.P1,
      dimensiones: { C: 5, A: 5, R: 2 },
      duracion_estimada_min: 60,
      ventana_inicio: new Date('2026-07-13T09:00:00'),
      ventana_fin: new Date('2026-07-13T11:00:00'), // holgura 1.0 → T=1 → I=(5+5+2+1)/4=3.25... necesito I>=4
    })
  );
  // Ajustar para que I >= 4: C=5, A=5, R=5, T=1 → (5+5+5+1)/4=4.0
  const tareasAltas = Array.from({ length: 3 }, (_, i) =>
    tareaBase({
      nombre: `Alta ${i}`,
      prioridad: Prioridad.P1,
      dimensiones: { C: 5, A: 5, R: 5 },
      duracion_estimada_min: 60,
      ventana_inicio: new Date('2026-07-13T09:00:00'),
      ventana_fin: new Date('2026-07-13T11:00:00'), // holgura 1.0 → T=1 → I=(5+5+5+1)/4=4.0
    })
  );
  const resultado = evaluarDia(tareasAltas, CONFIG_8H);
  expect(resultado.semaforo).toBe(SemaforoDia.ROJO);
  expect(resultado.reglas_violadas.some(r => r.codigo === 'R2')).toBe(true);
});

// Test 8: Σ CC alta = 10.0 con PB=24 → ROJO por R3 (10 > 9.6)
it('Test 8: Σ CC alta = 10.0 con PB=24 → ROJO por R3', () => {
  // límite R3 = 0.40 × 24 = 9.6. Necesito 2 tareas con I>=4 y CC total = 10.0
  // Tarea 1: I=4.0, duracion=150min → CC=4.0×2.5=10.0 ← es una sola tarea
  const tareaAlta = tareaBase({
    nombre: 'Alta grande',
    prioridad: Prioridad.P1,
    dimensiones: { C: 5, A: 5, R: 5 },
    duracion_estimada_min: 150, // CC = 4.0 × 2.5 = 10.0
    ventana_inicio: new Date('2026-07-13T09:00:00'),
    ventana_fin: new Date('2026-07-13T12:30:00'), // 210min ventana, 150min tarea → holgura=0.4 → T=3
    // Con T=3: I=(5+5+5+3)/4=4.5, CC=4.5×2.5=11.25. Ajusto para holgura que dé T=1
    // ventana = 300min (5h), duracion=150min → holgura=1.0 → T=1 → I=(5+5+5+1)/4=4.0, CC=10.0
  });
  // Recrear con ventana correcta
  const t = {
    ...tareaAlta,
    ventana_fin: new Date('2026-07-13T14:00:00'), // inicio 9h + 5h = 14h → 300min ventana, holgura=1.0 → T=1
  };
  const resultado = evaluarDia([t], CONFIG_8H);
  expect(resultado.reglas_violadas.some(r => r.codigo === 'R3')).toBe(true);
  expect(resultado.semaforo).toBe(SemaforoDia.ROJO);
});

// Test 9: Tarea P4 → rechazada al ingresar al tablero
it('Test 9: Tarea P4 → rechazada al ingresar al tablero', () => {
  const tarea = tareaBase({ nombre: 'P4 test', prioridad: Prioridad.P4, dimensiones: { C: 1, A: 1, R: 1 } });
  const resultado = admitirTarea(tarea);
  expect(resultado).not.toBeNull();
  expect(resultado!.codigo).toBe('R5');
});

// Test 10: P3 con I=4.5 sin justificación → rechazada. Con justificación → admitida
it('Test 10: P3 alta sin justificación → rechazada; con justificación → admitida', () => {
  const tareaBase10 = tareaBase({
    nombre: 'P3 alta',
    prioridad: Prioridad.P3,
    dimensiones: { C: 5, A: 5, R: 5 },
    // I = (5+5+5+1)/4 = 4.0 con holgura 1.0
  });

  const sinJustif = admitirTarea(tareaBase10);
  expect(sinJustif).not.toBeNull();
  expect(sinJustif!.codigo).toBe('R6');

  const conJustif = admitirTarea({ ...tareaBase10, justificacion: 'Es crítico para el cliente' });
  expect(conJustif).toBeNull();
});

// Test 22: β=1.3, 22 UC planificada, PB=24 → advertencia aunque semáforo sea VERDE
it('Test 22: β=1.3 → advertencia de proyección cuando CC×β > PB', () => {
  const advertencia = advertenciaBeta(22, 1.3, 24);
  expect(advertencia).not.toBeNull();
  expect(advertencia!.cc_proyectada).toBeCloseTo(28.6, 1);
  expect(advertencia!.beta).toBe(1.3);
  expect(advertencia!.PB).toBe(24);
});

// Test 23: β se expone, no se aplica — el plan queda IDÉNTICO
it('Test 23: evaluar no modifica el plan (β se expone, no se aplica)', () => {
  const tareas: Tarea[] = [
    tareaBase({ nombre: 'Tarea A', prioridad: Prioridad.P2, dimensiones: { C: 2, A: 2, R: 2 } }),
  ];
  const copia_antes = JSON.stringify(tareas);
  evaluarDia(tareas, CONFIG_8H);
  const copia_despues = JSON.stringify(tareas);
  expect(copia_antes).toBe(copia_despues);
});

// T-A: P3 pesada sin justificar → RechazoAdmision, día SIN esa tarea queda VERDE
it('T-A: P3 pesada sin justificar es rechazada y el día restante queda VERDE', () => {
  const p3Pesada = tareaBase({
    nombre: 'P3 pesada',
    prioridad: Prioridad.P3,
    dimensiones: { C: 5, A: 5, R: 5 },
    duracion_estimada_min: 60,
    // ventana 2h, duracion 1h → holgura 1.0 → T=1 → I=(5+5+5+1)/4=4.0 → CC=4.0
  });
  const rechazo = admitirTarea(p3Pesada);
  expect(rechazo).not.toBeNull();
  expect(rechazo!.codigo).toBe('R6');

  const diaSinP3 = evaluarDia([], CONFIG_8H);
  expect(diaSinP3.semaforo).toBe(SemaforoDia.VERDE);
  expect(diaSinP3.reglas_violadas).toHaveLength(0);
});

// T-B: Σ CC = 21, PB = 24, cero violaciones → ÁMBAR
it('T-B: Σ CC en zona ámbar con cero violaciones → ÁMBAR', () => {
  // 3 tareas: C=5, A=4, R=4 → I=(5+4+4+1)/4=3.5, duracion=120min → CC=3.5×2=7.0
  // 3 × 7.0 = 21.0. 0.85×24=20.4 < 21 ≤ 24 → ÁMBAR
  const tareas = Array.from({ length: 3 }, (_, i) =>
    tareaBase({
      nombre: `Media ${i}`,
      prioridad: Prioridad.P2,
      dimensiones: { C: 5, A: 4, R: 4 },
      duracion_estimada_min: 120,
      ventana_inicio: new Date('2026-07-13T09:00:00'),
      ventana_fin: new Date('2026-07-13T14:00:00'), // 300min ventana, 120min tarea → holgura 1.5 → T=1
    })
  );
  const resultado = evaluarDia(tareas, CONFIG_8H);
  expect(resultado.suma_CC).toBeCloseTo(21.0, 1);
  expect(resultado.reglas_violadas).toHaveLength(0);
  expect(resultado.semaforo).toBe(SemaforoDia.AMBAR);
});

// T-C: 3 tareas pesadas 2.5h + descansos → R7 ROJO
it('T-C: tareas + descansos obligatorios superan horas útiles → ROJO por R7', () => {
  // Cada tarea: C=5, A=5, R=5 → I=4.0, duracion=150min (2.5h)
  // ventana 5h (300min) para holgura 1.0 → T=1
  // descansoObligatorio(150, 4.0) = ceil(150/60)*15 = 3*15 = 45 min por tarea
  // 3 tareas → 3 descansos = 135 min
  // Σ duraciones = 450 min, Σ descansos = 135 min, total = 585 min
  // horas_utiles = 480 min → 585 > 480 → R7
  const tareas = Array.from({ length: 3 }, (_, i) =>
    tareaBase({
      nombre: `Bloque ${i}`,
      prioridad: Prioridad.P1,
      dimensiones: { C: 5, A: 5, R: 5 },
      duracion_estimada_min: 150,
      ventana_inicio: new Date(`2026-07-13T${9 + i * 5}:00:00`),
      ventana_fin: new Date(`2026-07-13T${9 + i * 5 + 5}:00:00`), // 5h ventana → holgura 1.0 → T=1
    })
  );
  const resultado = evaluarDia(tareas, CONFIG_8H);
  expect(resultado.reglas_violadas.some(r => r.codigo === 'R7')).toBe(true);
  expect(resultado.semaforo).toBe(SemaforoDia.ROJO);
});

// T-D: GUARDIÁN DE JERGA — ningún string literal en src/dominio/ contiene jerga
it('T-D: el dominio no contiene jerga en strings literales', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const dominioDir = join(__dirname, '..');

  const TERMINOS_PROHIBIDOS = [
    'Σ', 'UC', 'PB', 'CC', 'I_sostenible',
    'β', 'carga cognitiva', 'intensidad', 'presupuesto',
  ];

  function findTsFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__') continue;
        results.push(...findTsFiles(full));
      } else if (extname(full) === '.ts') {
        results.push(full);
      }
    }
    return results;
  }

  const archivos = findTsFiles(dominioDir);
  const violaciones: { archivo: string; linea: number; literal: string; termino: string }[] = [];

  for (const archivo of archivos) {
    const contenido = readFileSync(archivo, 'utf-8');
    const lineas = contenido.split('\n');
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const esComentario = /^\s*\/\//.test(linea) || /^\s*\*/.test(linea);
      const esImport = /^\s*(import|export)\s/.test(linea) || /\sfrom\s/.test(linea);
      if (esComentario || esImport) continue;

      const literales = linea.match(/["'`](?:(?!["'`]|\\).|\\.)*["'`]/g) || [];
      for (const literal of literales) {
        const contenido_literal = literal.slice(1, -1);
        for (const termino of TERMINOS_PROHIBIDOS) {
          if (contenido_literal.includes(termino)) {
            violaciones.push({
              archivo: archivo.replace(dominioDir + '/', ''),
              linea: i + 1,
              literal,
              termino,
            });
          }
        }
      }
    }
  }

  expect(violaciones).toEqual([]);
});
