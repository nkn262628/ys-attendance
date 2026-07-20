/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   Router.gs：doPost 單一入口，LIFF + LINE Bot 共用
   ============================================
   依賴：Config.gs（FIELDS/VALUES/RULES）、
   Auth.gs、Punch.gs、Report.gs、LineBot.gs 裡的各個 handle* 函式
*/

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // LINE 平台送來的 webhook 一定帶 events 陣列，這是跟 LIFF 呼叫最明確的分流依據
    if (body.events) {
      return handleLineWebhook(body.events);
    }

    // 以下維持原本 LIFF 的邏輯不變
    const props = PropertiesService.getScriptProperties();
    const domain = props.getProperty('KINTONE_DOMAIN');
    const appId = props.getProperty('APP_ID');

    const clientSecret = props.getProperty('CLIENT_SECRET');
    if (body.secret !== clientSecret) {
      return jsonOutput({ error: true, message: 'unauthorized' });
    }

    const action = body.action;
    if (action === 'lookup') return handleLookup(body.lineUserId, domain, appId, props.getProperty('TOKEN_READ'));
    if (action === 'bind') return handleBind(body.lineUserId, body.empId, domain, appId, props);
    if (action === 'punch') return handlePunch(body.empId, body.type, domain, props, { lat: body.lat, lng: body.lng });
    if (action === 'status') return handleStatus(body.empId, domain, props.getProperty('CHECK_LOG_APP_ID'), props.getProperty('CHECK_LOG_TOKEN'));
    if (action === 'monthlyReport') return handleMonthlyReport(body.empId, body.year, body.month, domain, props.getProperty('CHECK_LOG_APP_ID'), props.getProperty('CHECK_LOG_TOKEN'));
    // ⚠️ getHolidays(body.year) 沒有在目前拿到的檔案裡被定義過，
    // 這是拆分前就存在的缺口，不是這次拆分造成的，先照原樣保留
    if (action === 'getHolidays') return jsonOutput(getHolidays(body.year));
    return jsonOutput({ error: 'unknown action' });

  } catch (err) {
    return jsonOutput({ error: true, message: 'GAS錯誤: ' + err.message, stack: err.stack });
  }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
