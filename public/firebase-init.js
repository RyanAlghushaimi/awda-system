// ============================================================
// firebase.js — ربط النظام بـ Firebase (Firestore) بدل خادم LAN المحلي
// ============================================================
// هذا الملف يوفر نفس الوظائف التي كان يوفرها server.js سابقًا
// (تحميل/حفظ بيانات النظام) لكن عبر قاعدة بيانات Firestore السحابية،
// بحيث يعمل النظام من أي مكان بدون الحاجة لتشغيل أي جهاز أو خادم محلي.
//
// خطوات الإعداد (اتبعها مرة واحدة فقط):
// 1) اذهب إلى https://console.firebase.google.com وأنشئ مشروعًا جديدًا.
// 2) من القائمة الجانبية: Build > Firestore Database > Create database
//    اختر "Start in production mode" ثم اختر أقرب موقع خادم (مثلاً eur3).
// 3) من إعدادات المشروع (Project settings) > عام (General) > انزل لتجد
//    "Your apps" ثم اضغط أيقونة الويب </> لإنشاء تطبيق ويب وانسخ بيانات
//    firebaseConfig وضعها مكان القيم أدناه.
// 4) من تبويب Firestore > Rules، استبدل القواعد بما يلي أثناء التطوير
//    (ثم شدّدها لاحقًا حسب الحاجة — راجع ملف الشرح txt المرفق):
//
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /awda_system/{docId} {
//            allow read, write: if true;
//          }
//        }
//      }
//
// ============================================================

// !! عدّل هذه القيم بالكامل من إعدادات مشروعك في Firebase !!
const firebaseConfig = {
  apiKey: "AIzaSyCGorUJkfuGhYCGlD2PkjlybSMa1q0I4vg",
  authDomain: "awda-system.firebaseapp.com",
  projectId: "awda-system",
  storageBucket: "awda-system.firebasestorage.app",
  messagingSenderId: "335637551145",
  appId: "1:335637551145:web:ca73672d0739a9d62c2438"
};

// اسم المستند الذي سيحمل كل بيانات النظام داخل Firestore
const FIREBASE_COLLECTION = "awda_system";
const FIREBASE_DOC_ID = "main";

// تهيئة Firebase (يعتمد على الـ SDK المضاف في index.html عبر compat CDN)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const dataDocRef = db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC_ID);

// ============================================================
// ===== أداة طوارئ: تفريغ طابور الكتابة المحلي المعطوب =====
// ============================================================
// تُستخدم مرة واحدة فقط لكل جهاز متأثر بمشكلة "resource-exhausted" الناتجة
// عن تراكم كتابات فاشلة قديمة في IndexedDB (بسبب صلاحيات كانت ناقصة).
// تُوقف الاتصال، تمسح كل التخزين المحلي المؤقت (بدون حذف أي بيانات فعلية
// من الخادم)، ثم تُعيد تحميل الصفحة لتبدأ باتصال نظيف.
window.resetFirestoreLocalQueue = async function() {
  try {
    if (typeof stopLiveSync === 'function') stopLiveSync();
    await db.terminate();
    await firebase.firestore().clearPersistence();
    alert('تم تفريغ التخزين المحلي بنجاح. سيُعاد تحميل الصفحة الآن.');
  } catch (e) {
    console.error('تعذر تفريغ التخزين المحلي:', e);
    alert('تعذر التفريغ التلقائي. الرجاء مسح بيانات الموقع يدويًا من إعدادات المتصفح (Clear site data) ثم إعادة تحميل الصفحة.');
  } finally {
    location.reload();
  }
};

// تفعيل Offline Persistence الحقيقية من Firestore SDK نفسه: يخزّن قراءات
// وكتابات الجهاز محليًا (IndexedDB) تلقائيًا، ويعيد إرسال الكتابات المعلّقة
// فور عودة الاتصال — بديل رسمي وأكثر موثوقية من آلية PENDING_SAVE_KEY اليدوية
// القديمة (التي تبقى موجودة كطبقة حماية إضافية للمستند الكبير القديم فقط).
try {
  db.enableMultiTabIndexedDbPersistence().catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Offline persistence: متصفح مفتوح على أكثر من تبويب لنفس الموقع، التفعيل يتم في تبويب واحد فقط.');
    } else if (err.code === 'unimplemented') {
      console.warn('Offline persistence: غير مدعوم في هذا المتصفح.');
    }
  });
} catch (e) { /* بيئة لا تدعم enablePersistence إطلاقًا — نتجاهل بأمان */ }

// ============================================================
// ===== MigrationRegistry =====
// ============================================================
// سجل موثوق لتتبّع أي قسم تم ترحيله فعليًا من المستند الكبير إلى Collection
// مستقلة، حتى لا يُعاد تشغيل الترحيل أكثر من مرة. أكثر أمانًا من فحص "هل
// الـ Collection فارغة؟" لأن تلك الطريقة قد تُخطئ فتُعيد ترحيل بيانات محذوفة
// عمدًا إذا أصبحت الـ Collection فارغة لسبب طبيعي (حذف كل السجلات مثلاً).
const migrationsDocRef = db.collection('_meta').doc('migrations');
const MigrationRegistry = {
  async isMigrated(section) {
    try {
      const snap = await migrationsDocRef.get();
      return !!(snap.exists && snap.data() && snap.data()[section] === true);
    } catch (e) {
      console.error('تعذر قراءة سجل الترحيل:', e);
      return false;
    }
  },
  async markMigrated(section) {
    await migrationsDocRef.set({ [section]: true, [section + 'At']: new Date().toISOString() }, { merge: true });
  }
};

// ============================================================
// FirebaseStorageService: بديل كامل لِـ StorageService القديم الذي
// كان يعتمد على fetch(API_BASE + '/api/data'). له نفس الواجهة تمامًا:
// load() و save(data) — لذلك لا حاجة لتعديل أي منطق آخر في index.html
// سوى استبدال جسم الدالتين.
// ============================================================
const FirebaseStorageService = {
  async load() {
    try {
      const snap = await dataDocRef.get();
      if (!snap.exists) {
        // أول مرة يعمل فيها النظام: أنشئ مستندًا فارغًا
        const empty = { agents: [] };
        await dataDocRef.set(empty);
        return empty;
      }
      const data = snap.data();
      return (data && typeof data === 'object' && Object.keys(data).length)
        ? data
        : { agents: [] };
    } catch (e) {
      console.error('تعذر تحميل البيانات من Firebase:', e);
      throw e; // يتم التعامل مع الخطأ في StorageService.load بواجهة index.html
    }
  },

  async save(data) {
    // Firestore لا يقبل مصفوفات متداخلة داخل بعضها مباشرة أحيانًا،
    // لذلك نمرر الكائن كما هو (Firestore يدعم Objects/Arrays المتداخلة عادة).
    // نستخدم set() الكامل حتى تُطابق نسخة الخادم بالضبط (استبدال كامل).
    await dataDocRef.set(data);
  },

  // حفظ ذرّي: يقرأ آخر نسخة من Firestore ويدمجها مع نسختنا المحلية عبر
  // mergeCallback ثم يكتب الناتج، كل ذلك داخل معاملة واحدة (Transaction).
  // Firestore يضمن أنه إذا عدّل مستخدم آخر المستند بين القراءة والكتابة،
  // تُعاد المحاولة تلقائيًا بأحدث نسخة — فلا يمكن لعملية حفظ أن تمحو
  // تعديل عملية أخرى وصلت في نفس اللحظة (Lost Update Problem).
  async saveTransactional(mergeCallback) {
    const txId = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    console.log(`[TX ${txId}] Transaction started`);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(dataDocRef);
      const fresh = snap.exists ? snap.data() : { agents: [] };
      console.log(`[TX ${txId}] Document version before:`, {
        updateTimeSeen: snap.updateTime ? snap.updateTime.toString() : 'new-doc',
        deletedCounts: fresh.deleted ? Object.fromEntries(Object.entries(fresh.deleted).map(([k, v]) => [k, Object.keys(v || {}).length])) : {}
      });
      const merged = mergeCallback(fresh);
      const deletedCounts = merged.deleted ? Object.fromEntries(Object.entries(merged.deleted).map(([k, v]) => [k, Object.keys(v || {}).length])) : {};
      console.log(`[TX ${txId}] Merge result — deleted IDs applied:`, deletedCounts);
      tx.set(dataDocRef, merged);
      console.log(`[TX ${txId}] Transaction committed`);
      return merged;
    }).catch(err => {
      console.error(`[TX ${txId}] Transaction failed:`, err);
      throw err;
    });
  },

  // اشتراك لحظي (اختياري) — يُستدعى إن رغبت بتحديث الشاشة تلقائيًا
  // عند تعديل موظف آخر للبيانات من جهاز مختلف في نفس اللحظة.
  onRealtimeUpdate(callback) {
    console.log('%c[TRACE-SUBSCRIBE]', 'color:#059669;font-weight:bold', 'onRealtimeUpdate() استُدعيت — جارٍ تسجيل onSnapshot الآن | وقت =', new Date().toISOString());
    return dataDocRef.onSnapshot((snap) => {
      // طباعة غير مشروطة بأي شرط — لإثبات وصول onSnapshot فعليًا بغض النظر عن TRACE_TEST_ID
      console.log(
        '%c[TRACE-SNAPSHOT-RAW]', 'color:#0891b2;font-weight:bold',
        'وقت =', new Date().toISOString(),
        '| fromCache =', snap.metadata.fromCache,
        '| hasPendingWrites =', snap.metadata.hasPendingWrites,
        '| exists =', snap.exists
      );
      const traceTestId = window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID') || 'TEST_msoicsiqy89t9'; // قيمة ثابتة مؤقتة للتتبع بناءً على طلب المهندس
      if (traceTestId) {
        const _data = snap.exists ? snap.data() : null;
        const _hasId = !!(_data && (_data.contracts?.log || []).some(l => l.id === traceTestId));
        const _hasTombstone = !!(_data && _data.deleted?.logEntries?.contracts?.[traceTestId]);
        console.log(
          '%c[TRACE-SNAPSHOT]',
          'color:#ea580c;font-weight:bold',
          'وقت الوصول =', new Date().toISOString(),
          '| fromCache =', snap.metadata.fromCache,
          '| hasPendingWrites =', snap.metadata.hasPendingWrites,
          '| exists =', snap.exists,
          '| testId =', traceTestId,
          '| ID موجود في snap.data().contracts.log؟ =', _hasId,
          '| Tombstone موجود في snap.data().deleted.logEntries.contracts؟ =', _hasTombstone
        );
      } else {
        console.log('%c[TRACE-SNAPSHOT]', 'color:#dc2626', 'لا يوجد traceTestId (لا في window ولا sessionStorage) — لن تُطبع تفاصيل السجل');
      }
      if (snap.exists) callback(snap.data());
    }, (err) => {
      console.error('خطأ في الاشتراك اللحظي بـ Firebase:', err);
    });
  },

  // إضافة عنصر واحد لمصفوفة داخل المستند بشكل ذرّي (arrayUnion) — بدون قراءة
  // المستند أولًا، وبدون أي خطر أن يستبدل حفظ متزامن آخر هذا العنصر. مثالي
  // لسجلات الأحداث (logs) المشتركة بين عدة مستخدمين يعملون بنفس اللحظة.
  async appendToArray(fieldPath, entry) {
    await dataDocRef.update({ [fieldPath]: firebase.firestore.FieldValue.arrayUnion(entry) });
  }
};

// ============================================================
// ===== MaintenanceCollectionService =====
// ============================================================
// أول قسم يُنقل فعليًا إلى Firestore Collection مستقلة (maintenance)،
// بدل أن يكون جزءًا من مستند awda_system/main الضخم.
// كل طلب/جدول صيانة الآن مستند مستقل بحقل type يميّز بينهما:
//   type: 'request' | 'schedule'
// المزايا مباشرة:
//   - حذف عنصر = حذف مستنده فعليًا (Firestore Delete)، بلا حاجة لتومبستون محلي.
//   - تعديل عنصر = تحديث مستنده فقط، لا يُعاد رفع بقية بيانات النظام.
//   - onSnapshot على مستوى الـ Collection بالكامل = مزامنة لحظية دقيقة.
const maintenanceCol = db.collection('maintenance');

// Firestore يرفض أي حقل قيمته undefined ويرمي استثناءً فورًا عند set/update/batch.set.
// هذه دالة حماية تُزيل أي مفتاح قيمته undefined قبل الإرسال (لا تلمس null، فهو مقبول).
// Firestore يرفض أي حقل قيمته undefined ويرمي استثناءً فورًا عند set/update/batch.set،
// وهذا يشمل القيم المتداخلة بعمق (مثل months.monthKey.contracts[].createdAt) وليس
// فقط المستوى الأول — لذلك التنظيف هنا Recursive على الكائنات والمصفوفات.
function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    Object.keys(value).forEach(k => { if (value[k] !== undefined) out[k] = stripUndefined(value[k]); });
    return out;
  }
  return value;
}

// ============================================================
// ===== createSingleTypeCollectionService: مصنع عام =====
// ============================================================
// لأي قسم يكون كل عنصر فيه مستندًا مستقلًا بلا أنواع فرعية (خلاف maintenance
// التي فيها request/schedule). يُستخدم لـ vacants, units, employees, collections.
function createSingleTypeCollectionService(collectionName) {
  const col = db.collection(collectionName);
  return {
    col,
    async getAll() {
      const snap = await col.get();
      const items = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      return items;
    },
    async add(item) {
      const { id, ...rest } = item;
      const ref = id ? col.doc(String(id)) : col.doc();
      await ref.set(stripUndefined({ ...rest, createdAt: rest.createdAt || new Date().toISOString() }));
      return { ...item, id: ref.id };
    },
    // تحديث جزئي مباشر بلا أي قراءة مسبقة للمستند: ref.update() يُنفَّذ بالكامل
    // على خادم Firestore ويمزج الحقول المحددة فقط في "changes" مع المستند الحالي —
    // الحقول غير المذكورة تبقى كما هي تلقائيًا، بنفس نتيجة النمط القديم
    // (قراءة كاملة عبر Transaction ثم دمج ثم كتابة كاملة) لكن بدون استهلاك
    // أي حصة قراءة (Read Quota) إطلاقًا، وبدون خطر "عاصفة إعادة المحاولة"
    // التي كانت تحدث عند تعارض/امتلاء الحصة أثناء خطوة القراءة داخل المعاملة.
    // ملاحظة: هذا لا يزال يحمي من "Lost Update" على مستوى الحقل — تعديلان
    // متزامنان لحقلين مختلفين في نفس المستند لن يمحو أحدهما الآخر أبدًا،
    // لأن update() يمزج على مستوى الحقل لا يستبدل المستند بالكامل.
    async update(id, changes) {
      const ref = col.doc(String(id));
      const merged = stripUndefined({ ...changes, updatedAt: new Date().toISOString() });
      await ref.update(merged);
      return { id, ...merged };
    },
    // للحالات التي تحتاج قراءة أحدث نسخة من المستند وتعديلها بمنطق مخصص ضمن
    // نفس المعاملة (مثل تعديل حقل متداخل كـ months.contracts داخل مستند المسوّق)
    // — mutatorFn(freshDocData) يُعيد كائن التغييرات المطلوب دمجه، ويُنفَّذ بعد
    // قراءة أحدث نسخة فعلية من Firestore، فلا يُبنى على نسخة محلية قديمة.
    async updateWithFn(id, mutatorFn) {
      const ref = col.doc(String(id));
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('DOC_NOT_FOUND: ' + id);
        const fresh = { id, ...snap.data() };
        const changes = mutatorFn(fresh) || {};
        const merged = { ...snap.data(), ...stripUndefined(changes), updatedAt: new Date().toISOString() };
        tx.set(ref, merged);
        return { id, ...merged };
      });
    },
    async remove(id) {
      // حذف حقيقي للمستند = الحذف الدائم نفسه؛ لا حاجة لتومبستون محلي منفصل
      // لأنه لا يوجد مستند كبير مشترك يمكن أن "يُعيد إحياء" هذا العنصر بالدمج.
      await col.doc(String(id)).delete();
    },
    // استبدال كامل للمجموعة دفعة واحدة (مثل استيراد Excel الذي يستبدل كل
    // المسوّقين): يحذف كل المستندات الحالية ثم يكتب المجموعة الجديدة، مقسّمة
    // على دفعات من 450 عملية (حد Firestore batch الفعلي 500).
    async replaceAll(items) {
      const existing = await col.get();
      const ops = [];
      existing.forEach(doc => ops.push({ type: 'delete', ref: col.doc(doc.id) }));
      (items || []).forEach(it => {
        const { id, ...rest } = it;
        ops.push({ type: 'set', ref: id ? col.doc(String(id)) : col.doc(), data: stripUndefined(rest) });
      });
      for (let i = 0; i < ops.length; i += 450) {
        const chunk = ops.slice(i, i + 450);
        const batch = db.batch();
        chunk.forEach(op => op.type === 'delete' ? batch.delete(op.ref) : batch.set(op.ref, op.data));
        await batch.commit();
      }
    },
    onRealtimeUpdate(callback) {
      return col.onSnapshot((snap) => {
        const items = [];
        snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        callback(items);
      }, (err) => console.error(`خطأ في الاشتراك اللحظي بـ ${collectionName}:`, err));
    },
    // ترحيل لمرة واحدة (يُستدعى فقط إذا كان MigrationRegistry يقول إن القسم
    // لم يُرحَّل بعد — وليس بناءً على كون الـ Collection فارغة).
    async migrateFromArray(items) {
      const batch = db.batch();
      let count = 0;
      (items || []).forEach(it => {
        const { id, ...rest } = it;
        batch.set(col.doc(String(id)), stripUndefined(rest), { merge: true });
        count++;
      });
      if (count > 0) await batch.commit();
      return count;
    }
  };
}

const VacantsCollectionService = createSingleTypeCollectionService('vacants');
const UnitsCollectionService = createSingleTypeCollectionService('units');
const EmployeesCollectionService = createSingleTypeCollectionService('employees');
const CollectionsCollectionService = createSingleTypeCollectionService('collections_tahsil'); // تحصيل — اسم مميز لتفادي التباس مع مصطلح "collection" في Firestore نفسه
const AgentsCollectionService = createSingleTypeCollectionService('agents'); // بيانات المسوّق نفسه فقط (الاسم وغيره) — العقود انتقلت إلى subcollection مستقلة، راجع AgentContractsService أدناه

// ============================================================
// ===== AgentContractsService: عقود المسوّق كمستندات مستقلة =====
// agents/{agentId}/contracts/{contractId}
// ============================================================
// الهدف: تحديث/إضافة/حذف عقد واحد يؤثر فقط على مستند العقد نفسه، بدون أي
// قراءة أو إعادة كتابة لمستند المسوّق بالكامل، وبدون runTransaction — بنفس
// نمط contractAgreements المستقر (ref.update() مباشر بلا قراءة مسبقة).
function agentContractsCol(agentId) {
  return db.collection('agents').doc(String(agentId)).collection('contracts');
}
const AgentContractsService = {
  async getAll(agentId) {
    const snap = await agentContractsCol(agentId).get();
    const items = [];
    snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    return items;
  },
  // إضافة عقد جديد فقط — لا قراءة مسبقة، لا لمس لأي عقد آخر لنفس المسوّق.
  async add(agentId, contract) {
    const { id, ...rest } = contract;
    const ref = id ? agentContractsCol(agentId).doc(String(id)) : agentContractsCol(agentId).doc();
    const data = stripUndefined({ ...rest, createdAt: rest.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    await ref.set(data);
    return { ...data, id: ref.id };
  },
  // تحديث حقول عقد موجود فقط — update() مباشر بلا قراءة وبلا Transaction،
  // يمزج الحقول المرسلة فقط ويترك بقية حقول هذا العقد كما هي.
  async update(agentId, contractId, changes) {
    const ref = agentContractsCol(agentId).doc(String(contractId));
    const merged = stripUndefined({ ...changes, updatedAt: new Date().toISOString() });
    await ref.update(merged);
    return { id: contractId, ...merged };
  },
  async remove(agentId, contractId) {
    await agentContractsCol(agentId).doc(String(contractId)).delete();
  },
  onRealtimeUpdate(agentId, callback) {
    return agentContractsCol(agentId).onSnapshot((snap) => {
      const items = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      callback(items);
    }, (err) => console.error(`خطأ في الاشتراك اللحظي بعقود المسوّق ${agentId}:`, err));
  },
  // ============================================================
  // اشتراك لحظي على مستوى النظام بالكامل عبر collectionGroup: يغطي عقود
  // كل المسوّقين باستعلام واحد فقط، بدل فتح اشتراك onSnapshot منفصل لكل
  // مسوّق (ما كان سيكلّف N اشتراك/قراءة لكل تحميل صفحة). يُستخدم لتغذية
  // الداشبورد والتقارير المجمّعة بأحدث بيانات دون أي حاجة لزيارة كل
  // مسوّق يدويًا فتح الترحيل، ودون أي تكلفة إضافية إن لم يتغيّر شيء —
  // onSnapshot لا يرسل شيئًا إطلاقًا حتى يحدث تغيير فعلي في أي عقد.
  // (تنبيه: هذا الاستعلام لا يحتاج فهرس (Index) مركّب لأنه بلا where/orderBy،
  // ولا يحتاج تعديل قواعد الأمان — القاعدة الحالية على
  // /agents/{agentId}/contracts/{contractId} تغطي مسار collectionGroup نفسه.)
  onRealtimeUpdateAll(callback) {
    return db.collectionGroup('contracts').onSnapshot((snap) => {
      const items = [];
      snap.forEach(doc => {
        const agentId = doc.ref.parent && doc.ref.parent.parent ? doc.ref.parent.parent.id : null;
        if (!agentId) return;
        items.push({ id: doc.id, agentId, ...doc.data() });
      });
      callback(items, { fromCache: snap.metadata.fromCache });
    }, (err) => console.error('خطأ في الاشتراك اللحظي بجميع عقود المسوّقين (collectionGroup):', err));
  }
};

// ============================================================
// ===== ترحيل عقود المسوّق (Lazy, Idempotent) =====
// ============================================================
// يُستدعى فقط عند فتح شاشة عقود مسوّق معيّن لأول مرة (وليس دفعة واحدة لكل
// المسوقين). لا يحذف أي بيانات قديمة من مستند المسوّق إطلاقًا — تبقى
// agent.months[mk].contracts كنسخة احتياطية مؤقتة. الترحيل لا يُعتبر ناجحًا
// (ولا يُسجَّل في MigrationRegistry) إلا بعد التحقق الفعلي من اكتمال النسخ.
async function migrateAgentContractsToSubcollection(agentId, agentMonthsData) {
  const section = 'contracts_agent_' + agentId;
  if (await MigrationRegistry.isMigrated(section)) return { migrated: false, count: 0 };

  // إن كانت الـ subcollection تحتوي بيانات فعلًا (تم الترحيل سابقًا بطريقة ما
  // لكن لم يُسجَّل)، لا نعيد الترحيل — فقط نسجّله.
  const existing = await agentContractsCol(agentId).limit(1).get();
  if (!existing.empty) { await MigrationRegistry.markMigrated(section); return { migrated: false, count: 0 }; }

  const toWrite = [];
  Object.entries(agentMonthsData || {}).forEach(([mk, m]) => {
    ((m && m.contracts) || []).forEach(c => toWrite.push({ ...c, monthKey: mk }));
  });
  if (!toWrite.length) { await MigrationRegistry.markMigrated(section); return { migrated: true, count: 0 }; }

  const batch = db.batch();
  toWrite.forEach(c => {
    const { id, ...rest } = c;
    batch.set(agentContractsCol(agentId).doc(String(id)), stripUndefined(rest), { merge: true });
  });
  await batch.commit();

  // تحقق فعلي من اكتمال النسخ قبل اعتبار الترحيل ناجحًا وتسجيله.
  const verify = await agentContractsCol(agentId).get();
  if (verify.size < toWrite.length) {
    throw new Error('MIGRATION_INCOMPLETE: عقود المسوّق ' + agentId + ' — متوقَّع ' + toWrite.length + '، فعليًا ' + verify.size);
  }
  await MigrationRegistry.markMigrated(section);
  return { migrated: true, count: toWrite.length };
}
// اتفاقيات إدارة العقود كـ Collection مستقلة (contractAgreements) — بنفس نمط
// vacants/units/agents. Collection جديدة بالكامل، لا تمسّ أي بيانات قائمة.
const ContractAgreementsCollectionService = createSingleTypeCollectionService('contractAgreements');
// إدارة المستخدمين كـ Collection مستقلة (users) — بنفس نمط vacants/units/agents تمامًا.
const UsersCollectionService = createSingleTypeCollectionService('users');
function createLogCollectionService(name) {
  const col = db.collection(name);
  return {
    async getAll() {
      const snap = await col.orderBy('tsNum', 'asc').get();
      const items = [];
      snap.forEach(doc => items.push({ ...doc.data(), id: doc.id }));
      return items;
    },
    async add(entry) {
      const ref = col.doc();
      const { id: _localId, ...entryWithoutId } = entry || {};
      const docData = stripUndefined({ ...entryWithoutId, tsNum: Date.now() });
      await ref.set(docData);
      return { ...docData, id: ref.id };
    },
    onRealtimeUpdate(callback) {
      return col.orderBy('tsNum', 'asc').onSnapshot((snap) => {
        const items = [];
        snap.forEach(doc => items.push({ ...doc.data(), id: doc.id }));
        callback(items);
      }, (err) => console.error(`خطأ في الاشتراك اللحظي بـ ${name}:`, err));
    },
    async migrateFromArray(logArr) {
      if (!logArr || !logArr.length) return 0;
      const existing = await col.limit(1).get();
      if (!existing.empty) return 0;
      const batch = db.batch();
      logArr.forEach((entry, i) => {
        const { id: _localId, ...entryWithoutId } = entry || {};
        batch.set(col.doc(), stripUndefined({ ...entryWithoutId, tsNum: i }));
      });
      await batch.commit();
      return logArr.length;
    },
    async remove(id) {
      await col.doc(String(id)).delete();
    },
    // حذف كامل السجل على دفعات (حد Firestore batch الفعلي 500، نستخدم 450 للأمان)
    async clearAll() {
      const snap = await col.get();
      const batchSize = 450;
      const docs = [];
      snap.forEach(doc => docs.push(doc.ref));
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        docs.slice(i, i + batchSize).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
  };
}
const UnitsLogCollectionService = createLogCollectionService('unitsLog');
const CollectionsLogCollectionService = createLogCollectionService('collectionsLog');
const EmployeesLogCollectionService = createLogCollectionService('employeesLog');
const MaintenanceLogCollectionService = createLogCollectionService('maintenanceLog');
// سجل مسودة إدارة العقود كـ Collection مستقلة (contractsLog) — بنفس نمط vacLog.
const ContractsLogCollectionService = createLogCollectionService('contractsLog');
// ============================================================
// ===== PresenceService =====
// ============================================================
// نظام حضور خفيف مستقل: مستند صغير جدًا لكل مستخدم في Collection presence،
// بدل قراءة وكتابة كامل مستند awda_system/main (الذي قد يحوي مئات السجلات)
// في كل نبضة heartbeat. هذا يزيل الضغط الأكبر على طابور الكتابة (Write Queue)
// لأن الكتابة هنا صغيرة جدًا (merge على 3 حقول فقط) بلا أي قراءة مسبقة.
const presenceCol = db.collection('presence');
const PresenceService = {
  async heartbeat(username, section) {
    await presenceCol.doc(username).set({
      ts: Date.now(),
      section: section || '',
      username
    }, { merge: true });
  },
  async goOffline(username) {
    try { await presenceCol.doc(username).delete(); } catch (e) {}
  },
  onRealtimeUpdate(callback) {
    return presenceCol.onSnapshot((snap) => {
      const online = {};
      snap.forEach(doc => { online[doc.id] = doc.data(); });
      callback(online);
    }, (err) => console.error('خطأ في الاشتراك اللحظي بـ presence Collection:', err));
  }
};
// ============================================================
// ===== VacLogCollectionService =====
// ============================================================
// سجل مسودة الفوارغ كـ Collection مستقلة (vacLog) — كل إدخال مستند مستقل
// بحقل ts رقمي يُستخدم للترتيب. هذا يضمن أن إدخال أي مستخدم يصل فورًا
// لبقية المستخدمين عبر onSnapshot دون أي تعارض مع save() الكامل.
const vacLogCol = db.collection('vacLog');
const VacLogCollectionService = {
  async getAll() {
    const snap = await vacLogCol.orderBy('tsNum', 'asc').get();
    const items = [];
    snap.forEach(doc => items.push({ ...doc.data(), id: doc.id }));
    return items;
  },
  async add(entry) {
    const ref = vacLogCol.doc();
    const { id: _localId, ...entryWithoutId } = entry || {};
    const docData = stripUndefined({ ...entryWithoutId, tsNum: Date.now() });
    await ref.set(docData);
    return { ...docData, id: ref.id };
  },
  async clearAll() {
    const snap = await vacLogCol.get();
    const batchSize = 450;
    const docs = [];
    snap.forEach(doc => docs.push(doc.ref));
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      docs.slice(i, i + batchSize).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  },
  onRealtimeUpdate(callback) {
    return vacLogCol.orderBy('tsNum', 'asc').onSnapshot((snap) => {
      const items = [];
      snap.forEach(doc => items.push({ ...doc.data(), id: doc.id }));
      callback(items);
    }, (err) => console.error('خطأ في الاشتراك اللحظي بـ vacLog Collection:', err));
  },
  async migrateFromArray(logArr) {
    if (!logArr || !logArr.length) return 0;
    const existing = await vacLogCol.limit(1).get();
    if (!existing.empty) return 0; // سبق الترحيل
    const batch = db.batch();
    logArr.forEach((entry, i) => {
      const { id: _localId, ...entryWithoutId } = entry || {};
      batch.set(vacLogCol.doc(), stripUndefined({ ...entryWithoutId, tsNum: i }));
    });
    await batch.commit();
    return logArr.length;
  },
  async remove(id) {
    await vacLogCol.doc(String(id)).delete();
  }
};

const MaintenanceCollectionService = {
  async getAll() {
    const snap = await maintenanceCol.get();
    const requests = [], schedules = [], sheetRequests = [];
    snap.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      delete data.type;
      if (doc.data().type === 'schedule') schedules.push(data);
      else if (doc.data().type === 'sheetRequest') sheetRequests.push(data);
      else requests.push(data);
    });
    return { requests, schedules, sheetRequests };
  },
  async addRequest(req) {
    const { id, ...rest } = req;
    const ref = id ? maintenanceCol.doc(String(id)) : maintenanceCol.doc();
    await ref.set(stripUndefined({ ...rest, type: 'request', createdAt: rest.createdAt || new Date().toISOString() }));
    return { ...req, id: ref.id };
  },
  async addSchedule(sch) {
    const { id, ...rest } = sch;
    const ref = id ? maintenanceCol.doc(String(id)) : maintenanceCol.doc();
    await ref.set(stripUndefined({ ...rest, type: 'schedule', createdAt: rest.createdAt || new Date().toISOString() }));
    return { ...sch, id: ref.id };
  },
  // إضافة دفعة من طلبات الصيانة القادمة من نموذج جوجل (Google Form) — تُستدعى
  // فقط للصفوف الجديدة غير الموجودة مسبقًا (id ثابت مُشتق من بيانات الصف نفسه
  // لمنع التكرار عند إعادة المزامنة). لا يمسّ أي مستند موجود مسبقًا.
  //
  // ملاحظة مهمة (إصلاح): لا نعتمد على أن المستدعي (index.html) صفّى العناصر
  // الجديدة بالفعل، لأن نسخته المحلية (appData.maintenance.sheetRequests) قد
  // تكون فارغة/غير محدّثة بعد (مثلاً عند إعادة تحميل الصفحة ثم الضغط على
  // "مزامنة" بسرعة قبل اكتمال أول تحميل). سابقًا كان هذا يتسبب في إعادة كتابة
  // مستندات موجودة فعلاً على الخادم بـ set() كامل (بلا merge)، فتُمحى حالة
  // done:true المحفوظة وترجع الطلبات المكتملة إلى "لم تتم" بعد كل مزامنة.
  // الآن: الخادم (Firestore) هو مصدر الحقيقة — نتحقق من وجود كل id فعليًا
  // هناك قبل أي كتابة، ونتجاهل تمامًا أي id موجود مسبقًا مهما كانت حالة
  // الذاكرة المحلية للمستدعي.
  async addSheetRequests(items) {
    if (!items || !items.length) return 0;

    // 1) تحقق فعلي من الخادم: أي من هذه الـ ids موجود فعلاً في Firestore؟
    //    'in' في Firestore محدودة بـ 30 عنصرًا كحد أقصى لكل استعلام، نستخدم 10 للأمان.
    const allIds = items.map(it => String(it.id));
    const existingIds = new Set();
    for (let i = 0; i < allIds.length; i += 10) {
      const chunk = allIds.slice(i, i + 10);
      const snap = await maintenanceCol
        .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.forEach(doc => existingIds.add(doc.id));
    }

    // 2) استبعد أي عنصر موجود فعلاً على الخادم — بغض النظر عمّا أرسله المستدعي
    const newItems = items.filter(it => !existingIds.has(String(it.id)));
    if (!newItems.length) return 0;

    // 3) اكتب فقط العناصر الجديدة فعليًا (مؤكَّدة من الخادم)
    for (let i = 0; i < newItems.length; i += 450) {
      const chunk = newItems.slice(i, i + 450);
      const batch = db.batch();
      chunk.forEach(it => {
        const { id, ...rest } = it;
        batch.set(maintenanceCol.doc(String(id)), stripUndefined({ ...rest, type: 'sheetRequest', createdAt: rest.createdAt || new Date().toISOString() }));
      });
      await batch.commit();
    }
    return newItems.length;
  },
  // نفس إصلاح createSingleTypeCollectionService.update: تحديث جزئي مباشر
  // بلا قراءة مسبقة، بدل معاملة كاملة (قراءة+كتابة) لكل تعديل بسيط.
  async update(id, changes) {
    const ref = maintenanceCol.doc(String(id));
    const merged = stripUndefined({ ...changes, updatedAt: new Date().toISOString() });
    await ref.update(merged);
    return { id, ...merged };
  },
  async remove(id) {
    // حذف حقيقي للمستند — لا حاجة لتومبستون هنا لأن كل عنصر مستند مستقل،
    // وحذف المستند نفسه هو "الحذف الدائم" ولا يمكن لأي دمج أن يعيده.
    await maintenanceCol.doc(String(id)).delete();
  },
  // اشتراك لحظي على مستوى الـ Collection بالكامل
  onRealtimeUpdate(callback) {
    return maintenanceCol.onSnapshot((snap) => {
      const requests = [], schedules = [], sheetRequests = [];
      snap.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        delete data.type;
        if (doc.data().type === 'schedule') schedules.push(data);
        else if (doc.data().type === 'sheetRequest') sheetRequests.push(data);
        else requests.push(data);
      });
      callback({ requests, schedules, sheetRequests });
    }, (err) => {
      console.error('خطأ في الاشتراك اللحظي بـ maintenance Collection:', err);
    });
  },
  // ترحيل لمرة واحدة: ينقل appData.maintenance.requests/schedules الحالية
  // (من المستند الكبير) إلى المستندات المستقلة في الـ Collection الجديدة.
  // آمن للتشغيل أكثر من مرة (Idempotent) لأنه يستخدم نفس الـ id كمعرف مستند.
  async migrateFromMainDoc(maintenanceData) {
    const batch = db.batch();
    let count = 0;
    (maintenanceData.requests || []).forEach(r => {
      const { id, ...rest } = r;
      batch.set(maintenanceCol.doc(String(id)), stripUndefined({ ...rest, type: 'request' }), { merge: true });
      count++;
    });
    (maintenanceData.schedules || []).forEach(s => {
      const { id, ...rest } = s;
      batch.set(maintenanceCol.doc(String(id)), stripUndefined({ ...rest, type: 'schedule' }), { merge: true });
      count++;
    });
    if (count > 0) await batch.commit();
    return count;
  }
};
