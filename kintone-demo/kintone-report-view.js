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
      kintoneUser: '員工系統帳號', // 存 Kintone 登入帳號的欄位
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

  kintone.events.on('app.record.index.show', function (event) {
    const canvas = document.getElementById('gaia-argoui-app-index-canvas');
    const existingRoot = document.getElementById('ys-report-root');

    // 不是月報表這個 view：確保原生畫面顯示回來、清掉殘留的自訂節點，再放行
    // （用 event.viewId 而不是解析網址，避免頁面首次載入時網址列還沒同步更新的競速問題）
    if (String(event.viewId) !== String(CONFIG.reportViewId)) {
      if (canvas) canvas.style.display = '';
      if (existingRoot) existingRoot.remove();
      return event;
    }

    // 是月報表這個 view：每次都清掉舊節點、重新掛載，不要重用殘留的 DOM
    if (existingRoot) existingRoot.remove();

    mountLoadingShell();
    initReport();

    return event;
  });

  // ---- 畫面骨架 ----
  function mountLoadingShell() {
    const space = kintone.app.getHeaderSpaceElement();
    if (!space) return;

    // 隱藏原生的整個畫面主體（不管是表格/日曆/圖表版型）
    const canvas = document.getElementById('gaia-argoui-app-index-canvas');
    if (canvas) canvas.style.display = 'none';

    const root = document.createElement('div');
    root.id = 'ys-report-root';
    root.dataset.theme = THEME_NAME;
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
  let masterList = []; // 目前登入者有權限看到的員工清單（交給 Kintone ACL 決定範圍）

  async function initReport() {
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
      fields: [M.empId, M.empName, M.kintoneUser],
    }).then(res => res.records.map(r => ({
      empId: r[M.empId].value,
      empName: r[M.empName].value,
      // 員工系統帳號是使用者選擇欄位，value 是陣列，取出所有 code 方便比對
      kintoneCodes: (r[M.kintoneUser].value || []).map(u => u.code),
    })));
  }

  async function renderMonth() {
    const F = CONFIG.log;
    const mm = String(viewMonth).padStart(2, '0');
    const startDate = `${viewYear}-${mm}-01`;
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const endDate = `${viewYear}-${mm}-${String(lastDay).padStart(2, '0')}`;

    const res = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: kintone.app.getId(),
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
    const lateDays = days.filter(d => isWarn(d.status)).length;
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
      if (!byDate[dateStr]) anomalyDates.push(dateStr);
    }

    const empSelectHtml = masterList.length > 1
      ? `<select id="ysEmpSelect" class="ys-emp-select">
        ${masterList.map(m => `<option value="${m.empId}" ${m.empId === empId ? 'selected' : ''}>${m.empName}</option>`).join('')}
      </select>`
      : '';

    const warningHtml = lateDays >= CONFIG.rules.lateWarningThreshold
      ? `<div class="ys-warning-banner">本月遲到/早退已達 ${lateDays} 次，超過警戒值 ${CONFIG.rules.lateWarningThreshold} 次</div>`
      : '';

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
          <circle cx="40" cy="40" r="33" style="stroke:var(--ys-teal)" stroke-width="6" fill="none"
            stroke-linecap="round" stroke-dasharray="207.3" stroke-dashoffset="${207.3 * (1 - rate)}"
            transform="rotate(-90 40 40)"/>
          <text x="40" y="45" text-anchor="middle" font-weight="700" font-size="17" style="fill:var(--ys-navy-deep)">${Math.round(rate * 100)}%</text>
        </svg>
        <div class="ys-stat-rows">
          <div class="ys-stat-row"><span>出勤天數</span><span class="v">${attendanceDays} 天</span></div>
          <div class="ys-stat-row"><span>遲到/早退天數</span><span class="v warn">${lateDays} 天</span></div>
          <div class="ys-stat-row"><span>總工時</span><span class="v teal">${Math.floor(totalWorkMinutes / 60)} 小時 ${totalWorkMinutes % 60} 分</span></div>
        </div>
      </div>
    </div>
    <div class="ys-calendar-panel">
      <div class="ys-calendar">
        <div class="ys-weekdays"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
        <div class="ys-grid" id="ysGrid"></div>
      </div>
      <div class="ys-day-detail" id="ysDayDetail"></div>
    </div>
  </div>
`;

    renderGrid(days, anomalyDates);

    document.getElementById('ysPrev').addEventListener('click', () => {
      viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; }
      renderMonth();
    });
    document.getElementById('ysNext').addEventListener('click', () => {
      if (isCurrentMonth) return;
      viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; }
      renderMonth();
    });

    const empSelect = document.getElementById('ysEmpSelect');
    if (empSelect) {
      empSelect.addEventListener('change', (e) => {
        const picked = masterList.find(m => m.empId === e.target.value);
        if (!picked) return;
        empId = picked.empId;
        empName = picked.empName;
        renderMonth();
      });
    }
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
      const cell = document.createElement('div');
      cell.className = 'ys-day clickable';
      if (weekday === 0 || weekday === 6) cell.classList.add('weekend');
      if (dateStr === todayStr) cell.classList.add('is-today');
      if (!rec) cell.classList.add('empty');
      if (anomalySet.has(dateStr)) cell.classList.add('anomaly');

      const inTime = rec && rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';

      cell.innerHTML = `
        <span>${day}</span>
        ${rec ? `<span class="status-dot ${isWarn(rec.status) ? 'warn' : ''}"></span>` : ''}
        ${rec ? `<span class="mini-time">${inTime}</span>` : ''}
`;
      cell.addEventListener('click', () => showDayDetail(dateStr, rec, weekday === 0 || weekday === 6));
      grid.appendChild(cell);
    }
  }

  function showDayDetail(dateStr, rec, isWeekend) {
    const panel = document.getElementById('ysDayDetail');
    if (!panel) return;

    panel.classList.remove('accent-ok', 'accent-warn', 'accent-none');

    if (!rec) {
      panel.classList.add('accent-none');
      panel.innerHTML = isWeekend
        ? `
      <div class="ys-dd-header">
        <span class="ys-dd-date">${dateStr}</span>
        <span class="ys-dd-status"><span class="dot none"></span>例假日</span>
      </div>
      <div class="ys-dd-note">這天是週末，非上班日。</div>
    `
        : `
      <div class="ys-dd-header">
        <span class="ys-dd-date">${dateStr}</span>
        <span class="ys-dd-status"><span class="dot none"></span>未打卡</span>
      </div>
      <div class="ys-dd-note">這天沒有打卡紀錄，可能是漏打卡或已請假但未同步在此系統。</div>
    `;
      panel.classList.add('visible');
      return;
    }

    const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
    const warn = isWarn(rec.status);
    panel.classList.add(warn ? 'accent-warn' : 'accent-ok');

    const notes = [];
    if (rec.lateMinutes > 0) notes.push(`遲到 ${formatMinutes(rec.lateMinutes)}`);
    if (rec.earlyMinutes > 0) notes.push(`早退 ${formatMinutes(rec.earlyMinutes)}`);

    panel.innerHTML = `
    <div class="ys-dd-header">
      <span class="ys-dd-date">${dateStr}</span>
      <span class="ys-dd-status"><span class="dot ${warn ? 'warn' : ''}"></span>${rec.status || '正常'}</span>
    </div>
    <div class="ys-dd-times">
      <div><span class="l">上班</span><span class="v">${fmt(rec.checkIn)}</span></div>
      <div><span class="l">下班</span><span class="v">${fmt(rec.checkOut)}</span></div>
      <div><span class="l">工時</span><span class="v">${Math.floor(rec.workMinutes / 60)}時${rec.workMinutes % 60}分</span></div>
    </div>
    ${notes.length ? `<div class="ys-dd-note">${notes.join('・')}</div>` : ''}
  `;
    panel.classList.add('visible');
  }

  function isWarn(status) {
    return status === CONFIG.values.attendanceLate || status === CONFIG.values.attendanceEarly || status === CONFIG.values.attendanceBoth;
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