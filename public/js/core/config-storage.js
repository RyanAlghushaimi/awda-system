// ============================================================
// ===== DATA MODELS =====
// ============================================================
const MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];
const MONTH_KEYS = [
  'jan','feb','mar','apr','may','jun',
  'jul','aug','sep','oct','nov','dec'
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = []; for (let y = CURRENT_YEAR; y >= 2025; y--) YEARS.push(y);
const LS_KEY = 'awda_real_estate_v2';
const SETTINGS_KEY = 'awda_settings_v1';

// ============================================================
// ===== STORAGE SERVICE =====
// ============================================================
// عنوان الخادم: بما أن الخادم هو من يخدّم هذا الملف، نستخدم نفس العنوان تلقائيًا
const API_BASE = window.location.origin;

let savePending = 0; // عدد عمليات الحفظ الجارية حاليًا، يُستخدم لإيقاف السحب اللحظي مؤقتًا أثناء الحفظ
// ===== [TRACE مؤقت] تتبع مسار عقد واحد عبر onSnapshot → setLocalArray → applyRemoteUpdate → mergeAppData =====
// للاستخدام: افتح Console واكتب أولاً: window.__TRACE_CONTRACT_ID = 'ضع_هنا_ID_العقد'
window.__TRACE_CONTRACT_ID = window.__TRACE_CONTRACT_ID || null;
function __traceFindContract(arr, id) { return (Array.isArray(arr) ? arr : []).find(c => c && c.id === id) || null; }
const StorageService = {
  // ملاحظة: تم استبدال التخزين من خادم LAN المحلي (server.js) إلى
  // Firebase Firestore عبر FirebaseStorageService (راجع firebase.js).
  async load() {
    try {
      const data = await FirebaseStorageService.load();
      return (data && typeof data === 'object' && Object.keys(data).length) ? data : { agents: [] };
    } catch (e) {
      console.error('تعذر تحميل البيانات من Firebase:', e);
      showToast('تعذر الاتصال بقاعدة البيانات — تأكد من الاتصال بالإنترنت', 'error');
      return { agents: [] };
    }
  },
  async save(data) {
    savePending++;
    try {
      // JSON.stringify ثم parse يحذف تلقائيًا أي حقل undefined في أي مكان بالبيانات
      // (Firestore يرفض حفظ أي حقل بقيمة undefined ويفشل الحفظ بالكامل بسببه)
      await FirebaseStorageService.save(JSON.parse(JSON.stringify(data)));
    } catch (e) {
      console.error('تعذر حفظ البيانات على Firebase:', e);
      showToast('تعذر الاتصال بقاعدة البيانات — تأكد من الإنترنت وأعد المحاولة', 'error');
      throw e;
    } finally {
      savePending--;
    }
  },
  loadSettings() {
    return StorageService.safeParse(localStorage.getItem(SETTINGS_KEY), {});
  },
  // نقطة موحّدة وحيدة للـ parsing في كامل التطبيق — أي إضافة مستقبلية تمر من هنا
  safeParse(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed !== null && typeof parsed === 'object') ? parsed : fallback;
    } catch (e) {
      console.warn('safeParse: قيمة غير صالحة كـ JSON، تم تجاهلها:', raw && raw.slice ? raw.slice(0,50) : raw);
      return fallback;
    }
  },
  saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch(e) {}
  },
  // أداة تشخيص: تعرض فقط مفاتيح localStorage الخاصة بالتطبيق (بادئة awda_)
  // وتستبعد مفاتيح Firebase الداخلية حتى لا تُفسَّر خطأً كبيانات تالفة
  debugListAppKeys() {
    const appKeys = [];
    const externalKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('awda_')) appKeys.push(k);
      else externalKeys.push(k);
    }
    console.log('مفاتيح التطبيق (awda_):', appKeys);
    console.log('مفاتيح خارجية (Firebase SDK وغيرها - لا تُلمس):', externalKeys);
    return { appKeys, externalKeys };
  }
};

