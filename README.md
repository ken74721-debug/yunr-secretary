# 芸兒小秘書 — 安裝與使用說明

## 系統架構

```
yunr-secretary/
├── server.js          ← Node.js 伺服器（主程式）
├── start.bat          ← Windows 雙擊啟動
├── package.json
├── public/
│   └── index.html     ← 前端介面
└── data/
    └── secretary.json ← 所有資料存在這裡（自動產生）
```

---

## 第一次安裝

1. 把整個 `yunr-secretary` 資料夾放到您想要的位置
   - 建議：`C:\Users\kenchiu\Documents\yunr-secretary\`

2. 確認已安裝 Node.js（您的電腦已有安裝）

---

## 每次使用

### 方法一：雙擊啟動（最簡單）
直接雙擊 `start.bat`，會自動：
- 啟動伺服器
- 在瀏覽器開啟系統

### 方法二：命令列
```
cd C:\Users\kenchiu\Documents\yunr-secretary
node server.js
```

啟動後在瀏覽器輸入：`http://localhost:3766`

---

## 關閉系統

在黑色命令視窗按 **Ctrl + C**，或直接關閉視窗。

---

## 資料在哪裡？

所有資料儲存在：
```
yunr-secretary/data/secretary.json
```

- 每次修改後 0.5 秒自動儲存
- 系統左下角顯示「已儲存」/「儲存中...」狀態
- 每次儲存前自動備份到 `secretary.json.bak`

### 手動備份
直接複製 `data/secretary.json` 到其他地方即可。

---

## 設定固定開機啟動（選用）

如果希望開機後自動在背景執行：

1. 按 `Win + R`，輸入 `shell:startup`
2. 把 `start.bat` 的捷徑放入該資料夾

之後每次開機，系統就會自動在背景啟動，打開瀏覽器輸入 `http://localhost:3766` 即可使用。

---

## 未來升級路線

| Phase | 功能 |
|-------|------|
| Phase 1（現在） | 待辦清單、專案管理（看板/甘特）、會議筆記 |
| Phase 2 | Google Calendar API 整合、AI 摘要 |
| Phase 3 | 個人日曆、家庭代辦、健康追蹤 |
| 長期 | Electron 桌面應用程式版本 |
