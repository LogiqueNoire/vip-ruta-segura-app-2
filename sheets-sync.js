'use strict';

const crypto = require('crypto');
const { q } = require('./db');

const SPREADSHEET_ID = String(process.env.SHEETS_LIBRO_ID || '1N6_HaUEenitqv11YvTB2sJiQjJ2yfHtUapm2k7g-fcY').trim();
const SERVICE_ACCOUNT_EMAIL = String(process.env.SHEETS_SERVICE_ACCOUNT_EMAIL || '').trim();
const PRIVATE_KEY = String(process.env.SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS = [
  {
    name: 'usuarios',
    sql: `select u.id::text as id, u.id::text as request_id, u.email, u.dni, u.name, u.phone,
        u.is_admin, u.blocked, u.blocked_reason, u.emerg_name, u.emerg_phone,
        u.pax_status, u.pax_note, u.created_at,
        case when dp.user_id is null then 'pasajero' else 'conductor' end as role,
        'active'::text as status, dp.status as drv_status, dp.review_note as drv_note,
        dp.lic_num, dp.lic_cat, dp.vtype, dp.model, dp.plate, dp.color,
        dp.soat_until::text as soat_until, dp.rt_ok, dp.yape_phone, dp.plin_phone,
        dp.submitted_at, dp.reviewed_at
      from users u left join driver_profiles dp on dp.user_id = u.id order by u.id`
  },
  {
    name: 'viajes',
    sql: `select id::text as id, id::text as request_id, driver_id::text as driver_id,
        from_off, from_off as "from", trip_date::text as trip_date, trip_date::text as date,
        dep_time, dep_at, price, seats, vtype, veh_model, veh_plate, veh_color,
        status, started_at, finished_at, created_at from trips order by id`
  },
  {
    name: 'reservas',
    sql: `select id::text as id, id::text as request_id, code, trip_id::text as trip_id,
        user_id::text as user_id, status, hold_until, subtotal, promo_name, promo_pct,
        total, rated, created_at from bookings order by id`
  },
  {
    name: 'asientos_reserva',
    sql: `select id::text as id, id::text as request_id, booking_id::text as booking_id,
        trip_id::text as trip_id, seat, active, boarded_at, released_at, noshow, pax_rating
      from booking_seats order by id`
  },
  {
    name: 'pagos',
    sql: `select id::text as id, id::text as request_id, booking_id::text as booking_id,
        method, amount, operation_no, status, note, decided_by::text as decided_by,
        decided_at, created_at from payments order by id`
  },
  {
    name: 'resenas',
    sql: `select id::text as id, id::text as request_id, booking_id::text as booking_id,
        trip_id::text as trip_id, driver_id::text as driver_id, passenger_id::text as passenger_id,
        stars, tags, flags, comment, created_at from reviews order by id`
  },
  {
    name: 'incidentes',
    sql: `select id::text as id, id::text as request_id, kind, trip_id::text as trip_id,
        user_id::text as user_id, booking_id::text as booking_id, issues, lat, lon, status,
        resolved_by::text as resolved_by, resolved_at, created_at from incidents order by id`
  },
  {
    name: 'ubicaciones_en_vivo',
    sql: `select trip_id::text as id, trip_id::text as request_id, trip_id::text as trip_id,
        lat, lon, speed_kmh, updated_at from live_locations order by trip_id`
  }
];
const REQUIRED_HEADERS = {
  usuarios: [['id', 'request_id'], ['email'], ['name']],
  viajes: [['id', 'request_id'], ['driver_id'], ['from_off', 'from'], ['trip_date', 'date']],
  reservas: [['id', 'request_id'], ['trip_id'], ['user_id'], ['status']],
  asientos_reserva: [['id', 'request_id'], ['trip_id'], ['seat'], ['active']],
  pagos: [['id', 'request_id'], ['booking_id'], ['status']],
  resenas: [['id', 'request_id'], ['booking_id'], ['driver_id'], ['stars']],
  incidentes: [['id', 'request_id'], ['kind'], ['status']],
  ubicaciones_en_vivo: [['id', 'request_id', 'trip_id'], ['lat'], ['lon']]
};

let token = '';
let tokenExpiresAt = 0;
let running = false;
let retryAfter = 0;
let retryDelay = 15000;

const isConfigured = () => !!(SPREADSHEET_ID && SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY);
const base64url = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const columnName = n => {
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};
const quoteSheet = name => "'" + name.replace(/'/g, "''") + "'";
const normalizeSheetTitle = name => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cellValue = value => Array.isArray(value) ? value.join(', ') : value == null ? '' : value;

async function accessToken() {
  if (token && Date.now() < tokenExpiresAt - 60000) return token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64url({ alg: 'RS256', typ: 'JWT' }) + '.' + base64url({
    iss: SERVICE_ACCOUNT_EMAIL, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  });
  const assertion = unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), PRIVATE_KEY).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(`Google OAuth token request failed (HTTP ${response.status}).`);
  token = result.access_token;
  tokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
  return token;
}

async function sheetsRequest(path, options) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}${path}`, {
    ...options,
    headers: Object.assign({ authorization: 'Bearer ' + await accessToken() }, options && options.headers),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Google Sheets API HTTP ${response.status}: ${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

async function readSheetData() {
  const metadata = await sheetsRequest('?fields=sheets(properties(title,gridProperties))', { method: 'GET' });
  const configuredSheets = SHEETS.map(sheet => {
    const info = (metadata.sheets || []).find(item =>
      normalizeSheetTitle(item.properties.title) === normalizeSheetTitle(sheet.name));
    if (!info) throw new Error(`No existe la pestaña "${sheet.name}" en el Google Sheet.`);
    const grid = info.properties.gridProperties;
    return { ...sheet, title: info.properties.title, grid };
  });
  const ranges = configuredSheets.map(sheet =>
    `${quoteSheet(sheet.title)}!A1:${columnName(sheet.grid.columnCount)}${sheet.grid.rowCount}`);
  const query = ranges.map(range => 'ranges=' + encodeURIComponent(range)).join('&');
  const result = await sheetsRequest(`/values:batchGet?${query}`, { method: 'GET' });
  return configuredSheets.map((sheet, index) => {
    const values = result.valueRanges && result.valueRanges[index] && result.valueRanges[index].values || [];
    const headers = (values[0] || []).map(value => String(value).replace(/^\uFEFF/, '').trim().toLowerCase());
    if (!headers.length || headers.every(value => !value)) {
      throw new Error(`La pestaña "${sheet.name}" no tiene encabezados en la primera fila.`);
    }
    if (!REQUIRED_HEADERS[sheet.name].every(group => group.some(header => headers.includes(header)))) {
      throw new Error(`Los encabezados de la pestaña "${sheet.name}" no coinciden con el formato esperado.`);
    }
    return { ...sheet, headers, previousRows: Math.max(0, values.length - 1) };
  });
}

async function syncSnapshot() {
  const state = (await q('select revision, synced_revision from sheets_sync_state where id = 1')).rows[0];
  if (!state || state.revision === state.synced_revision) return false;
  const revision = state.revision;
  const sheets = await readSheetData();
  const data = await Promise.all(sheets.map(async sheet => (await q(sheet.sql)).rows));
  const updates = sheets.map((sheet, index) => {
    const rows = data[index].map(row => sheet.headers.map(header => cellValue(row[header])));
    return rows.length ? {
      range: `${quoteSheet(sheet.title)}!A2:${columnName(sheet.headers.length)}${rows.length + 1}`,
      majorDimension: 'ROWS',
      values: rows
    } : null;
  }).filter(Boolean);

  if (updates.length) {
    await sheetsRequest('/values:batchUpdate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: updates })
    });
  }

  const clears = sheets.map((sheet, index) => {
    const newRows = data[index].length;
    const firstStaleRow = newRows + 2;
    const lastStaleRow = sheet.previousRows + 1;
    if (lastStaleRow < firstStaleRow) return null;
    return `${quoteSheet(sheet.title)}!A${firstStaleRow}:${columnName(sheet.headers.length)}${lastStaleRow}`;
  }).filter(Boolean);
  if (clears.length) {
    await sheetsRequest('/values:batchClear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ranges: clears })
    });
  }

  await q(`update sheets_sync_state set synced_revision = $1, last_synced_at = now()
    where id = 1 and revision = $1`, [revision]);
  return true;
}

async function syncIfNeeded() {
  if (!isConfigured() || running || Date.now() < retryAfter) return false;
  running = true;
  try {
    const synced = await syncSnapshot();
    retryAfter = 0;
    retryDelay = 15000;
    return synced;
  } catch (error) {
    retryAfter = Date.now() + retryDelay;
    retryDelay = Math.min(retryDelay * 2, 300000);
    throw error;
  } finally {
    running = false;
  }
}

module.exports = { isConfigured, syncIfNeeded, syncSnapshot };
