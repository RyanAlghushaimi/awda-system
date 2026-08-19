// اختبار منطقي لـ MaintenanceCollectionService باستخدام محاكاة Firestore وهمية
// (لا يوجد اتصال شبكة حقيقي بـ Firebase في هذه البيئة، لذلك هذا يتحقق من صحة
// المنطق نفسه: بنية المستندات، الحذف الحقيقي، التحديث الجزئي، والمزامنة اللحظية
// المحاكاة عبر بث الأحداث لكل المشتركين، كما لو كانا جهازين مختلفين).

class FakeDoc {
  constructor(col, id) { this.col = col; this.id = id; }
  _rejectIfUndefined(data) {
    Object.keys(data).forEach(k => {
      if (data[k] === undefined) throw new Error(`FIRESTORE_REJECT: Cannot use "undefined" as a Firestore value (found in field "${k}")`);
    });
  }
  async set(data, opts) {
    this._rejectIfUndefined(data);
    const existing = this.col.docs.get(this.id) || {};
    this.col.docs.set(this.id, opts && opts.merge ? { ...existing, ...data } : { ...data });
    this.col._notify();
  }
  async update(data) {
    this._rejectIfUndefined(data);
    if (!this.col.docs.has(this.id)) throw new Error('NOT_FOUND: ' + this.id);
    this.col.docs.set(this.id, { ...this.col.docs.get(this.id), ...data });
    this.col._notify();
  }
  async delete() {
    this.col.docs.delete(this.id);
    this.col._notify();
  }
  async get() {
    const data = this.col.docs.get(this.id);
    return { exists: !!data, data: () => data };
  }
}
class FakeCollection {
  constructor() { this.docs = new Map(); this._listeners = []; this._counter = 0; }
  doc(id) { return new FakeDoc(this, id || ('auto_' + (++this._counter))); }
  async get() {
    const docs = [];
    this.docs.forEach((data, id) => docs.push({ id, data: () => data }));
    return { forEach: (fn) => docs.forEach(fn) };
  }
  onSnapshot(cb) {
    this._listeners.push(cb);
    cb(this._makeSnap()); // نداء أولي فوري كما يفعل Firestore الحقيقي
    return () => { this._listeners = this._listeners.filter(l => l !== cb); };
  }
  _makeSnap() {
    const docs = [];
    this.docs.forEach((data, id) => docs.push({ id, data: () => data }));
    return { forEach: (fn) => docs.forEach(fn) };
  }
  _notify() { this._listeners.forEach(cb => cb(this._makeSnap())); }
}
class FakeBatch {
  constructor() { this.ops = []; }
  set(ref, data, opts) { this.ops.push(() => ref.set(data, opts)); }
  async commit() { for (const op of this.ops) await op(); }
}
class FakeDb {
  constructor() { this.cols = new Map(); }
  collection(name) { if (!this.cols.has(name)) this.cols.set(name, new FakeCollection()); return this.cols.get(name); }
  batch() { return new FakeBatch(); }
}

function stripUndefined(obj) {
  const out = {};
  Object.keys(obj).forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

// إعادة بناء MaintenanceCollectionService بنفس منطقه الحرفي، لكن بـ db وهمية
function buildService(db) {
  const maintenanceCol = db.collection('maintenance');
  return {
    maintenanceCol,
    async getAll() {
      const snap = await maintenanceCol.get();
      const requests = [], schedules = [];
      snap.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        delete data.type;
        if (doc.data().type === 'schedule') schedules.push(data);
        else requests.push(data);
      });
      return { requests, schedules };
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
    async update(id, changes) { await maintenanceCol.doc(String(id)).update(stripUndefined({ ...changes, updatedAt: new Date().toISOString() })); },
    async remove(id) { await maintenanceCol.doc(String(id)).delete(); },
    onRealtimeUpdate(callback) {
      return maintenanceCol.onSnapshot((snap) => {
        const requests = [], schedules = [];
        snap.forEach(doc => {
          const data = { id: doc.id, ...doc.data() };
          delete data.type;
          if (doc.data().type === 'schedule') schedules.push(data);
          else requests.push(data);
        });
        callback({ requests, schedules });
      });
    },
    async migrateFromMainDoc(maintenanceData) {
      const batch = db.batch();
      let count = 0;
      (maintenanceData.requests || []).forEach(r => { const { id, ...rest } = r; batch.set(maintenanceCol.doc(String(id)), stripUndefined({ ...rest, type: 'request' }), { merge: true }); count++; });
      (maintenanceData.schedules || []).forEach(s => { const { id, ...rest } = s; batch.set(maintenanceCol.doc(String(id)), stripUndefined({ ...rest, type: 'schedule' }), { merge: true }); count++; });
      if (count > 0) await batch.commit();
      return count;
    }
  };
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`✅ ${name}`); passed++; }
  else { console.log(`❌ ${name} ${detail ? '— ' + detail : ''}`); failed++; }
}

async function main() {
  const db = new FakeDb();
  const svc = buildService(db);

  console.log('=== 1) الترحيل من المستند القديم ===');
  const oldData = {
    requests: [{ id: 'r1', title: 'تسريب مياه', status: 'open' }, { id: 'r2', title: 'كهرباء', status: 'open' }],
    schedules: [{ id: 's1', title: 'صيانة مصعد دورية', freq: 'monthly', nextDue: '2026-08-01' }]
  };
  const migratedCount = await svc.migrateFromMainDoc(oldData);
  check('تم ترحيل 3 سجلات (طلبان + جدول)', migratedCount === 3);
  const afterMigrate = await svc.getAll();
  check('الطلبات ظهرت في الـ Collection', afterMigrate.requests.length === 2);
  check('الجداول ظهرت في الـ Collection', afterMigrate.schedules.length === 1);
  check('الترحيل Idempotent (تكراره لا يضاعف السجلات)', await (async () => {
    await svc.migrateFromMainDoc(oldData);
    const again = await svc.getAll();
    return again.requests.length === 2 && again.schedules.length === 1;
  })());

  console.log('\n=== 2) إضافة طلب صيانة جديد ===');
  const added = await svc.addRequest({ id: 'r3', title: 'تكييف معطل', status: 'open', assignee: 'فني1' });
  check('الإضافة نجحت وأعادت نفس id', added.id === 'r3');
  const afterAdd = await svc.getAll();
  check('العدد أصبح 3 طلبات', afterAdd.requests.length === 3);

  console.log('\n=== 3) تعديل طلب موجود ===');
  await svc.update('r3', { status: 'in_progress', assignee: 'فني2' });
  const afterUpdate = await svc.getAll();
  const r3 = afterUpdate.requests.find(r => r.id === 'r3');
  check('التعديل انعكس (status)', r3.status === 'in_progress');
  check('التعديل انعكس (assignee)', r3.assignee === 'فني2');
  check('باقي الحقول لم تتأثر (title)', r3.title === 'تكييف معطل');

  console.log('\n=== 4) حذف طلب — حذف حقيقي وليس تومبستون ===');
  await svc.remove('r1');
  const afterDelete = await svc.getAll();
  check('العنصر اختفى تمامًا من الـ Collection', !afterDelete.requests.some(r => r.id === 'r1'));
  check('لا يوجد أي أثر تومبستون متبقٍ (المستند حُذف فعليًا)', !db.collection('maintenance').docs.has('r1'));

  console.log('\n=== 5) مزامنة لحظية بين "جهازين" (مشتركين مختلفين على نفس الـ Collection) ===');
  let deviceAView = null, deviceBView = null;
  const unsubA = svc.onRealtimeUpdate((data) => { deviceAView = data; });
  const unsubB = svc.onRealtimeUpdate((data) => { deviceBView = data; });
  check('كلا الجهازين استقبلا الحالة الأولية عند الاشتراك', deviceAView !== null && deviceBView !== null);

  // الجهاز A يضيف طلبًا جديدًا
  await svc.addRequest({ id: 'r4', title: 'دهان', status: 'open' });
  check('الجهاز B رأى الإضافة من الجهاز A فورًا (نفس اللحظة)', deviceBView.requests.some(r => r.id === 'r4'));

  // الجهاز B يحذف طلبًا
  await svc.remove('r2');
  check('الجهاز A رأى الحذف الذي نفّذه B فورًا', !deviceAView.requests.some(r => r.id === 'r2'));

  // الجهاز A يعدّل نفس الطلب الذي أضافه B لتوّه
  await svc.update('r4', { status: 'done' });
  check('الجهاز B رأى تعديل A على عنصر أضافه B بنفسه (لا فقدان بيانات)', deviceBView.requests.find(r => r.id === 'r4').status === 'done');

  unsubA(); unsubB();
  check('إلغاء الاشتراك يعمل دون أخطاء', true);

  console.log('\n=== 6) حقل undefined صريح (Firestore الحقيقي يرفضه بدون stripUndefined) ===');
  try {
    // نفس الحالة الواقعية: عنصر HTML غير موجود يعيد undefined لحقل اختياري
    const reqWithUndefined = { id: 'r5', title: 'صيانة سباكة', assignee: undefined, notes: undefined, status: 'open' };
    await svc.addRequest(reqWithUndefined);
    const all = await svc.getAll();
    const saved = all.requests.find(r => r.id === 'r5');
    check('الإضافة نجحت رغم وجود حقول undefined (تمت إزالتها بدل رفض الحفظ)', !!saved);
    check('الحقل الذي كانت قيمته undefined غير موجود إطلاقًا في المستند المحفوظ', saved && !('assignee' in saved) && !('notes' in saved));
  } catch (e) {
    check('الإضافة نجحت رغم وجود حقول undefined', false, e.message);
  }
  try {
    await svc.update('r5', { assignee: undefined, status: 'done' });
    const all2 = await svc.getAll();
    const updated = all2.requests.find(r => r.id === 'r5');
    check('التحديث نجح رغم وجود حقل undefined ضمن التغييرات', updated.status === 'done');
  } catch (e) {
    check('التحديث نجح رغم وجود حقل undefined ضمن التغييرات', false, e.message);
  }

  console.log(`\n=== النتيجة: ${passed} ناجح, ${failed} فاشل ===`);
  process.exit(failed > 0 ? 1 : 0);
}
main();
