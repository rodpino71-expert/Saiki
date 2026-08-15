const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = path.join(app.getPath('userData'), 'saiki-tareas.json');

const crypto = require('node:crypto');
const { verifyToken } = require('./src/licencia/token.js');
const { necesitaRevalidar, dentroDePeriodoDeGracia } = require('./src/licencia/ventana.js');

const ACTIVATION_FILE = path.join(app.getPath('userData'), 'activation.json');
const LICENSE_API_BASE = 'https://saiki-resilience.netlify.app';
const ACTIVATION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA9LgqQ4260n/MbZLTesKxz75O0TQcijn9jleVnuhITeM=
-----END PUBLIC KEY-----`;

// Motor de dominio compilado
let dominio = null;
try {
  dominio = require('./dist/dominio/index.js');
} catch (e) {
  console.error('Motor de dominio no disponible. Ejecuta npm run build:dominio', e.message);
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '再起 Saiki -Volver a empezar-',
    frame: false,
    backgroundColor: '#f0f2f5',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: true,
      disableBlinkFeatures: 'Auxclick,Autoplay'
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);

  ipcMain.on('window-min', () => win.minimize());
  ipcMain.on('window-max', () => win.isMaximized() ? win.restore() : win.maximize());
  ipcMain.on('window-close', () => win.close());

  return win;
}

app.whenReady().then(() => {
  const win = createMainWindow();
  win.once('ready-to-show', () => win.show());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Helpers de serialización ──────────────────────────────
function sanitizarTarea(task) {
  return {
    // Campos originales (compatibilidad total con la UI existente)
    id:           String(task.id || Date.now()),
    name:         String(task.name || ''),
    note:         String(task.note || ''),
    priority:     String(task.priority || 'necesaria'),
    date:         String(task.date || ''),
    time:         String(task.time || ''),
    status:       String(task.status || 'todo'),
    created:      String(task.created || new Date().toISOString()),
    lastReviewed: String(task.lastReviewed || new Date().toISOString()),
    completedAt:  task.completedAt ? String(task.completedAt) : null,
    counter:      typeof task.counter === 'number' ? task.counter : 0,

    // Campos del dominio Saiki (preservados tal cual si existen)
    prioridad_saiki:       task.prioridad_saiki       || null,
    dimensiones:           task.dimensiones            || null,
    duracion_estimada_min: typeof task.duracion_estimada_min === 'number'
                             ? task.duracion_estimada_min : null,
    ventana_inicio:        task.ventana_inicio         || null,
    ventana_fin:           task.ventana_fin            || null,
    justificacion:         task.justificacion          || null,
    F_expost:              typeof task.F_expost === 'number' ? task.F_expost : null,
    estado_saiki:          task.estado_saiki           || null,
    reclasificaciones:     Array.isArray(task.reclasificaciones)
                             ? task.reclasificaciones : [],
  };
}

// Reconstitye una Tarea del dominio desde los datos JSON (convierte strings → Date)
function jsonATarea(t) {
  if (!t.dimensiones || !t.ventana_inicio || !t.ventana_fin) {
    throw new Error(`Tarea "${t.name}" no tiene campos de dominio completos (dimensiones, ventana_inicio, ventana_fin).`);
  }
  return {
    id:                    String(t.id),
    nombre:                String(t.name),
    nota:                  t.note || undefined,
    prioridad:             t.prioridad_saiki || 'P2',
    duracion_estimada_min: typeof t.duracion_estimada_min === 'number' ? t.duracion_estimada_min : 60,
    ventana_inicio:        new Date(t.ventana_inicio),
    ventana_fin:           new Date(t.ventana_fin),
    dimensiones:           t.dimensiones,
    justificacion:         t.justificacion || undefined,
    F_expost:              typeof t.F_expost === 'number' ? t.F_expost : undefined,
    estado:                t.estado_saiki || 'POR_HACER',
    reclasificaciones:     (t.reclasificaciones || []).map(r => ({
      ...r,
      momento: new Date(r.momento),
    })),
    creado_en:             new Date(t.created),
  };
}

// Mezcla los campos del dominio de vuelta al formato JSON de almacenamiento
function dominioATareaJson(tareaOriginalJson, tareadominio) {
  return {
    ...tareaOriginalJson,
    estado_saiki:      tareadominio.estado,
    reclasificaciones: tareadominio.reclasificaciones.map(r => ({
      ...r,
      momento: r.momento.toISOString(),
    })),
    dimensiones:           tareadominio.dimensiones,
    ventana_inicio:        tareadominio.ventana_inicio.toISOString(),
    ventana_fin:           tareadominio.ventana_fin.toISOString(),
    duracion_estimada_min: tareadominio.duracion_estimada_min,
    prioridad_saiki:       tareadominio.prioridad,
    justificacion:         tareadominio.justificacion || null,
    F_expost:              tareadominio.F_expost ?? null,
  };
}

// ── IPC: leer tareas desde disco ──────────────────────────
ipcMain.handle('load-tasks', () => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { tasks: [], dayNotes: {}, cupo_semanal: null, config_dia: null };
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);

    // Migración: formato antiguo (array plano)
    if (Array.isArray(data)) {
      return { tasks: data.map(sanitizarTarea), dayNotes: {}, cupo_semanal: null, config_dia: null };
    }

    return {
      tasks:        (data.tasks || []).map(sanitizarTarea),
      dayNotes:     (data.dayNotes && typeof data.dayNotes === 'object') ? data.dayNotes : {},
      cupo_semanal: data.cupo_semanal || null,
      config_dia:   data.config_dia   || null,
    };
  } catch (e) {
    console.error('Error leyendo tareas:', e);
    return { tasks: [], dayNotes: {}, cupo_semanal: null, config_dia: null };
  }
});

// ── IPC: guardar tareas en disco ──────────────────────────
ipcMain.handle('save-tasks', (_event, payload) => {
  try {
    let tasks, dayNotes, cupo_semanal, config_dia;

    if (Array.isArray(payload)) {
      tasks = payload; dayNotes = {}; cupo_semanal = null; config_dia = null;
    } else if (payload && typeof payload === 'object') {
      tasks        = payload.tasks        || [];
      dayNotes     = payload.dayNotes     || {};
      cupo_semanal = payload.cupo_semanal || null;
      config_dia   = payload.config_dia   || null;
    } else {
      throw new Error('Datos inválidos');
    }

    if (!Array.isArray(tasks)) throw new Error('tasks no es un array');
    if (tasks.length > 1000)   throw new Error('Límite de 1000 tareas excedido');

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ tasks: tasks.map(sanitizarTarea), dayNotes, cupo_semanal, config_dia }, null, 2),
      'utf-8'
    );
    return true;
  } catch (e) {
    console.error('Error guardando tareas:', e);
    return false;
  }
});

// ── IPC: exportar tareas a archivo ────────────────────────
ipcMain.handle('export-tasks', async (event, tasks) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: `tareas-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { success: false };
    fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
    return { success: true };
  } catch (e) {
    console.error('Error exportando tareas:', e);
    return { success: false, error: e.message };
  }
});

// ── IPC: importar tareas desde archivo ────────────────────
ipcMain.handle('import-tasks', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) return { success: false };
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return { success: true, tasks: data };
    } else if (data && typeof data === 'object' && Array.isArray(data.tasks)) {
      return { success: true, tasks: data };
    } else {
      throw new Error('El archivo no contiene tareas válidas');
    }
  } catch (e) {
    console.error('Error importando tareas:', e);
    return { success: false, error: e.message };
  }
});

// ── IPC: dominio — evaluar día ────────────────────────────
ipcMain.handle('dominio:evaluar-dia', (_event, { tareas_json, config }) => {
  if (!dominio) return { error: 'Motor de dominio no disponible' };
  try {
    const tareas = tareas_json
      .filter(t => t.dimensiones && t.ventana_inicio && t.ventana_fin)
      .map(jsonATarea);
    return dominio.evaluarDia(tareas, config);
  } catch (e) {
    return { error: e.message };
  }
});

// ── IPC: dominio — admitir tarea ─────────────────────────
ipcMain.handle('dominio:admitir-tarea', (_event, tarea_json) => {
  if (!dominio) return { error: 'Motor de dominio no disponible' };
  try {
    const tarea = jsonATarea(tarea_json);
    return dominio.admitirTarea(tarea);
  } catch (e) {
    return { error: e.message };
  }
});

// ── IPC: dominio — calcular carga de una tarea ───────────
ipcMain.handle('dominio:calcular-carga', (_event, tarea_json) => {
  if (!dominio) return { error: 'Motor de dominio no disponible' };
  try {
    const tarea = jsonATarea(tarea_json);
    return dominio.derivarICCtarea(tarea);
  } catch (e) {
    return { error: e.message };
  }
});

// ── IPC: dominio — transicionar estado ───────────────────
ipcMain.handle('dominio:transicionar-estado', (_event, { tarea_json, entrada_json, cupo }) => {
  if (!dominio) return { ok: false, error: 'Motor de dominio no disponible' };
  try {
    const tarea = jsonATarea(tarea_json);
    // Reconstituir fechas en la entrada
    const entrada = { ...entrada_json, ahora: new Date(entrada_json.ahora) };
    if (entrada.nueva_ventana_inicio) entrada.nueva_ventana_inicio = new Date(entrada.nueva_ventana_inicio);
    if (entrada.nueva_ventana_fin)    entrada.nueva_ventana_fin    = new Date(entrada.nueva_ventana_fin);

    const resultado = dominio.transicionarEstado(tarea, entrada, cupo);
    return {
      ok:    true,
      tarea: dominioATareaJson(tarea_json, resultado.tarea),
      cupo:  resultado.cupo,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: dominio — calcular puntaje mensual ───────────────
ipcMain.handle('dominio:calcular-puntaje', (_event, datos_mes) => {
  if (!dominio) return { error: 'Motor de dominio no disponible' };
  try {
    return dominio.calcularPuntaje(datos_mes);
  } catch (e) {
    return { error: e.message };
  }
});

// ── IPC: dominio — advertencia beta ──────────────────────
ipcMain.handle('dominio:advertencia-beta', (_event, { cc_planificada, beta, PB }) => {
  if (!dominio) return { error: 'Motor de dominio no disponible' };
  try {
    return dominio.advertenciaBeta(cc_planificada, beta, PB);
  } catch (e) {
    return { error: e.message };
  }
});

// ── IPC: dominio — reset resiliente ──────────────────────
ipcMain.handle('dominio:reset-resiliente', (_event, { ciclo_actual, historico }) => {
  if (!dominio) return { error: 'Motor de dominio no disponible' };
  try {
    const ahora = new Date();
    // Reconstituir fechas del ciclo
    const ciclo = {
      ...ciclo_actual,
      inicio: new Date(ciclo_actual.inicio),
      tareas: (ciclo_actual.tareas || []).map(t => {
        try { return jsonATarea(t); } catch { return null; }
      }).filter(Boolean),
    };
    return dominio.resetResiliente(ciclo, historico || [], ahora);
  } catch (e) {
    return { error: e.message };
  }
});

// ── Licencia: activación y validación ──────────────────────
function leerActivacion() {
  try {
    const raw = fs.readFileSync(ACTIVATION_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.token || !data.device_id) return null;
    return data;
  } catch {
    return null;
  }
}

function guardarActivacion(data) {
  fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(data), 'utf8');
}

function borrarActivacion() {
  try { fs.unlinkSync(ACTIVATION_FILE); } catch {}
}

function obtenerOCrearDeviceId() {
  const actual = leerActivacion();
  if (actual && actual.device_id) return actual.device_id;
  return crypto.randomUUID();
}

async function llamarBackendLicencia(ruta, body) {
  try {
    const res = await fetch(`${LICENSE_API_BASE}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data || typeof data !== 'object') {
      return { ok: false, reason: 'service_unavailable' };
    }
    return data;
  } catch {
    return { ok: false, reason: 'service_unavailable' };
  }
}

function revalidarEnSegundoPlano(activacion) {
  llamarBackendLicencia('/api/validate', {
    license_key: activacion.license_key,
    instance_id: activacion.instance_id,
    device_id: activacion.device_id,
  }).then((respuesta) => {
    if (respuesta.ok && respuesta.token) {
      const payload = verifyToken(respuesta.token, ACTIVATION_PUBLIC_KEY_PEM);
      if (payload) {
        guardarActivacion({ token: respuesta.token, ...payload });
      }
    } else if (!respuesta.ok && respuesta.reason === 'revoked') {
      borrarActivacion();
    }
  }).catch(() => {});
}

ipcMain.handle('license:check-activation', () => {
  const activacion = leerActivacion();
  if (!activacion) return { activated: false };

  const payload = verifyToken(activacion.token, ACTIVATION_PUBLIC_KEY_PEM);
  if (!payload) return { activated: false };

  const ahoraMs = Date.now();
  if (!necesitaRevalidar(payload.issued_at, ahoraMs)) {
    return { activated: true };
  }

  revalidarEnSegundoPlano(activacion);
  return { activated: dentroDePeriodoDeGracia(payload.issued_at, ahoraMs) };
});

ipcMain.handle('license:activate', async (_event, licenseKey) => {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { ok: false, reason: 'invalid_key' };
  }

  const deviceId = obtenerOCrearDeviceId();
  const respuesta = await llamarBackendLicencia('/api/activate', {
    license_key: licenseKey,
    device_id: deviceId,
  });

  if (!respuesta.ok) {
    return { ok: false, reason: respuesta.reason || 'service_unavailable' };
  }

  const payload = verifyToken(respuesta.token, ACTIVATION_PUBLIC_KEY_PEM);
  if (!payload) {
    return { ok: false, reason: 'service_unavailable' };
  }

  try {
    guardarActivacion({ token: respuesta.token, ...payload });
  } catch {
    return { ok: false, reason: 'storage_error' };
  }
  return { ok: true };
});
