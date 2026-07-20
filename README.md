# Y's Cloud 出勤系統

LINE LIFF + LINE Bot 員工出勤打卡系統，整合 Kintone、Google Apps Script（GAS）與 LINE Messaging API。

## 系統架構

```
使用者手機 LINE App
      │
      ├─ 點擊 Rich Menu（上班／下班／查詢）
      │       → 觸發 GAS doPost（LINE Bot webhook）
      │       → GAS 回傳 Flex Message，內含 LIFF 連結
      │
      └─ 開啟 LIFF 頁面（本 repo 靜態頁面，由 GitHub Pages 託管）
              → 頁面內呼叫 LiffUtils → 呼叫 GAS doPost（同一入口）
              → GAS 讀寫 Kintone（打卡紀錄 / 員工主檔）
```

這個系統有三條各自獨立的線，程式碼「放在哪裡（版控）」跟「實際跑在哪裡（執行環境）」是兩件事：

| 內容 | 程式碼版控位置 | 實際執行 / 部署位置 |
|---|---|---|
| 靜態 LIFF 頁面（`checkin`／`report`／`bind`） | 本 repo | GitHub Pages（push 即自動發布） |
| GAS `doPost` 統一入口（`backend/`） | 本 repo `backend/`，透過 `clasp` 同步 | 仍然是 Google Apps Script 執行；clone 進 git 只是有了版本控制跟備份，**不影響也不取代**部署流程，改完 code 還是要照「後端（GAS）」段落手動建立新的部署版本 |
| Kintone 打卡紀錄 App 的後台自訂 JS/CSS（`kintone-demo/`） | 本 repo `kintone-demo/` | Kintone App 內建的 JS 客製化設定裡（上傳／貼上程式碼進 Kintone 後台） |

資料庫本身（打卡紀錄 App、員工主檔 App 的實際資料）在 Kintone，不屬於上面任何一條程式碼線，純粹是資料儲存的地方。

## 資料夾說明

| 路徑 | 用途 |
|---|---|
| `index.html` | 進站轉址頁 — 純 JS `window.location.href` 導向 `checkin/index.html`，並保留原本網址的 query string 與 hash（沒有其他內容） |
| `assets/favicon.png` | 網站圖示 |
| `assets/style.css` | **共用樣式**，三個 LIFF 頁面都引用這支，`.topbar` / `.card` / 按鈕 / 狀態列等基礎樣式都在這裡 |
| `bind/index.html` | 員工綁定頁 — 使用者第一次使用時，將 LINE 帳號與 Kintone 員工主檔綁定 |
| `checkin/index.html` | 打卡頁 — 即時時鐘、今日上下班打卡狀態、打卡動作按鈕 |
| `report/index.html`、`report/report.css` | 月報表頁 — 出勤率圓環、小日曆、單日明細 |
| `shared/config.js` | 環境設定（LIFF ID、GAS 後端網址等） |
| `shared/kintone-api.js` | 前端對 Kintone 相關的輔助呼叫 |
| `shared/liff-utils.js` | `LiffUtils` 共用模組：`init()` / `checkBinding()` / `punch()` / `getStatus()` / `getMonthlyReport()` 等，三個頁面共用同一份 |
| `kintone-demo/kintone-report-view.js`、`.css` | **注意：這是 Kintone 打卡紀錄 App 內建的自訂 JS/CSS**（後台桌面版月報表檢視），跟 LIFF 版 `report/index.html` 是兩套獨立實作、邏輯需要手動保持同步，不是同一支程式碼共用 |
| `backend/` | GAS 後端程式碼，已透過 `clasp clone` 同步進版控：`Router.js`（doPost 入口分派）、`Auth.js`、`Config.js`、`LineBot.js`、`Punch.js`、`Reminder.js`、`Report.js`、`Utils.js`、`appsscript.json`。修改流程見下方「後端程式碼同步」 |
| ~~`ngrok.exe`~~ | 開發階段暫時對外測試用的工具，正式環境已改用 GitHub Pages + GAS Web App（皆自帶 HTTPS），確認不再需要，已刪除 |

## 部署流程

### 前端（LIFF 靜態頁）
1. 修改對應資料夾內的 `.html` / `.css` / `.js`
2. Commit + push 到 GitHub
3. GitHub Pages 會在 push 後自動重新發布，不用手動 build 或觸發部署
4. 記得同步更新 HTML 內 `<link>` / `<script>` 的版本查詢字串（例如 `style.css?v=3` 改成 `?v=4`），避免使用者端瀏覽器快取到舊版

### 後端（GAS）
1. 在 Apps Script 編輯器修改 `Code.gs`（或其他 `.gs` 檔）
2. **重點：改完程式碼不會自動生效在正式環境**，除非重新建立部署版本：
   右上角「部署」→「管理部署作業」→ 找到正式的 Web app 部署 → 點編輯（鉛筆圖示）→ 版本選「新版本」→ 部署
3. 部署後網址（`/exec` 結尾）維持不變，不用重新設定 LINE Bot webhook 或 `config.js`

### 確認目前是不是正式部署（不是測試模式）
- Apps Script 編輯器 →「部署」→「管理部署作業」
- 網址結尾 `/dev` = 測試部署，跑的是編輯器裡「目前最新存檔」的程式碼，改了就立刻影響
- 網址結尾 `/exec` = 正式部署，綁定固定版本號，改程式碼不會有影響，要手動建立新版本才會更新
- 已確認：`shared/config.js` 裡設定的後端網址是 `/exec` 結尾，目前是正式部署，不是測試模式

## 後端程式碼同步（clasp）

目前 GAS 程式碼只存在 Apps Script 線上編輯器裡，沒有版本控制、沒有備份，跟 repo 裡其他程式碼的管理水準不一致，建議用 Google 官方的 `clasp` 工具同步進本 repo。

### 第一次設定（在你自己的電腦上執行，需要互動登入 Google 帳號）
```bash
npm install -g @google/clasp
clasp login
```
瀏覽器會跳出 Google 登入畫面，選擇有這個 Apps Script 專案權限的帳號授權。

### 把現有 GAS 專案抓下來
1. 打開 Apps Script 編輯器 → 左側齒輪「專案設定」→ 複製「指令碼 ID」
2. 在本機建立 `backend/` 資料夾：
```bash
mkdir backend && cd backend
clasp clone <貼上指令碼ID>
```
3. 執行後會產生 `.gs` / `appsscript.json` 等檔案，這些就可以直接 `git add` 進 repo

### 之後同步更新
- 從 Apps Script 編輯器改完 → 本機執行 `clasp pull` 抓最新版本 → commit 進 git
- 本機改完 `.gs` → 執行 `clasp push` 推回 Apps Script 編輯器 → **仍然要照上方「後端（GAS）」段落手動建立新的部署版本**，`clasp push` 只同步程式碼，不會自動部署

### 注意事項
- `clasp clone`/`pull` **不會**把 Script Properties（例如 `LEAVE_TOKEN` 之類的敏感設定）抓下來，這些本來就不該進 git，繼續留在 Apps Script 後台的「專案設定 →指令碼屬性」即可
- `.clasp.json`（記錄指令碼 ID）建議加進 `.gitignore` 或至少確認裡面沒有敏感資訊再進 git

## 多客戶／模組化注意事項

這套系統目前是單一客戶（威志雲端）專用，如果之後要複製給其他客戶用，以下這些地方是目前**寫死、需要抽成設定**的部分，換客戶時只需要動這些，不用動核心邏輯：

- **Kintone App ID**：打卡紀錄 App、員工主檔 App 的 ID，目前分散寫在 GAS 程式碼跟 `kintone-demo/*.js` 裡，換客戶時每個 App ID 都不同
- **Kintone 欄位代碼**：員工編號、標準上班/下班時間等欄位代碼，不同客戶的 Kintone 環境欄位代碼可能不一樣
- **LIFF ID / LINE 相關設定**：`shared/config.js` 裡的 LIFF ID、GAS 後端網址，每個客戶都是獨立的 LINE 官方帳號跟 LIFF 應用
- **Rich Menu 圖片與版面設定**：目前的 2500×843 三欄版型是客製化的，換客戶可能要重新設計
- **出勤規則參數**：標準上班/下班時間判定、遲到早退警戒門檻（`LATE_WARNING_THRESHOLD` 等）可能因客戶而異

**目前實際狀況（已確認）**：
- `backend/Config.js` 集中管理欄位名稱（`FIELDS`）、狀態值文字（`VALUES`）、業務規則（`RULES`：員工編號格式、公司座標與打卡範圍、提醒分鐘數、午休扣時、歡迎文案等）——換客戶時這些改這支檔案就好
- **Kintone App ID、LINE Channel Access Token / Secret 都放在 Script Properties**（Apps Script 後台的「指令碼屬性」），不是寫死在 `.gs` 檔案裡，也因此不會被 `clasp pull` 抓進 git——這是對的做法，敏感值不會意外外洩到版本控制裡

換句話說，目前的模組化程度其實已經不錯：**會因客戶而變的東西，分別放在「進 git 的 `Config.js`」跟「不進 git 的 Script Properties」兩處**，核心邏輯（`Punch.js`／`Report.js`／`LineBot.js`／`Router.js`）理論上不用因換客戶而修改。真的要換客戶時，實務上要做的事情是：
1. 建立新的 Kintone App，把新的 App ID／欄位代碼設進新專案的 Script Properties 與 `Config.js`
2. 申請新客戶的 LINE 官方帳號、LIFF，Channel Token/Secret 設進 Script Properties，`shared/config.js` 的 LIFF ID 跟後端網址也要換成新的
3. 依新客戶需求調整 `Config.js` 裡的 `RULES`（座標、上下班時間規則、歡迎文案等）
4. Rich Menu 圖片與版面（2500×843 三欄版型）通常需要重新設計

如果之後要服務多個客戶同時上線（而不是「複製一份改設定」），會需要更進一步把 Script Properties 改成依客戶查找（例如用 LINE 官方帳號 ID 對應到不同客戶的設定），現在單客戶的架構還不需要走到這一步。


## 常見問題 / 排錯

- **改了 CSS/HTML 但畫面沒變** → 通常是瀏覽器或 LINE 內建瀏覽器快取住舊版，先檢查 `<link>`/`<script>` 的版本查詢字串有沒有跟著更新
- **月報表頁跟 Kintone 後台顯示邏輯不一致** → `report/index.html`（LIFF 版）跟 `kintone-demo/kintone-report-view.js`（Kintone 後台版）是各自獨立的程式碼，改動異常判斷邏輯時記得兩邊都要改
- **打卡失敗但沒有明確錯誤訊息** → 先確認 GAS 部署是不是正式版（見上方「確認部署」段落），測試部署常常是問題來源
- **LIFF 頁面在 LINE 裡打不開 / 空白** → 確認 GitHub Pages 網址是不是有正確設定進 LINE Developers 後台的 LIFF endpoint URL