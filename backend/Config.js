/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   Config.gs：集中設定，換客戶時理論上只需要改這支檔案
   ============================================
   多個 .gs 檔案在同一個 Apps Script 專案裡共用同一個全域作用域，
   不需要 import/export，其他檔案可以直接使用這裡宣告的常數。
*/

// ------------------------------------------------
// 欄位名稱設定：換客戶如果 Kintone 欄位名稱不同，
// 只需要改這裡，不用改其他檔案的任何函式內容
// ------------------------------------------------
const FIELDS = {
  // 員工主檔 App
  master: {
    empId: '員工編號',
    empName: '員工姓名',
    lineId: '員工LINE帳號',
    status: '在職狀態',
    standardCheckIn: '標準上班時間',
    standardCheckOut: '標準下班時間',
  },
  // 打卡紀錄 App
  // 改版重點：每人每天「一筆」記錄，用 date 當 upsert 的 key，
  // 不再各自用 checkInDate / checkOutDate 分開判斷
  log: {
    empId: '員工編號',
    date: '出勤日期',
    checkInTime: '上班打卡',
    checkOutTime: '下班打卡',
    workMinutes: '工作分鐘數',
    attendanceStatus: '出勤狀態',
    lateMinutes: '遲到分鐘',
    earlyMinutes: '早退分鐘',
    checkInLocationStatus: '上班定位狀態',
    checkInLocationCoords: '上班打卡位置',
    checkOutLocationStatus: '下班定位狀態',
    checkOutLocationCoords: '下班打卡位置',
    source: '來源',
  },
};

// 在職狀態 / 打卡類型的「值」也可能因客戶而異，一併抽出來
// （例如有客戶可能用「在職中」而不是「在職」）
const VALUES = {
  activeStatus: '在職',
  sourceLabel: 'LINE打卡',
  attendanceNormal: '正常',
  attendanceLate: '遲到',
  attendanceEarly: '早退',
  attendanceBoth: '遲到早退',
};

const RULES = {
  empIdPattern: /^[A-Za-z]{2,5}-\d{3,4}$/, // 換客戶時，員工編號格式不同就只改這裡
  empIdExample: 'EMP-001', // 顯示在提示文字裡的範例
};

// 打卡位置
RULES.office = {
  lat: 25.043853841568193,   // 替換成公司實際座標
  lng: 121.51570790923186,
  radiusMeters: 500,
};

// 打卡提醒（分鐘）
RULES.reminder = {
  checkInAdvanceMinutes: 30, // 上班前 30 分鐘主動提醒
  checkOutDelayMinutes: 30,  // 下班後 30 分鐘提醒
};

// 午休時段：如果打卡區間有跨過這段時間，工時要扣掉重疊的分鐘數
RULES.lunchBreak = {
  start: '12:00',
  end: '13:00',
};

// 歡迎訊息文案，換客戶或想調整文字時只改這裡
RULES.welcome = {
  intro: '感謝加入，歡迎使用出勤打卡機器人。',
  bindInstruction: (example) => `輸入你的員工編號（例如 ${example}）即可完成綁定，之後就能用「上班」「下班」等指令打卡。`,
};
