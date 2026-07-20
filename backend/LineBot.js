/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   LineBot.gs：LINE webhook 事件處理 + 所有 Flex 卡片組裝
   ============================================
   依賴：Config.gs（RULES）、Auth.gs、Punch.gs
   ⚠️「查詢」這個關鍵字文案若之後調整，記得同步修改：
   handleLineWebhook 裡的 text === '查詢' 判斷、buildHelpFlex 的說明文字
*/

function buildWelcomeFlex(displayName) {
  const greetName = displayName ? `${displayName} 您好！` : '您好！';
  const W = RULES.welcome;
  return [{
    type: 'flex',
    altText: '歡迎加入 Y\'S CLOUD',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#073040', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'Y\'S CLOUD', color: '#B7C8CE', size: 'xs' },
          { type: 'text', text: greetName, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          { type: 'text', text: W.intro, size: 'sm', color: '#16242E', wrap: true },
          { type: 'text', text: W.bindInstruction(RULES.empIdExample), size: 'xs', color: '#7C8A90', wrap: true, margin: 'sm' }
        ]
      }
    }
  }];
}

function buildHelpFlex() {
  return [{
    type: 'flex',
    altText: '操作說明',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#073040', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'Y\'S CLOUD', color: '#B7C8CE', size: 'xs' },
          { type: 'text', text: '可以這樣跟我說', color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          { type: 'text', text: '「上班」／「下班」', size: 'sm', weight: 'bold', color: '#16242E' },
          { type: 'text', text: '完成打卡，並顯示今日出勤卡片', size: 'xs', color: '#7C8A90', margin: 'xs' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '「今日打卡」', size: 'sm', weight: 'bold', color: '#16242E', margin: 'md' },
          { type: 'text', text: '查看今日打卡狀態，不會寫入紀錄', size: 'xs', color: '#7C8A90', margin: 'xs' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '「月報表」', size: 'sm', weight: 'bold', color: '#16242E', margin: 'md' },
          { type: 'text', text: '查看本月出勤天數、遲到早退次數與總工時', size: 'xs', color: '#7C8A90', margin: 'xs' }
        ]
      }
    }
  }];
}

// 提醒打卡卡片
function buildPunchReminderFlex(empName, missingType) {
  const labelMap = { IN: '上班', OUT: '下班', BOTH: '上下班' };
  const label = labelMap[missingType];

  // 上班是「提前提醒」，下班/雙缺是「忘記打卡提醒」，文案語氣統一但長短不同
  let bodyText, altText;
  if (missingType === 'IN') {
    bodyText = '快到上班時間囉，記得打卡喔！';
    altText = '快到上班時間囉！';
  } else if (missingType === 'OUT') {
    bodyText = '下班時間過囉，記得打卡喔！';
    altText = '下班時間過囉！';
  } else {
    bodyText = '今天還沒看到打卡紀錄，記得打卡喔！';
    altText = '記得打卡喔！';
  }

  return [{
    type: 'flex',
    altText: altText,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#073040', paddingAll: '16px',
        contents: [
          { type: 'text', text: '打卡提醒', color: '#FDE3A8', size: 'xs' },
          { type: 'text', text: empName, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'text', text: bodyText, size: 'sm', color: '#7C8A90', wrap: true },
          {
            type: 'button', style: 'primary', color: '#2F9696', margin: 'lg', height: 'sm',
            action: missingType === 'BOTH'
              ? { type: 'message', label: '上班', text: '上班' } // BOTH 情境先引導去打上班卡
              : { type: 'message', label: label, text: label }
          }
        ]
      }
    }
  }];
}

// ---- LINE Bot 主流程 ----
function handleLineWebhook(events) {
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('KINTONE_DOMAIN');
  const appId = props.getProperty('APP_ID');
  const liffBindUrl = props.getProperty('LIFF_BIND_URL'); // 你現有 LIFF 綁定頁的完整網址

  events.forEach(event => {
    if (event.type !== 'message' && event.type !== 'postback' && event.type !== 'follow') return;
    const lineUserId = event.source.userId;
    const replyToken = event.replyToken;

    // 新朋友加入好友：不用查綁定狀態，直接回歡迎卡片
    if (event.type === 'follow') {
      const profile = getLineProfile(lineUserId, props);
      replyLine(replyToken, buildWelcomeFlex(profile ? profile.displayName : ''));
      return;
    }

    const text = event.type === 'message' ? (event.message.text || '').trim() : (event.postback.data || '').trim();

    const binding = handleLookup_Raw(lineUserId, domain, appId, props.getProperty('TOKEN_READ'));

    if (!binding.bound) {
      if (RULES.empIdPattern.test(text)) {
        const bindResult = handleBind_Raw(lineUserId, text, domain, appId, props);
        if (bindResult.success) {
          replyLine(replyToken, buildStatusFlex(bindResult.empName, null, null, '綁定成功，歡迎加入！'));
        } else {
          replyLine(replyToken, buildUnboundFlex(liffBindUrl, bindResult.message));
        }
      } else {
        replyLine(replyToken, buildUnboundFlex(liffBindUrl));
      }
      return;
    }

    if (text === '上班' || text === '下班') {
      const type = text === '上班' ? 'IN' : 'OUT';
      const result = handlePunch_Raw(binding.empId, type, domain, props);
      const status = handleStatus_Raw(binding.empId, domain, props.getProperty('CHECK_LOG_APP_ID'), props.getProperty('CHECK_LOG_TOKEN'));
      const note = result.success ? buildAttendanceNote(status) : (result.message || '打卡失敗');
      replyLine(replyToken, buildStatusFlex(binding.empName, status.checkIn, status.checkOut, note));
    } else if (text === '今日打卡') {
      const status = handleStatus_Raw(binding.empId, domain, props.getProperty('CHECK_LOG_APP_ID'), props.getProperty('CHECK_LOG_TOKEN'));
      const note = buildAttendanceNote(status);
      replyLine(replyToken, buildStatusFlex(binding.empName, status.checkIn, status.checkOut, note));
    } else if (text === '月報表') {
      replyLine(replyToken, buildReportLinkFlex());
    } else {
      replyLine(replyToken, buildHelpFlex());
    }
  });

  return jsonOutput({ success: true });
}

function replyLine(replyToken, messages) {
  const token = PropertiesService.getScriptProperties().getProperty('CHANNEL_ACCESS_TOKEN');
  const payload = typeof messages === 'string'
    ? { replyToken, messages: [{ type: 'text', text: messages }] }
    : { replyToken, messages };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// 未打卡訊息推送提醒
function pushLine(lineUserId, messages) {
  const token = PropertiesService.getScriptProperties().getProperty('CHANNEL_ACCESS_TOKEN');
  const payload = typeof messages === 'string'
    ? { to: lineUserId, messages: [{ type: 'text', text: messages }] }
    : { to: lineUserId, messages };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// follow 事件的 payload 裡沒有 displayName，要另外呼叫 Profile API 拿
function getLineProfile(lineUserId, props) {
  const token = props.getProperty('CHANNEL_ACCESS_TOKEN');
  const res = UrlFetchApp.fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}

function formatTimeOrDash(iso) {
  return iso ? Utilities.formatDate(new Date(iso), 'Asia/Taipei', 'HH:mm') : '尚未打卡';
}

// 分鐘數 ≥60 時顯示「X 小時 Y 分鐘」
function formatMinutesAsHM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return m > 0 ? `${h} 小時 ${m} 分鐘` : `${h} 小時`;
  return `${m} 分鐘`;
}

function buildAttendanceNote(status) {
  if (status.lateMinutes > 0 && status.earlyMinutes > 0) return `已記錄遲到 ${formatMinutesAsHM(status.lateMinutes)}、早退 ${formatMinutesAsHM(status.earlyMinutes)}`;
  if (status.lateMinutes > 0) return `已記錄遲到 ${formatMinutesAsHM(status.lateMinutes)}`;
  if (status.earlyMinutes > 0) return `已記錄早退 ${formatMinutesAsHM(status.earlyMinutes)}`;
  return null;
}

function buildStatusFlex(empName, checkIn, checkOut, note) {
  const inFilled = !!checkIn;
  const outFilled = !!checkOut;
  const headerContents = [
    { type: 'text', text: '今日出勤', color: '#B7C8CE', size: 'xs' },
    { type: 'text', text: empName, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'sm' }
  ];
  if (note) {
    headerContents.push({ type: 'text', text: note, color: '#FDE3A8', size: 'xs', margin: 'sm', wrap: true });
  }

  return [{
    type: 'flex',
    altText: '今日出勤狀態',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#073040', paddingAll: '16px',
        contents: headerContents
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '上班', size: 'sm', color: '#7C8A90', flex: 1 },
              {
                type: 'text', text: formatTimeOrDash(checkIn), size: 'md', weight: 'bold', align: 'end',
                color: inFilled ? '#237373' : '#A9B0AC'
              }
            ]
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'horizontal', margin: 'md',
            contents: [
              { type: 'text', text: '下班', size: 'sm', color: '#7C8A90', flex: 1 },
              {
                type: 'text', text: formatTimeOrDash(checkOut), size: 'md', weight: 'bold', align: 'end',
                color: outFilled ? '#237373' : '#A9B0AC'
              }
            ]
          },
          { type: 'separator', margin: 'lg' },
          {
            type: 'button', style: 'primary', color: '#2F9696', margin: 'lg', height: 'sm',
            action: { type: 'uri', label: '前往打卡頁面', uri: 'https://nkn262628.github.io/ys-attendance/checkin/index.html' }
          }
        ]
      }
    }
  }];
}

// 月報表
function buildReportLinkFlex() {
  return [{
    type: 'flex',
    altText: '查看月報表',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#073040', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'Y\'S CLOUD', color: '#B7C8CE', size: 'xs' },
          { type: 'text', text: '月報表', color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'text', text: '查看本月出勤天數、遲到早退次數與總工時', size: 'sm', color: '#7C8A90', wrap: true },
          {
            type: 'button', style: 'primary', color: '#2F9696', margin: 'lg', height: 'sm',
            action: { type: 'uri', label: '查看月報表', uri: 'https://nkn262628.github.io/ys-attendance/report/index.html' }
          }
        ]
      }
    }
  }];
}

function buildUnboundFlex(liffBindUrl, note) {
  const contents = [
    { type: 'text', text: '尚未綁定', color: '#B7C8CE', size: 'xs' },
    { type: 'text', text: '請完成員工資料綁定', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'sm' }
  ];
  if (note) contents.push({ type: 'text', text: note, color: '#FDE3A8', size: 'xs', margin: 'sm', wrap: true });

  return [{
    type: 'flex',
    altText: '尚未綁定員工資料',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#073040', paddingAll: '16px', contents },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'text', text: `直接輸入你的員工編號即可完成綁定（例如 ${RULES.empIdExample}），或點下方按鈕開啟綁定頁面。`, size: 'sm', color: '#7C8A90', wrap: true },
          {
            type: 'button', style: 'primary', color: '#2F9696', margin: 'lg', height: 'sm',
            action: { type: 'uri', label: '開啟綁定頁面', uri: liffBindUrl }
          }
        ]
      }
    }
  }];
}
