const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 🔒 Archivo de datos en la carpeta personal del usuario
const DATA_FILE = path.join(app.getPath('userData'), 'saiki-tareas.json'); // 🔹 Cambia el nombre a algo único

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Saiki - Tu guerrero de productividad',
    frame: false,
    backgroundColor: '#f0f2f5', // 🔹 Evita el parpadeo blanco al cargar
    show: false, // 🔹 Muestra la ventana cuando esté lista
    webPreferences: {
      nodeIntegration: false, // ✅ Ya lo tenías
      contextIsolation: true, // ✅ Ya lo tenías
      preload: path.join(__dirname, 'preload.js'), // ✅ Ya lo tenías
      // 🔹 NUEVAS OPCIONES DE SEGURIDAD:
      webSecurity: true, // 🔒 Habilita políticas de seguridad de Chromium
      allowRunningInsecureContent: false, // 🔒 Bloquea contenido inseguro
      sandbox: true, // 🔒 Habilita el sandbox de Chromium
      disableBlinkFeatures: 'Auxclick,Autoplay' // 🔒 Desactiva características peligrosas
    }
  });

  // 🔹 Muestra la ventana cuando esté lista (evita parpadeo)
  win.once('ready-to-show', () => {
    win.show();
  });

  win.loadFile('index.html');

  // Quitar la barra de menú nativa
  win.setMenuBarVisibility(false);

  // Handlers para la barra de título personalizada
  ipcMain.on('window-min', () => win.minimize());
  ipcMain.on('window-max', () => {
    if (win.isMaximized()) {
      win.restore();
    } else {
      win.maximize();
    }
  });
  ipcMain.on('window-close', () => win.close());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: leer tareas desde disco ──────────────────────────
ipcMain.handle('load-tasks', () => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      // 🔹 Devuelve un array vacío si el archivo no existe
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const tasks = JSON.parse(raw);

    // 🔹 VALIDACIÓN: Asegúrate de que tasks sea un array
    if (!Array.isArray(tasks)) {
      console.error('Datos corruptos: no es un array. Reseteando...');
      return [];
    }

    // 🔹 VALIDACIÓN: Sanitiza cada tarea (por si acaso)
    return tasks.map(task => {
      // 🔹 Asegúrate de que cada tarea tenga los campos básicos
      return {
        id: String(task.id || Date.now()),
        name: String(task.name || ''),
        note: String(task.note || ''),
        priority: String(task.priority || 'necesaria'),
        date: String(task.date || ''),
        status: String(task.status || 'todo'),
        created: String(task.created || new Date().toISOString()),
        lastReviewed: String(task.lastReviewed || new Date().toISOString()),
        completedAt: task.completedAt ? String(task.completedAt) : null,
        counter: typeof task.counter === 'number' ? task.counter : 0
      };
    });
  } catch (e) {
    console.error('Error leyendo tareas:', e);
    return []; // 🔹 Devuelve array vacío en caso de error
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
    const tasks = JSON.parse(raw);
    if (!Array.isArray(tasks)) throw new Error('El archivo no contiene un array de tareas');
    return { success: true, tasks };
  } catch (e) {
    console.error('Error importando tareas:', e);
    return { success: false, error: e.message };
  }
});

// ── IPC: guardar tareas en disco ──────────────────────────
ipcMain.handle('save-tasks', (_event, tasks) => {
  try {
    // 🔹 VALIDACIÓN: Asegúrate de que tasks sea un array
    if (!Array.isArray(tasks)) {
      throw new Error('Datos inválidos: no es un array');
    }

    // 🔹 VALIDACIÓN: Sanitiza cada tarea antes de guardar
    const sanitizedTasks = tasks.map(task => {
      return {
        id: String(task.id || Date.now()),
        name: String(task.name || ''),
        note: String(task.note || ''),
        priority: String(task.priority || 'necesaria'),
        date: String(task.date || ''),
        status: String(task.status || 'todo'),
        created: String(task.created || new Date().toISOString()),
        lastReviewed: String(task.lastReviewed || new Date().toISOString()),
        completedAt: task.completedAt ? String(task.completedAt) : null,
        counter: typeof task.counter === 'number' ? task.counter : 0
      };
    });

    // 🔹 Escribe el archivo con permisos seguros
    fs.writeFileSync(DATA_FILE, JSON.stringify(sanitizedTasks, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error guardando tareas:', e);
    return false;
  }
});
