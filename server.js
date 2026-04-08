const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT      = 3766;
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'secretary.json');
const TOKEN_FILE= path.join(DATA_DIR, 'google_token.json');
const CFG_FILE  = path.join(DATA_DIR, 'config.json');

const LINE = {
  channelToken : '1Rp5zYDQwApNLx8c/3Bl8A9aLcFkCmfAWtuNfDE/34D+FSJnzg6T/Vzf81GozTDCmBWjKCkJt4jLjHUlrni47LuH+VoxBCcj7/aCEVAY8rz96ILn1s/C4B0IcZqDBJpbGCjzSMzcPA/AnOFmkCGpygdB04t89/1O/w1cDnyilFU=',
  userId       : 'U675e86d49422cb0aabb4d5b20cac34ae',
  groupIds     : [],
};

const GOOGLE = {
  client_id    : '1054077742554-uhqjjsjjkocmhuh404bjcd48avu3r7o2.apps.googleusercontent.com',
  client_secret: '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',
  redirect_uri : 'http://localhost:3766/auth/callback',
  scopes       : [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' '),
};

// 確保 data 資料夾存在（換電腦/換路徑後自動建立）
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('  ✓ 已自動建立 data/ 資料夾');
  }
} catch(e) {
  console.error('  ✗ 無法建立 data/ 資料夾:', e.message);
  console.error('  請手動建立資料夾：', DATA_DIR);
}

const DEFAULT_DATA = {
  todos: [
    {id:1,text:'完成 Q2 季報初稿',done:false,priority:'high',tag:'工作報告',tagCls:'tg-p',due:'今天',overdue:false,project:'Q2 季報',created:Date.now()},
    {id:2,text:'與 Alex 確認產品路線圖',done:false,priority:'high',tag:'產品',tagCls:'tg-b',due:'今天',overdue:false,project:'產品規劃',created:Date.now()},
    {id:3,text:'回覆客戶提案 email',done:false,priority:'high',tag:'客戶',tagCls:'tg-a',due:'昨天',overdue:true,project:'',created:Date.now()},
  ],
  projects: [],
  notes: [],
  settings: { dark: false }
};

const DEFAULT_CFG = { dailyPush:true, dailyHour:7, dailyMinute:30, calendarIds:[] };

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE,JSON.stringify(DEFAULT_DATA,null,2),'utf8'); return DEFAULT_DATA; }
    return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
  } catch(e) { return DEFAULT_DATA; }
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

const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
const json=(res,code,data)=>{ res.writeHead(code,{'Content-Type':MIME['.json']}); res.end(JSON.stringify(data)); };

const server=http.createServer(async (req,res)=>{
  const _u=new URL(req.url,'http://localhost');
  const pn=_u.pathname, q=Object.fromEntries(_u.searchParams), m=req.method;
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (m==='OPTIONS'){ res.writeHead(204); return res.end(); }

  if (pn==='/api/data'&&m==='GET') return json(res,200,readData());
  if (pn==='/api/data'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{ try{ json(res,writeData(JSON.parse(b))?200:500,{ok:true}); }catch(e){ json(res,400,{ok:false,error:e.message}); } });
    return;
  }

  if (pn==='/api/config'&&m==='GET') return json(res,200,readCfg());
  if (pn==='/api/config'&&m==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{
      try{ const cur=readCfg(),upd=JSON.parse(b),newCfg={...cur,...upd}; writeCfg(newCfg); scheduleDaily(); json(res,200,{ok:true,config:newCfg}); }
      catch(e){ json(res,400,{ok:false,error:e.message}); }
    }); return;
  }

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
    const tMin=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString();
    const tMax=new Date(now.getFullYear(),now.getMonth(),now.getDate()+14).toISOString();
    try{ const evs=await fetchEvents(tMin,tMax,q.cal?q.cal.split(','):null); return json(res,200,{events:evs}); }
    catch(e){ return json(res,500,{error:e.message}); }
  }

  if (pn==='/api/line/test'&&m==='POST'){
    try{
      const msg='🤖 芸兒小秘書\n✅ LINE 連線測試成功！\n\n您的芸兒小秘書已準備好傳送通知。';
      const results=await linePushAll(msg);
      const ok=results.some(r=>r.status===200);
      json(res,ok?200:400,{ok,results});
    }catch(e){ json(res,500,{ok:false,error:e.message}); }
    return;
  }

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


  if (pn==='/api/restore-defaults'&&m==='GET'){
    const full={todos:[
      {id:1,text:'完成 Q2 季報初稿',done:false,priority:'high',tag:'工作報告',tagCls:'tg-p',due:'今天',overdue:false,project:'Q2 季報',created:Date.now()},
      {id:2,text:'與 Alex 確認產品路線圖',done:false,priority:'high',tag:'產品',tagCls:'tg-b',due:'今天',overdue:false,project:'產品規劃',created:Date.now()},
      {id:3,text:'回覆客戶提案 email',done:false,priority:'high',tag:'客戶',tagCls:'tg-a',due:'昨天',overdue:true,project:'',created:Date.now()},
      {id:4,text:'更新 API 文件到 v2.3',done:false,priority:'med',tag:'技術',tagCls:'tg-t',due:'明天',overdue:false,project:'後端系統',created:Date.now()},
      {id:5,text:'準備週五 standup 議程',done:false,priority:'med',tag:'會議',tagCls:'tg-p',due:'週五',overdue:false,project:'',created:Date.now()},
    ],projects:[
      {id:1,name:'Q2 季報',desc:'第二季財務與業績分析',progress:65,color:'#534AB7',startDate:'2024-06-01',endDate:'2024-07-31',status:'on',tasks:[
        {id:101,title:'收集各部門數據',status:'done',priority:'high',due:'6/10',assignee:'王小明',comments:[]},
        {id:102,title:'製作圖表與分析',status:'in',priority:'high',due:'7/05',assignee:'李大華',comments:[]},
        {id:103,title:'撰寫執行摘要',status:'in',priority:'med',due:'7/20',assignee:'你',comments:[]},
        {id:104,title:'排版與最終校稿',status:'todo',priority:'med',due:'7/28',assignee:'你',comments:[]},
        {id:105,title:'簡報給董事會',status:'todo',priority:'high',due:'7/31',assignee:'王小明',comments:[]},
      ]},
      {id:2,name:'後端系統重構',desc:'API v2 架構升級',progress:30,color:'#1D9E75',startDate:'2024-06-15',endDate:'2024-09-30',status:'at',tasks:[
        {id:201,title:'分析現有架構瓶頸',status:'done',priority:'high',due:'6/20',assignee:'陳工程師',comments:[]},
        {id:202,title:'設計新 API schema',status:'done',priority:'high',due:'7/01',assignee:'陳工程師',comments:[]},
        {id:203,title:'建立 GraphQL layer',status:'in',priority:'high',due:'7/15',assignee:'陳工程師',comments:[]},
        {id:204,title:'資料庫 migration',status:'todo',priority:'high',due:'8/01',assignee:'你',comments:[]},
        {id:205,title:'壓力測試與優化',status:'todo',priority:'med',due:'9/01',assignee:'陳工程師',comments:[]},
      ]},
      {id:3,name:'客戶提案 A',desc:'Acme Corp 服務提案',progress:80,color:'#EF9F27',startDate:'2024-07-01',endDate:'2024-07-31',status:'on',tasks:[
        {id:301,title:'需求訪談',status:'done',priority:'high',due:'7/03',assignee:'你',comments:[]},
        {id:302,title:'撰寫提案文件',status:'done',priority:'high',due:'7/10',assignee:'你',comments:[]},
        {id:303,title:'製作簡報',status:'done',priority:'med',due:'7/15',assignee:'設計師',comments:[]},
        {id:304,title:'提案簡報',status:'in',priority:'high',due:'7/20',assignee:'你',comments:[]},
        {id:305,title:'合約簽署',status:'todo',priority:'high',due:'7/31',assignee:'你',comments:[]},
      ]},
      {id:4,name:'產品路線圖',desc:'2024 H2 產品規劃',progress:20,color:'#D85A30',startDate:'2024-07-10',endDate:'2024-08-15',status:'on',tasks:[
        {id:401,title:'用戶訪談',status:'in',priority:'high',due:'7/20',assignee:'PM',comments:[]},
        {id:402,title:'競品分析',status:'todo',priority:'med',due:'7/25',assignee:'PM',comments:[]},
        {id:403,title:'功能優先級排序',status:'todo',priority:'high',due:'8/01',assignee:'你',comments:[]},
        {id:404,title:'路線圖文件撰寫',status:'todo',priority:'med',due:'8/10',assignee:'你',comments:[]},
      ]},
      {id:5,name:'行銷活動 Q3',desc:'夏季推廣行動',progress:50,color:'#185FA5',startDate:'2024-07-01',endDate:'2024-09-30',status:'on',tasks:[
        {id:501,title:'活動企劃書',status:'done',priority:'high',due:'7/05',assignee:'行銷',comments:[]},
        {id:502,title:'社群內容製作',status:'in',priority:'med',due:'7/31',assignee:'行銷',comments:[]},
        {id:503,title:'投放廣告設定',status:'todo',priority:'med',due:'8/01',assignee:'行銷',comments:[]},
      ]},
      {id:6,name:'HR 新制度',desc:'員工績效考核系統',progress:90,color:'#0F6E56',startDate:'2024-05-01',endDate:'2024-07-15',status:'on',tasks:[
        {id:601,title:'制度草案',status:'done',priority:'high',due:'5/15',assignee:'HR',comments:[]},
        {id:602,title:'主管宣導',status:'done',priority:'med',due:'6/01',assignee:'HR',comments:[]},
        {id:603,title:'系統建置',status:'done',priority:'high',due:'7/01',assignee:'IT',comments:[]},
        {id:604,title:'全員上線',status:'in',priority:'high',due:'7/15',assignee:'HR',comments:[]},
      ]},
    ],notes:[
      {id:1,title:'週一 Standup 記錄',date:'2024-07-01',preview:'討論 Q2 目標達成率，後端系統延期至 7/15',tags:['會議','standup']},
      {id:2,title:'產品路線圖討論',date:'2024-07-03',preview:'確認 H2 功能優先級：通知系統 > 搜尋優化',tags:['產品','規劃']},
    ],settings:{dark:false}};
    writeData(full);
    res.writeHead(302,{Location:'/?restored=1'}); return res.end();
  }

  let fp=pn==='/'?'/index.html':pn;
  fp=path.join(__dirname,'public',fp);
  fs.readFile(fp,(err,content)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'text/plain','Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache'});
    res.end(content);
  });
});

server.listen(PORT,'127.0.0.1',()=>{
  console.log('\n  ╔════════════════════════════════════╗');
  console.log(  '  ║      芸兒小秘書 已成功啟動！       ║');
  console.log(  '  ╠════════════════════════════════════╣');
  console.log( `  ║  網址：http://localhost:${PORT}      ║`);
  console.log(  '  ║  Google Calendar + LINE + 語音      ║');
  console.log(  '  ║  關閉：按 Ctrl + C                  ║');
  console.log(  '  ╚════════════════════════════════════╝\n');
  scheduleDaily();
  const {exec}=require('child_process');
  exec(process.platform==='win32'?`start http://localhost:${PORT}`:`open http://localhost:${PORT}`);
});

server.on('error',e=>{
  if(e.code==='EADDRINUSE') console.error(`\n  錯誤：連接埠 ${PORT} 已被佔用\n`);
  else console.error('伺服器錯誤:',e.message);
  process.exit(1);
});
