// ============================================================
// PORRA MUNDIAL 2026 — Google Apps Script (Servidor API)
// ============================================================
// INSTRUCCIONES DE INSTALACIÓN:
// 1. Abre tu Google Sheet "Porra Mundial 2026"
// 2. Extensiones → Apps Script
// 3. Borra el contenido existente y pega todo este código
// 4. Guarda (Ctrl+S)
// 5. Despliega: Implementar → Nueva implementación
//    - Tipo: Aplicación web
//    - Ejecutar como: Yo (tu cuenta)
//    - Quién tiene acceso: Cualquier usuario de Google
// 6. Copia la URL que te da — la necesitarás en el HTML
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

// ── Nombres de hojas ──────────────────────────────────────
const SHEET = {
  config:     'Config',
  partic:     'Participantes',
  partidos:   'Partidos',
  predGrupos: 'Predicciones_Grupos',
  predElim:   'Predicciones_Eliminatorias',
};

// ── CORS helper ───────────────────────────────────────────
function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Router principal GET ──────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action;
    const email  = e.parameter.email || '';

    if (action === 'ping')           return corsResponse({ ok: true });
    if (action === 'getConfig')      return corsResponse(getConfig());
    if (action === 'getPartidos')    return corsResponse(getPartidos());
    if (action === 'getParticipante')return corsResponse(getParticipante(email));
    if (action === 'getPredicciones')return corsResponse(getPredicciones(email));
    if (action === 'getPredElim')    return corsResponse(getPredElim(email));
    if (action === 'getRanking')     return corsResponse(getRanking());

    return corsResponse({ error: 'Acción no reconocida: ' + action });
  } catch(err) {
    return corsResponse({ error: err.toString() });
  }
}

// ── Router principal POST ─────────────────────────────────
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'savePrediccion')    return corsResponse(savePrediccion(body));
    if (action === 'savePredElim')      return corsResponse(savePredElim(body));

    return corsResponse({ error: 'Acción POST no reconocida: ' + action });
  } catch(err) {
    return corsResponse({ error: err.toString() });
  }
}

// ════════════════════════════════════════════════════════════
// LECTURAS
// ════════════════════════════════════════════════════════════

function getConfig() {
  const ws   = SS.getSheetByName(SHEET.config);
  const rows = ws.getDataRange().getValues();
  const cfg  = {};
  rows.slice(1).forEach(r => { if (r[0]) cfg[r[0]] = r[1]; });
  return { ok: true, data: cfg };
}

function getPartidos() {
  const ws   = SS.getSheetByName(SHEET.partidos);
  const rows = ws.getDataRange().getValues();
  const hdrs = rows[0];
  const data = rows.slice(1).map(r => {
    const obj = {};
    hdrs.forEach((h, i) => { obj[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return obj;
  });
  return { ok: true, data };
}

function getParticipante(email) {
  if (!email) return { ok: false, error: 'Email requerido' };
  const ws   = SS.getSheetByName(SHEET.partic);
  const rows = ws.getDataRange().getValues();
  const hdrs = rows[0];
  const row  = rows.slice(1).find(r => r[0].toString().toLowerCase() === email.toLowerCase());
  if (!row) return { ok: false, error: 'Participante no encontrado. Contacta al organizador.' };
  const obj = {};
  hdrs.forEach((h, i) => { obj[h] = row[i]; });
  return { ok: true, data: obj };
}

function getPredicciones(email) {
  if (!email) return { ok: false, error: 'Email requerido' };
  const ws   = SS.getSheetByName(SHEET.predGrupos);
  const rows = ws.getDataRange().getValues();
  const hdrs = rows[0];
  const data = rows.slice(1)
    .filter(r => r[0].toString().toLowerCase() === email.toLowerCase())
    .map(r => {
      const obj = {};
      hdrs.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
  return { ok: true, data };
}

function getPredElim(email) {
  if (!email) return { ok: false, error: 'Email requerido' };
  const ws   = SS.getSheetByName(SHEET.predElim);
  const rows = ws.getDataRange().getValues();
  const hdrs = rows[0];
  const data = rows.slice(1)
    .filter(r => r[0].toString().toLowerCase() === email.toLowerCase())
    .map(r => {
      const obj = {};
      hdrs.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
  return { ok: true, data };
}

function getRanking() {
  const ws   = SS.getSheetByName(SHEET.partic);
  const rows = ws.getDataRange().getValues();
  const hdrs = rows[0];
  const data = rows.slice(1)
    .filter(r => r[2] === true) // Activo = TRUE
    .map(r => {
      const obj = {};
      hdrs.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    })
    .sort((a, b) => (b['Pts_Total'] || 0) - (a['Pts_Total'] || 0));
  return { ok: true, data };
}

// ════════════════════════════════════════════════════════════
// ESCRITURAS
// ════════════════════════════════════════════════════════════

function savePrediccion(body) {
  const { email, id_partido, pred_a, pred_b } = body;
  if (!email || !id_partido) return { ok: false, error: 'Datos incompletos' };

  // Verificar que el partido es editable y no ha empezado
  const wsP  = SS.getSheetByName(SHEET.partidos);
  const rowsP = wsP.getDataRange().getValues();
  const hdrsP = rowsP[0];
  const partido = rowsP.slice(1).find(r => r[0] === id_partido);
  if (!partido) return { ok: false, error: 'Partido no encontrado' };

  const editable   = partido[hdrsP.indexOf('Editable')];
  const fechaHora  = partido[hdrsP.indexOf('Fecha_Hora')];
  if (!editable)             return { ok: false, error: 'Este partido ya no es editable' };
  if (new Date() >= new Date(fechaHora)) return { ok: false, error: 'El partido ya ha comenzado' };

  // Buscar y actualizar la fila en Predicciones_Grupos
  const ws   = SS.getSheetByName(SHEET.predGrupos);
  const rows = ws.getDataRange().getValues();
  const hdrs = rows[0];
  const iEmail    = hdrs.indexOf('Email_Usuario');
  const iPartido  = hdrs.indexOf('ID_Partido');
  const iPredA    = hdrs.indexOf('Prediccion_A');
  const iPredB    = hdrs.indexOf('Prediccion_B');

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][iEmail].toString().toLowerCase() === email.toLowerCase() &&
        rows[i][iPartido] === id_partido) {
      ws.getRange(i + 1, iPredA + 1).setValue(pred_a === '' ? null : Number(pred_a));
      ws.getRange(i + 1, iPredB + 1).setValue(pred_b === '' ? null : Number(pred_b));
      return { ok: true, message: 'Predicción guardada' };
    }
  }
  return { ok: false, error: 'Fila de predicción no encontrada para ese usuario y partido' };
}

function savePredElim(body) {
  const { email, id_llave, equipo_predicho, pred_goles_a, pred_goles_b } = body;
  if (!email || !id_llave) return { ok: false, error: 'Datos incompletos' };

  // Verificar fecha límite eliminatorias desde Config
  const cfg = getConfig().data;
  const fechaLimite = new Date(cfg['FECHA_LIMITE_ELIM']);
  if (new Date() > fechaLimite) return { ok: false, error: 'El plazo de predicciones de eliminatorias ha cerrado' };
  if (cfg['EDICION_ACTIVA'] === false) return { ok: false, error: 'La edición está bloqueada por el organizador' };

  const ws   = SS.getSheetByName(SHEET.predElim);
  const rows = ws.getDataRange().getValues();
  const hdrs = rows[0];
  const iEmail   = hdrs.indexOf('Email_Usuario');
  const iLlave   = hdrs.indexOf('ID_Llave');
  const iEquipo  = hdrs.indexOf('Equipo_Predicho');
  const iGolesA  = hdrs.indexOf('Pred_Goles_A');
  const iGolesB  = hdrs.indexOf('Pred_Goles_B');

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][iEmail].toString().toLowerCase() === email.toLowerCase() &&
        rows[i][iLlave] === id_llave) {
      ws.getRange(i + 1, iEquipo + 1).setValue(equipo_predicho || '');
      if (iGolesA >= 0) ws.getRange(i + 1, iGolesA + 1).setValue(pred_goles_a === '' ? null : Number(pred_goles_a));
      if (iGolesB >= 0) ws.getRange(i + 1, iGolesB + 1).setValue(pred_goles_b === '' ? null : Number(pred_goles_b));
      return { ok: true, message: 'Predicción de eliminatoria guardada' };
    }
  }
  return { ok: false, error: 'Fila no encontrada para ese usuario y llave' };
}
