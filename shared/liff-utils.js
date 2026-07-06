/* ============================================
   Y's Cloud 出勤系統 — LIFF 共用邏輯
   ============================================ */

const LiffUtils = {
  profile: null,

  /**
   * 初始化 LIFF，成功後回傳使用者 profile
   * 尚未登入時會自動觸發 LINE 登入導轉
   */
  async init() {
    await liff.init({ liffId: CONFIG.LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login();
      return null; // 頁面會導轉，這裡先中斷
    }

    this.profile = await liff.getProfile();
    return this.profile;
  },

  isInClient() {
    return liff.isInClient();
  },
};