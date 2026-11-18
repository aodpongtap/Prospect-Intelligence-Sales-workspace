/**
 * Prospect Intelligence Sales workspace — Google Apps Script Web App
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone with Google account  (Google จะบังคับล็อกอินให้เอง)
 */

var APP_TITLE = 'Prospect Intelligence Sales workspace';

/**
 * เสิร์ฟหน้า dashboard
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * อีเมลผู้ใช้ที่ล็อกอิน Google (ใช้แสดงบนหัว dashboard / ทำ RBAC ได้)
 */
function getUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

/**
 * URL ของ web app นี้ (ใช้ฝังลิงก์ในหน้าเว็บ)
 */
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

/**
 * เรียกจาก client เพื่อขอข้อมูลผู้ใช้ปัจจุบัน
 */
function getSessionInfo() {
  return {
    email: getUserEmail(),
    effectiveEmail: (function () {
      try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) { return ''; }
    })(),
    timeZone: Session.getScriptTimeZone(),
    url: getWebAppUrl()
  };
}
