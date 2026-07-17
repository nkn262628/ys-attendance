/* ============================================
   Y's Cloud 出勤系統 — LIFF 共用邏輯
   ============================================ */

const LiffUtils = {
  profile: null, empId: null,

  async init() {
    await liff.init({ liffId: CONFIG.LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login();
      return null;
    }

    this.profile = await liff.getProfile();
    return this.profile;
  },

  isInClient() {
    return liff.isInClient();
  },

  /**
   * 查詢目前這個 LINE 使用者是否已綁定員工資料
   */
  async checkBinding() {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      // 加入下方這兩行來繞過 GAS 的 CORS 限制與處理轉址
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'lookup',
        lineUserId: this.profile.userId,
        secret: CONFIG.CLIENT_SECRET,
      }),
    });
    return await res.json();
  },

  /**
   * 送出員工編號完成綁定
   */
  async bindEmployee(empId) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      // 這裡同樣補上這兩行
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'bind',
        lineUserId: this.profile.userId,
        empId: empId,
        secret: CONFIG.CLIENT_SECRET,
      }),
    });
    return await res.json();
  },
  async punch(type, coords) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'punch',
        empId: this.empId,
        type: type,
        lat: coords?.lat,
        lng: coords?.lng,
        secret: CONFIG.CLIENT_SECRET,
      }),
    });
    return await res.json();
  },

  async getStatus() {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'status',
        empId: this.empId,
        secret: CONFIG.CLIENT_SECRET,
      }),
    });
    return await res.json();
  },

  async getMonthlyReport(year, month) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'monthlyReport',
        empId: this.empId,
        year: year,
        month: month,
        secret: CONFIG.CLIENT_SECRET,
      }),
    });
    return await res.json();
  },

  /**
 * 共用：把遲到／早退分鐘數組成顯示文字
 * 打卡頁的今日提示、月報表的單日明細都呼叫這支，
 * 避免兩邊各自維護一份文案邏輯，以後只改這裡就好
 * 分鐘數 ≥60 時換算成「X 小時 Y 分鐘」
 */
  formatAttendanceNote(lateMinutes, earlyMinutes) {
    const fmt = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h > 0) return m > 0 ? `${h} 小時 ${m} 分鐘` : `${h} 小時`;
      return `${m} 分鐘`;
    };
    const notes = [];
    if (lateMinutes > 0) notes.push(`遲到 ${fmt(lateMinutes)}`);
    if (earlyMinutes > 0) notes.push(`早退 ${fmt(earlyMinutes)}`);
    return notes.join('・');
  },
};

