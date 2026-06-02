// ╔═══════════════════════════════════════════════════════════════╗
// ║  芸兒小秘書 — Phase 3 前端功能                               ║
// ║  renderCalendar / renderPersonal / renderFamily / renderHealth║
// ║  使用方式：在 index.html </body> 前加入                      ║
// ║    <script src="/phase3.js"></script>                         ║
// ╚═══════════════════════════════════════════════════════════════╝

/* ═══════════════════ 共用 Google Auth 狀態 ═══════════════════ */
let gcalAuth = { authed: false };
async function ensureGcalAuth() {
  const r = await fetch('/api/auth/status').then(x=>x.json());
  gcalAuth = r;
  return r;
}

/* ═══════════════════ 日曆提醒（工作用）═══════════════════ */
async function renderCalendar(c, ta) {
  ta.innerHTML = '';
  c.innerHTML = '<div style="padding:40px;text-align:center;color:var(--hint)">載入中…</div>';
  await ensureGcalAuth();
  renderCalendarContent(c, ta, 'work');
}

/* ═══════════════════ 個人日曆 ═══════════════════ */
async function renderPersonal(c, ta) {
  ta.innerHTML = '';
  c.innerHTML = '<div style="padding:40px;text-align:center;color:var(--hint)">載入中…</div>';
  await ensureGcalAuth();
  renderCalendarContent(c, ta, 'personal');
}

/* ── 月曆核心渲染 ── */
let calViewMonth = new Date().getMonth();
let calViewYear  = new Date().getFullYear();
let calEvents    = [];
let calViewMode  = 'month'; // 'month' | 'week'

async function renderCalendarContent(c, ta, mode) {
  const authed = gcalAuth.authed;

  // topbar
  ta.innerHTML = authed ? `
    <button class="btn btn-ghost btn-sm" onclick="calPrev()">&larr;</button>
    <button class="btn btn-ghost btn-sm" onclick="calToday()">今天</button>
    <button class="btn btn-ghost btn-sm" onclick="calNext()">&rarr;</button>
    <button class="btn" onclick="p3RefreshCal()" title="重新整理">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 7a5 5 0 1 0 1-3M2 2v3h3"/></svg>
    </button>
    <button class="btn" onclick="p3GcalLogout()">登出 Google</button>
  ` : `
    <button class="btn btn-primary" onclick="p3GcalLogin()">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="3" width="10" height="9" rx="1"/><path d="M5 2v2M9 2v2M2 7h10"/></svg>
      連結 Google 日曆
    </button>
  `;

  if (!authed) {
    c.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:60px 20px;text-align:center">
      <div style="width:56px;height:56px;border-radius:16px;background:var(--accent-l);display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>
      </div>
      <div>
        <div style="font-size:16px;font-weight:500;margin-bottom:6px">連結您的 Google 日曆</div>
        <div style="font-size:13px;color:var(--muted);max-width:340px;line-height:1.6">點擊上方「連結 Google 日曆」按鈕，授權後即可在這裡看到您所有的 Google 日曆行程。</div>
      </div>
      <button class="btn btn-primary" onclick="p3GcalLogin()" style="margin-top:8px">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="3" width="10" height="9" rx="1"/><path d="M5 2v2M9 2v2M2 7h10"/></svg>
        連結 Google 日曆
      </button>
    </div>`;
    return;
  }

  // 載入事件
  try {
    const now  = new Date(calViewYear, calViewMonth, 1);
    const tMin = new Date(calViewYear, calViewMonth, 1).toISOString();
    const tMax = new Date(calViewYear, calViewMonth+1, 1).toISOString();
    const r    = await fetch(`/api/events?tMin=${encodeURIComponent(tMin)}&tMax=${encodeURIComponent(tMax)}`).then(x=>x.json());
    calEvents  = r.events || [];
  } catch(e) { calEvents = []; }

  renderMonthGrid(c);
}

function renderMonthGrid(c) {
  const year  = calViewYear, month = calViewMonth;
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const days     = lastDay.getDate();
  const monthName= firstDay.toLocaleDateString('zh-TW',{year:'numeric',month:'long'});

  const dayNames = ['一','二','三','四','五','六','日'];
  let cells = '';
  let dayNum = 1 - startDow;

  for (let row = 0; row < 6; row++) {
    let rowHtml = '';
    for (let col = 0; col < 7; col++, dayNum++) {
      if (dayNum < 1 || dayNum > days) {
        rowHtml += `<div class="p3-cal-cell p3-cal-empty"></div>`;
      } else {
        const date = new Date(year, month, dayNum);
        const isToday = date.toDateString() === today.toDateString();
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
        const dayEvs  = calEvents.filter(ev => (ev.start||'').startsWith(dateStr));
        const evHtml  = dayEvs.slice(0,3).map(ev=>`
          <div class="p3-cal-ev" style="background:${ev.color||'var(--accent)'};opacity:.85" title="${esc(ev.title)}">
            ${ev.allDay?'':'<span style="opacity:.7">${fmtHour(ev.start)}</span>'} ${esc(ev.title)}
          </div>`).join('');
        const moreHtml = dayEvs.length>3 ? `<div style="font-size:10px;color:var(--muted);padding:0 4px">+${dayEvs.length-3} 更多</div>` : '';
        rowHtml += `
          <div class="p3-cal-cell${isToday?' p3-cal-today':''}" onclick="p3ShowDayEvs('${dateStr}')">
            <div class="p3-cal-daynum${isToday?' p3-cal-todaynum':''}">${dayNum}</div>
            ${evHtml}${moreHtml}
          </div>`;
      }
    }
    cells += `<div class="p3-cal-row">${rowHtml}</div>`;
    if (dayNum > days) break;
  }

  c.innerHTML = `
  <div class="card" style="overflow:visible">
    <div class="card-head" style="justify-content:center">
      <span class="card-title" style="font-size:15px">${monthName}</span>
    </div>
    <div class="p3-cal-grid">
      <div class="p3-cal-row p3-cal-head">
        ${dayNames.map(d=>`<div class="p3-cal-cell p3-cal-dname">${d}</div>`).join('')}
      </div>
      ${cells}
    </div>
  </div>
  <div id="p3-day-panel"></div>
  <style>
    .p3-cal-grid{padding:0 8px 12px}
    .p3-cal-row{display:grid;grid-template-columns:repeat(7,1fr)}
    .p3-cal-head .p3-cal-cell{text-align:center;font-size:11px;font-weight:500;color:var(--hint);padding:6px 0;border-bottom:1px solid var(--border)}
    .p3-cal-cell{min-height:80px;padding:4px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);cursor:pointer;transition:background .1s}
    .p3-cal-cell:hover{background:var(--bg)}
    .p3-cal-cell:nth-child(7n){border-right:none}
    .p3-cal-empty{cursor:default;background:transparent}
    .p3-cal-empty:hover{background:transparent}
    .p3-cal-daynum{font-size:12px;color:var(--muted);margin-bottom:2px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%}
    .p3-cal-today{background:var(--accent-l)!important}
    .p3-cal-todaynum{background:var(--accent);color:#fff!important}
    .p3-cal-ev{font-size:10px;color:#fff;border-radius:3px;padding:1px 4px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .p3-day-ev-item{padding:10px 12px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start}
    .p3-day-ev-item:last-child{border-bottom:none}
    .p3-day-time{font-size:11px;font-family:var(--mono);color:var(--muted);white-space:nowrap;min-width:50px;margin-top:1px}
  </style>`;
}

function fmtHour(iso){ if(!iso)return''; return new Date(iso).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false}); }

function p3ShowDayEvs(dateStr) {
  const panel = document.getElementById('p3-day-panel');
  if (!panel) return;
  const evs = calEvents.filter(ev=>(ev.start||'').startsWith(dateStr));
  const d = new Date(dateStr+'T00:00:00');
  const label = d.toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'});
  panel.innerHTML = `
  <div class="card" style="margin-top:12px">
    <div class="card-head">
      <span class="card-title">${label}</span>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('p3-day-panel').innerHTML=''">✕</button>
    </div>
    ${evs.length===0 ? `<div style="padding:24px;text-align:center;color:var(--hint);font-size:13px">這天沒有行程</div>` :
      evs.map(ev=>`
      <div class="p3-day-ev-item">
        <div class="p3-day-time">${ev.allDay?'全天':fmtHour(ev.start)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500">${esc(ev.title)}</div>
          ${ev.location?`<div style="font-size:11px;color:var(--muted);margin-top:2px">📍 ${esc(ev.location)}</div>`:''}
          ${ev.meetLink?`<a href="${ev.meetLink}" target="_blank" style="font-size:11px;color:var(--accent);margin-top:2px;display:inline-block">🎥 加入 Meet</a>`:''}
        </div>
        <div style="width:8px;height:8px;border-radius:50%;background:${ev.color||'var(--accent)'};flex-shrink:0;margin-top:4px"></div>
      </div>`).join('')}
  </div>`;
}

function calPrev() { calViewMonth--; if(calViewMonth<0){calViewMonth=11;calViewYear--;} p3RefreshCal(); }
function calNext() { calViewMonth++; if(calViewMonth>11){calViewMonth=0;calViewYear++;} p3RefreshCal(); }
function calToday() { const n=new Date(); calViewMonth=n.getMonth(); calViewYear=n.getFullYear(); p3RefreshCal(); }

async function p3RefreshCal() {
  const c = document.getElementById('content');
  const ta = document.getElementById('topbar-actions');
  if (!c||!ta) return;
  await renderCalendarContent(c, ta, 'personal');
}

async function p3GcalLogin() {
  const r = await fetch('/api/auth/url').then(x=>x.json());
  window.open(r.url, '_blank', 'width=500,height=650');
  // 等待授權完成後重整
  const check = setInterval(async ()=>{
    const s = await fetch('/api/auth/status').then(x=>x.json()).catch(()=>({authed:false}));
    if (s.authed) { clearInterval(check); gcalAuth=s; p3RefreshCal(); }
  }, 1500);
  setTimeout(()=>clearInterval(check), 120000);
}
async function p3GcalLogout() {
  await fetch('/api/auth/logout',{method:'POST'});
  gcalAuth={authed:false};
  p3RefreshCal();
}

/* ═══════════════════ 家庭代辦 ═══════════════════ */
let familyTodos = [];
let scheduleList = [];

async function renderFamily(c, ta) {
  // 載入資料
  try {
    const fr = await fetch('/api/family').then(x=>x.json());
    familyTodos = fr.familyTodos||[];
    const sr = await fetch('/api/schedules').then(x=>x.json());
    scheduleList = sr.schedules||[];
  } catch(e) { familyTodos=[]; scheduleList=[]; }

  ta.innerHTML = `
    <button class="btn btn-primary" onclick="p3AddFamilyTodo()">
      <svg viewBox="0 0 12 12"><path d="M6 1v10M1 6h10"/></svg>新增家庭待辦
    </button>
    <button class="btn" onclick="p3UploadSchedule()" title="上傳課表圖片 AI 辨識">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="4" width="10" height="8" rx="1"/><path d="M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/><path d="M7 7v3M5.5 8.5L7 7l1.5 1.5"/></svg>
      上傳課表
    </button>`;

  const pending = familyTodos.filter(t=>!t.done).length;
  const done    = familyTodos.filter(t=>t.done).length;

  c.innerHTML = `
  <div class="stats-row" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card"><div class="stat-label">待完成</div><div class="stat-val">${pending}</div><div class="stat-sub">家庭事項</div></div>
    <div class="stat-card"><div class="stat-label">已完成</div><div class="stat-val" style="color:var(--success)">${done}</div><div class="stat-sub">累計</div></div>
    <div class="stat-card"><div class="stat-label">課表</div><div class="stat-val" style="color:var(--accent)">${scheduleList.length}</div><div class="stat-sub">已上傳</div></div>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title">家庭待辦</span></div>
    ${familyTodos.length===0?`<div style="padding:28px;text-align:center;font-size:13px;color:var(--hint)">暫無家庭待辦，點擊右上角新增</div>`:''}
    ${familyTodos.map((t,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
      <div class="check-ring ${t.done?'checked':''}" onclick="p3ToggleFamilyTodo(${i})">
        <svg viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>
      </div>
      <div style="flex:1;font-size:13px;${t.done?'text-decoration:line-through;color:var(--hint)':''}">${esc(t.text)}</div>
      ${t.assignee?`<span class="tag tg-b" style="font-size:11px">${esc(t.assignee)}</span>`:''}
      <button class="btn btn-ghost btn-sm" style="color:var(--hint);padding:2px 6px" onclick="p3DelFamilyTodo(${i})">
        <svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3"/></svg>
      </button>
    </div>`).join('')}
    <div style="padding:10px 16px">
      <div style="display:flex;gap:8px">
        <input class="form-ctrl" id="ft-text" placeholder="新增家庭待辦..." style="flex:1" onkeydown="if(event.key==='Enter')p3QuickFamilyTodo()">
        <input class="form-ctrl" id="ft-who" placeholder="誰負責" style="width:80px">
        <button class="btn btn-primary" onclick="p3QuickFamilyTodo()">新增</button>
      </div>
    </div>
  </div>

  <div class="card" id="p3-schedule-card">
    <div class="card-head">
      <span class="card-title">小孩課表</span>
      <button class="btn btn-sm" onclick="p3UploadSchedule()">
        <svg viewBox="0 0 12 12"><path d="M6 1v10M1 6h10"/></svg>上傳圖片辨識
      </button>
    </div>
    ${scheduleList.length===0
      ? `<div style="padding:32px;text-align:center">
          <div style="font-size:13px;color:var(--hint);margin-bottom:12px">還沒有課表，拍照上傳後 AI 自動辨識</div>
          <button class="btn btn-primary" onclick="p3UploadSchedule()">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="4" width="10" height="8" rx="1"/><path d="M7 7v3M5.5 8.5L7 7l1.5 1.5"/></svg>
            上傳課表圖片
          </button>
        </div>`
      : scheduleList.map((s,si)=>renderScheduleCard(s,si)).join('')}
  </div>

  <div id="p3-upload-panel"></div>
  <input type="file" id="p3-file-inp" accept="image/*" style="display:none" onchange="p3HandleFileUpload(this)">`;
}

function renderScheduleCard(s, si) {
  const days = (s.schedule||[]).sort((a,b)=>(a.dayIndex||0)-(b.dayIndex||0));
  return `
  <div style="padding:12px 16px;border-bottom:1px solid var(--border)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div>
        <span style="font-size:13px;font-weight:500">${esc(s.childName||'課表')}</span>
        ${s.period?`<span style="font-size:11px;color:var(--muted);margin-left:6px">${esc(s.period)}</span>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--hint)">${s.createdAt?new Date(s.createdAt).toLocaleDateString('zh-TW'):''}</span>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="p3DelSchedule(${si})">刪除</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr>${days.map(d=>`<th style="padding:4px 8px;border:1px solid var(--border);background:var(--bg);font-weight:500">${d.day}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${p3ScheduleRows(days)}
        </tbody>
      </table>
    </div>
  </div>`;
}

function p3ScheduleRows(days) {
  const maxPeriods = Math.max(...days.map(d=>(d.periods||[]).length), 0);
  let rows = '';
  for (let i = 0; i < maxPeriods; i++) {
    rows += `<tr>${days.map(d=>{
      const p=(d.periods||[])[i];
      return p
        ? `<td style="padding:4px 8px;border:1px solid var(--border);text-align:center">${esc(p.subject)}<br><span style="color:var(--muted)">${esc(p.time||'')}</span></td>`
        : `<td style="padding:4px 8px;border:1px solid var(--border)"></td>`;
    }).join('')}</tr>`;
  }
  return rows || `<tr><td colspan="${days.length}" style="padding:8px;text-align:center;color:var(--hint)">無資料</td></tr>`;
}

async function p3ToggleFamilyTodo(i) {
  familyTodos[i].done = !familyTodos[i].done;
  await saveFamilyTodos();
  renderFamily(document.getElementById('content'), document.getElementById('topbar-actions'));
}
async function p3DelFamilyTodo(i) {
  familyTodos.splice(i,1);
  await saveFamilyTodos();
  renderFamily(document.getElementById('content'), document.getElementById('topbar-actions'));
}
async function p3QuickFamilyTodo() {
  const txt=(document.getElementById('ft-text')||{}).value?.trim();
  const who=(document.getElementById('ft-who')||{}).value?.trim();
  if (!txt) return;
  familyTodos.push({id:Date.now(),text:txt,done:false,assignee:who,created:Date.now()});
  await saveFamilyTodos();
  renderFamily(document.getElementById('content'), document.getElementById('topbar-actions'));
}
async function p3AddFamilyTodo() {
  const txt=prompt('輸入家庭待辦事項：');
  if (!txt||!txt.trim()) return;
  const who=prompt('誰負責（可空白）：')||'';
  familyTodos.push({id:Date.now(),text:txt.trim(),done:false,assignee:who,created:Date.now()});
  await saveFamilyTodos();
  renderFamily(document.getElementById('content'), document.getElementById('topbar-actions'));
}
async function saveFamilyTodos() {
  await fetch('/api/family',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({familyTodos})});
}
async function p3DelSchedule(si) {
  scheduleList.splice(si,1);
  await fetch('/api/schedules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schedules:scheduleList})});
  renderFamily(document.getElementById('content'), document.getElementById('topbar-actions'));
}

function p3UploadSchedule() {
  const inp = document.getElementById('p3-file-inp');
  if (inp) inp.click();
}

async function p3HandleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const panel = document.getElementById('p3-upload-panel');
  if (panel) panel.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div style="padding:20px;text-align:center">
        <div style="width:32px;height:32px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px"></div>
        <div style="font-size:13px;color:var(--muted)">AI 辨識中，請稍候…</div>
      </div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

  try {
    // 讀為 base64
    const base64 = await new Promise((res,rej)=>{
      const reader = new FileReader();
      reader.onload = e => res(e.target.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const resp = await fetch('/api/schedule/recognize',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image:base64, mimeType:file.type||'image/jpeg'})
    });
    const result = await resp.json();
    if (!resp.ok || !result.ok) {
      if (panel) panel.innerHTML = `<div class="card" style="margin-top:12px;padding:16px;color:var(--danger)">辨識失敗：${esc(result.error||'未知錯誤')}${!result.error||result.error.includes('ANTHROPIC')?'<br><small>請確認已設定 ANTHROPIC_API_KEY 環境變數</small>':''}</div>`;
      return;
    }
    // 重新載入課表
    const sr = await fetch('/api/schedules').then(x=>x.json());
    scheduleList = sr.schedules||[];
    if (panel) panel.innerHTML = `<div style="padding:10px 0;font-size:13px;color:var(--success)">✓ 課表辨識成功，已儲存！</div>`;
    setTimeout(()=>{ if(panel) panel.innerHTML=''; renderFamily(document.getElementById('content'), document.getElementById('topbar-actions')); }, 1500);
  } catch(e) {
    if (panel) panel.innerHTML = `<div class="card" style="margin-top:12px;padding:16px;color:var(--danger)">上傳失敗：${esc(e.message)}</div>`;
  }
  input.value = '';
}

/* ═══════════════════ 健康追蹤 ═══════════════════ */
let healthLogs = [];

async function renderHealth(c, ta) {
  try {
    const r = await fetch('/api/health').then(x=>x.json());
    healthLogs = (r.healthLogs||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
  } catch(e) { healthLogs=[]; }

  const today = new Date().toISOString().split('T')[0];
  const todayLog = healthLogs.find(l=>l.date===today)||{};

  ta.innerHTML = `
    <button class="btn btn-primary" onclick="p3OpenHealthLog('${today}')">
      <svg viewBox="0 0 12 12"><path d="M6 1v10M1 6h10"/></svg>今日記錄
    </button>`;

  // 計算最近 7 天平均
  const last7 = healthLogs.slice(0,7);
  const avgSteps = last7.length ? Math.round(last7.reduce((s,l)=>s+(l.steps||0),0)/last7.length) : 0;
  const avgSleep = last7.length ? (last7.reduce((s,l)=>s+(l.sleep||0),0)/last7.length).toFixed(1) : 0;
  const avgWater = last7.length ? (last7.reduce((s,l)=>s+(l.water||0),0)/last7.length).toFixed(1) : 0;
  const moodMap  = {'great':'😄','good':'🙂','ok':'😐','bad':'😔','terrible':'😞'};

  c.innerHTML = `
  <div class="stats-row">
    <div class="stat-card"><div class="stat-label">今日步數</div><div class="stat-val" style="color:var(--success)">${todayLog.steps||'—'}</div><div class="stat-sub">7天均 ${avgSteps} 步</div></div>
    <div class="stat-card"><div class="stat-label">今日睡眠</div><div class="stat-val" style="color:var(--info)">${todayLog.sleep||'—'}</div><div class="stat-sub">7天均 ${avgSleep} 小時</div></div>
    <div class="stat-card"><div class="stat-label">今日飲水</div><div class="stat-val" style="color:var(--accent)">${todayLog.water||'—'}</div><div class="stat-sub">7天均 ${avgWater} 杯</div></div>
    <div class="stat-card"><div class="stat-label">今日心情</div><div class="stat-val" style="font-size:28px">${moodMap[todayLog.mood]||'—'}</div><div class="stat-sub">${todayLog.mood||'未記錄'}</div></div>
  </div>

  <div class="card">
    <div class="card-head">
      <span class="card-title">健康記錄</span>
      <span style="font-size:11px;color:var(--hint)">最近 90 天</span>
    </div>
    ${healthLogs.length===0
      ? `<div style="padding:40px;text-align:center">
          <div style="font-size:13px;color:var(--hint);margin-bottom:12px">還沒有健康記錄，點擊「今日記錄」開始追蹤</div>
          <div style="font-size:11px;color:var(--hint);max-width:300px;margin:0 auto;line-height:1.6">
            💡 Google Fit REST API 已於 2025年5月關閉。<br>
            目前使用手動記錄，同樣可追蹤步數、睡眠、飲水、心情、體重。
          </div>
        </div>`
      : `<table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:var(--bg)">
              <th style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:left;font-weight:500;color:var(--muted)">日期</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)">步數</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)">睡眠(h)</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)">飲水(杯)</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)">體重(kg)</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)">心情</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)"></th>
            </tr>
          </thead>
          <tbody>
            ${healthLogs.map(l=>`
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:8px 12px;font-family:var(--mono);font-size:12px;color:var(--text)">${l.date}</td>
              <td style="padding:8px;text-align:center;color:var(--success)">${l.steps||'—'}</td>
              <td style="padding:8px;text-align:center;color:var(--info)">${l.sleep||'—'}</td>
              <td style="padding:8px;text-align:center;color:var(--accent)">${l.water||'—'}</td>
              <td style="padding:8px;text-align:center">${l.weight||'—'}</td>
              <td style="padding:8px;text-align:center">${moodMap[l.mood]||'—'}</td>
              <td style="padding:8px;text-align:center">
                <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="p3OpenHealthLog('${l.date}')">編輯</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>`}
  </div>
  <div id="p3-health-modal"></div>`;
}

function p3OpenHealthLog(date) {
  const existing = healthLogs.find(l=>l.date===date)||{date};
  const modal = document.getElementById('p3-health-modal');
  if (!modal) return;
  const moodOpts = [
    {v:'great',l:'😄 很棒'},{v:'good',l:'🙂 不錯'},{v:'ok',l:'😐 普通'},{v:'bad',l:'😔 不好'},{v:'terrible',l:'😞 很差'}
  ];
  modal.innerHTML = `
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)document.getElementById('p3-health-modal').innerHTML=''">
    <div style="background:var(--surface);border-radius:14px;width:380px;max-width:95vw;padding:24px;box-shadow:0 8px 40px rgba(0,0,0,.18)">
      <div style="font-size:15px;font-weight:500;margin-bottom:16px">健康記錄 — ${date}</div>
      <div class="form-row"><label class="form-label">步數</label>
        <input class="form-ctrl" type="number" id="hl-steps" value="${existing.steps||''}" placeholder="例：8000"></div>
      <div class="form-row"><label class="form-label">睡眠（小時）</label>
        <input class="form-ctrl" type="number" step="0.5" id="hl-sleep" value="${existing.sleep||''}" placeholder="例：7.5"></div>
      <div class="form-row"><label class="form-label">飲水（杯）</label>
        <input class="form-ctrl" type="number" id="hl-water" value="${existing.water||''}" placeholder="例：8"></div>
      <div class="form-row"><label class="form-label">體重（kg）</label>
        <input class="form-ctrl" type="number" step="0.1" id="hl-weight" value="${existing.weight||''}" placeholder="例：60.5"></div>
      <div class="form-row"><label class="form-label">心情</label>
        <select class="form-ctrl" id="hl-mood">
          <option value="">請選擇</option>
          ${moodOpts.map(o=>`<option value="${o.v}" ${existing.mood===o.v?'selected':''}>${o.l}</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label class="form-label">備註</label>
        <input class="form-ctrl" id="hl-note" value="${esc(existing.note||'')}" placeholder="今天有運動？飲食情況…"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn" onclick="document.getElementById('p3-health-modal').innerHTML=''">取消</button>
        <button class="btn btn-primary" onclick="p3SaveHealthLog('${date}')">儲存</button>
      </div>
    </div>
  </div>`;
}

async function p3SaveHealthLog(date) {
  const steps  = parseInt(document.getElementById('hl-steps')?.value)||0;
  const sleep  = parseFloat(document.getElementById('hl-sleep')?.value)||0;
  const water  = parseInt(document.getElementById('hl-water')?.value)||0;
  const weight = parseFloat(document.getElementById('hl-weight')?.value)||0;
  const mood   = document.getElementById('hl-mood')?.value||'';
  const note   = document.getElementById('hl-note')?.value.trim()||'';
  const log    = {date, steps:steps||undefined, sleep:sleep||undefined, water:water||undefined, weight:weight||undefined, mood:mood||undefined, note:note||undefined};
  await fetch('/api/health',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(log)});
  document.getElementById('p3-health-modal').innerHTML='';
  renderHealth(document.getElementById('content'), document.getElementById('topbar-actions'));
}

/* ── 共用 esc helper（若 index.html 已定義則跳過）── */
if (typeof esc === 'undefined') {
  window.esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
