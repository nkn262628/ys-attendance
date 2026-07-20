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

兩個部署單位是分開的：

| 單位 | 內容 | 部署位置 |
|---|---|---|
| 前端（本 repo） | 靜態 LIFF 頁面 | GitHub Pages |
| 後端 | GAS `doPost` 統一入口 | Google Apps Script（獨立專案，不在本 repo 內） |
| 資料庫 | 打卡紀錄 App、員工主檔 App | Kintone |

## 資料夾說明

| 路徑 | 用途 |
|---|---|
| `index.html` | 進站頁面（⚠️ 待確認：目前實際作用是導向哪個頁面，還是單純測試用入口，請補充） |
| `assets/favicon.png` | 網站圖示 |
| `assets/style.css` | **共用樣式**，三個 LIFF 頁面都引用這支，`.topbar` / `.card` / 按鈕 / 狀態列等基礎樣式都在這裡 |
| `bind/index.html` | 員工綁定頁 — 使用者第一次使用時，將 LINE 帳號與 Kintone 員工主檔綁定 |
| `checkin/index.html` | 打卡頁 — 即時時鐘、今日上下班打卡狀態、打卡動作按鈕 |
| `report/index.html`、`report/report.css` | 月報表頁 — 出勤率圓環、小日曆、單日明細 |
| `shared/config.js` | 環境設定（LIFF ID、GAS 後端網址等） |
| `shared/kintone-api.js` | 前端對 Kintone 相關的輔助呼叫 |
| `shared/liff-utils.js` | `LiffUtils` 共用模組：`init()` / `checkBinding()` / `punch()` / `getStatus()` / `getMonthlyReport()` 等，三個頁面共用同一份 |
| `kintone-demo/kintone-report-view.js`、`.css` | **注意：這是 Kintone 打卡紀錄 App 內建的自訂 JS/CSS**（後台桌面版月報表檢視），跟 LIFF 版 `report/index.html` 是兩套獨立實作、邏輯需要手動保持同步，不是同一支程式碼共用 |
| `ngrok.exe` | 開發階段暫時對外測試用的工具（⚠️ 待確認：目前正式環境的靜態頁走 GitHub Pages、GAS 走 Web App 部署，兩者都已有 HTTPS，這支應該已經用不到，如果還有用途請補充說明） |

## 部署流程

### 前端（LIFF 靜態頁）
1. 修改對應資料夾內的 `.html` / `.css` / `.js`
2. Commit + push 到 GitHub
3. GitHub Pages 會自動重新發布（⚠️ 待確認：目前是 push 到哪個分支自動觸發，還是需要手動觸發 build）
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
- ⚠️ 待確認：目前 `shared/config.js` 裡設定的後端網址，實際上是哪一種

## 常見問題 / 排錯

- **改了 CSS/HTML 但畫面沒變** → 通常是瀏覽器或 LINE 內建瀏覽器快取住舊版，先檢查 `<link>`/`<script>` 的版本查詢字串有沒有跟著更新
- **月報表頁跟 Kintone 後台顯示邏輯不一致** → `report/index.html`（LIFF 版）跟 `kintone-demo/kintone-report-view.js`（Kintone 後台版）是各自獨立的程式碼，改動異常判斷邏輯時記得兩邊都要改
- **打卡失敗但沒有明確錯誤訊息** → 先確認 GAS 部署是不是正式版（見上方「確認部署」段落），測試部署常常是問題來源
- **LIFF 頁面在 LINE 裡打不開 / 空白** → 確認 GitHub Pages 網址是不是有正確設定進 LINE Developers 後台的 LIFF endpoint URL

## 待補充項目

以下幾點目前是我根據對話脈絡推測，麻煩你確認或補充後我再更新：
- [ ] 根目錄 `index.html` 實際用途
- [ ] GitHub Pages 觸發部署的分支/流程
- [ ] `ngrok.exe` 是否還有實際用途
- [ ] `shared/config.js` 裡後端網址目前是 `/dev` 還是 `/exec`