<script>
  // ---------------------- MODELO DE DATOS ----------------------
  let tasks = [];            // { id, title, priority, date, status, counter, lastReviewed, ... }
  let currentCp = 10;       // capacidad diaria en puntos (mín 3, máx 15)
  let userName = "Guerrero/a";
  let userXp = 0;
  let userMedals = [];       // ["Rompe-Límites", "Estado de Flujo", ...]
  let dayPerfectCount = 0;   // días perfectos consecutivos en el mes actual
  let currentMonth = "";     // "YYYY-MM"
  let historicalData = [];    // { month, ter, ip, declaration }
  let semestersArchive = [];   // archivo de semestres pasados
  let lastUsedDate = "";      // para control de cambio de mes/día

  // ---------------------- CONSTANTES ----------------------
  const PRIORITY_POINTS = {
    imprescindible: 5,
    "muy necesaria": 3,
    necesaria: 2,
    aplazable: 1
  };
  const XP_BASE = {
    imprescindible: 100,
    "muy necesaria": 75,
    necesaria: 50,
    aplazable: 25
  };
  const MAX_CP = 15;
  const MIN_CP = 3;

  // ---------------------- HELPERS ----------------------
  function saveToLocalStorage() {
    const data = {
      tasks, currentCp, userXp, userMedals, dayPerfectCount,
      currentMonth, historicalData, semestersArchive, lastUsedDate, userName
    };
    localStorage.setItem("saikiPlannerData", JSON.stringify(data));
    // También persistir mediante IPC para el main process (backup)
    if (window.taskStorage && window.taskStorage.save) {
      window.taskStorage.save(data);
    }
  }

  async function loadFromLocalStorage() {
    // Primero intentar desde IPC (main.js) si existe
    let data = null;
    if (window.taskStorage && window.taskStorage.load) {
      data = await window.taskStorage.load();
    }
    if (!data) {
      const local = localStorage.getItem("saikiPlannerData");
      if (local) data = JSON.parse(local);
    }
    if (data) {
      tasks = data.tasks || [];
      currentCp = Math.min(MAX_CP, Math.max(MIN_CP, data.currentCp || 10));
      userXp = data.userXp || 0;
      userMedals = data.userMedals || [];
      dayPerfectCount = data.dayPerfectCount || 0;
      currentMonth = data.currentMonth || getCurrentMonth();
      historicalData = data.historicalData || [];
      semestersArchive = data.semestersArchive || [];
      lastUsedDate = data.lastUsedDate || "";
      userName = data.userName || localStorage.getItem("userName") || "Guerrero/a";
      localStorage.setItem("userName", userName);
    } else {
      // Inicializar demo
      userName = localStorage.getItem("userName") || "Guerrero/a";
      localStorage.setItem("userName", userName);
      currentMonth = getCurrentMonth();
      tasks = [];
    }
    renderAll();
  }

  function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function getTodayStr() {
    return new Date().toISOString().slice(0,10);
  }

  // Carga diaria en puntos (solo tareas no completadas con fecha igual a hoy)
  function calculateDailyLoad(date = getTodayStr()) {
    return tasks
      .filter(t => t.date === date && t.status !== 'done')
      .reduce((sum, t) => sum + PRIORITY_POINTS[t.priority], 0);
  }

  // Calcular carga proyectada si añadiéramos/modificáramos una tarea en una fecha
  function calculateProjectedLoad(date, newTaskPoints, excludeTaskId = null) {
    let base = tasks
      .filter(t => t.date === date && t.status !== 'done' && t.id !== excludeTaskId)
      .reduce((sum, t) => sum + PRIORITY_POINTS[t.priority], 0);
    return base + newTaskPoints;
  }

  // ---------------------- ALERTA Y BANNER DINÁMICO ----------------------
  function updateOverloadAlert() {
    const alertDiv = document.getElementById('overloadAlert');
    if (!alertDiv) return;
    const today = getTodayStr();
    const load = calculateDailyLoad(today);
    const cp = currentCp;
    if (load > cp) {
      alertDiv.innerHTML = `⚠️ Hola ${userName}, hoy superas tu límite en ${load - cp} puntos. Intenta aplazar algo o reducir prioridades. ¿Realmente necesitas todo esto?`;
      alertDiv.style.display = 'block';
      alertDiv.style.backgroundColor = '#f8d7da';
      alertDiv.style.color = '#721c24';
    } else if (load === cp) {
      alertDiv.innerHTML = `🔔 Justo en el límite. Vas bien, pero sin margen. Concéntrate en lo esencial, ${userName}.`;
      alertDiv.style.display = 'block';
      alertDiv.style.backgroundColor = '#fff3cd';
      alertDiv.style.color = '#856404';
    } else {
      alertDiv.style.display = 'none';
    }
  }

  function updatePerformanceBanner() {
    const banner = document.getElementById('performanceBanner');
    if (!banner) return;
    const today = getTodayStr();
    const load = calculateDailyLoad(today);
    const ratio = load / currentCp;
    if (ratio <= 0.8) {
      banner.innerHTML = `🟢 Ritmo tranquilo. Tienes espacio para más, pero no es necesario, ${userName}.`;
      banner.className = 'banner-green';
    } else if (ratio <= 1) {
      banner.innerHTML = `🟡 Día exigente. Cuidado con el agotamiento, ${userName}.`;
      banner.className = 'banner-yellow';
    } else {
      banner.innerHTML = `🔴 Estás sobrecargado. Replanifica con saiki, ${userName}.`;
      banner.className = 'banner-red';
    }
  }

  // ---------------------- NOTIFICACIONES SORPRESA (TOAST) ----------------------
  function showToastMessage(message, xpBonus = 0) {
    // Crear toast flotante
    const toast = document.createElement('div');
    toast.className = 'saiki-toast';
    toast.innerHTML = `✨ ${message} ${xpBonus > 0 ? `(+${xpBonus} XP)` : ''}`;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.backgroundColor = '#2c3e50';
    toast.style.color = 'white';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '30px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    toast.style.zIndex = '9999';
    toast.style.fontFamily = 'monospace';
    toast.style.fontSize = '14px';
    toast.style.transition = 'opacity 0.5s';
    document.body.appendChild(toast);
    if (xpBonus > 0) {
      addXP(xpBonus);
    }
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  // ---------------------- XP Y MEDALLAS ----------------------
  function addXP(amount) {
    userXp += amount;
    updateUIStats();
    saveToLocalStorage();
  }

  function awardMedal(medalName) {
    if (!userMedals.includes(medalName)) {
      userMedals.push(medalName);
      showToastMessage(`🏅 ¡Has ganado la medalla "${medalName}"!`, 20);
    }
  }

  function updateUIStats() {
    document.getElementById('xpValue').innerText = userXp;
    document.getElementById('medalsList').innerHTML = userMedals.map(m => `<span class="medal">🏅 ${m}</span>`).join('');
    document.getElementById('cpValue').innerText = currentCp;
  }

  // Al completar una tarea (usar en todos los flujos)
  async function awardTaskComplete(task, wasOverloadedBefore, isLastTaskOfDay) {
    const baseXp = XP_BASE[task.priority] || 25;
    let xpEarned = baseXp;
    let overloadBonus = false;
    if (wasOverloadedBefore) {
      xpEarned *= 2;
      overloadBonus = true;
      awardMedal("Rompe-Límites");
    }
    addXP(xpEarned);
    showToastMessage(`Completaste "${task.title}". +${xpEarned} XP`, 0);
    
    // Medalla Estado de Flujo: completar "muy necesaria" 5 días seguidos (llevar contador aparte)
    // Simplemente chequearemos un contador en localStorage por simplicidad
    let flowCounter = parseInt(localStorage.getItem('flowCounter') || '0');
    if (task.priority === 'muy necesaria') {
      flowCounter++;
      if (flowCounter === 5) {
        awardMedal("Estado de Flujo");
        flowCounter = 0; // reiniciar tras medalla
      }
      localStorage.setItem('flowCounter', flowCounter);
    } else {
      // se rompe la racha si no es muy necesaria
      localStorage.setItem('flowCounter', '0');
    }

    // Día perfecto: si era sobrecarga (carga > CP antes de completar) y después de completar la carga final <= CP
    if (wasOverloadedBefore && isLastTaskOfDay) {
      const newLoad = calculateDailyLoad(getTodayStr());
      if (newLoad <= currentCp) {
        dayPerfectCount++;
        if (dayPerfectCount === 3 && currentMonth === getCurrentMonth()) {
          // incrementar CP
          let newCp = Math.min(MAX_CP, currentCp + 1);
          if (newCp !== currentCp) {
            currentCp = newCp;
            showToastMessage(`¡Has superado tus límites con sabiduría! Tu capacidad ha aumentado a ${currentCp}. Eres un guerrero saiki.`, 50);
            dayPerfectCount = 0; // reiniciar contador mensual
          }
        } else {
          showToastMessage(`¡Día perfecto! Lograste equilibrar tu carga. +1 día perfecto (${dayPerfectCount}/3).`, 10);
        }
        saveToLocalStorage();
      }
    }
  }

  // ---------------------- TRADE-OFF MODAL ----------------------
  function showTradeOffModal(proposedDate, requiredPoints, originalAction, originalTaskId = null) {
    // Obtener tareas de ese día no completadas
    const tasksThatDay = tasks.filter(t => t.date === proposedDate && t.status !== 'done' && t.id !== originalTaskId);
    if (tasksThatDay.length === 0) return false; // no hay qué aplazar
    
    // Construir modal dinámico
    let modal = document.getElementById('tradeOffModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'tradeOffModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h3>⚠️ Intercambio necesario</h3>
          <p>Para añadir esta tarea necesitas liberar <strong>${requiredPoints}</strong> puntos. Selecciona tareas para aplazar (se moverán a mañana +1 contador):</p>
          <div id="tradeOffList"></div>
          <button id="confirmTradeOff">Confirmar aplazamiento y continuar</button>
          <button id="cancelTradeOff">Cancelar</button>
        </div>
      `;
      document.body.appendChild(modal);
    }
    const listDiv = document.getElementById('tradeOffList');
    listDiv.innerHTML = '';
    tasksThatDay.forEach(t => {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = t.id;
      chk.setAttribute('data-points', PRIORITY_POINTS[t.priority]);
      const label = document.createElement('label');
      label.appendChild(chk);
      label.appendChild(document.createTextNode(` ${t.title} (${PRIORITY_POINTS[t.priority]} pts)`));
      listDiv.appendChild(label);
      listDiv.appendChild(document.createElement('br'));
    });
    
    return new Promise((resolve) => {
      const confirmBtn = document.getElementById('confirmTradeOff');
      const cancelBtn = document.getElementById('cancelTradeOff');
      const closeModal = () => {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
      };
      const confirmHandler = () => {
        const selected = Array.from(document.querySelectorAll('#tradeOffList input:checked')).map(cb => cb.value);
        let savedPoints = 0;
        selected.forEach(id => {
          const task = tasks.find(t => t.id === id);
          if (task) {
            savedPoints += PRIORITY_POINTS[task.priority];
            // Aplazar: mover a mañana, incrementar counter, quitar fecha original
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            task.date = tomorrow.toISOString().slice(0,10);
            task.counter = (task.counter || 0) + 1;
            task.status = 'todo';
            task.priority = 'aplazable';
          }
        });
        if (savedPoints >= requiredPoints) {
          // ejecutar la acción original
          originalAction();
          resolve(true);
        } else {
          alert(`Solo liberaste ${savedPoints} puntos, pero necesitas ${requiredPoints}. No se realizó el cambio.`);
          resolve(false);
        }
        closeModal();
      };
      const cancelHandler = () => {
        closeModal();
        resolve(false);
      };
      confirmBtn.addEventListener('click', confirmHandler);
      cancelBtn.addEventListener('click', cancelHandler);
      modal.style.display = 'flex';
    });
  }

  // Función genérica para verificar trade-off antes de crear/editar tarea
  async function withTradeOffCheck(date, taskPoints, action, taskId = null) {
    const projected = calculateProjectedLoad(date, taskPoints, taskId);
    if (projected > currentCp) {
      const required = projected - currentCp;
      const success = await showTradeOffModal(date, required, action, taskId);
      return success;
    } else {
      action();
      return true;
    }
  }

  // ---------------------- PROCESAR APLAZABLES VENCIDAS ----------------------
  async function processAplazableExpiry() {
    const now = new Date();
    const expiredTasks = tasks.filter(t => t.priority === 'aplazable' && !t.date && t.lastReviewed) ||
                         tasks.filter(t => t.priority === 'aplazable' && !t.date && (!t.lastReviewed || (now - new Date(t.lastReviewed) > 14 * 86400000)));
    if (expiredTasks.length === 0) return;
    // Mostrar modal con lista para decisión
    let modal = document.getElementById('expiryModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'expiryModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h3>📅 Tareas aplazables antiguas</h3>
          <p>Algunas tareas llevan más de 14 días sin revisión. Decide su futuro:</p>
          <div id="expiryList"></div>
          <button id="saveExpiryDecisions">Guardar decisiones</button>
        </div>
      `;
      document.body.appendChild(modal);
    }
    const listDiv = document.getElementById('expiryList');
    listDiv.innerHTML = '';
    expiredTasks.forEach(t => {
      const div = document.createElement('div');
      div.innerHTML = `
        <strong>${t.title}</strong> (aplazada ${t.counter || 0} veces)
        <select id="decide-${t.id}">
          <option value="keep">Mantener 2 semanas más</option>
          <option value="upgrade">Subir a necesaria</option>
          <option value="delete">Borrar definitivamente</option>
        </select>
      `;
      listDiv.appendChild(div);
    });
    modal.style.display = 'flex';
    return new Promise((resolve) => {
      const saveBtn = document.getElementById('saveExpiryDecisions');
      saveBtn.onclick = () => {
        expiredTasks.forEach(t => {
          const select = document.getElementById(`decide-${t.id}`);
          const decision = select.value;
          if (decision === 'upgrade') {
            t.priority = 'necesaria';
            t.lastReviewed = new Date().toISOString();
            showToastMessage(`"${t.title}" ha sido promovida a necesaria.`, 5);
          } else if (decision === 'delete') {
            tasks = tasks.filter(task => task.id !== t.id);
          } else {
            t.lastReviewed = new Date().toISOString();
          }
        });
        modal.style.display = 'none';
        saveToLocalStorage();
        renderAll();
        resolve();
      };
    });
  }

  // ---------------------- AUDITORÍA MENSUAL ----------------------
  async function runMonthlyAudit() {
    const newMonth = getCurrentMonth();
    if (currentMonth === newMonth) return;
    // Calcular ter e ip del mes anterior
    const monthTasks = tasks.filter(t => t.date && t.date.startsWith(currentMonth));
    let totalPointsPlanned = 0;
    let totalPointsDone = 0;
    let totalPointsAplazados = 0;
    monthTasks.forEach(t => {
      const pts = PRIORITY_POINTS[t.priority];
      totalPointsPlanned += pts;
      if (t.status === 'done') totalPointsDone += pts;
      if (t.counter && t.counter > 0) totalPointsAplazados += pts * t.counter;
    });
    const ter = totalPointsPlanned === 0 ? 100 : (totalPointsDone / totalPointsPlanned) * 100;
    const ip = totalPointsDone - totalPointsAplazados;
    
    if (ter < 40) {
      // Reducir CP
      currentCp = Math.max(MIN_CP, currentCp - 2);
      // Convertir tareas no hechas (status !== done) a aplazables sin fecha
      tasks.forEach(t => {
        if (t.status !== 'done') {
          t.priority = 'aplazable';
          t.date = '';
          t.counter = (t.counter || 0) + 1;
          t.status = 'todo';
        }
      });
      // Mostrar modal de declaración honesta
      const declaration = await showHonestyModal();
      historicalData.push({ month: currentMonth, ter, ip, declaration });
    } else {
      historicalData.push({ month: currentMonth, ter, ip, declaration: "Sin declaración" });
    }
    
    // Procesar histórico semestral (cada 6 meses)
    if (historicalData.length >= 6) {
      const lastSix = historicalData.slice(-6);
      const avgTer = lastSix.reduce((s, d) => s + d.ter, 0) / 6;
      const avgIp = lastSix.reduce((s, d) => s + d.ip, 0) / 6;
      let newCp = (avgIp < 10) ? 11 : 15;
      currentCp = Math.min(MAX_CP, Math.max(MIN_CP, newCp));
      semestersArchive.push({ months: lastSix.map(d => d.month), avgTer, avgIp, declarations: lastSix.map(d => d.declaration) });
      historicalData = []; // reiniciar
      showToastMessage(`📊 Resumen semestral: capacidad ajustada a ${currentCp}. Revisa tu línea de tiempo emotiva.`, 30);
    }
    
    currentMonth = newMonth;
    dayPerfectCount = 0;
    saveToLocalStorage();
    renderAll();
  }
  
  function showHonestyModal() {
    return new Promise((resolve) => {
      let modal = document.getElementById('honestyModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'honestyModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <h3>🧘 Reflexión mensual</h3>
            <p>Este mes tu eficiencia fue baja (TER < 40%). Tómate un momento para escribir una declaración honesta sobre lo que pasó:</p>
            <textarea id="honestMessage" rows="4" cols="40"></textarea>
            <button id="submitHonesty">Aceptar y continuar</button>
          </div>
        `;
        document.body.appendChild(modal);
      }
      modal.style.display = 'flex';
      const submitBtn = document.getElementById('submitHonesty');
      const textarea = document.getElementById('honestMessage');
      const handler = () => {
        const msg = textarea.value.trim() || "Sin palabras esta vez.";
        modal.style.display = 'none';
        submitBtn.removeEventListener('click', handler);
        resolve(msg);
      };
      submitBtn.addEventListener('click', handler);
    });
  }

  // ---------------------- RENDER GENERAL ----------------------
  function renderAll() {
    updateOverloadAlert();
    updatePerformanceBanner();
    updateUIStats();
    renderKanban();
    renderCalendar();   // función existente
    renderEisenhower(); // existente
  }
  
  // Ejemplo de funciones que debes tener (adaptar según tu HTML)
  function renderKanban() {
    const todoDiv = document.getElementById('kanbanTodo');
    const progressDiv = document.getElementById('kanbanProgress');
    const doneDiv = document.getElementById('kanbanDone');
    if (!todoDiv) return;
    todoDiv.innerHTML = tasks.filter(t => t.status === 'todo').map(taskToHtml).join('');
    progressDiv.innerHTML = tasks.filter(t => t.status === 'progress').map(taskToHtml).join('');
    doneDiv.innerHTML = tasks.filter(t => t.status === 'done').map(taskToHtml).join('');
  }
  
  function taskToHtml(task) {
    return `<div class="task-card" data-id="${task.id}">
      <strong>${task.title}</strong> (${task.priority}) ${task.date ? `📅 ${task.date}` : ''}
      <button class="complete-task">✔️</button>
      <button class="edit-task">✏️</button>
      <button class="delete-task">🗑️</button>
    </div>`;
  }
  
  // ---------------------- ACCIONES PRINCIPALES CON TRADE-OFF ----------------------
  async function createTaskWithTradeOff(newTask) {
    const points = PRIORITY_POINTS[newTask.priority];
    const action = () => {
      tasks.push({ ...newTask, id: Date.now().toString(), status: 'todo', counter: 0, lastReviewed: new Date().toISOString() });
      saveToLocalStorage();
      renderAll();
      showToastMessage(`Tarea "${newTask.title}" añadida.`, 0);
    };
    const success = await withTradeOffCheck(newTask.date, points, action);
    if (!success) showToastMessage("Operación cancelada por sobrecarga.", 0);
  }
  
  async function editTaskWithTradeOff(taskId, newDate, newPriority, newTitle) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const oldPoints = PRIORITY_POINTS[task.priority];
    const newPoints = PRIORITY_POINTS[newPriority];
    const pointsDelta = newPoints - oldPoints;
    if (pointsDelta > 0) {
      const action = () => {
        task.title = newTitle;
        task.priority = newPriority;
        task.date = newDate;
        saveToLocalStorage();
        renderAll();
        showToastMessage(`Tarea "${task.title}" actualizada.`, 0);
      };
      const success = await withTradeOffCheck(newDate, pointsDelta, action, taskId);
      if (!success) showToastMessage("Edición cancelada por sobrecarga.", 0);
    } else {
      task.title = newTitle;
      task.priority = newPriority;
      task.date = newDate;
      saveToLocalStorage();
      renderAll();
    }
  }
  
  async function completeTaskHandler(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === 'done') return;
    const today = getTodayStr();
    const wasOverloaded = calculateDailyLoad(today) > currentCp;
    task.status = 'done';
    const remainingTasksToday = tasks.filter(t => t.date === today && t.status !== 'done').length;
    const isLastTask = (remainingTasksToday === 0);
    saveToLocalStorage();
    await awardTaskComplete(task, wasOverloaded, isLastTask);
    renderAll();
  }
  
  // ---------------------- INICIALIZACIÓN Y EVENTOS ----------------------
  window.addEventListener('DOMContentLoaded', async () => {
    await loadFromLocalStorage();
    await runMonthlyAudit();   // detectar cambio de mes
    await processAplazableExpiry();
    // Enlazar eventos dinámicos (delegación)
    document.body.addEventListener('click', (e) => {
      if (e.target.classList.contains('complete-task')) {
        const card = e.target.closest('.task-card');
        if (card) completeTaskHandler(card.dataset.id);
      }
      // ... otros eventos (editar, eliminar) análogos
    });
    // Comprobar cambio de día al inicio y cada hora
    setInterval(() => {
      if (lastUsedDate !== getTodayStr()) {
        lastUsedDate = getTodayStr();
        renderAll();
        processAplazableExpiry();
      }
    }, 3600000);
  });
</script>