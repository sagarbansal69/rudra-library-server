const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = path.join(__dirname, 'data.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = { seats: {}, transactions: [], motionLog: [], settings: { boysFee: 900, girlsFee: 800 } };
    for (let i = 1; i <= 38; i++) fresh.seats[String(i)] = { status: 'vacant', student: null };
    saveDB(fresh);
    return fresh;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function curMonth() {
  return new Date().toISOString().slice(0, 7);
}

function isDue(student) {
  if (!student) return false;
  return !student.paidMonths.includes(curMonth());
}

// ── Hikvision webhook ─────────────────────────────────────────────────────────
// Hikvision sends XML or form-data on motion. We parse it and log entry.

app.post('/hikvision-alert', async (req, res) => {
  console.log('[Hikvision] Alert received:', JSON.stringify(req.body).slice(0, 200));

  const db = loadDB();
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type: req.body.eventType || req.body.EventType || 'motion',
    channel: req.body.channelID || req.body.ChannelID || '1',
    raw: req.body
  };
  db.motionLog.unshift(entry);
  if (db.motionLog.length > 500) db.motionLog = db.motionLog.slice(0, 500);
  saveDB(db);

  // Check all occupied seats with due fees and send WhatsApp
  const dueStudents = Object.values(db.seats)
    .filter(s => s.status === 'occupied' && isDue(s.student));

  for (const seat of dueStudents) {
    const s = seat.student;
    const fee = s.gender === 'female' ? db.settings.girlsFee : db.settings.boysFee;
    await sendWhatsApp(s.phone, s.name, fee, curMonth());
  }

  res.status(200).send('OK');
});

// ── WhatsApp via whatsapp-web.js ──────────────────────────────────────────────

let waClient = null;
let waStatus = 'not_initialized';
let waQR = null;

async function initWhatsApp() {
  try {
    const { Client, LocalAuth } = require('whatsapp-web.js');
    waClient = new Client({ authStrategy: new LocalAuth(), puppeteer: { args: ['--no-sandbox'] } });

    waClient.on('qr', (qr) => {
      waQR = qr;
      waStatus = 'waiting_qr';
      console.log('[WhatsApp] Scan QR at GET /wa-qr');
    });

    waClient.on('ready', () => {
      waStatus = 'ready';
      waQR = null;
      console.log('[WhatsApp] Ready');
    });

    waClient.on('disconnected', () => { waStatus = 'disconnected'; });
    await waClient.initialize();
  } catch (e) {
    console.log('[WhatsApp] Not available:', e.message);
    waStatus = 'unavailable';
  }
}

async function sendWhatsApp(phone, name, fee, month) {
  if (!waClient || waStatus !== 'ready') {
    console.log(`[WhatsApp] Would send to ${phone}: Fee due ₹${fee}`);
    return;
  }
  try {
    const number = phone.replace(/\D/g, '');
    const chatId = `91${number}@c.us`;
    const msg = `Hello ${name},\n\nYour library seat fee of ₹${fee} for ${month} is pending.\n\nPlease pay at the earliest to keep your seat.\n\nThank you.`;
    await waClient.sendMessage(chatId, msg);
    console.log(`[WhatsApp] Sent to ${name} (${phone})`);
  } catch (e) {
    console.log('[WhatsApp] Send error:', e.message);
  }
}

// ── WhatsApp QR endpoint ──────────────────────────────────────────────────────

app.get('/wa-qr', (req, res) => {
  if (waStatus === 'ready') return res.send('<h2>WhatsApp is connected and ready.</h2>');
  if (!waQR) return res.send(`<h3>Status: ${waStatus}</h3><p>QR not ready yet. Refresh in 10 seconds.</p>`);
  res.send(`
    <html><body style="text-align:center;font-family:sans-serif;padding:2rem">
    <h2>Scan this QR with WhatsApp</h2>
    <p>Open WhatsApp → Linked Devices → Link a Device</p>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(waQR)}" />
    <p style="color:gray;font-size:13px">Refresh page after scanning</p>
    </body></html>
  `);
});

// ── API: send manual WhatsApp to all due students ─────────────────────────────

app.post('/send-due-reminders', async (req, res) => {
  const db = loadDB();
  const due = Object.entries(db.seats)
    .filter(([, s]) => s.status === 'occupied' && isDue(s.student));

  let sent = 0;
  for (const [, seat] of due) {
    const s = seat.student;
    const fee = s.gender === 'female' ? db.settings.girlsFee : db.settings.boysFee;
    await sendWhatsApp(s.phone, s.name, fee, curMonth());
    sent++;
  }
  res.json({ success: true, sent, total: due.length });
});

// ── API: sync library state from browser app ──────────────────────────────────

app.post('/sync', (req, res) => {
  const { state } = req.body;
  if (!state) return res.status(400).json({ error: 'No state provided' });
  saveDB(state);
  res.json({ success: true });
});

app.get('/state', (req, res) => {
  res.json(loadDB());
});

// ── Motion log ────────────────────────────────────────────────────────────────

app.get('/motion-log', (req, res) => {
  const db = loadDB();
  res.json(db.motionLog || []);
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    whatsapp: waStatus,
    endpoints: [
      'POST /hikvision-alert  — Hikvision webhook',
      'POST /send-due-reminders — Manual WhatsApp blast',
      'GET  /wa-qr            — Scan WhatsApp QR',
      'POST /sync             — Push library state from browser',
      'GET  /state            — Get library state',
      'GET  /motion-log       — Recent motion events'
    ]
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initWhatsApp();
});
