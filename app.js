/**
 * PLACAS APP - Frontend
 * ------------------------------------------------------------
 * Habla con el backend de Apps Script (Code.gs) para leer y
 * escribir directamente sobre tu Google Sheet.
 */

const STORAGE_KEY_URL = 'placas_api_url';
const STORAGE_KEY_NAME = 'placas_user_name';
const PAGE_SIZE = 60;

let state = {
  apiUrl: localStorage.getItem(STORAGE_KEY_URL) || '',
  userName: localStorage.getItem(STORAGE_KEY_NAME) || '',
  rows: [],
  filtered: [],
  page: 1,
  dirty: new Map() // r -> {dw,bw,g,o}
};

// ---------------- Setup ----------------

function showSetup(errorMsg) {
  document.getElementById('setupScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('apiUrlInput').value = state.apiUrl;
  document.getElementById('userNameInput').value = state.userName;
  const err = document.getElementById('setupError');
  if (errorMsg) {
    err.textContent = errorMsg;
    err.classList.remove('hidden');
  } else {
    err.classList.add('hidden');
  }
}

function showApp() {
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

document.getElementById('saveSetupBtn').addEventListener('click', async () => {
  const url = document.getElementById('apiUrlInput').value.trim();
  const name = document.getElementById('userNameInput').value.trim();
  if (!url) { showSetup('Pega la URL de tu Apps Script Web App.'); return; }
  state.apiUrl = url;
  state.userName = name;
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_NAME, name);
  await boot();
});

document.getElementById('settingsBtn').addEventListener('click', () => showSetup());

// ---------------- API ----------------

async function apiGet(action) {
  const res = await fetch(`${state.apiUrl}?action=${action}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiPost(payload) {
  // text/plain evita el preflight CORS en Apps Script Web Apps
  const res = await fetch(state.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// ---------------- Boot / sync ----------------

async function boot() {
  showApp();
  setSyncStatus('Cargando…');
  try {
    const data = await apiGet('getData');
    if (!data.ok) throw new Error(data.error || 'Error desconocido');
    state.rows = data.rows;
    populateFilterOptions();
    applyFilters();
    renderDashboard();
    setSyncStatus('Actualizado ' + new Date().toLocaleTimeString('es-ES'));
  } catch (err) {
    setSyncStatus('Error de conexión');
    showSetup('No se pudo conectar: ' + err.message + '. Revisa la URL y que la Web App esté desplegada con acceso "Cualquier usuario con el enlace".');
  }
}

function setSyncStatus(text) {
  document.getElementById('syncStatus').textContent = text;
}

document.getElementById('refreshBtn').addEventListener('click', boot);

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
  let clasificadas = 0, gqe = 0;
  const porDW = {}, porBW = {}, porDisc = {};

  rows.forEach(row => {
    const hasDW = row.dw !== '' && row.dw !== null && row.dw !== undefined;
    const hasBW = row.bw !== '' && row.bw !== null && row.bw !== undefined;
    if (hasDW || hasBW) clasificadas++;
    if (String(row.g).toUpperCase() === 'Y') gqe++;
    if (hasDW) porDW[row.dw] = (porDW[row.dw] || 0) + 1;
    if (hasBW) porBW[row.bw] = (porBW[row.bw] || 0) + 1;
    const d = row.dis || '(sin disciplina)';
    porDisc[d] = (porDisc[d] || 0) + 1;
  });

  const pendientes = total - clasificadas;
  const pct = total ? Math.round((clasificadas / total) * 100) : 0;

  document.getElementById('kpiTotal').textContent = total.toLocaleString('es-ES');
  document.getElementById('kpiClasificadas').textContent = clasificadas.toLocaleString('es-ES');
  document.getElementById('kpiPendientes').textContent = pendientes.toLocaleString('es-ES');
  document.getElementById('kpiGQE').textContent = gqe.toLocaleString('es-ES');
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';

  renderBarChart('chartDW', porDW, 'PQT ');
  renderBarChart('chartBW', porBW, 'PQT ');
  renderBarChart('chartDisciplina', porDisc, '');
}

function renderBarChart(elId, dict, prefix) {
  const el = document.getElementById(elId);
  const entries = Object.entries(dict).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Sin datos todavía.</p>';
    return;
  }
  const max = entries[0][1];
  el.innerHTML = entries.map(([key, count]) => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(String(key))}">${prefix}${escapeHtml(String(key))}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
      <span class="bar-count">${count}</span>
    </div>
  `).join('');
}

// ---------------- Filters ----------------

function populateFilterOptions() {
  const disciplines = [...new Set(state.rows.map(r => r.dis).filter(Boolean))].sort();
  const subs = [...new Set(state.rows.map(r => r.sub).filter(Boolean))].sort();

  fillSelect('filterDiscipline', disciplines, 'Disciplina (todas)');
  fillSelect('filterSubcontractor', subs, 'Subcontratista (todos)');
}

function fillSelect(id, values, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

['searchInput', 'filterDiscipline', 'filterSubcontractor', 'filterEstado', 'filterGQE'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { state.page = 1; applyFilters(); });
});

function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const disc = document.getElementById('filterDiscipline').value;
  const sub = document.getElementById('filterSubcontractor').value;
  const estado = document.getElementById('filterEstado').value;
  const gqeFilter = document.getElementById('filterGQE').value;

  state.filtered = state.rows.filter(row => {
    if (disc && row.dis !== disc) return false;
    if (sub && row.sub !== sub) return false;

    const hasDW = row.dw !== '' && row.dw !== null && row.dw !== undefined;
    const hasBW = row.bw !== '' && row.bw !== null && row.bw !== undefined;
    const clasificada = hasDW || hasBW;
    if (estado === 'clasificada' && !clasificada) return false;
    if (estado === 'pendiente' && clasificada) return false;

    if (gqeFilter === 'Y' && String(row.g).toUpperCase() !== 'Y') return false;

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
  tbody.innerHTML = pageRows.map(rowHtml).join('');

  document.getElementById('pageInfo').textContent = `Página ${state.page} de ${totalPages}`;

  tbody.querySelectorAll('.editable').forEach(input => {
    input.addEventListener('input', onFieldChange);
  });
  tbody.querySelectorAll('.row-save-btn').forEach(btn => {
    btn.addEventListener('click', onSaveRow);
  });
}

function rowHtml(row) {
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
  const btn = e.target;
  const tr = btn.closest('tr');
  const r = Number(tr.dataset.row);

  const payload = {
    action: 'updateRow',
    r: r,
    pqtDW: tr.querySelector('[data-field="dw"]').value.trim(),
    pqtBW: tr.querySelector('[data-field="bw"]').value.trim(),
    gqe: tr.querySelector('[data-field="g"]').value.trim().toUpperCase(),
    obs: tr.querySelector('[data-field="o"]').value.trim(),
    editor: state.userName
  };

  btn.textContent = 'Guardando…';
  try {
    const result = await apiPost(payload);
    if (!result.ok) throw new Error(result.error || 'Error desconocido');

    // reflejar en el estado local para que el dashboard cuadre
    const rowObj = state.rows.find(x => x.r === r);
    if (rowObj) {
      rowObj.dw = payload.pqtDW;
      rowObj.bw = payload.pqtBW;
      rowObj.g = payload.gqe;
      rowObj.o = payload.obs;
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

// ---------------- Export CSV ----------------

document.getElementById('exportBtn').addEventListener('click', () => {
  const headers = ['ITEM', 'INSTALL', 'DISCIPLINE', 'SUBCONTRACTOR', 'TAG', 'SYSTEM', 'DESCRIPTION', 'LEVEL', 'PQT DW', 'PQT BW', 'GQE', 'OBS'];
  const lines = [headers.join(',')];
  state.filtered.forEach(row => {
    const vals = [row.i, row.ins, row.dis, row.sub, row.tag, row.sys, row.desc, row.lvl, row.dw, row.bw, row.g, row.o];
    lines.push(vals.map(csvEscape).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `placas_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

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
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ---------------- Init ----------------

if (state.apiUrl) {
  boot();
} else {
  showSetup();
}
