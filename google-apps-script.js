/**
 * Terra Nova — Wholesale Order Logger + Mailer + Product Inventory
 *
 * Deploy as Web App:  Execute as: Me  |  Who has access: Anyone
 *
 * Routes (all via GET + ?action=...):
 *   getProducts    — returns Products sheet as JSON array
 *   saveProducts   — writes payload JSON to Products sheet
 *   submitOrder    — logs order to Orders sheet + sends email  (default)
 *   orderform
 */

const ORDER_EMAIL       = 'terranova.mtl.ai@gmail.com';
const SPREADSHEET_ID    = '10H9CTzRHUGK6SrukXklahr0ebQvJR8bueNL8VZEmses';
const ORDERS_SHEET      = 'Orders';
const PRODUCTS_SHEET    = 'Products';
const COUNTER_SHEET     = 'Counter';
const VENDORS_SHEET     = 'Vendors';
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/* ── Order ID generator (persistent counter) ─────────────── */
function getNextOrderId() {
  const ss = getSpreadsheet();
  let counterSheet = ss.getSheetByName(COUNTER_SHEET);
  if (!counterSheet) {
    counterSheet = ss.insertSheet(COUNTER_SHEET);
    counterSheet.getRange('A1').setValue(0);
  }
  const cell  = counterSheet.getRange('A1');
  const count = Number(cell.getValue()) + 1;
  cell.setValue(count);

  const now  = new Date();
  const pad  = function(n, w) { return String(n).padStart(w, '0'); };
  const yyyy = now.getFullYear();
  const mo   = pad(now.getMonth() + 1, 2);
  const dd   = pad(now.getDate(), 2);
  const hh   = pad(now.getHours(), 2);
  const min  = pad(now.getMinutes(), 2);
  const seq  = pad(count, 4);

  return 'TN-' + yyyy + mo + dd + '-' + hh + min + '-' + seq;
}

/* ── Admin-only actions (require pw param) ───────────────── */
var ADMIN_ACTIONS = {
  uploadImage:       true,
  saveProduct:       true,
  deleteProduct:     true,
  saveProducts:      true,
  getOrders:         true,
  updateOrderStatus: true,
  updateOrderLines:  true,
  getStoreContacts:  true,
  getVendors:        true,
  saveVendors:       true,
  deleteStore:       true,
  // getVendor and saveStore are used by the public order form — no auth required
};

/* ── Router ──────────────────────────────────────────────── */
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'submitOrder';
  try {
    if (ADMIN_ACTIONS[action]) {
      var token = (e.parameter && e.parameter.token) ? e.parameter.token : '';
      if (!isValidAdminToken_(token)) {
        return json({ status: 'error', message: 'Unauthorized' });
      }
    }
    if      (action === 'getProducts')       return handleGetProducts(e);
    else if (action === 'getVendor')         return handleGetVendor(e);
    else if (action === 'lookupStore')       return handleLookupStore(e);
    else if (action === 'uploadImage')       return json({ status: 'error', message: 'Use POST for uploadImage' });
    else if (action === 'verifyPassword')    return json({ status: 'error', message: 'Use POST for verifyPassword' });
    else if (action === 'saveStore')         return json({ status: 'error', message: 'Use POST for saveStore' });
    else if (action === 'submitOrder' || action === '') return json({ status: 'error', message: 'Use POST for submitOrder' });
    else                                     return json({ status: 'error', message: 'Use POST for ' + action });
  } catch (err) {
    return json({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  var request = parseRequest_(e);
  const action = request.action || '';
  try {
    if (ADMIN_ACTIONS[action]) {
      var token = request.token || '';
      if (!isValidAdminToken_(token)) {
        return json({ status: 'error', message: 'Unauthorized' });
      }
    }
    if (action === 'uploadImage') return handleUploadImage(e);
    if (action === 'verifyPassword') return handleVerifyPassword(e);
    if (action === 'saveProduct') return handleSaveProduct(e);
    if (action === 'deleteProduct') return handleDeleteProduct(e);
    if (action === 'saveProducts') return handleSaveProducts(e);
    if (action === 'getOrders') return handleGetOrders();
    if (action === 'updateOrderStatus') return handleUpdateOrderStatus(e);
    if (action === 'updateOrderLines') return handleUpdateOrderLines(e);
    if (action === 'getVendors') return handleGetVendors();
    if (action === 'saveVendors') return handleSaveVendors(e);
    if (action === 'getStoreContacts') return handleGetStoreContacts(e);
    if (action === 'deleteStore') return handleDeleteStore(e);
    if (action === 'lookupStore') return handleLookupStore(e);
    if (action === 'saveStore') return handleSaveStore(e);
    if (action === 'submitOrder') return handleSubmitOrder(e);
    return json({ status: 'error', message: 'Unknown POST action: ' + action });
  } catch (err) {
    return json({ status: 'error', message: err.toString() });
  }
}

/* ── Products: read ──────────────────────────────────────── */
function handleGetProducts(e) {
  var vendorCode = (e && e.parameter && e.parameter.vendor)
    ? e.parameter.vendor.trim().toUpperCase()
    : null;

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(PRODUCTS_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return json([]);
  }

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  var products = rows.slice(1)
    .filter(r => r[0] !== '')
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });

  // Normalise status field
  products.forEach(function(p) {
    if (!p.status) {
      p.status = (p.available !== false && p.available !== 'FALSE') ? 'available' : 'unavailable';
    }
    p.available = (p.status === 'available');
  });

  // When called with a vendor code (customer context): filter hidden + vendor-restricted products
  if (vendorCode) {
    products = products.filter(function(p) {
      if (p.status === 'hidden') return false;
      var codes = [];
      try { codes = JSON.parse(p.vendorCodes || '[]'); } catch (ignored) {}
      if (codes.length > 0 && codes.map(function(c) { return c.toUpperCase(); }).indexOf(vendorCode) === -1) return false;
      return true;
    });
  }

  return json(products);
}

/* Server-side GitHub image upload */
function handleUploadImage(e) {
  var body = {};
  if (e.postData && e.postData.contents) {
    body = JSON.parse(e.postData.contents);
  } else if (e.parameter && e.parameter.payload) {
    body = JSON.parse(e.parameter.payload);
  }

  var filename = normalizeImageFilename_(body.filename);
  var contentBase64 = String(body.contentBase64 || '');
  if (!filename || !contentBase64) {
    return json({ status: 'error', message: 'Missing filename or contentBase64' });
  }
  if (contentBase64.length > 7 * 1024 * 1024) {
    return json({ status: 'error', message: 'Image payload too large' });
  }

  Utilities.base64Decode(contentBase64);
  uploadGithubImage_(filename, contentBase64);
  return json({ status: 'ok', filename: filename, path: 'images/' + filename });
}

/* ── Products: upsert single row ────────────────────────────── */
function handleSaveProduct(e) {
  var p      = JSON.parse(getPayload_(e));
  var ss     = getSpreadsheet();
  var sheet  = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) sheet = ss.insertSheet(PRODUCTS_SHEET);

  // Ensure headers exist
  if (sheet.getLastRow() === 0) {
    var headers = ['id','name','barcode','sku','srp','cost','dealer','img','orderUnit','unitsPerOrder','unitLabel','available','status','vendorCodes','category','style','description'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var status = p.status || (p.available !== false ? 'available' : 'unavailable');
  var rowData = [
    p.id, safeSheetText_(p.name), safeSheetText_(p.barcode), safeSheetText_(p.sku),
    Number(p.srp), Number(p.cost || 0), Number(p.cost || 0) * 1.11,
    safeSheetText_(p.img), safeSheetText_(p.orderUnit), Number(p.unitsPerOrder), safeSheetText_(p.unitLabel),
    status === 'available', status,
    safeSheetText_(p.vendorCodes || '[]'),
    safeSheetText_(p.category || 'Gift Novelties'),
    safeSheetText_(p.style || ''),
    safeSheetText_(p.description || ''),
  ];

  // Find existing row by id
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return json({ status: 'ok', action: 'updated' });
    }
  }
  // Not found — append
  sheet.appendRow(rowData);
  return json({ status: 'ok', action: 'inserted' });
}

/* ── Products: delete single row by id ──────────────────────── */
function handleDeleteProduct(e) {
  var request = parseRequest_(e);
  var id    = String(request.body.id || (e.parameter && e.parameter.id) || '');
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Products sheet not found' });
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return json({ status: 'ok' });
    }
  }
  return json({ status: 'error', message: 'Product not found: ' + id });
}

/* ── Products: write (supports chunked saves via append=true) ── */
function handleSaveProducts(e) {
  var request  = parseRequest_(e);
  var products = JSON.parse(getPayload_(e));
  var append   = String(request.body.append !== undefined ? request.body.append : (e.parameter && e.parameter.append)) === 'true';
  var ss       = getSpreadsheet();
  var sheet    = ss.getSheetByName(PRODUCTS_SHEET);

  if (!sheet) sheet = ss.insertSheet(PRODUCTS_SHEET);

  if (!append) {
    // First chunk: clear and write headers
    sheet.clearContents();
    var headers = ['id','name','barcode','sku','srp','cost','dealer','img','orderUnit','unitsPerOrder','unitLabel','available','status','vendorCodes','category','style','description'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  products.forEach(function(p) {
    var status = p.status || (p.available !== false ? 'available' : 'unavailable');
    sheet.appendRow([
      p.id, safeSheetText_(p.name), safeSheetText_(p.barcode), safeSheetText_(p.sku),
      Number(p.srp), Number(p.cost || 0), Number(p.cost || 0) * 1.11,
      safeSheetText_(p.img), safeSheetText_(p.orderUnit), Number(p.unitsPerOrder), safeSheetText_(p.unitLabel),
      status === 'available',
      status,
      safeSheetText_(p.vendorCodes || '[]'),
      safeSheetText_(p.category || 'Gift Novelties'),
      safeSheetText_(p.style || ''),
      safeSheetText_(p.description || ''),
    ]);
  });

  return json({ status: 'ok', saved: products.length });
}

/* ── Orders: submit + email ──────────────────────────────── */
function handleSubmitOrder(e) {
  const data    = JSON.parse(getPayload_(e));
  const orderId = getNextOrderId();
  const date    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var normalized = normalizeSubmittedOrder_(data);
  data.lines = normalized.lines;
  data.totalOrderUnits = normalized.totalOrderUnits;
  data.totalIndividualUnits = normalized.totalIndividualUnits;
  data.totalDealer = normalized.totalDealer;
  data.totalRetail = normalized.totalRetail;
  data.vendorCompany = safeSheetText_(String(data.vendorCompany || ''));
  data.vendorCode = safeSheetText_(String(data.vendorCode || '').trim().toUpperCase());
  data.storeCode = safeSheetText_(String(data.storeCode || '').trim().toUpperCase());
  data.customerEmail = safeSheetText_(String(data.customerEmail || '').trim());
  data.contactName = safeSheetText_(String(data.contactName || '').trim());
  data.comments = safeSheetText_(String(data.comments || '').trim());
  data.agentName = safeSheetText_(String(data.agentName || '').trim());
  data.agentEmail = safeSheetText_(String(data.agentEmail || '').trim());
  data.orderId  = orderId;
  data.date     = date;
  const ss    = getSpreadsheet();
  let   sheet = ss.getSheetByName(ORDERS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    const headers = [
      'Date','Order ID','Product','SKU','Barcode',
      'Order Unit','Order Qty','Total Units',
      'Dealer/Unit ($)','Line Dealer ($)',
      'SRP/Unit ($)','Line SRP ($)',
      'Order Sent','Invoice Sent','Payment Received','Cancelled',
      'Company','Vendor Code','Store Code','Customer Email','Comments',
      'Agent Name','Agent Email',
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  data.lines.forEach(function(line) {
    sheet.appendRow([
      data.date, data.orderId,
      safeSheetText_(line.name), safeSheetText_(line.sku), safeSheetText_(line.barcode),
      safeSheetText_(line.orderUnit), line.qty, line.units,
      line.dealerUnit, line.lineDealer,
      line.srpUnit,       line.lineSRP,
    ]);
  });

  // Totals summary row
  sheet.appendRow([
    data.date, data.orderId + ' — TOTAL',
    '— ' + data.lines.length + ' product(s) —',
    '','','',
    data.totalOrderUnits, data.totalIndividualUnits,
    '', data.totalDealer,
    '', data.totalRetail,
    '','','','',                  // status checkboxes (cols 13–16)
    data.vendorCompany  || '',    // col 17
    data.vendorCode     || '',    // col 18
    data.storeCode      || '',    // col 19
    data.customerEmail  || '',    // col 20
    data.comments       || '',    // col 21
    data.agentName      || '',    // col 22
    data.agentEmail     || '',    // col 23
  ]);
  sheet.getRange(sheet.getLastRow(), 1, 1, 12)
       .setFontStyle('italic')
       .setBackground('#f0f4f8');

  sendOrderEmail(data);
  return json({ status: 'ok', orderId: data.orderId });
}

/* ── Email ───────────────────────────────────────────────── */
function sendOrderEmail(data) {
  const rows = data.lines.map(function(line) {
    return '<tr>'
      + td(line.name)
      + td(line.qty + ' ' + line.orderUnit + (line.qty !== 1 ? 's' : ''), 'center')
      + td(line.units + ' ' + (line.unitLabel || 'units'), 'center')
      + td('$' + line.lineDealer.toFixed(2), 'right')
      + '</tr>';
  }).join('');

  const html = ''
    + '<div style="font-family:sans-serif;max-width:620px;color:#1a202c">'
    + '<div style="background:#d8e4ef;padding:20px 24px">'
    + '<h1 style="color:#1a202c;margin:0 0 12px;font-size:1.3rem">Terra Nova — New Wholesale Order</h1>'
    + '<table style="border-collapse:collapse;width:100%">'
    + (data.vendorCompany ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0;width:110px">Company</td><td style="color:#1a202c;font-size:.85rem;font-weight:700">' + htmlEscape_(data.vendorCompany) + '</td></tr>' : '')
    + (data.storeCode     ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0">Store Code</td><td style="color:#1a202c;font-size:.85rem;font-family:monospace;letter-spacing:.05em">' + htmlEscape_(data.storeCode) + '</td></tr>' : '')
    + (data.contactName   ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0">Contact</td><td style="color:#1a202c;font-size:.85rem">' + htmlEscape_(data.contactName) + '</td></tr>' : '')
    + (data.customerEmail ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0">Email</td><td style="color:#1a202c;font-size:.85rem">' + htmlEscape_(data.customerEmail) + '</td></tr>' : '')
    + (data.agentName     ? '<tr><td style="color:#4a6080;font-size:.75rem;padding:2px 0">Agent</td><td style="color:#1a202c;font-size:.85rem">' + htmlEscape_(data.agentName) + '</td></tr>' : '')
    + '</table>'
    + '</div>'
    + '<div style="padding:24px">'
    + '<p style="color:#718096;margin:20px 0 16px">Order <strong>' + data.orderId + '</strong> &nbsp;·&nbsp; ' + data.date + '</p>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="background:#f0f4f8">'
    + th('Product') + th('Order Qty') + th('Total Units') + th('Line Total', 'right')
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '<div style="margin-top:20px;background:#f0f4f8;border-radius:6px;padding:14px 16px">'
    + row2('Total Order Units',      data.totalOrderUnits)
    + row2('Total Individual Units', data.totalIndividualUnits)
    + row2('Dealer Total',            '$' + data.totalDealer.toFixed(2))
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr><td style="color:#718096">Retail Value (SRP)</td><td align="right" style="color:#2d9c5e">$' + data.totalRetail.toFixed(2) + '</td></tr></table>'
    + '</div>'
    + (data.comments ? '<div style="margin-top:16px;padding:12px 14px;background:#fffbeb;border-left:3px solid #f6ad55;border-radius:4px"><strong style="font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:#92400e">Comments</strong><p style="margin:4px 0 0;color:#1a202c;font-size:.9rem">' + htmlEscape_(data.comments) + '</p></div>' : '')
    + '</div></div>';

  MailApp.sendEmail({ to: ORDER_EMAIL, subject: 'New Terra Nova Order — ' + data.orderId, htmlBody: html });
  if (data.customerEmail) {
    MailApp.sendEmail({ to: data.customerEmail, subject: 'Your Terra Nova Order Confirmation — ' + data.orderId, htmlBody: html });
  }
  if (data.agentEmail) {
    MailApp.sendEmail({ to: data.agentEmail, subject: 'New Terra Nova Order — ' + data.orderId, htmlBody: html });
  }
}

/* ── Orders: read (admin) ────────────────────────────────── */
function handleGetOrders() {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json([]);

  const rows   = sheet.getDataRange().getValues();
  // Columns: 0=Date 1=OrderID 2=Product 3=SKU 4=Barcode 5=OrderUnit
  //          6=OrderQty 7=TotalUnits 8=DealerUnit 9=LineDealer 10=SRPUnit 11=LineSRP
  //          12=OrderSent 13=InvoiceSent 14=PaymentReceived 15=Cancelled
  //          16=Company 17=VendorCode 18=StoreCode 19=CustomerEmail

  const orders  = [];
  let   current = null;

  for (var i = 1; i < rows.length; i++) {
    var row     = rows[i];
    var orderId = String(row[1]);

    if (orderId.indexOf(' — TOTAL') !== -1) {
      // Summary row — close current order
      if (current) {
        current.totalOrderUnits      = row[6];
        current.totalIndividualUnits = row[7];
        current.totalDealer          = row[9];
        current.totalRetail          = row[11];
        current.orderSent            = row[12] === true;
        current.invoiceSent          = row[13] === true;
        current.paymentReceived      = row[14] === true;
        current.cancelled            = row[15] === true;
        current.company              = row[16] || '';
        current.vendorCode           = row[17] || '';
        current.storeCode            = row[18] || '';
        current.customerEmail        = row[19] || '';
        current.comments             = row[20] || '';
        current.agentName            = row[21] || '';
        current.agentEmail           = row[22] || '';
        orders.push(current);
        current = null;
      }
    } else if (row[0] !== '' && orderId !== '') {
      // Line row — start or extend current order
      if (!current || current.orderId !== orderId) {
        current = { orderId: orderId, date: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), lines: [] };
      }
      current.lines.push({
        name:         row[2],
        sku:          row[3],
        orderUnit:    row[5],
        qty:          row[6],
        units:        row[7],
        lineDealer: row[9],
        lineSRP:      row[11],
      });
    }
  }

  orders.reverse(); // most recent first
  return json(orders.filter(function(o) { return o.lines && o.lines.length > 0; }));
}

/* ── Orders: update line quantities ─────────────────────── */
function handleUpdateOrderLines(e) {
  var payload = JSON.parse(getPayload_(e));
  var orderId = payload.orderId;
  var lines   = payload.lines; // [{name, qty, units, lineDealer, lineSRP}]

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Orders sheet not found' });

  var data        = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    var rowOrderId = String(data[i][1]);

    if (rowOrderId === orderId && String(data[i][2]) !== '') {
      // Line row — update or mark for deletion
      var lineName = String(data[i][2]);
      var line = null;
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].name === lineName) { line = lines[j]; break; }
      }
      if (line) {
        sheet.getRange(i + 1, 7).setValue(line.qty);
        sheet.getRange(i + 1, 8).setValue(line.units);
        sheet.getRange(i + 1, 10).setValue(line.lineDealer);
        sheet.getRange(i + 1, 12).setValue(line.lineSRP);
      } else {
        rowsToDelete.push(i + 1); // removed by user
      }
    } else if (rowOrderId === orderId + ' \u2014 TOTAL') {
      var tQty    = lines.reduce(function(s, l) { return s + l.qty; }, 0);
      var tUnits  = lines.reduce(function(s, l) { return s + l.units; }, 0);
      var tDealer = lines.reduce(function(s, l) { return s + l.lineDealer; }, 0);
      var tSRP    = lines.reduce(function(s, l) { return s + l.lineSRP; }, 0);
      sheet.getRange(i + 1, 7).setValue(tQty);
      sheet.getRange(i + 1, 8).setValue(tUnits);
      sheet.getRange(i + 1, 10).setValue(tDealer);
      sheet.getRange(i + 1, 12).setValue(tSRP);
      break;
    }
  }

  // Delete from bottom to top so row indices stay valid
  for (var k = rowsToDelete.length - 1; k >= 0; k--) {
    sheet.deleteRow(rowsToDelete[k]);
  }

  return json({ status: 'ok' });
}

/* ── Orders: update status checkbox ─────────────────────── */
function handleUpdateOrderStatus(e) {
  var payload = JSON.parse(getPayload_(e));
  var orderId = payload.orderId;
  var field   = payload.field;
  var value   = payload.value;

  // Map field name to column number (1-based)
  var colMap = { orderSent: 13, invoiceSent: 14, paymentReceived: 15, cancelled: 16, comments: 21 };
  var col    = colMap[field];
  if (!col) return json({ status: 'error', message: 'Unknown field: ' + field });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Orders sheet not found' });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === orderId + ' — TOTAL') {
      sheet.getRange(i + 1, col).setValue(field === 'comments' ? String(value) : value === true);
      return json({ status: 'ok' });
    }
  }
  return json({ status: 'error', message: 'Order not found: ' + orderId });
}

/* ── Vendors ─────────────────────────────────────────────── */
function handleGetVendor(e) {
  var code  = ((e.parameter && e.parameter.code) || '').trim().toUpperCase();
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json({ status: 'notfound' });
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowCode      = String(rows[i][0] || '').trim().toUpperCase();
    var rowStoreCode = String(rows[i][2] || '').trim();
    // Match vendor-level rows only (no storeCode in col 2)
    if (rowCode === code && !rowStoreCode) {
      return json({
        status:    'ok',
        code:      rows[i][0],
        company:   rows[i][1],
        firstName: rows[i][3] || '',
        lastName:  rows[i][4] || '',
        email:     rows[i][5] || '',
      });
    }
  }
  return json({ status: 'notfound' });
}

function handleGetVendors() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json([]);
  var rows = sheet.getDataRange().getValues();
  // Return vendor-level rows only (storeCode col is empty)
  return json(rows.slice(1).filter(function(r) {
    return r[0] && !String(r[2] || '').trim();
  }).map(function(r) {
    return { code: r[0], company: r[1], firstName: r[3] || '', lastName: r[4] || '', email: r[5] || '' };
  }));
}

function handleSaveVendors(e) {
  var vendors = JSON.parse(getPayload_(e));
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet) sheet = ss.insertSheet(VENDORS_SHEET);

  // Preserve existing store-contact rows (rows with a storeCode in col 2)
  var storeRows = [];
  if (sheet.getLastRow() >= 2) {
    var existing = sheet.getDataRange().getValues();
    for (var i = 1; i < existing.length; i++) {
      if (String(existing[i][2] || '').trim()) {
        storeRows.push(existing[i].slice(0, 6));
      }
    }
  }

  sheet.clearContents();
  // Schema: code | company | storeCode | firstName | lastName | email
  sheet.appendRow(['code', 'company', 'storeCode', 'firstName', 'lastName', 'email']);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Vendor-level rows (storeCode is blank)
  vendors.forEach(function(v) {
    sheet.appendRow([v.code, v.company, '', v.firstName || '', v.lastName || '', v.email || '']);
  });

  // Re-append store contact rows
  storeRows.forEach(function(r) { sheet.appendRow(r); });

  return json({ status: 'ok', saved: vendors.length });
}

/* ── Store contact lookup & save ────────────────────────── */

/**
 * lookupStore — find a store-contact row by vendorCode + storeCode.
 * Vendors sheet schema: code | company | storeCode | firstName | lastName | email
 * Returns { status:'ok', vendorCode, storeCode, company, firstName, lastName, email }
 * or      { status:'notfound' }
 */
function handleLookupStore(e) {
  var request = parseRequest_(e);
  var vendorCode = String(request.body.vendorCode || ((e.parameter && e.parameter.vendorCode) || '')).trim().toUpperCase();
  var storeCode  = String(request.body.storeCode  || ((e.parameter && e.parameter.storeCode)  || '')).trim().toUpperCase();
  if (!vendorCode || !storeCode) return json({ status: 'notfound' });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json({ status: 'notfound' });

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowVendor = String(rows[i][0] || '').trim().toUpperCase();
    var rowStore  = String(rows[i][2] || '').trim().toUpperCase();
    if (rowVendor === vendorCode && rowStore === storeCode) {
      return json({
        status:     'ok',
        vendorCode: rows[i][0] || '',
        company:    rows[i][1] || '',
        storeCode:  rows[i][2] || '',
        firstName:  rows[i][3] || '',
        lastName:   rows[i][4] || '',
        email:      rows[i][5] || '',
      });
    }
  }
  return json({ status: 'notfound' });
}

/**
 * saveStore — upsert a store-contact row.
 * Payload: { vendorCode, storeCode, company, firstName, lastName, email }
 * Composite key: vendorCode + storeCode.
 * On update: only firstName/lastName/email change; vendorCode/company/storeCode preserved.
 */
function handleSaveStore(e) {
  var data       = JSON.parse(getPayload_(e));
  var vendorCode = String(data.vendorCode || '').trim().toUpperCase();
  var storeCode  = String(data.storeCode  || '').trim().toUpperCase();
  if (!vendorCode || !storeCode) return json({ status: 'error', message: 'Missing vendorCode or storeCode' });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet) sheet = ss.insertSheet(VENDORS_SHEET);

  // Ensure headers exist
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['code', 'company', 'storeCode', 'firstName', 'lastName', 'email']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rowVendor = String(rows[i][0] || '').trim().toUpperCase();
    var rowStore  = String(rows[i][2] || '').trim().toUpperCase();
    if (rowVendor === vendorCode && rowStore === storeCode) {
      // Update contact columns (4-6); preserve code, company, storeCode
      sheet.getRange(i + 1, 4, 1, 3).setValues([[
        safeSheetText_(data.firstName || ''),
        safeSheetText_(data.lastName  || ''),
        safeSheetText_(data.email     || ''),
      ]]);
      return json({ status: 'ok', action: 'updated' });
    }
  }

  // New store-contact row
  sheet.appendRow([
    vendorCode,
    safeSheetText_(data.company   || ''),
    storeCode,
    safeSheetText_(data.firstName || ''),
    safeSheetText_(data.lastName  || ''),
    safeSheetText_(data.email     || ''),
  ]);
  return json({ status: 'ok', action: 'inserted' });
}

/* ── Store contacts: list all (admin) ───────────────────── */

/**
 * getStoreContacts — return all store-contact rows.
 * Optional ?vendorCode=X to filter by vendor.
 * Schema: code | company | storeCode | firstName | lastName | email
 */
function handleGetStoreContacts(e) {
  var request = parseRequest_(e);
  var rawFilterVendor = request.body.vendorCode || (e.parameter && e.parameter.vendorCode);
  var filterVendor = rawFilterVendor ? String(rawFilterVendor).trim().toUpperCase() : null;

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return json([]);

  var rows     = sheet.getDataRange().getValues();
  var contacts = [];
  for (var i = 1; i < rows.length; i++) {
    var rowStore = String(rows[i][2] || '').trim();
    if (!rowStore) continue;   // vendor-level row — skip
    var rowVendor = String(rows[i][0] || '').trim().toUpperCase();
    if (filterVendor && rowVendor !== filterVendor) continue;
    contacts.push({
      vendorCode: rows[i][0] || '',
      company:    rows[i][1] || '',
      storeCode:  rows[i][2] || '',
      firstName:  rows[i][3] || '',
      lastName:   rows[i][4] || '',
      email:      rows[i][5] || '',
    });
  }
  return json(contacts);
}

/**
 * deleteStore — remove a store-contact row by vendorCode + storeCode.
 */
function handleDeleteStore(e) {
  var request = parseRequest_(e);
  var vendorCode = String(request.body.vendorCode || ((e.parameter && e.parameter.vendorCode) || '')).trim().toUpperCase();
  var storeCode  = String(request.body.storeCode  || ((e.parameter && e.parameter.storeCode)  || '')).trim().toUpperCase();
  if (!vendorCode || !storeCode) return json({ status: 'error', message: 'Missing vendorCode or storeCode' });

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VENDORS_SHEET);
  if (!sheet) return json({ status: 'error', message: 'Vendors sheet not found' });

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rv = String(rows[i][0] || '').trim().toUpperCase();
    var rs = String(rows[i][2] || '').trim().toUpperCase();
    if (rv === vendorCode && rs === storeCode) {
      sheet.deleteRow(i + 1);
      return json({ status: 'ok' });
    }
  }
  return json({ status: 'error', message: 'Store contact not found: ' + vendorCode + '/' + storeCode });
}

/* ── Helpers ─────────────────────────────────────────────── */
/* ── Admin password verification ─────────────────────────── */
function handleVerifyPassword(e) {
  var pw = e && e.parameter && e.parameter.pw ? e.parameter.pw : '';
  if (!pw && e && e.postData && e.postData.contents) {
    try { pw = JSON.parse(e.postData.contents).pw || ''; } catch (err) {}
  }
  if (pw && pw === getAdminPassword_()) {
    return json({ ok: true, token: createAdminToken_() });
  }
  return json({ ok: false });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function th(text, align) {
  return '<th style="padding:8px 12px;text-align:' + (align||'left') + ';font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">' + htmlEscape_(text) + '</th>';
}
function td(text, align) {
  return '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:' + (align||'left') + '">' + htmlEscape_(text) + '</td>';
}
function row2(label, value, color) {
  return '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px">'
    + '<tr>'
    + '<td style="color:#718096">' + htmlEscape_(label) + '</td>'
    + '<td align="right"><strong style="color:' + (color||'#1a202c') + '">' + htmlEscape_(value) + '</strong></td>'
    + '</tr>'
    + '</table>';
}

function getAdminPassword_() {
  var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw) throw new Error('ADMIN_PASSWORD not set in Script Properties');
  return pw;
}

function parseRequest_(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); } catch (err) {}
  }
  return {
    action: body.action || params.action || '',
    token: body.token || params.token || '',
    body: body,
  };
}

function getPayload_(e) {
  var request = parseRequest_(e);
  if (request.body && request.body.payload !== undefined) return request.body.payload;
  return e && e.parameter ? e.parameter.payload : undefined;
}

function getAdminTokenSecret_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN_SECRET') || getAdminPassword_();
}

function createAdminToken_() {
  var timestamp = String(Date.now());
  return timestamp + '.' + signAdminToken_(timestamp);
}

function isValidAdminToken_(token) {
  if (!token) return false;
  var parts = String(token).split('.');
  if (parts.length !== 2) return false;
  var timestamp = Number(parts[0]);
  if (!timestamp || (Date.now() - timestamp) > ADMIN_TOKEN_TTL_MS) return false;
  return parts[1] === signAdminToken_(parts[0]);
}

function signAdminToken_(value) {
  var secret = getAdminTokenSecret_();
  var bytes = Utilities.computeHmacSha256Signature(String(value), secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function normalizeSubmittedOrder_(data) {
  if (!data || !Array.isArray(data.lines) || data.lines.length === 0) {
    throw new Error('Order must include at least one line');
  }

  var vendorCode = String(data.vendorCode || '').trim().toUpperCase();
  var products = getProductIndex_();
  var lines = [];
  var totalOrderUnits = 0;
  var totalIndividualUnits = 0;
  var totalDealer = 0;
  var totalRetail = 0;

  data.lines.forEach(function(line) {
    var productId = String(line.id || '').trim();
    var product = products[productId];
    var qty = Math.floor(Number(line.qty) || 0);
    if (!product) throw new Error('Unknown product id: ' + productId);
    if (qty <= 0) throw new Error('Invalid quantity for product: ' + product.name);
    if (product.status !== 'available') throw new Error('Product is unavailable: ' + product.name);
    if (!productAllowedForVendor_(product, vendorCode)) throw new Error('Product not allowed for vendor: ' + product.name);

    var units = qty * product.unitsPerOrder;
    var dealerUnit = product.dealerUnit;
    var srpUnit = product.srp;
    var lineDealer = units * dealerUnit;
    var lineSRP = units * srpUnit;

    totalOrderUnits += qty;
    totalIndividualUnits += units;
    totalDealer += lineDealer;
    totalRetail += lineSRP;

    lines.push({
      id: productId,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      orderUnit: product.orderUnit,
      unitLabel: product.unitLabel,
      qty: qty,
      units: units,
      dealerUnit: dealerUnit,
      lineDealer: lineDealer,
      srpUnit: srpUnit,
      lineSRP: lineSRP,
    });
  });

  return {
    lines: lines,
    totalOrderUnits: totalOrderUnits,
    totalIndividualUnits: totalIndividualUnits,
    totalDealer: totalDealer,
    totalRetail: totalRetail,
  };
}

function getProductIndex_() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('Products sheet is empty');
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var index = {};

  rows.slice(1).forEach(function(row) {
    if (row[0] === '') return;
    var product = {};
    headers.forEach(function(header, i) { product[header] = row[i]; });
    var cost = Number(product.cost || 0);
    index[String(product.id)] = {
      id: String(product.id),
      name: String(product.name || ''),
      sku: String(product.sku || ''),
      barcode: String(product.barcode || ''),
      orderUnit: String(product.orderUnit || 'unit'),
      unitLabel: String(product.unitLabel || 'units'),
      unitsPerOrder: Math.max(1, Math.floor(Number(product.unitsPerOrder) || 1)),
      srp: Number(product.srp || 0),
      dealerUnit: Number(product.dealer || (cost * 1.11) || 0),
      status: String(product.status || ((product.available === false || product.available === 'FALSE') ? 'unavailable' : 'available')),
      vendorCodes: String(product.vendorCodes || '[]'),
    };
  });
  return index;
}

function productAllowedForVendor_(product, vendorCode) {
  var codes = [];
  try { codes = JSON.parse(product.vendorCodes || '[]'); } catch (err) {}
  if (!codes.length) return true;
  return codes.map(function(code) { return String(code).toUpperCase(); }).indexOf(vendorCode) !== -1;
}

function normalizeImageFilename_(filename) {
  var clean = String(filename || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
  if (!/^[a-z0-9][a-z0-9._-]*\.(png|jpg|jpeg|webp|gif|avif)$/i.test(clean)) {
    throw new Error('Invalid image filename');
  }
  return clean;
}

function uploadGithubImage_(filename, contentBase64) {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) throw new Error('GITHUB_PAT not set in Script Properties');

  var apiUrl = 'https://api.github.com/repos/terranovamtlai/orderform/contents/images/' + encodeURIComponent(filename);
  var headers = {
    Authorization: 'token ' + pat,
    Accept: 'application/vnd.github+json',
  };

  var sha = null;
  var checkRes = UrlFetchApp.fetch(apiUrl, {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true,
  });
  if (checkRes.getResponseCode() === 200) {
    sha = JSON.parse(checkRes.getContentText()).sha;
  }

  var payload = {
    message: 'Add product image: ' + filename,
    content: contentBase64,
    branch: 'main',
  };
  if (sha) payload.sha = sha;

  var uploadRes = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (uploadRes.getResponseCode() < 200 || uploadRes.getResponseCode() >= 300) {
    throw new Error('GitHub upload failed: ' + uploadRes.getContentText());
  }
}

function htmlEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeSheetText_(value) {
  var text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}
