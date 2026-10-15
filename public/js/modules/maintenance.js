// ============================================================
// ===== MaintenanceRepository: مبني على BaseRepository =====
// ============================================================
const MaintenanceRepository = {
  _unsub: null,
  _usingCollection: (typeof MaintenanceCollectionService !== 'undefined'),
  // يصبح true فقط بعد نجاح أول تحميل فعلي من Firestore (getAll). يُستخدم
  // لمنع تشغيل المزامنة اليدوية للنموذج قبل أن تصبح appData.maintenance.sheetRequests
  // محدّثة فعلاً — منعًا لتكرار كتابة عناصر موجودة مسبقًا (راجع تعليق addSheetRequests).
  dataReady: false,
  ensure() { ensureMaintenanceData(); },
  // يُستدعى مرة واحدة من boot(): يرحّل بيانات المستند القديم فقط إذا لم يسبق
  // الترحيل (عبر MigrationRegistry الموثوق، وليس فحص "هل فارغة؟" الهش الذي قد
  // يُخطئ فيُعيد ترحيل بيانات محذوفة عمدًا إذا أصبحت الـ Collection فارغة طبيعيًا).
  async init() {
    this.ensure();
    if (!this._usingCollection) return; // بيئة اختبار محلية بدون Firebase — يبقى العمل على appData كما كان
    try {
      const alreadyMigrated = (typeof MigrationRegistry !== 'undefined') ? await MigrationRegistry.isMigrated('maintenance') : false;
      if (!alreadyMigrated) {
        const mainDocHasData = appData.maintenance.requests.length > 0 || appData.maintenance.schedules.length > 0;
        if (mainDocHasData) {
          const n = await MaintenanceCollectionService.migrateFromMainDoc(appData.maintenance);
          console.log(`[Migration] تم ترحيل ${n} سجل صيانة من المستند الرئيسي إلى Collection مستقلة`);
        }
        if (typeof MigrationRegistry !== 'undefined') await MigrationRegistry.markMigrated('maintenance');
      }
      const remote = await MaintenanceCollectionService.getAll();
      appData.maintenance.requests = remote.requests;
      appData.maintenance.schedules = remote.schedules;
      appData.maintenance.sheetRequests = remote.sheetRequests || [];
      this.dataReady = true; // أول تحميل فعلي اكتمل بنجاح
    } catch (e) {
      console.error('تعذر الاتصال بـ maintenance Collection عند الإقلاع، سيُعاد استخدامه لاحقًا تلقائيًا:', e);
      this._usingCollection = false;
      if (typeof showToast === 'function') {
        showToast('تعذر تحميل طلبات الصيانة من الخادم — تحقق من الاتصال ثم أعد تحميل الصفحة', 'error');
      }
      return;
    }
    if (this._unsub) this._unsub();
    this._unsub = MaintenanceCollectionService.onRealtimeUpdate(({ requests, schedules, sheetRequests }) => {
      appData.maintenance.requests = requests;
      appData.maintenance.schedules = schedules;
      appData.maintenance.sheetRequests = sheetRequests || [];
      this.dataReady = true;
      if (document.getElementById('maintTrackContent')) renderMaintTrack();
      if (document.getElementById('maintScheduleContent')) renderMaintSchedule();
      if (document.getElementById('maintSheetReqContent')) renderMaintSheetRequests();
    });
    // مزامنة فورية عند الإقلاع لجلب أي بلاغات جديدة من نموذج جوجل
    syncMaintSheetRequests()
      .then(() => backfillMaintSheetReqNumbers())
      .catch(e => console.warn('مزامنة طلبات نموذج الصيانة عند الإقلاع:', e));
  },
  async getRequests() { this.ensure(); return appData.maintenance.requests; },
  async getSchedules() { this.ensure(); return appData.maintenance.schedules; },
  async getLog() { this.ensure(); return appData.maintenance.log; },
  async getAssigneeMemory() { this.ensure(); return appData.maintenance.assigneeMemory; },
  async addRequest(req) {
    this.ensure();
    if (this._usingCollection) {
      const saved = await MaintenanceCollectionService.addRequest(req);
      appData.maintenance.requests.push(saved);
      return saved;
    }
    appData.maintenance.requests.push(req); await save(); return req; // احتياطي بدون Firebase
  },
  async updateRequest(id, changes) {
    this.ensure();
    const item = appData.maintenance.requests.find(x => x.id === id);
    if (!item) return null;
    Object.assign(item, changes, { updatedAt: new Date().toISOString() });
    if (this._usingCollection) await MaintenanceCollectionService.update(id, changes);
    else await save();
    return item;
  },
  async deleteRequest(id) {
    this.ensure();
    markDeleted('maintenance', id, 'manual'); // طبقة أمان مؤقتة إضافية
    if (this._usingCollection) await MaintenanceCollectionService.remove(id);
    appData.maintenance.requests = appData.maintenance.requests.filter(x => x.id !== id);
    if (!this._usingCollection) await save();
  },
  async addSchedule(sch) {
    this.ensure();
    if (this._usingCollection) {
      const saved = await MaintenanceCollectionService.addSchedule(sch);
      appData.maintenance.schedules.push(saved);
      return saved;
    }
    appData.maintenance.schedules.push(sch); await save(); return sch;
  },
  async updateSchedule(id, changes) {
    this.ensure();
    const item = appData.maintenance.schedules.find(x => x.id === id);
    if (!item) return null;
    Object.assign(item, changes, { updatedAt: new Date().toISOString() });
    if (this._usingCollection) await MaintenanceCollectionService.update(id, changes);
    else await save();
    return item;
  },
  async deleteSchedule(id) {
    this.ensure();
    markDeleted('maintenance', id, 'manual'); // طبقة أمان مؤقتة إضافية
    if (this._usingCollection) await MaintenanceCollectionService.remove(id);
    appData.maintenance.schedules = appData.maintenance.schedules.filter(x => x.id !== id);
    if (!this._usingCollection) await save();
  },
  // ملاحظة: log وassigneeMemory ما زالا يعيشان داخل المستند الرئيسي مؤقتًا
  // (ليسا كيانات CRUD أساسية) — يُعادان النظر فيهما عند اكتمال بقية الأقسام.
  rememberAssignee(name) {
    if (!name) return;
    this.ensure();
    if (!appData.maintenance.assigneeMemory.includes(name)) appData.maintenance.assigneeMemory.unshift(name);
    if (appData.maintenance.assigneeMemory.length > 50) appData.maintenance.assigneeMemory.pop();
  },
  addLog(entry) {
    this.ensure();
    appData.maintenance.log.push(entry);
    if (appData.maintenance.log.length > 300) appData.maintenance.log.shift();
    // ✅ إصلاح: كانت addLog تكتفي بإضافة السجل محلياً في appData دون أي
    // استدعاء لـ save()، فيبقى السجل حبيس المتصفح الحالي فقط ويختفي بعد
    // إعادة التحميل أو لا يظهر إطلاقاً على أي جهاز آخر (لأن باقي عمليات
    // الصيانة addRequest/updateRequest/deleteRequest تتعامل مباشرة مع
    // MaintenanceCollectionService الخاصة بها ولا تستدعي save() العام أبداً
    // عندما تكون الـ Collection مفعّلة، وسجل الأحداث log ليس جزءاً من تلك
    // الـ Collection المستقلة).
    save().catch(e => console.error('[MaintenanceRepository.addLog]', e));
  },
  async clearLog() {
    this.ensure();
    markAllLogEntriesDeleted('maintenance', appData.maintenance.log);
    appData.maintenance.log = [];
    await save();
  },
  // ===== سجل الصيانة: قائمة الوظائف =====
  // ملاحظة أداء: التعديل يُطبَّق على appData فورًا وتُحل الـ Promise فورًا
  // (فيُحدَّث DOM في نفس اللحظة)، بينما save() الفعلية تُجدوَل في الخلفية عبر
  // مؤقّت debounce (mlogScheduleSave) حتى لا تتراكم عدة نداءات save() متزامنة
  // عند تعديلات متتالية سريعة. طابور الحفظ الداخلي في save() نفسها مُدمِج
  // (coalescing) بحيث لا يُنفَّذ أكثر من رحلة إضافية واحدة لأي عدد من
  // النداءات المتراكمة أثناء رحلة جارية.
  addMaintJob(job) { this.ensure(); appData.maintenance.jobsLog.unshift(job); mlogScheduleSave(); return Promise.resolve(job); },
  // الحذف مقيَّد في الواجهة بصلاحية مدير/مشرف فقط (mlogCanDelete)؛ الدالة هنا
  // تنفّذ الحذف الفعلي بعد أن تكون الواجهة قد تحقّقت من الصلاحية.
  deleteMaintJob(id) { this.ensure(); appData.maintenance.jobsLog = appData.maintenance.jobsLog.filter(j => j.id !== id); mlogScheduleSave(); return Promise.resolve(); }
};
// مؤقّت debounce مخصص لحفظ سجل الصيانة: يؤجَّل نداء save() الفعلي قليلًا
// (600ms) في كل مرة يحدث فيها تعديل جديد، فإن حدثت عدة تعديلات متتالية خلال
// هذه المهلة تُدمج كلها في نداء save() واحد فقط بدل نداء منفصل لكل تعديل.
let _mlogSaveTimer = null;
function mlogScheduleSave() {
  if (_mlogSaveTimer) clearTimeout(_mlogSaveTimer);
  _mlogSaveTimer = setTimeout(() => {
    _mlogSaveTimer = null;
    save().catch(e => console.error('[MaintenanceRepository jobsLog save]', e));
  }, 600);
}
function logMaintDraft(action, details, before, after) {
  // ✅ إصلاح: أُضيف حقل user (لم يكن موجوداً إطلاقاً — ولهذا لم يكن يظهر اسم
  // من قام بالإضافة/التعديل/الحذف) وحقل tsNum (ضروري للترتيب الزمني الصحيح
  // عند الدمج مع نسخ أخرى قادمة من أجهزة/مستخدمين مختلفين، تماماً كما في
  // logContracts وباقي أقسام النظام).
  MaintenanceRepository.addLog({
    id: uid(), action, details,
    before: stripHeavyLogFields(before), after: stripHeavyLogFields(after),
    user: currentUser ? currentUser.name : 'غير معروف',
    ts: new Date().toLocaleString('ar-SA'),
    tsNum: Date.now()
  });
}
// ============================================================
// ===== بلاغات نموذج الصيانة (Google Form) =====
// ============================================================
const MAINT_SHEET_ID = '1pem-SsvZUa7w0FfBZN-reI3X3aWAQBW4ky35lNgpRlw';
const MAINT_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${MAINT_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Form Responses 1')}`;
let maintSheetFilter = '';

// محلل CSV بسيط يدعم الحقول المقتبسة (") التي قد تحوي فواصل أو أسطر جديدة —
// ضروري لأن حقل المرفقات وحقل المشكلة كثيراً ما يحويان فواصل داخل النص.
function parseMaintSheetCSV(csvText) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    if (inQuotes) {
      if (c === '"') { if (csvText[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* تجاهل */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
// معرّف ثابت مُشتق من بيانات الصف نفسه (لا يعتمد على رقم الصف) حتى لا يتكرر
// نفس البلاغ عند كل مزامنة، ولا تُفقد حالة "تمت الصيانة"/الملاحظات المحفوظة.
function maintSheetRowHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h = h & h; }
  return 'sheet_' + Math.abs(h).toString(36);
}
async function syncMaintSheetRequests() {
  ensureMaintenanceData();
  // إصلاح مهم: بدون معامل لكسر الكاش، قد يعيد المتصفح نفس النسخة المخزّنة
  // سابقًا من نفس الرابط (لأنه GET بلا تغيير في الـ URL)، فتظهر "لا توجد
  // بلاغات جديدة" رغم وجود بلاغات فعلية حديثة في Google Sheet. الحل: طابع
  // زمني فريد في كل استدعاء + cache: 'no-store' لإجبار جلب نسخة حيّة دائمًا.
  const bustUrl = MAINT_SHEET_CSV_URL + (MAINT_SHEET_CSV_URL.includes('?') ? '&' : '?') + '_ts=' + Date.now();
  const res = await fetch(bustUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const csvText = await res.text();
  const rows = parseMaintSheetCSV(csvText);
  if (rows.length < 2) return 0;
  const dataRows = rows.slice(1); // تجاوز صف العناوين
  const existingIds = new Set(appData.maintenance.sheetRequests.map(r => r.id));
  // رقم البلاغ (reqNum) ثابت ودائم لكل طلب — يُخصَّص مرة واحدة عند وصوله ولا
  // يتغيّر بعدها أبدًا (يُستخدم للتعريف عند العرض/النسخ فقط، ولا علاقة له
  // بشارة الإشعارات ولا بحالة "تمت الصيانة"). نبدأ من أعلى رقم موجود حاليًا.
  let nextReqNum = appData.maintenance.sheetRequests.reduce((m, r) => r.reqNum ? Math.max(m, r.reqNum) : m, 0);
  const newItems = [];
  dataRows.forEach(cols => {
    if (!cols || !cols.some(c => (c || '').trim())) return; // صف فارغ بالكامل
    const [timestamp = '', unit = '', property = '', reporterName = '', phone = '', problem = '', bestTime = '', attach = '', email = ''] = cols;
    if (!timestamp.trim() && !problem.trim()) return;
    const key = `${timestamp}|${unit}|phone:${phone}|${problem}`.trim();
    const id = maintSheetRowHash(key);
    if (existingIds.has(id)) return; // موجود مسبقاً — لا نكرره ولا نلمس done/notes الخاصة به
    nextReqNum += 1;
    newItems.push({
      id, reqNum: nextReqNum, timestamp: timestamp.trim(), unit: unit.trim(), property: property.trim(),
      reporterName: reporterName.trim(), phone: phone.trim(), problem: problem.trim(),
      bestTime: bestTime.trim(), attachments: attach.split(',').map(s => s.trim()).filter(Boolean),
      email: email.trim(), done: false, notes: '', doneAt: null, doneBy: null
    });
  });
  if (!newItems.length) return 0;
  if (typeof MaintenanceCollectionService !== 'undefined' && typeof MaintenanceCollectionService.addSheetRequests === 'function') {
    await MaintenanceCollectionService.addSheetRequests(newItems);
    // ستصل النسخة النهائية محلياً تلقائياً عبر onRealtimeUpdate خلال لحظات
  } else {
    appData.maintenance.sheetRequests.push(...newItems);
    if (document.getElementById('maintSheetReqContent')) renderMaintSheetRequests();
  }
  return newItems.length;
}
function manualSyncMaintSheetRequests() {
  // حماية إضافية على الواجهة: لا تُشغّل المزامنة إذا لم تكتمل بعد أول قراءة
  // فعلية لطلبات الصيانة من Firestore، حتى لا تُرسل بيانات محلية فارغة/ناقصة
  // كأساس للمقارنة (الحماية الحقيقية الآن في addSheetRequests نفسها، وهذه طبقة إضافية فقط).
  if (typeof MaintenanceRepository !== 'undefined' && MaintenanceRepository._usingCollection && !MaintenanceRepository.dataReady) {
    showToast('البيانات لا تزال قيد التحميل من الخادم، حاول بعد لحظات', 'error');
    return;
  }
  syncMaintSheetRequests().then(n => {
    showToast(n > 0 ? `تمت المزامنة — ${n} بلاغ جديد` : 'تمت المزامنة — لا توجد بلاغات جديدة', 'success');
    backfillMaintSheetReqNumbers();
  }).catch(e => {
    console.error('[syncMaintSheetRequests]', e);
    showToast('تعذرت مزامنة بلاغات النموذج — تأكد من الاتصال أو صلاحية مشاركة الشيت', 'error');
  });
}
// يحوّل حقل timestamp النصي القادم من Google Forms (مثل "8/18/2026 10:02:05")
// إلى قيمة زمنية (ms) حقيقية للترتيب، بدل مقارنة النصوص التي تُخطئ الترتيب
// (مثلاً "9/1/2026" تُقارَن نصيًا أكبر من "10/1/2026"). يحاول أولاً Date.parse
// القياسي، ثم صيغة m/d/yyyy h:mm:ss يدويًا كاحتياط، ثم صفر إن تعذّر الكل
// (يظهر في آخر الترتيب التنازلي بدل أن يكسر الفرز).
// يُحدّث شارة العدد على "متابعة الطلبات" (من appData.maintenance.sheetRequests)
// وعلى "سجل الصيانة" (من appData.maintenance.jobsLog) — بلا أي شارة على
// القسم الأب "إدارة الصيانة" (حُذفت بطلب صريح من المستخدم، فلم يعد لها عنصر
// HTML أصلًا). كل شارة تعرض العدد الكلي لقائمتها الخاصة دائمًا ولا تُخفى إلا
// عند صفر عناصر — لا تتأثر بأي حالة "قراءة"/"تمت" لأن العناصر في القائمتين
// (البلاغات وسجل الوظائف) لا تُحذف أبدًا، فالرقم لا يتراجع إلا نادرًا.
// يُستدعى من كل نقطة تتغيّر فيها إحدى القائمتين فعليًا (عرض الصفحة، التحديث
// اللحظي عبر onSnapshot، بعد كل مزامنة يدوية أو تلقائية، وبعد كل إضافة وظيفة).
function updateMaintNotifBadge() {
  const trackList = (appData.maintenance && appData.maintenance.sheetRequests) || [];
  const logList = (appData.maintenance && appData.maintenance.jobsLog) || [];
  [['navBadgeMaintTrack', trackList.length], ['navBadgeMaintLog', logList.length]].forEach(([id, n]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.textContent = n > 99 ? '99+' : String(n); el.style.display = ''; }
    else { el.style.display = 'none'; el.textContent = ''; }
  });
}
// يحوّل حقل timestamp النصي القادم من Google Forms إلى قيمة زمنية (ms) حقيقية
// للترتيب. إصلاح مهم (بعد أمثلة فعلية من الشيت): الترتيب داخل النص غير ثابت —
// أحيانًا "YYYY/MM/DD" فقط بلا وقت، وأحيانًا **الوقت أولًا ثم التاريخ**
// (مثل "5:33:40 م 2026/02/27")، وليس التاريخ أولًا كما كان مفترضًا سابقًا.
// الحل: استخراج جزء التاريخ وجزء الوقت كل على حدة أينما وقعا في النص،
// وتركيبهما معًا بغض النظر عن ترتيب ورودهما.
function parseMaintSheetTimestamp(ts) {
  if (!ts) return 0;
  // تطبيع الأرقام العربية (٠-٩) إلى أرقام إنجليزية لو وُجدت
  const t = String(ts).trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const dateMatch = t.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (dateMatch) {
    const [, yr, mo, da] = dateMatch;
    let hour = 0, minute = 0, second = 0;
    const timeMatch = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([صم])?/);
    if (timeMatch) {
      const [, hh, mi, ss, ap] = timeMatch;
      hour = parseInt(hh, 10);
      minute = parseInt(mi, 10);
      second = ss ? parseInt(ss, 10) : 0;
      if (ap === 'م' && hour !== 12) hour += 12; // مساءً
      if (ap === 'ص' && hour === 12) hour = 0;   // منتصف الليل
    }
    const d = new Date(+yr, +mo - 1, +da, hour, minute, second);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  // احتياط: صيغة m/d/yyyy h:mm:ss (أمريكية) إن وُجدت من مصدر آخر
  const m2 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(:(\d{2}))?/);
  if (m2) {
    const [, mo, da, yr, hh, mi, , ss] = m2;
    const d = new Date(+yr, +mo - 1, +da, +hh, +mi, +(ss || 0));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  // احتياط أخير: أي صيغة يفهمها المتصفح مباشرة (ISO وغيرها)
  const d3 = new Date(t);
  if (!isNaN(d3.getTime())) return d3.getTime();
  return 0;
}
// تعبئة رقم البلاغ (reqNum) للبلاغات القديمة التي أُضيفت قبل وجود هذه الميزة
// (لم يكن لها رقم أصلاً) — تُخصَّص لها أرقام حسب ترتيبها الزمني الفعلي
// (الأقدم يأخذ الرقم الأصغر) مرة واحدة فقط، ثم تُحفَظ في Firestore لتبقى
// ثابتة للأبد بعدها ولا تُعاد حسابتها من جديد.
let _reqNumBackfillDone = false;
async function backfillMaintSheetReqNumbers() {
  if (_reqNumBackfillDone) return;
  const list = appData.maintenance.sheetRequests || [];
  const missing = list.filter(r => !r.reqNum);
  if (!missing.length) { _reqNumBackfillDone = true; return; }
  let maxNum = list.reduce((m, r) => r.reqNum ? Math.max(m, r.reqNum) : m, 0);
  missing.sort((a, b) => parseMaintSheetTimestamp(a.timestamp) - parseMaintSheetTimestamp(b.timestamp));
  const canPersist = typeof MaintenanceCollectionService !== 'undefined' && typeof MaintenanceCollectionService.update === 'function';
  for (const r of missing) {
    maxNum += 1;
    r.reqNum = maxNum; // تحديث محلي فوري حتى يظهر الرقم بلا انتظار
    if (canPersist) {
      try { await MaintenanceCollectionService.update(r.id, { reqNum: r.reqNum }); }
      catch (e) { console.warn('[backfillMaintSheetReqNumbers] تعذّر حفظ رقم البلاغ', r.id, e); }
    }
  }
  _reqNumBackfillDone = true;
  if (document.getElementById('maintSheetReqContent')) renderMaintSheetRequests();
}
function setMaintSheetFilter(v) {
  maintSheetFilter = v;
  ['maintSheetFilterAll', 'maintSheetFilterDone', 'maintSheetFilterPending'].forEach(bid => {
    const btn = document.getElementById(bid);
    if (btn) btn.classList.remove('btn-primary');
  });
  const activeId = v === 'done' ? 'maintSheetFilterDone' : (v === 'pending' ? 'maintSheetFilterPending' : 'maintSheetFilterAll');
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) activeBtn.classList.add('btn-primary');
  renderMaintSheetRequests();
}
function renderMaintSheetRequests() {
  ensureMaintenanceData();
  updateMaintNotifBadge(); // يُحدَّث دائمًا حسب القائمة الكاملة، بصرف النظر عن الفلتر النشط في الشاشة
  const el = document.getElementById('maintSheetReqContent');
  if (!el) return;
  let list = [...appData.maintenance.sheetRequests];
  if (maintSheetFilter === 'done') list = list.filter(r => r.done);
  else if (maintSheetFilter === 'pending') list = list.filter(r => !r.done);
  // ترتيب تنازلي حسب التاريخ/الوقت الفعلي (الأحدث أولًا) — ليس مقارنة نصية.
  list.sort((a, b) => parseMaintSheetTimestamp(b.timestamp) - parseMaintSheetTimestamp(a.timestamp));
  if (!list.length) {
    // فرّق بين "لا تزال البيانات قيد التحميل من الخادم" و "لا توجد بلاغات فعلاً"
    // حتى لا يظهر للمستخدم أن لا شيء موجود بينما هي لم تصل بعد.
    const stillLoading = (typeof MaintenanceRepository !== 'undefined' && MaintenanceRepository._usingCollection && !MaintenanceRepository.dataReady);
    el.innerHTML = stillLoading
      ? '<div class="card"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><h3>جارٍ تحميل البلاغات…</h3><p>يتم تحميل بلاغات الصيانة من الخادم، سيتم العرض تلقائيًا خلال لحظات</p></div></div>'
      : '<div class="card"><div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد بلاغات</h3><p>لا توجد بلاغات صيانة من النموذج مطابقة لهذا الفلتر</p></div></div>';
    return;
  }
  const doneColor = '#7c3aed';
  const canManage = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
  const field = (icon, label, value) => `<div style="display:flex;gap:6px;align-items:flex-start;">
        <div style="font-size:11.5px;color:var(--text-light);min-width:80px;flex-shrink:0;"><i class="${icon}" style="width:14px;"></i> ${label}</div>
        <div style="font-size:12.5px;color:var(--text);font-weight:600;word-break:break-word;">${value || '—'}</div>
      </div>`;
  el.innerHTML = '<div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr));">' + list.map(r => {
    const color = r.done ? doneColor : 'var(--danger)';
    const bg = r.done ? 'rgba(124,58,237,0.07)' : 'rgba(239,68,68,0.07)';
    const attachHtml = (r.attachments || []).length
      ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${r.attachments.map((u, i) => `<a href="${u}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:11px;"><i class="fas fa-paperclip"></i> مرفق ${i + 1}</a>`).join('')}</div>`
      : '';
    return `
    <div class="card" style="margin:0;border-right:5px solid ${color};background:${bg};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge badge-info" style="font-weight:700;">#${r.reqNum || '—'}</span>
          <span class="badge" style="background:${color};color:#fff;">${r.done ? 'تمت الصيانة' : 'لم تتم الصيانة'}</span>
        </div>
        <div style="font-size:11px;color:var(--text-light);white-space:nowrap;"><i class="fas fa-calendar"></i> ${r.timestamp || '—'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;">
        ${field('fas fa-user', 'الاسم', r.reporterName)}
        ${field('fas fa-phone', 'الجوال', r.phone)}
        ${field('fas fa-building', 'العقار', r.property)}
        ${field('fas fa-door-open', 'الوحدة', r.unit)}
        ${field('fas fa-triangle-exclamation', 'المشكلة', r.problem)}
        ${field('fas fa-clock', 'أفضل وقت للتواصل', r.bestTime)}
        ${r.email ? field('fas fa-envelope', 'البريد', r.email) : ''}
      </div>
      ${r.notes ? `<div style="font-size:12px;color:${color};margin-top:10px;background:${bg};border-radius:6px;padding:6px 8px;"><i class="fas fa-sticky-note"></i> ${r.notes}</div>` : ''}
      ${attachHtml}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-outline btn-sm" onclick="showMaintSheetRequestDetails('${r.id}')"><i class="fas fa-eye"></i> عرض البيانات</button>
        ${canManage ? `
            ${r.done
        ? `<button class="btn btn-outline btn-sm" onclick="toggleMaintSheetDone('${r.id}', false)">إلغاء إتمام الصيانة</button>`
        : `<button class="btn btn-sm" style="background:${doneColor};color:#fff;" onclick="toggleMaintSheetDone('${r.id}', true)">تمت الصيانة</button>`}
            <button class="btn btn-outline btn-sm" onclick="addMaintSheetNote('${r.id}')"><i class="fas fa-sticky-note"></i> إضافة ملاحظات</button>
          ` : ''}
      </div>
    </div>`;
  }).join('') + '</div>';
}
// يبني نص البيانات الكاملة للبلاغ بصيغة موحّدة (تُستخدم في العرض والنسخ معًا)
function formatMaintSheetRequestText(r) {
  const lines = [
    `طلب الصيانة رقم ${r.reqNum || '—'}`,
    '——————————————',
    `الاسم: ${r.reporterName || '—'}`,
    `الجوال: ${r.phone || '—'}`,
    `العقار: ${r.property || '—'}`,
    `الوحدة: ${r.unit || '—'}`,
    `المشكلة: ${r.problem || '—'}`,
    `أفضل وقت للتواصل: ${r.bestTime || '—'}`,
  ];
  if (r.email) lines.push(`البريد: ${r.email}`);
  lines.push(`الحالة: ${r.done ? 'تمت الصيانة' : 'لم تتم الصيانة'}`);
  if (r.notes) lines.push(`ملاحظات: ${r.notes}`);
  if ((r.attachments || []).length) lines.push(`المرفقات: ${r.attachments.join(' | ')}`);
  lines.push(`وقت وتاريخ إرسال الطلب: ${r.timestamp || '—'}`);
  return lines.join('\n');
}
// نافذة "عرض البيانات" — تعرض كامل بيانات البلاغ، وفي الأسفل زر "نسخ البيانات"
// الذي ينسخ نفس النص المعروض بالضبط (بما فيه رقم الطلب ووقت/تاريخ الإرسال)
// إلى الحافظة مباشرة.
function showMaintSheetRequestDetails(id) {
  ensureMaintenanceData();
  const r = appData.maintenance.sheetRequests.find(x => x.id === id);
  if (!r) return;
  const text = formatMaintSheetRequestText(r);
  Swal.fire({
    title: `طلب الصيانة رقم ${r.reqNum || '—'}`,
    html: `<pre style="text-align:right;direction:rtl;white-space:pre-wrap;font-family:inherit;font-size:14px;background:#f8f9fa;border-radius:8px;padding:12px;margin:0;">${text.replace(/</g,'&lt;')}</pre>`,
    width: 520,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-copy"></i> نسخ البيانات',
    cancelButtonText: 'إغلاق',
    confirmButtonColor: '#0d2137'
  }).then(res => {
    if (!res.isConfirmed) return;
    const finish = () => showToast('تم نسخ بيانات الطلب', 'success');
    const fail = () => showToast('تعذر النسخ التلقائي — انسخ النص يدويًا من النافذة', 'error');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(finish).catch(fail);
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        finish();
      } catch (e) { fail(); }
    }
  });
}
function toggleMaintSheetDone(id, done) {
  ensureMaintenanceData();
  const r = appData.maintenance.sheetRequests.find(x => x.id === id); if (!r) return;
  const changes = { done, doneAt: done ? new Date().toISOString() : null, doneBy: done ? (currentUser ? currentUser.name : 'غير معروف') : null };
  Object.assign(r, changes);
  renderMaintSheetRequests();
  if (typeof MaintenanceCollectionService !== 'undefined' && typeof MaintenanceCollectionService.update === 'function') {
    MaintenanceCollectionService.update(id, changes).catch(e => {
      console.error('[toggleMaintSheetDone]', e);
      showToast('تعذر حفظ حالة الطلب على الخادم — تأكد من الاتصال', 'error');
    });
  }
  showToast(done ? 'تم تعليم البلاغ كمكتمل' : 'تم إلغاء اكتمال البلاغ', 'success');
}
function addMaintSheetNote(id) {
  ensureMaintenanceData();
  const r = appData.maintenance.sheetRequests.find(x => x.id === id); if (!r) return;
  Swal.fire({
    title: 'ملاحظات البلاغ', input: 'textarea', inputValue: r.notes || '',
    inputPlaceholder: 'اكتب ملاحظاتك هنا...',
    showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137'
  }).then(res => {
    if (!res.isConfirmed) return;
    const notes = (res.value || '').trim();
    r.notes = notes;
    renderMaintSheetRequests();
    if (typeof MaintenanceCollectionService !== 'undefined' && typeof MaintenanceCollectionService.update === 'function') {
      MaintenanceCollectionService.update(id, { notes }).catch(e => {
        console.error('[addMaintSheetNote]', e);
        showToast('تعذر حفظ الملاحظات على الخادم — تأكد من الاتصال', 'error');
      });
    }
    showToast('تم حفظ الملاحظات', 'success');
  });
}
function maintPopulateLists() {
  ensureUnitsData();
  const props = [...new Set(appData.units.records.map(r => r.propertyName).filter(Boolean))];
  const propOptions = '<option value="">-- اختر العقار --</option>' + props.map(p => `<option value="${p}">${p}</option>`).join('');
  const propSel = document.getElementById('maint-property'); if (propSel) { const cur = propSel.value; propSel.innerHTML = propOptions; propSel.value = cur; }
  const msSel = document.getElementById('ms-property'); if (msSel) { const cur = msSel.value; msSel.innerHTML = propOptions; msSel.value = cur; }
  const techList = document.getElementById('maintTechList');
  if (techList) techList.innerHTML = (appData.maintenance.assigneeMemory||[]).map(t => `<option value="${t}">`).join('');
}
function rememberMaintAssignee(name) {
  MaintenanceRepository.rememberAssignee(name);
}
function renderMaintNewPage() {
  ensureMaintenanceData();
  ['maint-title','maint-property','maint-unit','maint-requester','maint-assignee','maint-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('maint-priority').value = 'عادية';
  maintPopulateLists();
}
function addMaintRequest() {
  ensureMaintenanceData();
  const title = document.getElementById('maint-title').value.trim();
  if (!title) { showToast('يرجى إدخال عنوان الطلب', 'error'); return; }
  const req = {
    id: uid(), title,
    property: document.getElementById('maint-property').value.trim(),
    unit: document.getElementById('maint-unit').value.trim(),
    priority: document.getElementById('maint-priority').value,
    requester: document.getElementById('maint-requester').value.trim(),
    assignee: document.getElementById('maint-assignee').value.trim(),
    description: document.getElementById('maint-desc').value.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null
  };
  MaintenanceRepository.addRequest(req);
  rememberMaintAssignee(req.assignee);
  logMaintDraft('add', `تم إنشاء طلب صيانة: ${req.title}`, null, req);
  showToast('تم حفظ طلب الصيانة', 'success');
  renderMaintNewPage();
}
const MAINT_STATUS_LABELS = { pending: 'قيد الانتظار', inprogress: 'قيد التنفيذ', done: 'مكتمل' };
const MAINT_STATUS_BADGE = { pending: 'badge-muted', inprogress: 'badge-info', done: 'badge-success' };
const MAINT_PRIORITY_BADGE = { 'عادية': 'badge-muted', 'عاجلة': 'badge-info', 'طارئة': 'badge-danger' };
function populateMaintFilters() { ensureMaintenanceData(); maintPopulateLists(); }
function renderMaintTrack() {
  ensureMaintenanceData();
  const canDelete = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
  const q = (document.getElementById('maintSearch')?.value || '').trim().toLowerCase();
  const fStatus = document.getElementById('maintFilterStatus')?.value || '';
  const fPriority = document.getElementById('maintFilterPriority')?.value || '';
  let list = appData.maintenance.requests.filter(r => r.status !== 'done').filter(r => {
    if (q && !(`${r.title} ${r.property||''} ${r.unit||''}`.toLowerCase().includes(q))) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (fPriority && r.priority !== fPriority) return false;
    return true;
  });
  const el = document.getElementById('maintTrackContent');
  if (!list.length) {
    el.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-check-circle"></i><h3>لا توجد طلبات مطابقة</h3><p>جميع الطلبات مكتملة أو لا توجد نتائج للبحث</p></div></div>';
    return;
  }
  el.innerHTML = '<div class="card"><div class="table-wrapper"><table><thead><tr><th>العنوان</th><th>العقار / الوحدة</th><th>الأولوية</th><th>المسؤول</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>إجراءات</th></tr></thead><tbody>' +
    // ترتيب تنازلي حسب تاريخ الإنشاء الفعلي (الأحدث أولًا) — .reverse() وحدها
    // كانت تعكس فقط ترتيب وصول المصفوفة من الخادم، وهو ليس بالضرورة مرتبًا
    // زمنيًا (خصوصًا بعد أي تحديث لحظي/دمج)، فيظهر ترتيب غير صحيح أحيانًا.
    [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(r => `
      <tr>
        <td>${r.title}</td>
        <td>${r.property||'—'} ${r.unit ? '/ '+r.unit : ''}</td>
        <td><span class="badge ${MAINT_PRIORITY_BADGE[r.priority]||'badge-muted'}">${r.priority}</span></td>
        <td>${r.assignee||'—'}</td>
        <td><span class="badge ${MAINT_STATUS_BADGE[r.status]}">${MAINT_STATUS_LABELS[r.status]}</span></td>
        <td>${fmtDate(r.createdAt)}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${r.status !== 'inprogress' ? `<button class="btn btn-outline btn-sm" onclick="setMaintStatus('${r.id}','inprogress')">قيد التنفيذ</button>` : ''}
          ${r.status !== 'done' ? `<button class="btn btn-primary btn-sm" onclick="setMaintStatus('${r.id}','done')">إنهاء</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="editMaintRequest('${r.id}')"><i class="fas fa-edit"></i></button>
          ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteMaintRequest('${r.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </div></td>
      </tr>`).join('') + '</tbody></table></div></div>';
}
function setMaintStatus(id, status) {
  const r = appData.maintenance.requests.find(x => x.id === id); if (!r) return;
  const before = JSON.parse(JSON.stringify(r));
  const changes = { status };
  if (status === 'done') changes.completedAt = new Date().toISOString();
  logMaintDraft('edit', `تم تغيير حالة طلب "${r.title}" إلى: ${MAINT_STATUS_LABELS[status]}`, before, r);
  MaintenanceRepository.updateRequest(id, changes);
  showToast('تم تحديث حالة الطلب', 'success');
  renderMaintTrack();
}
function editMaintRequest(id) {
  const r = appData.maintenance.requests.find(x => x.id === id); if (!r) return;
  Swal.fire({
    title: 'تعديل طلب الصيانة', width: 520,
    html: `<div style="text-align:right;display:flex;flex-direction:column;gap:8px;">
      <input id="sw-title" class="swal2-input" style="margin:2px 0;" placeholder="العنوان" value="${r.title||''}">
      <input id="sw-property" class="swal2-input" style="margin:2px 0;" placeholder="العقار" value="${r.property||''}">
      <input id="sw-unit" class="swal2-input" style="margin:2px 0;" placeholder="الوحدة" value="${r.unit||''}">
      <input id="sw-assignee" class="swal2-input" style="margin:2px 0;" placeholder="المسؤول" value="${r.assignee||''}">
      <textarea id="sw-desc" class="swal2-textarea" style="margin:2px 0;" placeholder="الوصف">${r.description||''}</textarea>
    </div>`,
    showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137',
    preConfirm: () => ({
      title: document.getElementById('sw-title').value.trim(),
      property: document.getElementById('sw-property').value.trim(),
      unit: document.getElementById('sw-unit').value.trim(),
      assignee: document.getElementById('sw-assignee').value.trim(),
      description: document.getElementById('sw-desc').value.trim()
    })
  }).then(res => {
    if (res.isConfirmed) {
      const before = JSON.parse(JSON.stringify(r));
      rememberMaintAssignee(res.value.assignee);
      logMaintDraft('edit', `تم تعديل طلب الصيانة: ${r.title}`, before, { ...r, ...res.value });
      MaintenanceRepository.updateRequest(id, res.value);
      showToast('تم التحديث', 'success'); renderMaintTrack();
    }
  });
}
function deleteMaintRequest(id) {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  const r = appData.maintenance.requests.find(x => x.id === id); if (!r) return;
  Swal.fire({ title:'حذف الطلب', text:`هل تريد حذف طلب "${r.title}"؟`, icon:'warning', showCancelButton:true, confirmButtonText:'نعم، احذف', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(res => {
    if (res.isConfirmed) {
      logMaintDraft('delete', `تم حذف طلب الصيانة: ${r.title}`, r, null);
      MaintenanceRepository.deleteRequest(id);
      showToast('تم الحذف', 'success'); renderMaintTrack();
    }
  });
}
function addMaintSchedule() {
  ensureMaintenanceData();
  const title = document.getElementById('ms-title').value.trim();
  const nextDue = document.getElementById('ms-nextDue').value;
  if (!title) { showToast('يرجى إدخال وصف عمل الصيانة', 'error'); return; }
  if (!nextDue) { showToast('يرجى إدخال تاريخ الاستحقاق', 'error'); return; }
  const sch = {
    id: uid(), title, property: document.getElementById('ms-property').value.trim(),
    freq: document.getElementById('ms-freq').value, nextDue,
    notes: document.getElementById('ms-notes').value.trim(),
    createdAt: new Date().toISOString()
  };
  MaintenanceRepository.addSchedule(sch);
  logMaintDraft('add', `تمت إضافة جدول صيانة دورية: ${sch.title}`, null, sch);
  showToast('تم حفظ الجدول', 'success');
  document.getElementById('ms-title').value = ''; document.getElementById('ms-property').value = '';
  document.getElementById('ms-nextDue').value = ''; document.getElementById('ms-notes').value = '';
  renderMaintSchedule();
}
const MAINT_FREQ_LABELS = { monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
function renderMaintSchedule() {
  ensureMaintenanceData(); maintPopulateLists();
  const canDelete = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
  const el = document.getElementById('maintScheduleContent');
  if (!appData.maintenance.schedules.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-xmark"></i><h3>لا توجد جداول صيانة</h3><p>أضف جدولاً دورياً أعلاه</p></div>';
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  el.innerHTML = '<div class="table-wrapper"><table><thead><tr><th>الوصف</th><th>العقار</th><th>التكرار</th><th>تاريخ الاستحقاق القادم</th><th>ملاحظات</th><th>إجراءات</th></tr></thead><tbody>' +
    [...appData.maintenance.schedules].map(s => `
      <tr ${s.nextDue && s.nextDue <= today ? 'style="border-right:4px solid var(--danger);"' : ''}>
        <td>${s.title}</td><td>${s.property||'—'}</td><td>${MAINT_FREQ_LABELS[s.freq]}</td>
        <td>${s.nextDue}${s.nextDue && s.nextDue <= today ? ' <span class="badge badge-danger">مستحق</span>' : ''}</td>
        <td>${s.notes||'—'}</td>
        <td><div style="display:flex;gap:6px;">
          <button class="btn btn-outline btn-sm" onclick="bumpMaintSchedule('${s.id}')" title="تمت — جدولة الموعد التالي"><i class="fas fa-check"></i></button>
          ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteMaintSchedule('${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </div></td>
      </tr>`).join('') + '</tbody></table></div>';
}
function bumpMaintSchedule(id) {
  const s = appData.maintenance.schedules.find(x => x.id === id); if (!s) return;
  const before = JSON.parse(JSON.stringify(s));
  const d = new Date(s.nextDue);
  if (s.freq === 'monthly') d.setMonth(d.getMonth()+1);
  else if (s.freq === 'quarterly') d.setMonth(d.getMonth()+3);
  else d.setFullYear(d.getFullYear()+1);
  const nextDue = d.toISOString().slice(0,10);
  logMaintDraft('edit', `تم تنفيذ الصيانة الدورية "${s.title}" وجدولة الموعد التالي`, before, { ...s, nextDue });
  MaintenanceRepository.updateSchedule(id, { nextDue });
  showToast('تم تحديد الصيانة كمنفذة وجدولة الموعد القادم', 'success');
  renderMaintSchedule();
}
function deleteMaintSchedule(id) {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  const s = appData.maintenance.schedules.find(x => x.id === id); if (!s) return;
  Swal.fire({ title:'حذف الجدول', text:`هل تريد حذف جدول "${s.title}"؟`, icon:'warning', showCancelButton:true, confirmButtonText:'نعم، احذف', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(r => {
    if (r.isConfirmed) {
      logMaintDraft('delete', `تم حذف جدول الصيانة: ${s.title}`, s, null);
      MaintenanceRepository.deleteSchedule(id);
      showToast('تم الحذف', 'success'); renderMaintSchedule();
    }
  });
}
// ============================================================
// ===== سجل الصيانة: قائمة الوظائف (Maintenance Jobs Log) =====
// ============================================================
// ملاحظة: هذا القسم استُبدل بالكامل بناءً على طلب المستخدم — لم يعد دفتر
// عقارات/وحدات/ملاحظات، بل قائمة وظائف بسيطة تُعرض كصفوف ملونة، وفي أقصى
// يسار كل صف يظهر يوم ووقت وتاريخ الإضافة.
// تحديث لاحق (بطلب صريح من المستخدم):
// 1) الإضافة متاحة لكل المستخدمين المصرَّح لهم بالوصول لهذه الصفحة — وليست
//    حكرًا على المدير/المشرف (لا قيد على الإضافة إطلاقًا).
// 2) كل وظيفة تأخذ رقمًا تصاعديًا دائمًا (jobNum) بنفس أسلوب reqNum في
//    "متابعة الطلبات": يُحسب كـ (أكبر رقم موجود حاليًا + 1) عند الإضافة، فلا
//    يتكرر ولا يتراجع أبدًا. وبما أن القائمة تُعرض بترتيب الأحدث أولًا، يظهر
//    الرقم الأكبر دائمًا في أعلى القائمة.
// 3) شارة العدد على "سجل الصيانة" في القائمة الجانبية (navBadgeMaintLog)
//    تُحدَّث مع كل عرض وكل إضافة/حذف عبر updateMaintNotifBadge().
// 4) الحذف الآن متاح — لكن للمدير أو المشرف فقط (mlogCanDelete)، بعكس
//    الإضافة المتاحة للجميع.
const MLOG_PALETTE = [
  'linear-gradient(135deg,#0d2137 0%,#1a3a5c 100%)',
  'linear-gradient(135deg,#0c4a6e 0%,#0ea5e9 100%)',
  'linear-gradient(135deg,#14532d 0%,#22c55e 100%)',
  'linear-gradient(135deg,#78350f 0%,#e8c44a 100%)',
  'linear-gradient(135deg,#7c2d12 0%,#f97316 100%)',
  'linear-gradient(135deg,#4c1d95 0%,#a855f7 100%)',
  'linear-gradient(135deg,#831843 0%,#ec4899 100%)',
  'linear-gradient(135deg,#134e4a 0%,#14b8a6 100%)'
];
function mlogCanDelete() { return !!(currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف')); }
function mlogFmtParts(iso) {
  if (!iso) return { day: '', time: '', date: '' };
  try {
    const d = new Date(iso);
    return {
      day: d.toLocaleDateString('ar-SA', { weekday: 'long' }),
      time: d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      date: d.toLocaleDateString('ar-SA')
    };
  } catch { return { day: '', time: '', date: '' }; }
}
function renderMaintLog() {
  ensureMaintenanceData();
  updateMaintNotifBadge(); // يُحدَّث دائمًا حسب القائمة الكاملة (بنفس أسلوب متابعة الطلبات)
  const sub = document.getElementById('maintLogSubtitle');
  if (sub) sub.textContent = 'سجل الوظائف والمهام الخاصة بالصيانة';
  const canDelete = mlogCanDelete();
  const el = document.getElementById('maintLogContent');
  let html = `<div class="mlog-toolbar">
      <div class="mlog-crumbs"><i class="fas fa-briefcase"></i> سجل الوظائف</div>
      <button class="mlog-add-btn no-print" onclick="addMaintJob()"><i class="fas fa-plus"></i> إضافة وظيفة</button>
    </div>`;
  // الأحدث دائمًا أعلى القائمة (وله الرقم التصاعدي الأكبر لأن jobNum يُخصَّص
  // بالتسلسل عند الإضافة)
  const jobs = [...appData.maintenance.jobsLog].sort((a, c) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tc = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    return tc - ta;
  });
  if (!jobs.length) {
    html += '<div class="card"><div class="empty-state"><i class="fas fa-briefcase"></i><h3>لا توجد وظائف مسجّلة بعد</h3><p>أضف أول وظيفة من زر "إضافة وظيفة"</p></div></div>';
    el.innerHTML = html; return;
  }
  html += '<div class="mlog-notes-list">' + jobs.map((j, i) => {
    const parts = mlogFmtParts(j.createdAt);
    return `<div class="mlog-note-row" style="background:${MLOG_PALETTE[i % MLOG_PALETTE.length]};">
      <span class="badge badge-info" style="position:absolute;top:10px;left:12px;font-weight:800;background:rgba(255,255,255,.25);color:var(--white);">#${j.jobNum || '—'}</span>
      ${canDelete ? `<button class="no-print" onclick="deleteMaintJob('${j.id}')" title="حذف الوظيفة" style="position:absolute;bottom:8px;left:10px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(255,255,255,.22);color:var(--white);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:all var(--transition);" onmouseover="this.style.background='rgba(239,68,68,.85)'" onmouseout="this.style.background='rgba(255,255,255,.22)'"><i class="fas fa-trash"></i></button>` : ''}
      <div class="mlog-note-icon"><i class="fas fa-briefcase"></i></div>
      <div class="mlog-note-body">
        <div class="mlog-note-text">${j.text}</div>
        <div class="mlog-note-tags">
          <span class="mlog-note-user"><i class="fas fa-user"></i> ${j.user || 'غير معروف'}</span>
        </div>
      </div>
      <div class="mlog-note-time-block">
        <div class="mlog-day">${parts.day}</div>
        <div class="mlog-time">${parts.time}</div>
        <div class="mlog-date">${parts.date}</div>
      </div>
    </div>`;
  }).join('') + '</div>';
  el.innerHTML = html;
}
// نافذة إضافة وظيفة — واجهة محسَّنة: رأس ملوّن بأيقونة، عداد أحرف حي، تلميحات
// أمثلة سريعة قابلة للنقر لتعبئة الحقل، وتصميم متناسق مع هوية النظام (الذهبي
// الكحلي) بدل نافذة Swal الافتراضية البسيطة.
function addMaintJob() {
  const EXAMPLES = ['صيانة مكيفات', 'إصلاح تسريب مياه', 'فحص كهرباء', 'صيانة دورية عامة'];
  Swal.fire({
    title: false,
    html: `
      <div style="text-align:right;direction:rtl;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div style="width:52px;height:52px;flex-shrink:0;border-radius:14px;background:linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.18);">
            <i class="fas fa-briefcase" style="font-size:22px;color:var(--white);"></i>
          </div>
          <div>
            <div style="font-size:18px;font-weight:800;color:var(--text);">إضافة وظيفة جديدة</div>
            <div style="font-size:12.5px;color:var(--text-light);">ستُضاف فورًا إلى سجل الصيانة برقم تسلسلي خاص بها</div>
          </div>
        </div>
        <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:6px;color:var(--text);">وصف الوظيفة/المهمة</label>
        <textarea class="swal2-textarea" id="mjob-text" maxlength="500" style="direction:rtl;margin:0 0 4px;min-height:110px;border-radius:12px;" placeholder="مثال: صيانة مكيفات الدور الثاني في مجمع الياسمين" oninput="document.getElementById('mjob-counter').textContent = this.value.length + ' / 500'"></textarea>
        <div id="mjob-counter" style="text-align:left;font-size:11px;color:var(--text-light);margin-bottom:14px;">0 / 500</div>
        <div style="font-size:11.5px;color:var(--text-light);margin-bottom:8px;">اقتراحات سريعة:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${EXAMPLES.map(ex => `<button type="button" onclick="const t=document.getElementById('mjob-text'); t.value = t.value ? t.value + '، ' + '${ex}' : '${ex}'; t.dispatchEvent(new Event('input'));" style="border:1px solid var(--border);background:var(--surface2);color:var(--primary);font-size:12px;font-weight:700;padding:6px 12px;border-radius:20px;cursor:pointer;transition:all var(--transition);" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='var(--surface2)'">${ex}</button>`).join('')}
        </div>
      </div>`,
    showCancelButton: true, confirmButtonText: '<i class="fas fa-check"></i> حفظ الوظيفة', cancelButtonText: 'إلغاء',
    confirmButtonColor: '#0d2137', cancelButtonColor: '#94a3b8',
    focusConfirm: false,
    customClass: { popup: 'mjob-swal-popup' },
    didOpen: () => { document.getElementById('mjob-text').focus(); },
    preConfirm: () => {
      const text = document.getElementById('mjob-text').value.trim();
      if (!text) { Swal.showValidationMessage('يرجى كتابة وصف الوظيفة'); return false; }
      return { text };
    }
  }).then(r => {
    if (r.isConfirmed) {
      ensureMaintenanceData();
      // ترقيم تصاعدي دائم: أكبر رقم موجود حاليًا + 1 — نفس أسلوب reqNum في متابعة الطلبات
      const nextNum = appData.maintenance.jobsLog.reduce((m, j) => j.jobNum ? Math.max(m, j.jobNum) : m, 0) + 1;
      const job = { id: uid(), jobNum: nextNum, text: r.value.text, user: currentUser ? currentUser.name : 'غير معروف', createdAt: new Date().toISOString() };
      MaintenanceRepository.addMaintJob(job).then(() => {
        logMaintDraft('add', `تمت إضافة وظيفة رقم ${job.jobNum} في سجل الصيانة: ${job.text}`, null, job);
        showToast('تمت إضافة الوظيفة', 'success'); renderMaintLog();
      });
    }
  });
}
function deleteMaintJob(id) {
  if (!mlogCanDelete()) { showToast('حذف الوظائف متاح للمدير أو المشرف فقط', 'error'); return; }
  ensureMaintenanceData();
  const job = appData.maintenance.jobsLog.find(j => j.id === id);
  if (!job) return;
  Swal.fire({
    title: 'حذف الوظيفة', text: `هل تريد حذف الوظيفة رقم ${job.jobNum || ''}؟`, icon: 'warning',
    showCancelButton: true, confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444'
  }).then(r => {
    if (r.isConfirmed) {
      MaintenanceRepository.deleteMaintJob(id).then(() => {
        logMaintDraft('delete', `تم حذف وظيفة رقم ${job.jobNum || ''} من سجل الصيانة: ${job.text}`, job, null);
        showToast('تم الحذف', 'success'); renderMaintLog();
      });
    }
  });
}
function renderMaintDraft() {
  ensureMaintenanceData();
  const canDelete = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
  const clearBtn = document.getElementById('clearMaintDraftBtn');
  if (clearBtn) clearBtn.style.display = canDelete ? '' : 'none';
  const type = document.getElementById('maintDraftType').value;
  const labels = { add: 'إضافة', edit: 'تعديل', delete: 'حذف' };
  const icons = { add: 'fas fa-plus-circle', edit: 'fas fa-edit', delete: 'fas fa-trash' };
  const colors = { add: 'var(--success)', edit: 'var(--info)', delete: 'var(--danger)' };
  let list = [...appData.maintenance.log].reverse();
  if (type) list = list.filter(l => l.action === type);
  const container = document.getElementById('maintDraftContainer');
  const empty = document.getElementById('maintDraftEmpty');
  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  container.innerHTML = list.map(l => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);border-right:4px solid ${colors[l.action]};">
      <i onclick='showLogDiff(${JSON.stringify(l).replace(/'/g,"&#39;")})' class="${icons[l.action]}" style="color:${colors[l.action]};margin-top:2px;font-size:15px;flex-shrink:0;cursor:pointer;"></i>
      <div onclick='showLogDiff(${JSON.stringify(l).replace(/'/g,"&#39;")})' style="flex:1;cursor:pointer;"><div style="font-size:13px;font-weight:700;color:var(--text);">${labels[l.action]}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${l.details}</div>
      <div style="font-size:11.5px;color:var(--primary);margin-top:3px;"><i class="fas fa-user"></i> بواسطة: ${l.user || 'غير معروف'}</div></div>
      <div style="font-size:11px;color:var(--text-light);white-space:nowrap;">${l.ts}</div>
      ${canDelete ? `<button class="btn btn-danger btn-sm" style="padding:4px 8px;" onclick="deleteMaintLogEntry('${l.id}')" title="حذف هذا العنصر"><i class="fas fa-times"></i></button>` : ''}
    </div>`).join('');
}
function deleteMaintLogEntry(id) {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  ensureMaintenanceData();
  markLogEntryDeleted('maintenance', id);
  appData.maintenance.log = appData.maintenance.log.filter(l => l.id !== id);
  save().catch(e => console.error('[deleteMaintLogEntry]', e));
  renderMaintDraft();
}
function clearMaintDraftLog() {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  Swal.fire({ title:'مسح السجل', text:'هل تريد حذف جميع سجلات الأحداث؟', icon:'warning', showCancelButton:true, confirmButtonText:'نعم، امسح', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(r => {
    if (r.isConfirmed) { MaintenanceRepository.clearLog(); renderMaintDraft(); showToast('تم مسح السجل', 'success'); }
  });
}

