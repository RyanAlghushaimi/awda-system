// ============================================================
// ===== CONTRACTS MANAGEMENT (إدارة العقود) =====
// ============================================================
function ensureContractsData() {
  if (!appData.contracts) appData.contracts = { agreements: [], log: [] };
  if (!appData.contracts.agreements) appData.contracts.agreements = [];
  if (!appData.contracts.log) appData.contracts.log = [];
}
// ============================================================
// ===== ContractAgreementsRepository: مبني على BaseRepository =====
// ============================================================
// اتفاقيات العقود أصبحت Collection مستقلة (contractAgreements) بدل جزء من
// مستند appData الرئيسي — نفس نمط VacantRepository في إدارة الفوارغ تمامًا،
// يزيل تحميل/دمج/كتابة المستند الكامل مع كل عملية حفظ/تعديل/توثيق/حذف.
const ContractAgreementsRepository = createFirestoreRepository({
  migrationSection: 'contractAgreements',
  deletionSection: 'contracts',
  getLocalArray: () => appData.contracts.agreements,
  setLocalArray: (items) => { appData.contracts.agreements = items; },
  ensureFn: ensureContractsData,
  collectionService: (typeof ContractAgreementsCollectionService !== 'undefined') ? ContractAgreementsCollectionService : null,
  onRemoteChange: () => {
    if (currentPage === 'contracts-undocumented') renderContractsUndocumented();
    if (currentPage === 'contracts-documented') renderContractsDocumented();
  }
});
function logContracts(action, details, before, after) {
  ensureContractsData();
  const entry = {
    id: uid(), action, details,
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    user: currentUser ? currentUser.name : 'غير معروف',
    ts: new Date().toLocaleString('ar-SA'),
    tsNum: Date.now()
  };
  appData.contracts.log.push(entry); // تحديث فوري للشاشة الحالية
  if (appData.contracts.log.length > 300) appData.contracts.log.shift();
  // حفظ في Collection مستقلة (contractsLog) — يصل فورًا لبقية المستخدمين عبر
  // onSnapshot دون أي تعارض مع الحفظ الكامل للمستند الرئيسي
  if (typeof ContractsLogCollectionService !== 'undefined') {
    ContractsLogCollectionService.add(entry).then(saved => {
      if (saved && saved.id) {
        entry.id = saved.id;
        if (currentPage === 'contracts-draft') renderContractsDraft();
      }
    }).catch(e => console.error('تعذر حفظ سجل مسودة العقود:', e));
  }
}
function contractDisplayName(a) { return a.type === 'new' ? a.customerName : (a.type === 'renew' ? a.customerName : (a.type === 'transfer' ? a.tenantName : a.newCustomerName)); }
function contractMonthKey(a) {
  if (!a.createdAt) return '';
  const d = new Date(a.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function populateContractMonthFilter(selectId) {
  ensureContractsData();
  const months = [...new Set(appData.contracts.agreements.map(contractMonthKey).filter(Boolean))].sort().reverse();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">كل الأشهر</option>' + months.map(m => `<option value="${m}">${m}</option>`).join('');
  sel.value = cur;
}
function clearContractFilter(prefix) {
  const sel = document.getElementById(prefix + 'MonthFilter');
  if (sel) sel.value = '';
  const typeSel = document.getElementById(prefix + 'TypeFilter');
  if (typeSel) typeSel.value = '';
  if (prefix === 'contractsUndoc') renderContractsUndocumented(); else renderContractsDocumented();
}
// ---- إنشاء حقول النماذج ----
function cField(id, label, type) {
  return `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">${label}</label><input class="form-control" id="${id}" type="${type || 'text'}"></div>`;
}
function cTextarea(id, label) {
  return `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">${label}</label><textarea class="form-control" id="${id}" rows="2"></textarea></div>`;
}
function cDatePair(id1, id2, label) {
  return `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">${label}</label><div style="display:flex;gap:10px;"><input class="form-control" type="text" id="${id1}" placeholder="يوم/شهر/سنة" maxlength="10" inputmode="numeric" oninput="autoFormatRentalDateInput(this)"><input class="form-control" type="text" id="${id2}"></div></div>`;
}
// تنسيق تلقائي أثناء الكتابة: يحوّل الأرقام المُدخلة إلى صيغة يوم/شهر/سنة
// بإضافة الشرطات المائلة تلقائيًا (مثال: كتابة 15082026 تصبح 15/08/2026).
function autoFormatRentalDateInput(el) {
  const digits = el.value.replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length > 4) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
  else if (digits.length > 2) out = digits.slice(0, 2) + '/' + digits.slice(2);
  el.value = out;
}
// تحويل صيغة الإدخال (يوم/شهر/سنة أو سنة/شهر/يوم) إلى صيغة ISO (yyyy-mm-dd)
// للتخزين الداخلي، حتى تبقى مقارنات التحقق من صحة نطاقات التاريخ تعمل بشكل
// صحيح (المقارنة النصية بصيغة ISO فقط هي التي تُرتَّب تصاعديًا بشكل سليم).
function parseRentalDateInput(str) {
  if (!str) return '';
  str = String(str).trim();
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return str;
}
function currentUserDisplayName() {
  return (currentUser && currentUser.name) || '';
}
function canChangeSoldBy() {
  if (!currentUser) return true;
  return currentUser.role === 'مدير' || currentUser.role === 'مشرف' ||
    currentUser.name === 'حماد الحماد' || currentUser.username === 'حماد الحماد' ||
    currentUser.name === 'نادر عبدالتواب' || currentUser.username === 'نادر عبدالتواب' ||
    !!currentUser.canChangeSoldBy;
}
// دالة مستقلة لتحديد من يرى كل الاتفاقيات غير الموثقة (بدل الاعتماد على
// canChangeSoldBy رغم تطابق قائمة الأدوار حالياً) — لتفادي تغيّر أحد الغرضين
// بالخطأ عند تعديل الآخر مستقبلاً.
function canViewAllUndocumentedAgreements() {
  if (!currentUser) return true;
  return currentUser.role === 'مدير' || currentUser.role === 'مشرف' ||
    currentUser.name === 'حماد الحماد' || currentUser.username === 'حماد الحماد' ||
    currentUser.name === 'نادر عبدالتواب' || currentUser.username === 'نادر عبدالتواب' ||
    !!currentUser.canViewAllUndocAgreements;
}
function cSoldByField(id) {
  const allowChange = canChangeSoldBy();
  const btn = allowChange ? `<button type="button" class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="openSoldByPicker('${id}')" title="تغيير المسوق"><i class="fas fa-user-edit"></i> تغيير المسوق</button>` : '';
  return `<div class="form-group" style="margin-bottom:14px;"><label class="form-label">المسوق Sold By</label><input class="form-control" id="${id}" type="text" readonly>${btn}</div>`;
}
function openSoldByPicker(id) {
  if (!canChangeSoldBy()) return;
  ensureUsersData();
  const users = (appData.users.list || []).filter(u => u.status === 'active');
  if (!users.length) { showToast('لا يوجد مستخدمون متاحون', 'error'); return; }
  const options = users.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
  Swal.fire({
    title: 'اختيار المسوق', html: `<select id="soldByPickerSelect" class="form-control">${options}</select>`,
    showCancelButton: true, confirmButtonText: 'اختيار', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137',
    preConfirm: () => document.getElementById('soldByPickerSelect').value
  }).then(r => {
    if (r.isConfirmed && r.value) {
      const el = document.getElementById(id);
      if (el) el.value = r.value;
    }
  });
}
let contractEditingId = null;
function renderContractsEntryPage() {
  document.getElementById('contractNewFields').innerHTML =
    cDatePair('cn-rentalFrom', 'cn-rentalTo', 'تاريخ التأجير Rental Date') +
    cField('cn-location', 'مكان الوحدة Location') +
    cField('cn-unitName', 'اسم الوحدة Unit Name') +
    cField('cn-customerName', 'اسم العميل Customer Name') +
    cField('cn-idNumber', 'رقم الهوية Number ID') +
    cField('cn-mobile', 'رقم الجوال Mobile Number') +
    cField('cn-dob', 'تاريخ الميلاد Date of Birth') +
    cField('cn-saleValue', 'قيمة التأجير Sale Value') +
    cField('cn-howToPay', 'طريقة الدفع How to Pay') +
    cField('cn-insurance', 'التأمين Insurance') +
    cField('cn-feeAmount', 'الرسوم Fee Amount') +
    cSoldByField('cn-soldBy') +
    cTextarea('cn-report', 'تقرير ناجز Najiz Report') +
    cTextarea('cn-notes', 'ملاحظات Notes');
  document.getElementById('contractNewReceiveFields').innerHTML =
    cField('cn-elecMeter', 'رقم عداد الكهرباء Electricity Meter Number') +
    cField('cn-elecBill', 'المبلغ Bill') +
    cTextarea('cn-elecNotes', 'ملاحظات Notes') +
    cField('cn-waterMeter', 'رقم عداد الماء Water Meter Number') +
    cField('cn-waterBill', 'المبلغ Bill') +
    cTextarea('cn-waterNotes', 'ملاحظات Notes');
  document.getElementById('contractNewFinalFields').innerHTML =
    cField('cn-unpaid', 'سداد لم يدفع Unpaid Payment') +
    cTextarea('cn-notes2', 'ملاحظات Notes');

  document.getElementById('contractRenewFields').innerHTML =
    cDatePair('cr-rentalFrom', 'cr-rentalTo', 'تاريخ التأجير Rental Date') +
    cField('cr-location', 'مكان الوحدة Location') +
    cField('cr-unitName', 'اسم الوحدة Unit Name') +
    cField('cr-customerName', 'اسم العميل Customer Name') +
    cField('cr-idNumber', 'رقم الهوية Number ID') +
    cField('cr-mobile', 'رقم الجوال Mobile Number') +
    cField('cr-dob', 'تاريخ الميلاد Date of Birth') +
    cField('cr-saleValueOld', 'قيمة التأجير الحالي Sale Value Old') +
    cField('cr-saleValueNew', 'قيمة التأجير الجديد Sale Value New') +
    cField('cr-howToPay', 'طريقة الدفع How to Pay') +
    cField('cr-insurance', 'التأمين Insurance') +
    cField('cr-feeAmount', 'الرسوم Fee Amount') +
    cSoldByField('cr-soldBy') +
    cTextarea('cr-report', 'تقرير ناجز Najiz Report') +
    cTextarea('cr-notes', 'ملاحظات Notes');
  document.getElementById('contractRenewReceiveFields').innerHTML =
    cField('cr-elecMeter', 'رقم عداد الكهرباء Electricity Meter Number') +
    cField('cr-elecBill', 'المبلغ Bill') +
    cTextarea('cr-elecNotes', 'ملاحظات Notes') +
    cField('cr-waterMeter', 'رقم عداد الماء Water Meter Number') +
    cField('cr-waterBill', 'المبلغ Bill') +
    cTextarea('cr-waterNotes', 'ملاحظات Notes');
  document.getElementById('contractRenewFinalFields').innerHTML =
    cField('cr-unpaid', 'سداد لم يدفع Unpaid Payment') +
    cTextarea('cr-notes2', 'ملاحظات Notes');

  document.getElementById('contractChangeFields').innerHTML =
    cField('cc-reason', 'السبب Reason') +
    cDatePair('cc-beforeFrom', 'cc-beforeTo', 'تاريخ التأجير السابق Before Rental Date') +
    cDatePair('cc-newFrom', 'cc-newTo', 'تاريخ التأجير الجديد New Rental Date') +
    cField('cc-location', 'مكان الوحدة Location') +
    cField('cc-unitName', 'اسم الوحدة Unit Name') +
    cField('cc-oldCustomerName', 'اسم العميل السابق Old Customer Name') +
    cField('cc-oldIdNumber', 'رقم الهوية Number ID') +
    cField('cc-oldMobile', 'رقم الجوال Mobile Number') +
    cField('cc-newCustomerName', 'اسم العميل الجديد New Customer Name') +
    cField('cc-newIdNumber', 'رقم الهوية Number ID') +
    cField('cc-newMobile', 'رقم الجوال Mobile Number') +
    cField('cc-dob', 'تاريخ الميلاد Date of Birth') +
    cField('cc-saleValueOld', 'قيمة التأجير السابق Sale Value Old') +
    cField('cc-saleValueNew', 'قيمة التأجير الجديد Sale Value New') +
    cField('cc-howToPay', 'طريقة الدفع How to Pay') +
    cField('cc-insurance', 'التأمين Insurance') +
    cField('cc-services', 'السعي Services and Pursuit') +
    cSoldByField('cc-soldBy') +
    cTextarea('cc-report', 'تقرير ناجز Najiz Report');
  document.getElementById('contractChangeReceiveFields').innerHTML =
    cField('cc-elecMeter', 'رقم عداد الكهرباء Electricity Meter Number') +
    cField('cc-elecBill', 'المبلغ Bill') +
    cTextarea('cc-elecNotes', 'ملاحظات Notes') +
    cField('cc-waterMeter', 'رقم عداد الماء Water Meter Number') +
    cField('cc-waterBill', 'المبلغ Bill') +
    cTextarea('cc-waterNotes', 'ملاحظات Notes');
  document.getElementById('contractChangeFinalFields').innerHTML =
    cField('cc-unpaid', 'سداد لم يدفع Unpaid Payment') +
    cTextarea('cc-notes2', 'ملاحظات Notes');

  document.getElementById('contractTransferFields').innerHTML =
    cDatePair('ct-rentalFrom', 'ct-rentalTo', 'تاريخ التأجير Rental Date') +
    cField('ct-unitName', 'اسم الوحدة Unit Name') +
    cField('ct-landlordName', 'اسم المؤجر') +
    cField('ct-landlordIdNumber', 'رقم الهوية Number ID') +
    cField('ct-landlordMobile', 'رقم الجوال Mobile Number') +
    cField('ct-landlordDob', 'تاريخ الميلاد Date of Birth') +
    cField('ct-tenantName', 'اسم المستأجر') +
    cField('ct-tenantIdNumber', 'رقم الهوية Number ID') +
    cField('ct-tenantMobile', 'رقم الجوال Mobile Number') +
    cField('ct-tenantDob', 'تاريخ الميلاد Date of Birth') +
    cField('ct-saleValue', 'قيمة التأجير Sale Value') +
    cField('ct-howToPay', 'طريقة الدفع How to Pay') +
    cField('ct-insurance', 'التأمين Insurance') +
    cField('ct-feeAmount', 'الرسوم Fee Amount') +
    cSoldByField('ct-soldBy') +
    cTextarea('ct-report', 'تقرير ناجز Najiz Report') +
    cTextarea('ct-notes', 'ملاحظات Notes');
  document.getElementById('contractTransferReceiveFields').innerHTML =
    cField('ct-elecMeter', 'رقم عداد الكهرباء Electricity Meter Number') +
    cField('ct-elecBill', 'المبلغ Bill') +
    cTextarea('ct-elecNotes', 'ملاحظات Notes') +
    cField('ct-waterMeter', 'رقم عداد الماء Water Meter Number') +
    cField('ct-waterBill', 'المبلغ Bill') +
    cTextarea('ct-waterNotes', 'ملاحظات Notes');
  document.getElementById('contractTransferFinalFields').innerHTML =
    cField('ct-unpaid', 'سداد لم يدفع Unpaid Payment') +
    cTextarea('ct-notes2', 'ملاحظات Notes');

  ['cn-soldBy', 'cr-soldBy', 'cc-soldBy', 'ct-soldBy'].forEach(id => { const el = document.getElementById(id); if (el) el.value = currentUserDisplayName(); });

  contractEditingId = null;
  document.getElementById('contractsTypeChooser').style.display = '';
  document.getElementById('contractFormNew').style.display = 'none';
  document.getElementById('contractFormRenew').style.display = 'none';
  document.getElementById('contractFormChange').style.display = 'none';
  document.getElementById('contractFormTransfer').style.display = 'none';
}
function showContractForm(type) {
  document.getElementById('contractsTypeChooser').style.display = 'none';
  document.getElementById('contractFormNew').style.display = type === 'new' ? '' : 'none';
  document.getElementById('contractFormRenew').style.display = type === 'renew' ? '' : 'none';
  document.getElementById('contractFormChange').style.display = type === 'change' ? '' : 'none';
  document.getElementById('contractFormTransfer').style.display = type === 'transfer' ? '' : 'none';
}
function cancelContractForm() {
  contractEditingId = null;
  document.getElementById('contractsTypeChooser').style.display = '';
  document.getElementById('contractFormNew').style.display = 'none';
  document.getElementById('contractFormRenew').style.display = 'none';
  document.getElementById('contractFormChange').style.display = 'none';
  document.getElementById('contractFormTransfer').style.display = 'none';
}
function fillContractForm(a) {
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  if (a.type === 'new') {
    setv('cn-rentalFrom', fmtRentalDate(a.rentalFrom)); setv('cn-rentalTo', a.rentalTo); setv('cn-location', a.location);
    setv('cn-unitName', a.unitName); setv('cn-customerName', a.customerName); setv('cn-idNumber', a.idNumber);
    setv('cn-mobile', a.mobile); setv('cn-dob', a.dob); setv('cn-saleValue', a.saleValue); setv('cn-howToPay', a.howToPay);
    setv('cn-insurance', a.insurance); setv('cn-feeAmount', a.feeAmount); setv('cn-soldBy', a.soldBy); setv('cn-notes', a.notes);
    setv('cn-elecMeter', a.elecMeter); setv('cn-elecBill', a.elecBill); setv('cn-elecNotes', a.elecNotes);
    setv('cn-waterMeter', a.waterMeter); setv('cn-waterBill', a.waterBill); setv('cn-waterNotes', a.waterNotes);
    setv('cn-unpaid', a.unpaidPayment); setv('cn-notes2', a.notes2); setv('cn-report', a.report);
  } else if (a.type === 'renew') {
    setv('cr-rentalFrom', fmtRentalDate(a.rentalFrom)); setv('cr-rentalTo', a.rentalTo); setv('cr-location', a.location);
    setv('cr-unitName', a.unitName); setv('cr-customerName', a.customerName); setv('cr-idNumber', a.idNumber);
    setv('cr-mobile', a.mobile); setv('cr-dob', a.dob); setv('cr-saleValueOld', a.saleValueOld); setv('cr-saleValueNew', a.saleValueNew);
    setv('cr-howToPay', a.howToPay); setv('cr-insurance', a.insurance); setv('cr-feeAmount', a.feeAmount);
    setv('cr-soldBy', a.soldBy); setv('cr-notes', a.notes);
    setv('cr-elecMeter', a.elecMeter); setv('cr-elecBill', a.elecBill); setv('cr-elecNotes', a.elecNotes);
    setv('cr-waterMeter', a.waterMeter); setv('cr-waterBill', a.waterBill); setv('cr-waterNotes', a.waterNotes);
    setv('cr-unpaid', a.unpaidPayment); setv('cr-notes2', a.notes2); setv('cr-report', a.report);
  } else if (a.type === 'transfer') {
    setv('ct-rentalFrom', fmtRentalDate(a.rentalFrom)); setv('ct-rentalTo', a.rentalTo);
    setv('ct-unitName', a.unitName);
    setv('ct-landlordName', a.landlordName); setv('ct-landlordIdNumber', a.landlordIdNumber);
    setv('ct-landlordMobile', a.landlordMobile); setv('ct-landlordDob', a.landlordDob);
    setv('ct-tenantName', a.tenantName); setv('ct-tenantIdNumber', a.tenantIdNumber);
    setv('ct-tenantMobile', a.tenantMobile); setv('ct-tenantDob', a.tenantDob);
    setv('ct-saleValue', a.saleValue); setv('ct-howToPay', a.howToPay); setv('ct-insurance', a.insurance);
    setv('ct-feeAmount', a.feeAmount); setv('ct-soldBy', a.soldBy); setv('ct-report', a.report); setv('ct-notes', a.notes);
    setv('ct-elecMeter', a.elecMeter); setv('ct-elecBill', a.elecBill); setv('ct-elecNotes', a.elecNotes);
    setv('ct-waterMeter', a.waterMeter); setv('ct-waterBill', a.waterBill); setv('ct-waterNotes', a.waterNotes);
    setv('ct-unpaid', a.unpaidPayment); setv('ct-notes2', a.notes2);
  } else {
    setv('cc-beforeFrom', fmtRentalDate(a.beforeFrom)); setv('cc-beforeTo', a.beforeTo); setv('cc-newFrom', fmtRentalDate(a.newFrom)); setv('cc-newTo', a.newTo);
    setv('cc-location', a.location); setv('cc-unitName', a.unitName);
    setv('cc-oldCustomerName', a.oldCustomerName); setv('cc-oldIdNumber', a.oldIdNumber); setv('cc-oldMobile', a.oldMobile);
    setv('cc-newCustomerName', a.newCustomerName); setv('cc-newIdNumber', a.newIdNumber); setv('cc-newMobile', a.newMobile);
    setv('cc-reason', a.reason);
    setv('cc-dob', a.dob); setv('cc-saleValueOld', a.saleValueOld); setv('cc-saleValueNew', a.saleValueNew); setv('cc-howToPay', a.howToPay); setv('cc-insurance', a.insurance);
    setv('cc-services', a.services); setv('cc-soldBy', a.soldBy);
    setv('cc-elecMeter', a.elecMeter); setv('cc-elecBill', a.elecBill); setv('cc-elecNotes', a.elecNotes);
    setv('cc-waterMeter', a.waterMeter); setv('cc-waterBill', a.waterBill); setv('cc-waterNotes', a.waterNotes);
    setv('cc-unpaid', a.unpaidPayment); setv('cc-notes2', a.notes2); setv('cc-report', a.report);
  }
}
let contractSaveInProgress = false;
async function saveContractAgreement(type, evt) {
  // حماية صارمة ضد الحفظ المكرر (النقر المتكرر على زر الحفظ أثناء الانتظار):
  // أي نداء ثانٍ يصل قبل انتهاء الأول يُرفض فورًا دون أي تأثير.
  if (contractSaveInProgress) return;
  // حماية دفاعية إضافية: التحقق أيضاً من حالة الزر نفسه في الـ DOM (وليس فقط
  // من المتغيّر العام)، حتى لو حدث تلاعب خارجي بالمتغيّر أو تعارض نادر.
  if (evt && evt.currentTarget && evt.currentTarget.disabled) return;
  contractSaveInProgress = true;
  const btn = evt && evt.currentTarget;
  const btnOriginalHtml = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ...'; }

  function restoreButton() {
    // نؤخر إعادة تفعيل الحماية إلى دورة الحدث التالية (macrotask) وليس فوراً:
    // بما أن الحفظ الآن فوري (Optimistic UI) بلا await قبل هذه النقطة، فإن
    // تصفير contractSaveInProgress بشكل متزامن هنا كان يسمح لأي نقرات إضافية
    // وصلت ضمن نفس الحلقة التزامنية (مثل اختبار نقر سريع متكرر) بالمرور دون
    // اعتراض، لأن العلم كان يُصبح false قبل أن تصل النقرة التالية أساساً.
    // التأخير عبر setTimeout(0) يضمن بقاء الحماية فعّالة طوال أي سلسلة نقرات/
    // نداءات متزامنة، وتُعاد فتحها بمجرد خلوّ الـ call stack الحالي.
    // ✅ إصلاح دقيق: استخدام microtask (Promise.resolve().then) بدل macrotask
    // (setTimeout) لتصفير العلم الواقي. الفرق حاسم هنا:
    // - halqة for متزامنة بلا أي await بين نقراتها (مثل اختبار 10 نقرات
    //   سريعة): لا تُعالَج أي microtask حتى تنتهي الحلقة بالكامل، فتبقى
    //   الحماية فعّالة طوال الحلقة تماماً كما مع setTimeout.
    // - نداءات متتالية بعضها بعد بعض عبر await (كما في نموذج اختبار حفظ
    //   تاريخ صحيح بعد تاريخ خاطئ): الـ microtask تُعالَج قبل استئناف الكود
    //   الذي بعد await مباشرة، فيُعاد العلم إلى false في الوقت المناسب ولا
    //   يُحجَب النداء المشروع التالي (وهو ما كان يفشل مع setTimeout السابق،
    //   لأن الفاصل الزمني بين النداءين المتتاليين قصير جداً بحيث لا يكفي
    //   لتنفيذ أي macrotask بينهما).
    Promise.resolve().then(() => { contractSaveInProgress = false; });
    if (btn) { btn.disabled = false; btn.innerHTML = btnOriginalHtml; }
  }

  ensureContractsData();
  const val = id => (document.getElementById(id)?.value || '').trim();
  const valDate = id => parseRentalDateInput(val(id));
  let data;
  if (type === 'new') {
    data = {
      rentalFrom: valDate('cn-rentalFrom'), rentalTo: val('cn-rentalTo'), location: val('cn-location'), unitName: val('cn-unitName'),
      customerName: val('cn-customerName'), idNumber: val('cn-idNumber'), mobile: val('cn-mobile'), dob: val('cn-dob'),
      saleValue: val('cn-saleValue'), howToPay: val('cn-howToPay'), insurance: val('cn-insurance'), feeAmount: val('cn-feeAmount'),
      soldBy: val('cn-soldBy'), notes: val('cn-notes'),
      elecMeter: val('cn-elecMeter'), elecBill: val('cn-elecBill'), elecNotes: val('cn-elecNotes'),
      waterMeter: val('cn-waterMeter'), waterBill: val('cn-waterBill'), waterNotes: val('cn-waterNotes'),
      unpaidPayment: val('cn-unpaid'), notes2: val('cn-notes2'), report: val('cn-report')
    };
    if (!data.customerName) { showToast('يرجى إدخال اسم العميل', 'error'); restoreButton(); return; }
  } else if (type === 'renew') {
    data = {
      rentalFrom: valDate('cr-rentalFrom'), rentalTo: val('cr-rentalTo'), location: val('cr-location'), unitName: val('cr-unitName'),
      customerName: val('cr-customerName'), idNumber: val('cr-idNumber'), mobile: val('cr-mobile'), dob: val('cr-dob'),
      saleValueOld: val('cr-saleValueOld'), saleValueNew: val('cr-saleValueNew'), howToPay: val('cr-howToPay'), insurance: val('cr-insurance'), feeAmount: val('cr-feeAmount'),
      soldBy: val('cr-soldBy'), notes: val('cr-notes'),
      elecMeter: val('cr-elecMeter'), elecBill: val('cr-elecBill'), elecNotes: val('cr-elecNotes'),
      waterMeter: val('cr-waterMeter'), waterBill: val('cr-waterBill'), waterNotes: val('cr-waterNotes'),
      unpaidPayment: val('cr-unpaid'), notes2: val('cr-notes2'), report: val('cr-report')
    };
    if (!data.customerName) { showToast('يرجى إدخال اسم العميل', 'error'); restoreButton(); return; }
  } else if (type === 'transfer') {
    data = {
      rentalFrom: valDate('ct-rentalFrom'), rentalTo: val('ct-rentalTo'), unitName: val('ct-unitName'),
      landlordName: val('ct-landlordName'), landlordIdNumber: val('ct-landlordIdNumber'), landlordMobile: val('ct-landlordMobile'), landlordDob: val('ct-landlordDob'),
      tenantName: val('ct-tenantName'), tenantIdNumber: val('ct-tenantIdNumber'), tenantMobile: val('ct-tenantMobile'), tenantDob: val('ct-tenantDob'),
      saleValue: val('ct-saleValue'), howToPay: val('ct-howToPay'), insurance: val('ct-insurance'), feeAmount: val('ct-feeAmount'),
      soldBy: val('ct-soldBy'), notes: val('ct-notes'), report: val('ct-report'),
      elecMeter: val('ct-elecMeter'), elecBill: val('ct-elecBill'), elecNotes: val('ct-elecNotes'),
      waterMeter: val('ct-waterMeter'), waterBill: val('ct-waterBill'), waterNotes: val('ct-waterNotes'),
      unpaidPayment: val('ct-unpaid'), notes2: val('ct-notes2')
    };
    if (!data.tenantName) { showToast('يرجى إدخال اسم المستأجر', 'error'); restoreButton(); return; }
  } else {
    data = {
      beforeFrom: valDate('cc-beforeFrom'), beforeTo: val('cc-beforeTo'), newFrom: valDate('cc-newFrom'), newTo: val('cc-newTo'),
      location: val('cc-location'), unitName: val('cc-unitName'),
      oldCustomerName: val('cc-oldCustomerName'), oldIdNumber: val('cc-oldIdNumber'), oldMobile: val('cc-oldMobile'),
      newCustomerName: val('cc-newCustomerName'), newIdNumber: val('cc-newIdNumber'), newMobile: val('cc-newMobile'),
      reason: val('cc-reason'),
      dob: val('cc-dob'), saleValueOld: val('cc-saleValueOld'), saleValueNew: val('cc-saleValueNew'), howToPay: val('cc-howToPay'), insurance: val('cc-insurance'),
      services: val('cc-services'), soldBy: val('cc-soldBy'),
      elecMeter: val('cc-elecMeter'), elecBill: val('cc-elecBill'), elecNotes: val('cc-elecNotes'),
      waterMeter: val('cc-waterMeter'), waterBill: val('cc-waterBill'), waterNotes: val('cc-waterNotes'),
      unpaidPayment: val('cc-unpaid'), notes2: val('cc-notes2'), report: val('cc-report')
    };
    if (!data.newCustomerName) { showToast('يرجى إدخال اسم العميل الجديد', 'error'); restoreButton(); return; }
  }
  let wasDocumented = false;
  let displayName = (type === 'new' || type === 'renew') ? data.customerName : (type === 'transfer' ? data.tenantName : data.newCustomerName);
  let agreementForRepo = null;
  let isEdit = false;
  if (contractEditingId) {
    const a = appData.contracts.agreements.find(x => x.id === contractEditingId);
    if (!a) { contractEditingId = null; restoreButton(); return; }
    const before = JSON.parse(JSON.stringify(a));
    wasDocumented = a.status === 'documented';
    Object.assign(a, data, { updatedAt: new Date().toISOString() });
    if (wasDocumented) { a.status = 'undocumented'; a.documentedBy = null; a.documentedAt = null; }
    logContracts('edit', `تم تعديل الاتفاقية: ${contractDisplayName(a)}`, before, a);
    agreementForRepo = a; isEdit = true;
  } else {
    const agreement = { id: uid(), type, status: 'undocumented', createdBy: currentUser ? currentUser.name : 'غير معروف', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...data };
    appData.contracts.agreements.push(agreement);
    logContracts('add', `تمت إضافة اتفاقية (${type === 'new' ? 'تأجير جديد' : (type === 'renew' ? 'تجديد عقد' : (type === 'transfer' ? 'تأجير للغير' : 'تغيير مؤجر'))}): ${displayName || '—'}`, null, agreement);
    agreementForRepo = agreement;
  }
  // استجابة فورية (Optimistic UI): لا ننتظر اكتمال الحفظ قبل إخبار المستخدم
  // والانتقال للصفحة التالية. الحفظ الفعلي الآن يكتب مباشرة إلى مستند
  // الاتفاقية في Collection مستقلة (contractAgreements) — نفس أسلوب
  // VacantRepository في إدارة الفوارغ — بدل تحميل/دمج/كتابة المستند الكامل.
  const repoSavePromise = isEdit
    ? ContractAgreementsRepository.update(agreementForRepo.id, agreementForRepo)
    : ContractAgreementsRepository.add(agreementForRepo);
  repoSavePromise.catch(e => {
    console.error('[saveContractAgreement]', e);
    showToast('تعذر حفظ الاتفاقية على الخادم — تأكد من الإنترنت. البيانات محفوظة محليًا وستُرسل تلقائيًا عند نجاح المحاولة القادمة', 'error');
  });
  showToast(wasDocumented ? 'تم تحديث الاتفاقية — أُعيدت إلى غير موثقة' : 'تم حفظ الاتفاقية بنجاح', 'success');
  // تذكير خفيف (غير مانع) لمن يقدر يغيّر المسوّق: لو حفظ والاسم المسجَّل لا
  // يزال اسمه هو (القيمة الافتراضية عند فتح النموذج)، يُذكَّر بالتحقق —
  // لأن نسيان تغييره يعني أن الاتفاقية لن تظهر لاحقاً عند الموظف الفعلي.
  if (canChangeSoldBy() && data.soldBy === currentUserDisplayName()) {
    setTimeout(() => showToast('تذكير: تأكد من صحة اسم "المسوّق" المسجَّل على الاتفاقية', 'info'), 1600);
  }
  contractEditingId = null;
  restoreButton();
  cancelContractForm();
  showPage('contracts-undocumented');
}
function editContractAgreement(id) {
  const a = appData.contracts.agreements.find(x => x.id === id); if (!a) return;
  showPage('contracts-entry');
  contractEditingId = id;
  showContractForm(a.type);
  fillContractForm(a);
}
function viewContractAgreement(id) {
  const a = appData.contracts.agreements.find(x => x.id === id); if (!a) return;
  const rows = a.type === 'new' ? [
    ['تاريخ التأجير', `${fmtRentalDate(a.rentalFrom)} - ${a.rentalTo || ''}`], ['مكان الوحدة', a.location], ['اسم الوحدة', a.unitName],
    ['اسم العميل', a.customerName], ['رقم الهوية', a.idNumber], ['رقم الجوال', a.mobile], ['تاريخ الميلاد', a.dob],
    ['قيمة التأجير', a.saleValue], ['طريقة الدفع', a.howToPay], ['التأمين', a.insurance], ['الرسوم', a.feeAmount],
    ['المسوق', a.soldBy], ['تقرير ناجز', a.report], ['ملاحظات', a.notes], ['عداد الكهرباء', a.elecMeter], ['مبلغ الكهرباء', a.elecBill],
    ['عداد الماء', a.waterMeter], ['مبلغ الماء', a.waterBill], ['سداد لم يدفع', a.unpaidPayment]
  ] : a.type === 'renew' ? [
    ['تاريخ التأجير', `${fmtRentalDate(a.rentalFrom)} - ${a.rentalTo || ''}`], ['مكان الوحدة', a.location], ['اسم الوحدة', a.unitName],
    ['اسم العميل', a.customerName], ['رقم الهوية', a.idNumber], ['رقم الجوال', a.mobile], ['تاريخ الميلاد', a.dob],
    ['قيمة التأجير الحالي', a.saleValueOld], ['قيمة التأجير الجديد', a.saleValueNew], ['طريقة الدفع', a.howToPay], ['التأمين', a.insurance], ['الرسوم', a.feeAmount],
    ['المسوق', a.soldBy], ['تقرير ناجز', a.report], ['ملاحظات', a.notes], ['عداد الكهرباء', a.elecMeter], ['مبلغ الكهرباء', a.elecBill],
    ['عداد الماء', a.waterMeter], ['مبلغ الماء', a.waterBill], ['سداد لم يدفع', a.unpaidPayment]
  ] : a.type === 'transfer' ? [
    ['تاريخ التأجير', `${fmtRentalDate(a.rentalFrom)} - ${a.rentalTo || ''}`], ['اسم الوحدة', a.unitName],
    ['اسم المؤجر', a.landlordName], ['رقم الهوية', a.landlordIdNumber], ['رقم الجوال', a.landlordMobile], ['تاريخ الميلاد', a.landlordDob],
    ['اسم المستأجر', a.tenantName], ['رقم الهوية', a.tenantIdNumber], ['رقم الجوال', a.tenantMobile], ['تاريخ الميلاد', a.tenantDob],
    ['قيمة التأجير', a.saleValue], ['طريقة الدفع', a.howToPay], ['التأمين', a.insurance], ['الرسوم', a.feeAmount],
    ['المسوق', a.soldBy], ['تقرير ناجز', a.report], ['ملاحظات', a.notes], ['عداد الكهرباء', a.elecMeter], ['مبلغ الكهرباء', a.elecBill],
    ['عداد الماء', a.waterMeter], ['مبلغ الماء', a.waterBill], ['سداد لم يدفع', a.unpaidPayment]
  ] : [
    ['السبب', a.reason],
    ['تاريخ التأجير السابق', `${fmtRentalDate(a.beforeFrom)} - ${a.beforeTo || ''}`], ['تاريخ التأجير الجديد', `${fmtRentalDate(a.newFrom)} - ${a.newTo || ''}`],
    ['مكان الوحدة', a.location], ['اسم الوحدة', a.unitName], ['العميل السابق', a.oldCustomerName], ['العميل الجديد', a.newCustomerName],
    ['رقم الهوية (جديد)', a.newIdNumber], ['رقم الجوال (جديد)', a.newMobile], ['تاريخ الميلاد', a.dob],
    ['قيمة التأجير السابق', a.saleValueOld], ['قيمة التأجير الجديد', a.saleValueNew],
    ['طريقة الدفع', a.howToPay], ['التأمين', a.insurance], ['السعي', a.services], ['المسوق', a.soldBy], ['تقرير ناجز', a.report],
    ['عداد الكهرباء', a.elecMeter], ['عداد الماء', a.waterMeter], ['سداد لم يدفع', a.unpaidPayment]
  ];
  Swal.fire({
    title: contractDisplayName(a) || 'تفاصيل الاتفاقية', width: 560,
    html: '<div style="text-align:right;max-height:60vh;overflow:auto;">' + rows.filter(r => r[1]).map(r => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('') + '</div>',
    confirmButtonText: 'إغلاق', confirmButtonColor: '#0d2137'
  });
}
function printContractAgreement(id) {
  const a = appData.contracts.agreements.find(x => x.id === id); if (!a) return;
  const v = x => x || '';
  const th = (ar, en) => `<th><div class="th-flex"><span>${ar}</span><span class="th-en">${en}</span></div></th>`;
  const row = (ar, en, value) => `<tr>${th(ar, en)}<td colspan="2">${v(value)}</td></tr>`;
  const dateRow = (ar, en, v1, v2) => `<tr>${th(ar, en)}<td>${v(fmtRentalDate(v1))}</td><td>${v(v2)}</td></tr>`;
  const centerBold = text => `<div class="center-bold">${text}</div>`;

  let bodyHtml = '';
  if (a.type === 'new') {
    bodyHtml += centerBold('اتفاقية تأجير جديد / Agreement New Rental');
    bodyHtml += `<table>
      ${dateRow('تاريخ التأجير', 'Rental Date', a.rentalFrom, a.rentalTo)}
      ${row('مكان الوحدة', 'Location', a.location)}
      ${row('اسم الوحدة', 'Unit Name', a.unitName)}
      ${row('اسم العميل', 'Customer Name', a.customerName)}
      ${row('رقم الهوية', 'Number ID', a.idNumber)}
      ${row('رقم الجوال', 'Mobile Number', a.mobile)}
      ${row('تاريخ الميلاد', 'Date of Birth', a.dob)}
      ${row('قيمة التأجير', 'Sale Value', a.saleValue)}
      ${row('طريقة الدفع', 'How to Pay', a.howToPay)}
      ${row('التأمين', 'Insurance', a.insurance)}
      ${row('الرسوم', 'Fee Amount', a.feeAmount)}
      ${row('المسوق', 'Sold By', a.soldBy)}
      ${row('تقرير ناجز', 'Najiz Report', a.report)}
      ${row('ملاحظات', 'Notes', a.notes)}
    </table>`;
    bodyHtml += `<table>
      ${row('رقم عداد الكهرباء', 'Electricity Meter Number', a.elecMeter)}
      ${row('المبلغ', 'Bill', a.elecBill)}
      ${row('ملاحظات', 'Notes', a.elecNotes)}
      ${row('رقم عداد الماء', 'Water Meter Number', a.waterMeter)}
      ${row('المبلغ', 'Bill', a.waterBill)}
      ${row('ملاحظات', 'Notes', a.waterNotes)}
    </table>`;
    bodyHtml += `<table>
      ${row('سداد لم يدفع', 'Unpaid Payment', a.unpaidPayment)}
      ${row('ملاحظات', 'Notes', a.notes2)}
    </table>`;
  } else if (a.type === 'renew') {
    bodyHtml += centerBold('اتفاقية تجديد عقد / Agreement Renewal Rental');
    bodyHtml += `<table>
      ${dateRow('تاريخ التأجير', 'Rental Date', a.rentalFrom, a.rentalTo)}
      ${row('مكان الوحدة', 'Location', a.location)}
      ${row('اسم الوحدة', 'Unit Name', a.unitName)}
      ${row('اسم العميل', 'Customer Name', a.customerName)}
      ${row('رقم الهوية', 'Number ID', a.idNumber)}
      ${row('رقم الجوال', 'Mobile Number', a.mobile)}
      ${row('تاريخ الميلاد', 'Date of Birth', a.dob)}
      ${row('قيمة التأجير الحالي', 'Sale Value Old', a.saleValueOld)}
      ${row('قيمة التأجير الجديد', 'Sale Value New', a.saleValueNew)}
      ${row('طريقة الدفع', 'How to Pay', a.howToPay)}
      ${row('التأمين', 'Insurance', a.insurance)}
      ${row('الرسوم', 'Fee Amount', a.feeAmount)}
      ${row('المسوق', 'Sold By', a.soldBy)}
      ${row('تقرير ناجز', 'Najiz Report', a.report)}
      ${row('ملاحظات', 'Notes', a.notes)}
    </table>`;
    bodyHtml += `<table>
      ${row('رقم عداد الكهرباء', 'Electricity Meter Number', a.elecMeter)}
      ${row('المبلغ', 'Bill', a.elecBill)}
      ${row('ملاحظات', 'Notes', a.elecNotes)}
      ${row('رقم عداد الماء', 'Water Meter Number', a.waterMeter)}
      ${row('المبلغ', 'Bill', a.waterBill)}
      ${row('ملاحظات', 'Notes', a.waterNotes)}
    </table>`;
    bodyHtml += `<table>
      ${row('سداد لم يدفع', 'Unpaid Payment', a.unpaidPayment)}
      ${row('ملاحظات', 'Notes', a.notes2)}
    </table>`;
  } else if (a.type === 'transfer') {
    bodyHtml += centerBold('اتفاقية تأجير للغير / Agreement Rental To Third Party');
    bodyHtml += `<table>
      ${dateRow('تاريخ التأجير', 'Rental Date', a.rentalFrom, a.rentalTo)}
      ${row('اسم الوحدة', 'Unit Name', a.unitName)}
      ${row('اسم المؤجر', '', a.landlordName)}
      ${row('رقم الهوية', 'Number ID', a.landlordIdNumber)}
      ${row('رقم الجوال', 'Mobile Number', a.landlordMobile)}
      ${row('تاريخ الميلاد', 'Date of Birth', a.landlordDob)}
      ${row('اسم المستأجر', '', a.tenantName)}
      ${row('رقم الهوية', 'Number ID', a.tenantIdNumber)}
      ${row('رقم الجوال', 'Mobile Number', a.tenantMobile)}
      ${row('تاريخ الميلاد', 'Date of Birth', a.tenantDob)}
      ${row('قيمة التأجير', 'Sale Value', a.saleValue)}
      ${row('طريقة الدفع', 'How to Pay', a.howToPay)}
      ${row('التأمين', 'Insurance', a.insurance)}
      ${row('الرسوم', 'Fee Amount', a.feeAmount)}
      ${row('المسوق', 'Sold By', a.soldBy)}
      ${row('تقرير ناجز', 'Najiz Report', a.report)}
      ${row('ملاحظات', 'Notes', a.notes)}
    </table>`;
    bodyHtml += `<table>
      ${row('رقم عداد الكهرباء', 'Electricity Meter Number', a.elecMeter)}
      ${row('المبلغ', 'Bill', a.elecBill)}
      ${row('ملاحظات', 'Notes', a.elecNotes)}
      ${row('رقم عداد الماء', 'Water Meter Number', a.waterMeter)}
      ${row('المبلغ', 'Bill', a.waterBill)}
      ${row('ملاحظات', 'Notes', a.waterNotes)}
    </table>`;
    bodyHtml += `<table>
      ${row('سداد لم يدفع', 'Unpaid Payment', a.unpaidPayment)}
      ${row('ملاحظات', 'Notes', a.notes2)}
    </table>`;
  } else {
    bodyHtml += centerBold('اتفاقية تعديل بيانات / Agreement Edit Data');
    bodyHtml += `<table>
      ${row('السبب', 'Reason', a.reason)}
      ${dateRow('تاريخ التأجير السابق', 'Before Rental Date', a.beforeFrom, a.beforeTo)}
      ${dateRow('تاريخ التأجير الجديد', 'New Rental Date', a.newFrom, a.newTo)}
      ${row('مكان الوحدة', 'Location', a.location)}
      ${row('اسم الوحدة', 'Unit Name', a.unitName)}
      ${row('اسم العميل السابق', 'Old Customer Name', a.oldCustomerName)}
      ${row('رقم الهوية', 'Number ID', a.oldIdNumber)}
      ${row('رقم الجوال', 'Mobile Number', a.oldMobile)}
      ${row('اسم العميل الجديد', 'New Customer Name', a.newCustomerName)}
      ${row('رقم الهوية', 'Number ID', a.newIdNumber)}
      ${row('رقم الجوال', 'Mobile Number', a.newMobile)}
      ${row('تاريخ الميلاد', 'Date of Birth', a.dob)}
      ${row('قيمة التأجير السابق', 'Sale Value Old', a.saleValueOld)}
      ${row('قيمة التأجير الجديد', 'Sale Value New', a.saleValueNew)}
      ${row('طريقة الدفع', 'How to Pay', a.howToPay)}
      ${row('التأمين', 'Insurance', a.insurance)}
      ${row('السعي', 'Services and Pursuit', a.services)}
      ${row('المسوق', 'Sold By', a.soldBy)}
      ${row('تقرير ناجز', 'Najiz Report', a.report)}
    </table>`;
    bodyHtml += `<table>
      ${row('رقم عداد الكهرباء', 'Electricity Meter Number', a.elecMeter)}
      ${row('المبلغ', 'Bill', a.elecBill)}
      ${row('ملاحظات', 'Notes', a.elecNotes)}
      ${row('رقم عداد الماء', 'Water Meter Number', a.waterMeter)}
      ${row('المبلغ', 'Bill', a.waterBill)}
      ${row('ملاحظات', 'Notes', a.waterNotes)}
    </table>`;
    bodyHtml += `<table>
      ${row('سداد لم يدفع', 'Unpaid Payment', a.unpaidPayment)}
      ${row('ملاحظات', 'Notes', a.notes2)}
    </table>`;
  }

  const statusHtml = a.status === 'documented'
    ? `<div class="status-box status-doc">تم التوثيق إلكترونياً من قبل ${a.documentedBy || 'المدير'}${a.documentedAt ? ' — ' + fmtDate(a.documentedAt) : ''}</div>`
    : `<div class="status-box status-undoc">غير موثق إلكترونياً</div>`;

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>اتفاقية</title>
    <style>
      @page { size: A4; margin: 13mm; }
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      body { font-family: 'Tahoma', Arial, sans-serif; direction: rtl; color: #0d2137; margin: 0; font-size: 14px; line-height: 1.45; }
      #printRoot { padding: 1mm; }
      .print-header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #0d2137; padding-bottom: 8px; }
      .print-header h2 { color: #0d2137; margin: 0 0 4px; font-size: 19px; }
      .print-header .manager-line { margin: 2px 0 0; font-size: 13px; color: #334155; }
      .center-bold { text-align: center; font-weight: 700; margin: 12px 0 6px; font-size: 14.5px; }
      table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; margin-bottom: 6px; border: 1.5px solid #0d2137; }
      th, td { border: 1px solid #0d2137; padding: 5px 8px; text-align: right; vertical-align: middle; overflow: hidden; }
      th { background: #eef2f6; font-weight: 600; width: 42%; white-space: nowrap; }
      td { min-height: 16px; text-align: center; white-space: normal; word-break: break-word; }
      .th-flex { display: flex; justify-content: space-between; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; }
      .th-flex .th-en { color: #475569; font-weight: 500; font-size: 10.5px; white-space: nowrap; }
      .status-box { text-align: center; font-weight: 700; border-radius: 6px; padding: 7px; margin-bottom: 10px; border: 1px solid; font-size: 13.5px; }
      .status-doc { color: #15803d; background: #dcfce7; border-color: #86efac; }
      .status-undoc { color: #b91c1c; background: #fee2e2; border-color: #fca5a5; }
      .sign-row { display: flex; justify-content: space-between; gap: 14px; margin-top: 22px; text-align: center; font-size: 13.5px; }
      .sign-row div { flex: 1; }
    </style></head><body>
    <div id="printRoot">
    ${statusHtml}
    ${bodyHtml}
    </div>
    <script>
      window.onload = function () {
        try {
          var root = document.getElementById('printRoot');
          // ارتفاع الصفحة القابل للطباعة بالبكسل، مع ترك مسافة أمان أسفل الصفحة
          // (A4 = 297مم، ناقص هامش الصفحة 13مم من كل جهة، وناقص هامش أمان إضافي 28مم أسفل الصفحة)
          var pageMarginMm = 13, bottomBufferMm = 28;
          var pageHeightPx = (297 - (pageMarginMm * 2) - bottomBufferMm) * (96 / 25.4);
          var contentHeight = root.scrollHeight;
          if (contentHeight > pageHeightPx) {
            // نستخدم zoom بدل transform/width حتى يُعاد ترتيب المحتوى فعلياً ضمن عرض
            // الصفحة نفسه دون أي تمدد للعرض قد يتسبب باقتصاص جانبي عند الطباعة/PDF
            var scale = Math.max(0.5, pageHeightPx / contentHeight);
            document.body.style.zoom = scale;
          }
        } catch (e) {}
        setTimeout(function () {
          window.print();
          setTimeout(function () { window.close(); }, 300);
        }, 80);
      };
    <\/script>
    </body></html>`);
  w.document.close();
}
function documentContractAgreement(id) {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  const a = appData.contracts.agreements.find(x => x.id === id); if (!a) return;
  const before = JSON.parse(JSON.stringify(a));
  const changes = { status: 'documented', documentedBy: currentUser.name, documentedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  Object.assign(a, changes);
  logContracts('document', `تم توثيق الاتفاقية إلكترونياً: ${contractDisplayName(a)}`, before, a);
  ContractAgreementsRepository.update(id, changes).catch(e => {
    console.error('[documentContractAgreement]', e);
    showToast('تعذر حفظ التوثيق على الخادم — تأكد من الاتصال', 'error');
  });
  showToast('تم التوثيق الإلكتروني بنجاح', 'success');
  renderContractsUndocumented();
}
function deleteContractAgreement(id) {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  const a = appData.contracts.agreements.find(x => x.id === id); if (!a) return;
  Swal.fire({ title: 'حذف الاتفاقية', text: `هل تريد حذف اتفاقية "${contractDisplayName(a) || ''}"؟`, icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444' }).then(r => {
    if (r.isConfirmed) {
      logContracts('delete', `تم حذف الاتفاقية: ${contractDisplayName(a) || ''}`, a, null);
      // الحذف الآن عبر ContractAgreementsRepository: يحذف مستند الاتفاقية فعليًا
      // من Collection المستقلة (contractAgreements) + يسجّل tombstone تلقائيًا
      // (نفس اسم قسم tombstone 'contracts' المستخدم سابقًا، للتوافق الكامل).
      ContractAgreementsRepository.remove(id).catch(e => {
        console.error('[deleteContractAgreement]', e);
        showToast('تعذر حفظ الحذف على الخادم — تأكد من الاتصال', 'error');
      });
      showToast('تم الحذف', 'success');
      renderContractsUndocumented(); renderContractsDocumented();
    }
  });
}
// ترتيب موحّد للاتفاقيات من الأحدث إلى الأقدم لكل أماكن العرض: الموثقة حسب
// documentedAt (وقت التوثيق الفعلي)، وغير الموثقة حسب createdAt (وقت الإنشاء)
// — وليس updatedAt أبداً، حتى لا يظهر تعديل اتفاقية قديمة وكأنه اتفاقية جديدة.
function sortContractsByRecency(list) {
  return [...list].sort((a, b) => {
    const ta = Date.parse((a.status === 'documented' ? a.documentedAt : a.createdAt) || 0) || 0;
    const tb = Date.parse((b.status === 'documented' ? b.documentedAt : b.createdAt) || 0) || 0;
    return tb - ta; // تنازلي: الأحدث أولاً
  });
}
// ترتيب موحّد للاتفاقيات من الأحدث إلى الأقدم لكل أماكن العرض: الموثقة حسب
// documentedAt (وقت التوثيق الفعلي)، وغير الموثقة حسب createdAt (وقت الإنشاء)
// — وليس updatedAt أبداً، حتى لا يظهر تعديل اتفاقية قديمة وكأنه اتفاقية جديدة.
function sortContractsByRecency(list) {
  return [...list].sort((a, b) => {
    const ta = Date.parse((a.status === 'documented' ? a.documentedAt : a.createdAt) || 0) || 0;
    const tb = Date.parse((b.status === 'documented' ? b.documentedAt : b.createdAt) || 0) || 0;
    return tb - ta; // تنازلي: الأحدث أولاً
  });
}
function renderContractsUndocumented() {
  ensureContractsData();
  populateContractMonthFilter('contractsUndocMonthFilter');
  const month = document.getElementById('contractsUndocMonthFilter')?.value || '';
  const cType = document.getElementById('contractsUndocTypeFilter')?.value || '';
  let list = appData.contracts.agreements.filter(a => a.status !== 'documented');
  // التصفية تعتمد على "المسوّق" المسجَّل فعلياً على الاتفاقية (soldBy) وليس
  // على من أدخل البيانات — لأن نفس الموظف قد يُدخل اتفاقيات لعدة مسوّقين.
  const canSeeAll = canViewAllUndocumentedAgreements();
  if (!canSeeAll) list = list.filter(a => a.soldBy === currentUserDisplayName());
  if (month) list = list.filter(a => contractMonthKey(a) === month);
  if (cType) list = list.filter(a => a.type === cType);
  const el = document.getElementById('contractsUndocContent');
  if (!list.length) {
    // رسالة مختلفة للمستخدم المقيّد حتى لا يظن أن القائمة فارغة للجميع
    const emptyMsg = canSeeAll ? 'لا توجد اتفاقيات غير موثقة' : 'لا توجد اتفاقيات غير موثقة باسمك حالياً';
    el.innerHTML = `<div class="card"><div class="empty-state"><i class="fas fa-inbox"></i><h3>${emptyMsg}</h3></div></div>`;
    return;
  }
  const canDocument = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
  const canDelete = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
    el.innerHTML = '<div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));">' + sortContractsByRecency(list).map(a => {
    const color = a.type === 'new' ? 'var(--danger)' : (a.type === 'transfer' ? 'var(--info)' : 'var(--warning)');
    const typeLabel = a.type === 'new' ? 'تأجير جديد' : (a.type === 'transfer' ? 'تأجير للغير' : (a.type === 'renew' ? 'تجديد عقد' : 'تعديل بيانات'));
    return `<div class="card" style="border-right:5px solid ${color};margin-top:0;">
      <div style="font-weight:700;font-size:15px;">${contractDisplayName(a) || '—'}</div>
      <div style="font-size:12px;color:var(--text-muted);margin:4px 0 10px;">${typeLabel} — ${fmtDate(a.createdAt)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="viewContractAgreement('${a.id}')"><i class="fas fa-eye"></i> عرض</button>
        <button class="btn btn-outline btn-sm" onclick="printContractAgreement('${a.id}')"><i class="fas fa-file-pdf"></i> PDF/طباعة</button>
        <button class="btn btn-outline btn-sm" onclick="editContractAgreement('${a.id}')"><i class="fas fa-edit"></i> تعديل</button>
        ${canDocument ? `<button class="btn btn-primary btn-sm" onclick="documentContractAgreement('${a.id}')"><i class="fas fa-stamp"></i> توثيق إلكترونياً</button>` : ''}
        ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteContractAgreement('${a.id}')"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>`;
  }).join('') + '</div>';
}
function renderContractsDocumented() {
  ensureContractsData();
  populateContractMonthFilter('contractsDocMonthFilter');
  const month = document.getElementById('contractsDocMonthFilter')?.value || '';
  const cType = document.getElementById('contractsDocTypeFilter')?.value || '';
  let list = appData.contracts.agreements.filter(a => a.status === 'documented');
  if (month) list = list.filter(a => contractMonthKey(a) === month);
  if (cType) list = list.filter(a => a.type === cType);
  const el = document.getElementById('contractsDocContent');
  if (!list.length) { el.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-stamp"></i><h3>لا توجد اتفاقيات موثقة</h3></div></div>'; return; }
  const canDelete = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
    el.innerHTML = '<div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));">' + sortContractsByRecency(list).map(a => {
    const color = a.type === 'new' ? 'var(--danger)' : (a.type === 'transfer' ? 'var(--info)' : 'var(--warning)');
    const typeLabel = a.type === 'new' ? 'تأجير جديد' : (a.type === 'transfer' ? 'تأجير للغير' : (a.type === 'renew' ? 'تجديد عقد' : 'تعديل بيانات'));
    return `<div class="card" style="border-right:5px solid ${color};margin-top:0;position:relative;overflow:hidden;">
      <div style="font-size:10px;color:var(--success);font-weight:700;background:rgba(34,197,94,0.1);padding:4px 8px;border-radius:6px;display:inline-block;margin-bottom:8px;"><i class="fas fa-stamp"></i> تم التوثيق إلكترونياً من قبل ${a.documentedBy || 'المدير'}</div>
      <div style="font-weight:700;font-size:15px;">${contractDisplayName(a) || '—'}</div>
      <div style="font-size:12px;color:var(--text-muted);margin:4px 0 10px;">${typeLabel} — ${fmtDate(a.createdAt)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="viewContractAgreement('${a.id}')"><i class="fas fa-eye"></i> عرض</button>
        <button class="btn btn-outline btn-sm" onclick="printContractAgreement('${a.id}')"><i class="fas fa-file-pdf"></i> PDF/طباعة</button>
        <button class="btn btn-outline btn-sm" onclick="editContractAgreement('${a.id}')"><i class="fas fa-edit"></i> تعديل الاتفاقية</button>
        ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteContractAgreement('${a.id}')"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>`;
  }).join('') + '</div>';
}
function renderContractsDraft() {
  ensureContractsData();
  const canDelete = currentUser && (currentUser.role === 'مدير' || currentUser.role === 'مشرف');
  const clearBtn = document.getElementById('clearContractsDraftBtn');
  if (clearBtn) clearBtn.style.display = canDelete ? '' : 'none';
  const type = document.getElementById('contractsDraftType')?.value || '';
  const labels = { add: 'إضافة', edit: 'تعديل', document: 'توثيق', delete: 'حذف' };
  const icons = { add: 'fas fa-plus-circle', edit: 'fas fa-edit', document: 'fas fa-stamp', delete: 'fas fa-trash' };
  const colors = { add: 'var(--success)', edit: 'var(--info)', document: 'var(--gold)', delete: 'var(--danger)' };
  let list = [...appData.contracts.log].reverse();
  if (type) list = list.filter(l => l.action === type);
  const container = document.getElementById('contractsDraftContainer');
  const empty = document.getElementById('contractsDraftEmpty');
  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  container.innerHTML = list.map(l => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);border-right:4px solid ${colors[l.action]};">
      <i class="${icons[l.action]}" style="color:${colors[l.action]};margin-top:2px;font-size:15px;flex-shrink:0;cursor:pointer;" onclick='showLogDiff(${JSON.stringify(l).replace(/'/g, "&#39;")})' title="عرض التفاصيل"></i>
      <div style="flex:1;cursor:pointer;" onclick='showLogDiff(${JSON.stringify(l).replace(/'/g, "&#39;")})'>
        <div style="font-size:13px;font-weight:700;color:var(--text);">${labels[l.action]}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${l.details}</div>
        <div style="font-size:11.5px;color:var(--primary);margin-top:3px;"><i class="fas fa-user"></i> بواسطة: ${l.user || 'غير معروف'}</div>
      </div>
      <div style="font-size:11px;color:var(--text-light);white-space:nowrap;">${l.ts}</div>
      ${canDelete ? `<button class="btn btn-danger btn-sm" style="padding:4px 8px;" onclick="deleteContractLogEntry('${l.id}')" title="حذف هذا العنصر"><i class="fas fa-times"></i></button>` : ''}
    </div>`).join('');
}
async function deleteContractLogEntry(id) {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  if (typeof ContractsLogCollectionService !== 'undefined' && typeof ContractsLogCollectionService.remove === 'function') {
    try {
      await ContractsLogCollectionService.remove(id);
    } catch (e) {
      console.error('تعذر حذف سجل مسودة العقود من الخادم:', e);
      showToast('تعذر حذف السجل من الخادم', 'error');
      return;
    }
  }
  ensureContractsData();
  markLogEntryDeleted('contracts', id);
  appData.contracts.log = appData.contracts.log.filter(l => l.id !== id);
  renderContractsDraft();
}
async function clearContractsDraftLog() {
  if (!currentUser || (currentUser.role !== 'مدير' && currentUser.role !== 'مشرف')) { showToast('هذا الإجراء متاح للمدير أو المشرف فقط', 'error'); return; }
  const r = await Swal.fire({ title: 'مسح كامل المسودة', text: 'هل تريد حذف جميع سجلات مسودة إدارة العقود؟', icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم، امسح', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444' });
  if (!r.isConfirmed) return;
  ensureContractsData();
  markAllLogEntriesDeleted('contracts', appData.contracts.log);
  appData.contracts.log = [];
  renderContractsDraft();
  if (typeof ContractsLogCollectionService !== 'undefined' && typeof ContractsLogCollectionService.clearAll === 'function') {
    try {
      await ContractsLogCollectionService.clearAll();
      showToast('تم مسح المسودة', 'success');
    } catch (e) {
      console.error('[clearContractsDraftLog]', e);
      showToast('تعذر مسح المسودة على الخادم — تأكد من الاتصال', 'error');
    }
  } else {
    save(); showToast('تم مسح المسودة', 'success');
  }
}
function renderContractsDashboard() {
  ensureContractsData();
  const list = appData.contracts.agreements;
  const total = list.length;
  // عدد "غير موثقة" في اللوحة يُصفّى بنفس منطق القائمة بالضبط، حتى لا يرى
  // المستخدم العادي رقماً أعلى من عدد الاتفاقيات التي تظهر له فعلياً عند
  // فتح القائمة (وهو ما كان يسبب التباساً قبل هذا التعديل).
  const undocumentedList = list.filter(a => a.status !== 'documented');
  const undocumented = canViewAllUndocumentedAgreements()
    ? undocumentedList.length
    : undocumentedList.filter(a => a.soldBy === currentUserDisplayName()).length;
  const documented = list.filter(a => a.status === 'documented').length;
  const newCount = list.filter(a => a.type === 'new').length;
  const transferCount = list.filter(a => a.type === 'transfer').length;
  const renewCount = list.filter(a => a.type === 'renew').length;
  const changeCount = list.filter(a => a.type === 'change').length;
  document.getElementById('contractsDashStats').innerHTML =
    statCardHTML('fa-file-contract', 'rgba(13,33,55,0.1)', 'var(--primary)', total, 'إجمالي الاتفاقيات') +
    statCardHTML('fa-hourglass-half', 'rgba(239,68,68,0.12)', 'var(--danger)', undocumented, 'غير موثقة') +
    statCardHTML('fa-stamp', 'rgba(34,197,94,0.12)', 'var(--success)', documented, 'موثقة') +
    statCardHTML('fa-file-signature', 'rgba(239,68,68,0.12)', 'var(--danger)', newCount, 'تأجير جديد') +
    statCardHTML('fa-rotate', 'rgba(168,85,247,0.12)', '#a855f7', renewCount, 'تجديد عقد') +
    statCardHTML('fa-file-pen', 'rgba(245,158,11,0.12)', 'var(--warning)', changeCount, 'تعديل بيانات') +
    statCardHTML('fa-people-arrows', 'rgba(59,130,246,0.12)', 'var(--info)', transferCount, 'تأجير للغير');
  const el = document.getElementById('contractsDashRecent');
    const recent = sortContractsByRecency(list);
  el.innerHTML = '<div class="card-title"><i class="fas fa-list"></i> كل الاتفاقيات</div>' +
    (recent.length ? '<div class="table-wrapper" style="max-height:420px;overflow-y:auto;"><table><thead><tr><th>العميل</th><th>النوع</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>' +
      recent.map(a => `<tr><td>${contractDisplayName(a) || '—'}</td><td>${a.type === 'new' ? 'تأجير جديد' : (a.type === 'transfer' ? 'تأجير للغير' : (a.type === 'renew' ? 'تجديد عقد' : 'تعديل بيانات'))}</td><td><span class="badge ${a.status === 'documented' ? 'badge-success' : 'badge-muted'}">${a.status === 'documented' ? 'موثقة' : 'غير موثقة'}</span></td><td>${fmtDate(a.createdAt)}</td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد بيانات</h3></div>');
}

