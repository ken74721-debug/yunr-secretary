const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'secretary.json');

const FULL_DATA = {
  todos: [
    {id:1,text:'完成 Q2 季報初稿',done:false,priority:'high',tag:'工作報告',tagCls:'tg-p',due:'今天',overdue:false,project:'Q2 季報',created:Date.now()},
    {id:2,text:'與 Alex 確認產品路線圖',done:false,priority:'high',tag:'產品',tagCls:'tg-b',due:'今天',overdue:false,project:'產品規劃',created:Date.now()},
    {id:3,text:'回覆客戶提案 email',done:false,priority:'high',tag:'客戶',tagCls:'tg-a',due:'昨天',overdue:true,project:'',created:Date.now()},
    {id:4,text:'更新 API 文件到 v2.3',done:false,priority:'med',tag:'技術',tagCls:'tg-t',due:'明天',overdue:false,project:'後端系統',created:Date.now()},
    {id:5,text:'準備週五 standup 議程',done:false,priority:'med',tag:'會議',tagCls:'tg-p',due:'週五',overdue:false,project:'',created:Date.now()},
    {id:6,text:'申請差旅費用報銷',done:true,priority:'low',tag:'行政',tagCls:'tg-a',due:'完成',overdue:false,project:'',created:Date.now()},
  ],
  projects: [
    {id:1,name:'Q2 季報',desc:'第二季財務與業績分析',progress:65,color:'#534AB7',startDate:'2024-06-01',endDate:'2024-07-31',status:'on',
     tasks:[
       {id:101,title:'收集各部門數據',status:'done',priority:'high',due:'6/10',assignee:'王小明',comments:[{id:1,author:'王小明',avatar:'王',text:'數據已從 ERP 匯出，正在整理中',time:'6/08 14:30'},{id:2,author:'李大華',avatar:'李',text:'請確認行銷部門的數字是否含退款',time:'6/09 09:15'}]},
       {id:102,title:'製作圖表與分析',status:'in',priority:'high',due:'7/05',assignee:'李大華',comments:[{id:3,author:'李大華',avatar:'李',text:'圖表初版完成，等 PM 確認格式',time:'7/01 16:00'}]},
       {id:103,title:'撰寫執行摘要',status:'in',priority:'med',due:'7/20',assignee:'你',comments:[]},
       {id:104,title:'排版與最終校稿',status:'todo',priority:'med',due:'7/28',assignee:'你',comments:[]},
       {id:105,title:'簡報給董事會',status:'todo',priority:'high',due:'7/31',assignee:'王小明',comments:[]},
     ]},
    {id:2,name:'後端系統重構',desc:'API v2 架構升級',progress:30,color:'#1D9E75',startDate:'2024-06-15',endDate:'2024-09-30',status:'at',
     tasks:[
       {id:201,title:'分析現有架構瓶頸',status:'done',priority:'high',due:'6/20',assignee:'陳工程師',comments:[{id:4,author:'陳工程師',avatar:'陳',text:'發現 N+1 查詢問題，已記錄在 JIRA',time:'6/18 11:00'}]},
       {id:202,title:'設計新 API schema',status:'done',priority:'high',due:'7/01',assignee:'陳工程師',comments:[]},
       {id:203,title:'建立 GraphQL layer',status:'in',priority:'high',due:'7/15',assignee:'陳工程師',comments:[{id:5,author:'PM',avatar:'P',text:'進度落後，需要增援嗎？',time:'7/10 10:30'},{id:6,author:'陳工程師',avatar:'陳',text:'需要一位後端工程師協助，預計延後一週',time:'7/10 11:45'}]},
       {id:204,title:'資料庫 migration',status:'todo',priority:'high',due:'8/01',assignee:'你',comments:[]},
       {id:205,title:'壓力測試與優化',status:'todo',priority:'med',due:'9/01',assignee:'陳工程師',comments:[]},
     ]},
    {id:3,name:'客戶提案 A',desc:'Acme Corp 服務提案',progress:80,color:'#EF9F27',startDate:'2024-07-01',endDate:'2024-07-31',status:'on',
     tasks:[
       {id:301,title:'需求訪談',status:'done',priority:'high',due:'7/03',assignee:'你',comments:[]},
       {id:302,title:'撰寫提案文件',status:'done',priority:'high',due:'7/10',assignee:'你',comments:[]},
       {id:303,title:'製作簡報',status:'done',priority:'med',due:'7/15',assignee:'設計師',comments:[]},
       {id:304,title:'提案簡報',status:'in',priority:'high',due:'7/20',assignee:'你',comments:[{id:7,author:'你',avatar:'你',text:'客戶對方案 B 感興趣，需要補充 ROI 分析',time:'7/18 15:00'}]},
       {id:305,title:'合約簽署',status:'todo',priority:'high',due:'7/31',assignee:'你',comments:[]},
     ]},
    {id:4,name:'產品路線圖',desc:'2024 H2 產品規劃',progress:20,color:'#D85A30',startDate:'2024-07-10',endDate:'2024-08-15',status:'on',
     tasks:[
       {id:401,title:'用戶訪談（10 人）',status:'in',priority:'high',due:'7/20',assignee:'PM',comments:[]},
       {id:402,title:'競品分析',status:'todo',priority:'med',due:'7/25',assignee:'PM',comments:[]},
       {id:403,title:'功能優先級排序',status:'todo',priority:'high',due:'8/01',assignee:'你',comments:[]},
       {id:404,title:'路線圖文件撰寫',status:'todo',priority:'med',due:'8/10',assignee:'你',comments:[]},
     ]},
    {id:5,name:'行銷活動 Q3',desc:'夏季推廣行動',progress:50,color:'#185FA5',startDate:'2024-07-01',endDate:'2024-09-30',status:'on',
     tasks:[
       {id:501,title:'活動企劃書',status:'done',priority:'high',due:'7/05',assignee:'行銷',comments:[]},
       {id:502,title:'社群內容製作',status:'in',priority:'med',due:'7/31',assignee:'行銷',comments:[]},
       {id:503,title:'投放廣告設定',status:'todo',priority:'med',due:'8/01',assignee:'行銷',comments:[]},
     ]},
    {id:6,name:'HR 新制度',desc:'員工績效考核系統',progress:90,color:'#0F6E56',startDate:'2024-05-01',endDate:'2024-07-15',status:'on',
     tasks:[
       {id:601,title:'制度草案',status:'done',priority:'high',due:'5/15',assignee:'HR',comments:[]},
       {id:602,title:'主管宣導',status:'done',priority:'med',due:'6/01',assignee:'HR',comments:[]},
       {id:603,title:'系統建置',status:'done',priority:'high',due:'7/01',assignee:'IT',comments:[]},
       {id:604,title:'全員上線',status:'in',priority:'high',due:'7/15',assignee:'HR',comments:[]},
     ]},
  ],
  notes: [
    {id:1,title:'週一 Standup 記錄',date:'2024-07-01',preview:'討論 Q2 目標達成率，後端系統延期至 7/15',tags:['會議','standup']},
    {id:2,title:'產品路線圖討論',date:'2024-07-03',preview:'確認 H2 功能優先級：通知系統 > 搜尋優化',tags:['產品','規劃']},
  ],
  settings: { dark: false }
};

// 備份現有資料
if (fs.existsSync(DATA_FILE)) {
  fs.copyFileSync(DATA_FILE, DATA_FILE + '.before-restore');
  console.log('✓ 已備份現有資料到 secretary.json.before-restore');
}

// 寫入完整資料
fs.writeFileSync(DATA_FILE, JSON.stringify(FULL_DATA, null, 2), 'utf8');
console.log('✓ 資料已還原！包含：');
console.log('  - 待辦清單：' + FULL_DATA.todos.length + ' 項');
console.log('  - 專案管理：' + FULL_DATA.projects.length + ' 個專案（含完整任務）');
console.log('  - 筆記：' + FULL_DATA.notes.length + ' 篇');
console.log('\n請重新整理瀏覽器（Ctrl+Shift+R）即可看到完整資料。');
