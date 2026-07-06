function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('KINTONE_DOMAIN');
  const appId = props.getProperty('APP_ID');

  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  if (action === 'lookup') {
    return handleLookup(body.lineUserId, domain, appId, props.getProperty('TOKEN_READ'));
  }
  if (action === 'bind') {
    return handleBind(body.lineUserId, body.empId, domain, appId, props);
  }
  return jsonOutput({ error: 'unknown action' });
}

// 用 LINE userId 查是否已綁定
function handleLookup(lineUserId, domain, appId, token) {
  const query = encodeURIComponent(`員工LINE帳號 = "${lineUserId}"`);
  const url = `https://${domain}/k/v1/records.json?app=${appId}&query=${query}&fields=EMP_ID&fields=EMP_NAME&fields=STATUS`;

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'X-Cybozu-API-Token': token },
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());

  if (data.records && data.records.length > 0) {
    const r = data.records[0];
    return jsonOutput({
      bound: true,
      empName: r.EMP_NAME.value,
      status: r.STATUS.value
    });
  }
  return jsonOutput({ bound: false });
}

// 驗證員工編號並寫回 LINE userId
function handleBind(lineUserId, empId, domain, appId, props) {
  const tokenRead = props.getProperty('TOKEN_READ');
  const tokenWrite = props.getProperty('TOKEN_WRITE');

  // 1. 先用員工編號查記錄是否存在
  const query = encodeURIComponent(`EMP_ID = "${empId}"`);
  const findUrl = `https://${domain}/k/v1/records.json?app=${appId}&query=${query}&fields=$id&fields=EMP_NAME&fields=員工LINE帳號`;
  const findRes = UrlFetchApp.fetch(findUrl, {
    method: 'get',
    headers: { 'X-Cybozu-API-Token': tokenRead },
    muteHttpExceptions: true
  });
  const findData = JSON.parse(findRes.getContentText());

  if (!findData.records || findData.records.length === 0) {
    return jsonOutput({ success: false, message: '查無此員工編號' });
  }

  const record = findData.records[0];
  if (record.員工LINE帳號.value) {
    return jsonOutput({ success: false, message: '此員工編號已綁定過 LINE 帳號' });
  }

  // 2. 寫回 LINE_USER_ID
  const recordId = record.$id.value;
  const updateUrl = `https://${domain}/k/v1/record.json`;
  const updateRes = UrlFetchApp.fetch(updateUrl, {
    method: 'put',
    contentType: 'application/json',
    headers: { 'X-Cybozu-API-Token': tokenWrite },
    payload: JSON.stringify({
      app: appId,
      id: recordId,
      record: { 員工LINE帳號: { value: lineUserId } }
    }),
    muteHttpExceptions: true
  });

  const updateData = JSON.parse(updateRes.getContentText());
  if (updateRes.getResponseCode() === 200) {
    return jsonOutput({ success: true, empName: record.EMP_NAME.value });
  }
  return jsonOutput({ success: false, message: '寫入失敗，請聯繫管理員' });
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}