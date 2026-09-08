/**
 * PLACAS APP - Backend (Google Apps Script)
 * ------------------------------------------------------------
 * Convierte esta Google Sheet en una API JSON que la app web
 * (index.html) usa para leer y guardar datos en vivo.
 *
 * INSTALACIÓN:
 * 1. Abre tu Google Sheet (con la pestaña "PLACAS" ya importada).
 * 2. Extensiones > Apps Script.
 * 3. Borra el contenido de Code.gs y pega TODO este archivo.
 * 4. Ajusta SHEET_NAME abajo si tu pestaña se llama distinto.
 * 5. Implementar > Nueva implementación > Tipo: Aplicación web.
 *      - Ejecutar como: Yo (tu cuenta)
 *      - Quién tiene acceso: Cualquier usuario con el enlace
 *        (o "Cualquier usuario de [tu organización]" si usas
 *         Google Workspace y quieres restringirlo a tu equipo)
 * 6. Copia la URL que te da ("Web app URL") y pégala en la app
 *    web (index.html) la primera vez que la abras.
 * 7. Cada vez que edites este script, tienes que crear una
 *    "Nueva implementación" (o gestionar implementaciones >
 *    editar > nueva versión) para que los cambios se publiquen.
 */

const SHEET_NAME = 'PLACAS';   // nombre de la pestaña con los datos
const HEADER_ROW = 1;          // fila donde están los encabezados
const FIRST_DATA_ROW = 2;      // primera fila con datos

// Columnas fijas (A-H) + columnas editables (I-L) + auditoría opcional (M-N)
const COLS = {
  ITEM: 1, INSTALL: 2, DISCIPLINE: 3, SUBCONTRACTOR: 4, TAG: 5,
  SYSTEM: 6, DESCRIPTION: 7, LEVEL: 8,
  PQT_DW: 9, PQT_BW: 10, GQE: 11, OBS: 12,
  EDITOR: 13, UPDATED_AT: 14
};

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No se encontró la pestaña "' + SHEET_NAME + '"');
  return sheet;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** GET: ?action=getData | getSummary */
function doGet(e) {
  try {
    const action = (e.parameter.action || 'getData');
    if (action === 'getData') return jsonOut_(getData_());
    if (action === 'getSummary') return jsonOut_(getSummary_());
    return jsonOut_({ ok: false, error: 'Acción desconocida: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/** POST: body JSON = { action: 'updateRow', item, pqtDW, pqtBW, gqe, obs, editor } */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'updateRow') {
      return jsonOut_(updateRow_(body));
    }
    return jsonOut_({ ok: false, error: 'Acción desconocida: ' + body.action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Lee todas las filas y las devuelve como array de objetos compactos. */
function getData_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return { ok: true, rows: [] };

  const numRows = lastRow - FIRST_DATA_ROW + 1;
  const values = sheet.getRange(FIRST_DATA_ROW, 1, numRows, 14).getValues();

  const rows = [];
  for (let idx = 0; idx < values.length; idx++) {
    const v = values[idx];
    if (!v[COLS.TAG - 1]) continue; // saltar filas vacías
    rows.push({
      r: FIRST_DATA_ROW + idx,              // fila real en la hoja (clave de actualización)
      i: v[COLS.ITEM - 1],
      ins: v[COLS.INSTALL - 1],
      dis: v[COLS.DISCIPLINE - 1],
      sub: v[COLS.SUBCONTRACTOR - 1],
      tag: v[COLS.TAG - 1],
      sys: v[COLS.SYSTEM - 1],
      desc: v[COLS.DESCRIPTION - 1],
      lvl: v[COLS.LEVEL - 1],
      dw: v[COLS.PQT_DW - 1],
      bw: v[COLS.PQT_BW - 1],
      g: v[COLS.GQE - 1],
      o: v[COLS.OBS - 1],
      ed: v[COLS.EDITOR - 1] || '',
      up: v[COLS.UPDATED_AT - 1] || ''
    });
  }
  return { ok: true, rows: rows, generatedAt: new Date().toISOString() };
}

/** Calcula un resumen agregado (para el dashboard). */
function getSummary_() {
  const data = getData_();
  const rows = data.rows;

  const summary = {
    total: rows.length,
    clasificadas: 0,
    pendientes: 0,
    creadasGQE: 0,
    porDW: {},
    porBW: {},
    porDisciplina: {}
  };

  rows.forEach(function (row) {
    const hasDW = row.dw !== '' && row.dw !== null && row.dw !== undefined;
    const hasBW = row.bw !== '' && row.bw !== null && row.bw !== undefined;
    if (hasDW || hasBW) summary.clasificadas++; else summary.pendientes++;
    if (String(row.g).toUpperCase() === 'Y') summary.creadasGQE++;

    if (hasDW) {
      const k = String(row.dw);
      summary.porDW[k] = (summary.porDW[k] || 0) + 1;
    }
    if (hasBW) {
      const k = String(row.bw);
      summary.porBW[k] = (summary.porBW[k] || 0) + 1;
    }
    const disc = row.dis || '(sin disciplina)';
    summary.porDisciplina[disc] = (summary.porDisciplina[disc] || 0) + 1;
  });

  return { ok: true, summary: summary, generatedAt: new Date().toISOString() };
}

/** Actualiza PQT DW / PQT BW / GQE / OBS de una fila, localizándola por ITEM. */
function updateRow_(body) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();

  // Preferimos la fila real (r) si viene informada; si no, buscamos por ITEM.
  let targetRow = body.r;
  if (!targetRow) {
    const itemCol = sheet.getRange(FIRST_DATA_ROW, COLS.ITEM, lastRow - FIRST_DATA_ROW + 1, 1).getValues();
    for (let idx = 0; idx < itemCol.length; idx++) {
      if (String(itemCol[idx][0]) === String(body.item)) {
        targetRow = FIRST_DATA_ROW + idx;
        break;
      }
    }
  }
  if (!targetRow) return { ok: false, error: 'No se encontró el ITEM ' + body.item };

  if (body.pqtDW !== undefined) sheet.getRange(targetRow, COLS.PQT_DW).setValue(body.pqtDW);
  if (body.pqtBW !== undefined) sheet.getRange(targetRow, COLS.PQT_BW).setValue(body.pqtBW);
  if (body.gqe !== undefined) sheet.getRange(targetRow, COLS.GQE).setValue(body.gqe);
  if (body.obs !== undefined) sheet.getRange(targetRow, COLS.OBS).setValue(body.obs);

  const now = new Date().toISOString();
  sheet.getRange(targetRow, COLS.EDITOR).setValue(body.editor || '');
  sheet.getRange(targetRow, COLS.UPDATED_AT).setValue(now);

  return { ok: true, row: targetRow, updatedAt: now };
}
