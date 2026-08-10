const { sheetsClient } = require('./googleAuth');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

/** A1-safe sheet name (Google Sheets tab names can contain spaces/symbols; we quote them). */
function q(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

async function spreadsheetMeta() {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' });
  return res.data.sheets || [];
}

async function sheetExists(name) {
  const meta = await spreadsheetMeta();
  return meta.some((s) => s.properties.title === name);
}

/** Mirrors GAS sheet_(name, headers): create the tab + header row if missing. */
async function ensureSheet(name, headers) {
  const sheets = sheetsClient();
  const meta = await spreadsheetMeta();
  let props = meta.find((s) => s.properties.title === name);
  if (!props) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
    });
    props = { properties: res.data.replies[0].addSheet.properties };
  }
  if (headers && headers.length) {
    const first = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${q(name)}!1:1`,
    });
    const firstRow = (first.data.values && first.data.values[0]) || [];
    if (firstRow.join('').trim() === '') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${q(name)}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: props.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat.textFormat.bold',
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId: props.properties.sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    }
  }
  return props.properties;
}

/** Mirrors GAS rows_(name): {head, data} or empty if the sheet doesn't exist. */
async function rows(name) {
  if (!(await sheetExists(name))) return { head: [], data: [] };
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: q(name),
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const values = res.data.values || [];
  if (!values.length) return { head: [], data: [] };
  const head = values[0];
  const data = values.slice(1);
  return { head, data };
}

/** Mirrors GAS objs_(name): array of {Header: value, __row: sheetRowNumber}. */
async function objs(name) {
  const r = await rows(name);
  const out = [];
  for (let i = 0; i < r.data.length; i++) {
    const row = r.data[i];
    if (row.join('').trim() === '') continue;
    const o = {};
    for (let c = 0; c < r.head.length; c++) o[String(r.head[c])] = row[c] === undefined ? '' : row[c];
    o.__row = i + 2;
    out.push(o);
  }
  return out;
}

/** Mirrors GAS appendObj_(name, headers, obj). */
async function appendObj(name, headers, obj) {
  await ensureSheet(name, headers);
  const row = headers.map((h) => (obj[h] === undefined || obj[h] === null ? '' : obj[h]));
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: q(name),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return row;
}

/** Mirrors GAS updateByKey_(name, keyCol, keyVal, patch). */
async function updateByKey(name, keyCol, keyVal, patch) {
  const r = await rows(name);
  if (r.data.length === 0) return false;
  const ki = r.head.indexOf(keyCol);
  if (ki < 0) return false;
  for (let i = 0; i < r.data.length; i++) {
    if (String(r.data[i][ki] || '').trim().toLowerCase() === String(keyVal).trim().toLowerCase()) {
      const rowCopy = r.head.map((_, ci) => (r.data[i][ci] === undefined ? '' : r.data[i][ci]));
      for (const k of Object.keys(patch)) {
        const ci = r.head.indexOf(k);
        if (ci > -1) rowCopy[ci] = patch[k];
      }
      const sheets = sheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${q(name)}!A${i + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowCopy] },
      });
      return true;
    }
  }
  return false;
}

/** Patches a specific known row number (1-based, header = row 1) by column name. */
async function updateRow(name, rowNumber, patch) {
  const r = await rows(name);
  const idx = rowNumber - 2;
  if (idx < 0 || idx >= r.data.length) return false;
  const rowCopy = r.head.map((_, ci) => (r.data[idx][ci] === undefined ? '' : r.data[idx][ci]));
  for (const k of Object.keys(patch)) {
    const ci = r.head.indexOf(k);
    if (ci > -1) rowCopy[ci] = patch[k];
  }
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${q(name)}!A${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [rowCopy] },
  });
  return true;
}

/** Deletes a single data row (1-based sheet row number, header = row 1). */
async function deleteRow(name, rowNumber) {
  const props = await ensureSheet(name);
  const sheets = sheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: props.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

/** Writes an arbitrary block of raw rows starting at A2 (used for seed data). */
async function writeBlock(name, startRow, values) {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${q(name)}!A${startRow}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

module.exports = { ensureSheet, sheetExists, rows, objs, appendObj, updateByKey, updateRow, deleteRow, writeBlock };
