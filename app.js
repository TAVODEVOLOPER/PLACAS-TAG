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
const APP_VERSION = 'v1.8.0';

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

document.getElementById('pickerApplyBtn').addEventListener('click', () => {
  state.selectedDW = new Set(
    [...document.querySelectorAll('#pickerDW input:checked')].map(i => i.value)
  );
  state.selectedBW = new Set(
    [...document.querySelectorAll('#pickerBW input:checked')].map(i => i.value)
  );
  updatePackageFilterBtnLabel();
  document.getElementById('packagePickerModal').classList.add('hidden');
  state.page = 1;
  applyFilters();
});

document.getElementById('pickerClearBtn').addEventListener('click', () => {
  document.querySelectorAll('#pickerDW input, #pickerBW input').forEach(i => { i.checked = false; });
  state.selectedDW = new Set();
  state.selectedBW = new Set();
  updatePackageFilterBtnLabel();
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

// Si hay un filtro de paquetes activo y el usuario es administrador, ofrece
// marcar esos TAGs como "Entregado" antes de exportar. Trabaja sobre una
// copia (snapshot) de las filas para que el PDF exportado sea siempre
// consistente, incluso si al marcar "Entregado" alguna fila dejaría de
// cumplir el filtro actual (ej. filtro "Pendientes de entregar").
async function maybeConfirmDelivery(rows) {
  const hasPkgFilter = state.selectedDW.size > 0 || state.selectedBW.size > 0;
  if (state.role !== 'admin' || !hasPkgFilter) return rows;

  const pendientes = rows.filter(r => String(r.ent).toUpperCase() !== 'Y');
  if (pendientes.length === 0) return rows;

  const wantsMark = window.confirm(
    `Vas a exportar ${rows.length} TAG(s) de el/los paquete(s) filtrado(s).\n\n` +
    `¿Quieres marcar ${pendientes.length} TAG(s) pendiente(s) como "Entregado" antes de exportar?`
  );
  if (!wantsMark) return rows;

  showToast(`Marcando ${pendientes.length} TAG(s) como entregado(s)…`, 'success');
  for (const row of pendientes) {
    try {
      const result = await apiPost({ action: 'updateRow', r: row.r, entregado: 'Y', editor: state.userName });
      if (result.ok) {
        row.ent = 'Y';
        const master = state.rows.find(x => x.r === row.r);
        if (master) master.ent = 'Y';
      }
    } catch (e) { /* seguimos con las demás filas aunque una falle */ }
  }
  saveCache(state.rows);
  renderDashboard();
  applyFilters(); // refresca lo que se ve en pantalla
  showToast('Listo. Continuando con la exportación…', 'success');
  return rows;
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

document.getElementById('exportPdfBtn').addEventListener('click', async () => {
  if (typeof window.jspdf === 'undefined') { showToast('No se pudo cargar el módulo de PDF. Revisa tu conexión.', 'error'); return; }

  const snapshot = state.filtered.map(r => ({ ...r }));
  const rows = await maybeConfirmDelivery(snapshot);

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

  let headers = EXPORT_HEADERS;
  let rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.bw, row.g, row.ent, row.o];

  if (onlyDW) {
    headers = EXPORT_HEADERS.filter(h => h !== 'PQT BW');
    rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.g, row.ent, row.o];
  } else if (onlyBW) {
    headers = EXPORT_HEADERS.filter(h => h !== 'PQT DW');
    rowMapper = row => [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.bw, row.g, row.ent, row.o];
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
document.getElementById('exportPdfCardsBtn').addEventListener('click', async () => {
  if (typeof window.jspdf === 'undefined') { showToast('No se pudo cargar el módulo de PDF. Revisa tu conexión.', 'error'); return; }

  const snapshot = state.filtered.map(r => ({ ...r }));
  const rows = await maybeConfirmDelivery(snapshot);

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
  const cardHeaders = ['ITEM', 'TAG', 'DISC.', 'SUBCONTRATISTA', 'SISTEMA', 'DESCRIPCIÓN', 'LVL', 'ENTREG.', 'OBS'];
  const colWidths = [30, 62, 34, 82, 46, 132, 22, 44, 96]; // suma ≈ pageW - 2*marginX (547 en A4 vertical)

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

    const body = group.rows.map(r => [
      r.i, r.tag, r.dis, r.sub, r.sys, r.desc, r.lvl,
      String(r.ent).toUpperCase() === 'Y' ? 'Sí' : 'No',
      r.o
    ]);

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
        6: { cellWidth: colWidths[6] }, 7: { cellWidth: colWidths[7] }, 8: { cellWidth: colWidths[8] }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          data.cell.styles.textColor = data.cell.raw === 'Sí' ? [13, 148, 136] : [220, 38, 38];
        }
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
