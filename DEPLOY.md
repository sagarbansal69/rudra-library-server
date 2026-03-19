# Library Server — Full Deployment Guide

## What this server does
- Receives motion alerts from Hikvision camera
- Automatically sends WhatsApp fee reminders to due students
- Syncs with your browser library app
- Logs all camera motion events

---

## STEP 1 — Deploy to Railway (free hosting)

1. Go to https://railway.app and sign up (free)
2. Click "New Project" → "Deploy from GitHub"
3. Upload this folder to a new GitHub repo first:
   - Go to https://github.com/new
   - Create repo named "library-server"
   - Upload all files from this folder
4. Back in Railway, select your repo
5. Railway auto-detects Node.js and deploys
6. Click your deployment → "Settings" → copy the PUBLIC URL
   Example: https://library-server-production-abc123.up.railway.app

That URL is your server address. Save it.

---

## STEP 2 — Connect WhatsApp

1. Open your server URL in browser:
   https://your-railway-url.up.railway.app/wa-qr

2. You will see a QR code

3. On your phone:
   - Open WhatsApp
   - Tap 3 dots (top right) → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code on screen

4. Refresh the page — it should say "WhatsApp is connected and ready"

Done. Your server can now send WhatsApp messages.

---

## STEP 3 — Configure Hikvision to send alerts

### On Hikvision app (iVMS-4200 or Hik-Connect):

1. Open camera settings
2. Go to: Configuration → Event → Basic Event → Motion Detection
3. Enable Motion Detection
4. Scroll to "Linkage Method"
5. Find "Notify Surveillance Center" or "HTTP Listening"
6. Set HTTP URL to:
   https://your-railway-url.up.railway.app/hikvision-alert
7. Method: POST
8. Save

### If your camera has "HTTP Event":
- Go to Configuration → Network → Advanced → HTTP Listening
- Server Address: your-railway-url.up.railway.app
- Port: 443
- URL: /hikvision-alert

Now every time motion is detected, your server receives an alert.

---

## STEP 4 — Test everything

Open in browser:
https://your-railway-url.up.railway.app/

You should see:
{
  "status": "running",
  "whatsapp": "ready",
  ...
}

Trigger motion in front of camera.
Then check:
https://your-railway-url.up.railway.app/motion-log

You should see the motion event logged.

---

## STEP 5 — Send manual fee reminders

To blast WhatsApp messages to ALL students with pending fees:

Open in browser or call from your app:
POST https://your-railway-url.up.railway.app/send-due-reminders

Or just visit the URL — you can make a button in your library app for this.

---

## What happens automatically

Every time camera detects motion:
1. Entry is logged with timestamp
2. Server checks all occupied seats
3. Any student with unpaid fee for current month gets a WhatsApp:

   "Hello Rahul,
   Your library seat fee of ₹900 for 2026-03 is pending.
   Please pay at the earliest to keep your seat.
   Thank you."

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| WhatsApp disconnects | Revisit /wa-qr and scan again |
| Hikvision not sending | Check camera is on same network, try HTTP not HTTPS |
| Railway goes to sleep | Upgrade to Railway Hobby plan (₹400/month) for always-on |
| Messages not sending | Make sure phone with WhatsApp stays connected to internet |

---

## Free tier limits

- Railway free: 500 hours/month (enough for ~20 days)
- For always-on: Railway Hobby = $5/month (₹420)
- WhatsApp: Unlimited on regular WhatsApp (unofficial method)
