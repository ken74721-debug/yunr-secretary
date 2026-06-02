// ╔══════════════════════════════════════════════════════════╗
// ║  芸兒小秘書 — server.js  (Phase 3 升級版)                ║
// ║  新增：動態 redirect_uri / 圖片課表辨識 / 健康追蹤 API   ║
// ╚══════════════════════════════════════════════════════════╝

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT      = process.env.PORT || 3766;
const BASE_URL  = process.env.BASE_URL || `http://localhost:${PORT}`;  // ← Fly.io 設 BASE_URL=https://yunr-sec-kenchiu.fly.dev
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'secretary.json');
const TOKEN_FILE= path.join(DATA_DIR, 'google_token.json');
const CFG_FILE  = path.join(DATA_DIR, 'config.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';  // ← 課表圖片 AI 辨識用

const LINE = {
  channelToken : '1Rp5zYDQwApNLx8c/3Bl8A9aLcFkCmfAWtuNfDE/34D+FSJnzg6T/Vzf81GozTDCmBWjKCkJt4jLjHUlrni47LuH+VoxBCcj7/aCEVAY8rz96ILn1s/C4B0IcZqDBJpbGCjzSMzcPA/AnOFmkCGpygdB04t89/1O/w1cDnyilFU=',
  userId       : 'U675e86d49422cb0aabb4d5b20cac34ae',
  groupIds     : [],
};

const GOOGLE = {
  client_id    : '1054077742554-uhqjjsjjkocmhuh404bjcd48avu3r7o2.apps.googleusercontent.com',
  client_secret: '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',
  get redirect_uri() { return BASE_URL + '/auth/callback'; },  // ← 動態，支援 Fly.io
  scopes       : [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' '),
};

// ── 確保 data 資料夾 ──
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('  ✓ 已自動建立 data/ 資料夾');
  }
} catch(e) {
  console.error('  ✗ 無法建立 data/ 資料夾:', e.message);
}

const DEFAULT_DATA = {
  todos: [
    {id:1,text:'完成 Q2 季報初稿',done:false,priority:'high',tag:'工作報告',tagCls:'tg-p',due:'今天',overdue:false,project:'Q2 季報',created:Date.now()},
    {id:2,text:'與 Alex 確認產品路線圖',done:false,priority:'high',tag:'產品',tagCls:'tg-b',due:'今天',overdue:false,project:'產品規劃',created:Date.now()},
    {id:3,text:'回覆客戶提案 email',done:false,priority:'high',tag:'客戶',tagCls:'tg-a',due:'昨天',overdue:true,project:'',created:Date.now()},
  ],
  projects: [],
  notes: [],
  familyTodos: [],     // ← 新：家庭代辦
  schedules: [],       // ← 新：小孩課表（AI 辨識結果）
  healthLogs: [],      // ← 新：健康記錄
  settings: { dark: false }
};

const DEFAULT_CFG = { dailyPush:true, dailyHour:7, dailyMinute:30, calendarIds:[] };

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE,JSON.stringify(DEFAULT_DATA,null,2),'utf8'); return JSON.parse(JSON.stringify(DEFAULT_DATA)); }
    const d = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    // 補上新欄位（升級舊資料）
    if (!d.familyTodos) d.familyTodos = [];
    if (!d.schedules) d.schedules = [];
    if (!d.healthLogs) d.healthLogs = [];
    return d;
  } catch(e) { return JSON.parse(JSON.stringify(DEFAULT_DATA)); }
}
function writeData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE,DATA_FILE+'.bak');
    fs.writeFileSync(DATA_FILE,JSON.stringify(data,null,2),'utf8');
    return true;
  } catch(e) { console.error('writeData error:',e.message); return false; }
}
function readCfg() {
  try { return fs.existsSync(CFG_FILE) ? {...DEFAULT_CFG,...JSON.parse(fs.readFileSync(CFG_FILE,'utf8'))} : DEFAULT_CFG; }
  catch(e) { return DEFAULT_CFG; }
}
function writeCfg(c) {
  try { fs.writeFileSync(CFG_FILE,JSON.stringify(c,null,2),'utf8'); return true; } catch(e) { return false; }
}
function readToken() {
  try { return fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE,'utf8')) : null; }
  catch(e) { return null; }
}
function writeToken(t) {
  try { fs.writeFileSync(TOKEN_FILE,JSON.stringify(t,null,2),'utf8'); } catch(e) {}
}
function getAuthUrl() {
  const p = new URLSearchParams({ client_id:GOOGLE.client_id, redirect_uri:GOOGLE.redirect_uri, response_type:'code', scope:GOOGLE.scopes, access_type:'offline', prompt:'consent' });
  return 'https://accounts.google.com/o/oauth2/v2/auth?'+p.toString();
}

// ── HTTP helpers ──
function httpsPost(hostname, reqPath, data, extraHeaders) {
  return new Promise((resolve,reject) => {
    const body = typeof data==='string' ? data : new URLSearchParams(data).toString();
    const headers = {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body),...(extraHeaders||{})};
    const req = https.request({hostname,path:reqPath,method:'POST',headers}, res=>{
      let r=''; res.on('data',c=>r+=c); res.on('end',()=>{ try{resolve(JSON.parse(r))}catch(e){resolve(r)} });
    });
    req.on('error',reject); req.write(body); req.end();
  });
}
function httpsGet(hostname, reqPath, token) {
  return new Promise((resolve,reject) => {
    const req = https.request({hostname,path:reqPath,method:'GET',headers:{Authorization:'Bearer '+token}}, res=>{
      let r=''; res.on('data',c=>r+=c); res.on('end',()=>{ try{resolve(JSON.parse(r))}catch(e){resolve(r)} });
    });
    req.on('error',reject); req.end();
  });
}
function httpsPostJson(hostname, reqPath, bodyObj, extraHeaders) {
  return new Promise((resolve,reject) => {
    const body = JSON.stringify(bodyObj);
    const headers = {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...(extraHeaders||{})};
    const req = https.request({hostname,path:reqPath,method:'POST',headers}, res=>{
      let r=''; res.on('data',c=>r+=c); res.on('end',()=>{ try{resolve(JSON.parse(r))}catch(e){resolve(r)} });
    });
    req.on('error',reject); req.write(body); req.end();
  });
}

async function exchangeCode(code) {
  const r = await httpsPost('oauth2.googleapis.com','/token',{code,client_id:GOOGLE.client_id,client_secret:GOOGLE.client_secret,redirect_uri:GOOGLE.redirect_uri,grant_type:'authorization_code'});
  if (r.access_token) { r.expires_at=Date.now()+(r.expires_in||3600)*1000; writeToken(r); }
  return r;
}
async function getValidToken() {
  let t = readToken();
  if (!t) return null;
  if (Date.now() > (t.expires_at||0)-300000) {
    if (!t.refresh_token) return null;
    try {
      const r = await httpsPost('oauth2.googleapis.com','/token',{client_id:GOOGLE.client_id,client_secret:GOOGLE.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'});
      if (r.access_token) { t={...t,...r,expires_at:Date.now()+(r.expires_in||3600)*1000}; writeToken(t); }
      else return null;
    } catch(e) { return null; }
  }
  return t;
}

// ── LINE ──
async function linePost(userId, text) {
  const body = JSON.stringify({to:userId, messages:[{type:'text',text}]});
  return new Promise((resolve,reject) => {
    const req = https.request({
      hostname:'api.line.me', path:'/v2/bot/message/push', method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+LINE.channelToken,'Content-Length':Buffer.byteLength(body)}
    }, res=>{ let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:d})); });
    req.on('error',reject); req.write(body); req.end();
  });
}
async function linePushAll(text) {
  const results=[];
  try { const r=await linePost(LINE.userId,text); results.push({target:'user',status:r.status,body:r.body}); } catch(e){ results.push({target:'user',error:e.message}); }
  for (const gid of LINE.groupIds) {
    try { const r=await linePost(gid,text); results.push({target:'group:'+gid,status:r.status}); } catch(e){ results.push({target:'group:'+gid,error:e.message}); }
  }
  return results;
}

// ── Google Calendar ──
const COLOR_MAP={'1':'#a4bdfc','2':'#7ae7bf','3':'#dbadff','4':'#ff887c','5':'#fbd75b','6':'#ffb878','7':'#46d6db','8':'#e1e1e1','9':'#5484ed','10':'#51b749','11':'#dc2127'};
function extractMeetLink(txt){ const m=(txt||'').match(/https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/); return m?m[0]:''; }
async function fetchEvents(tMin, tMax, calIds) {
  const t = await getValidToken();
  if (!t) return [];
  const ids = (calIds&&calIds.length) ? calIds : ['primary'];
  const allEvs=[];
  for (const cid of ids) {
    try {
      const params=new URLSearchParams({timeMin:tMin,timeMax:tMax,singleEvents:'true',orderBy:'startTime',maxResults:'50'});
      const r=await httpsGet('www.googleapis.com','/calendar/v3/calendars/'+encodeURIComponent(cid)+'/events?'+params,t.access_token);
      (r.items||[]).forEach(ev=>allEvs.push({
        id:ev.id,calendarId:cid,title:ev.summary||'（無標題）',
        start:ev.start?.dateTime||ev.start?.date,end:ev.end?.dateTime||ev.end?.date,
        allDay:!ev.start?.dateTime,location:ev.location||'',description:ev.description||'',
        meetLink:ev.hangoutLink||extractMeetLink(ev.description),
        color:ev.colorId?COLOR_MAP[ev.colorId]:null,
        organizer:ev.organizer?.displayName||ev.organizer?.email||'',
        attendees:(ev.attendees||[]).map(a=>({name:a.displayName||a.email,self:!!a.self})).slice(0,8),
      }));
    } catch(e){}
  }
  allEvs.sort((a,b)=>new Date(a.start)-new Date(b.start));
  return allEvs;
}

// ── 課表圖片 AI 辨識（Claude API）──
async function recognizeScheduleImage(base64Image, mimeType) {
  if (!ANTHROPIC_API_KEY) throw new Error('未設定 ANTHROPIC_API_KEY');
  const payload = {
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64Image }
        },
        {
          type: 'text',
          text: `請辨識這張課表圖片，以 JSON 格式回傳。
格式如下（只回傳 JSON，不要其他文字）：
{
  "childName": "孩子姓名（如圖片有的話，否則空字串）",
  "period": "學期/時間（如圖片有的話）",
  "schedule": [
    {
      "day": "星期一",
      "dayIndex": 1,
      "periods": [
        { "time": "08:00-09:00", "subject": "數學", "teacher": "陳老師（如有）", "room": "教室（如有）" }
      ]
    }
  ]
}
dayIndex: 1=一, 2=二, 3=三, 4=四, 5=五, 6=六, 0=日
如果無法辨識為課表圖片，回傳 { "error": "無法辨識為課表" }`
        }
      ]
    }]
  };
  const result = await httpsPostJson('api.anthropic.com', '/v1/messages', payload, {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  });
  const text = result.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 回傳格式錯誤');
  return JSON.parse(jsonMatch[0]);
}

// ── 解析 multipart body（圖片上傳）──
function parseMultipart(body, boundary) {
  const parts = {};
  const sep = Buffer.from('--' + boundary);
  let pos = 0;
  while (pos < body.length) {
    const start = indexOf(body, sep, pos);
    if (start === -1) break;
    pos = start + sep.length;
    if (body[pos] === 45 && body[pos+1] === 45) break; // '--'
    pos += 2; // skip \r\n
    const headerEnd = indexOf(body, Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;
    const headerStr = body.slice(pos, headerEnd).toString();
    pos = headerEnd + 4;
    const nextBound = indexOf(body, sep, pos);
    const dataEnd = nextBound === -1 ? body.length : nextBound - 2;
    const data = body.slice(pos, dataEnd);
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const mimeMatch = headerStr.match(/Content-Type:\s*(\S+)/i);
    if (nameMatch) {
      parts[nameMatch[1]] = { data, mime: mimeMatch ? mimeMatch[1] : 'application/octet-stream', header: headerStr };
    }
    pos = nextBound === -1 ? body.length : nextBound;
  }
  return parts;
}
function indexOf(buf, search, offset=0) {
  for (let i = offset; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i+j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── msg builders ──
function fmtTime(iso){ if(!iso)return''; return new Date(iso).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false}); }
function buildEventsMsg(evs, label) {
  const now=new Date();
  const dateStr=now.toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
  if (!evs.length) return '🤖 芸兒小秘書\n📅 '+label+'\n'+dateStr+'\n\n✨ 沒有行程，輕鬆一下！';
  const lines=evs.map(ev=>{
    const time=ev.allDay?'全天':fmtTime(ev.start);
    return '  ▪ '+time+' '+ev.title+(ev.meetLink?' 🎥':'')+(ev.location?' 📍'+ev.location:'');
  });
  return '🤖 芸兒小秘書\n📅 '+label+'（'+evs.length+' 個）\n'+dateStr+'\n\n'+lines.join('\n');
}
function buildTodosMsg(todos) {
  const pending=(todos||[]).filter(t=>!t.done);
  if (!pending.length) return '🤖 芸兒小秘書\n✅ 待辦清單\n\n🎉 所有事項已完成，太棒了！';
  const high=pending.filter(t=>t.priority==='high');
  const med=pending.filter(t=>t.priority==='med');
  const low=pending.filter(t=>t.priority==='low');
  let lines=[];
  if (high.length){ lines.push('🔴 高優先：'); high.slice(0,5).forEach(t=>lines.push('  ▪ '+t.text)); }
  if (med.length){ lines.push('🟡 一般：'); med.slice(0,4).forEach(t=>lines.push('  ▪ '+t.text)); }
  if (low.length){ lines.push('🟢 低優先：'); low.slice(0,3).forEach(t=>lines.push('  ▪ '+t.text)); }
  return '🤖 芸兒小秘書\n📋 待辦清單（'+pending.length+' 項待完成）\n\n'+lines.join('\n');
}

// ── daily push scheduler ──
let _dailyTimer=null;
function scheduleDaily() {
  if (_dailyTimer) clearTimeout(_dailyTimer);
  const cfg=readCfg();
  if (!cfg.dailyPush) return;
  const now=new Date();
  const next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),cfg.dailyHour,cfg.dailyMinute,0,0);
  if (next<=now) next.setDate(next.getDate()+1);
  console.log('  📅 每日推播排程：'+next.toLocaleDateString('zh-TW')+' '+String(cfg.dailyHour).padStart(2,'0')+':'+String(cfg.dailyMinute).padStart(2,'0'));
  _dailyTimer=setTimeout(async ()=>{
    try {
      const now2=new Date();
      const tMin=new Date(now2.getFullYear(),now2.getMonth(),now2.getDate()).toISOString();
      const tMax=new Date(now2.getFullYear(),now2.getMonth(),now2.getDate()+1).toISOString();
      const cfg2=readCfg();
      const evs=await fetchEvents(tMin,tMax,cfg2.calendarIds.length?cfg2.calendarIds:['primary']);
      const data=readData();
      const label='今日行程 — '+now2.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric',weekday:'short'});
      let msg=buildEventsMsg(evs,label);
      const pendingHigh=(data.todos||[]).filter(t=>!t.done&&t.priority==='high');
      if (pendingHigh.length) msg+='\n\n🔴 高優先待辦（'+pendingHigh.length+' 項）\n'+pendingHigh.slice(0,5).map(t=>'  ▪ '+t.text).join('\n');
      msg+='\n\n💪 今天也加油！';
      await linePushAll(msg);
      console.log('  ✓ 每日推播已傳送');
    } catch(e){ console.error('  每日推播失敗:',e.message); }
    scheduleDaily();
  }, next-now);
}

// ── MIME ──
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
const json=(res,code,data)=>{ res.writeHead(code,{'Content-Type':MIME['.json']}); res.end(JSON.stringify(data)); };

// ════════════════════════════ SERVER ════════════════════════════
const server=http.createServer(async (req,res)=>{
  const _u=new URL(req.url,'http://localhost');
  const pn=_u.pathname, q=Object.fromEntries(_u.searchParams), m=req.method;
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (m==='OPTIONS'){ res.writeHead(204); return res.end(); }

  // ─ 資料 ─
  if (pn==='/api/data'&&m==='GET') return json(res,200,readData());
  if (pn==='/api/data'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{ try{ json(res,writeData(JSON.parse(b))?200:500,{ok:true}); }catch(e){ json(res,400,{ok:false,error:e.message}); } });
    return;
  }

  // ─ 設定 ─
  if (pn==='/api/config'&&m==='GET') return json(res,200,readCfg());
  if (pn==='/api/config'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{
      try{ const cur=readCfg(),upd=JSON.parse(b),newCfg={...cur,...upd}; writeCfg(newCfg); scheduleDaily(); json(res,200,{ok:true,config:newCfg}); }
      catch(e){ json(res,400,{ok:false,error:e.message}); }
    }); return;
  }

  // ─ Google Auth ─
  if (pn==='/api/auth/status'&&m==='GET'){
    res.setHeader('Cache-Control','no-cache, no-store');
    const t=await getValidToken();
    if (!t) return json(res,200,{authed:false});
    try{ const i=await httpsGet('www.googleapis.com','/oauth2/v2/userinfo',t.access_token); return json(res,200,{authed:true,name:i.name,email:i.email,picture:i.picture}); }
    catch(e){ return json(res,200,{authed:true}); }
  }
  if (pn==='/api/auth/url'&&m==='GET') return json(res,200,{url:getAuthUrl()});
  if (pn==='/api/auth/logout'&&m==='POST'){
    try{ if(fs.existsSync(TOKEN_FILE))fs.unlinkSync(TOKEN_FILE); }catch(e){}
    return json(res,200,{ok:true});
  }
  if (pn==='/auth/callback'){
    const code=q.code,err=q.error;
    if (err||!code){ res.writeHead(302,{Location:'/?auth=error'}); return res.end(); }
    try{ await exchangeCode(code); res.writeHead(302,{Location:'/?auth=success'}); res.end(); }
    catch(e){ res.writeHead(302,{Location:'/?auth=error'}); res.end(); }
    return;
  }

  // ─ Google Calendar ─
  if (pn==='/api/calendars'&&m==='GET'){
    const t=await getValidToken();
    if (!t) return json(res,401,{error:'not_authed'});
    try{
      const list=await httpsGet('www.googleapis.com','/calendar/v3/users/me/calendarList?maxResults=50',t.access_token);
      const cals=(list.items||[]).map(c=>({id:c.id,summary:c.summary,description:c.description||'',backgroundColor:c.backgroundColor||'#4285F4',primary:!!c.primary,selected:true}));
      return json(res,200,{calendars:cals});
    }catch(e){ return json(res,500,{error:e.message}); }
  }
  if (pn==='/api/events'&&m==='GET'){
    const t=await getValidToken();
    if (!t) return json(res,401,{error:'not_authed'});
    const now=new Date();
    const tMin=q.tMin||(new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString());
    const tMax=q.tMax||(new Date(now.getFullYear(),now.getMonth()+2,0).toISOString());
    try{ const evs=await fetchEvents(tMin,tMax,q.cal?q.cal.split(','):null); return json(res,200,{events:evs}); }
    catch(e){ return json(res,500,{error:e.message}); }
  }

  // ─ 家庭代辦 ─
  if (pn==='/api/family'&&m==='GET'){
    const data=readData();
    return json(res,200,{familyTodos:data.familyTodos||[]});
  }
  if (pn==='/api/family'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{
      try{
        const data=readData();
        const upd=JSON.parse(b);
        data.familyTodos=upd.familyTodos||data.familyTodos||[];
        json(res,writeData(data)?200:500,{ok:true});
      }catch(e){ json(res,400,{ok:false,error:e.message}); }
    }); return;
  }

  // ─ 課表管理 ─
  if (pn==='/api/schedules'&&m==='GET'){
    const data=readData();
    return json(res,200,{schedules:data.schedules||[]});
  }
  if (pn==='/api/schedules'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{
      try{
        const data=readData();
        const upd=JSON.parse(b);
        data.schedules=upd.schedules||data.schedules||[];
        json(res,writeData(data)?200:500,{ok:true});
      }catch(e){ json(res,400,{ok:false,error:e.message}); }
    }); return;
  }

  // ─ 課表圖片 AI 辨識 ─
  if (pn==='/api/schedule/recognize'&&m==='POST'){
    try{
      const body = await collectBody(req);
      const ct = req.headers['content-type']||'';

      let base64Image, mimeType;

      if (ct.includes('multipart/form-data')) {
        const bndMatch = ct.match(/boundary=(.+)/);
        if (!bndMatch) return json(res,400,{ok:false,error:'缺少 boundary'});
        const parts = parseMultipart(body, bndMatch[1].trim());
        const imgPart = parts['image'];
        if (!imgPart) return json(res,400,{ok:false,error:'找不到圖片欄位'});
        base64Image = imgPart.data.toString('base64');
        mimeType = imgPart.mime;
      } else if (ct.includes('application/json')) {
        const parsed = JSON.parse(body.toString());
        base64Image = parsed.image;
        mimeType = parsed.mimeType || 'image/jpeg';
      } else {
        return json(res,400,{ok:false,error:'不支援的 Content-Type'});
      }

      const result = await recognizeScheduleImage(base64Image, mimeType);
      if (result.error) return json(res,422,{ok:false,error:result.error});

      // 自動儲存到 schedules
      const data = readData();
      const newSchedule = { id:Date.now(), ...result, createdAt: new Date().toISOString() };
      data.schedules = data.schedules || [];
      data.schedules.unshift(newSchedule);
      writeData(data);

      return json(res,200,{ok:true,schedule:newSchedule});
    }catch(e){
      console.error('recognize error:', e.message);
      return json(res,500,{ok:false,error:e.message});
    }
  }

  // ─ 健康記錄 ─
  if (pn==='/api/health'&&m==='GET'){
    const data=readData();
    const logs=data.healthLogs||[];
    // 取最近 90 天
    const cutoff=Date.now()-90*24*60*60*1000;
    return json(res,200,{healthLogs:logs.filter(l=>new Date(l.date).getTime()>=cutoff)});
  }
  if (pn==='/api/health'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{
      try{
        const data=readData();
        const log=JSON.parse(b);
        // log = { date:'2026-06-02', steps:8000, sleep:7.5, water:8, weight:60, mood:'good', note:'' }
        if(!log.date) return json(res,400,{ok:false,error:'缺少 date'});
        data.healthLogs=data.healthLogs||[];
        const idx=data.healthLogs.findIndex(l=>l.date===log.date);
        if(idx>=0) data.healthLogs[idx]={...data.healthLogs[idx],...log};
        else data.healthLogs.unshift(log);
        data.healthLogs.sort((a,b)=>new Date(b.date)-new Date(a.date));
        json(res,writeData(data)?200:500,{ok:true});
      }catch(e){ json(res,400,{ok:false,error:e.message}); }
    }); return;
  }
  if (pn.startsWith('/api/health/')&&m==='DELETE'){
    const date=decodeURIComponent(pn.replace('/api/health/',''));
    const data=readData();
    data.healthLogs=(data.healthLogs||[]).filter(l=>l.date!==date);
    return json(res,writeData(data)?200:500,{ok:true});
  }


  // ─ Mi Fitness / 健康資料 JSON 匯入 ─
  if (pn==='/api/health/import'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{
      try{
        const raw = JSON.parse(b);
        const data = readData();
        data.healthLogs = data.healthLogs||[];

        // ── 解析各種 Mi Fitness 匯出格式 ──
        function toDateStr(v) {
          if (!v) return null;
          const s = String(v).trim();
          // 20240101 → 2024-01-01
          if (/^\d{8}$/.test(s)) return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
          // 2024-01-01T... → 2024-01-01
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
          // 2024/01/01 → 2024-01-01
          if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.replace(/\//g,'-').slice(0,10);
          return null;
        }
        function toH(minutes) { return minutes ? +(minutes/60).toFixed(1) : undefined; }

        const merged = {};  // date → log object

        // 格式 A：{ step_record:[{date,steps,distance,calories}], sleep_record:[{date,deepSleepTime,shallowSleepTime}] }
        const stepRec = raw.step_record||raw.stepRecord||[];
        const sleepRec = raw.sleep_record||raw.sleepRecord||[];
        stepRec.forEach(r=>{
          const d=toDateStr(r.date||r.dateTime); if(!d)return;
          merged[d]=merged[d]||{date:d};
          if(r.steps) merged[d].steps=r.steps;
          if(r.distance) merged[d].distance_m=r.distance;
          if(r.calories||r.calorie) merged[d].calories=r.calories||r.calorie;
        });
        sleepRec.forEach(r=>{
          const d=toDateStr(r.date||r.startTime||r.dateTime); if(!d)return;
          merged[d]=merged[d]||{date:d};
          const total=(r.deepSleepTime||0)+(r.shallowSleepTime||r.lightSleepTime||0)+(r.remSleepTime||0);
          if(total>0) merged[d].sleep=toH(total);
        });

        // 格式 B：{ data:[{date,steps,distance,calorie,deepSleep,lightSleep}] }
        const dataArr = raw.data||raw.items||raw.records||[];
        if(Array.isArray(dataArr)){
          dataArr.forEach(r=>{
            const d=toDateStr(r.date||r.dateTime||r.day); if(!d)return;
            merged[d]=merged[d]||{date:d};
            if(r.steps) merged[d].steps=r.steps;
            if(r.distance||r.distance_m) merged[d].distance_m=r.distance||r.distance_m;
            if(r.calorie||r.calories) merged[d].calories=r.calorie||r.calories;
            // 睡眠（分鐘轉小時）
            const sleepMin=(r.deepSleep||0)+(r.lightSleep||r.shallowSleep||0)+(r.remSleep||0);
            if(sleepMin>0) merged[d].sleep=toH(sleepMin);
            // 睡眠（小時直接存）
            if(r.sleep&&!merged[d].sleep) merged[d].sleep=r.sleep;
            if(r.weight) merged[d].weight=r.weight;
          });
        }

        // 格式 C：頂層單日 {date, steps, sleep, ...}（單筆）
        if(raw.date && (raw.steps||raw.sleep)){
          const d=toDateStr(raw.date); if(d){
            merged[d]=merged[d]||{date:d};
            if(raw.steps) merged[d].steps=raw.steps;
            if(raw.sleep) merged[d].sleep=raw.sleep;
            if(raw.weight) merged[d].weight=raw.weight;
            if(raw.water) merged[d].water=raw.water;
          }
        }

        const imported = Object.values(merged);
        if(!imported.length) return json(res,400,{ok:false,error:'找不到可辨識的健康資料，請確認是 Mi Fitness 匯出的 JSON 格式'});

        // 合併到現有記錄（以日期為主鍵，保留手動填寫的欄位如 water/mood）
        imported.forEach(log=>{
          const idx=data.healthLogs.findIndex(l=>l.date===log.date);
          if(idx>=0){
            // 只覆蓋 Mi Fitness 有的欄位，保留手動填的 mood/water/note
            if(log.steps) data.healthLogs[idx].steps=log.steps;
            if(log.sleep) data.healthLogs[idx].sleep=log.sleep;
            if(log.weight) data.healthLogs[idx].weight=log.weight;
            if(log.calories) data.healthLogs[idx].calories=log.calories;
          } else {
            data.healthLogs.push(log);
          }
        });
        data.healthLogs.sort((a,b)=>new Date(b.date)-new Date(a.date));
        writeData(data);
        json(res,200,{ok:true,imported:imported.length,sample:imported[0]});
      }catch(e){ json(res,400,{ok:false,error:'JSON 解析失敗：'+e.message}); }
    }); return;
  }

  // ─ LINE ─
  if (pn==='/api/line/test'&&m==='POST'){
    try{
      const msg='🤖 芸兒小秘書\n✅ LINE 連線測試成功！\n\n您的芸兒小秘書已準備好傳送通知。';
      const results=await linePushAll(msg);
      const ok=results.some(r=>r.status===200);
      json(res,ok?200:400,{ok,results});
    }catch(e){ json(res,500,{ok:false,error:e.message}); }
    return;
  }

  // ─ 語音 ─
  if (pn==='/api/voice/query'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',async()=>{
      try{
        const {intent,range,text:addText}=JSON.parse(b);
        const cfg=readCfg();
        if (intent==='add_todo'){
          if (!addText) return json(res,400,{ok:false,error:'缺少任務名稱'});
          const data=readData();
          const newTodo={id:Date.now(),text:addText,done:false,priority:'med',tag:'工作',tagCls:'tg-p',due:'未設定',overdue:false,project:'',created:Date.now()};
          data.todos=[newTodo,...(data.todos||[])];
          writeData(data);
          const msg='🤖 芸兒小秘書\n✅ 已新增待辦事項\n\n▪ '+addText+'\n\n已加入您的工作清單！';
          try{ await linePushAll(msg); }catch(e){}
          return json(res,200,{ok:true,action:'add_todo',todo:newTodo,sentToLine:true});
        }
        if (intent==='events'){
          const t=await getValidToken();
          if (!t) return json(res,401,{ok:false,error:'Google 日曆尚未授權'});
          const now=new Date();
          let tMin,tMax,label;
          if (range==='tomorrow'){
            tMin=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toISOString();
            tMax=new Date(now.getFullYear(),now.getMonth(),now.getDate()+2).toISOString();
            label='明天行程';
          } else if (range==='week'){
            const day=now.getDay(),mon=new Date(now);
            mon.setDate(now.getDate()-(day===0?6:day-1)); mon.setHours(0,0,0,0);
            const sun=new Date(mon); sun.setDate(mon.getDate()+7);
            tMin=mon.toISOString(); tMax=sun.toISOString(); label='本週行程';
          } else {
            tMin=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString();
            tMax=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toISOString();
            label='今天行程';
          }
          const calIds=cfg.calendarIds.length?cfg.calendarIds:['primary'];
          const evs=await fetchEvents(tMin,tMax,calIds);
          const msg=buildEventsMsg(evs,label);
          try{ await linePushAll(msg); }catch(e){}
          return json(res,200,{ok:true,events:evs,message:msg,sentToLine:true});
        }
        if (intent==='todos'){
          const data=readData();
          const msg=buildTodosMsg(data.todos||[]);
          try{ await linePushAll(msg); }catch(e){}
          return json(res,200,{ok:true,message:msg,sentToLine:true});
        }
        return json(res,400,{ok:false,error:'未知指令'});
      }catch(e){ json(res,500,{ok:false,error:e.message}); }
    }); return;
  }

  // ─ 每日推播 ─
  if (pn==='/api/daily/push'&&m==='POST'){
    try{
      const now=new Date();
      const tMin=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString();
      const tMax=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toISOString();
      const cfg=readCfg();
      const evs=await fetchEvents(tMin,tMax,cfg.calendarIds.length?cfg.calendarIds:['primary']);
      const data=readData();
      const label='今日行程 — '+now.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric',weekday:'short'});
      let msg=buildEventsMsg(evs,label);
      const pendingHigh=(data.todos||[]).filter(t=>!t.done&&t.priority==='high');
      if (pendingHigh.length) msg+='\n\n🔴 高優先待辦（'+pendingHigh.length+' 項）\n'+pendingHigh.slice(0,5).map(t=>'  ▪ '+t.text).join('\n');
      msg+='\n\n💪 今天也加油！';
      const results=await linePushAll(msg);
      json(res,200,{ok:true,results,message:msg});
    }catch(e){ json(res,500,{ok:false,error:e.message}); }
    return;
  }

  // ─ 靜態檔案 ─
  let fp=pn==='/'?'/index.html':pn;
  fp=path.join(__dirname,'public',fp);
  fs.readFile(fp,(err,content)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'text/plain','Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache'});
    res.end(content);
  });
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log('\n  ╔════════════════════════════════════════╗');
  console.log(  '  ║      芸兒小秘書 Phase 3 已啟動！       ║');
  console.log( `  ║  本地：http://localhost:${PORT}          ║`);
  console.log( `  ║  線上：${BASE_URL}  ║`);
  console.log(  '  ║  Google Calendar + 課表AI + 健康追蹤   ║');
  console.log(  '  ╚════════════════════════════════════════╝\n');
  scheduleDaily();
  if (process.platform !== 'linux') {
    const {exec}=require('child_process');
    exec(process.platform==='win32'?`start http://localhost:${PORT}`:`open http://localhost:${PORT}`);
  }
});
server.on('error',e=>{
  if(e.code==='EADDRINUSE') console.error(`\n  錯誤：連接埠 ${PORT} 已被佔用\n`);
  else console.error('伺服器錯誤:',e.message);
  process.exit(1);
});
