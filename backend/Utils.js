/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   Utils.gs：跟業務邏輯無關的共用小工具
   ============================================
   依賴：Config.gs（RULES.lunchBreak）
*/

// 打卡位置相關 距離計算公式
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 計算 [checkIn, checkOut] 這段區間跟當天午休時段重疊的分鐘數
function overlapMinutesWithLunch(checkIn, checkOut) {
  const lunch = RULES.lunchBreak;
  if (!lunch || !lunch.start || !lunch.end) return 0;

  const lunchStart = addMinutesToTimeToday(lunch.start, 0);
  const lunchEnd = addMinutesToTimeToday(lunch.end, 0);
  // 用打卡日期當基準重建午休起訖，避免跨日邊界問題
  lunchStart.setFullYear(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
  lunchEnd.setFullYear(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());

  const overlapStart = new Date(Math.max(checkIn.getTime(), lunchStart.getTime()));
  const overlapEnd = new Date(Math.min(checkOut.getTime(), lunchEnd.getTime()));

  if (overlapEnd <= overlapStart) return 0;
  return Math.round((overlapEnd - overlapStart) / 60000);
}

// 把 Kintone 時間欄位字串（例如 "09:00"）換算成今天日期+偏移分鐘後的 Date 物件
// delayMinutes 可傳負數，代表往前推（例如提前提醒用 -30）
function addMinutesToTimeToday(timeStr, delayMinutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m + delayMinutes, 0, 0);
  return d;
}
