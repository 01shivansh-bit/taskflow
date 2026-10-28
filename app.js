// --- State & DOM References ---
let todos = [];
let currentFilter = 'all';

const todoList = document.getElementById('todoList');
const addTodoForm = document.getElementById('addTodoForm');
const todoInput = document.getElementById('todoInput');
const dueDateInput = document.getElementById('dueDateInput');
const emptyState = document.getElementById('emptyState');
const emptyTitle = document.getElementById('emptyTitle');
const emptySubtext = document.getElementById('emptySubtext');

// Statistics & Health Bar elements
const statValTotal = document.getElementById('statValTotal');
const statValActive = document.getElementById('statValActive');
const statValOverdue = document.getElementById('statValOverdue');
const statValCompleted = document.getElementById('statValCompleted');
const statCardOverdue = document.getElementById('statCardOverdue');
const statCards = document.querySelectorAll('.stat-card');

const progressStats = document.getElementById('progressStats');
const segCompleted = document.getElementById('segCompleted');
const segActive = document.getElementById('segActive');
const segOverdue = document.getElementById('segOverdue');

// Filter Bar elements
const countAll = document.getElementById('countAll');
const countActive = document.getElementById('countActive');
const countOverdue = document.getElementById('countOverdue');
const countCompleted = document.getElementById('countCompleted');
const filterBtnOverdue = document.querySelector('.filter-btn-overdue');
const filterBtns = document.querySelectorAll('.filter-btn');

const itemsLeftCount = document.getElementById('itemsLeftCount');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const themeToggle = document.getElementById('themeToggle');
const currentDateEl = document.getElementById('currentDate');
const toastContainer = document.getElementById('toastContainer');

// --- Initialization ---
function init() {
  displayTodayDate();
  setupTheme();
  setupCharacterCounter();
  setupGoogleDriveUI();
  setupEventListeners();
  loadTodos();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Character counter below the task title input
function setupCharacterCounter() {
  if (!todoInput) return;
  const titleWrapper = todoInput.closest('.title-wrapper');
  if (!titleWrapper) return;

  // Create a container column so title input and counter stack vertically
  const titleCol = document.createElement('div');
  titleCol.className = 'title-col-container';
  titleCol.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 0;';

  // Ensure form flex container aligns items to flex-start
  const formInputs = titleWrapper.parentElement;
  if (formInputs) {
    formInputs.style.alignItems = 'flex-start';
  }
  const btnAdd = document.getElementById('btnAdd');
  if (btnAdd) {
    btnAdd.style.alignSelf = 'flex-start';
  }

  // Insert titleCol before titleWrapper and place titleWrapper inside it
  titleWrapper.parentNode.insertBefore(titleCol, titleWrapper);
  titleCol.appendChild(titleWrapper);

  // Create the character counter element
  const charCounter = document.createElement('div');
  charCounter.id = 'charCounter';
  charCounter.setAttribute('aria-live', 'polite');
  charCounter.style.cssText = `
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
    margin-top: 5px;
    padding-left: 2px;
    font-weight: 500;
    line-height: 1.2;
    transition: color 0.15s ease, font-weight 0.15s ease;
  `;

  function updateCharCount() {
    const len = todoInput.value.length;
    charCounter.textContent = `${len} / 50 characters`;
    if (len > 50) {
      charCounter.style.color = 'var(--danger, #ef4444)';
      charCounter.style.fontWeight = '600';
    } else {
      charCounter.style.color = 'var(--text-muted, #94a3b8)';
      charCounter.style.fontWeight = '500';
    }
  }

  titleCol.appendChild(charCounter);
  todoInput.addEventListener('input', updateCharCount);
  updateCharCount();
}

// Display today's date formatted nicely
function displayTodayDate() {
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  const today = new Date().toLocaleDateString(undefined, options);
  currentDateEl.textContent = today;
}

// Theme handling (Default: Pure Black with Red Accents)
function setupTheme() {
  let savedTheme = localStorage.getItem('theme_v2');
  if (!savedTheme) {
    savedTheme = 'dark';
    localStorage.setItem('theme_v2', 'dark');
  }

  document.documentElement.setAttribute('data-theme', savedTheme);

  themeToggle.addEventListener('click', () => {
    const active = document.documentElement.getAttribute('data-theme');
    const next = active === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme_v2', next);
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Add task form submit
  addTodoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = todoInput.value.trim();
    const dueDate = dueDateInput.value ? dueDateInput.value : null;
    if (!title) return;
    await createTodo(title, dueDate);
  });

  // Filter button clicks (bottom tabs)
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setFilter(btn.dataset.filter);
    });
  });

  // Stat card clicks (top grid)
  statCards.forEach(card => {
    card.addEventListener('click', () => {
      setFilter(card.dataset.filter);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setFilter(card.dataset.filter);
      }
    });
  });

  // Clear completed button
  clearCompletedBtn.addEventListener('click', async () => {
    await clearCompletedTodos();
  });
}

// Synchronized filter setter for both top stat cards and bottom tabs
function setFilter(filterName) {
  currentFilter = filterName;

  // Sync stat cards active state
  statCards.forEach(card => {
    card.classList.toggle('active', card.dataset.filter === filterName);
  });

  // Sync bottom filter tabs active state
  filterBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filterName);
  });

  render();
}

// --- Persistence (Local Storage & API Hybrid) ---
const LOCAL_STORAGE_KEY = 'taskflow_todos_local';

function getLocalTodos() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalTodos(todosList) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(todosList));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

// --- API & State Requests ---

// Fetch all todos
async function loadTodos() {
  // 1. Instant load from localStorage
  const cached = getLocalTodos();
  if (cached && cached.length > 0) {
    todos = cached;
    render();
  }

  // 2. Try fetching from server if running
  try {
    const res = await fetch('/api/todos');
    if (res.ok) {
      const serverTodos = await res.json();
      if (Array.isArray(serverTodos) && serverTodos.length > 0) {
        todos = serverTodos;
        saveLocalTodos(todos);
        render();
      }
    }
  } catch (err) {
    // Expected on static hosting (GitHub Pages) or offline
    console.log('Operating in standalone / static mode (using local cache & Drive).');
  }

  // 3. If Google Drive is connected, sync remote changes
  if (window.gdriveSync && window.gdriveSync.isConnected()) {
    try {
      const merged = await window.gdriveSync.sync(todos);
      if (merged) {
        todos = merged;
        saveLocalTodos(todos);
        render();
      }
    } catch (gerr) {
      console.warn('Google Drive sync on load warning:', gerr);
    }
  }
}

// Create a new todo
async function createTodo(title, dueDate = null) {
  const newTodo = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    title: title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
    dueDate: (dueDate && typeof dueDate === 'string' && dueDate.trim()) ? dueDate.trim() : null
  };

  // Immediate local update
  todos.unshift(newTodo);
  saveLocalTodos(todos);
  todoInput.value = '';
  dueDateInput.value = '';
  todoInput.dispatchEvent(new Event('input'));
  render();
  showToast('Task added successfully', 'success');

  // Sync to backend server if available
  fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newTodo.title, dueDate: newTodo.dueDate })
  }).catch(() => {/* Standalone mode */});

  // Trigger debounced Google Drive sync
  window.gdriveSync?.debouncedSync(todos);
}

// Toggle complete status
async function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  const nextState = !todo.completed;
  todo.completed = nextState;
  saveLocalTodos(todos);
  render();
  showToast(nextState ? 'Task marked as completed' : 'Task marked as active', 'info');

  // Sync to backend if available
  fetch(`/api/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: nextState })
  }).catch(() => {/* Standalone mode */});

  // Sync to Google Drive
  window.gdriveSync?.debouncedSync(todos);
}

// Delete a todo
async function deleteTodo(id) {
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return;

  todos.splice(index, 1);
  saveLocalTodos(todos);
  render();
  showToast('Task deleted', 'danger');

  // Sync to backend if available
  fetch(`/api/todos/${id}`, {
    method: 'DELETE'
  }).catch(() => {/* Standalone mode */});

  // Sync to Google Drive
  window.gdriveSync?.debouncedSync(todos);
}

// Clear all completed todos
async function clearCompletedTodos() {
  const completedCount = todos.filter(t => t.completed).length;
  if (completedCount === 0) return;

  todos = todos.filter(t => !t.completed);
  saveLocalTodos(todos);
  render();
  showToast(`Cleared ${completedCount} completed task(s)`, 'info');

  // Sync to backend if available
  fetch('/api/todos?completed=true', {
    method: 'DELETE'
  }).catch(() => {/* Standalone mode */});

  // Sync to Google Drive
  window.gdriveSync?.debouncedSync(todos);
}

// --- Rendering ---

function render() {
  updateCountsAndProgress();
  renderList();
}

// Helper to determine if a task is overdue
function isTaskOverdue(todo) {
  if (todo.completed || !todo.dueDate) return false;
  const parts = todo.dueDate.split('-');
  if (parts.length !== 3) return false;
  const [y, m, d] = parts.map(Number);
  const target = new Date(y, m - 1, d);
  if (isNaN(target.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return targetDay < today;
}

function updateCountsAndProgress() {
  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;
  const overdue = todos.filter(t => isTaskOverdue(t)).length;
  const active = total - completed;
  const activeOnTrack = Math.max(0, active - overdue);

  // Update top statistics card values
  if (statValTotal) statValTotal.textContent = total;
  if (statValActive) statValActive.textContent = active;
  if (statValOverdue) statValOverdue.textContent = overdue;
  if (statValCompleted) statValCompleted.textContent = completed;

  // Toggle alert states if there are overdue tasks
  if (statCardOverdue) {
    statCardOverdue.classList.toggle('overdue-alert', overdue > 0);
  }
  if (filterBtnOverdue) {
    filterBtnOverdue.classList.toggle('has-overdue', overdue > 0);
  }

  // Update bottom filter badges
  if (countAll) countAll.textContent = total;
  if (countActive) countActive.textContent = active;
  if (countOverdue) countOverdue.textContent = overdue;
  if (countCompleted) countCompleted.textContent = completed;

  // Update items left in footer
  if (itemsLeftCount) {
    itemsLeftCount.textContent = `${active} item${active === 1 ? '' : 's'} remaining`;
  }

  // Toggle "Clear completed" visibility
  if (clearCompletedBtn) {
    if (completed > 0) {
      clearCompletedBtn.classList.remove('hidden');
    } else {
      clearCompletedBtn.classList.add('hidden');
    }
  }

  // Update multi-segment health bar
  if (total === 0) {
    if (segCompleted) segCompleted.style.width = '0%';
    if (segActive) segActive.style.width = '0%';
    if (segOverdue) segOverdue.style.width = '0%';
    if (progressStats) progressStats.textContent = '0% completed';
  } else {
    const compPct = (completed / total) * 100;
    const actPct = (activeOnTrack / total) * 100;
    const overPct = (overdue / total) * 100;

    if (segCompleted) segCompleted.style.width = `${compPct}%`;
    if (segActive) segActive.style.width = `${actPct}%`;
    if (segOverdue) segOverdue.style.width = `${overPct}%`;

    const roundedComp = Math.round(compPct);
    if (progressStats) {
      progressStats.textContent = `${roundedComp}% completed (${completed} of ${total})`;
    }
  }
}

function renderList() {
  const filtered = todos.filter(t => {
    if (currentFilter === 'active') return !t.completed;
    if (currentFilter === 'overdue') return isTaskOverdue(t);
    if (currentFilter === 'completed') return t.completed;
    return true; // 'all'
  });

  todoList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    if (todos.length === 0) {
      emptyTitle.textContent = 'No tasks yet';
      emptySubtext.textContent = 'Add your first task above to start organizing your day.';
    } else if (currentFilter === 'active') {
      emptyTitle.textContent = 'All caught up! 🎉';
      emptySubtext.textContent = 'No pending tasks. Great job on completing your work!';
    } else if (currentFilter === 'overdue') {
      emptyTitle.textContent = 'No overdue tasks! 🎯';
      emptySubtext.textContent = 'You are right on track with all your deadlines.';
    } else if (currentFilter === 'completed') {
      emptyTitle.textContent = 'No completed tasks';
      emptySubtext.textContent = 'Complete some tasks and they will appear here.';
    }
    return;
  }

  emptyState.classList.add('hidden');

  filtered.forEach(todo => {
    const li = document.createElement('li');
    li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
    li.dataset.id = todo.id;

    const formattedTime = formatTimestamp(todo.createdAt);
    const dueBadgeHTML = getDueDateBadge(todo.dueDate, todo.completed);

    li.innerHTML = `
      <div class="todo-content" role="button" tabindex="0" aria-label="Toggle task completion">
        <div class="custom-checkbox" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="todo-details">
          <span class="todo-title">${escapeHTML(todo.title)}</span>
          <div class="todo-meta">
            ${dueBadgeHTML}
            <span class="todo-time">${formattedTime}</span>
          </div>
        </div>
      </div>
      <div class="todo-actions">
        <button class="btn-delete" aria-label="Delete task" title="Delete task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    `;

    // Toggle on item / checkbox click
    const content = li.querySelector('.todo-content');
    content.addEventListener('click', () => toggleTodo(todo.id));
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTodo(todo.id);
      }
    });

    // Delete button click
    const deleteBtn = li.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTodo(todo.id);
    });

    todoList.appendChild(li);
  });
}

// --- Utilities ---

// Sanitize user strings
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Pretty print date/time
function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = now.toDateString() === date.toDateString();

  const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return `Today at ${timeString}`;
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) {
    return `Yesterday at ${timeString}`;
  }

  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeString}`;
}

// Format and style due date badge
function getDueDateBadge(dueDate, isCompleted) {
  if (!dueDate) return '';

  const parts = dueDate.split('-');
  if (parts.length !== 3) return '';
  const [year, month, day] = parts.map(Number);
  const target = new Date(year, month - 1, day);
  if (isNaN(target.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.round((targetDay - today) / msPerDay);

  const formattedDate = target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  let badgeClass = 'upcoming';
  let badgeText = `Due ${formattedDate}`;

  if (isCompleted) {
    badgeClass = 'completed';
    badgeText = `Due ${formattedDate}`;
  } else if (diffDays < 0) {
    badgeClass = 'overdue';
    badgeText = diffDays === -1 ? 'Overdue • Yesterday' : `Overdue • ${formattedDate}`;
  } else if (diffDays === 0) {
    badgeClass = 'today';
    badgeText = 'Due Today';
  } else if (diffDays === 1) {
    badgeClass = 'upcoming';
    badgeText = 'Due Tomorrow';
  }

  return `
    <span class="due-badge ${badgeClass}" title="Due date: ${formattedDate}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      <span>${badgeText}</span>
    </span>
  `;
}

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2200);
}

// --- Google Drive Sync UI Setup ---
function setupGoogleDriveUI() {
  const gdriveBtn = document.getElementById('gdriveBtn');
  const gdriveStatusText = document.getElementById('gdriveStatusText');
  const gdriveSyncDot = document.getElementById('gdriveSyncDot');
  const gdriveModal = document.getElementById('gdriveModal');
  const closeGdriveModal = document.getElementById('closeGdriveModal');
  const gdriveModalBody = document.getElementById('gdriveModalBody');

  if (!gdriveBtn || !gdriveModal || !window.gdriveSync) return;

  function updateStatusUI(status, detail) {
    if (gdriveSyncDot) {
      gdriveSyncDot.className = 'sync-dot';
      if (status === 'connected' || status === 'synced') {
        gdriveSyncDot.classList.add('connected');
      } else if (status === 'syncing') {
        gdriveSyncDot.classList.add('syncing');
      } else if (status === 'error' || status === 'expired') {
        gdriveSyncDot.classList.add('error');
      }
    }

    if (gdriveStatusText) {
      if (status === 'connected') gdriveStatusText.textContent = 'Connected';
      else if (status === 'synced') gdriveStatusText.textContent = 'Drive Synced';
      else if (status === 'syncing') gdriveStatusText.textContent = 'Syncing...';
      else if (status === 'error') gdriveStatusText.textContent = 'Sync Error';
      else if (status === 'expired') gdriveStatusText.textContent = 'Reconnect';
      else gdriveStatusText.textContent = 'Drive Sync';
    }
  }

  // Hook into Google Drive status changes
  window.gdriveSync.onStatusChange(updateStatusUI);

  // Render modal content based on connection status
  function renderModalBody() {
    if (!gdriveModalBody) return;

    if (window.gdriveSync.isConnected()) {
      gdriveModalBody.innerHTML = `
        <div class="status-badge-card">
          <div class="status-row">
            <span>Status:</span>
            <span class="status-val" style="color: var(--success);">● Active & Synced</span>
          </div>
          <div class="status-row">
            <span>Account:</span>
            <span class="status-val">${escapeHTML(window.gdriveSync.userEmail || 'Google Account')}</span>
          </div>
          <div class="status-row">
            <span>Drive File:</span>
            <span class="status-val">taskflow_todos.json</span>
          </div>
        </div>
        <p class="modal-hint">
          Your tasks are automatically synced with your personal Google Drive storage whenever you add, complete, or delete tasks.
        </p>
        <div class="modal-actions">
          <button id="btnGdriveManualSync" class="btn-primary">Sync Now</button>
          <button id="btnGdriveDisconnect" class="btn-danger">Disconnect</button>
        </div>
      `;

      document.getElementById('btnGdriveManualSync')?.addEventListener('click', async () => {
        showToast('Syncing with Google Drive...', 'info');
        const merged = await window.gdriveSync.sync(todos);
        if (merged) {
          todos = merged;
          render();
          showToast('Synced with Google Drive!', 'success');
        }
      });

      document.getElementById('btnGdriveDisconnect')?.addEventListener('click', () => {
        window.gdriveSync.disconnect();
        renderModalBody();
        showToast('Disconnected from Google Drive', 'info');
      });
    } else {
      gdriveModalBody.innerHTML = `
        <p class="modal-hint">
          Sync your tasks privately through your personal Google Drive storage across your Mac and smartphone from any network.
        </p>
        <div class="modal-field">
          <label class="modal-label" for="gdriveClientIdInput">Google OAuth Client ID:</label>
          <input 
            type="text" 
            id="gdriveClientIdInput" 
            class="modal-input" 
            placeholder="e.g. 543193143689-xxxxxx.apps.googleusercontent.com" 
            value="${escapeHTML(window.gdriveSync.clientId || '')}"
          />
        </div>
        <p class="modal-hint" style="font-size: 0.78rem;">
          Need a Client ID? 
          <a class="link-accent" href="https://console.cloud.google.com/apis/credentials?project=project-252b0cab-38ee-4b66-a04" target="_blank" rel="noopener">
            Click here to create one in your project
          </a> 
          (100% Free, takes 60 seconds).
        </p>
        <div class="modal-actions">
          <button id="btnGdriveSaveConnect" class="btn-primary">Connect with Google</button>
          <button id="btnGdriveCancel" class="btn-secondary">Cancel</button>
        </div>
      `;

      document.getElementById('btnGdriveSaveConnect')?.addEventListener('click', () => {
        const input = document.getElementById('gdriveClientIdInput');
        const val = (input?.value || '').trim();
        if (!val) {
          showToast('Please enter your Google OAuth Client ID', 'danger');
          return;
        }
        window.gdriveSync.setClientId(val);
        const initiated = window.gdriveSync.requestAuth();
        if (initiated) {
          gdriveModal.classList.add('hidden');
        }
      });

      document.getElementById('btnGdriveCancel')?.addEventListener('click', () => {
        gdriveModal.classList.add('hidden');
      });
    }
  }

  // Open modal
  gdriveBtn.addEventListener('click', () => {
    renderModalBody();
    gdriveModal.classList.remove('hidden');
  });

  // Close modal
  closeGdriveModal?.addEventListener('click', () => {
    gdriveModal.classList.add('hidden');
  });

  gdriveModal.addEventListener('click', (e) => {
    if (e.target === gdriveModal) {
      gdriveModal.classList.add('hidden');
    }
  });

  // Check initial state
  if (window.gdriveSync.isConnected()) {
    updateStatusUI('connected', window.gdriveSync.userEmail);
  }

  // Callback after Google OAuth pop-up completes
  window.onGoogleDriveConnected = async () => {
    showToast('Connected to Google Drive!', 'success');
    const merged = await window.gdriveSync.sync(todos);
    if (merged) {
      todos = merged;
      render();
    }
  };
}

