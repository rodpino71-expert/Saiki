const { contextBridge, ipcRenderer } = require('electron');

// 🔒 Exponer APIs de almacenamiento de tareas
contextBridge.exposeInMainWorld('taskStorage', {
  load: () => ipcRenderer.invoke('load-tasks'),
  save: (tasks) => {
    // Validación básica
    if (!Array.isArray(tasks)) {
      console.error('Saiki: Datos inválidos (no es un array)');
      return Promise.reject(new Error('Datos inválidos'));
    }
    // Límite de tamaño (opcional)
    if (tasks.length > 1000) {
      console.error('Saiki: Demasiadas tareas (máximo 1000)');
      return Promise.reject(new Error('Límite de tareas excedido'));
    }
    return ipcRenderer.invoke('save-tasks', tasks);
  }
});

// 🔒 Exponer APIs de control de ventana
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close')
});

// 🔒 API de archivos (export/import)
contextBridge.exposeInMainWorld('fileAPI', {
  exportTasks: (tasks) => ipcRenderer.invoke('export-tasks', tasks),
  importTasks: () => ipcRenderer.invoke('import-tasks')
});
