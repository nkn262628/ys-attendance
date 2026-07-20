/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   Reminder.gs：忘記打卡提醒排程（上班前 30 分 / 下班後 30 分）
   ============================================
   依賴：Config.gs（RULES）、Punch.gs（handleStatus_Raw）、
   LineBot.gs（pushLine/buildPunchReminderFlex）、
   Utils.gs（addMinutesToTimeToday）

   ⚠️ 這支函式靠 Apps Script 的時間驅動觸發條件定期執行，
   觸發條件本身不在這份程式碼裡，要去 Apps Script 編輯器的
   「觸發條件」頁面設定與確認。由於現在提醒窗口縮到 30 分鐘，
   建議觸發頻率至少要到「每 10～15 分鐘」，
   如果目前設定是「每小時」，時間誤差會明顯變大
   （Google 對「每小時」觸發只保證每小時執行一次，
   不保證在整點的哪一分鐘執行）。
*/

function checkForgotten() {
  const now = new Date();
  // 週六日不提醒：checkForgotten 對所有員工共用同一個「今天」，
  // 所以直接在最前面判斷一次今天是不是週末就好，不用每個員工各判斷一次
  const weekdayNum = Number(Utilities.formatDate(now, 'Asia/Taipei', 'u')); // 1=一...6=六 7=日
  if (weekdayNum === 6 || weekdayNum === 7) return;

  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('KINTONE_DOMAIN');
  const appId = props.getProperty('APP_ID');
  const tokenRead = props.getProperty('TOKEN_READ');
  const checkLogAppId = props.getProperty('CHECK_LOG_APP_ID');
  const checkLogToken = props.getProperty('CHECK_LOG_TOKEN');
  const F = FIELDS.master;

  const query = encodeURIComponent(`${F.status} in ("${VALUES.activeStatus}") and ${F.lineId} != ""`);
  const url = `https://${domain}/k/v1/records.json?app=${appId}&query=${query}` +
    `&fields=${F.empId}&fields=${F.empName}&fields=${F.lineId}` +
    `&fields=${F.standardCheckIn}&fields=${F.standardCheckOut}`;
  const res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'X-Cybozu-API-Token': tokenRead }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return;

  const data = JSON.parse(res.getContentText());
  const todayStr = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd');

  (data.records || []).forEach(r => {
    const empId = r[F.empId].value;
    const empName = r[F.empName].value;
    const lineUserId = r[F.lineId].value;
    const standardIn = r[F.standardCheckIn].value;   // 例如 "09:00"
    const standardOut = r[F.standardCheckOut].value; // 例如 "18:00"

    if (!standardIn && !standardOut) return; // 沒設定標準時間就跳過，避免誤判

    const status = handleStatus_Raw(empId, domain, checkLogAppId, checkLogToken);

    // 檢查上班提醒：現在時間 >= 標準上班時間 - 提前分鐘 且 尚未打上班卡
    if (standardIn && !status.checkIn) {
      const deadline = addMinutesToTimeToday(standardIn, -RULES.reminder.checkInAdvanceMinutes);
      if (now >= deadline && !hasAlreadyReminded(empId, todayStr, 'IN')) {
        pushLine(lineUserId, buildPunchReminderFlex(empName, 'IN'));
        markReminded(empId, todayStr, 'IN');
      }
    }

    // 檢查下班提醒：現在時間 >= 標準下班時間 + 延遲分鐘
    if (standardOut) {
      const deadline = addMinutesToTimeToday(standardOut, RULES.reminder.checkOutDelayMinutes);
      if (now >= deadline) {
        if (!status.checkIn && !status.checkOut && !hasAlreadyReminded(empId, todayStr, 'BOTH')) {
          pushLine(lineUserId, buildPunchReminderFlex(empName, 'BOTH'));
          markReminded(empId, todayStr, 'BOTH');
        } else if (status.checkIn && !status.checkOut && !hasAlreadyReminded(empId, todayStr, 'OUT')) {
          pushLine(lineUserId, buildPunchReminderFlex(empName, 'OUT'));
          markReminded(empId, todayStr, 'OUT');
        }
      }
    }
  });
}

// 檢查今天這位員工這種提醒是否已經發送過
function hasAlreadyReminded(empId, todayStr, type) {
  const key = `reminded_${todayStr}_${empId}_${type}`;
  return PropertiesService.getScriptProperties().getProperty(key) === 'true';
}

// 標記今天這位員工這種提醒已經發送過
function markReminded(empId, todayStr, type) {
  const key = `reminded_${todayStr}_${empId}_${type}`;
  PropertiesService.getScriptProperties().setProperty(key, 'true');
}

// 每天凌晨清空所有 reminded_ 開頭的 key，避免 Script Properties 長期累積爆量
function clearAllReminders() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (key.startsWith('reminded_')) {
      props.deleteProperty(key);
    }
  });
}
