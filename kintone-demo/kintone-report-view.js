/* ============================================
   Y's Cloud 出勤系統 — Kintone 月報表檢視表
   kintone-report-view.js
   ============================================
   掛在「打卡紀錄」App 的自訂 JS。
   樣式已抽到同名的 kintone-report-view.css，
   兩個檔案要一起上傳到「JavaScript / CSS 自訂」設定。

   換空間時，理論上只需要調整最上面的 CONFIG 物件，
   不應該需要改動下面的畫面邏輯。
*/
(function () {
  'use strict';

  // 暫時除錯用，確認問題後記得刪掉
  if (typeof eruda !== 'undefined') eruda.init();

  // ------------------------------------------------
  // 集中設定：換空間/客戶時只改這裡
  // ------------------------------------------------
  const CONFIG = {
    // 這個 view 的 ID：對應 Kintone 後台新建的「月報表」清單
    reportViewId: '11217519',

    // 視覺主題：對應 kintone-report-view.css 裡的 [data-theme="X"]
    themeName: 'A',

    // 打卡紀錄 App（自己）的欄位代碼
    log: {
      empId: '員工編號',
      date: '出勤日期',
      checkInTime: '上班打卡',
      checkOutTime: '下班打卡',
      workMinutes: '工作分鐘數',
      attendanceStatus: '出勤狀態',
      lateMinutes: '遲到分鐘',
      earlyMinutes: '早退分鐘',
    },

    // 員工主檔 App
    master: {
      appId: 2334,
      empId: '員工編號',
      empName: '員工姓名',
      kintoneUser: '員工系統帳號',
      stdStart: '標準上班時間',
      stdEnd: '標準下班時間',
    },

    // 出勤狀態的「值」，跟 GAS 後端 VALUES 保持一致
    values: {
      attendanceLate: '遲到',
      attendanceEarly: '早退',
      attendanceBoth: '遲到早退',
    },

    // 本月遲到/早退超過幾次要跳警告
    rules: {
      lateWarningThreshold: 3,
    },
  };

  const THEME_NAME = CONFIG.themeName || 'A';

  // PC/Mobile 共用的輔助函式
  function getSpaceElement(isMobile) {
    return isMobile ? kintone.mobile.app.getHeaderSpaceElement() : kintone.app.getHeaderSpaceElement();
  }
  function getCurrentAppId(isMobile) {
    return (isMobile && kintone.mobile && kintone.mobile.app) ? kintone.mobile.app.getId() : kintone.app.getId();
  }

  kintone.events.on(['app.record.index.show', 'mobile.app.record.index.show'], function (event) {
    const isMobile = event.type === 'mobile.app.record.index.show';
    // PC 版原生容器是 id="gaia-argoui-app-index-canvas"
    // 手機官方 App 原生容器沒有 id，要用 class 選：.gaia-mobile-app-customview-wrapper
    // （這個 wrapper 包住了原生的清單內容跟底部分頁列，一起隱藏）
    const canvas = isMobile
      ? document.querySelector('.gaia-mobile-app-customview-wrapper')
      : document.getElementById('gaia-argoui-app-index-canvas');
    const existingRoot = document.getElementById('ys-report-root');

    if (String(event.viewId) !== String(CONFIG.reportViewId)) {
      if (canvas) canvas.style.display = '';
      if (existingRoot) existingRoot.remove();
      return event;
    }

    if (existingRoot) existingRoot.remove();

    mountLoadingShell(isMobile, canvas);
    initReport(isMobile);

    return event;
  });

  // ---- 畫面骨架 ----
  function mountLoadingShell(isMobile, canvas) {
    const space = getSpaceElement(isMobile);
    if (!space) return;

    if (canvas) canvas.style.display = 'none';

    const root = document.createElement('div');
    root.id = 'ys-report-root';
    root.dataset.theme = THEME_NAME;
    if (isMobile) root.dataset.mobile = 'true';
    root.innerHTML = `
    <div class="ys-report-loading" id="ysLoading">
      <div class="ys-spinner"></div>
      <div class="ys-loading-text">載入出勤報表中...</div>
    </div>
    <div class="ys-report-body" id="ysReportBody" style="display:none;"></div>
  `;
    space.appendChild(root);
  }

  // ---- 資料與狀態 ----
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth() + 1;
  let empId = null;
  let empName = null;
  let empStdStart = null; // 目前選取員工的標準上班時間 "HH:mm"
  let empStdEnd = null;   // 目前選取員工的標準下班時間 "HH:mm"
  let masterList = [];
  let isMobileMode = false;

  async function initReport(isMobile) {
    isMobileMode = isMobile;
    const body = document.getElementById('ysReportBody');
    const loading = document.getElementById('ysLoading');

    try {
      const login = kintone.getLoginUser();
      masterList = await loadMasterList();

      if (masterList.length === 0) {
        loading.innerHTML = `<div class="ys-empty-name">查無可檢視的員工資料，請確認權限設定</div>`;
        return;
      }

      const self = masterList.find(m => m.kintoneCodes.includes(login.code));
      const defaultPick = self || masterList[0];
      empId = defaultPick.empId;
      empName = defaultPick.empName;
      empStdStart = defaultPick.stdStart;
      empStdEnd = defaultPick.stdEnd;

      await renderMonth();

      loading.style.display = 'none';
      body.style.display = 'block';
      requestAnimationFrame(() => body.classList.add('visible'));
    } catch (err) {
      console.error(err);
      loading.innerHTML = `<div class="ys-empty-name">載入失敗，請重新整理頁面</div>`;
    }
  }

  function loadMasterList() {
    const M = CONFIG.master;
    return kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: M.appId,
      fields: [M.empId, M.empName, M.kintoneUser, M.stdStart, M.stdEnd],
    }).then(res => res.records.map(r => ({
      empId: r[M.empId].value,
      empName: r[M.empName].value,
      kintoneCodes: (r[M.kintoneUser].value || []).map(u => u.code),
      stdStart: r[M.stdStart] ? r[M.stdStart].value : null, // "HH:mm"
      stdEnd: r[M.stdEnd] ? r[M.stdEnd].value : null,
    })));
  }

  // ------------------------------------------------
  // 統一判斷：這一天最終應該顯示什麼狀態
  // ------------------------------------------------
  function resolveDisplayStatus(dateStr, rec) {
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const isPastDay = dateStr < todayStr;

    if (!rec) {
      return { label: null, warn: false, lateIsProblem: false, earlyIsProblem: false, earlyIsMissingCheckout: false };
    }

    if (!isWarn(rec, isPastDay)) {
      return { label: rec.status || '正常', warn: false, lateIsProblem: false, earlyIsProblem: false, earlyIsMissingCheckout: false };
    }

    if (!empStdStart || !empStdEnd) {
      return {
        label: rec.status,
        warn: true,
        lateIsProblem: (rec.status === CONFIG.values.attendanceLate || rec.status === CONFIG.values.attendanceBoth),
        earlyIsProblem: (rec.status === CONFIG.values.attendanceEarly || rec.status === CONFIG.values.attendanceBoth || !rec.checkOut),
        earlyIsMissingCheckout: !rec.checkOut,
      };
    }

    const gaps = computeAnomalyGaps(dateStr, rec, empStdStart, empStdEnd, isPastDay);
    return {
      label: rec.status,
      warn: true,
      lateIsProblem: !!gaps.late,
      earlyIsProblem: !!gaps.early,
      earlyIsMissingCheckout: !!gaps.earlyIsMissingCheckout,
    };
  }

  async function renderMonth() {
    const F = CONFIG.log;
    const mm = String(viewMonth).padStart(2, '0');
    const startDate = `${viewYear}-${mm}-01`;
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const endDate = `${viewYear}-${mm}-${String(lastDay).padStart(2, '0')}`;

    const res = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: getCurrentAppId(isMobileMode),
      query: `${F.empId} = "${empId}" and ${F.date} >= "${startDate}" and ${F.date} <= "${endDate}"`,
      fields: [F.date, F.checkInTime, F.checkOutTime, F.workMinutes, F.attendanceStatus, F.lateMinutes, F.earlyMinutes],
    });

    const days = res.records.map(r => ({
      date: r[F.date].value,
      checkIn: r[F.checkInTime].value || null,
      checkOut: r[F.checkOutTime].value || null,
      workMinutes: Number(r[F.workMinutes].value) || 0,
      status: r[F.attendanceStatus].value || '',
      lateMinutes: Number(r[F.lateMinutes].value) || 0,
      earlyMinutes: Number(r[F.earlyMinutes].value) || 0,
    }));
    const byDate = {};
    days.forEach(d => { byDate[d.date] = d; });

    const body = document.getElementById('ysReportBody');
    const isCurrentMonth = (viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1);
    const attendanceDays = days.length;
    const dayDisplays = days.map(d => ({ day: d, display: resolveDisplayStatus(d.date, d) }));
    const lateDays = dayDisplays.filter(x => x.display.lateIsProblem).length;
    const earlyDays = dayDisplays.filter(x => x.display.earlyIsProblem).length;
    const combinedWarnDays = dayDisplays.filter(x => x.display.lateIsProblem || x.display.earlyIsProblem).length;
    const totalWorkMinutes = days.reduce((s, d) => s + d.workMinutes, 0);
    const lastConsideredDay = isCurrentMonth ? today.getDate() : lastDay;
    const weekdayCount = countWeekdaysUpTo(viewYear, viewMonth, lastConsideredDay);
    const rate = weekdayCount > 0 ? Math.min(1, attendanceDays / weekdayCount) : 0;

    // 疑似異常日：平日、日期已過、但完全沒有打卡紀錄
    // 無法判斷是不是核准請假，只能標記「疑似」，不能斷定曠職
    const anomalyLastDay = isCurrentMonth ? lastConsideredDay - 1 : lastConsideredDay;
    const anomalyDates = [];
    for (let d = 1; d <= anomalyLastDay; d++) {
      const wd = new Date(viewYear, viewMonth - 1, d).getDay();
      if (wd === 0 || wd === 6) continue;
      const dateStr = `${viewYear}-${mm}-${String(d).padStart(2, '0')}`;
      if (byDate[dateStr]) continue;
      anomalyDates.push(dateStr);
    }

    const empSelectHtml = masterList.length > 1
      ? `<select id="ysEmpSelect" class="ys-emp-select">
        ${masterList.map(m => `<option value="${m.empId}" ${m.empId === empId ? 'selected' : ''}>${m.empName}</option>`).join('')}
      </select>`
      : '';

    // warning跟partial合併成一則，主句講次數，partial>0時加一句附註說明子集關係
    let warningHtml = '';
    if (combinedWarnDays >= CONFIG.rules.lateWarningThreshold) {
      warningHtml = `<div class="ys-warning-banner">本月出勤異常（遲到/早退/下班未打卡）已達 ${combinedWarnDays} 次，超過警戒值 ${CONFIG.rules.lateWarningThreshold} 次</div>`;
    }

    const anomalyHtml = anomalyDates.length > 0
      ? `<div class="ys-warning-banner ys-warning-anomaly">有 ${anomalyDates.length} 天平日尚無打卡紀錄，請人工確認是否為漏打卡</div>`
      : '';

    body.innerHTML = `
  <div class="ys-layout">
    <div class="ys-sidebar">
      ${empSelectHtml}
      <div class="ys-month-switch">
        <button id="ysPrev">‹</button>
        <span class="ys-month-label">${empName}・${viewYear} 年 ${viewMonth} 月</span>
        <button id="ysNext" ${isCurrentMonth ? 'disabled' : ''}>›</button>
      </div>
      ${warningHtml}
      ${anomalyHtml}
      <div class="ys-overview">
        <svg class="ys-ring" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="33" style="stroke:var(--ys-line)" stroke-width="6" fill="none"/>
          <circle cx="40" cy="40" r="33" id="ysRingArc" style="stroke:var(--ys-teal)" stroke-width="6" fill="none"
            stroke-linecap="round" stroke-dasharray="207.3" stroke-dashoffset="207.3"
            transform="rotate(-90 40 40)"/>
          <text x="40" y="45" text-anchor="middle" font-weight="700" font-size="17" style="fill:var(--ys-navy-deep)">${Math.round(rate * 100)}%</text>
        </svg>
        <div class="ys-stat-rows">
        <div class="ys-stat-row"><span>出勤天數</span><span class="v">${attendanceDays} 天</span></div>
        <div class="ys-stat-row"><span>遲到 / 早退</span><span class="v warn">${lateDays} / ${earlyDays}</span></div>
        <div class="ys-stat-row"><span>總工時</span><span class="v teal">${Math.floor(totalWorkMinutes / 60)} 小時 ${totalWorkMinutes % 60} 分</span></div>
        </div>
      </div>
    </div>
    <div class="ys-calendar-panel">
      <div class="ys-calendar">
        <div class="ys-weekdays"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
        <div class="ys-grid" id="ysGrid"></div>
        <div class="ys-calendar-legend">
          <span><i class="dot ok"></i>正常</span>
          <span><i class="dot warn"></i>遲到／早退</span>
          <span><i class="dot none"></i>未打卡</span>
        </div>
      </div>
          <div class="ys-day-detail visible accent-none" id="ysDayDetail">
      <div class="ys-dd-placeholder">點選日期，查看當日出勤明細</div>
    </div>
    </div>
  </div>
`;

    renderGrid(days, anomalyDates);
    const ringArc = document.getElementById('ysRingArc');
    if (ringArc) {
      requestAnimationFrame(() => {
        ringArc.style.strokeDashoffset = String(207.3 * (1 - rate));
      });
    }

    document.getElementById('ysPrev').addEventListener('click', () => {
      viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; }
      switchMonth();
    });
    document.getElementById('ysNext').addEventListener('click', () => {
      if (isCurrentMonth) return;
      viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; }
      switchMonth();
    });

    const empSelect = document.getElementById('ysEmpSelect');
    if (empSelect) {
      empSelect.addEventListener('change', (e) => {
        const picked = masterList.find(m => m.empId === e.target.value);
        if (!picked) return;
        empId = picked.empId;
        empName = picked.empName;
        empStdStart = picked.stdStart;
        empStdEnd = picked.stdEnd;
        renderMonth();
      });
    }
  }

  let renderToken = 0;

  function switchMonth() {
    const body = document.getElementById('ysReportBody');
    if (!body) { renderMonth(); return; }

    const myToken = ++renderToken;
    const prevBtn = document.getElementById('ysPrev');
    const nextBtn = document.getElementById('ysNext');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    body.dataset.transitioning = 'true';

    renderMonth().then(() => {
      // 如果切換期間使用者又點了下一次，這筆是過期結果，不要處理，交給最新那次收尾
      if (myToken !== renderToken) return;
      const newBody = document.getElementById('ysReportBody');
      if (newBody) newBody.dataset.transitioning = 'false';
    });
  }

  function renderGrid(days, anomalyDates) {
    const grid = document.getElementById('ysGrid');
    if (!grid) return;
    const byDate = {};
    days.forEach(d => { byDate[d.date] = d; });
    const anomalySet = new Set(anomalyDates || []);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth, 0).getDate();

    grid.innerHTML = '';
    for (let i = 0; i < firstWeekday; i++) {
      const pad = document.createElement('div');
      pad.className = 'ys-day pad';
      grid.appendChild(pad);
    }
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekday = new Date(viewYear, viewMonth - 1, day).getDay();
      const rec = byDate[dateStr];
      const display = resolveDisplayStatus(dateStr, rec);
      const cell = document.createElement('div');
      cell.className = 'ys-day clickable';
      if (weekday === 0 || weekday === 6) cell.classList.add('weekend');
      if (dateStr === todayStr) cell.classList.add('is-today');
      if (!rec) cell.classList.add('empty');
      if (!rec && anomalySet.has(dateStr)) cell.classList.add('anomaly');

      const inTime = rec && rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
      const miniLabel = rec ? inTime : '';

      cell.innerHTML = `
        <span>${day}</span>
        ${rec ? `<span class="status-dot ${display.warn ? 'warn' : ''}"></span>` : ''}
        <span class="mini-time">${miniLabel}</span>
      `;
      cell.addEventListener('click', () => showDayDetail(dateStr, rec, weekday === 0 || weekday === 6, anomalySet.has(dateStr)));
      grid.appendChild(cell);
    }
  }

  function showDayDetail(dateStr, rec, isWeekend, isAnomaly) {
    const panel = document.getElementById('ysDayDetail');
    if (!panel) return;

    panel.classList.remove('accent-ok', 'accent-warn', 'accent-none');
    const display = resolveDisplayStatus(dateStr, rec);

    if (!rec) {
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      let statusKey, statusLabel, noteText;
      if (isWeekend) {
        statusKey = 'none'; statusLabel = '例假日'; noteText = '非工作日，不列入出勤統計。';
      } else if (isFuture) {
        statusKey = 'none'; statusLabel = '尚未發生'; noteText = '這天還沒到，尚無出勤資料。';
      } else if (isToday) {
        statusKey = 'none'; statusLabel = '尚未打卡'; noteText = '今天目前還沒有打卡紀錄。';
      } else if (isAnomaly) {
        statusKey = 'warn'; statusLabel = '未打卡異常'; noteText = '這天沒有任何打卡紀錄，請確認是否為漏打卡，必要時補登。';
      } else {
        statusKey = 'none'; statusLabel = '未打卡'; noteText = '這天沒有打卡紀錄。';
      }

      panel.classList.add(statusKey === 'warn' ? 'accent-warn' : 'accent-none');
      const noteClass = statusKey === 'warn' ? 'ys-dd-note-alert' : 'ys-dd-note-muted';

      panel.innerHTML = isMobileMode ? `
        <div class="ys-dd-header">
          <span class="ys-dd-date">${dateStr}</span>
          <span class="ys-dd-status-pill ${statusKey}">${statusLabel}</span>
        </div>
        <div class="${noteClass}">${noteText}</div>
      ` : `
        <div class="ys-dd-header">
          <span class="ys-dd-date">${dateStr}</span>
          <span class="ys-dd-status"><span class="dot ${statusKey}"></span>${statusLabel}</span>
        </div>
        <div class="${noteClass}">${noteText}</div>
      `;
      panel.classList.add('visible');
      return;
    }

    const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
    const warn = display.warn;
    panel.classList.add(warn ? 'accent-warn' : 'accent-ok');

    const hasProblem = display.lateIsProblem || display.earlyIsProblem;
    const singleLabel = hasProblem ? buildProblemLabel(display, rec) : (rec.status || '正常');
    const singleClass = warn ? 'warn' : '';

    if (isMobileMode) {
      panel.innerHTML = `
    <div class="ys-dd-header">
      <span class="ys-dd-date">${dateStr}</span>
      <span class="ys-dd-status-pill ${singleClass}">${singleLabel}</span>
    </div>
    <div class="ys-dd-times">
      <div class="ys-dd-item"><div class="ys-dd-label">上班</div><div class="ys-dd-value">${fmt(rec.checkIn)}</div></div>
      <div class="ys-dd-item"><div class="ys-dd-label">下班</div><div class="ys-dd-value">${fmt(rec.checkOut)}</div></div>
      <div class="ys-dd-item"><div class="ys-dd-label">工作時數</div><div class="ys-dd-value">${Math.floor(rec.workMinutes / 60)}h${rec.workMinutes % 60}m</div></div>
    </div>
  `;
    } else {
      panel.innerHTML = `
    <div class="ys-dd-header">
      <span class="ys-dd-date">${dateStr}</span>
      <span class="ys-dd-status"><span class="dot ${singleClass}"></span>${singleLabel}</span>
    </div>
    <div class="ys-timeline">
      <div class="ys-timeline-node">
        <span class="ys-timeline-dot ${rec.checkIn ? 'filled' : ''}"></span>
        <div class="ys-timeline-content"><span class="l">上班</span><span class="v">${fmt(rec.checkIn)}</span></div>
      </div>
      <div class="ys-timeline-line"></div>
      <div class="ys-timeline-node">
        <span class="ys-timeline-dot ${rec.checkOut ? 'filled' : ''}"></span>
        <div class="ys-timeline-content"><span class="l">下班</span><span class="v">${fmt(rec.checkOut)}</span></div>
      </div>
    </div>
    <div class="ys-dd-summary">
      <span>工時 <b>${Math.floor(rec.workMinutes / 60)}</b>時<b>${rec.workMinutes % 60}</b>分</span>
    </div>
  `;
    }
    panel.classList.add('visible');
  }

  // 在 isWarn() 前面新增：
  function parseStdTimeOnDate(dateStr, timeStr) {
    if (!timeStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh = 0, mm = 0] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0);
  }

  // 算出「造成遲到/早退的那段實際缺口」
  function computeAnomalyGaps(dateStr, rec, stdStartStr, stdEndStr, isPastDay) {
    const gaps = { late: null, early: null, earlyIsMissingCheckout: false };
    if (!stdStartStr || !stdEndStr) return gaps;

    const stdStart = parseStdTimeOnDate(dateStr, stdStartStr);
    const stdEnd = parseStdTimeOnDate(dateStr, stdEndStr);

    if ((rec.status === CONFIG.values.attendanceLate || rec.status === CONFIG.values.attendanceBoth) && rec.checkIn) {
      const actualIn = new Date(rec.checkIn);
      if (actualIn > stdStart) gaps.late = { start: stdStart, end: actualIn };
    }
    if (!rec.checkOut && isPastDay) {
      gaps.early = { start: stdStart, end: stdEnd };
      gaps.earlyIsMissingCheckout = true;
    } else if (rec.status === CONFIG.values.attendanceEarly || rec.status === CONFIG.values.attendanceBoth) {
      const actualOut = new Date(rec.checkOut);
      if (actualOut < stdEnd) gaps.early = { start: actualOut, end: stdEnd };
    }
    return gaps;
  }

  function isWarn(rec, isPastDay) {
    return rec.status === CONFIG.values.attendanceLate
      || rec.status === CONFIG.values.attendanceEarly
      || rec.status === CONFIG.values.attendanceBoth
      || (isPastDay && !rec.checkOut); // 只有「這天已經過去」才把下班沒打卡算異常，今天還沒下班不算
  }

  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}小時${m}分` : `${m}分`;
  }

  function buildProblemLabel(display, rec) {
    const parts = [];
    if (display.lateIsProblem) parts.push(`遲到 ${formatMinutes(rec.lateMinutes)}`);
    if (display.earlyIsProblem) parts.push(display.earlyIsMissingCheckout ? '下班未打卡' : `早退 ${formatMinutes(rec.earlyMinutes)}`);
    return parts.join('・');
  }

  function countWeekdaysUpTo(year, month, lastDay) {
    let count = 0;
    for (let d = 1; d <= lastDay; d++) {
      const wd = new Date(year, month - 1, d).getDay();
      if (wd !== 0 && wd !== 6) count++;
    }
    return count;
  }
})();