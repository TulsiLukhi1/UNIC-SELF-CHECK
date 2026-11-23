/**
 * UNIC Self-Check — submissions web app
 * Receives one founder's answers from the self-check page and appends one row
 * to the "submissions" tab of this Google Sheet.
 *
 * Deploy: Deploy > New deployment > Web app; Execute as: Me; Who has access: Anyone.
 * After any edit: Deploy > Manage deployments > (pencil) Edit > Version: New version > Deploy.
 * The web app URL stays the same.
 */

const SPREADSHEET_ID = '1KaY9EtEAUMsEpC7J9PYzrsTvHEWHNeeY6sUj5nOIJ-A';
// Public Netlify booking page used in Founder Session emails.
const FOUNDER_WEB_APP_URL = 'https://growth.unicbiz.com/book/'; 
const FOUNDER_TEST_EMAIL = 'nat@unicbiz.com';
const SHEET_NAME = 'submissions';
const MAX_LEN = 1000;
const Q_ORDER = ['P1', 'P2', 'L1', 'B1', 'B2', 'L2', 'M1', 'M2', 'L3', 'R1', 'R2', 'L4'];

// ---------- Founder Session booking and payment configuration ----------
const FOUNDER_TEST_MODE = true; // Keep true while testing end-to-end.
// Informational only; outgoing messages go to the email in each Founder Sessions row.
//const FOUNDER_TEST_EMAIL = "lukhitulshi99094@gmail.com' ;
const FOUNDER_SESSION_DURATION_MINUTES = 90;
const FOUNDER_TIMEZONE = 'Asia/Kolkata';

// Update ONLY this object when the real payment details are available.
// The current values are test placeholders and must be replaced before live payments.
const FOUNDER_PAYMENT = {
  fee: '₹5,500',
  upiId: 'natunic@kotak',
  qrImageFileId: '1DheYCQbsV3d1uUlYvjJAFl0M18chOBQu',
  accountHolder: 'UNIC',
  bankName: 'Kotak Mahindra Bank',
  accountNumber: '0646313731',
  ifsc: 'KKBK0002563',
  branch: 'AHMEDABAD - ODHAV',
  paymentDeadlineHours: 24
};


// The Report Desk depends on these names and this order. Do not change the first 44.
const HEADERS = [
  'submission_id', 'submitted_at', 'full_name', 'first_name', 'business_name', 'whatsapp', 'email',
  'utm_source', 'utm_medium', 'utm_campaign',
  'P1_answer', 'P1_score', 'P2_answer', 'P2_score', 'L1_answer', 'L1_score',
  'B1_answer', 'B1_score', 'B2_answer', 'B2_score', 'L2_answer', 'L2_score',
  'M1_answer', 'M1_score', 'M2_answer', 'M2_score', 'L3_answer', 'L3_score',
  'R1_answer', 'R1_score', 'R2_answer', 'R2_score', 'L4_answer', 'L4_score',
  'product', 'business', 'market', 'regenerate', 'value_total', 'readiness', 'profile',
  'open_answer', 'consent', 'notes',
  // Context questions (not scored), added after the required columns.
  'business_offer', 'business_type', 'team_size', 'turnover', 'key_relationships',

  // Report tracking columns

  'report_status', 'report_file_id', 'email_status',
  'email_sent_at', 'whatsapp_status', 'processing_error'
];

/** Health check or Founder Session booking page. */
function doGet(e) {
  const token = e && e.parameter && e.parameter.booking;
  if (token) return renderFounderBookingPage_(String(token));
  return json_({ ok: true, service: 'UNIC Self-Check and Founder Session booking' });
}

function doPost(e) {
  // 1. Parse
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  if (!data || typeof data !== 'object') return json_({ ok: false, error: 'bad_json' });
  if (data.type === 'founder_booking_details') return json_(getFounderBookingData_(data.token));
  if (data.type === 'founder_booking') return json_(confirmFounderBooking_(data));

  // Keep the Founder Session waitlist separate from Self-Check submissions.
  if (data.type === 'founder_session') return handleFounderSession_(data);

  // 2. Honeypot: a bot filled the hidden "website" field. Say OK, write nothing.
  if (clean_(data.website)) return json_({ ok: true });

  // 3. Required fields
  const s = {
    submission_id: clean_(data.submission_id),
    full_name: clean_(data.full_name),
    business_name: clean_(data.business_name),
    whatsapp: clean_(data.whatsapp),
    email: clean_(data.email),
    utm_source: clean_(data.utm_source),
    utm_medium: clean_(data.utm_medium),
    utm_campaign: clean_(data.utm_campaign),
    open_answer: clean_(data.open_answer)
  };
  const missing = ['full_name', 'business_name', 'whatsapp', 'email'].filter(function (k) { return !s[k]; });
  if (missing.length) return json_({ ok: false, error: 'missing_fields', fields: missing });
  if (s.email.indexOf('@') < 1) return json_({ ok: false, error: 'invalid_email' });
  if (data.consent !== true) return json_({ ok: false, error: 'no_consent' });
  if (!s.submission_id) s.submission_id = 'srv-' + new Date().getTime().toString(36);

  // 4. Answers: every question needs its answer text and a whole-number score from 0 to 3
  const answers = data.answers || {};
  const scores = {};
  const texts = {};
  for (let i = 0; i < Q_ORDER.length; i++) {
    const id = Q_ORDER[i];
    const a = answers[id] || {};
    const score = Number(a.score);
    if (!isFinite(score) || Math.floor(score) !== score || score < 0 || score > 3) {
      return json_({ ok: false, error: 'invalid_score', question: id });
    }
    const text = clean_(a.answer);
    if (!text) return json_({ ok: false, error: 'missing_answer', question: id });
    scores[id] = score;
    texts[id] = text;
  }

  // 5. Recalculate on the server; the Sheet never depends on the browser's arithmetic
  const r = scoreAll_(scores);
  const notes = [];
  const b = data.scores || {};
  const keys = ['product', 'business', 'market', 'regenerate', 'value_total', 'readiness', 'profile'];
  for (let k = 0; k < keys.length; k++) {
    if (String(b[keys[k]]) !== String(r[keys[k]])) { notes.push('score_mismatch'); break; }
  }

  // 6. Context (not scored)
  const ctx = data.context || {};
  const relations = Array.isArray(ctx.relations) ? ctx.relations.map(clean_).filter(String).join(', ') : clean_(ctx.relations);

  // 7. Build the row in HEADERS order
  const row = [
    s.submission_id, new Date(), s.full_name, s.full_name.split(/\s+/)[0], s.business_name, s.whatsapp, s.email,
    s.utm_source, s.utm_medium, s.utm_campaign
  ];
  Q_ORDER.forEach(function (id) { row.push(texts[id], scores[id]); });
  row.push(r.product, r.business, r.market, r.regenerate, r.value_total, r.readiness, r.profile,
    s.open_answer, 'yes', notes.join(', '),
    
    clean_(ctx.offer), clean_(ctx.type), clean_(ctx.team), clean_(ctx.turnover), clean_(relations),

    // Initial report automation statuses.
    'Pending', '', 'Pending', '', 'Pending', '');


  // 8. Write, one submission at a time
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    const sheet = getSheet_();
    // A retry of the same submission is written only once
    const last = sheet.getLastRow();
    if (last > 1) {
      const found = sheet.getRange(2, 1, last - 1, 1).createTextFinder(s.submission_id).matchEntireCell(true).findNext();
      if (found) return json_({ ok: true, duplicate: true });
    }
    sheet.appendRow(row.map(cell_));
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

/** UNIC Self-Check v1 scoring rules. */
function scoreAll_(sc) {
  const product = sc.P1 + sc.P2;
  const business = sc.B1 + sc.B2;
  const market = sc.M1 + sc.M2;
  const regenerate = sc.R1 + sc.R2;
  const value_total = product + business + market + regenerate;
  const readiness = sc.L1 + sc.L2 + sc.L3 + sc.L4;
  let profile;
  if (value_total <= 12) profile = readiness >= 9 ? 'Ready to Recalibrate' : 'Hidden Potential';
  else profile = readiness >= 9 ? 'Primed for the Next Stage' : 'Steady Ground';
  return { product: product, business: business, market: market, regenerate: regenerate,
    value_total: value_total, readiness: readiness, profile: profile };
}

/** The "submissions" tab, created with its header row if needed. */
function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

/** Trim, turn into text, cap at 1,000 characters. */
function clean_(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, MAX_LEN);
}

/** Keep text as text: a leading = + - @ would otherwise become a formula or a number (and drop the + from phone numbers). */
function cell_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once from the editor (select "setup", press Run) to approve access and
 * create the "submissions" tab with its headers.
 */
function setup() {
  getSheet_();
}

/**
 * Optional: run from the editor to add one test row ("Test Founder").
 * Delete the row afterwards.
 */
function testSubmission() {
  const answers = {};
  const pick = { P1: 1, P2: 1, L1: 3, B1: 1, B2: 1, L2: 3, M1: 1, M2: 1, L3: 3, R1: 1, R2: 1, L4: 3 };
  Q_ORDER.forEach(function (id) { answers[id] = { answer: 'Test answer (' + pick[id] + ')', score: pick[id] }; });
  const body = {
    submission_id: 'test-' + new Date().getTime(), full_name: 'Test Founder', business_name: 'Test Business',
    whatsapp: '+919800000000', email: 'test@example.com', consent: true, answers: answers,
    scores: scoreAll_(pick), open_answer: 'Testing the sheet', website: '',
    context: { offer: 'Test products', type: 'Manufacturing', team: '6–20', turnover: 'Prefer not to say', relations: ['Core team'] }
  };
  const out = doPost({ postData: { contents: JSON.stringify(body) } });
  Logger.log(out.getContent());
}


/**
 * Run once to add report tracking columns and initialize existing rows.
 * Preserves existing data and does not change the first 44 columns.
 */
function setupReportTracking() {
  const sheet = getSheet_();
  const trackingHeaders = [
    'report_status',
    'report_file_id',
    'email_status',
    'email_sent_at',
    'whatsapp_status',
    'processing_error'
  ];

  const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const existingHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0];

  trackingHeaders.forEach(function (header) {
    if (existingHeaders.indexOf(header) === -1) {
      const nextColumn = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextColumn).setValue(header).setFontWeight('bold');
      existingHeaders.push(header);
    }
  });

  const finalColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, finalColumn).getDisplayValues()[0];
  const columnIndex = {};
  headers.forEach(function (header, index) {
    columnIndex[header] = index + 1;
  });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const reportCol = columnIndex.report_status;
  const emailCol = columnIndex.email_status;
  const whatsappCol = columnIndex.whatsapp_status;

  for (let row = 2; row <= lastRow; row++) {
    const submissionId = sheet.getRange(row, 1).getValue();
    if (!submissionId) continue;

    if (!sheet.getRange(row, reportCol).getValue()) {
      sheet.getRange(row, reportCol).setValue('Pending');
    }
    if (!sheet.getRange(row, emailCol).getValue()) {
      sheet.getRange(row, emailCol).setValue('Pending');
    }
    if (!sheet.getRange(row, whatsappCol).getValue()) {
      sheet.getRange(row, whatsappCol).setValue('Not Started');
    }
  }

  sheet.setFrozenRows(1);
}




/**
 * Ensure the Founder Sessions tab has the columns required by the waitlist
 * and booking workflow. Existing columns and rows are preserved; missing
 * columns are appended rather than shifting existing data.
 */
function ensureFounderSessionsHeaders_(sheet) {
  const requiredHeaders = [
    'entry_id', 'submitted_at', 'full_name', 'business_name', 'email', 'phone', 'topic',
    'session_date_1', 'session_time_1', 'session_date_2', 'session_time_2',
    'session_date_3', 'session_time_3', 'email_status', 'trigger_log', 'email_sent_at',
    'booking_token', 'booking_status', 'booked_slot', 'calendar_event_id', 'booking_page_url'
  ];

  let lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function (h) { return String(h || '').trim(); });

  requiredHeaders.forEach(function (header) {
    if (existingHeaders.indexOf(header) === -1) {
      lastColumn += 1;
      sheet.getRange(1, lastColumn).setValue(header);
      existingHeaders.push(header);
    }
  });

  sheet.setFrozenRows(1);
}

/** Save a Founder Session waitlist entry to its own tab. */
function handleFounderSession_(data) {
  const fullName = clean_(data.full_name || data.name);
  const businessName = clean_(data.business_name);
  const email = clean_(data.email);
  const phone = clean_(data.phone);
  const topic = clean_(data.topic);

  const missing = [];
  if (!fullName) missing.push('full_name');
  if (!businessName) missing.push('business_name');
  if (!email) missing.push('email');
  if (!phone) missing.push('phone');
  if (missing.length) return json_({ ok: false, error: 'missing_fields', fields: missing });

  // Detect the common old-form mapping error before anything is written.
  // Example of a shifted payload: business_name=email, email=phone, phone=topic.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(businessName) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json_({ ok: false, error: 'field_mapping_mismatch',
      message: 'The form is sending fields in the wrong order. Publish the updated Founder Session HTML form that includes a separate Business name field.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json_({ ok: false, error: 'invalid_email',
      message: 'The email field must contain an email address. Check the Founder Session form field mapping.' });
  }

  const digits = phone.replace(/\D/g, '');
  const localDigits = digits.length === 12 && digits.indexOf('91') === 0
    ? digits.slice(2) : digits;
  if (!/^\d{10}$/.test(localDigits)) {
    return json_({ ok: false, error: 'invalid_phone' });
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (err) { return json_({ ok: false, error: 'busy' }); }

  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
      .getSheetByName('Founder Sessions');
    if (!sheet) return json_({ ok: false, error: 'founder_sessions_tab_missing' });

    ensureFounderSessionsHeaders_(sheet);

    const values = {
      entry_id: 'fs-' + Utilities.getUuid(),
      submitted_at: new Date(),
      full_name: fullName,
      business_name: businessName,
      email: email,
      phone: phone,
      topic: topic,
      session_date_1: '',
      session_time_1: '',
      session_date_2: '',
      session_time_2: '',
      session_date_3: '',
      session_time_3: '',
      email_status: 'Email Not Sent',
      email_sent_at: ''
    };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    sheet.appendRow(headers.map(h =>
      Object.prototype.hasOwnProperty.call(values, h) ? cell_(values[h]) : ''
    ));

    return json_({ ok: true, entry_id: values.entry_id });
  } catch (err) {
    console.error('Founder Session submission failed:', err);
    return json_({ ok: false, error: 'write_failed', message: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Rebuilds the Founder Sessions header order and formatting without deleting
 * existing data. Run manually once after replacing this script.
 */

function setupFounderSessionsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Founder Sessions');
  if (!sheet) sheet = ss.insertSheet('Founder Sessions');

  const headers = [
    'entry_id', 'submitted_at', 'full_name', 'business_name', 'email', 'phone', 'topic',
    'session_date_1', 'session_time_1', 'session_date_2', 'session_time_2',
    'session_date_3', 'session_time_3', 'email_status', 'trigger_log', 'email_sent_at',
    'booking_token', 'booking_status', 'booked_slot', 'calendar_event_id', 'booking_page_url'
  ];

  let current = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    : [];
  headers.forEach(h => {
    if (current.indexOf(h) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
      current.push(h);
    }
  });
  headers.forEach((h, targetIndex) => {
    const now = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const from = now.indexOf(h) + 1;
    if (from !== targetIndex + 1) {
      sheet.moveColumns(sheet.getRange(1, from, sheet.getMaxRows(), 1), targetIndex + 1);
    }
  });

  const col = founderColumnMap_(sheet);
  const dataRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 42);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#D9EAF7').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);

  const widths = {
    entry_id: 210, submitted_at: 165, full_name: 160, business_name: 190,
    email: 230, phone: 145, topic: 230, session_date_1: 135, session_time_1: 125,
    session_date_2: 135, session_time_2: 125, session_date_3: 135, session_time_3: 125,
    email_status: 145, trigger_log: 360, email_sent_at: 165, booking_token: 210, booking_status: 145,
    booked_slot: 150, calendar_event_id: 230, booking_page_url: 300
  };
  Object.keys(widths).forEach(h => sheet.setColumnWidth(col[h], widths[h]));

  const timezone = ss.getSpreadsheetTimeZone() || FOUNDER_TIMEZONE;
  const todayText = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const today = new Date(todayText + 'T00:00:00');
  const dateRule = SpreadsheetApp.newDataValidation()
    .requireDateOnOrAfter(today).setAllowInvalid(false)
    .setHelpText('Select today or a future date.').build();
  [1,2,3].forEach(n => {
    sheet.getRange(2, col['session_date_' + n], dataRows, 1)
      .setDataValidation(dateRule).setNumberFormat('dd-mmm-yyyy');
  });

  const times = [];
  for (let h = 8; h <= 20; h++) {
    [0,30].forEach(m => {
      if (h === 20 && m === 30) return;
      times.push((h % 12 || 12) + ':' + String(m).padStart(2,'0') + (h < 12 ? ' AM' : ' PM'));
    });
  }
  const timeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(times, true).setAllowInvalid(false)
    .setHelpText('Select a time from the dropdown.').build();
  [1,2,3].forEach(n => {
    sheet.getRange(2, col['session_time_' + n], dataRows, 1)
      .setDataValidation(timeRule).setNumberFormat('@');
  });

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Email Not Sent','Send Email','Email Sent','Failed'], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, col.email_status, dataRows, 1).setDataValidation(statusRule);

  const bookingRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Not Booked','Reserved','Booked'], true).setAllowInvalid(false).build();
  sheet.getRange(2, col.booking_status, dataRows, 1).setDataValidation(bookingRule);

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const r = sheet.getRange(2, col.email_status, lastRow - 1, 1);
    const vals = r.getValues();
    vals.forEach(v => { if (!v[0]) v[0] = 'Email Not Sent'; });
    r.setValues(vals);
    const br = sheet.getRange(2, col.booking_status, lastRow - 1, 1);
    const bvals = br.getValues();
    bvals.forEach(v => { if (!v[0]) v[0] = 'Not Booked'; });
    br.setValues(bvals);
  }
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).createFilter();
  SpreadsheetApp.flush();
  Logger.log('Founder Sessions sheet configured.');
}

/** Install an authorized edit trigger. Run once manually after setup. */
function installFounderSessionEditTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'founderSessionOnEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('founderSessionOnEdit')
    .forSpreadsheet(SPREADSHEET_ID)
    .onEdit()
    .create();
  Logger.log('Founder Session edit trigger installed.');
}

/** Append a timestamped diagnostic message to the row's trigger_log cell. */
function founderWriteTriggerLog_(sheet, row, col, message) {
  const cell = sheet.getRange(row, col.trigger_log);
  const stamp = Utilities.formatDate(new Date(), FOUNDER_TIMEZONE, 'dd-MMM-yyyy hh:mm:ss a');
  const previous = String(cell.getValue() || '').trim();
  cell.setValue((previous ? previous + '\n' : '') + '[' + stamp + '] ' + message);
  cell.setWrap(true);
}

/** Runs when Natasha selects Send Email. */

function founderSessionOnEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();

  if (sheet.getName() !== 'Founder Sessions' || e.range.getRow() < 2) return;

  const col = founderColumnMap_(sheet);

  if (
    e.range.getColumn() !== col.email_status ||
    String(e.value || '') !== 'Send Email'
  ) return;

  const row = e.range.getRow();

  // Clear the previous run's log.
  sheet.getRange(row, col.trigger_log).clearContent();

  founderWriteTriggerLog_(
    sheet, row, col,
    'Trigger started: Send Email selected.'
  );

  SpreadsheetApp.flush();

  const lock = LockService.getScriptLock();

  try {
    founderWriteTriggerLog_(
      sheet, row, col,
      'Waiting for workflow lock.'
    );

    lock.waitLock(20000);

    founderWriteTriggerLog_(
      sheet, row, col,
      'Lock acquired. Reading founder details.'
    );

    const values = sheet
      .getRange(row, 1, 1, sheet.getLastColumn())
      .getValues()[0];

    const get = h => values[col[h] - 1];

    founderWriteTriggerLog_(
      sheet, row, col,
      'Founder details loaded. Validating session dates and times.'
    );

    // Validate session slots.
    const slots = founderGetSlots_(get);
    const errors = founderValidateSlots_(slots);

    if (errors.length) {
      sheet.getRange(row, col.email_status).setValue('Email Not Sent');

      founderWriteTriggerLog_(
        sheet, row, col,
        'VALIDATION FAILED: ' + errors.join(' ')
      );

      SpreadsheetApp.getActive().toast(
        errors.join(' '),
        'Cannot send Founder Session email',
        10
      );

      return;
    }

    founderWriteTriggerLog_(
      sheet, row, col,
      'Session slot validation passed.'
    );

    // Validate recipient.
    const recipient = String(get('email') || '').trim();

    if (!recipient) {
      throw new Error(
        'Founder row email is blank. Add a recipient email before sending.'
      );
    }

    founderWriteTriggerLog_(
      sheet, row, col,
      'Recipient validated: ' + recipient
    );

    // Generate booking token if missing.
    if (!get('booking_token')) {
      sheet.getRange(row, col.booking_token)
        .setValue(Utilities.getUuid().replace(/-/g, ''));
    }

    // Only initialize an empty status. Re-sending an email must never
    // downgrade Reserved or Booked, nor overwrite a payment-verification decision.
    if (!String(get('booking_status') || '').trim()) {
      sheet.getRange(row, col.booking_status).setValue('Not Booked');
    }

    founderWriteTriggerLog_(
      sheet, row, col,
      'Booking token prepared.'
    );

    // Generate booking URL.
    const bookingUrl = FOUNDER_WEB_APP_URL + '?booking=' +
      encodeURIComponent(
        sheet.getRange(row, col.booking_token).getValue()
      );

    sheet.getRange(row, col.booking_page_url).setValue(bookingUrl);

    founderWriteTriggerLog_(
      sheet, row, col,
      'Booking page URL generated and saved.'
    );

    // Prepare email details.
    const subject = 'Your Founder Session: three times have opened';

    const firstName = String(get('full_name') || '')
      .trim()
      .split(/\s+/)[0] || 'there';

    const business = String(get('business_name') || 'your business');

    const formattedSlots = slots
      .filter(s => s)
      .map((s, i) =>
        (i + 1) + '. ' +
        Utilities.formatDate(
          s.start,
          FOUNDER_TIMEZONE,
          'EEEE, d MMM yyyy · h:mm a'
        ) + ' IST'
      );

    // Plain-text email fallback.
    const body = [
      'Hi ' + firstName + ',',
      '',
      'Thank you for joining the Founder Session waitlist. Three session times have opened up, and you are among the first to hear.',
      '',
      'Choose your preferred session (IST)',
      formattedSlots.join('\n'),
      '',
      'Choose your session: ' + bookingUrl,
      '',
      'SESSION DETAILS',
      'Duration: ' + FOUNDER_SESSION_DURATION_MINUTES + ' minutes',
      'Session fee: ' + FOUNDER_PAYMENT.fee,
      '',
      'PAYMENT INFORMATION',
      'UPI ID: ' + FOUNDER_PAYMENT.upiId,
      'Bank: ' + FOUNDER_PAYMENT.bankName,
      'Account holder: ' + FOUNDER_PAYMENT.accountHolder,
      'Account number: ' + FOUNDER_PAYMENT.accountNumber,
      'IFSC: ' + FOUNDER_PAYMENT.ifsc,
      'Branch: ' + FOUNDER_PAYMENT.branch,
      'Please put your name in the payment note.',
      '',
      'IMPORTANT INSTRUCTIONS',
      '1. Choose one available session through the booking link.',
      '2. You will receive a calendar invitation after booking.',
      '3. Complete payment within ' +
        FOUNDER_PAYMENT.paymentDeadlineHours + ' hours of booking.',
      '4. Reply to this email with your UTR/payment reference or payment screenshot.',
      '5. If payment is not received within ' +
        FOUNDER_PAYMENT.paymentDeadlineHours +
        ' hours, your slot may be released.',
      '',
      'In the session, we will take what your Self-Check showed and map the first moves that matter most for ' +
        business + '.',
      '',
      'Warmly,',
      'UNIC Business Builders',
      'colab@unicbiz.com · unicbiz.com',
      '',
      FOUNDER_TEST_MODE
        ? 'TEST MODE: Payment details in this email are placeholders. Do not make a payment using them.'
        : ''
    ].join('\n');

    // Build branded HTML email.
    const emailParts = buildFounderSessionEmailHtml_(
      firstName,
      business,
      formattedSlots,
      bookingUrl,
      FOUNDER_PAYMENT,
      FOUNDER_TEST_MODE
    );

    // QR diagnostic logs.
    Logger.log(
      'QR file ID configured: ' +
      Boolean(FOUNDER_PAYMENT.qrImageFileId)
    );

    Logger.log(
      'Inline image keys: ' +
      Object.keys(emailParts.inlineImages).join(', ')
    );

    Logger.log(
      'HTML contains QR CID: ' +
      emailParts.htmlBody.includes('cid:paymentQr')
    );

    Logger.log(
      'QR image bytes: ' +
      (
        emailParts.inlineImages.paymentQr
          ? emailParts.inlineImages.paymentQr.getBytes().length
          : 'MISSING'
      )
    );

    Logger.log(
      'QR image MIME type: ' +
      (
        emailParts.inlineImages.paymentQr
          ? emailParts.inlineImages.paymentQr.getContentType()
          : 'MISSING'
      )
    );

    founderWriteTriggerLog_(
      sheet, row, col,
      'QR diagnostics completed. Preparing email.'
    );

    SpreadsheetApp.flush();

    // Send email with HTML and inline QR image.
    Logger.log("FOUNDER EMAIL EXECUTION ACCOUNT: " + Session.getEffectiveUser().getEmail());
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: body,
      htmlBody: emailParts.htmlBody,
      inlineImages: emailParts.inlineImages
    });

    founderWriteTriggerLog_(
      sheet, row, col,
      'MailApp.sendEmail completed successfully.'
    );

    // Update sheet after successful sending.
    sheet.getRange(row, col.email_status).setValue('Email Sent');

    sheet.getRange(row, col.email_sent_at).setValue(new Date());

    founderWriteTriggerLog_(
      sheet, row, col,
      'SUCCESS: Email sent. Workflow completed.'
    );

    SpreadsheetApp.flush();

  } catch (err) {
    const message = err && err.message
      ? err.message
      : String(err);

    try {
      sheet.getRange(row, col.email_status).setValue('Failed');

      founderWriteTriggerLog_(
        sheet, row, col,
        'ERROR: ' + message
      );

      SpreadsheetApp.flush();

    } catch (logErr) {
      console.error(
        'Could not write Founder Session error log:',
        logErr
      );
    }

    SpreadsheetApp.getActive().toast(
      message,
      'Founder Session email failed',
      10
    );

    console.error(err && err.stack ? err.stack : err);

  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}



/** Build the branded HTML email and optional inline payment QR image. */
function buildFounderSessionEmailHtml_(firstName, business, formattedSlots, bookingUrl, payment, testMode) {
  const esc = escapeHtml_;
  const slotItems = formattedSlots.map(function (slot) {
    return '<li style="margin:0 0 8px;padding:0;color:#111111;font-size:16px;line-height:1.5;">' + esc(slot.replace(/^\d+\.\s*/, '')) + '</li>';
  }).join('');

  const inlineImages = {};
  let qrMarkup;
  if (payment.qrImageFileId) {
    const qrBlob = DriveApp.getFileById(payment.qrImageFileId)
      .getBlob()
      .setName('UNIC_Kotak_UPI_QR.png')
      .setContentType('image/png');

    inlineImages.paymentQr = qrBlob;
    qrMarkup = '<img src="cid:paymentQr" alt="UNIC payment QR code" width="150" style="display:block;width:150px;max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:10px;padding:8px;background:#ffffff;">';
  } else {
    // Deliberately non-scannable placeholder until the real QR image is supplied.
    qrMarkup = '<div style="width:132px;height:132px;border:1px solid #d9e5e3;border-radius:10px;background:#ffffff;display:block;text-align:center;line-height:132px;font-family:Questrial,Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;letter-spacing:3px;color:#078989;">QR</div>';
  }

  const testNotice = testMode
    ? '<tr><td style="padding:0 32px 24px;"><div style="padding:12px 14px;background:#fff8e8;border:1px solid #f2d49a;border-radius:10px;color:#805b16;font:13px/1.5 Questrial,Arial,Helvetica,sans-serif;"><strong>TEST MODE:</strong> Payment details are placeholders. Do not make a payment using them.</div></td></tr>'
    : '';

  const htmlBody = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Questrial&family=Raleway:wght@500;600;700;800&display=swap" rel="stylesheet"><style>@import url('https://fonts.googleapis.com/css2?family=Questrial&family=Raleway:wght@500;600;700;800&display=swap');</style></head><body style="margin:0;padding:0;background:#f5f8f7;font-family:'Questrial',Arial,Helvetica,sans-serif;color:#111111;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f8f7;padding:24px 10px;"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e5e9e8;border-radius:18px;overflow:hidden;">
    <tr><td style="padding:30px 32px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:30px;"><span style="display:inline-block;width:13px;height:13px;background:#16c1c1;border-radius:50%;box-shadow:0 0 0 7px #e4f8f6;"></span></td><td style="padding-left:10px;font:bold 13px 'Raleway',Arial,Helvetica,sans-serif;letter-spacing:2px;color:#080909;">UNIC BUSINESS BUILDERS</td></tr></table>
      <p style="margin:30px 0 10px;color:#078989;font:bold 11px 'Raleway',Arial,Helvetica,sans-serif;letter-spacing:2px;">YOUR FOUNDER SESSION</p>
      <h1 style="margin:0 0 16px;font:bold 32px/1.15 'Raleway',Arial,Helvetica,sans-serif;letter-spacing:-1px;color:#080909;">Your next step starts here.</h1>
      <p style="margin:0 0 14px;font:16px/1.65 'Questrial',Arial,Helvetica,sans-serif;color:#333333;">Hi ${esc(firstName)},</p>
      <p style="margin:0;font:16px/1.65 'Questrial',Arial,Helvetica,sans-serif;color:#555555;">Thank you for joining the Founder Session waitlist. Three session times have opened up, and you're among the first to hear.</p>
    </td></tr>
    <tr><td style="padding:0 32px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#effaf8;border-radius:14px;"><tr><td style="padding:22px 24px;">
      <h2 style="margin:0 0 12px;font:bold 21px 'Raleway',Arial,Helvetica,sans-serif;color:#111111;">Choose your preferred session</h2>
      <p style="margin:0 0 10px;font:14px 'Questrial',Arial,Helvetica,sans-serif;color:#666666;">Available times (IST)</p>
      <ol style="margin:0 0 20px;padding-left:22px;">${slotItems}</ol>
      <a href="${esc(bookingUrl)}" style="display:block;padding:16px 18px;border-radius:999px;background:#080909;color:#b5ffc1;text-decoration:none;text-align:center;font:bold 16px 'Raleway',Arial,Helvetica,sans-serif;">Choose your session &rarr;</a>
    </td></tr></table></td></tr>
    <tr><td style="padding:0 32px 26px;"><h2 style="margin:0 0 16px;font:bold 21px 'Raleway',Arial,Helvetica,sans-serif;color:#111111;">Your session details</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 0;color:#666666;font:15px 'Questrial',Arial,Helvetica,sans-serif;">Duration</td><td align="right" style="padding:8px 0;color:#111111;font:bold 15px 'Questrial',Arial,Helvetica,sans-serif;">${FOUNDER_SESSION_DURATION_MINUTES} minutes</td></tr><tr><td style="padding:8px 0;color:#666666;font:15px 'Questrial',Arial,Helvetica,sans-serif;border-top:1px solid #eeeeee;">Session investment</td><td align="right" style="padding:8px 0;color:#111111;font:bold 15px 'Questrial',Arial,Helvetica,sans-serif;border-top:1px solid #eeeeee;">${esc(payment.fee)}</td></tr></table>
    </td></tr>
    <tr><td style="padding:26px 32px;background:#f7faf9;border-top:1px solid #edf0ef;border-bottom:1px solid #edf0ef;">
      <p style="margin:0 0 8px;color:#078989;font:bold 11px 'Raleway',Arial,Helvetica,sans-serif;letter-spacing:2px;">PAYMENT INFORMATION</p>
      <h2 style="margin:0 0 10px;font:bold 23px 'Raleway',Arial,Helvetica,sans-serif;color:#111111;">Complete your payment</h2>
      <p style="margin:0 0 18px;font:15px/1.6 'Questrial',Arial,Helvetica,sans-serif;color:#555555;">Please complete the payment within ${Number(payment.paymentDeadlineHours)} hours of booking to secure your session.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;background:#ffffff;border:1px solid #e7ecea;border-radius:12px;"><tr><td style="padding:18px 20px;">
        <h3 style="margin:0 0 12px;font:bold 16px 'Raleway',Arial,Helvetica,sans-serif;color:#111111;">Option 1 &middot; UPI payment</h3>
        <p style="margin:0 0 5px;font:13px 'Questrial',Arial,Helvetica,sans-serif;color:#777777;">UPI ID</p><p style="margin:0 0 16px;font:bold 16px 'Raleway',Arial,Helvetica,sans-serif;color:#111111;">${esc(payment.upiId)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">${qrMarkup}</td><td valign="middle" style="padding-left:16px;font:13px/1.5 Questrial,Arial,Helvetica,sans-serif;color:#666666;">Scan the QR code to complete your payment.</td></tr></table>
      </td></tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e7ecea;border-radius:12px;"><tr><td style="padding:18px 20px;">
        <h3 style="margin:0 0 12px;font:bold 16px 'Raleway',Arial,Helvetica,sans-serif;color:#111111;">Option 2 &middot; Bank transfer</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;color:#777777;font:13px 'Questrial',Arial,Helvetica,sans-serif;">Account holder</td><td align="right" style="padding:7px 0;color:#111111;font:bold 13px 'Questrial',Arial,Helvetica,sans-serif;">${esc(payment.accountHolder)}</td></tr>
          <tr><td style="padding:7px 0;border-top:1px solid #eeeeee;color:#777777;font:13px 'Questrial',Arial,Helvetica,sans-serif;">Bank</td><td align="right" style="padding:7px 0;border-top:1px solid #eeeeee;color:#111111;font:bold 13px 'Questrial',Arial,Helvetica,sans-serif;">${esc(payment.bankName)}</td></tr>
          <tr><td style="padding:7px 0;border-top:1px solid #eeeeee;color:#777777;font:13px 'Questrial',Arial,Helvetica,sans-serif;">Account number</td><td align="right" style="padding:7px 0;border-top:1px solid #eeeeee;color:#111111;font:bold 13px 'Questrial',Arial,Helvetica,sans-serif;">${esc(payment.accountNumber)}</td></tr>
          <tr><td style="padding:7px 0;border-top:1px solid #eeeeee;color:#777777;font:13px 'Questrial',Arial,Helvetica,sans-serif;">IFSC</td><td align="right" style="padding:7px 0;border-top:1px solid #eeeeee;color:#111111;font:bold 13px 'Questrial',Arial,Helvetica,sans-serif;">${esc(payment.ifsc)}</td></tr>
          <tr><td style="padding:7px 0;border-top:1px solid #eeeeee;color:#777777;font:13px 'Questrial',Arial,Helvetica,sans-serif;">Branch</td><td align="right" style="padding:7px 0;border-top:1px solid #eeeeee;color:#111111;font:bold 13px 'Questrial',Arial,Helvetica,sans-serif;">${esc(payment.branch)}</td></tr>
        </table>
        <p style="margin:14px 0 0;padding:12px 14px;border-radius:8px;background:#effaf8;color:#145b52;font:bold 14px/1.5 'Questrial',Arial,Helvetica,sans-serif;">Please put your name in the payment note.</p>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:28px 32px 20px;">
      <h2 style="margin:0 0 16px;font:bold 21px 'Raleway',Arial,Helvetica,sans-serif;color:#111111;">A few important things</h2>
      <ol style="margin:0;padding-left:20px;color:#444444;font:14px/1.7 'Questrial',Arial,Helvetica,sans-serif;">
        <li style="padding:0 0 8px;">Choose one available session through the booking link.</li>
        <li style="padding:0 0 8px;">You'll receive a calendar invitation after booking.</li>
        <li style="padding:0 0 8px;">Complete payment within ${Number(payment.paymentDeadlineHours)} hours.</li>
        <li style="padding:0 0 8px;">Reply to this email with your UTR/payment reference or payment screenshot.</li>
        <li>If payment isn't received within ${Number(payment.paymentDeadlineHours)} hours, your slot may be released.</li>
      </ol>
      <p style="margin:22px 0 18px;font:15px/1.6 'Questrial',Arial,Helvetica,sans-serif;color:#555555;">We look forward to helping you identify the next important moves for ${esc(business)}.</p>
      <p style="margin:0 0 5px;font:14px 'Questrial',Arial,Helvetica,sans-serif;color:#555555;">Warmly,</p><p style="margin:0;font:bold 15px 'Questrial',Arial,Helvetica,sans-serif;color:#111111;">UNIC Business Builders</p><p style="margin:7px 0 0;font:13px 'Questrial',Arial,Helvetica,sans-serif;color:#777777;">colab@unicbiz.com &middot; unicbiz.com</p>
    </td></tr>
    ${testNotice}
  </table></td></tr></table></body></html>`;

  return { htmlBody: htmlBody, inlineImages: inlineImages };
}

function founderColumnMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const map = {};
  headers.forEach((h,i) => map[String(h).trim()] = i + 1);
  return map;
}

function founderGetSlots_(get) {
  const slots = [];
  [1,2,3].forEach(n => {
    const date = get('session_date_' + n);
    const time = get('session_time_' + n);
    if (!date && !time) { slots.push(null); return; }
    if (!(date instanceof Date) || !time) { slots.push({invalid:true}); return; }
    const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) { slots.push({invalid:true}); return; }
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === 'PM') hour += 12;
    const start = new Date(date);
    start.setHours(hour, Number(match[2]), 0, 0);
    slots.push({start:start, end:new Date(start.getTime() + FOUNDER_SESSION_DURATION_MINUTES*60000)});
  });
  return slots;
}

function founderValidateSlots_(slots) {
  const errors = [];
  const valid = slots.filter(s => s && !s.invalid);
  if (!valid.length) errors.push('Select at least one valid date and time.');
  if (slots.some(s => s && s.invalid)) errors.push('Each selected date needs a valid time, and a time cannot be entered without its date.');
  const now = new Date();
  valid.forEach(s => { if (s.start <= now) errors.push('All selected session times must be in the future.'); });
  if (new Set(valid.map(s => s.start.getTime())).size !== valid.length) errors.push('Session options must have different start times.');
  return errors;
}


/**
 * Return only the information needed by the public Netlify booking page.
 * The booking token is a bearer link; do not expose sheet rows or internal IDs.
 */
function founderPublicPayment_() {
  return {
    fee: FOUNDER_PAYMENT.fee,
    upiId: FOUNDER_PAYMENT.upiId,
    accountHolder: FOUNDER_PAYMENT.accountHolder,
    bankName: FOUNDER_PAYMENT.bankName,
    accountNumber: FOUNDER_PAYMENT.accountNumber,
    ifsc: FOUNDER_PAYMENT.ifsc,
    branch: FOUNDER_PAYMENT.branch,
    paymentDeadlineHours: FOUNDER_PAYMENT.paymentDeadlineHours
  };
}

function founderBookedSlotLabel_(get) {
  const slotNumber = Number(get('booked_slot'));
  if ([1, 2, 3].includes(slotNumber)) {
    const slot = founderGetSlots_(get)[slotNumber - 1];
    if (slot && !slot.invalid) {
      return Utilities.formatDate(slot.start, FOUNDER_TIMEZONE, 'EEEE, d MMM yyyy · h:mm a') + ' IST';
    }
  }

  // Recovery for older rows where a calendar event exists but booked_slot is blank.
  const eventId = String(get('calendar_event_id') || '').trim();
  if (eventId) {
    try {
      const event = CalendarApp.getEventById(eventId);
      if (event) {
        return Utilities.formatDate(event.getStartTime(), FOUNDER_TIMEZONE, 'EEEE, d MMM yyyy · h:mm a') + ' IST';
      }
    } catch (err) {
      console.error('Could not recover Founder Session date from calendar event: ' + err);
    }
  }
  return '';
}

function getFounderBookingData_(rawToken) {
  const token = clean_(rawToken);
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return { ok: false, message: '1 This booking link is invalid or expired.' };
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Founder Sessions');
  if (!sheet) return { ok: false, message: 'Founder Sessions sheet not found.' };

  const col = founderColumnMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, message: 'No booking record was found.' };

  const finder = sheet.getRange(2, col.booking_token, lastRow - 1, 1)
    .createTextFinder(token).matchEntireCell(true).findNext();
  if (!finder) return { ok: false, message: '2 This booking link is invalid or expired.' };

  const row = finder.getRow();
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = h => values[col[h] - 1];
  const status = String(get('booking_status') || 'Not Booked').trim();
  // Payment is verified ONLY when the sheet's booking_status is manually set to Booked.
  const alreadyBooked = status === 'Booked';
  const reserved = status === 'Reserved' || (Boolean(get('calendar_event_id')) && !alreadyBooked);
  const name = String(get('full_name') || '').trim();
  const business = String(get('business_name') || '').trim();
  const email = String(get('email') || '').trim();
  const emailParts = email.split('@');
  const maskedEmail = emailParts.length === 2
    ? (emailParts[0].slice(0, 1) + '***@' + emailParts[1])
    : '';

  const slots = [];
  if (!alreadyBooked && !reserved) {
    founderGetSlots_(get).forEach((slot, index) => {
      if (!slot || slot.invalid || slot.start <= new Date()) return;
      slots.push({
        number: index + 1,
        label: Utilities.formatDate(slot.start, FOUNDER_TIMEZONE, 'EEEE, d MMM yyyy · h:mm a') + ' IST'
      });
    });
  }

  return {
    ok: true,
    alreadyBooked: alreadyBooked,
    reserved: reserved,
    sessionLabel: founderBookedSlotLabel_(get),
    payment: founderPublicPayment_(),
    name: name,
    business: business,
    email: maskedEmail,
    slots: slots
  };
}

/** Render a booking page showing only unbooked, future slots for this waitlist row. */
function renderFounderBookingPage_(token) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Founder Sessions');
  if (!sheet) return HtmlService.createHtmlOutput('Founder Sessions sheet not found.');
  const col = founderColumnMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return HtmlService.createHtmlOutput('No booking is available for this link.');

  const found = sheet.getRange(2, col.booking_token, lastRow - 1, 1)
    .createTextFinder(token).matchEntireCell(true).findNext();
  if (!found) return HtmlService.createHtmlOutput('3 This booking link is invalid or expired.');

  const row = found.getRow();
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = h => values[col[h] - 1];
  const alreadyBooked = String(get('booking_status')) === 'Booked';
  const slots = founderGetSlots_(get);
  const choices = slots.map((slot, i) => {
    if (!slot || slot.invalid || slot.start <= new Date()) return '';
    const label = Utilities.formatDate(slot.start, FOUNDER_TIMEZONE, 'EEEE, d MMM yyyy · h:mm a') + ' IST';
    return `<label class="slot-option"><input type="radio" name="slot" value="${i + 1}" required><span class="slot-radio"></span><span class="slot-label">${escapeHtml_(label)}</span></label>`;
  }).join('');
  const email = String(get('email') || '').trim();
  const name = String(get('full_name') || '').trim();
  const business = String(get('business_name') || '').trim();
  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Book your UNIC Founder Session</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Questrial&family=Raleway:wght@500;600;700;800&display=swap');
:root{--teal:#16C1C1;--mint:#B5FFC1;--frost:#E0F7FA;--ink:#080909;--muted:rgba(0,0,0,.62);--line:rgba(0,0,0,.14)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(135deg,#fff 0%,#fff 62%,#E0F7FA 100%);color:var(--ink);font-family:'Questrial',Arial,sans-serif;-webkit-font-smoothing:antialiased}
.page{width:min(100% - 36px,760px);margin:0 auto;padding:clamp(28px,7vh,72px) 0 52px}.brand{display:flex;align-items:center;gap:10px;margin-bottom:34px}.brand-mark{width:12px;height:12px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 7px rgba(22,193,193,.12)}.brand-name{font:800 13px 'Raleway',Arial,sans-serif;letter-spacing:.17em;text-transform:uppercase}.eyebrow{font:700 11px 'Raleway',Arial,sans-serif;letter-spacing:.17em;text-transform:uppercase;color:#078989;margin:0 0 13px}.hero h1{font:800 clamp(32px,5vw,48px)/1.08 'Raleway',Arial,sans-serif;letter-spacing:-.035em;margin:0 0 14px}.hero h1 span{background:linear-gradient(transparent 70%,var(--mint) 70%,var(--mint) 94%,transparent 94%)}.intro{font-size:18px;line-height:1.55;color:var(--muted);margin:0;max-width:590px}.card{margin-top:30px;padding:clamp(22px,4vw,34px);background:#fff;border:1px solid var(--line);border-radius:24px;box-shadow:0 12px 32px rgba(0,0,0,.07)}.section-label{font:700 12px 'Raleway',Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}.slots{display:grid;gap:10px}.slot-option{position:relative;display:flex;align-items:center;gap:13px;padding:17px 18px;border:1px solid var(--line);border-radius:14px;cursor:pointer;transition:.18s ease;background:#fff}.slot-option:hover{border-color:var(--teal);background:#f8ffff}.slot-option:has(input:checked){border-color:var(--teal);background:var(--frost);box-shadow:0 0 0 2px rgba(22,193,193,.12)}.slot-option input{position:absolute;opacity:0;pointer-events:none}.slot-radio{width:19px;height:19px;flex:none;border:1.5px solid rgba(0,0,0,.42);border-radius:50%;display:grid;place-items:center}.slot-option input:checked + .slot-radio{border:6px solid var(--teal)}.slot-label{font-size:16px;line-height:1.4}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px}.field{display:grid;gap:7px}.field.full{grid-column:1/-1}.field label{font-size:14px;color:var(--muted)}.field input{width:100%;border:1px solid rgba(0,0,0,.25);border-radius:10px;padding:13px 14px;font:16px 'Questrial',Arial,sans-serif;color:var(--ink);outline:none;background:white}.field input:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(22,193,193,.14)}.field input[readonly]{background:#f7fafa;color:#555}.submit{width:100%;margin-top:24px;border:0;border-radius:999px;padding:17px 24px;background:#000;color:#B5FFC1;font:600 16px 'Raleway',Arial,sans-serif;cursor:pointer;transition:transform .15s ease,background .15s ease}.submit:hover{background:#151b1b;transform:translateY(-1px)}.submit:disabled{opacity:.55;cursor:wait;transform:none}.message{display:none;margin-top:18px;padding:15px 17px;border-radius:13px;font-size:15px;line-height:1.5}.message.show{display:block}.message.success{background:#e9fff0;border:1px solid #a8e8b8;color:#145b2a}.message.error{background:#fff1f0;border:1px solid #ffc6c1;color:#a1261d}.foot{display:flex;align-items:center;gap:9px;margin:24px 4px 0;color:var(--muted);font-size:13px}.foot-dot{width:7px;height:7px;background:var(--teal);border-radius:50%;flex:none}.already{padding:20px;border-radius:16px;background:#e9fff0;border:1px solid #a8e8b8;color:#145b2a;line-height:1.55}.already strong{display:block;font:700 19px 'Raleway',Arial,sans-serif;margin-bottom:5px}.no-slots{padding:18px;border-radius:14px;background:#f7fafa;color:var(--muted);line-height:1.5}
@media(max-width:560px){.page{width:min(100% - 24px,760px);padding-top:28px}.fields{grid-template-columns:1fr}.field.full{grid-column:auto}.card{border-radius:18px}.slot-option{padding:15px}}
</style></head><body><main class="page">
<div class="brand"><span class="brand-mark"></span><span class="brand-name">UNIC Business Builders</span></div>
<header class="hero"><p class="eyebrow">Your next step</p><h1>Choose your <span>Founder Session</span></h1><p class="intro">Select one available 90-minute session. All times are in Indian Standard Time (IST).</p></header>
<section class="card">${alreadyBooked ? `<div class="already"><strong>Your session is already booked.</strong>We have recorded your booking. Please check your email for the calendar invitation.</div>` : `<form id="bookingForm">
<p class="section-label">Available session times</p>
<div class="slots">${choices || '<div class="no-slots">There are no future slots available on this link. Please reply to your UNIC email for help.</div>'}</div>
<div class="fields"><div class="field"><label for="founderName">Your name</label><input id="founderName" name="name" required value="${escapeHtml_(name)}"></div><div class="field"><label for="founderEmail">Email for calendar invitation</label><input id="founderEmail" name="email" type="email" required value="${escapeHtml_(email)}"></div></div>
<button class="submit" id="confirmButton" type="submit" ${choices ? '' : 'disabled'}>Confirm my session</button>
<div id="message" class="message" role="status" aria-live="polite"></div>
</form>`}</section>
<div class="foot"><span class="foot-dot"></span><span>Questions? Reply to your UNIC Founder Session email.</span></div>
</main>
${alreadyBooked ? '' : `<script>
(function(){
 const form=document.getElementById('bookingForm'); if(!form)return;
 const button=document.getElementById('confirmButton'); const message=document.getElementById('message');
 let requestInProgress=false;
 function show(text,type){message.textContent=text;message.className='message show '+type;}
 form.addEventListener('submit',function(ev){
  ev.preventDefault(); if(requestInProgress)return;
  const selected=form.querySelector('input[name="slot"]:checked');
  if(!selected){show('Please select a session time first.','error');return;}
  const email=document.getElementById('founderEmail').value.trim();
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){show('Please enter a valid email address.','error');return;}
  requestInProgress=true;button.disabled=true;button.textContent='Confirming your session…';
  show('Please wait while we confirm your session.','success');
  const payload={token:${JSON.stringify(String(token))},slot:Number(selected.value),name:document.getElementById('founderName').value.trim(),email:email};
  google.script.run
   .withSuccessHandler(function(result){
    requestInProgress=false;
    if(result&&result.ok){
     form.innerHTML='<div class="already"><strong>Your Founder Session is confirmed.</strong>'+((result.message||'Your booking has been recorded.') )+'<br><br>Please check your inbox for the calendar invitation.</div>';
    }else{button.disabled=false;button.textContent='Confirm my session';show((result&&result.message)||'We could not confirm this booking. Please contact UNIC before trying again.','error');}
   })
   .withFailureHandler(function(error){
    requestInProgress=false;button.disabled=false;button.textContent='Try confirmation again';
    show('We could not verify the confirmation response. Check your email and calendar before retrying. '+(error&&error.message?error.message:''),'error');
   })
   .confirmFounderBooking(payload);
 });
})();
</script>`}
</body></html>`;
  return HtmlService.createHtmlOutput(page)
    .setTitle('Book your UNIC Founder Session')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Public Apps Script bridge used by the booking page.
function confirmFounderBooking(data) {
  return confirmFounderBooking_(data);
}

function confirmFounderBooking_(data) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(20000);
    lockAcquired = true;

    const token = clean_(data && data.token);
    const slotNumber = Number(data && data.slot);
    if (!token) return { ok: false, message: 'Invalid booking token.' };

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Founder Sessions');
    if (!sheet) return { ok: false, message: 'Founder Sessions sheet not found.' };
    const col = founderColumnMap_(sheet);
    if (sheet.getLastRow() < 2) return { ok: false, message: 'No booking record was found.' };

    const finder = sheet.getRange(2, col.booking_token, sheet.getLastRow() - 1, 1)
      .createTextFinder(token).matchEntireCell(true).findNext();
    if (!finder) return { ok: false, message: 'This booking link is invalid or expired.' };

    const row = finder.getRow();
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const get = h => values[col[h] - 1];
    const currentStatus = String(get('booking_status') || 'Not Booked').trim();
    const existingEventId = String(get('calendar_event_id') || '').trim();

    // Only the manual sheet status "Booked" means payment has been verified.
    if (currentStatus === 'Booked') {
      return {
        ok: true, alreadyBooked: true, reserved: false,
        sessionLabel: founderBookedSlotLabel_(get),
        message: 'Your session is booked. Payment has been verified.'
      };
    }

    // If the calendar event already exists, preserve the reservation and never duplicate it.
    if (existingEventId) {
      if (currentStatus !== 'Reserved') {
        sheet.getRange(row, col.booking_status).setValue('Reserved');
      }
      SpreadsheetApp.flush();
      const refreshedValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      const refreshedGet = h => refreshedValues[col[h] - 1];
      return {
        ok: true, alreadyBooked: false, reserved: true,
        sessionLabel: founderBookedSlotLabel_(refreshedGet),
        message: 'Your session is reserved. Complete payment within ' + FOUNDER_PAYMENT.paymentDeadlineHours + ' hours.'
      };
    }

    if (![1, 2, 3].includes(slotNumber)) {
      return { ok: false, message: 'Please select one of the available slots.' };
    }

    const slots = founderGetSlots_(get);
    const slot = slots[slotNumber - 1];
    if (!slot || slot.invalid || slot.start <= new Date()) {
      return { ok: false, message: 'This slot is no longer available. Please contact UNIC.' };
    }

    const guestEmail = clean_(get('email'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return { ok: false, message: 'The founder email address on this booking is invalid.' };
    }

    const calendar = CalendarApp.getDefaultCalendar();
    const events = calendar.getEvents(slot.start, slot.end);
    const tokenMarker = 'UNIC_BOOKING_TOKEN:' + token;
    const expectedTitle = 'UNIC Founder Session — ' + String(get('business_name') || 'Founder');

    let event = events.find(item =>
      String(item.getDescription() || '').indexOf(tokenMarker) !== -1
    );

    // Reconcile legacy events created before the unique token marker was added.
    if (!event) {
      event = events.find(item => {
        if (item.getTitle() !== expectedTitle) return false;
        if (item.getStartTime().getTime() !== slot.start.getTime()) return false;
        if (item.getEndTime().getTime() !== slot.end.getTime()) return false;
        return item.getGuestList().some(guest =>
          String(guest.getEmail()).toLowerCase() === guestEmail.toLowerCase()
        );
      });
    }

    if (!event) {
      if (events.length > 0) {
        return { ok: false, message: 'That time is no longer available. Please contact UNIC for another option.' };
      }
      event = calendar.createEvent(
        expectedTitle,
        slot.start,
        slot.end,
        {
          description: '90-minute UNIC Founder Session. Booking made through the UNIC waitlist.\n' + tokenMarker,
          guests: guestEmail,
          sendInvites: true
        }
      );
    }

    // Save event and selected slot, then mark Reserved. Never mark Booked here.
    sheet.getRange(row, col.calendar_event_id).setValue(event.getId());
    sheet.getRange(row, col.booked_slot).setValue(String(slotNumber));
    sheet.getRange(row, col.booking_status).setValue('Reserved');
    SpreadsheetApp.flush();

    return {
      ok: true,
      alreadyBooked: false,
      reserved: true,
      sessionLabel: Utilities.formatDate(slot.start, FOUNDER_TIMEZONE, 'EEEE, d MMM yyyy · h:mm a') + ' IST',
      message: 'Your session is reserved. Complete payment within ' + FOUNDER_PAYMENT.paymentDeadlineHours + ' hours. Your booking will be marked Booked only after payment is manually verified.'
    };
  } catch (err) {
    console.error('Booking confirmation failed: ' + (err && err.stack ? err.stack : err));
    return { ok: false, message: (err && err.message) ? err.message : 'Booking could not be completed.' };
  } finally {
    if (lockAcquired && lock.hasLock()) lock.releaseLock();
  }
}

function escapeHtml_(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/** Test authorization and mail/calendar access without sending a real invitation. */
function testFounderSessionPermissions() {
  const calendar = CalendarApp.getDefaultCalendar();
  Logger.log('Calendar: ' + calendar.getName());
  Logger.log('Mail remaining quota: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Configured Web app URL: ' + FOUNDER_WEB_APP_URL);
}

function testQrEmail() {
  const fileId = '1DheYCQbsV3d1uUlYvjJAFl0M18chOBQu';

  const qrBlob = DriveApp.getFileById(fileId)
    .getBlob()
    .setName('UNIC_Kotak_UPI_QR.png')
    .setContentType('image/png');

  const html = `
    <h2>UNIC Payment QR Test</h2>
    <p>Scan this QR code to pay.</p>
    <img
      src="cid:paymentQr"
      alt="UNIC payment QR"
      width="250"
      style="display:block;height:auto;"
    >
    <p>UPI ID: natunic@kotak</p>
  `;

  MailApp.sendEmail({
    to: 'tulsilukhi06@gmail.com',
    subject: 'UNIC - QR Image Test',
    body: 'UNIC payment QR test.',
    htmlBody: html,
    inlineImages: {
      paymentQr: qrBlob
    }
  });

  Logger.log('QR test email sent.');
}



function authorizeAllServices() {
  const expectedEmail = 'nat@unicbiz.com';
  const activeEmail = Session.getActiveUser().getEmail();

  Logger.log('Active account: ' + activeEmail);

  if (activeEmail && activeEmail.toLowerCase() !== expectedEmail) {
    throw new Error(
      'Please authorize using ' + expectedEmail +
      '. Current account: ' + activeEmail
    );
  }

  // Google Sheets
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Spreadsheet: ' + spreadsheet.getName());

  // Google Drive
  const qrFile = DriveApp.getFileById(
    FOUNDER_PAYMENT.qrImageFileId
  );
  Logger.log('QR image: ' + qrFile.getName());

  // Google Calendar
  const calendar = CalendarApp.getDefaultCalendar();
  Logger.log('Calendar: ' + calendar.getName());

  // Email service
  Logger.log(
    'Remaining email quota: ' +
    MailApp.getRemainingDailyQuota()
  );

  Logger.log('Authorization checks completed.');
}


function testAlternateSender() {
  MailApp.sendEmail({
    to: 'tulsilukhi06@gmail.com',
    subject: 'UNIC - Alternate Account Sender Test',
    body: 'Testing email from lukhitulshi99094@gmail.com'
  });
}


function authorizeDriveAccess() {
  const file = DriveApp.getFileById(
    '1DheYCQbsV3d1uUlYvjJAFl0M18chOBQu'
  );

  Logger.log('QR file found: ' + file.getName());
  Logger.log('MIME type: ' + file.getMimeType());
}