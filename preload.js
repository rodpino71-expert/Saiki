const { contextBridge, ipcRenderer } = require('electron');

// ── Almacenamiento de tareas ──────────────────────────────
contextBridge.exposeInMainWorld('taskStorage', {
  load: () => ipcRenderer.invoke('load-tasks'),
  save: (payload) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if (payload.tasks && !Array.isArray(payload.tasks)) {
        return Promise.reject(new Error('Datos inválidos'));
      }
      if (payload.tasks && payload.tasks.length > 1000) {
        return Promise.reject(new Error('Límite de tareas excedido'));
      }
    }
    if (Array.isArray(payload) && payload.length > 1000) {
      return Promise.reject(new Error('Límite de tareas excedido'));
    }
    return ipcRenderer.invoke('save-tasks', payload);
  }
});

// ── Control de ventana ────────────────────────────────────
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close:    () => ipcRenderer.send('window-close')
});

// ── Archivos (export / import) ────────────────────────────
contextBridge.exposeInMainWorld('fileAPI', {
  exportTasks: (tasks) => ipcRenderer.invoke('export-tasks', tasks),
  importTasks: () => ipcRenderer.invoke('import-tasks')
});

// ── Motor de dominio Saiki ────────────────────────────────
contextBridge.exposeInMainWorld('saikiDominio', {
  // Evalúa el día: devuelve { semaforo, suma_CC, presupuesto_base, reglas_violadas, acciones_correctivas }
  evaluarDia: (tareas_json, config) =>
    ipcRenderer.invoke('dominio:evaluar-dia', { tareas_json, config }),

  // Valida si una tarea puede entrar al tablero (R5, R6)
  admitirTarea: (tarea_json) =>
    ipcRenderer.invoke('dominio:admitir-tarea', tarea_json),

  // Calcula T, I, CC para una tarea con campos de dominio completos
  calcularCarga: (tarea_json) =>
    ipcRenderer.invoke('dominio:calcular-carga', tarea_json),

  // Transiciona el estado de una tarea según la máquina de estados
  // entrada_json: { evento, ahora, [nuevas_dimensiones, nueva_ventana_inicio, nueva_ventana_fin] }
  // Devuelve: { ok, tarea, cupo } | { ok: false, error }
  transicionarEstado: (tarea_json, entrada_json, cupo) =>
    ipcRenderer.invoke('dominio:transicionar-estado', { tarea_json, entrada_json, cupo }),

  // Calcula el puntaje mensual: { IEC, IR, IRe, total, umbral }
  calcularPuntaje: (datos_mes) =>
    ipcRenderer.invoke('dominio:calcular-puntaje', datos_mes),

  // Devuelve advertencia de β o null si no aplica
  advertenciaBeta: (cc_planificada, beta, PB) =>
    ipcRenderer.invoke('dominio:advertencia-beta', { cc_planificada, beta, PB }),

  // Reset Resiliente: archiva ciclo actual, reduce I_sostenible × 0.75
  resetResiliente: (ciclo_actual, historico) =>
    ipcRenderer.invoke('dominio:reset-resiliente', { ciclo_actual, historico }),
});
