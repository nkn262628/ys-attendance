/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   Auth.gs：LINE 帳號綁定 / 查詢綁定狀態
   ============================================
   依賴：Config.gs（FIELDS/VALUES）
*/

// 用 LINE userId 查是否已綁定
function handleLookup_Raw(lineUserId, domain, appId, token) {
  const F = FIELDS.master;
  const query = encodeURIComponent(`${F.lineId} = "${lineUserId}"`);
  const url = `https://${domain}/k/v1/records.json?app=${appId}&query=${query}` +
    `&fields=${F.empId}&fields=${F.empName}&fields=${F.status}`;
  const res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'X-Cybozu-API-Token': token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { error: true, message: 'Kintone 查詢失敗，請確認 Token 或 App 設定' };
  const data = JSON.parse(res.getContentText());
  if (data.records && data.records.length > 0) {
    const r = data.records[0];
    const status = r[F.status].value;
    if (status !== VALUES.activeStatus) {
      return { bound: true, blocked: true, message: `此帳號目前狀態為「${status}」，無法打卡，請聯繫管理員` };
    }
    return { bound: true, empId: r[F.empId].value, empName: r[F.empName].value, status: status };
  }
  return { bound: false };
}
function handleLookup(lineUserId, domain, appId, token) {
  return jsonOutput(handleLookup_Raw(lineUserId, domain, appId, token));
}

// 驗證員工編號並寫回 LINE userId
function handleBind_Raw(lineUserId, empId, domain, appId, props) {
  const F = FIELDS.master;
  const tokenRead = props.getProperty('TOKEN_READ');
  const tokenWrite = props.getProperty('TOKEN_WRITE');

  const query = encodeURIComponent(`${F.empId} = "${empId}"`);
  const findUrl = `https://${domain}/k/v1/records.json?app=${appId}&query=${query}` +
    `&fields=$id&fields=${F.empName}&fields=${F.lineId}&fields=${F.status}`;
  const findRes = UrlFetchApp.fetch(findUrl, { method: 'get', headers: { 'X-Cybozu-API-Token': tokenRead }, muteHttpExceptions: true });

  if (findRes.getResponseCode() !== 200) {
    return { error: true, message: 'Kintone 查詢失敗，請確認 Token 或 App 設定' };
  }
  const findData = JSON.parse(findRes.getContentText());
  if (!findData.records || findData.records.length === 0) {
    return { success: false, message: '查無此員工編號' };
  }
  const record = findData.records[0];
  if (record[F.status].value !== VALUES.activeStatus) {
    return { success: false, message: `此員工目前狀態為「${record[F.status].value}」，無法完成綁定` };
  }
  if (record[F.lineId].value) {
    return { success: false, message: '此員工編號已綁定過 LINE 帳號' };
  }

  const recordId = record.$id.value;
  const updateUrl = `https://${domain}/k/v1/record.json`;
  const updatePayload = { app: appId, id: recordId, record: {} };
  updatePayload.record[F.lineId] = { value: lineUserId };
  const updateRes = UrlFetchApp.fetch(updateUrl, {
    method: 'put', contentType: 'application/json',
    headers: { 'X-Cybozu-API-Token': tokenWrite },
    payload: JSON.stringify(updatePayload), muteHttpExceptions: true
  });

  if (updateRes.getResponseCode() === 200) {
    return { success: true, empName: record[F.empName].value };
  }
  return { success: false, message: '寫入失敗，請聯繫管理員' };
}
function handleBind(lineUserId, empId, domain, appId, props) {
  return jsonOutput(handleBind_Raw(lineUserId, empId, domain, appId, props));
}
