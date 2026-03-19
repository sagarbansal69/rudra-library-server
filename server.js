
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = path.join(__dirname, 'data.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = { seats:{}, transactions:[], motionLog:[], settings:{ boysFee:900, girlsFee:800, callmebotKeys:{} } };
    for (let i=1;i<=38;i++) fresh.seats[String(i)]={status:'vacant',student:null};
    saveDB(fresh); return fresh;
  }
  return JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
}
function saveDB(data){ fs.writeFileSync(DB_FILE, JSON.stringify(data,null,2)); }
function curMonth(){ return new Date().toISOString().slice(0,7); }
function isDue(student){ return student ? !student.paidMonths.includes(curMonth()) : false; }
function getFee(gender,db){ return gender==='female'?db.settings.girlsFee:db.settings.boysFee; }

async function sendWhatsApp(phone, name, message, db) {
  const clean = phone.replace(/\D/g,'');
  const apikey = db.settings.callmebotKeys?.[clean];
  if (!apikey){ console.log(`[WA] No key for ${name}`); return {sent:false,reason:'no_key'}; }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=91${clean}&text=${encodeURIComponent(message)}&apikey=${apikey}`;
    await axios.get(url,{timeout:10000});
    console.log(`[WA] Sent to ${name}`); return {sent:true};
  } catch(e){ console.log(`[WA] Failed:`,e.message); return {sent:false,reason:e.message}; }
}

function dueMsg(name,seat,fee,month){
  return `Hello ${name},\n\nYour library fee of Rs.${fee} for ${month} is PENDING.\n\nSeat: ${seat}\nAmount: Rs.${fee}\n\nPay by 5th to keep your seat.\n\nRudra Library & Study Point\nOpen 06:00 AM - 11:00 PM`;
}

app.get('/', (req,res) => {
  const db=loadDB();
  const occ=Object.values(db.seats).filter(s=>s.status==='occupied').length;
  const due=Object.keys(db.seats).filter(k=>db.seats[k].status==='occupied'&&isDue(db.seats[k].student)).length;
  res.json({status:'running',library:'Rudra Library & Study Point',whatsapp:'CallMeBot ready',occupancy:`${occ}/38`,dueThisMonth:due});
});

app.post('/hikvision-alert', async(req,res)=>{
  const db=loadDB();
  db.motionLog.unshift({id:Date.now(),timestamp:new Date().toISOString(),type:req.body.eventType||'motion'});
  if(db.motionLog.length>500) db.motionLog=db.motionLog.slice(0,500);
  const dueSeats=Object.keys(db.seats).filter(k=>db.seats[k].status==='occupied'&&isDue(db.seats[k].student));
  let sent=0;
  for(const k of dueSeats){
    const s=db.seats[k].student; const fee=getFee(s.gender,db);
    const r=await sendWhatsApp(s.phone,s.name,dueMsg(s.name,k,fee,curMonth()),db);
    if(r.sent) sent++;
  }
  saveDB(db); res.json({success:true,motionLogged:true,whatsappSent:sent});
});

app.post('/send-due-reminders', async(req,res)=>{
  const db=loadDB();
  const dueSeats=Object.keys(db.seats).filter(k=>db.seats[k].status==='occupied'&&isDue(db.seats[k].student));
  const results=[];
  for(const k of dueSeats){
    const s=db.seats[k].student; const fee=getFee(s.gender,db);
    const r=await sendWhatsApp(s.phone,s.name,dueMsg(s.name,k,fee,curMonth()),db);
    results.push({seat:k,name:s.name,...r});
  }
  res.json({success:true,total:dueSeats.length,results});
});

app.post('/register-wa-key',(req,res)=>{
  const {phone,apikey}=req.body;
  if(!phone||!apikey) return res.status(400).json({error:'phone and apikey required'});
  const db=loadDB(); const clean=phone.replace(/\D/g,'');
  if(!db.settings.callmebotKeys) db.settings.callmebotKeys={};
  db.settings.callmebotKeys[clean]=apikey; saveDB(db);
  res.json({success:true,message:`Key registered for ${clean}`});
});

app.post('/sync',(req,res)=>{
  const {state}=req.body; if(!state) return res.status(400).json({error:'No state'});
  saveDB(state); res.json({success:true});
});

app.get('/state',(req,res)=>res.json(loadDB()));
app.get('/motion-log',(req,res)=>res.json(loadDB().motionLog||[]));
app.get('/due-list',(req,res)=>{
  const db=loadDB();
  const due=Object.keys(db.seats).filter(k=>db.seats[k].status==='occupied'&&isDue(db.seats[k].student))
    .map(k=>({seat:k,name:db.seats[k].student.name,phone:db.seats[k].student.phone,
      fee:getFee(db.seats[k].student.gender,db),
      hasWaKey:!!db.settings.callmebotKeys?.[db.seats[k].student.phone.replace(/\D/g,'')]}));
  res.json({month:curMonth(),total:due.length,due});
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`Rudra Library Server on port ${PORT}`));

// Serve the app
const publicPath = require('path').join(__dirname, 'public');
require('fs').existsSync(publicPath) && app.use(require('express').static(publicPath));
