// اختبارات شاملة للبنية الجديدة (بعد الهيكلة الكاملة):
// - المصنع العام createSingleTypeCollectionService (يُستخدم لـ vacants/units/employees/collections_tahsil/agents)
// - updateWithFn للعقود المتداخلة داخل مستند المسوّق
// - تعارض Transaction حقيقي بين "جهازين"
// - MigrationRegistry (يمنع إعادة الترحيل)
// - stripUndefined العميقة (Recursive) على حقول متداخلة

class FakeDoc {
  constructor(col, id) { this.col = col; this.id = id; }
  _rejectIfUndefinedDeep(data, path = '') {
    if (Array.isArray(data)) { data.forEach((v, i) => this._rejectIfUndefinedDeep(v, `${path}[${i}]`)); return; }
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(k => {
        if (data[k] === undefined) throw new Error(`FIRESTORE_REJECT: undefined at "${path}.${k}"`);
        this._rejectIfUndefinedDeep(data[k], `${path}.${k}`);
      });
    }
  }
  async get() { const data = this.col.docs.get(this.id); return { exists: !!data, data: () => data, id: this.id }; }
  async set(data, opts) {
    this._rejectIfUndefinedDeep(data);
    const existing = this.col.docs.get(this.id) || {};
    this.col.docs.set(this.id, opts && opts.merge ? { ...existing, ...data } : { ...data });
    if (this.col._bumpVersion) this.col._bumpVersion(this.id);
    this.col._notify();
  }
  async update(data) {
    this._rejectIfUndefinedDeep(data);
    if (!this.col.docs.has(this.id)) throw new Error('NOT_FOUND: ' + this.id);
    this.col.docs.set(this.id, { ...this.col.docs.get(this.id), ...data });
    if (this.col._bumpVersion) this.col._bumpVersion(this.id);
    this.col._notify();
  }
  async delete() {
    this.col.docs.delete(this.id);
    if (this.col._bumpVersion) this.col._bumpVersion(this.id);
    this.col._notify();
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
    cb(this._makeSnap());
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
  delete(ref) { this.ops.push(() => ref.delete()); }
  async commit() { for (const op of this.ops) await op(); }
}
class FakeTransaction {
  constructor(db) { this.db = db; this._reads = new Map(); this._writes = []; }
  async get(ref) {
    const snap = await ref.get();
    this._reads.set(ref.col.name + '/' + ref.id, ref.col._version(ref.id));
    return snap;
  }
  set(ref, data) { this._writes.push({ ref, data }); }
}
class FakeDb {
  constructor() { this.cols = new Map(); }
  collection(name) {
    if (!this.cols.has(name)) {
      const col = new FakeCollection();
      col.name = name;
      col._versions = new Map();
      col._version = (id) => col._versions.get(id) || 0;
      const origNotifySet = col.docs.set.bind(col.docs);
      col._bumpVersion = (id) => col._versions.set(id, (col._versions.get(id) || 0) + 1);
      this.cols.set(name, col);
    }
    return this.cols.get(name);
  }
  batch() { return new FakeBatch(); }
  // محاكاة واقعية لسلوك Firestore الحقيقي: تتبّع إصدار كل مستند وقت القراءة
  // داخل المعاملة؛ فإذا تغيّر المستند (بسبب معاملة أخرى) قبل الكتابة، تُعاد
  // محاولة تنفيذ الدالة كاملة من جديد بأحدث نسخة (Optimistic Concurrency)
  // — تمامًا كما يفعل Firestore SDK الحقيقي تلقائيًا وبشفافية عن المطوّر.
  async runTransaction(fn, maxRetries = 10) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const tx = new FakeTransaction(this);
      const result = await fn(tx);
      let conflict = false;
      for (const [key, versionAtRead] of tx._reads) {
        const [colName, id] = key.split('/');
        const col = this.collection(colName);
        if (col._version(id) !== versionAtRead) { conflict = true; break; }
      }
      if (conflict) continue; // أعد المحاولة بأحدث نسخة
      for (const { ref, data } of tx._writes) await ref.set(data);
      return result;
    }
    throw new Error('TRANSACTION_RETRY_EXCEEDED');
  }
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => { if (value[k] !== undefined) out[k] = stripUndefined(value[k]); });
    return out;
  }
  return value;
}

function createSingleTypeCollectionService(db, collectionName) {
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
    async update(id, changes) {
      const ref = col.doc(String(id));
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('DOC_NOT_FOUND: ' + id);
        const merged = { ...snap.data(), ...stripUndefined(changes), updatedAt: new Date().toISOString() };
        tx.set(ref, merged);
        return { id, ...merged };
      });
    },
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
    async remove(id) { await col.doc(String(id)).delete(); },
    onRealtimeUpdate(callback) {
      return col.onSnapshot((snap) => {
        const items = [];
        snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        callback(items);
      });
    },
    async migrateFromArray(items) {
      const batch = db.batch();
      let count = 0;
      (items || []).forEach(it => { const { id, ...rest } = it; batch.set(col.doc(String(id)), stripUndefined(rest), { merge: true }); count++; });
      if (count > 0) await batch.commit();
      return count;
    },
    async replaceAll(items) {
      const existing = await col.get();
      const ops = [];
      existing.forEach(doc => ops.push({ type: 'delete', ref: col.doc(doc.id) }));
      (items || []).forEach(it => { const { id, ...rest } = it; ops.push({ type: 'set', ref: id ? col.doc(String(id)) : col.doc(), data: stripUndefined(rest) }); });
      const batch = db.batch();
      ops.forEach(op => op.type === 'delete' ? batch.delete(op.ref) : batch.set(op.ref, op.data));
      await batch.commit();
    }
  };
}

function createMigrationRegistry(db) {
  const ref = db.collection('_meta').doc('migrations');
  return {
    async isMigrated(section) { const snap = await ref.get(); return !!(snap.exists && snap.data() && snap.data()[section] === true); },
    async markMigrated(section) { await ref.set({ [section]: true }, { merge: true }); }
  };
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`✅ ${name}`); passed++; }
  else { console.log(`❌ ${name} ${detail ? '— ' + detail : ''}`); failed++; }
}

async function main() {
  // ============================================================
  console.log('=== A) المصنع العام: Vacants (نموذج لكل من Units/Employees/Collections أيضًا) ===');
  const dbA = new FakeDb();
  const Vacants = createSingleTypeCollectionService(dbA, 'vacants');

  const added = await Vacants.add({ id: 'v1', propertyName: 'برج الأمل', unitType: 'شقة', status: 'available' });
  check('إضافة وحدة شاغرة نجحت', added.id === 'v1');

  await Vacants.update('v1', { status: 'reserved' });
  const afterUpdate = (await Vacants.getAll()).find(x => x.id === 'v1');
  check('تعديل الحالة نجح عبر Transaction', afterUpdate.status === 'reserved');

  await Vacants.remove('v1');
  check('الحذف حقيقي (المستند اختفى تمامًا)', !(await Vacants.getAll()).some(x => x.id === 'v1'));
  check('لا يمكن أن يعود العنصر المحذوف عبر أي دمج لاحق (لا يوجد مستند كبير مشترك)', dbA.collection('vacants').docs.size === 0);

  let deviceAView = null, deviceBView = null;
  const unsubA = Vacants.onRealtimeUpdate(v => deviceAView = v);
  const unsubB = Vacants.onRealtimeUpdate(v => deviceBView = v);
  await Vacants.add({ id: 'v2', propertyName: 'برج النور', status: 'available' });
  check('مزامنة لحظية بين جهازين تعمل', deviceBView.some(x => x.id === 'v2'));
  unsubA(); unsubB();

  console.log('\n=== B) undefined عميق (متداخل) — الحالة الحقيقية في saveContracts ===');
  try {
    await Vacants.add({ id: 'v3', propertyName: 'برج تجريبي', notes: undefined, media: [{ url: 'x.jpg', caption: undefined }] });
    const v3 = (await Vacants.getAll()).find(x => x.id === 'v3');
    check('الإضافة نجحت رغم undefined متداخل داخل مصفوفة', !!v3);
    check('undefined المتداخل داخل العنصر داخل المصفوفة أُزيل فعليًا', v3 && v3.media[0] && !('caption' in v3.media[0]));
  } catch (e) { check('الإضافة نجحت رغم undefined متداخل', false, e.message); }

  // ============================================================
  console.log('\n=== C) updateWithFn: العقود المتداخلة داخل مستند المسوّق (Agents+Contracts) ===');
  const dbC = new FakeDb();
  const Agents = createSingleTypeCollectionService(dbC, 'agents');
  await Agents.add({ id: 'a1', name: 'مسوق تجريبي', months: { m1: { contracts: [] }, m2: { contracts: [] } } });

  // إضافة عقد
  await Agents.updateWithFn('a1', fresh => {
    const months = { ...fresh.months };
    months.m1 = { ...months.m1, contracts: [...months.m1.contracts, { id: 'c1', tenantName: 'أحمد', rentAmount: 1000 }] };
    return { months };
  });
  let a1 = (await Agents.getAll()).find(x => x.id === 'a1');
  check('إضافة عقد متداخل نجحت', a1.months.m1.contracts.length === 1);

  // محاكاة تعارض: جهازان يضيفان عقدين مختلفين لنفس المسوّق "في نفس اللحظة"
  // (كلاهما يقرأ نفس النسخة، لكن التنفيذ الفعلي متسلسل هنا؛ المهم أن كل عملية
  // تقرأ أحدث نسخة وقت التنفيذ الفعلي بدل نسخة مجمّدة سابقًا)
  const opDeviceA = Agents.updateWithFn('a1', fresh => {
    const months = { ...fresh.months };
    months.m1 = { ...months.m1, contracts: [...months.m1.contracts, { id: 'c2', tenantName: 'خالد' }] };
    return { months };
  });
  const opDeviceB = Agents.updateWithFn('a1', fresh => {
    const months = { ...fresh.months };
    months.m2 = { ...months.m2, contracts: [...months.m2.contracts, { id: 'c3', tenantName: 'سالم' }] };
    return { months };
  });
  await Promise.all([opDeviceA, opDeviceB]);
  a1 = (await Agents.getAll()).find(x => x.id === 'a1');
  check('عقد الجهاز A (m1) موجود بعد التزامن', a1.months.m1.contracts.some(c => c.id === 'c2'));
  check('عقد الجهاز B (m2) موجود أيضًا ولم يُفقد', a1.months.m2.contracts.some(c => c.id === 'c3'));
  check('العقد الأصلي c1 لم يتأثر', a1.months.m1.contracts.some(c => c.id === 'c1'));

  // حذف عقد متداخل عبر updateWithFn (نفس منطق ContractsRepository.remove)
  await Agents.updateWithFn('a1', fresh => {
    const months = { ...fresh.months };
    Object.keys(months).forEach(mk => { months[mk] = { ...months[mk], contracts: months[mk].contracts.filter(c => c.id !== 'c2') }; });
    return { months };
  });
  a1 = (await Agents.getAll()).find(x => x.id === 'a1');
  check('حذف عقد متداخل نجح (c2 اختفى)', !a1.months.m1.contracts.some(c => c.id === 'c2'));
  check('باقي العقود (c1, c3) لم تتأثر بالحذف', a1.months.m1.contracts.some(c => c.id === 'c1') && a1.months.m2.contracts.some(c => c.id === 'c3'));

  // ============================================================
  console.log('\n=== D) replaceAll: استيراد Excel المجمّع للمسوّقين ===');
  await Agents.add({ id: 'a2', name: 'مسوق قديم سيُحذف بالاستيراد', months: {} });
  await Agents.replaceAll([{ id: 'a3', name: 'مسوق من Excel', months: { m1: { contracts: [{ id: 'cx', tenantName: 'من الإكسل' }] } } }]);
  const allAfterReplace = await Agents.getAll();
  check('المسوّق القديم (a1, a2) حُذف بالكامل بعد الاستبدال الجماعي', !allAfterReplace.some(x => x.id === 'a1' || x.id === 'a2'));
  check('المسوّق الجديد من Excel موجود', allAfterReplace.some(x => x.id === 'a3'));

  // ============================================================
  console.log('\n=== E) MigrationRegistry: منع إعادة الترحيل ===');
  const dbE = new FakeDb();
  const registry = createMigrationRegistry(dbE);
  check('القسم غير مُرحَّل في البداية', !(await registry.isMigrated('units')));
  await registry.markMigrated('units');
  check('القسم أصبح مُرحَّلًا بعد markMigrated', await registry.isMigrated('units'));
  check('قسم آخر لم يتأثر (units لا يؤثر على employees)', !(await registry.isMigrated('employees')));

  // محاكاة إعادة تشغيل التطبيق: نتأكد أن منطق "لا ترحّل مرتين" يعمل حتى لو
  // كانت الـ Collection فارغة فعليًا (لأن كل السجلات حُذفت عمدًا)
  const UnitsSvc = createSingleTypeCollectionService(dbE, 'units');
  const isMigratedNow = await registry.isMigrated('units');
  check('حتى لو كانت units Collection فارغة الآن، النظام يعرف أنها رُحِّلت من قبل ولن يُعيد الترحيل', isMigratedNow === true);

  console.log(`\n=== النتيجة: ${passed} ناجح, ${failed} فاشل ===`);
  process.exit(failed > 0 ? 1 : 0);
}
main();
