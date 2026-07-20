/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   Punch.gs：打卡 upsert（上班新增／下班更新）+ 今日狀態查詢
   ============================================
   依賴：Config.gs（FIELDS/VALUES/RULES）、
   Utils.gs（distanceMeters/overlapMinutesWithLunch/addMinutesToTimeToday）
*/

function handlePunch_Raw(empId, type, domain, props, coords) {
  const F = FIELDS.log;
  const checkLogAppId = props.getProperty('CHECK_LOG_APP_ID');
  const checkLogToken = props.getProperty('CHECK_LOG_TOKEN');
  const masterAppId = props.getProperty('APP_ID');
  const masterToken = props.getProperty('TOKEN_READ');
  const now = new Date();
  const dateStr = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd');
  const dateTimeStr = Utilities.formatDate(now, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");

  // 查詢今天這個人是否已經有一筆紀錄，這是 upsert 的核心判斷
  const query = encodeURIComponent(`${F.empId} = "${empId}" and ${F.date} = "${dateStr}"`);
  const findUrl = `https://${domain}/k/v1/records.json?app=${checkLogAppId}&query=${query}` +
    `&fields=$id&fields=${F.checkInTime}&fields=${F.checkOutTime}&fields=${F.lateMinutes}`;
  const findRes = UrlFetchApp.fetch(findUrl, { method: 'get', headers: { 'X-Cybozu-API-Token': checkLogToken + ',' + masterToken }, muteHttpExceptions: true });
  if (findRes.getResponseCode() !== 200) {
    return { success: false, message: '查詢今日打卡紀錄失敗，請聯繫管理員' };
  }
  const findData = JSON.parse(findRes.getContentText());
  const existing = (findData.records && findData.records.length > 0) ? findData.records[0] : null;

  // 定位狀態，上班/下班共用同一套判斷邏輯
  let locationStatus = '未提供定位';
  let locationUrl = '';
  if (coords && coords.lat && coords.lng) {
    const dist = Math.round(distanceMeters(coords.lat, coords.lng, RULES.office.lat, RULES.office.lng));
    locationStatus = dist <= RULES.office.radiusMeters ? '正常位置' : `非公司範圍（距離約${dist}公尺）`;
    locationUrl = `https://maps.google.com/?q=${coords.lat},${coords.lng}`;
  }

  if (type === 'IN') {
    if (existing) {
      return { success: false, message: '今天已經打過上班卡了' };
    }

    const inMasterQuery = encodeURIComponent(`${FIELDS.master.empId} = "${empId}"`);
    const inMasterUrl = `https://${domain}/k/v1/records.json?app=${masterAppId}&query=${inMasterQuery}` +
      `&fields=${FIELDS.master.standardCheckIn}`;
    const inMasterRes = UrlFetchApp.fetch(inMasterUrl, { method: 'get', headers: { 'X-Cybozu-API-Token': masterToken }, muteHttpExceptions: true });

    let lateMinutes = 0;
    if (inMasterRes.getResponseCode() === 200) {
      const inMasterData = JSON.parse(inMasterRes.getContentText());
      if (inMasterData.records && inMasterData.records.length > 0) {
        const standardIn = inMasterData.records[0][FIELDS.master.standardCheckIn].value;
        if (standardIn) {
          const inDeadline = addMinutesToTimeToday(standardIn, 0);
          if (now > inDeadline) lateMinutes = Math.round((now - inDeadline) / 60000);
        }
      }
    }

    const record = {};
    record[F.empId] = { value: empId };
    record[F.date] = { value: dateStr };
    record[F.checkInTime] = { value: dateTimeStr };
    record[F.checkInLocationStatus] = { value: locationStatus };
    record[F.checkInLocationCoords] = { value: locationUrl };
    record[F.source] = { value: VALUES.sourceLabel };
    record[F.lateMinutes] = { value: lateMinutes };
    record[F.attendanceStatus] = { value: lateMinutes > 0 ? VALUES.attendanceLate : VALUES.attendanceNormal };

    const url = `https://${domain}/k/v1/record.json`;
    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Cybozu-API-Token': checkLogToken + ',' + masterToken },
      payload: JSON.stringify({ app: checkLogAppId, record: record }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) return { success: true, lateMinutes: lateMinutes };
    return { success: false, message: '上班打卡寫入失敗，請聯繫管理員' };
  }

  // type === 'OUT'
  // 防呆：沒有上班紀錄不能打下班卡
  if (!existing) {
    return { success: false, message: '尚未打上班卡，無法打下班卡' };
  }
  // 防呆：今天已經打過下班卡了
  if (existing[F.checkOutTime] && existing[F.checkOutTime].value) {
    return { success: false, message: '今天已經打過下班卡了' };
  }

  // 抓這位員工的標準上下班時間，計算遲到/早退分鐘數
  const lateMinutes = Number(existing[F.lateMinutes] && existing[F.lateMinutes].value) || 0;

  const masterQuery = encodeURIComponent(`${FIELDS.master.empId} = "${empId}"`);
  const masterUrl = `https://${domain}/k/v1/records.json?app=${masterAppId}&query=${masterQuery}` +
    `&fields=${FIELDS.master.standardCheckOut}`;
  const masterRes = UrlFetchApp.fetch(masterUrl, { method: 'get', headers: { 'X-Cybozu-API-Token': masterToken }, muteHttpExceptions: true });

  let earlyMinutes = 0;
  if (masterRes.getResponseCode() === 200) {
    const masterData = JSON.parse(masterRes.getContentText());
    if (masterData.records && masterData.records.length > 0) {
      const standardOut = masterData.records[0][FIELDS.master.standardCheckOut].value;
      if (standardOut) {
        const outDeadline = addMinutesToTimeToday(standardOut, 0);
        if (now < outDeadline) earlyMinutes = Math.round((outDeadline - now) / 60000);
      }
    }
  }

  // 出勤狀態
  let attendanceStatus = VALUES.attendanceNormal;
  if (lateMinutes > 0 && earlyMinutes > 0) {
    attendanceStatus = VALUES.attendanceBoth;
  } else if (lateMinutes > 0) {
    attendanceStatus = VALUES.attendanceLate;
  } else if (earlyMinutes > 0) {
    attendanceStatus = VALUES.attendanceEarly;
  }

  const actualCheckIn = new Date(existing[F.checkInTime].value);
  const rawWorkMinutes = Math.max(0, Math.round((now - actualCheckIn) / 60000));
  const lunchOverlap = overlapMinutesWithLunch(actualCheckIn, now);
  const workMinutes = Math.max(0, rawWorkMinutes - lunchOverlap);

  const updateRecord = {};
  updateRecord[F.checkOutTime] = { value: dateTimeStr };
  updateRecord[F.checkOutLocationStatus] = { value: locationStatus };
  updateRecord[F.checkOutLocationCoords] = { value: locationUrl };
  updateRecord[F.attendanceStatus] = { value: attendanceStatus };
  updateRecord[F.earlyMinutes] = { value: earlyMinutes };
  updateRecord[F.workMinutes] = { value: workMinutes };

  const updateUrl = `https://${domain}/k/v1/record.json`;
  const updateRes = UrlFetchApp.fetch(updateUrl, {
    method: 'put', contentType: 'application/json',
    headers: { 'X-Cybozu-API-Token': checkLogToken + ',' + masterToken },
    payload: JSON.stringify({ app: checkLogAppId, id: existing.$id.value, record: updateRecord }),
    muteHttpExceptions: true
  });
  if (updateRes.getResponseCode() === 200) return { success: true };
  return { success: false, message: '下班打卡寫入失敗，請聯繫管理員' };
}
function handlePunch(empId, type, domain, props, coords) {
  return jsonOutput(handlePunch_Raw(empId, type, domain, props, coords));
}

// 查詢今天這個員工的上班/下班打卡時間（現在每人每天只有一筆記錄，直接查那一筆就好）
function handleStatus_Raw(empId, domain, checkLogAppId, checkLogToken) {
  const F = FIELDS.log;
  const dateStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const query = encodeURIComponent(`${F.empId} = "${empId}" and ${F.date} = "${dateStr}"`);
  const url = `https://${domain}/k/v1/records.json?app=${checkLogAppId}&query=${query}` +
    `&fields=${F.checkInTime}&fields=${F.checkOutTime}` +
    `&fields=${F.attendanceStatus}&fields=${F.lateMinutes}&fields=${F.earlyMinutes}`;
  const res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'X-Cybozu-API-Token': checkLogToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { error: true, message: '查詢今日打卡狀態失敗' };
  const data = JSON.parse(res.getContentText());
  if (!data.records || data.records.length === 0) {
    return { checkIn: null, checkOut: null, attendanceStatus: null, lateMinutes: 0, earlyMinutes: 0 };
  }
  const r = data.records[0];
  return {
    checkIn: r[F.checkInTime].value || null,
    checkOut: r[F.checkOutTime].value || null,
    attendanceStatus: r[F.attendanceStatus].value || null,
    lateMinutes: Number(r[F.lateMinutes].value) || 0,
    earlyMinutes: Number(r[F.earlyMinutes].value) || 0,
  };
}
function handleStatus(empId, domain, checkLogAppId, checkLogToken) {
  return jsonOutput(handleStatus_Raw(empId, domain, checkLogAppId, checkLogToken));
}
