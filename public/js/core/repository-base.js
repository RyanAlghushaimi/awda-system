// ============================================================
// ===== MAINTENANCE MANAGEMENT =====
// ============================================================
// ============================================================
// ===== BaseRepository: القالب العام المشترك لكل Repositories البيانات =====
// ============================================================
// كل الواجهات async منذ البداية، حتى لو كان التنفيذ الحالي متزامنًا بالكامل
// (يعمل على appData في الذاكرة) — بحيث عند الانتقال الفعلي لاحقًا إلى
// Firestore Collections مستقلة، تُعدَّل هذه الدوال فقط لتُصبح استدعاءات
// حقيقية غير متزامنة، دون الحاجة لإضافة await في كل شاشة تستدعيها.
//
// getArray:        () => المصفوفة الحالية من appData (مرجع مباشر، وليس نسخة)
// ensureFn:        تضمن وجود الهيكل قبل أي وصول (مثل ensureEmployeesData)
// deletionSection: اسم القسم في appData.deleted[...] لتسجيل التومبستون عند remove()
// ============================================================
// ===== createFirestoreRepository: مصنع عام لأي Repository مدعوم بـ Collection =====
// ============================================================
// يوفر نفس الواجهة التي بنيناها يدويًا لـ MaintenanceRepository، لأي قسم
// بسيط (عنصر واحد لكل مستند): getAll/getById/add/update/remove + init()
// (ترحيل لمرة واحدة عبر MigrationRegistry + تحميل + اشتراك لحظي) + fallback
// آمن على appData في الذاكرة إذا لم تتوفر خدمة Firestore (بيئة اختبار محلية).
//
// migrationSection: اسم القسم في MigrationRegistry (مثل 'vacants')
// getLocalArray / setLocalArray: قراءة/كتابة المصفوفة المحلية في appData (appData.vacant.units مثلاً)
// ensureFn: تضمن وجود الهيكل قبل أي وصول
// collectionService: VacantsCollectionService مثلاً (قد تكون undefined في بيئة اختبار)
// onRemoteChange: دالة اختيارية تُستدعى بعد كل تحديث لحظي (لإعادة رسم الشاشة)
function createFirestoreRepository({ migrationSection, deletionSection, getLocalArray, setLocalArray, ensureFn, collectionService, onRemoteChange }) {
  const usingCollection = typeof collectionService !== 'undefined' && !!collectionService;
  const tombstoneSection = deletionSection || migrationSection;
  return {
    _unsub: null,
    _usingCollection: usingCollection,
    ensure() { ensureFn(); },
    async init() {
      this.ensure();
      if (!this._usingCollection) return; // بيئة بدون Firebase — العمل يستمر على appData كما كان
      try {
        const alreadyMigrated = (typeof MigrationRegistry !== 'undefined') ? await MigrationRegistry.isMigrated(migrationSection) : false;
        if (!alreadyMigrated) {
          const localData = getLocalArray();
          if (localData && localData.length > 0) {
            const n = await collectionService.migrateFromArray(localData);
            console.log(`[Migration] ${migrationSection}: تم ترحيل ${n} سجل من المستند الرئيسي`);
          }
          if (typeof MigrationRegistry !== 'undefined') await MigrationRegistry.markMigrated(migrationSection);
        }
        const remote = await collectionService.getAll();
        setLocalArray(remote);
      } catch (e) {
        console.error(`تعذر الاتصال بـ ${migrationSection} Collection عند الإقلاع:`, e);
        this._usingCollection = false;
        if (typeof showToast === 'function') showToast('تعذر تحميل بيانات ' + migrationSection + ' من الخادم — أعد تحميل الصفحة ولا تعدّل قبل ذلك', 'error');
        return;
      }
      if (this._unsub) this._unsub();
      this._unsub = collectionService.onRealtimeUpdate((items) => {
        const __tid = window.__TRACE_CONTRACT_ID;
        if (__tid && migrationSection === 'collections') {
          const __before = __traceFindContract(getLocalArray(), __tid);
          const __incoming = __traceFindContract(items, __tid);
          console.log('[TRACE 1] onSnapshot → items.length =', items.length, '| العقد المتتبَّع داخل items:', __incoming ? JSON.parse(JSON.stringify(__incoming)) : '❌ غير موجود في الدفعة الواردة');
          console.log('[TRACE 2a] setLocalArray — appData.collection.contracts (قبل):', __before ? JSON.parse(JSON.stringify(__before)) : '❌ غير موجود قبل');
          setLocalArray(items);
          const __after = __traceFindContract(getLocalArray(), __tid);
          console.log('[TRACE 2b] setLocalArray — appData.collection.contracts (بعد):', __after ? JSON.parse(JSON.stringify(__after)) : '❌ غير موجود بعد');
        } else {
          setLocalArray(items);
        }
        if (typeof onRemoteChange === 'function') onRemoteChange(items);
      });
    },
    async getAll() { this.ensure(); return getLocalArray(); },
    async getById(id) { this.ensure(); return getLocalArray().find(x => x.id === id) || null; },
    async add(item) {
      this.ensure();
      if (this._usingCollection) {
        const saved = await collectionService.add(item);
        return saved;
      }
      getLocalArray().push(item); await save(); return item;
    },
    async update(id, changes) {
      this.ensure();
      const item = getLocalArray().find(x => x.id === id);
      if (!item) return null;
      Object.assign(item, changes, { updatedAt: new Date().toISOString() });
      if (this._usingCollection) await collectionService.update(id, changes);
      else if (collectionService) throw new Error('الاتصال بقاعدة بيانات ' + migrationSection + ' غير متاح — لم يُحفظ التعديل');
      else await save();
      return item;
    },
    async remove(id) {
      this.ensure();
      const arr = getLocalArray();
      const idx = arr.findIndex(x => x.id === id);
      const removedItem = idx > -1 ? arr[idx] : null;
      markDeleted(tombstoneSection, id, 'manual'); // طبقة أمان مؤقتة إضافية فوق الحذف الحقيقي في Firestore
      if (this._usingCollection) await collectionService.remove(id);
      if (idx > -1) arr.splice(idx, 1);
      if (!this._usingCollection) await save();
      return removedItem;
    }
  };
}


function ensureMaintenanceData() {
  if (!appData.maintenance) appData.maintenance = { requests: [], schedules: [], log: [], assigneeMemory: [], sheetRequests: [], logBook: [], jobsLog: [] };
  if (!appData.maintenance.requests) appData.maintenance.requests = [];
  if (!appData.maintenance.schedules) appData.maintenance.schedules = [];
  if (!appData.maintenance.log) appData.maintenance.log = [];
  if (!appData.maintenance.assigneeMemory) appData.maintenance.assigneeMemory = [];
  if (!appData.maintenance.sheetRequests) appData.maintenance.sheetRequests = [];
  // دفتر سجل الصيانة القديم (عقارات/وحدات <- شقق <- ملاحظات) — لم يعد
  // مستخدَمًا في الواجهة بعد الاستبدال بقائمة الوظائف، لكن نُبقي الحقل هنا
  // فقط حتى لا تُفقد أي بيانات قديمة محفوظة مسبقًا في Firebase لأي مستخدم.
  if (!appData.maintenance.logBook) appData.maintenance.logBook = [];
  appData.maintenance.logBook.forEach(b => { if (!b.units) b.units = []; b.units.forEach(u => { if (!u.notes) u.notes = []; }); });
  // سجل الصيانة الحالي: قائمة وظائف بسيطة (تُضاف فقط ولا تُحذف)
  if (!appData.maintenance.jobsLog) appData.maintenance.jobsLog = [];
}
