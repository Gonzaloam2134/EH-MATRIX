/* Matriz de Eisenhower — lógica de la app (sin frameworks). */

(function () {
  'use strict';

  // ---------- Constantes ----------
  const QUADRANTS = {
    1: { key: 1, urgent: true, important: true, title: 'Hacer ahora', action: 'hacer' },
    2: { key: 2, urgent: false, important: true, title: 'Planificar', action: 'planificar' },
    3: { key: 3, urgent: true, important: false, title: 'Delegar', action: 'delegar' },
    4: { key: 4, urgent: false, important: false, title: 'Eliminar', action: 'eliminar' },
  };
  const STALE_DAYS_Q3 = 3;
  const DUE_SOON_HOURS = 48;
  const NOTIFY_WINDOW_HOURS = 24;
  const MS_DAY = 24 * 60 * 60 * 1000;

  // ---------- Estado ----------
  let state = Storage.load();

  function persist() {
    Storage.save(state);
  }

  function quadrantOf(task) {
    if (task.urgent && task.important) return 1;
    if (!task.urgent && task.important) return 2;
    if (task.urgent && !task.important) return 3;
    return 4;
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  // ---------- CRUD de tareas ----------
  function createTask(data) {
    const task = {
      id: uid('t'),
      title: data.title.trim(),
      description: (data.description || '').trim(),
      dueDate: data.dueDate || null,
      urgent: !!data.urgent,
      important: !!data.important,
      completed: false,
      completedAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      subtasks: data.subtasks || [],
      quadrantEnteredAt: nowISO(),
      notified: false,
    };
    state.tasks.push(task);
    persist();
    return task;
  }

  function updateTask(id, patch) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    const prevQuadrant = quadrantOf(task);
    Object.assign(task, patch, { updatedAt: nowISO() });
    if (quadrantOf(task) !== prevQuadrant) {
      task.quadrantEnteredAt = nowISO();
      task.notified = false;
    }
    persist();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    persist();
  }

  function toggleTaskComplete(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    task.completedAt = task.completed ? nowISO() : null;
    task.updatedAt = nowISO();
    persist();
  }

  function reclassifyTask(id, urgent, important) {
    updateTask(id, { urgent, important });
  }

  function addSubtaskToTask(id, title) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task || !title.trim()) return;
    task.subtasks.push({ id: uid('s'), title: title.trim(), completed: false });
    task.updatedAt = nowISO();
    persist();
  }

  function toggleSubtask(taskId, subId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const sub = task.subtasks.find((s) => s.id === subId);
    if (!sub) return;
    sub.completed = !sub.completed;
    task.updatedAt = nowISO();
    persist();
  }

  function removeSubtask(taskId, subId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.subtasks = task.subtasks.filter((s) => s.id !== subId);
    task.updatedAt = nowISO();
    persist();
  }

  // ---------- Helpers de fecha ----------
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  function dueBadgeInfo(task) {
    if (!task.dueDate || task.completed) return null;
    const due = new Date(task.dueDate + 'T23:59:59');
    const diffH = (due - new Date()) / (1000 * 60 * 60);
    if (diffH < 0) return { cls: 'badge--due-overdue', text: `Vencida ${formatDate(task.dueDate)}` };
    if (diffH <= 24) return { cls: 'badge--due-today', text: `Hoy ${formatDate(task.dueDate)}` };
    if (diffH <= DUE_SOON_HOURS) return { cls: 'badge--due-soon', text: `Pronto ${formatDate(task.dueDate)}` };
    return { cls: '', text: formatDate(task.dueDate) };
  }

  function daysSince(iso) {
    return (Date.now() - new Date(iso).getTime()) / MS_DAY;
  }

  function isStaleQ3(task) {
    return quadrantOf(task) === 3 && !task.completed && daysSince(task.quadrantEnteredAt) >= STALE_DAYS_Q3;
  }

  // ---------- Render ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function taskCardNode(task) {
    const li = document.createElement('li');
    li.className = 'task-card' + (task.completed ? ' completed' : '');
    li.draggable = true;
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', 'Marcar como completada');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleTaskComplete(task.id);
      render();
    });

    const main = document.createElement('div');
    main.className = 'task-main';
    main.addEventListener('click', () => openTaskModal(task.id));

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;
    main.appendChild(title);

    if (task.description) {
      const desc = document.createElement('div');
      desc.className = 'task-desc';
      desc.textContent = task.description;
      main.appendChild(desc);
    }

    const badges = document.createElement('div');
    badges.className = 'task-badges';

    const due = dueBadgeInfo(task);
    if (due) {
      const b = document.createElement('span');
      b.className = 'badge ' + due.cls;
      b.textContent = '📅 ' + due.text;
      badges.appendChild(b);
    }

    if (task.subtasks.length) {
      const done = task.subtasks.filter((s) => s.completed).length;
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = `☑ ${done}/${task.subtasks.length}`;
      badges.appendChild(b);
    }

    if (isStaleQ3(task)) {
      const b = document.createElement('span');
      b.className = 'badge badge--stale';
      b.textContent = `⏳ ${Math.floor(daysSince(task.quadrantEnteredAt))}d sin delegar`;
      badges.appendChild(b);
    }

    if (badges.childElementCount) main.appendChild(badges);

    li.appendChild(checkbox);
    li.appendChild(main);

    li.addEventListener('dragstart', (e) => {
      li.classList.add('dragging');
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));

    return li;
  }

  function renderQuadrants() {
    for (const q of Object.values(QUADRANTS)) {
      const tasks = state.tasks.filter((t) => quadrantOf(t) === q.key);
      const active = tasks.filter((t) => !t.completed);
      const completed = tasks.filter((t) => t.completed);

      const list = $(`#list-${q.key}`);
      list.innerHTML = '';
      active
        .slice()
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
        .forEach((t) => list.appendChild(taskCardNode(t)));

      const completedList = $(`#completed-list-${q.key}`);
      completedList.innerHTML = '';
      completed
        .slice()
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
        .forEach((t) => completedList.appendChild(taskCardNode(t)));

      $(`#count-${q.key}`).textContent = active.length;
      $(`#nav-count-${q.key}`).textContent = active.length;
      $(`#completed-count-${q.key}`).textContent = completed.length;
      $(`#completed-wrap-${q.key}`).hidden = completed.length === 0;
    }
  }

  function renderCoaching() {
    const activeByQ = {};
    for (const k of [1, 2, 3, 4]) {
      activeByQ[k] = state.tasks.filter((t) => quadrantOf(t) === k && !t.completed);
    }

    // Cuadrante 1: sobrecarga
    const q1Section = $('#q1');
    const q1Banner = $('#banner-1');
    const overloaded = activeByQ[1].length > state.settings.overloadThreshold;
    q1Section.classList.toggle('quadrant--overload', overloaded);
    if (overloaded) {
      q1Banner.hidden = false;
      q1Banner.textContent = `⚠️ Sobrecarga: ${activeByQ[1].length} tareas urgentes e importantes acumuladas. Es señal de que se está viviendo "en modo bombero" — revisá si algunas podrían haberse anticipado en el cuadrante 2.`;
    } else {
      q1Banner.hidden = true;
    }

    // Cuadrante 2: recordatorio si está vacío o con pocas tareas
    const q2Banner = $('#banner-2');
    if (activeByQ[2].length === 0) {
      q2Banner.hidden = false;
      q2Banner.textContent = '🧭 Vacío: aquí es donde debería vivir la mayor parte de tu trabajo estratégico (planificación, prevención, objetivos a largo plazo). Sumá algo.';
    } else if (activeByQ[2].length < activeByQ[1].length) {
      q2Banner.hidden = false;
      q2Banner.textContent = '🧭 Tenés más tareas urgentes que estratégicas. Dedicar tiempo acá reduce las crisis futuras.';
    } else {
      q2Banner.hidden = true;
    }

    // Cuadrante 3: tareas estancadas sin delegar
    const q3Banner = $('#banner-3');
    const stale = activeByQ[3].filter(isStaleQ3);
    if (stale.length > 0) {
      q3Banner.hidden = false;
      q3Banner.textContent = `🤝 ${stale.length} tarea(s) llevan ${STALE_DAYS_Q3}+ días sin delegarse. Revisalas: ¿se pueden delegar, reclasificar o descartar?`;
    } else {
      q3Banner.hidden = true;
    }

    // Cuadrante 4: sin coaching especial, solo el label ya orienta a "eliminar"
    $('#banner-4').hidden = true;
  }

  function render() {
    renderQuadrants();
    renderCoaching();
  }

  // ---------- Modal de tarea ----------
  let draftSubtasks = [];
  let draftUrgent = null;
  let draftImportant = null;

  function updateQuadrantPreview() {
    const preview = $('#quadrant-preview');
    preview.className = 'quadrant-preview';
    if (draftUrgent === null || draftImportant === null) {
      preview.textContent = 'Elegí urgencia e importancia para ver el cuadrante';
      return;
    }
    const q = quadrantOf({ urgent: draftUrgent, important: draftImportant });
    preview.classList.add('is-set', `qp--${q}`);
    const icons = { 1: '🔥', 2: '🧭', 3: '🤝', 4: '🗑️' };
    preview.textContent = `${icons[q]} Cuadrante ${q}: ${QUADRANTS[q].title}`;
  }

  function setAxisToggle(axis, value) {
    if (axis === 'urgent') draftUrgent = value;
    else draftImportant = value;
    $$(`#${axis === 'urgent' ? 'urgent-toggle' : 'important-toggle'} .toggle-btn`).forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.value === String(value));
    });
    updateQuadrantPreview();
  }

  function renderDraftSubtasks() {
    const list = $('#subtask-list');
    list.innerHTML = '';
    draftSubtasks.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'subtask-item' + (s.completed ? ' completed' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = s.completed;
      cb.addEventListener('change', () => {
        s.completed = cb.checked;
        li.classList.toggle('completed', s.completed);
      });
      const span = document.createElement('span');
      span.textContent = s.title;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'subtask-remove';
      rm.textContent = '✕';
      rm.addEventListener('click', () => {
        draftSubtasks = draftSubtasks.filter((x) => x.id !== s.id);
        renderDraftSubtasks();
      });
      li.append(cb, span, rm);
      list.appendChild(li);
    });
  }

  function openTaskModal(taskId) {
    const overlay = $('#task-modal-overlay');
    const form = $('#task-form');
    form.reset();
    $('#task-id').value = taskId || '';
    $('#task-delete-btn').hidden = !taskId;

    if (taskId) {
      const task = state.tasks.find((t) => t.id === taskId);
      $('#task-modal-title').textContent = 'Editar tarea';
      $('#task-title').value = task.title;
      $('#task-desc').value = task.description || '';
      $('#task-due').value = task.dueDate || '';
      draftSubtasks = task.subtasks.map((s) => ({ ...s }));
      setAxisToggle('urgent', task.urgent);
      setAxisToggle('important', task.important);
    } else {
      $('#task-modal-title').textContent = 'Nueva tarea';
      draftSubtasks = [];
      draftUrgent = null;
      draftImportant = null;
      $$('.toggle-btn').forEach((b) => b.classList.remove('selected'));
      updateQuadrantPreview();
    }
    renderDraftSubtasks();
    overlay.hidden = false;
    setTimeout(() => $('#task-title').focus(), 0);
  }

  function closeTaskModal() {
    $('#task-modal-overlay').hidden = true;
  }

  function handleTaskFormSubmit(e) {
    e.preventDefault();
    if (draftUrgent === null || draftImportant === null) {
      showToast('Elegí urgencia e importancia antes de guardar.');
      return;
    }
    const id = $('#task-id').value;
    const data = {
      title: $('#task-title').value,
      description: $('#task-desc').value,
      dueDate: $('#task-due').value || null,
      urgent: draftUrgent,
      important: draftImportant,
      subtasks: draftSubtasks,
    };
    if (!data.title.trim()) return;

    if (id) {
      updateTask(id, data);
    } else {
      createTask(data);
    }
    closeTaskModal();
    render();
  }

  function handleTaskDelete() {
    const id = $('#task-id').value;
    if (!id) return;
    if (confirm('¿Eliminar esta tarea? No se puede deshacer.')) {
      deleteTask(id);
      closeTaskModal();
      render();
    }
  }

  // ---------- Drag & drop entre cuadrantes ----------
  function setupDragAndDrop() {
    $$('.task-list').forEach((list) => {
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.closest('.quadrant').classList.add('drag-over');
      });
      list.addEventListener('dragleave', () => {
        list.closest('.quadrant').classList.remove('drag-over');
      });
      list.addEventListener('drop', (e) => {
        e.preventDefault();
        list.closest('.quadrant').classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain');
        const q = QUADRANTS[Number(list.dataset.quadrant)];
        if (taskId && q) {
          reclassifyTask(taskId, q.urgent, q.important);
          render();
        }
      });
    });
  }

  // ---------- Reporte semanal ----------
  function openReportModal() {
    const weekAgo = Date.now() - 7 * MS_DAY;
    const completedThisWeek = state.tasks.filter(
      (t) => t.completed && t.completedAt && new Date(t.completedAt).getTime() >= weekAgo
    );

    const body = $('#report-body');
    body.innerHTML = '';

    if (completedThisWeek.length === 0) {
      const p = document.createElement('p');
      p.className = 'report-summary';
      p.textContent = 'Todavía no completaste tareas en los últimos 7 días.';
      body.appendChild(p);
    } else {
      const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
      completedThisWeek.forEach((t) => counts[quadrantOf(t)]++);
      const total = completedThisWeek.length;

      const bars = document.createElement('div');
      bars.className = 'report-bars';
      for (const k of [1, 2, 3, 4]) {
        const pct = Math.round((counts[k] / total) * 100);
        const row = document.createElement('div');
        row.className = 'report-bar-row';
        row.innerHTML = `
          <div class="report-bar-label"><span>${QUADRANTS[k].title}</span><span>${counts[k]} (${pct}%)</span></div>
          <div class="report-bar-track"><div class="report-bar-fill report-bar-fill--${k}" style="width:${pct}%"></div></div>
        `;
        bars.appendChild(row);
      }
      body.appendChild(bars);

      const q1Pct = Math.round((counts[1] / total) * 100);
      const q2Pct = Math.round((counts[2] / total) * 100);
      const summary = document.createElement('p');
      summary.className = 'report-summary';
      if (q1Pct >= 50) {
        summary.textContent = `🔥 Modo bombero: el ${q1Pct}% de lo que completaste esta semana fue "urgente + importante". Tratá de anticipar más trabajo en el cuadrante 2 (Planificar) para reducir las crisis.`;
      } else if (q2Pct === Math.max(q1Pct, q2Pct, Math.round((counts[3] / total) * 100), Math.round((counts[4] / total) * 100))) {
        summary.textContent = `✅ Buen equilibrio: el ${q2Pct}% de lo completado fue trabajo estratégico (cuadrante 2). Así se gestiona bien el tiempo.`;
      } else {
        summary.textContent = `Distribución de la semana: Hacer ${q1Pct}% · Planificar ${q2Pct}% · Delegar ${Math.round((counts[3] / total) * 100)}% · Eliminar ${Math.round((counts[4] / total) * 100)}%.`;
      }
      body.appendChild(summary);
    }

    $('#report-modal-overlay').hidden = false;
  }

  function closeReportModal() {
    $('#report-modal-overlay').hidden = true;
  }

  // ---------- Toasts ----------
  function showToast(msg) {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ---------- Tema ----------
  function applyTheme() {
    const root = document.documentElement;
    if (state.settings.theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', state.settings.theme);
    }
  }

  function cycleTheme() {
    const order = ['system', 'light', 'dark'];
    const idx = order.indexOf(state.settings.theme);
    state.settings.theme = order[(idx + 1) % order.length];
    applyTheme();
    persist();
    showToast(`Tema: ${state.settings.theme}`);
  }

  // ---------- Notificaciones ----------
  function toggleNotifications() {
    if (!('Notification' in window)) {
      showToast('Este navegador no soporta notificaciones.');
      return;
    }
    if (state.settings.notificationsEnabled) {
      state.settings.notificationsEnabled = false;
      persist();
      $('#btn-notify').classList.remove('active');
      showToast('Notificaciones desactivadas.');
      return;
    }
    Notification.requestPermission().then((perm) => {
      state.settings.notificationsEnabled = perm === 'granted';
      persist();
      $('#btn-notify').classList.toggle('active', state.settings.notificationsEnabled);
      showToast(perm === 'granted' ? 'Notificaciones activadas.' : 'Permiso de notificaciones denegado.');
    });
  }

  function checkDueNotifications() {
    if (!state.settings.notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now();
    let changed = false;
    state.tasks.forEach((t) => {
      if (t.completed || !t.dueDate || t.notified) return;
      const due = new Date(t.dueDate + 'T23:59:59').getTime();
      const diffH = (due - now) / (1000 * 60 * 60);
      if (diffH <= NOTIFY_WINDOW_HOURS && diffH >= -6) {
        new Notification('Vence pronto: ' + t.title, {
          body: `Cuadrante: ${QUADRANTS[quadrantOf(t)].title}`,
          icon: 'icons/icon-192.png',
        });
        t.notified = true;
        changed = true;
      }
    });
    if (changed) persist();
  }

  // ---------- Export / Import ----------
  function exportJSON() {
    const blob = new Blob([Storage.exportJSON(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `eh-matrix-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = Storage.importJSON(reader.result);
        if (!confirm('Esto reemplaza todas tus tareas actuales por las del archivo. ¿Continuar?')) return;
        state = imported;
        persist();
        applyTheme();
        render();
        showToast('Backup importado correctamente.');
      } catch (err) {
        showToast('No se pudo importar: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------- Atajos de teclado ----------
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        closeTaskModal();
        closeReportModal();
        return;
      }
      if (typing) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openTaskModal(null);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        openReportModal();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        cycleTheme();
      }
    });
  }

  // ---------- Instalación PWA ----------
  function setupInstallPrompt() {
    let deferredPrompt = null;
    const btn = $('#install-btn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      btn.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      btn.hidden = true;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
    window.addEventListener('appinstalled', () => {
      btn.hidden = true;
    });
  }

  // ---------- Inicialización ----------
  function setupEventListeners() {
    $('#btn-new-task').addEventListener('click', () => openTaskModal(null));
    $('#task-modal-close').addEventListener('click', closeTaskModal);
    $('#task-cancel-btn').addEventListener('click', closeTaskModal);
    $('#task-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'task-modal-overlay') closeTaskModal();
    });
    $('#task-form').addEventListener('submit', handleTaskFormSubmit);
    $('#task-delete-btn').addEventListener('click', handleTaskDelete);

    $$('#urgent-toggle .toggle-btn').forEach((btn) =>
      btn.addEventListener('click', () => setAxisToggle('urgent', btn.dataset.value === 'true'))
    );
    $$('#important-toggle .toggle-btn').forEach((btn) =>
      btn.addEventListener('click', () => setAxisToggle('important', btn.dataset.value === 'true'))
    );

    $('#subtask-add-btn').addEventListener('click', () => {
      const input = $('#subtask-input');
      if (!input.value.trim()) return;
      draftSubtasks.push({ id: uid('s'), title: input.value.trim(), completed: false });
      input.value = '';
      renderDraftSubtasks();
    });
    $('#subtask-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#subtask-add-btn').click();
      }
    });

    $('#btn-report').addEventListener('click', openReportModal);
    $('#report-modal-close').addEventListener('click', closeReportModal);
    $('#report-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'report-modal-overlay') closeReportModal();
    });

    $('#btn-theme').addEventListener('click', cycleTheme);
    $('#btn-notify').addEventListener('click', toggleNotifications);
    $('#btn-export').addEventListener('click', exportJSON);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importJSON(file);
      e.target.value = '';
    });
  }

  function init() {
    applyTheme();
    if (state.settings.notificationsEnabled) $('#btn-notify').classList.add('active');
    setupEventListeners();
    setupDragAndDrop();
    setupKeyboardShortcuts();
    setupInstallPrompt();
    render();
    checkDueNotifications();
    setInterval(checkDueNotifications, 5 * 60 * 1000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW error', err));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
