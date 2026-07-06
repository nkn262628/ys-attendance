/* ============================================
   Y's Cloud 出勤系統 — LIFF 共用邏輯
   ============================================ */

const LiffUtils = {
  profile: null,

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
      body: JSON.stringify({
        action: 'lookup',
        lineUserId: this.profile.userId,
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
      body: JSON.stringify({
        action: 'bind',
        lineUserId: this.profile.userId,
        empId: empId,
      }),
    });
    return await res.json();
  },
};