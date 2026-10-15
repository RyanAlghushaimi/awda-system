// ===== إشعارات تحفيزية جانبية كل ساعة =====
const MOTIVATION_MESSAGES = [
  'سأبلغ القمة… مهما طال الطريق.',
  'النجاح ليس خيارًا… بل قرار اتخذته ولن أتراجع.',
  'لن أكون عاديًا… خُلقت لأتفوّق.',
  'كل يوم أقترب خطوة من النجاح الذي أستحقه.',
  'لن يسبقني أحد… لأنني لا أتوقف.',
  'النجاح لا يُهدى… أنا من سيأخذه بالقوة.',
  'سأكون حيث يتمنى الآخرون أن يصلوا.',
  'ما أزرعه اليوم… سأحصده نجاحًا غدًا.',
  'لا مكان للضعف في طريق النجاح.',
  'طريقي واضح… نهاية واحدة: القمة.',
  'النجاح يحتاج صبرًا… وأنا أهلٌ له.',
  'سأصنع قصة نجاح تُروى لا تُنسى.',
  'لا أنتظر الفرص… أنا أصنعها.',
  'النجاح يحب المجانين الذين لا يستسلمون.',
  'لن أعود للخلف… فالقمة أمامي فقط.'
];
let motivationTimer = null;
function showMotivationPopup() {
  const old = document.getElementById('motivationPopup');
  if (old) old.remove();
  const msg = MOTIVATION_MESSAGES[Math.floor(Math.random() * MOTIVATION_MESSAGES.length)];
  const el = document.createElement('div');
  el.id = 'motivationPopup';
  el.innerHTML = `<i class="fas fa-fire motiv-icon"></i><div class="motiv-text">${msg}</div><button class="motiv-close" onclick="hideMotivationPopup()">×</button>`;
  document.body.appendChild(el);
  setTimeout(hideMotivationPopup, 15000);
}
function hideMotivationPopup() {
  const el = document.getElementById('motivationPopup');
  if (!el) return;
  el.classList.add('motiv-out');
  setTimeout(() => el.remove(), 400);
}
function startMotivationSchedule() {
  if (motivationTimer) clearInterval(motivationTimer);
  motivationTimer = setInterval(showMotivationPopup, 5 * 60 * 1000);
}
function init() {
  applyDarkMode();
  applyAccentColor();
  ensureDeletedStructure(appData);
  ensureVacantData();
  ensureColData();
  renderDashboard();
  ensureUnitsData();
  ensureEmployeesData();
  ensureMaintenanceData();
  ensureUsersData();
  // Migrate old data if needed
  appData.agents.forEach(a => {
    if (!a.months) a.months = {};
    MONTH_KEYS.forEach(mk => { if (!a.months[mk]) a.months[mk] = { contracts: [] }; });
  });
}
async function boot() {
  // بصمة إصدار مطبوعة عند كل تحميل — لحسم أي شك مستقبلي حول ما إذا كان
  // المتصفح يشغّل نسخة قديمة مخزّنة مؤقتاً (cache) من هذا الملف أم لا.
  // عند أي شك في نتيجة اختبار، تحقق أولاً من هذا السطر في الـ Console.
  console.log('%cAPP BUILD: 2026-08-09-idle-timeout-fix', 'color:#0d2137;font-weight:bold;background:#f4d03f;padding:2px 8px;border-radius:4px;');
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = 'flex';
  appData = await StorageService.load();
  lastLoadedSnapshot = JSON.parse(JSON.stringify(appData));
  if (window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID')) {
    const _tid = window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID');
    console.log('[TRACE-BOOT 1] بعد StorageService.load() مباشرة | موجود في contracts.log؟',
      (appData.contracts?.log || []).some(l => l.id === _tid),
      '| Tombstone موجود؟', !!(appData.deleted?.logEntries?.contracts?.[_tid]));
  }
  init();
  if (window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID')) {
    const _tid = window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID');
    console.log('[TRACE-BOOT 2] بعد init() مباشرة | موجود في contracts.log؟',
      (appData.contracts?.log || []).some(l => l.id === _tid),
      '| Tombstone موجود؟', !!(appData.deleted?.logEntries?.contracts?.[_tid]));
  }
  await Promise.all([
    MaintenanceRepository.init(),
    VacantRepository.init(),
    UnitsRepository.init(),
    EmployeesRepository.init(),
    CollectionsRepository.init(),
    AgentsRepository.init(),
    ContractAgreementsRepository.init(),
    UsersRepository.init()
  ]);
  // ترحيل لمرة واحدة فقط طوال عمر النظام: نقل vacant.log القديم من المستند
  // الرئيسي إلى Collection مستقلة (vacLog). محمي بـ MigrationRegistry حتى لا
  // يُعاد تنفيذه عند كل إقلاع لكل مستخدم (وليس عند كل عملية حجز إطلاقًا).
  if (typeof VacLogCollectionService !== 'undefined' && typeof MigrationRegistry !== 'undefined') {
    try {
      const alreadyMigrated = await MigrationRegistry.isMigrated('vacLog');
      if (!alreadyMigrated && appData.vacant && appData.vacant.log && appData.vacant.log.length) {
        const n = await VacLogCollectionService.migrateFromArray(appData.vacant.log);
        console.log(`[Migration] vacLog: تم ترحيل ${n} سجل من المستند الرئيسي`);
      }
      await MigrationRegistry.markMigrated('vacLog');
    } catch (e) { console.warn('ترحيل vacLog:', e); }
  }
  // ترحيل لمرة واحدة فقط طوال عمر النظام: نقل units.log القديم من المستند
  // الرئيسي إلى Collection مستقلة (unitsLog)، بنفس أسلوب ترحيل vacLog أعلاه.
  if (typeof UnitsLogCollectionService !== 'undefined' && typeof MigrationRegistry !== 'undefined') {
    try {
      const alreadyMigrated = await MigrationRegistry.isMigrated('unitsLog');
      if (!alreadyMigrated && appData.units && appData.units.log && appData.units.log.length) {
        const n = await UnitsLogCollectionService.migrateFromArray(appData.units.log);
        console.log(`[Migration] unitsLog: تم ترحيل ${n} سجل من المستند الرئيسي`);
      }
      await MigrationRegistry.markMigrated('unitsLog');
    } catch (e) { console.warn('ترحيل unitsLog:', e); }
  }
  // ترحيل لمرة واحدة فقط طوال عمر النظام: نقل contracts.log القديم من المستند
  // الرئيسي إلى Collection مستقلة (contractsLog)، بنفس أسلوب ترحيل vacLog/unitsLog.
  // ملاحظة: ترحيل contracts.agreements نفسه يحدث تلقائيًا داخل
  // ContractAgreementsRepository.init() أعلاه (نفس آلية VacantRepository).
  if (typeof ContractsLogCollectionService !== 'undefined' && typeof MigrationRegistry !== 'undefined') {
    try {
      const alreadyMigrated = await MigrationRegistry.isMigrated('contractsLog');
      if (!alreadyMigrated && appData.contracts && appData.contracts.log && appData.contracts.log.length) {
        const n = await ContractsLogCollectionService.migrateFromArray(appData.contracts.log);
        console.log(`[Migration] contractsLog: تم ترحيل ${n} سجل من المستند الرئيسي`);
      }
      await MigrationRegistry.markMigrated('contractsLog');
    } catch (e) { console.warn('ترحيل contractsLog:', e); }
  }
  await seedDefaultAdmin();
  overlay.style.display = 'none';
  let savedId = null;
  try { savedId = localStorage.getItem('awda_session_user_id'); } catch(e) {}
  const savedUser = savedId ? appData.users.list.find(u => u.id === savedId && u.status === 'active') : null;
  if (savedUser) {
    currentUser = savedUser;
    document.getElementById('app').style.visibility = '';
    applyUserPermissions();
    goToLandingPage();
    try { history.pushState({ appPage: currentPage || 'dashboard' }, '', location.href); } catch (e) {}
    startMotivationSchedule();
    startPresenceHeartbeat();
    if (window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID')) {
      const _tid = window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID');
      console.log('[TRACE-BOOT 3] قبل startLiveSync() مباشرة | موجود في contracts.log؟',
        (appData.contracts?.log || []).some(l => l.id === _tid),
        '| Tombstone موجود؟', !!(appData.deleted?.logEntries?.contracts?.[_tid]));
    }
    startLiveSync();
  } else {
    try { localStorage.removeItem('awda_session_user_id'); } catch(e) {}
    showLoginGate();
  }
}
boot();
// ===== التنقل التنازلي بزر رجوع المتصفح داخل صفحات البرنامج =====
window.addEventListener('popstate', function (e) {
  if (e.state && e.state.appPage) {
    showPage(e.state.appPage, true, true);
  }
});
// يصفّر overflow المطبّق يدوياً على body (عند فتح القائمة الجانبية على الجوال)
// قبل بدء الطباعة مباشرة، حتى لا يقتصّ المتصفح المحتوى غير الظاهر على الشاشة.
window.addEventListener('beforeprint', () => {
  document.body.style.overflow = '';
});
// لا حاجة لأي معالجة يدوية هنا بعد الآن — الاشتراك اللحظي بـ Firestore
// (onSnapshot عبر startLiveSync) يستأنف تلقائيًا فور عودة الاتصال أو ظهور التبويب.
window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});
// ===== منع الوصول إلى عرض المصدر وأدوات المطوّر =====
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  const k = e.key ? e.key.toLowerCase() : '';
  if (
    k === 'f12' ||
    (e.ctrlKey && k === 'u') ||
    (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
    (e.metaKey && e.altKey && (k === 'i' || k === 'j' || k === 'c'))
  ) {
    e.preventDefault();
  }
});
function addMobileScrollBar(el) {
  if (el.dataset.hasScrollbar) return;
  el.dataset.hasScrollbar = '1';
  const track = document.createElement('div');
  track.className = 'custom-scroll-track';
  const thumb = document.createElement('div');
  thumb.className = 'custom-scroll-thumb';
  track.appendChild(thumb);
  el.insertAdjacentElement('afterend', track);
  function update() {
    if (el.scrollWidth <= el.clientWidth + 5) { track.style.display = 'none'; return; }
    track.style.display = 'block';
    const ratio = el.clientWidth / el.scrollWidth;
    thumb.style.width = (ratio * 100) + '%';
    const maxScroll = el.scrollWidth - el.clientWidth;
    const scrolled = maxScroll > 0 ? el.scrollLeft / maxScroll : 0;
    thumb.style.right = (scrolled * (100 - ratio * 100)) + '%';
  }
  el.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  update();
}
function initMobileScrollBars() {
  if (window.innerWidth > 900) return;
  document.querySelectorAll('.table-wrapper').forEach(addMobileScrollBar);
}
setInterval(initMobileScrollBars, 1000);
initMobileScrollBars();
