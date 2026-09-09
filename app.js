/**
 * PLACAS APP - Frontend
 * ------------------------------------------------------------
 * Habla con el backend de Apps Script (Code.gs) para leer y
 * escribir directamente sobre tu Google Sheet.
 *
 * CONFIGURACIÓN ANTES DE COMPARTIR LA APP (solo tú, Gustavo):
 * 1. Reemplaza APPS_SCRIPT_URL de abajo por la URL de tu Web App
 *    (Extensiones > Apps Script > Implementar > la URL que termina
 *    en /exec).
 * 2. Cambia PASSWORDS.admin y PASSWORDS.user por las contraseñas
 *    que quieras repartir a tu equipo.
 * 3. Sube estos archivos a GitHub. Nadie más tendrá que tocar nada
 *    de esto: solo entran con la contraseña que les des.
 *
 * IMPORTANTE (léelo antes de repartir contraseñas):
 * Esta app es un sitio estático (no tiene servidor propio), así que
 * estas contraseñas son una traba de uso, no una caja fuerte: alguien
 * con conocimientos técnicos podría leerlas en el código fuente del
 * navegador. Sirven muy bien para evitar que el personal de campo
 * edite por error o exporte de más, pero no las uses para datos
 * verdaderamente confidenciales.
 */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyx3hM3kScscjcM6md0Uti3sHyTO6slVGcCWWBn80smizwbwBNS3k3QDxNffbCRenu0/exec';
const PASSWORDS = {
  admin: 'admin2026',   // ← cambia esta contraseña
  user: 'placas2026'    // ← cambia esta contraseña
};

const STORAGE_KEY_ROLE = 'placas_role';
const STORAGE_KEY_NAME = 'placas_user_name';
const CACHE_KEY = 'placas_data_cache_v1';
const PAGE_SIZE = 60;
const APP_VERSION = 'v2.6.0';

document.querySelectorAll('.footer-version').forEach(el => { el.textContent = APP_VERSION; });

let state = {
  role: sessionStorage.getItem(STORAGE_KEY_ROLE) || '',
  userName: sessionStorage.getItem(STORAGE_KEY_NAME) || '',
  rows: [],
  filtered: [],
  page: 1,
  selectedDW: new Set(),
  selectedBW: new Set()
};

// ---------------- Login ----------------

function showLogin(errorMsg) {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('userNameInput').value = state.userName;
  const err = document.getElementById('loginError');
  if (errorMsg) {
    err.textContent = errorMsg;
    err.classList.remove('hidden');
  } else {
    err.classList.add('hidden');
  }
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.body.classList.remove('role-admin', 'role-user');
  document.body.classList.add('role-' + state.role);
  const badge = document.getElementById('roleBadge');
  badge.textContent = state.role === 'admin' ? 'Administrador' : 'Usuario';
  badge.className = 'role-badge ' + (state.role === 'admin' ? 'role-admin' : '');
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('passwordInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

function doLogin() {
  if (APPS_SCRIPT_URL.includes('PON_AQUI')) {
    showLogin('La app todavía no está configurada: falta pegar la URL de Apps Script en app.js.');
    return;
  }
  const pass = document.getElementById('passwordInput').value;
  const name = document.getElementById('userNameInput').value.trim();
  let role = '';
  if (pass && pass === PASSWORDS.admin) role = 'admin';
  else if (pass && pass === PASSWORDS.user) role = 'user';

  if (!role) {
    showLogin('Contraseña incorrecta. Verifica con quien te la compartió.');
    return;
  }

  state.role = role;
  state.userName = name;
  sessionStorage.setItem(STORAGE_KEY_ROLE, role);
  sessionStorage.setItem(STORAGE_KEY_NAME, name);
  document.getElementById('passwordInput').value = '';
  boot();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY_ROLE);
  sessionStorage.removeItem(STORAGE_KEY_NAME);
  state.role = '';
  showLogin();
});

// ---------------- API ----------------

async function apiGet(action) {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=${action}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiPost(payload) {
  // text/plain evita el preflight CORS en Apps Script Web Apps
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// ---------------- Boot / sync (con caché para carga instantánea) ----------------

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function saveCache(rows) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rows, ts: Date.now() }));
  } catch (e) { /* localStorage lleno o no disponible: seguimos sin caché */ }
}

async function boot() {
  showApp();
  applyRoleToTableUI();

  const cached = loadCache();
  if (cached && cached.rows && cached.rows.length) {
    state.rows = cached.rows;
    populateFilterOptions();
    applyFilters();
    renderDashboard();
    setSyncStatus('Datos guardados · actualizando…');
  } else {
    setSyncStatus('Cargando…');
  }

  try {
    const data = await apiGet('getData');
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    state.rows = data.rows;
    saveCache(data.rows);
    populateFilterOptions();
    applyFilters();
    renderDashboard();
    setSyncStatus('Actualizado ' + new Date().toLocaleTimeString('es-ES'));
  } catch (err) {
    if (cached && cached.rows && cached.rows.length) {
      setSyncStatus('Sin conexión · mostrando datos guardados');
      showToast('No se pudo actualizar (sin conexión). Mostrando la última copia guardada en este dispositivo.', 'error');
    } else {
      setSyncStatus('Error de conexión');
      showToast('No se pudo conectar con la hoja de datos: ' + err.message, 'error');
    }
  }
}

function setSyncStatus(text) {
  document.getElementById('syncStatus').textContent = text;
}

document.getElementById('refreshBtn').addEventListener('click', boot);

// ---------------- Role-based UI ----------------

function applyRoleToTableUI() {
  const canEdit = state.role === 'admin';
  document.getElementById('dataTable').classList.toggle('readonly-mode', !canEdit);
}

// ---------------- Tabs ----------------

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------------- Dashboard ----------------

function renderDashboard() {
  const rows = state.rows;
  const total = rows.length;
  let clasificadas = 0;
  const porDW = {}, porBW = {};
  const discTotals = {}, discClasificadas = {};
  const packagesEnUso = new Set();

  rows.forEach(row => {
    const hasDW = row.dw !== '' && row.dw !== null && row.dw !== undefined;
    const hasBW = row.bw !== '' && row.bw !== null && row.bw !== undefined;
    const clasificada = hasDW || hasBW;
    if (clasificada) clasificadas++;

    if (hasDW) { porDW[row.dw] = (porDW[row.dw] || 0) + 1; packagesEnUso.add('DW-' + row.dw); }
    if (hasBW) { porBW[row.bw] = (porBW[row.bw] || 0) + 1; packagesEnUso.add('BW-' + row.bw); }

    const d = row.dis || '(sin disciplina)';
    discTotals[d] = (discTotals[d] || 0) + 1;
    if (clasificada) discClasificadas[d] = (discClasificadas[d] || 0) + 1;
  });

  const pendientes = total - clasificadas;
  const pct = total ? Math.round((clasificadas / total) * 100) : 0;

  document.getElementById('kpiTotal').textContent = total.toLocaleString('es-ES');
  document.getElementById('kpiClasificadas').textContent = clasificadas.toLocaleString('es-ES');
  document.getElementById('kpiPendientes').textContent = pendientes.toLocaleString('es-ES');
  document.getElementById('kpiPaquetes').textContent = packagesEnUso.size.toLocaleString('es-ES');
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';

  renderChipGrid('chartDW', porDW, 'dw');
  renderChipGrid('chartBW', porBW, 'bw');
  renderHeatList('chartDisciplina', discTotals, discClasificadas);
}

// Colores estables por paquete: mismo número siempre el mismo tono
const CHIP_PALETTE = [
  { bg: '#e8effe', fg: '#2563eb' }, // azul
  { bg: '#e3f6f3', fg: '#0d9488' }, // teal
  { bg: '#fff3e0', fg: '#c2670a' }, // ámbar
  { bg: '#f0e9fd', fg: '#7c3aed' }, // púrpura
  { bg: '#fdecec', fg: '#c22b2b' }, // rojo
  { bg: '#e6f4ea', fg: '#1a7a3c' }  // verde
];

function chipColorFor(key) {
  let hash = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return CHIP_PALETTE[hash % CHIP_PALETTE.length];
}

function renderChipGrid(elId, dict, field) {
  const el = document.getElementById(elId);
  const entries = Object.entries(dict).sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Sin datos todavía.</p>';
    return;
  }
  el.innerHTML = entries.map(([key, count]) => {
    const c = chipColorFor(key);
    return `
      <div class="chip" data-field="${field}" data-key="${escapeHtml(key)}" style="background:${c.bg};border-color:${c.bg}">
        <span class="chip-num" style="color:${c.fg}">${escapeHtml(key)}</span>
        <span class="chip-count">${count} tag${count === 1 ? '' : 's'}</span>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => openPackageModal(chip.dataset.field, chip.dataset.key));
  });
}

// Colores vivos por rango de avance (rojo → ámbar → teal)
function heatColor(pct) {
  if (pct >= 66) return { solid: '#0d9488', tint: 'rgba(13,148,136,0.10)' };
  if (pct >= 33) return { solid: '#d97706', tint: 'rgba(217,119,6,0.10)' };
  return { solid: '#dc2626', tint: 'rgba(220,38,38,0.08)' };
}

function renderHeatList(elId, totals, done) {
  const el = document.getElementById(elId);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Sin datos todavía.</p>';
    return;
  }
  el.innerHTML = entries.map(([disc, total]) => {
    const doneCount = done[disc] || 0;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    const c = heatColor(pct);
    return `
      <div class="heat-row" style="background:${c.tint}">
        <span class="heat-label" style="color:${c.solid}" title="${escapeHtml(disc)}">${escapeHtml(disc)}</span>
        <span class="heat-track"><span class="heat-fill" style="width:${pct}%;background:${c.solid}"></span></span>
        <span class="heat-count">${doneCount}/${total}</span>
        <span class="heat-badge" style="background:${c.solid}">${pct}%</span>
      </div>
    `;
  }).join('');
}

// ---------------- Package detail modal ----------------

function openPackageModal(field, key) {
  const rows = state.rows.filter(r => String(r[field]) === String(key));
  const label = field === 'dw' ? 'PQT DW' : 'PQT BW';

  document.getElementById('modalTitle').textContent = `${label} ${key}`;
  document.getElementById('modalSubtitle').textContent = `${rows.length} tag${rows.length === 1 ? '' : 's'} en este paquete`;

  const renderRows = (list) => {
    document.getElementById('modalTableBody').innerHTML = list.map(row => `
      <tr>
        <td>${escapeHtml(row.i)}</td>
        <td class="tag-cell" title="${escapeHtml(row.tag)}">${escapeHtml(row.tag)}</td>
        <td>${escapeHtml(row.dis)}</td>
        <td>${escapeHtml(row.sub)}</td>
        <td>${escapeHtml(row.sys)}</td>
        <td class="desc-cell" title="${escapeHtml(row.desc)}">${escapeHtml(row.desc)}</td>
        <td>${escapeHtml(row.lvl)}</td>
        <td>${escapeHtml(row.ent)}</td>
        <td>${escapeHtml(row.o)}</td>
      </tr>
    `).join('');
  };

  renderRows(rows);

  const searchBox = document.getElementById('modalSearch');
  searchBox.value = '';
  searchBox.oninput = () => {
    const q = searchBox.value.trim().toLowerCase();
    const filtered = q
      ? rows.filter(r => `${r.tag || ''} ${r.sys || ''} ${r.desc || ''}`.toLowerCase().includes(q))
      : rows;
    renderRows(filtered);
  };

  document.getElementById('packageModal').classList.remove('hidden');
}

document.getElementById('modalCloseBtn').addEventListener('click', () => {
  document.getElementById('packageModal').classList.add('hidden');
});
document.getElementById('packageModal').addEventListener('click', (e) => {
  if (e.target.id === 'packageModal') e.currentTarget.classList.add('hidden');
});

// ---------------- Filters ----------------

function populateFilterOptions() {
  const disciplines = [...new Set(state.rows.map(r => r.dis).filter(Boolean))].sort();
  const subs = [...new Set(state.rows.map(r => r.sub).filter(Boolean))].sort();

  fillSelect('filterDiscipline', disciplines, 'Disciplina (todas)');
  fillSelect('filterSubcontractor', subs, 'Subcontratista (todos)');

  populatePackagePicker();
}

function packageCounts(field) {
  const counts = {};
  state.rows.forEach(row => {
    const val = row[field];
    if (val !== '' && val !== null && val !== undefined) counts[val] = (counts[val] || 0) + 1;
  });
  return counts;
}

function populatePackagePicker() {
  renderPickerList('pickerDW', packageCounts('dw'), state.selectedDW);
  renderPickerList('pickerBW', packageCounts('bw'), state.selectedBW);
  updateQuickFilterButtons();
}

function renderPickerList(elId, counts, selectedSet) {
  const el = document.getElementById(elId);
  const entries = Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:6px;">Sin paquetes todavía.</p>';
    return;
  }
  el.innerHTML = entries.map(([key, count]) => `
    <label class="picker-item">
      <input type="checkbox" value="${escapeHtml(key)}" ${selectedSet.has(key) ? 'checked' : ''}>
      <span>${escapeHtml(key)}</span>
      <span class="picker-count">${count}</span>
    </label>
  `).join('');
}

function updatePackageFilterBtnLabel() {
  const total = state.selectedDW.size + state.selectedBW.size;
  document.getElementById('packageFilterBtn').textContent = total > 0
    ? `Paquetes (${total} seleccionados)`
    : 'Paquetes (todos)';
}

// Mantiene resaltado el botón rápido (Todos / Solo DW / Solo BW) que
// corresponda al estado actual de selección, sea que se haya llegado ahí
// por el filtro rápido o eligiendo paquetes específicos en el modal.
function updateQuickFilterButtons() {
  const allDW = Object.keys(packageCounts('dw'));
  const allBW = Object.keys(packageCounts('bw'));
  const isAllDW = allDW.length > 0 && state.selectedDW.size === allDW.length && state.selectedBW.size === 0;
  const isAllBW = allBW.length > 0 && state.selectedBW.size === allBW.length && state.selectedDW.size === 0;
  const isNone = state.selectedDW.size === 0 && state.selectedBW.size === 0;

  document.querySelectorAll('.pkg-quick-btn').forEach(btn => {
    const type = btn.dataset.type;
    const active = (type === '' && isNone) || (type === 'DW' && isAllDW) || (type === 'BW' && isAllBW);
    btn.classList.toggle('active', active);
  });
}

function setQuickPackageFilter(type) {
  if (type === 'DW') {
    state.selectedDW = new Set(Object.keys(packageCounts('dw')));
    state.selectedBW = new Set();
  } else if (type === 'BW') {
    state.selectedBW = new Set(Object.keys(packageCounts('bw')));
    state.selectedDW = new Set();
  } else {
    state.selectedDW = new Set();
    state.selectedBW = new Set();
  }
  updatePackageFilterBtnLabel();
  updateQuickFilterButtons();
  state.page = 1;
  applyFilters();
}

document.querySelectorAll('.pkg-quick-btn').forEach(btn => {
  btn.addEventListener('click', () => setQuickPackageFilter(btn.dataset.type));
});

function fillSelect(id, values, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

document.getElementById('packageFilterBtn').addEventListener('click', () => {
  populatePackagePicker();
  document.getElementById('packagePickerModal').classList.remove('hidden');
});
document.getElementById('packagePickerCloseBtn').addEventListener('click', () => {
  document.getElementById('packagePickerModal').classList.add('hidden');
});
document.getElementById('packagePickerModal').addEventListener('click', (e) => {
  if (e.target.id === 'packagePickerModal') e.currentTarget.classList.add('hidden');
});
document.getElementById('deliveryModal').addEventListener('click', (e) => {
  if (e.target.id === 'deliveryModal') document.getElementById('deliveryModalCloseBtn').click();
});

document.getElementById('pickerApplyBtn').addEventListener('click', () => {
  state.selectedDW = new Set(
    [...document.querySelectorAll('#pickerDW input:checked')].map(i => i.value)
  );
  state.selectedBW = new Set(
    [...document.querySelectorAll('#pickerBW input:checked')].map(i => i.value)
  );
  updatePackageFilterBtnLabel();
  updateQuickFilterButtons();
  document.getElementById('packagePickerModal').classList.add('hidden');
  state.page = 1;
  applyFilters();
});

document.getElementById('pickerClearBtn').addEventListener('click', () => {
  document.querySelectorAll('#pickerDW input, #pickerBW input').forEach(i => { i.checked = false; });
  state.selectedDW = new Set();
  state.selectedBW = new Set();
  updatePackageFilterBtnLabel();
  updateQuickFilterButtons();
  document.getElementById('packagePickerModal').classList.add('hidden');
  state.page = 1;
  applyFilters();
});

['searchInput', 'filterDiscipline', 'filterSubcontractor', 'filterEstado', 'filterGQE', 'filterEntregado'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { state.page = 1; applyFilters(); });
});

function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const disc = document.getElementById('filterDiscipline').value;
  const sub = document.getElementById('filterSubcontractor').value;
  const estado = document.getElementById('filterEstado').value;
  const gqeFilter = document.getElementById('filterGQE').value;
  const entregadoFilter = document.getElementById('filterEntregado').value;
  const hasPkgFilter = state.selectedDW.size > 0 || state.selectedBW.size > 0;

  state.filtered = state.rows.filter(row => {
    if (disc && row.dis !== disc) return false;
    if (sub && row.sub !== sub) return false;

    const hasDW = row.dw !== '' && row.dw !== null && row.dw !== undefined;
    const hasBW = row.bw !== '' && row.bw !== null && row.bw !== undefined;
    const clasificada = hasDW || hasBW;
    if (estado === 'clasificada' && !clasificada) return false;
    if (estado === 'pendiente' && clasificada) return false;

    if (gqeFilter === 'Y' && String(row.g).toUpperCase() !== 'Y') return false;

    const entregada = String(row.ent).toUpperCase() === 'Y';
    if (entregadoFilter === 'Y' && !entregada) return false;
    if (entregadoFilter === 'N' && entregada) return false;

    if (hasPkgFilter) {
      const matchesDW = state.selectedDW.size > 0 && hasDW && state.selectedDW.has(String(row.dw));
      const matchesBW = state.selectedBW.size > 0 && hasBW && state.selectedBW.has(String(row.bw));
      if (!matchesDW && !matchesBW) return false;
    }

    if (q) {
      const hay = `${row.tag || ''} ${row.sys || ''} ${row.desc || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  document.getElementById('resultsCount').textContent = state.filtered.length.toLocaleString('es-ES');
  renderTablePage();
}

// ---------------- Table ----------------

function renderTablePage() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageRows = state.filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('tableBody');
  const canEdit = state.role === 'admin';
  tbody.innerHTML = pageRows.map(row => canEdit ? editableRowHtml(row) : readonlyRowHtml(row)).join('');

  document.getElementById('pageInfo').textContent = `Página ${state.page} de ${totalPages}`;

  if (canEdit) {
    tbody.querySelectorAll('.editable').forEach(input => input.addEventListener('input', onFieldChange));
    tbody.querySelectorAll('.row-save-btn').forEach(btn => btn.addEventListener('click', onSaveRow));
  }
}

function readonlyRowHtml(row) {
  return `
    <tr data-row="${row.r}">
      <td>${escapeHtml(row.i)}</td>
      <td>${escapeHtml(row.ins)}</td>
      <td>${escapeHtml(row.dis)}</td>
      <td>${escapeHtml(row.sub)}</td>
      <td class="tag-cell" title="${escapeHtml(row.tag)}">${escapeHtml(row.tag)}</td>
      <td>${escapeHtml(row.sys)}</td>
      <td class="desc-cell" title="${escapeHtml(row.desc)}">${escapeHtml(row.desc)}</td>
      <td>${escapeHtml(row.lvl)}</td>
      <td class="readonly-cell">${escapeHtml(row.dw)}</td>
      <td class="readonly-cell">${escapeHtml(row.bw)}</td>
      <td class="readonly-cell">${escapeHtml(row.g)}</td>
      <td class="readonly-cell">${escapeHtml(row.ent)}</td>
      <td>${escapeHtml(row.o)}</td>
      <td></td>
    </tr>
  `;
}

function editableRowHtml(row) {
  return `
    <tr data-row="${row.r}">
      <td>${escapeHtml(row.i)}</td>
      <td>${escapeHtml(row.ins)}</td>
      <td>${escapeHtml(row.dis)}</td>
      <td>${escapeHtml(row.sub)}</td>
      <td class="tag-cell" title="${escapeHtml(row.tag)}">${escapeHtml(row.tag)}</td>
      <td>${escapeHtml(row.sys)}</td>
      <td class="desc-cell" title="${escapeHtml(row.desc)}">${escapeHtml(row.desc)}</td>
      <td>${escapeHtml(row.lvl)}</td>
      <td><input class="editable" data-field="dw" type="text" value="${escapeHtml(row.dw)}"></td>
      <td><input class="editable" data-field="bw" type="text" value="${escapeHtml(row.bw)}"></td>
      <td><input class="editable gqe-input" data-field="g" type="text" maxlength="1" value="${escapeHtml(row.g)}"></td>
      <td><input class="editable gqe-input" data-field="ent" type="text" maxlength="1" value="${escapeHtml(row.ent)}"></td>
      <td><input class="editable obs-input" data-field="o" type="text" value="${escapeHtml(row.o)}"></td>
      <td><button class="row-save-btn">Guardar</button></td>
    </tr>
  `;
}

function onFieldChange(e) {
  const tr = e.target.closest('tr');
  const btn = tr.querySelector('.row-save-btn');
  btn.classList.remove('saved', 'error');
  btn.classList.add('dirty');
  btn.textContent = 'Guardar';
}

async function onSaveRow(e) {
  if (state.role !== 'admin') return;
  const btn = e.target;
  const tr = btn.closest('tr');
  const r = Number(tr.dataset.row);

  const payload = {
    action: 'updateRow',
    r: r,
    pqtDW: tr.querySelector('[data-field="dw"]').value.trim(),
    pqtBW: tr.querySelector('[data-field="bw"]').value.trim(),
    gqe: tr.querySelector('[data-field="g"]').value.trim().toUpperCase(),
    entregado: tr.querySelector('[data-field="ent"]').value.trim().toUpperCase(),
    obs: tr.querySelector('[data-field="o"]').value.trim(),
    editor: state.userName
  };

  btn.textContent = 'Guardando…';
  try {
    const result = await apiPost(payload);
    if (!result.ok) throw new Error(result.error || 'Error desconocido');

    const rowObj = state.rows.find(x => x.r === r);
    if (rowObj) {
      rowObj.dw = payload.pqtDW;
      rowObj.bw = payload.pqtBW;
      rowObj.g = payload.gqe;
      rowObj.ent = payload.entregado;
      rowObj.o = payload.obs;
      saveCache(state.rows);
    }

    btn.classList.remove('dirty', 'error');
    btn.classList.add('saved');
    btn.textContent = 'Guardado ✓';
    renderDashboard();
    showToast('Fila actualizada correctamente.', 'success');
  } catch (err) {
    btn.classList.remove('dirty', 'saved');
    btn.classList.add('error');
    btn.textContent = 'Error';
    showToast('No se pudo guardar: ' + err.message, 'error');
  }
}

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (state.page > 1) { state.page--; renderTablePage(); }
});
document.getElementById('nextPageBtn').addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  if (state.page < totalPages) { state.page++; renderTablePage(); }
});

// ---------------- Export: CSV / Excel / PDF ----------------

const APP_TITLE = 'PLACAS-TAG DW / BW';

const EXPORT_HEADERS = ['ITEM', 'INSTALL', 'DISCIPLINE', 'SUBCONTRACTOR', 'TAG', 'SYSTEM', 'DESCRIPTION', 'LEVEL', 'PQT DW', 'PQT BW', 'GQE', 'ENTREGADO', 'OBS'];
// El PDF de tabla no incluye ENTREGADO (se pidió quitarlo de los PDF).
const PDF_TABLE_HEADERS = EXPORT_HEADERS.filter(h => h !== 'ENTREGADO');

function exportRowsAsArrays() {
  return state.filtered.map(row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.bw, row.g, row.ent, row.o]);
}

// Ordena por número de paquete (DW o el que tenga la fila) de menor a mayor;
// las filas sin paquete quedan al final. Usado por Excel y por el PDF de tabla.
function sortByPackageAsc(rows) {
  const keyOf = (r) => {
    const dw = r.dw !== '' && r.dw !== null && r.dw !== undefined ? Number(r.dw) : null;
    const bw = r.bw !== '' && r.bw !== null && r.bw !== undefined ? Number(r.bw) : null;
    if (dw !== null) return dw;
    if (bw !== null) return bw;
    return Infinity;
  };
  return [...rows].sort((a, b) => keyOf(a) - keyOf(b));
}

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const lines = [EXPORT_HEADERS.join(',')];
  exportRowsAsArrays().forEach(vals => lines.push(vals.map(csvEscape).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `placas_export_${todayStr()}.csv`);
});

// Excel: para administradores. Oculta GQE y ENTREGADO (control interno del
// administrador) y, si el filtro de paquetes usa solo DW o solo BW, oculta
// también la otra columna de paquete. Ordenado por paquete ascendente.
document.getElementById('exportExcelBtn').addEventListener('click', () => {
  if (typeof XLSX === 'undefined') { showToast('No se pudo cargar el módulo de Excel. Revisa tu conexión.', 'error'); return; }

  const onlyDW = state.selectedDW.size > 0 && state.selectedBW.size === 0;
  const onlyBW = state.selectedBW.size > 0 && state.selectedDW.size === 0;

  let headers = ['ITEM', 'INSTALL', 'DISCIPLINE', 'SUBCONTRACTOR', 'TAG', 'SYSTEM', 'DESCRIPTION', 'LEVEL', 'PQT DW', 'PQT BW', 'OBS'];
  let rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.bw, row.o];

  if (onlyDW) {
    headers = headers.filter(h => h !== 'PQT BW');
    rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.o];
  } else if (onlyBW) {
    headers = headers.filter(h => h !== 'PQT DW');
    rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.bw, row.o];
  }

  const sorted = sortByPackageAsc(state.filtered);
  const data = [headers, ...sorted.map(rowMapper)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PLACAS');
  XLSX.writeFile(wb, `placas_export_${todayStr()}.xlsx`);
});

// ---------------- Importar Excel (actualizar PQT DW/BW, GQE, OBS, Entregado) ----------------
// Solo actualiza TAGs que YA existen en la hoja (los busca por su código
// TAG). No crea filas nuevas ni toca ITEM/INSTALL/DISCIPLINE/etc. Si un
// campo ya tenía un valor distinto al del Excel, pide decidir caso por
// caso; si el campo estaba vacío, lo rellena directamente sin preguntar.

const IMPORT_FIELD_MAP = [
  { header: 'PQT DW', field: 'dw', apiKey: 'pqtDW', label: 'PQT DW' },
  { header: 'PQT BW', field: 'bw', apiKey: 'pqtBW', label: 'PQT BW' },
  { header: 'GQE', field: 'g', apiKey: 'gqe', label: 'GQE' },
  { header: 'ENTREGADO', field: 'ent', apiKey: 'entregado', label: 'ENTREGADO' },
  { header: 'OBS', field: 'o', apiKey: 'obs', label: 'OBS' }
];

let importAnalysis = null;

document.getElementById('importExcelBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').value = '';
  document.getElementById('importStepFile').classList.remove('hidden');
  document.getElementById('importStepReview').classList.add('hidden');
  document.getElementById('importModal').classList.remove('hidden');
});
document.getElementById('importModalCloseBtn').addEventListener('click', () => {
  document.getElementById('importModal').classList.add('hidden');
});
document.getElementById('importModal').addEventListener('click', (e) => {
  if (e.target.id === 'importModal') document.getElementById('importModal').classList.add('hidden');
});
document.getElementById('importCancelBtn').addEventListener('click', () => {
  document.getElementById('importModal').classList.add('hidden');
});

document.getElementById('importAnalyzeBtn').addEventListener('click', async () => {
  const file = document.getElementById('importFileInput').files[0];
  if (!file) { showToast('Elige un archivo Excel primero.', 'error'); return; }
  if (typeof XLSX === 'undefined') { showToast('No se pudo cargar el módulo de Excel. Revisa tu conexión.', 'error'); return; }

  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (aoa.length < 2) { showToast('El archivo no tiene filas de datos.', 'error'); return; }

    const headerRow = aoa[0].map(h => String(h).trim().toUpperCase());
    const tagIdx = headerRow.indexOf('TAG');
    if (tagIdx === -1) { showToast('No encontré la columna TAG en la primera fila del archivo.', 'error'); return; }

    const fieldIdx = {};
    IMPORT_FIELD_MAP.forEach(f => {
      const idx = headerRow.indexOf(f.header);
      if (idx !== -1) fieldIdx[f.field] = idx;
    });
    if (Object.keys(fieldIdx).length === 0) {
      showToast('No encontré ninguna columna PQT DW, PQT BW, GQE, OBS o ENTREGADO en el archivo.', 'error');
      return;
    }

    importAnalysis = analyzeImport(aoa.slice(1), tagIdx, fieldIdx);
    renderImportReview(importAnalysis);
    document.getElementById('importStepFile').classList.add('hidden');
    document.getElementById('importStepReview').classList.remove('hidden');
  } catch (e) {
    showToast('No se pudo leer el archivo: ' + e.message, 'error');
  }
});

function normVal(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function analyzeImport(dataRows, tagIdx, fieldIdx) {
  // TAG -> filas vivas que lo tienen (para detectar duplicados en la hoja actual)
  const byTag = {};
  state.rows.forEach(row => {
    const t = normVal(row.tag);
    if (!t) return;
    (byTag[t] = byTag[t] || []).push(row);
  });

  const autoApply = [];
  const conflicts = [];
  const notFound = [];
  const duplicates = [];
  let totalExcelRows = 0;

  dataRows.forEach(r => {
    const tag = normVal(r[tagIdx]);
    if (!tag) return;
    totalExcelRows++;

    const matches = byTag[tag];
    if (!matches || matches.length === 0) { notFound.push(tag); return; }
    if (matches.length > 1) { duplicates.push(tag); return; }
    const row = matches[0];

    IMPORT_FIELD_MAP.forEach(f => {
      if (fieldIdx[f.field] === undefined) return; // esa columna no vino en el excel
      const excelValRaw = r[fieldIdx[f.field]];
      const excelVal = normVal(excelValRaw);
      if (!excelVal) return; // celda vacía en excel = no tocar ese campo

      const currentVal = normVal(row[f.field]);
      const isFlag = f.field === 'g' || f.field === 'ent';
      const excelCmp = isFlag ? excelVal.toUpperCase() : excelVal;
      const currentCmp = isFlag ? currentVal.toUpperCase() : currentVal;

      if (excelCmp === currentCmp) return; // sin cambios reales

      if (!currentVal) {
        autoApply.push({ row, field: f.field, apiKey: f.apiKey, newVal: excelValRaw, label: f.label });
      } else {
        conflicts.push({ row, field: f.field, apiKey: f.apiKey, label: f.label, currentVal, excelVal: excelValRaw, decision: 'excel' });
      }
    });
  });

  return { autoApply, conflicts, notFound, duplicates, totalExcelRows };
}

function renderImportReview(analysis) {
  const summary = document.getElementById('importSummary');
  summary.innerHTML = `
    <div>TAGs leídos del Excel: <b>${analysis.totalExcelRows}</b></div>
    <div>Cambios que se aplicarán automáticamente (el campo estaba vacío): <b>${analysis.autoApply.length}</b></div>
    <div>Conflictos que requieren tu decisión (ya había un valor distinto): <b>${analysis.conflicts.length}</b></div>
    ${analysis.notFound.length ? `<div>TAGs no encontrados en tu Sheet (se omiten): <b>${analysis.notFound.length}</b></div>` : ''}
    ${analysis.duplicates.length ? `<div>TAGs duplicados en tu Sheet (se omiten, revísalos manualmente en la Tabla): <b>${analysis.duplicates.length}</b></div>` : ''}
  `;

  const wrap = document.getElementById('importConflictsWrap');
  if (analysis.conflicts.length === 0) {
    wrap.classList.add('hidden');
  } else {
    wrap.classList.remove('hidden');
    renderConflictsTable(analysis.conflicts);
  }
}

function renderConflictsTable(conflicts) {
  const tbody = document.getElementById('importConflictsBody');
  tbody.innerHTML = conflicts.map((c, idx) => `
    <tr data-idx="${idx}">
      <td class="tag-cell">${escapeHtml(c.row.tag)}</td>
      <td>${escapeHtml(c.label)}</td>
      <td>${escapeHtml(c.currentVal)}</td>
      <td>${escapeHtml(c.excelVal)}</td>
      <td>
        <div class="decision-toggle">
          <button type="button" class="decision-btn decision-excel ${c.decision === 'excel' ? 'selected' : ''}" data-value="excel">Usar Excel</button>
          <button type="button" class="decision-btn decision-current ${c.decision === 'current' ? 'selected' : ''}" data-value="current">Mantener actual</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.decision-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const idx = Number(tr.dataset.idx);
      importAnalysis.conflicts[idx].decision = btn.dataset.value;
      tr.querySelectorAll('.decision-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

document.getElementById('conflictsAllExcelBtn').addEventListener('click', () => {
  importAnalysis.conflicts.forEach(c => c.decision = 'excel');
  renderConflictsTable(importAnalysis.conflicts);
});
document.getElementById('conflictsAllCurrentBtn').addEventListener('click', () => {
  importAnalysis.conflicts.forEach(c => c.decision = 'current');
  renderConflictsTable(importAnalysis.conflicts);
});

document.getElementById('importApplyBtn').addEventListener('click', async () => {
  if (!importAnalysis) return;
  const changesByRow = new Map();

  importAnalysis.autoApply.forEach(c => {
    const entry = changesByRow.get(c.row.r) || { row: c.row, fields: {} };
    entry.fields[c.apiKey] = c.newVal;
    changesByRow.set(c.row.r, entry);
  });
  importAnalysis.conflicts.forEach(c => {
    if (c.decision !== 'excel') return;
    const entry = changesByRow.get(c.row.r) || { row: c.row, fields: {} };
    entry.fields[c.apiKey] = c.excelVal;
    changesByRow.set(c.row.r, entry);
  });

  const entries = [...changesByRow.values()];
  document.getElementById('importModal').classList.add('hidden');

  if (entries.length === 0) {
    showToast('No hay cambios para aplicar.', 'error');
    importAnalysis = null;
    return;
  }

  showToast(`Aplicando cambios a ${entries.length} TAG(s)…`, 'success');

  let okCount = 0, errCount = 0;
  for (const entry of entries) {
    try {
      const payload = Object.assign({ action: 'updateRow', r: entry.row.r, editor: state.userName }, entry.fields);
      const result = await apiPost(payload);
      if (result.ok) {
        Object.keys(entry.fields).forEach(apiKey => {
          const map = IMPORT_FIELD_MAP.find(f => f.apiKey === apiKey);
          if (map) entry.row[map.field] = entry.fields[apiKey];
        });
        okCount++;
      } else {
        errCount++;
      }
    } catch (e) { errCount++; }
  }

  saveCache(state.rows);
  renderDashboard();
  applyFilters();
  importAnalysis = null;

  showToast(`Importación terminada: ${okCount} TAG(s) actualizados${errCount ? `, ${errCount} con error` : ''}.`, errCount ? 'error' : 'success');
});

// Botón independiente "Generar Vale de Entrega": ya no se ejecuta al
// exportar PDF (eso quedaba lento y bloqueaba la exportación). Requiere un
// filtro de paquetes activo, para saber qué TAGs incluye el vale. Si
// algunos de esos TAGs todavía no están marcados como entregados, los
// marca primero; si ya lo estaban todos, genera el vale directo.
document.getElementById('generateValeBtn').addEventListener('click', () => {
  const hasPkgFilter = state.selectedDW.size > 0 || state.selectedBW.size > 0;
  if (!hasPkgFilter) {
    showToast('Primero elige uno o varios paquetes (botón "Paquetes" o el filtro rápido DW/BW) para generar el vale.', 'error');
    return;
  }
  const snapshot = state.filtered.map(r => ({ ...r }));
  openValeModal(snapshot);
});

function openValeModal(rows) {
  const entregados = rows.filter(r => String(r.ent).toUpperCase() === 'Y').length;

  const modal = document.getElementById('deliveryModal');
  document.getElementById('deliveryModalSubtitle').textContent =
    `Este vale incluirá ${rows.length} TAG(s) (${entregados} ya marcado(s) como entregado(s) en la tabla). No modifica la columna ENTREGADO — eso lo marcas tú manualmente en la Tabla.`;
  document.getElementById('deliveryOrigen').value = localStorage.getItem('placas_almacen_origen') || '';
  document.getElementById('deliveryDestino').value = localStorage.getItem('placas_almacen_destino') || '';
  document.getElementById('deliveryEntrego').value = state.userName || '';
  document.getElementById('deliveryFoto').value = '';
  modal.classList.remove('hidden');

  const cleanup = () => {
    modal.classList.add('hidden');
    document.getElementById('deliveryOnlyExportBtn').onclick = null;
    document.getElementById('deliveryConfirmBtn').onclick = null;
    document.getElementById('deliveryModalCloseBtn').onclick = null;
  };

  document.getElementById('deliveryModalCloseBtn').onclick = cleanup;
  document.getElementById('deliveryOnlyExportBtn').onclick = cleanup;

  document.getElementById('deliveryConfirmBtn').onclick = async () => {
    const origen = document.getElementById('deliveryOrigen').value.trim();
    const destino = document.getElementById('deliveryDestino').value.trim();
    const entrego = document.getElementById('deliveryEntrego').value.trim();
    const fotoFile = document.getElementById('deliveryFoto').files[0] || null;
    cleanup();

    localStorage.setItem('placas_almacen_origen', origen);
    localStorage.setItem('placas_almacen_destino', destino);

    let fotoDataUrl = null;
    if (fotoFile) {
      try { fotoDataUrl = await fileToDataUrl(fotoFile); } catch (e) { /* si falla, el vale sale sin foto */ }
    }

    try {
      await generateValeEntrega(rows, { origen, destino, entrego, fotoDataUrl });
      showToast('Vale de entrega generado.', 'success');
    } catch (e) {
      showToast('El vale de entrega no se pudo generar: ' + e.message, 'error');
    }
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function apiGetNextValeNumber() {
  try {
    const data = await apiGet('nextValeNumber');
    if (data.ok) return { number: data.number, local: false };
  } catch (e) { /* seguimos al respaldo local */ }
  // Respaldo si no hay conexión: numeración local (no correlativa entre dispositivos).
  const key = 'placas_vale_local_counter';
  const n = (parseInt(localStorage.getItem(key) || '0', 10)) + 1;
  localStorage.setItem(key, String(n));
  return { number: n, local: true };
}

// Genera el PDF "Vale de Entrega" con el diseño de marca: banda de
// encabezado azul marino, tarjetas de almacén con acento de color, tabla
// de paquetes con columna TIPO y barra de total en naranja, foto opcional
// (la sección se omite por completo si no hay foto), y los bloques de
// firma de quien entrega (origen) y quien recibe (destino).
async function generateValeEntrega(rows, meta) {
  if (typeof window.jspdf === 'undefined') { showToast('No se pudo generar el vale: falta el módulo de PDF.', 'error'); return; }
  const { number, local } = await apiGetNextValeNumber();
  const folio = (local ? 'L-' : 'V-') + String(number).padStart(6, '0');

  const NAVY = [22, 50, 74];
  const ORANGE = [194, 103, 10];
  const BLUE = [37, 99, 235];
  const TEXT = [27, 36, 48];
  const MUTED = [102, 112, 133];
  const BORDER = [216, 222, 230];
  const LIGHT = [244, 246, 250];
  const ORANGE_LIGHT = [240, 178, 122];

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 32;

  // ---------- Banda de encabezado ----------
  const headerH = 108;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, headerH, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont(undefined, 'bold');
  doc.text('VALE DE ENTREGA', marginX, 38);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 214, 228);
  doc.text('PLACAS-TAG DW / BW', marginX, 54);
  doc.text('Control de material — Traspaso entre almacenes', marginX, 68);

  const sepX = pageW - 168;
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(3);
  doc.line(sepX, 20, sepX, 88);

  const fx = sepX + 20;
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...ORANGE_LIGHT);
  doc.text('FOLIO', fx, 26);
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text(folio, fx, 46);
  doc.setFontSize(7.5);
  doc.setTextColor(...ORANGE_LIGHT);
  doc.text('GENERADO', fx, 64);
  doc.setFontSize(9.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(255, 255, 255);
  const now = new Date();
  doc.text(`${now.toLocaleDateString('es-ES')} · ${now.toLocaleTimeString('es-ES')}`, fx, 78);

  let y = headerH + 28;

  // ---------- Tarjetas de almacén origen / destino ----------
  const cardW = (pageW - marginX * 2 - 20) / 2;
  const cardH = 62;

  function infoCard(x, accent, label, main) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, cardW, cardH, 6, 6, 'FD');
    doc.setFillColor(...accent);
    doc.roundedRect(x, y, cardW, 4, 2, 2, 'F');
    doc.setFontSize(7.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...MUTED);
    doc.text(label, x + 14, y + 22);
    doc.setFontSize(12);
    doc.setTextColor(...TEXT);
    doc.text(main || '—', x + 14, y + 38);
  }

  infoCard(marginX, BLUE, 'ALMACÉN DE ORIGEN', meta.origen);
  infoCard(marginX + cardW + 20, ORANGE, 'ALMACÉN DE DESTINO', meta.destino);

  y += cardH + 34;

  // ---------- Resumen de paquetes ----------
  // Igual que en el PDF de tarjetas: sin filtro de paquetes activo, solo se
  // resumen los DW; si se filtró explícitamente por BW (con o sin DW), esos
  // también aparecen. Así el vale muestra solo lo que realmente elegiste.
  const includeDW = state.selectedDW.size > 0 || state.selectedBW.size === 0;
  const includeBW = state.selectedBW.size > 0;

  const groups = {};
  rows.forEach(row => {
    const hasDW = row.dw !== '' && row.dw !== null && row.dw !== undefined;
    const hasBW = row.bw !== '' && row.bw !== null && row.bw !== undefined;
    if (hasDW && includeDW) { const k = 'DW-' + row.dw; groups[k] = groups[k] || { label: `PQT ${row.dw} DW`, tipo: 'DW', num: row.dw, count: 0 }; groups[k].count++; }
    if (hasBW && includeBW) { const k = 'BW-' + row.bw; groups[k] = groups[k] || { label: `PQT ${row.bw} BW`, tipo: 'BW', num: row.bw, count: 0 }; groups[k].count++; }
    if (!hasDW && !hasBW) { groups['SIN'] = groups['SIN'] || { label: 'Sin paquete asignado', tipo: '—', num: Infinity, count: 0 }; groups['SIN'].count++; }
  });
  const groupList = Object.values(groups).sort((a, b) => Number(a.num) - Number(b.num));
  const totalEnGrupos = groupList.reduce((sum, g) => sum + g.count, 0);

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...TEXT);
  doc.text('RESUMEN DE PAQUETES', marginX, y);
  doc.setFontSize(9.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`${groupList.length} paquete${groupList.length === 1 ? '' : 's'}`, pageW - marginX, y, { align: 'right' });
  y += 14;

  doc.autoTable({
    startY: y,
    head: [['PAQUETE', 'TIPO', 'CANTIDAD DE TAGS']],
    body: groupList.map(g => [g.label, g.tipo, String(g.count)]),
    foot: [[
      { content: 'TOTAL ENTREGADO', colSpan: 2 },
      { content: String(totalEnGrupos) }
    ]],
    showFoot: 'lastPage',
    styles: { fontSize: 9.5, cellPadding: 8, textColor: TEXT },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { textColor: MUTED }, 2: { halign: 'right', fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: LIGHT },
    footStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold', fontSize: 10.5 },
    margin: { left: marginX, right: marginX },
    tableWidth: pageW - marginX * 2
  });

  y = doc.lastAutoTable.finalY + 26;

  // ---------- Evidencia fotográfica (se omite por completo si no hay foto) ----------
  if (meta.fotoDataUrl) {
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...TEXT);
    doc.text('EVIDENCIA FOTOGRÁFICA', marginX, y);
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(1.5);
    doc.line(marginX, y + 4, marginX + 120, y + 4);
    y += 16;

    const boxW = pageW - marginX * 2;
    const boxH = 190;
    doc.setFillColor(...LIGHT);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(1);
    doc.roundedRect(marginX, y, boxW, boxH, 6, 6, 'FD');

    try {
      const dims = await getImageDimensions(meta.fotoDataUrl);
      const pad = 10;
      const maxW = boxW - pad * 2, maxH = boxH - pad * 2;
      const scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
      const w = dims.width * scale, h = dims.height * scale;
      doc.addImage(meta.fotoDataUrl, 'JPEG', marginX + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
    } catch (e) { /* si la imagen falla, dejamos el recuadro vacío */ }

    y += boxH + 30;
  } else {
    y += 6;
  }

  // ---------- Firmas: Entregó (origen) / Recibió (destino) ----------
  const sigW = (pageW - marginX * 2 - 24) / 2;
  if (y + 130 > pageH - 40) { doc.addPage(); y = 40; }

  function signatureBlock(x, accent, title, nombre) {
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...accent);
    doc.text(title, x, y);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('Nombre y firma del encargado', x, y + 13);

    const ny = y + 48;
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text('Nombre:', x, ny);
    if (nombre) { doc.setFont(undefined, 'bold'); doc.text(nombre, x + 42, ny); doc.setFont(undefined, 'normal'); }
    doc.setDrawColor(180, 188, 199);
    doc.setLineWidth(0.75);
    doc.line(x, ny + 6, x + sigW, ny + 6);

    const fy = ny + 34;
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('FIRMA', x, fy);
    doc.line(x, fy + 16, x + sigW, fy + 16);
  }

  signatureBlock(marginX, BLUE, 'ENTREGÓ – ALMACÉN DE ORIGEN', meta.entrego);
  signatureBlock(marginX + sigW + 24, ORANGE, 'RECIBIÓ – ALMACÉN DE DESTINO', '');

  addValeFooter(doc, folio);
  doc.save(`vale_entrega_${folio}.pdf`);
}

// Pie de página específico del Vale de Entrega (folio + numeración + crédito).
function addValeFooter(doc, folio) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 32;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(216, 222, 230);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageH - 32, pageW - marginX, pageH - 32);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(102, 112, 133);
    doc.text(`Vale de entrega ${folio} · ${APP_TITLE}`, marginX, pageH - 18);
    doc.text(`By Gustavo developer · Página ${i} de ${pageCount}`, pageW - marginX, pageH - 18, { align: 'right' });
  }
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Agrega numeración de páginas y el pie de página en todas las páginas de un PDF ya construido.
function addPdfFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('By Gustavo developer', 24, pageH - 14);
    doc.text(`Página ${i} de ${pageCount}`, pageW - 24, pageH - 14, { align: 'right' });
  }
}

document.getElementById('exportPdfBtn').addEventListener('click', () => {
  if (typeof window.jspdf === 'undefined') { showToast('No se pudo cargar el módulo de PDF. Revisa tu conexión.', 'error'); return; }

  const rows = state.filtered;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(14);
  doc.text(APP_TITLE, 30, 28);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generado: ${new Date().toLocaleString('es-ES')}  ·  ${rows.length} registro(s)`, 30, 44);

  const sortedRows = sortByPackageAsc(rows);

  // Si el filtro de paquetes solo usa DW o solo BW, no mostramos la otra
  // columna de paquete (queda vacía en todas las filas y solo confunde).
  const onlyDW = state.selectedDW.size > 0 && state.selectedBW.size === 0;
  const onlyBW = state.selectedBW.size > 0 && state.selectedDW.size === 0;

  let headers = PDF_TABLE_HEADERS;
  let rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.bw, row.g, row.o];

  if (onlyDW) {
    headers = PDF_TABLE_HEADERS.filter(h => h !== 'PQT BW');
    rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.g, row.o];
  } else if (onlyBW) {
    headers = PDF_TABLE_HEADERS.filter(h => h !== 'PQT DW');
    rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.bw, row.g, row.o];
  }

  const body = sortedRows.map(rowMapper);
  const descColIndex = headers.indexOf('DESCRIPTION');
  const tagColIndex = headers.indexOf('TAG');

  doc.autoTable({
    startY: 56,
    head: [headers],
    body: body,
    styles: { fontSize: 6.5, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 246, 250] },
    margin: { left: 20, right: 20, bottom: 30 },
    columnStyles: { [tagColIndex]: { cellWidth: 130 }, [descColIndex]: { cellWidth: 140 } }
  });

  addPdfFooter(doc);
  doc.save(`placas_export_${todayStr()}.pdf`);
});

// PDF en vertical, una "tarjeta" por paquete (encabezado de color + su tabla
// de TAGs), pensado para entregar el avance por paquete a cada subcontratista.
document.getElementById('exportPdfCardsBtn').addEventListener('click', () => {
  if (typeof window.jspdf === 'undefined') { showToast('No se pudo cargar el módulo de PDF. Revisa tu conexión.', 'error'); return; }

  const rows = state.filtered;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 24;
  const bottomLimit = pageH - 34;

  doc.setFontSize(14);
  doc.text(APP_TITLE, marginX, 28);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generado: ${new Date().toLocaleString('es-ES')}  ·  ${rows.length} registro(s)`, marginX, 44);

  // Sin filtro de paquetes activo, solo se arman tarjetas de DW (las de BW
  // quedan ocultas por defecto). Si se filtra explícitamente por BW (con o
  // sin DW), sí aparecen sus tarjetas.
  const includeDW = state.selectedDW.size > 0 || state.selectedBW.size === 0;
  const includeBW = state.selectedBW.size > 0;

  // Agrupar filas por paquete (una fila puede caer en DW y BW a la vez si tiene ambos)
  const groups = {};
  const pushToGroup = (key, suffix, num, row) => {
    if (!groups[key]) groups[key] = { suffix, num, rows: [] };
    groups[key].rows.push(row);
  };
  rows.forEach(row => {
    const hasDW = row.dw !== '' && row.dw !== null && row.dw !== undefined;
    const hasBW = row.bw !== '' && row.bw !== null && row.bw !== undefined;
    if (hasDW && includeDW) pushToGroup('DW-' + row.dw, 'DW', row.dw, row);
    if (hasBW && includeBW) pushToGroup('BW-' + row.bw, 'BW', row.bw, row);
    if (!hasDW && !hasBW) pushToGroup('SIN', '', '', row);
  });

  const groupList = Object.entries(groups).sort((a, b) => {
    const na = a[1].num === '' ? Infinity : Number(a[1].num);
    const nb = b[1].num === '' ? Infinity : Number(b[1].num);
    return na - nb || a[1].suffix.localeCompare(b[1].suffix);
  });

  let y = 60;
  const cardHeaders = ['ITEM', 'TAG', 'DISC.', 'SUBCONTRATISTA', 'SISTEMA', 'DESCRIPCIÓN', 'LVL', 'OBS'];
  const colWidths = [30, 62, 34, 82, 46, 157, 22, 114]; // suma ≈ pageW - 2*marginX (547 en A4 vertical)

  groupList.forEach(([key, group]) => {
    const total = group.rows.length;
    const entregados = group.rows.filter(r => String(r.ent).toUpperCase() === 'Y').length;
    const pct = total ? Math.round((entregados / total) * 100) : 0;
    const c = chipColorFor(key === 'SIN' ? 'sin' : group.num);
    const rgb = hexToRgb(c.fg);
    // Ej: "PQT 2 DW". Sin número (grupo "Sin paquete"), usa el texto tal cual.
    const titleText = group.num !== '' ? `PQT ${group.num} ${group.suffix}` : 'Sin paquete asignado';

    // Si no cabe ni el encabezado + una fila en lo que queda de página, saltamos de página.
    if (y + 60 > bottomLimit) { doc.addPage(); y = 40; }

    // Barra de encabezado del paquete
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(marginX, y, pageW - marginX * 2, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(titleText, marginX + 8, y + 15);
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.text(`${total} TAG(s)  ·  ${entregados} entregado(s) (${pct}%)`, pageW - marginX - 8, y + 15, { align: 'right' });
    y += 22;

    const body = group.rows.map(r => [r.i, r.tag, r.dis, r.sub, r.sys, r.desc, r.lvl, r.o]);

    doc.autoTable({
      startY: y,
      head: [cardHeaders],
      body: body,
      styles: { fontSize: 6.8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [229, 233, 240], textColor: [61, 71, 86], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 251] },
      margin: { left: marginX, right: marginX, bottom: 30 },
      columnStyles: {
        0: { cellWidth: colWidths[0] }, 1: { cellWidth: colWidths[1] }, 2: { cellWidth: colWidths[2] },
        3: { cellWidth: colWidths[3] }, 4: { cellWidth: colWidths[4] }, 5: { cellWidth: colWidths[5] },
        6: { cellWidth: colWidths[6] }, 7: { cellWidth: colWidths[7] }
      }
    });

    y = doc.lastAutoTable.finalY + 16;
  });

  addPdfFooter(doc);
  doc.save(`placas_paquetes_${todayStr()}.pdf`);
});

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  const s = (val === null || val === undefined) ? '' : String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ---------------- Helpers ----------------

function escapeHtml(val) {
  const s = (val === null || val === undefined) ? '' : String(val);
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

let toastTimer;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type || '');
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---------------- Instalar como app (PWA) ----------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* no es crítico si falla */ });
  });
}

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBtnLogin').classList.remove('hidden');
  document.getElementById('installBtnApp').classList.remove('hidden');
});

async function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installBtnLogin').classList.add('hidden');
  document.getElementById('installBtnApp').classList.add('hidden');
}

document.getElementById('installBtnLogin').addEventListener('click', triggerInstall);
document.getElementById('installBtnApp').addEventListener('click', triggerInstall);

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('installBtnLogin').classList.add('hidden');
  document.getElementById('installBtnApp').classList.add('hidden');
  showToast('App instalada correctamente.', 'success');
});

// ---------------- Init ----------------

if (state.role) {
  boot();
} else {
  showLogin();
}
