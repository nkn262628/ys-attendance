/* ============================================
   Y's Cloud 出勤系統 — 共用設定
   不要在這個檔案放 API Token（repo 是 public）
   ============================================ */

const CONFIG = {
  // 從 LINE Developers「Add a LIFF app」建立後複製貼上
  LIFF_ID: '2010617290-IaR9AsfU',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyBxJ_r1SWR7ebn2nipcWamFUKnuKVWfcD7RX5edoO02JKDpuAu45n16LMi9vK1AiKz3A/exec',

  // 之後接上 Kintone 時再填入，先保留結構
  KINTONE: {
    EMP_MASTER: {
      APP_ID: '',
      FIELDS: {
        EMP_ID: 'EMP_ID',
        EMP_NAME: 'EMP_NAME',
        LINE_USER_ID: 'LINE_USER_ID',
      },
    },
    CHECK_LOG: {
      APP_ID: '',
      FIELDS: {
        EMP_ID: 'EMP_ID',
        CHECK_DATE: 'CHECK_DATE',
        CHECK_DATETIME: 'CHECK_DATETIME',
        CHECK_TYPE: 'CHECK_TYPE',
        SOURCE: 'SOURCE',
      },
    },
  },
};