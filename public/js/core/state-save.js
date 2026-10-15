// ============================================================
// ===== APP STATE =====
// ============================================================
let appData = { agents: [] }; // سيُستبدل فعليًا بعد تحميل البيانات من الخادم عبر boot()
let lastLoadedSnapshot = null; // نسخة من آخر بيانات معروفة من الخادم، تُستخدم للدمج الآمن عند الحفظ
let settings = StorageService.loadSettings();
let currentPage = 'dashboard';
let darkMode = settings.darkMode || false;
let chartRent = null, chartCommission = null;
let contractRowCount = 0;

// ============================================================
// ===== UNIQUE ID =====
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// ===== دمج آمن قبل الحفظ (لمنع أن يمحو حفظ مستخدم تعديلات مستخدم آخر) =====
// ============================================================
// يدمج مصفوفة عناصر لها id: يحتفظ بعناصر الخادم غير الموجودة محليًا (أضافها مستخدم آخر)،
// ويحتفظ بعناصر النسخة المحلية (تعديلاتنا الحالية)، ويفضّل الأحدث زمنيًا عند تعارض نفس id
// deletedIds: مجموعة معرّفات محذوفة بشكل دائم (Tombstones) — مصدرها الوحيد
// هو appData.deleted[section]، وليس المقارنة مع نسخة محلية سابقة، لذلك لا يمكن
// لأي دمج (سواء من نفس المستخدم أو مستخدم آخر) أن "يُحيي" عنصرًا محذوفًا.
function upsertById(freshArr, localArr, deletedIds) {
  freshArr = Array.isArray(freshArr) ? freshArr : [];
  localArr = Array.isArray(localArr) ? localArr : [];
  deletedIds = deletedIds instanceof Set ? deletedIds : new Set();
  const byId = new Map();
  freshArr.forEach(item => { if (item && item.id != null) byId.set(item.id, item); });
  localArr.forEach(item => {
    if (!item || item.id == null) return;
    const existing = byId.get(item.id);
    if (!existing) { byId.set(item.id, item); return; }
    const tExisting = Date.parse(existing.updatedAt || existing.date || 0) || 0;
    const tLocal = Date.parse(item.updatedAt || item.date || 0) || 0;
    byId.set(item.id, tLocal >= tExisting ? item : existing);
  });
  // نحافظ على ترتيب العناصر: عناصر الخادم أولًا كما هي، ثم أي عناصر جديدة أضفناها محليًا فقط
  const freshIds = new Set(freshArr.map(i => i && i.id));
  const merged = freshArr.map(i => byId.get(i.id)).filter(i => i && !deletedIds.has(String(i.id)));
  localArr.forEach(item => {
    if (item && item.id != null && !freshIds.has(item.id) && !deletedIds.has(String(item.id))) merged.push(byId.get(item.id));
  });
  return merged;
}
// ============================================================
// ===== نظام الحذف الدائم (Tombstones) — أُعيد كطبقة أمان مؤقتة =====
// ============================================================
// أُعيدت عمدًا بعد أن كانت قد أُزيلت، بناءً على قرار: لا تُحذف هذه الطبقة
// نهائيًا إلا بعد تأكيد نجاح اختبار كل الأقسام الستة على Firebase حقيقي بين
// جهازين. تعمل الآن كخط دفاع إضافي (Defense in Depth) فوق الحذف الحقيقي في
// كل Collection، وتحديدًا لحماية المسار الاحتياطي (fallback على appData في
// الذاكرة) إذا تعذّر الاتصال بـ Firestore عند الإقلاع.
const DELETE_SECTIONS = ['agents', 'contracts', 'units', 'employees', 'maintenance', 'collections', 'vacant', 'vacantLocations'];
// أقسام سجلات الأحداث (logs) المُعرّضة لمشكلة "إحياء السجل المحذوف": كل قسم
// منها يُدمج عبر mergeLogArrays (اتحاد fresh+local)، وهذا الاتحاد وحده لا
// يعرف أن عنصرًا حُذف محليًا، فيعيده من نسخة الخادم (fresh) في كل save() تالٍ.
// LOG_TOMBSTONE_SECTIONS يحل هذا عبر تسجيل "شاهد قبر" (tombstone) لكل عنصر
// سجل يُحذف، بحيث يُستبعد نهائيًا من نتيجة الدمج حتى لو ظهر في fresh.
const LOG_TOMBSTONE_SECTIONS = ['contracts', 'units', 'employees', 'maintenance', 'collection', 'vacant'];
function ensureDeletedStructure(data) {
  data.deleted = data.deleted || {};
  DELETE_SECTIONS.forEach(s => { data.deleted[s] = data.deleted[s] || {}; });
  data.deleted.logEntries = data.deleted.logEntries || {};
  LOG_TOMBSTONE_SECTIONS.forEach(s => { data.deleted.logEntries[s] = data.deleted.logEntries[s] || {}; });
  return data.deleted;
}
function markDeleted(section, id, reason) {
  if (id == null) return;
  ensureDeletedStructure(appData);
  appData.deleted[section][id] = { deletedAt: Date.now(), deletedBy: (currentUser && currentUser.username) || 'unknown', reason: reason || 'manual' };
}
// تسجيل حذف عنصر واحد من سجل أحداث (log) — يجب استدعاؤها قبل حذف العنصر محليًا
// وقبل استدعاء save()، وإلا فسيعود العنصر من نسخة الخادم عند أول مزامنة تالية.
function markLogEntryDeleted(section, id) {
  if (id == null) return;
  ensureDeletedStructure(appData);
  if (!appData.deleted.logEntries[section]) appData.deleted.logEntries[section] = {};
  appData.deleted.logEntries[section][id] = { deletedAt: Date.now(), deletedBy: (currentUser && currentUser.username) || 'unknown' };
}
// تسجيل حذف كل عناصر سجل أحداث دفعة واحدة (لعملية "مسح كامل السجل/المسودة")
function markAllLogEntriesDeleted(section, list) {
  (list || []).forEach(item => { if (item && item.id != null) markLogEntryDeleted(section, item.id); });
}
function mergeDeletedSection(freshSection, localSection) {
  return { ...(freshSection || {}), ...(localSection || {}) };
}

// يدمج مصفوفة سجلات (logs) بدون id فريد: اتحاد بدون تكرار مع حد أقصى للطول
// deletedIds (اختياري): Set بمعرّفات العناصر المحذوفة فعليًا (tombstones)، تُستبعد
// نهائيًا من النتيجة حتى لو كانت لا تزال موجودة في fresh (نسخة الخادم القديمة).
function mergeLogArrays(freshArr, localArr, maxLen, deletedIds) {
  freshArr = Array.isArray(freshArr) ? freshArr : [];
  localArr = Array.isArray(localArr) ? localArr : [];
  const byId = new Map();
  [...localArr, ...freshArr].forEach(entry => {
    if (!entry || entry.id == null) return; // سجل بلا id فريد لا يمكن الوثوق بدمجه، يُتجاهل
    if (!byId.has(entry.id)) byId.set(entry.id, entry); // أول ظهور لنفس id يُعتمد (Idempotent)
  });
  // ترتيب النتيجة زمنيًا (tsNum) وليس بترتيب الدمج، حتى يبقى العرض صحيحًا
  // بعد أي دورة sync متعددة الأجهزة. السجلات القديمة بلا tsNum تُعامل كأقدم قيمة.
  let merged = [...byId.values()].sort((a, b) => (a.tsNum || 0) - (b.tsNum || 0));
  if (deletedIds && deletedIds.size) merged = merged.filter(e => !deletedIds.has(String(e.id)));
  if (maxLen && merged.length > maxLen) merged.splice(0, merged.length - maxLen); // إسقاط الأقدم عند تجاوز الحد، وليس الأحدث
  return merged;
}
// يدمج appData بالكامل: يبدأ من أحدث نسخة على الخادم (fresh) ويضيف عليها تعديلاتنا المحلية (local)
function mergeAppData(fresh, local) {
  fresh = (fresh && typeof fresh === 'object') ? fresh : {};
  local = (local && typeof local === 'object') ? local : {};
  const merged = JSON.parse(JSON.stringify(fresh));
  // ============================================================
  // دمج التومبستون (appData.deleted) — كان يُفقد سابقًا لأن merged تُبنى من
  // نسخة fresh فقط ولا يُعاد تعيين merged.deleted من local أبدًا، فأي عنصر
  // محذوف يُسجَّل محليًا عبر markDeleted() خلال نفس دورة الحفظ هذه كان يُفقد
  // فور اكتمال الدمج، مما يجعل نظام التومبستون بلا أثر فعلي على الإطلاق.
  ensureDeletedStructure(fresh); ensureDeletedStructure(local);
  merged.deleted = {};
  DELETE_SECTIONS.forEach(s => { merged.deleted[s] = mergeDeletedSection(fresh.deleted[s], local.deleted[s]); });
  merged.deleted.logEntries = {};
  const logDeletedIds = {};
  LOG_TOMBSTONE_SECTIONS.forEach(s => {
    merged.deleted.logEntries[s] = mergeDeletedSection(fresh.deleted.logEntries[s], local.deleted.logEntries[s]);
    logDeletedIds[s] = new Set(Object.keys(merged.deleted.logEntries[s] || {}));
  });
  const vacLocDeletedIds = new Set(Object.keys(merged.deleted.vacantLocations || {}));
  // ============================================================
  // ملاحظة معمارية مهمة (بعد اكتمال نقل كل الأقسام إلى Firestore Collections):
  // agents, vacant.units, units.records, employees.list, collection.contracts,
  // maintenance.requests/schedules لم تعد جزءًا حقيقيًا من هذا المستند الكبير.
  // كل قسم منها له الآن Collection مستقلة + مزامنة لحظية خاصة به (onSnapshot)
  // تُبقي appData محدَّثًا بشكل مستقل تمامًا عن دورة save/load هذه. لذلك: لا
  // ندمجها مع "fresh" (نسخة قديمة من المستند الكبير قد تحتوي عناصر محذوفة أو
  // قديمة)، بل نمرّرها من "local" كما هي مباشرة، لتفادي "إحياء" بيانات محذوفة
  // فعليًا من الـ Collection عند أي حفظ لقسم آخر لم يُنقل بعد (مثل users).
  // نظام التومبستون (DELETE_SECTIONS/markDeleted) أصبح غير مستخدم لهذه الأقسام
  // تحديدًا؛ الحذف الحقيقي للمستند في الـ Collection هو "التومبستون" نفسه الآن.
  // ============================================================
  merged.agents = local.agents || [];
  {
    const freshVac = fresh.vacant || {};
    const localVac = local.vacant || {};
    merged.vacant = {
      units: localVac.units || [], // لا تُدمج هنا — تأتي من Collection مستقلة (vacants) عبر مزامنتها الخاصة
      locations: upsertById(freshVac.locations, localVac.locations, vacLocDeletedIds),
      cityMemory: [...new Set([...(localVac.cityMemory||[]), ...(freshVac.cityMemory||[])])].slice(0, 30),
      propertyMemory: [...new Set([...(localVac.propertyMemory||[]), ...(freshVac.propertyMemory||[])])].slice(0, 30),
      log: localVac.log || [], // لا يُدمج من fresh — يأتي حصريًا من Collection مستقلة (vacLog) عبر اشتراكها اللحظي الخاص، تمامًا مثل units أعلاه
      draft: localVac.draft || freshVac.draft || ''
    };
  }
  // ملاحظة أداء مهمة (يحل مشكلة بطء التحميل/الحفظ عند تحديث الصفحة):
  // سجل أحداث الوحدات (units.log) انتقل فعليًا إلى Collection مستقلة
  // (UnitsLogCollectionService) منذ الترحيل، ويصل لكل الأجهزة عبر اشتراك حي
  // منفصل (onRealtimeUpdate) — النسخة المخزّنة هنا داخل المستند الرئيسي لم
  // تعد تُقرأ أبدًا لأي غرض عرض فعلي، لكنها ظلت تُدمج وتُكتب بالكامل (حتى
  // 500 سجل، ما يقارب 500-700KB) في كل عملية save() واحدة بلا أي فائدة —
  // وهذا كان السبب الأكبر في تضخّم حجم المستند وبطء كل من التحميل عند فتح/
  // تحديث الصفحة (StorageService.load) وكل عملية حفظ لاحقة. بما أن العرض لا
  // يعتمد عليها إطلاقًا بعد الترحيل، تُترك فارغة هنا لتفريغ المستند الرئيسي
  // من هذا التكرار الميت نهائيًا.
  const unitsLogMigrated = typeof UnitsLogCollectionService !== 'undefined';
  merged.units = { records: (local.units||{}).records || [], log: unitsLogMigrated ? [] : mergeLogArrays((fresh.units||{}).log, (local.units||{}).log, 500, logDeletedIds.units) };
    // ✅ الإصلاح الجذري: بعد نقل اتفاقيات العقود وسجل مسودتها إلى Collections
  // مستقلة (contractAgreements و contractsLog)، لم يعودا يُكتبان في حقل
  // "contracts" داخل هذا المستند الرئيسي أبدًا — فتبقى "fresh.contracts" هنا
  // صورة قديمة مجمّدة منذ لحظة الترحيل، لا تتحدّث أبدًا من مصدرها الحقيقي.
  // الدمج القديم (upsertById/mergeLogArrays) كان يُعيد "إحياء" هذه الصورة
  // المجمّدة فوق appData.contracts الصحيحة —القادمة فعليًا من onSnapshot
  // الخاصة بالـ Collection— في كل save() لأي قسم آخر غير متعلق بالعقود
  // إطلاقًا، مما يُظهر التكرار القديم من جهة، ويُعيد حالة "غير موثقة" فوق أي
  // توثيق جديد من جهة أخرى. الحل هو نفسه المطبَّق فعليًا مع
  // agents/vacant.units/units.records/employees.list/maintenance أعلاه:
  // تمرير "local" كما هي مباشرة بلا أي دمج مع "fresh"، لأن Collection
  // المستقلة نفسها هي مصدر الحقيقة الوحيد الآن.
  merged.contracts = {
    agreements: (local.contracts || {}).agreements || [],
    log: (local.contracts || {}).log || []
  };
  merged.employees = { list: (local.employees||{}).list || [], log: mergeLogArrays((fresh.employees||{}).log, (local.employees||{}).log, 500, logDeletedIds.employees) };
  {
    const __tid = window.__TRACE_CONTRACT_ID;
    if (__tid) {
      console.log('[TRACE 4] mergeAppData — freshContracts للعقد:', JSON.parse(JSON.stringify(__traceFindContract((fresh.collection||{}).contracts, __tid) || null)));
      console.log('[TRACE 4] mergeAppData — localContracts للعقد:', JSON.parse(JSON.stringify(__traceFindContract((local.collection||{}).contracts, __tid) || null)));
    }
    merged.collection = { contracts: (local.collection||{}).contracts || [], log: mergeLogArrays((fresh.collection||{}).log, (local.collection||{}).log, 500, logDeletedIds.collection) };
    if (__tid) console.log('[TRACE 4] mergeAppData — mergedContracts للعقد (بعد الدمج):', JSON.parse(JSON.stringify(__traceFindContract(merged.collection.contracts, __tid) || null)));
  }
  // ملاحظة حرجة (إصلاح): sheetRequests كانت مفقودة من هذا البناء اليدوي —
  // أي استدعاء save() في أي قسم من التطبيق (وليس الصيانة فقط) كان يُعيد
  // appData بالكامل بلا sheetRequests، فتُصفَّر لاحقًا عبر ensureMaintenanceData()
  // رغم وجود 36+ سجلًا فعليًا في Firestore. مصدرها الحقيقي هو Collection مستقلة
  // (نفس requests/schedules)، لذلك نأخذها من "local" (النسخة الحية المحدَّثة
  // عبر onRealtimeUpdate الخاص بها) تمامًا كما نفعل مع requests/schedules.
  // ملاحظة إصلاح: logBook (دفتر سجل الصيانة القديم) و jobsLog (سجل الصيانة
  // الحالي: قائمة الوظائف) لا يملكان Collection مستقلة خاصة بهما (على عكس
  // requests/schedules)، بل يعيشان فقط داخل هذا المستند الرئيسي. لذلك يجب
  // أخذهما من "local" (النسخة الحية في appData بعد أي إضافة عبر
  // MaintenanceRepository) وليس إسقاطهما بعدم ذكرهما هنا إطلاقًا — وإلا فكل
  // save() لأي قسم آخر كان يعيد بناء appData.maintenance بالكامل بلا هذين
  // الحقلين فتختفي البيانات فور أي حفظ.
  merged.maintenance = {
    requests: (local.maintenance||{}).requests || [],
    schedules: (local.maintenance||{}).schedules || [],
    sheetRequests: (local.maintenance||{}).sheetRequests || [],
    log: mergeLogArrays((fresh.maintenance||{}).log, (local.maintenance||{}).log, 500, logDeletedIds.maintenance),
    assigneeMemory: [...new Set([...(fresh.maintenance||{}).assigneeMemory||[], ...(local.maintenance||{}).assigneeMemory||[]])],
    logBook: (local.maintenance||{}).logBook || (fresh.maintenance||{}).logBook || [],
    jobsLog: (local.maintenance||{}).jobsLog || (fresh.maintenance||{}).jobsLog || []
  };
  // ✅ نفس إصلاح contracts/vacant/agents أعلاه: بعد نقل المستخدمين إلى Collection
  // مستقلة (users)، هي مصدر الحقيقة الوحيد الآن. "local.users.list" هنا هو
  // النسخة الحية المحدَّثة عبر UsersRepository.onRealtimeUpdate — دمجها مع
  // "fresh.users.list" (صورة قديمة مجمّدة من المستند الرئيسي) كان يُعيد
  // "إحياء" مستخدمين محذوفين أو بيانات قديمة في كل save() لأي قسم آخر غير
  // متعلق بالمستخدمين إطلاقًا. لم تعد _deletedIds لازمة لأن الحذف الآن حذف
  // حقيقي في Firestore عبر UsersRepository.remove().
  merged.users = {
    list: (local.users || {}).list || [],
    online: (fresh.users || {}).online || (local.users || {}).online || {}
  };
  return merged;
}

// ============================================================
// ===== SAVE =====
// ============================================================
// ملاحظة حرجة حول تسلسل الحفظ (Save Queue):
// سابقًا كان بالإمكان إطلاق أكثر من save() في نفس اللحظة (مثلاً حذف عنصرين
// بسرعة متتالية، أو نقرتان على زر الحفظ). كل نداء save() يحمّل نسخة "fresh"
// من الخادم، يدمجها، ثم يكتب. لو نداءان يعملان في نفس الوقت، فآخر نداء
// "يكتب" هو من يفوز بغض النظر عن ترتيب البدء — مما قد "يُرجع" حذفًا حصل في
// النداء الآخر أو يفقد تعديلاً. الحل: طابور تنفيذ (queue) يضمن أن كل save()
// ينتظر اكتمال السابق قبل أن يبدأ فعليًا، فيرى دائمًا أحدث appData صحيحة.
// ============================================================
// ===== طابور الحفظ المُدمَج (Coalescing Save Queue) =====
// ============================================================
// المشكلة السابقة: كل نداء save() كان يُضاف كحلقة مستقلة في سلسلة Promise
// (__saveQueue.then(run, run))، فإذا حدثت مثلاً 5 تعديلات متتالية سريعة، كانت
// تُنفَّذ 5 رحلات كاملة ومنفصلة (load من Firebase → merge → write) واحدة تلو
// الأخرى بالتسلسل — كل رحلة تُعيد تحميل المستند كاملًا (~750KB) حتى لو لم
// يتغيّر شيء خارجيًا، مما يجعل الانتظار الكلي يتضاعف مع كل تعديل إضافي بدل أن
// يبقى ثابتًا.
// الحل: بدل تنفيذ رحلة منفصلة لكل نداء save()، تُجمَّع كل النداءات التي تصل
// أثناء تنفيذ رحلة حالية في "دفعة معلّقة" واحدة (__savePendingResolvers)، وما
// إن تنتهي الرحلة الجارية، تُنفَّذ رحلة واحدة إضافية فقط (لا أكثر) تلتقط آخر
// حالة لـ appData (وتشمل كل التعديلات التي تراكمت أثناء الانتظار)، ثم تُحل كل
// الـ Promises المعلّقة لتلك الدفعة معًا. بهذا: أي عدد من التعديلات المتتالية
// أثناء انتظار رحلة حفظ واحدة لا يُنتج أكثر من رحلة إضافية واحدة بعدها — بدل
// رحلة منفصلة لكل تعديل. هذا لا يزيل خطوة "تحميل fresh + merge" (وهي ضرورية
// لعدم فقدان تعديلات مستخدمين/أجهزة أخرى تعمل بالتوازي)، بل يمنع فقط تكرارها
// بلا داعٍ لكل نداء متتالٍ.
let __saveInFlight = false;
let __savePendingResolvers = [];
function __runSaveLoop() {
  if (__saveInFlight) return; // توجد رحلة حفظ قيد التنفيذ بالفعل — ستلتقط هذا النداء تلقائيًا في الجولة التالية
  __saveInFlight = true;
  (async () => {
    while (__savePendingResolvers.length) {
      const batch = __savePendingResolvers;
      __savePendingResolvers = [];
      try {
        await _executeSave();
        batch.forEach(r => r.resolve());
      } catch (e) {
        batch.forEach(r => r.reject(e));
      }
    }
    __saveInFlight = false;
  })();
}
function save() {
  const __ltid = window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID') || null;
  if (__ltid) {
    console.log('%c[TRACE-SAVE-CALL]', 'color:#b45309;font-weight:bold',
      'استُدعيت save() | وقت =', new Date().toISOString(),
      '| هل ' + __ltid + ' موجود حاليًا في appData.contracts.log؟ =', (appData.contracts?.log || []).some(l => l.id === __ltid),
      '\nStack:', new Error().stack);
  }
  return new Promise((resolve, reject) => {
    __savePendingResolvers.push({ resolve, reject });
    __runSaveLoop();
  });
}
async function _executeSave() {
  appData.agents.forEach(a => a.updatedAt = new Date().toISOString());
  savePending++;
  const localSnapshot = JSON.parse(JSON.stringify(appData));
  console.log('[SAVE] 1) بدء save()، units.log محليًا =', localSnapshot.units && localSnapshot.units.log.length);
  try {
    const fresh = await StorageService.load();
    console.log('[SAVE] 2) تم تحميل fresh من Firebase، units.log =', fresh.units && fresh.units.log && fresh.units.log.length);
    const merged = mergeAppData(fresh, localSnapshot);
    // تشخيص تفصيلي لحجم كل قسم على حدة — أُضيف بعد ملاحظة أن حجم المستند
    // ظل كبيرًا (~500KB) حتى بعد تفريغ units.log، لتحديد المصدر الفعلي
    // المتبقي للحجم بدقة بدل التخمين، ولتتبع أي نمو غير متوقع مستقبلًا.
    if (typeof window !== 'undefined' && window.__saveSizeDebug !== false) {
      const sizeKB = obj => Math.round((JSON.stringify(obj || {}).length) / 1024);
      console.log('[SAVE] 3.1) تفصيل الحجم لكل قسم (KB):', {
        agents: sizeKB(merged.agents), users: sizeKB(merged.users),
        contracts_agreements: sizeKB(merged.contracts?.agreements), contracts_log: sizeKB(merged.contracts?.log),
        units_records: sizeKB(merged.units?.records), units_log: sizeKB(merged.units?.log),
        employees_list: sizeKB(merged.employees?.list), employees_log: sizeKB(merged.employees?.log),
        maintenance: sizeKB(merged.maintenance), collection: sizeKB(merged.collection),
        vacant: sizeKB(merged.vacant), deleted: sizeKB(merged.deleted),
        deleted_logEntries: sizeKB(merged.deleted?.logEntries)
      });
    }
    console.log('[SAVE] 3) تم الدمج، units.log الناتج =', merged.units && merged.units.log.length, 'حجم JSON تقريبي (KB) =', Math.round(JSON.stringify(merged).length/1024));
    await StorageService.save(merged);
    console.log('[SAVE] 4) تمت الكتابة بنجاح على Firebase ✅');
    appData = merged;
  } catch (e) {
    console.error('[SAVE] ❌ توقفت العملية بخطأ:', e.code || '', e.message || e);
    showToast('تعذر الاتصال بقاعدة البيانات — تأكد من الإنترنت وأعد المحاولة', 'error');
    // لا نستبدل appData بالكامل هنا — هذا كان يمحو أي تعديل محلي غير محفوظ
    // (مثل سجل units.log الذي أضافه logUnits توًا) حتى لو كان سبب الفشل
    // مؤقتًا (انقطاع شبكة). التعديل المحلي يبقى في appData وسيُعاد إرساله
    // في محاولة save() التالية بدون أي فقد.
    savePending--;
    throw e;
  }
  savePending--;
  lastLoadedSnapshot = JSON.parse(JSON.stringify(appData));
}

