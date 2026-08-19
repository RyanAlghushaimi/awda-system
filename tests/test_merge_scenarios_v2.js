// اختبار mergeAppData الجديد بعد الهيكلة الكاملة (6 أقسام منقولة إلى Firestore Collections)
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('/tmp/merge_funcs_new.js', 'utf-8');
const sandbox = { console, Object, Array, Date, Set, Map, JSON, String };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`✅ ${name}`); passed++; }
  else { console.log(`❌ ${name} ${detail ? '— ' + detail : ''}`); failed++; }
}

console.log('=== 1) الأقسام المنقولة: لا دمج مع fresh القديم، تمرير مباشر من local ===');
{
  // fresh = نسخة قديمة جدًا من المستند الكبير، فيها عنصر "محذوف فعليًا" من الـ Collection منذ فترة
  const fresh = {
    agents: [{ id: 'a1', name: 'مسوق قديم يجب ألا يعود' }],
    vacant: { units: [{ id: 'v1', propertyName: 'وحدة قديمة يجب ألا تعود' }] },
    units: { records: [{ id: 'u1' }], log: [{ id: 'l1', action: 'قديم' }] },
    employees: { list: [{ id: 'e1', name: 'موظف قديم يجب ألا يعود' }], log: [] },
    collection: { contracts: [{ id: 'c1' }], log: [] },
    maintenance: { requests: [{ id: 'r1' }], schedules: [], log: [], assigneeMemory: ['فني قديم'] },
    users: { list: [{ id: 'usr1', name: 'أحمد' }] }
  };
  // local = appData الحالي فعليًا في الذاكرة، محدَّث عبر onRealtimeUpdate لكل قسم
  // (لا يحتوي العناصر القديمة أعلاه لأنها حُذفت فعليًا من الـ Collections منذ فترة)
  const local = {
    agents: [{ id: 'a2', name: 'مسوق حالي' }],
    vacant: { units: [{ id: 'v2', propertyName: 'وحدة حالية' }] },
    units: { records: [{ id: 'u2' }], log: [{ id: 'l2', action: 'جديد' }] },
    employees: { list: [{ id: 'e2', name: 'موظف حالي' }], log: [] },
    collection: { contracts: [{ id: 'c2' }], log: [] },
    maintenance: { requests: [{ id: 'r2' }], schedules: [], log: [], assigneeMemory: ['فني جديد'] },
    users: { list: [{ id: 'usr1', name: 'أحمد المطيري' }] } // تعديل بسيط لمستخدم غير مرتبط بالأقسام المنقولة
  };

  const merged = sandbox.mergeAppData(fresh, local);

  check('agents: العنصر القديم (a1) لم يعد إطلاقًا', !merged.agents.some(a => a.id === 'a1'));
  check('agents: العنصر الحالي (a2) موجود', merged.agents.some(a => a.id === 'a2'));

  check('vacant: الوحدة القديمة (v1) لم تعد', !merged.vacant.units.some(u => u.id === 'v1'));
  check('vacant: الوحدة الحالية (v2) موجودة', merged.vacant.units.some(u => u.id === 'v2'));

  check('units.records: السجل القديم (u1) لم يعد', !merged.units.records.some(u => u.id === 'u1'));
  check('units.records: السجل الحالي (u2) موجود', merged.units.records.some(u => u.id === 'u2'));
  check('units.log: السجلّان (log) اندمجا معًا (l1 و l2)', merged.units.log.some(l => l.id === 'l1') && merged.units.log.some(l => l.id === 'l2'));

  check('employees: الموظف القديم (e1) لم يعد', !merged.employees.list.some(e => e.id === 'e1'));
  check('employees: الموظف الحالي (e2) موجود', merged.employees.list.some(e => e.id === 'e2'));

  check('collection: العقد القديم (c1) لم يعد', !merged.collection.contracts.some(c => c.id === 'c1'));
  check('collection: العقد الحالي (c2) موجود', merged.collection.contracts.some(c => c.id === 'c2'));

  check('maintenance: الطلب القديم (r1) لم يعد', !merged.maintenance.requests.some(r => r.id === 'r1'));
  check('maintenance: الطلب الحالي (r2) موجود', merged.maintenance.requests.some(r => r.id === 'r2'));
  check('maintenance.assigneeMemory: اندمجت من الجهتين', merged.maintenance.assigneeMemory.includes('فني قديم') && merged.maintenance.assigneeMemory.includes('فني جديد'));
}

console.log('\n=== 2) users: لم يتأثر بالتغييرات (نفس السلوك القديم المُثبت سابقًا) ===');
{
  const fresh = { users: { list: [{ id: 'usr1', name: 'أحمد', updatedAt: '2026-01-01T00:00:00Z' }] } };
  const local = { users: { list: [{ id: 'usr1', name: 'أحمد المطيري', updatedAt: '2026-01-02T00:00:00Z' }] } };
  const merged = sandbox.mergeAppData(fresh, local);
  check('users: التعديل الأحدث فاز (السلوك القديم لم يتغير)', merged.users.list.find(u => u.id === 'usr1').name === 'أحمد المطيري');
}

console.log('\n=== 3) قسم فارغ في local (مثلاً أول تشغيل قبل init() الكامل) لا يسبب انهيارًا ===');
{
  const fresh = { agents: [{ id: 'old' }] };
  const local = {}; // appData فارغ تمامًا
  let threw = false;
  let merged;
  try { merged = sandbox.mergeAppData(fresh, local); } catch (e) { threw = true; }
  check('لا يحدث استثناء عند local فارغ', !threw);
  check('النتيجة تصبح مصفوفات فارغة آمنة بدل استثناء', merged && Array.isArray(merged.agents) && merged.agents.length === 0);
}

console.log(`\n=== النتيجة: ${passed} ناجح, ${failed} فاشل ===`);
process.exit(failed > 0 ? 1 : 0);
