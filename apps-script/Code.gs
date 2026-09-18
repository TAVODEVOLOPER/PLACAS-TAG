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
 *
 * SUBIR EXPORTACIONES A GOOGLE DRIVE (opcional):
 * 1. Crea (o elige) una carpeta en tu Google Drive.
 * 2. Ábrela y copia el ID de la URL:
 *    drive.google.com/drive/folders/ESTE-ES-EL-ID
 * 3. Pégalo abajo en FOLDER_ID, reemplazando el texto de ejemplo.
 * 4. Vuelve a implementar (nueva versión) — Google te pedirá autorizar
 *    un permiso nuevo (acceso a Drive) la primera vez.
 */

const SHEET_NAME = 'PLACAS';   // nombre de la pestaña con los datos
const HEADER_ROW = 1;          // fila donde están los encabezados
const FIRST_DATA_ROW = 2;      // primera fila con datos
const FOLDER_ID = '199wdC4Jt_lS17mTxQWIyQjfFBYC7e14_';

// Columnas fijas (A-H) + columnas editables (I-L) + auditoría opcional (M-N)
// + entrega por área: O = ENTREGADO_DW, P = ENTREGADO_BW
const COLS = {
  ITEM: 1, INSTALL: 2, DISCIPLINE: 3, SUBCONTRACTOR: 4, TAG: 5,
  SYSTEM: 6, DESCRIPTION: 7, LEVEL: 8,
  PQT_DW: 9, PQT_BW: 10, GQE: 11, OBS: 12,
  EDITOR: 13, UPDATED_AT: 14, ENTREGADO_DW: 15, ENTREGADO_BW: 16
};

/**
 * SOLO PARA TI (Gustavo): selecciona esta función "authorize" en el menú
 * desplegable de arriba (junto al botón ▶ Ejecutar) y pulsa Ejecutar UNA
 * vez. Fuerza la pantalla de autorización de Google para que incluya
 * permiso de Drive de LECTURA Y ESCRITURA (crea y borra un archivo de
 * prueba en tu carpeta) — las funciones con "_" al final, como
 * listDriveFiles_, no aparecen en ese menú porque Apps Script las trata
 * como privadas. Si corre sin errores y ves "Autorización OK (lectura y
 * escritura)" en el registro de ejecución, ya quedó todo permitido.
 */
function authorize() {
  SpreadsheetApp.getActiveSpreadsheet().getName(); // fuerza el permiso de la Sheet
  if (FOLDER_ID && FOLDER_ID.indexOf('PON_AQUI') === -1) {
    const folder = DriveApp.getFolderById(FOLDER_ID); // fuerza permiso de lectura en Drive
    const testFile = folder.createFile('prueba-autorizacion.txt', 'esto se puede borrar'); // fuerza permiso de escritura
    testFile.setTrashed(true); // limpia el archivo de prueba
  }
  Logger.log('Autorización OK (lectura y escritura)');
}

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

/** GET: ?action=getData | getSummary | nextValeNumber | listDriveFiles */
function doGet(e) {
  try {
    const action = (e.parameter.action || 'getData');
    if (action === 'getData') return jsonOut_(getData_());
    if (action === 'getSummary') return jsonOut_(getSummary_());
    if (action === 'nextValeNumber') return jsonOut_(getNextValeNumber_());
    if (action === 'listDriveFiles') return jsonOut_(listDriveFiles_());
    return jsonOut_({ ok: false, error: 'Acción desconocida: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/** POST: body JSON = { action: 'updateRow'|'updateRows'|'appendRow'|'appendRows'|'deleteRow'|'uploadFile'|'deleteFile', ... } */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'updateRow') {
      return jsonOut_(updateRow_(body));
    }
    if (body.action === 'updateRows') {
      return jsonOut_(updateRows_(body));
    }
    if (body.action === 'appendRow') {
      return jsonOut_(appendRow_(body));
    }
    if (body.action === 'appendRows') {
      return jsonOut_(appendRows_(body));
    }
    if (body.action === 'deleteRow') {
      return jsonOut_(deleteRow_(body));
    }
    if (body.action === 'uploadFile') {
      return jsonOut_(uploadFile_(body));
    }
    if (body.action === 'deleteFile') {
      return jsonOut_(deleteDriveFile_(body));
    }
    return jsonOut_({ ok: false, error: 'Acción desconocida: ' + body.action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Lista los archivos que hay en la carpeta de Drive configurada en FOLDER_ID. */
function listDriveFiles_() {
  if (!FOLDER_ID || FOLDER_ID.indexOf('PON_AQUI') !== -1) {
    return { ok: false, error: 'Falta configurar FOLDER_ID en Code.gs (carpeta de Google Drive).' };
  }
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const it = folder.getFiles();
    const files = [];
    while (it.hasNext()) {
      const f = it.next();
      files.push({
        id: f.getId(),
        name: f.getName(),
        size: f.getSize(),
        mimeType: f.getMimeType(),
        updated: f.getLastUpdated().toISOString(),
        url: f.getUrl()
      });
    }
    files.sort(function (a, b) { return new Date(b.updated) - new Date(a.updated); });
    return { ok: true, files: files };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Elimina (manda a la papelera de Drive) un archivo por su ID. Antes
 * verifica que el archivo esté dentro de la carpeta configurada en
 * FOLDER_ID, para que este endpoint no pueda borrar cualquier archivo de
 * tu Drive por error o mal uso.
 */
function deleteDriveFile_(body) {
  if (!FOLDER_ID || FOLDER_ID.indexOf('PON_AQUI') !== -1) {
    return { ok: false, error: 'Falta configurar FOLDER_ID en Code.gs (carpeta de Google Drive).' };
  }
  try {
    const file = DriveApp.getFileById(body.fileId);
    const parents = file.getParents();
    let belongs = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === FOLDER_ID) { belongs = true; break; }
    }
    if (!belongs) return { ok: false, error: 'Ese archivo no pertenece a la carpeta configurada en FOLDER_ID.' };
    file.setTrashed(true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Guarda un archivo (recibido en base64 desde la app) en la carpeta de
 * Google Drive configurada en FOLDER_ID. Usado para subir copias de los
 * PDF/Excel/CSV exportados desde la app.
 */
function uploadFile_(body) {
  if (!FOLDER_ID || FOLDER_ID.indexOf('PON_AQUI') !== -1) {
    return { ok: false, error: 'Falta configurar FOLDER_ID en Code.gs (carpeta de Google Drive).' };
  }
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const bytes = Utilities.base64Decode(body.base64);
    const blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', body.filename || 'archivo');
    const file = folder.createFile(blob);
    return { ok: true, fileId: file.getId(), url: file.getUrl() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Lee todas las filas y las devuelve como array de objetos compactos. */
function getData_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return { ok: true, rows: [] };

  const numRows = lastRow - FIRST_DATA_ROW + 1;
  const values = sheet.getRange(FIRST_DATA_ROW, 1, numRows, 16).getValues();

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
      edw: v[COLS.ENTREGADO_DW - 1],
      ebw: v[COLS.ENTREGADO_BW - 1],
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

/**
 * Folio correlativo para los "Vale de entrega" (independiente de la hoja,
 * guardado como propiedad del script). Cada llamada devuelve el siguiente
 * número y lo deja guardado, protegido con un bloqueo para que dos
 * personas exportando un vale al mismo tiempo no reciban el mismo número.
 */
function getNextValeNumber_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let n = parseInt(props.getProperty('VALE_COUNTER') || '0', 10);
    n += 1;
    props.setProperty('VALE_COUNTER', String(n));
    return { ok: true, number: n };
  } finally {
    lock.releaseLock();
  }
}

/** Actualiza cualquier dato de una fila (fijos o de clasificación), localizándola por ITEM si no se da "r". */
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
  if (body.entregadoDW !== undefined) sheet.getRange(targetRow, COLS.ENTREGADO_DW).setValue(body.entregadoDW);
  if (body.entregadoBW !== undefined) sheet.getRange(targetRow, COLS.ENTREGADO_BW).setValue(body.entregadoBW);
  if (body.install !== undefined) sheet.getRange(targetRow, COLS.INSTALL).setValue(body.install);
  if (body.discipline !== undefined) sheet.getRange(targetRow, COLS.DISCIPLINE).setValue(body.discipline);
  if (body.subcontractor !== undefined) sheet.getRange(targetRow, COLS.SUBCONTRACTOR).setValue(body.subcontractor);
  if (body.tag !== undefined) sheet.getRange(targetRow, COLS.TAG).setValue(body.tag);
  if (body.system !== undefined) sheet.getRange(targetRow, COLS.SYSTEM).setValue(body.system);
  if (body.description !== undefined) sheet.getRange(targetRow, COLS.DESCRIPTION).setValue(body.description);
  if (body.level !== undefined) sheet.getRange(targetRow, COLS.LEVEL).setValue(body.level);
  // El ITEM se actualiza al final para no interferir con la búsqueda de
  // arriba (que puede usar body.item para localizar la fila).
  if (body.newItem !== undefined) sheet.getRange(targetRow, COLS.ITEM).setValue(body.newItem);

  const now = new Date().toISOString();
  sheet.getRange(targetRow, COLS.EDITOR).setValue(body.editor || '');
  sheet.getRange(targetRow, COLS.UPDATED_AT).setValue(now);

  return { ok: true, row: targetRow, updatedAt: now };
}

/**
 * Agrega una fila NUEVA al final de la hoja (un TAG que no existía antes).
 * Se usa desde "Importar Excel" cuando el ITEM/TAG del archivo no
 * coincide con ninguna fila existente. Requiere al menos TAG; el resto de
 * columnas quedan vacías si no se informan.
 */
function appendRow_(body) {
  if (!body.tag) return { ok: false, error: 'No se puede crear una fila sin TAG.' };

  const sheet = getSheet_();
  const newRow = sheet.getLastRow() + 1;
  const now = new Date().toISOString();

  const values = new Array(16).fill('');
  values[COLS.ITEM - 1] = body.item || '';
  values[COLS.INSTALL - 1] = body.install || '';
  values[COLS.DISCIPLINE - 1] = body.discipline || '';
  values[COLS.SUBCONTRACTOR - 1] = body.subcontractor || '';
  values[COLS.TAG - 1] = body.tag;
  values[COLS.SYSTEM - 1] = body.system || '';
  values[COLS.DESCRIPTION - 1] = body.description || '';
  values[COLS.LEVEL - 1] = body.level || '';
  values[COLS.PQT_DW - 1] = body.pqtDW || '';
  values[COLS.PQT_BW - 1] = body.pqtBW || '';
  values[COLS.GQE - 1] = body.gqe || '';
  values[COLS.OBS - 1] = body.obs || '';
  values[COLS.EDITOR - 1] = body.editor || '';
  values[COLS.UPDATED_AT - 1] = now;
  values[COLS.ENTREGADO_DW - 1] = body.entregadoDW || '';
  values[COLS.ENTREGADO_BW - 1] = body.entregadoBW || '';

  sheet.getRange(newRow, 1, 1, values.length).setValues([values]);
  return { ok: true, row: newRow, updatedAt: now };
}

/**
 * Versión "por lote" de updateRow_: recibe MUCHAS actualizaciones en una
 * sola petición (body.updates = [{r, pqtDW, pqtBW, gqe, obs, entregadoDW,
 * entregadoBW}, ...]) y las aplica todas dentro de esta misma ejecución.
 * Se usa desde "Importar Excel" para evitar mandar cientos de peticiones
 * HTTP individuales (eso es lo que provocaba que Google empezara a
 * rechazarlas por exceso de solicitudes en poco tiempo).
 */
function updateRows_(body) {
  if (!body.updates || !Array.isArray(body.updates) || body.updates.length === 0) {
    return { ok: false, error: 'No se recibieron filas para actualizar.' };
  }
  const sheet = getSheet_();
  const now = new Date().toISOString();
  const results = [];

  body.updates.forEach(u => {
    try {
      if (!u.r) { results.push({ r: u.r, ok: false, error: 'Falta el número de fila.' }); return; }
      if (u.pqtDW !== undefined) sheet.getRange(u.r, COLS.PQT_DW).setValue(u.pqtDW);
      if (u.pqtBW !== undefined) sheet.getRange(u.r, COLS.PQT_BW).setValue(u.pqtBW);
      if (u.gqe !== undefined) sheet.getRange(u.r, COLS.GQE).setValue(u.gqe);
      if (u.obs !== undefined) sheet.getRange(u.r, COLS.OBS).setValue(u.obs);
      if (u.entregadoDW !== undefined) sheet.getRange(u.r, COLS.ENTREGADO_DW).setValue(u.entregadoDW);
      if (u.entregadoBW !== undefined) sheet.getRange(u.r, COLS.ENTREGADO_BW).setValue(u.entregadoBW);
      sheet.getRange(u.r, COLS.EDITOR).setValue(u.editor || body.editor || '');
      sheet.getRange(u.r, COLS.UPDATED_AT).setValue(now);
      results.push({ r: u.r, ok: true });
    } catch (err) {
      results.push({ r: u.r, ok: false, error: String(err) });
    }
  });

  return { ok: true, results: results, updatedAt: now };
}

/**
 * Versión "por lote" de appendRow_: recibe MUCHAS filas nuevas en una sola
 * petición (body.rows = [{tag, item, install, ...}, ...]) y las escribe
 * todas juntas al final de la hoja con una sola operación, dentro de esta
 * misma ejecución — mucho más rápido y sin el límite de peticiones que
 * afecta a cientos de llamadas individuales.
 */
function appendRows_(body) {
  if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
    return { ok: false, error: 'No se recibieron filas para crear.' };
  }
  const sheet = getSheet_();
  const startRow = sheet.getLastRow() + 1;
  const now = new Date().toISOString();

  const matrix = body.rows.map(r => {
    const values = new Array(16).fill('');
    values[COLS.ITEM - 1] = r.item || '';
    values[COLS.INSTALL - 1] = r.install || '';
    values[COLS.DISCIPLINE - 1] = r.discipline || '';
    values[COLS.SUBCONTRACTOR - 1] = r.subcontractor || '';
    values[COLS.TAG - 1] = r.tag || '';
    values[COLS.SYSTEM - 1] = r.system || '';
    values[COLS.DESCRIPTION - 1] = r.description || '';
    values[COLS.LEVEL - 1] = r.level || '';
    values[COLS.PQT_DW - 1] = r.pqtDW || '';
    values[COLS.PQT_BW - 1] = r.pqtBW || '';
    values[COLS.GQE - 1] = r.gqe || '';
    values[COLS.OBS - 1] = r.obs || '';
    values[COLS.EDITOR - 1] = r.editor || body.editor || '';
    values[COLS.UPDATED_AT - 1] = now;
    values[COLS.ENTREGADO_DW - 1] = r.entregadoDW || '';
    values[COLS.ENTREGADO_BW - 1] = r.entregadoBW || '';
    return values;
  });

  sheet.getRange(startRow, 1, matrix.length, 16).setValues(matrix);

  const created = body.rows.map((r, idx) => ({ tag: r.tag, item: r.item, row: startRow + idx }));
  return { ok: true, count: matrix.length, created: created, updatedAt: now };
}

/**
 * "Elimina" un TAG. OJO: en vez de borrar la fila de la hoja (lo que
 * correría hacia arriba el número de fila de TODAS las filas siguientes,
 * y dejaría desactualizadas las referencias que otros usuarios tengan
 * guardadas en caché), esta función VACÍA todas las columnas de esa fila.
 * Al quedar sin TAG, getData_ la deja de mostrar automáticamente — para
 * la app y para quien la use, el TAG desaparece igual, pero de forma
 * segura para el resto de filas.
 */
function deleteRow_(body) {
  if (!body.r) return { ok: false, error: 'Falta el número de fila.' };
  const sheet = getSheet_();
  const numCols = 16;
  const blank = new Array(numCols).fill('');
  sheet.getRange(body.r, 1, 1, numCols).setValues([blank]);
  return { ok: true, row: body.r };
}
