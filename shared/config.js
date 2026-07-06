/* ============================================
   Y's Cloud 出勤系統 — 共用設定
   不要在這個檔案放 API Token（repo 是 public）
   ============================================ */

const CONFIG = {
  // 從 LINE Developers「Add a LIFF app」建立後複製貼上
  LIFF_ID: '2010617290-IaR9AsfU',

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