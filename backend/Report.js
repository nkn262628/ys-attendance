/* ============================================
   Y's Cloud 出勤系統 — GAS 後端
   Report.gs：月報表查詢 + 異常/請假比對邏輯
   ============================================
   依賴：Config.gs（FIELDS/VALUES/RULES）
   這支檔案裡的 parseStdTimeOnDate_ / computeAnomalyGaps_ /
   intervalCoversGap_ / resolveDayStatus_ 跟 kintone-report-view.js
   的同名函式是同一套邏輯，只是搬到 GAS 端執行（LIFF 前端不能直接查 Kintone）
*/

function handleMonthlyReport_Raw(empId, year, month, domain, checkLogAppId, checkLogToken) {
  const F = FIELDS.log;
  const mm = String(month).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const query = encodeURIComponent(
    `${F.empId} = "${empId}" and ${F.date} >= "${startDate}" and ${F.date} <= "${endDate}" order by ${F.date} asc`
  );
  const url = `https://${domain}/k/v1/records.json?app=${checkLogAppId}&query=${query}` +
    `&fields=${F.date}&fields=${F.checkInTime}&fields=${F.checkOutTime}` +
    `&fields=${F.workMinutes}&fields=${F.attendanceStatus}` +
    `&fields=${F.lateMinutes}&fields=${F.earlyMinutes}`;
  const res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'X-Cybozu-API-Token': checkLogToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { error: true, message: '查詢月報表失敗' };

  const data = JSON.parse(res.getContentText());
  const records = data.records || [];

  const byDate = {};
  records.forEach(r => {
    byDate[r[F.date].value] = {
      checkIn: r[F.checkInTime].value || null,
      checkOut: r[F.checkOutTime].value || null,
      workMinutes: Number(r[F.workMinutes].value) || 0,
      status: r[F.attendanceStatus].value || '',
      lateMinutes: Number(r[F.lateMinutes].value) || 0,
      earlyMinutes: Number(r[F.earlyMinutes].value) || 0,
    };
  });

  // ---- 查請假資料 + 標準上下班時間 ----
  const props = PropertiesService.getScriptProperties();
  const masterAppId = props.getProperty('APP_ID');
  const masterToken = props.getProperty('TOKEN_READ');

  const stdTimes = fetchEmpStdTimes_(empId, domain, masterAppId, masterToken);

  // ---- 逐日重新判斷狀態（涵蓋「有打卡」跟「完全沒打卡」兩種情況）----
  const today = new Date();
  const isCurrentMonth = (year === today.getFullYear() && month === today.getMonth() + 1);
  const lastConsideredDay = isCurrentMonth ? today.getDate() : lastDay;
  const anomalyLastDay = isCurrentMonth ? lastConsideredDay - 1 : lastDay; // 今天先不算異常，給下班前緩衝

  let totalWorkMinutes = 0, totalLateMinutes = 0, totalEarlyMinutes = 0, lateDays = 0, earlyDays = 0;
  const days = [];
  const leaveOnlyDays = [];
  const anomalyDates = [];

  const todayStr = Utilities.formatDate(today, 'Asia/Taipei', 'yyyy-MM-dd');
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    const isPastDay = dateStr < todayStr;
    const rec = byDate[dateStr];
    const resolved = resolveDayStatus_(dateStr, rec, stdTimes.stdStart, stdTimes.stdEnd, isPastDay);

    if (rec) {
      totalWorkMinutes += rec.workMinutes;
      totalLateMinutes += rec.lateMinutes;
      totalEarlyMinutes += rec.earlyMinutes;
      if (resolved.lateIsProblem) lateDays++;
      if (resolved.earlyIsProblem) earlyDays++;

      days.push({
        date: dateStr,
        checkIn: rec.checkIn,
        checkOut: rec.checkOut,
        workMinutes: rec.workMinutes,
        status: rec.status || VALUES.attendanceNormal,
        lateMinutes: rec.lateMinutes,
        earlyMinutes: rec.earlyMinutes,
        warn: resolved.warn,
        lateIsProblem: resolved.lateIsProblem,
        earlyIsProblem: resolved.earlyIsProblem,
        earlyIsMissingCheckout: resolved.earlyIsMissingCheckout || false,
      });
    } else if (resolved.hasLeave) {
      leaveOnlyDays.push({ date: dateStr, label: resolved.label });
    } else {
      const wd = new Date(year, month - 1, d).getDay();
      if (wd !== 0 && wd !== 6 && d <= anomalyLastDay) {
        anomalyDates.push(dateStr);
      }
    }
  }

  return {
    summary: {
      attendanceDays: days.length,
      lateDays: lateDays,
      earlyDays: earlyDays,
      totalWorkMinutes: totalWorkMinutes,
      totalLateMinutes: totalLateMinutes,
      totalEarlyMinutes: totalEarlyMinutes,
    },
    days: days,
    anomalyDates: anomalyDates,
  };
}

function handleMonthlyReport(empId, year, month, domain, checkLogAppId, checkLogToken) {
  return jsonOutput(handleMonthlyReport_Raw(empId, year, month, domain, checkLogAppId, checkLogToken));
}

function parseStdTimeOnDate_(dateStr, timeStr) {
  if (!timeStr) return null;
  const dateParts = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0] || 0, timeParts[1] || 0, 0);
}

function computeAnomalyGaps_(dateStr, rec, stdStartStr, stdEndStr, isPastDay) {
  const gaps = { late: null, early: null, earlyIsMissingCheckout: false };
  if (!stdStartStr || !stdEndStr) return gaps;

  const stdStart = parseStdTimeOnDate_(dateStr, stdStartStr);
  const stdEnd = parseStdTimeOnDate_(dateStr, stdEndStr);

  if ((rec.status === VALUES.attendanceLate || rec.status === VALUES.attendanceBoth) && rec.checkIn) {
    const actualIn = new Date(rec.checkIn);
    if (actualIn > stdStart) gaps.late = { start: stdStart, end: actualIn };
  }
  if (!rec.checkOut && isPastDay) {
    gaps.early = { start: stdStart, end: stdEnd };
    gaps.earlyIsMissingCheckout = true;
  } else if (rec.status === VALUES.attendanceEarly || rec.status === VALUES.attendanceBoth) {
    const actualOut = new Date(rec.checkOut);
    if (actualOut < stdEnd) gaps.early = { start: actualOut, end: stdEnd };
  }
  return gaps;
}


// 統一判斷：這一天最終應該顯示什麼狀態
function resolveDayStatus_(dateStr, rec, stdStart, stdEnd, isPastDay) {
  if (!rec) {
    return { label: null, warn: false, lateIsProblem: false, earlyIsProblem: false };
  }

  const isWarnStatus = (rec.status === VALUES.attendanceLate || rec.status === VALUES.attendanceEarly || rec.status === VALUES.attendanceBoth || (isPastDay && !rec.checkOut));
  if (!isWarnStatus) {
    return { label: rec.status || VALUES.attendanceNormal, warn: false, lateIsProblem: false, earlyIsProblem: false };
  }

  if (!stdStart || !stdEnd) {
    return {
      label: rec.status,
      warn: true,
      lateIsProblem: (rec.status === VALUES.attendanceLate || rec.status === VALUES.attendanceBoth),
      earlyIsProblem: (rec.status === VALUES.attendanceEarly || rec.status === VALUES.attendanceBoth || !rec.checkOut),
      earlyIsMissingCheckout: !rec.checkOut,
    };
  }

  const gaps = computeAnomalyGaps_(dateStr, rec, stdStart, stdEnd, isPastDay);
  return {
    label: rec.status,
    warn: true,
    lateIsProblem: !!gaps.late,
    earlyIsProblem: !!gaps.early,
    earlyIsMissingCheckout: !!gaps.earlyIsMissingCheckout,
  };
}

// 查員工的標準上下班時間（給缺口比對用）
function fetchEmpStdTimes_(empId, domain, masterAppId, masterToken) {
  const F = FIELDS.master;
  const query = encodeURIComponent(`${F.empId} = "${empId}"`);
  const url = `https://${domain}/k/v1/records.json?app=${masterAppId}&query=${query}` +
    `&fields=${F.standardCheckIn}&fields=${F.standardCheckOut}`;
  const res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'X-Cybozu-API-Token': masterToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { stdStart: null, stdEnd: null };
  const data = JSON.parse(res.getContentText());
  if (!data.records || data.records.length === 0) return { stdStart: null, stdEnd: null };
  const r = data.records[0];
  return {
    stdStart: r[F.standardCheckIn] ? r[F.standardCheckIn].value : null,
    stdEnd: r[F.standardCheckOut] ? r[F.standardCheckOut].value : null,
  };
}
