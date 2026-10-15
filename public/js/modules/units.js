// ============================================================
// ===== UNITS MANAGEMENT (إدارة الوحدات) =====
// ============================================================
function ensureUnitsData() {
  if (!appData.units) appData.units = { records: [], log: [] };
  if (!appData.units.records) appData.units.records = [];
  if (!appData.units.log) appData.units.log = [];
}
// ============================================================
// ===== UnitsRepository: مبني على BaseRepository =====
// ============================================================
const UnitsRepository = createFirestoreRepository({
  migrationSection: 'units',
  getLocalArray: () => appData.units.records,
  setLocalArray: (items) => { appData.units.records = items; },
  ensureFn: ensureUnitsData,
  collectionService: (typeof UnitsCollectionService !== 'undefined') ? UnitsCollectionService : null,
  onRemoteChange: () => { if (typeof populateUmPropertySelect === 'function' && document.getElementById('umPropertySelect')) { populateUmPropertySelect(); renderUnitsByProperty(); } }
});
function logUnits(action, details, before, after) {
  ensureUnitsData();
  const entry = {
    id: uid(), action, details,
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    user: currentUser ? currentUser.name : 'غير معروف',
    ts: new Date().toLocaleString('ar-SA'),
    tsNum: Date.now()
  };
  appData.units.log.push(entry); // تحديث فوري للشاشة الحالية
  if (appData.units.log.length > 300) appData.units.log.shift();
  // حفظ في Collection مستقلة (unitsLog) بدل المستند الرئيسي — يصل فورًا لبقية
  // المستخدمين عبر onSnapshot دون أي حاجة لإعادة كتابة المستند الرئيسي كاملًا
  // (نفس نمط vacLog المُثبت أعلاه، بعد أن كان معطّلاً هنا سابقًا).
  if (typeof UnitsLogCollectionService !== 'undefined') {
    UnitsLogCollectionService.add(entry).then(saved => {
      // نستبدل المعرّف المؤقت المحلي بمعرّف مستند Firestore الحقيقي فور نجاح
      // الحفظ، حتى يعمل زر "حذف" الفردي لاحقًا على المستند الصحيح فعليًا.
      if (saved && saved.id) {
        entry.id = saved.id;
        if (currentPage === 'units-log') renderUnitsLog();
      }
    }).catch(e => console.error('تعذر حفظ سجل الوحدات:', e));
  }
}
function renderUnitsEntryPage() {
  ensureUnitsData();
  ensureVacantData();
  // ربط قائمة العقارات من إدارة الفوارغ + ما تم إدخاله سابقاً
  const vacProps = [...new Set(appData.vacant.units.map(u => u.propertyName).filter(Boolean))];
  const unitProps = [...new Set(appData.units.records.map(r => r.propertyName).filter(Boolean))];
  const allProps = [...new Set([...vacProps, ...unitProps])];
  document.getElementById('umPropList').innerHTML = allProps.map(p => `<option value="${p}">`).join('');
  // ربط قائمة المسوقين من إدارة المسوقين
  document.getElementById('umAgentList').innerHTML = appData.agents.map(a => `<option value="${a.name}">`).join('');
  // ربط السعر المقترح من إدارة الفوارغ
  const prices = [...new Set(appData.vacant.units.map(u => u.price).filter(Boolean))];
  document.getElementById('umPriceList').innerHTML = prices.map(p => `<option value="${p}">`).join('');
  // ربط محتويات الشقة (specs من الفوارغ)
  const specs = [...new Set(appData.vacant.units.map(u => u.specs).filter(Boolean))];
  document.getElementById('umContentsList').innerHTML = specs.map(s => `<option value="${s}">`).join('');
  // ربط رقم الشقة عند تغيير اسم العقار
  document.getElementById('um-propertyName').oninput = function() {
    syncUmAptList(this.value);
    syncUmPriceAndContents(this.value, document.getElementById('um-aptNo').value);
  };
  document.getElementById('um-aptNo').oninput = function() {
    syncUmPriceAndContents(document.getElementById('um-propertyName').value, this.value);
  };
  populateUmPropertySelect();
  renderUnitsByProperty();
}
function syncUmAptList(propName) {
  ensureVacantData(); ensureUnitsData();
  const vacApts = appData.vacant.units.filter(u => u.propertyName === propName).map(u => u.aptNo).filter(Boolean);
  const unitApts = appData.units.records.filter(r => r.propertyName === propName).map(r => r.aptNo).filter(Boolean);
  const all = [...new Set([...vacApts, ...unitApts])];
  document.getElementById('umAptList').innerHTML = all.map(a => `<option value="${a}">`).join('');
}
function syncUmPriceAndContents(propName, aptNo) {
  ensureVacantData();
  const matched = appData.vacant.units.find(u => u.propertyName === propName && u.aptNo === aptNo);
  if (matched) {
    if (matched.price && !document.getElementById('um-suggestedPrice').value)
      document.getElementById('um-suggestedPrice').value = matched.price;
    if (matched.specs && !document.getElementById('um-contents').value)
      document.getElementById('um-contents').value = matched.specs;
  }
}
async function saveUnitEntry() {
  ensureUnitsData();
  const rec = {
    id: uid(),
    propertyName: document.getElementById('um-propertyName').value.trim(),
    aptNo: document.getElementById('um-aptNo').value.trim(),
    currentPrice: document.getElementById('um-currentPrice').value,
    suggestedPrice: document.getElementById('um-suggestedPrice').value,
    tenantName: document.getElementById('um-tenantName').value.trim(),
    agentName: document.getElementById('um-agentName').value.trim(),
    clientType: document.getElementById('um-clientType').value.trim(),
    contents: document.getElementById('um-contents').value.trim(),
    contractStart: document.getElementById('um-contractStart').value,
    contractEnd: document.getElementById('um-contractEnd').value,
    payments: document.getElementById('um-payments').value,
    waterFee: document.getElementById('um-waterFee').value.trim(),
    insuranceFee: document.getElementById('um-insuranceFee').value.trim(),
    notes: document.getElementById('um-notes').value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await UnitsRepository.add(rec);
  logUnits('إضافة وحدة', `${rec.propertyName||'—'} — شقة ${rec.aptNo||'—'}`, null, rec);
  showToast('تم حفظ الوحدة', 'success');
  // مسح النموذج
  ['um-propertyName','um-aptNo','um-currentPrice','um-suggestedPrice','um-tenantName','um-agentName','um-clientType','um-contents','um-contractStart','um-contractEnd','um-payments','um-waterFee','um-insuranceFee','um-notes'].forEach(id => { document.getElementById(id).value = ''; });
  populateUmPropertySelect();
  renderUnitsByProperty();
}
function populateUmPropertySelect() {
  ensureUnitsData();
  const sel = document.getElementById('umPropertySelect');
  const cur = sel.value;
  const props = [...new Set(appData.units.records.map(r => r.propertyName).filter(Boolean))];
  sel.innerHTML = '<option value="">كل العقارات</option>' + props.map(p => `<option value="${p}">${p}</option>`).join('');
  if (cur) sel.value = cur;
  populateUmFilterAgent();
}
function populateUmFilterAgent() {
  ensureUnitsData();
  const sel = document.getElementById('umFilterAgent');
  if (!sel) return;
  const cur = sel.value;
  const agents = [...new Set(appData.units.records.map(r => r.agentName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  sel.innerHTML = '<option value="">كل المسوّقين</option>' + agents.map(a => `<option value="${a}">${a}</option>`).join('');
  if (cur) sel.value = cur;
}
// وحدة فارغة = حقل اسم المستأجر فارغ أو مكتوب فيه صراحة "فارغ"
function isUnitVacant(r) {
  // إزالة التطويل (ـ) والتشكيل والمسافات الزائدة حتى تُطابق "فـارغ" أو "فــارغ" مع "فارغ"
  const t = (r.tenantName || '')
    .replace(/[\u0640\u064B-\u065F\u0670]/g, '') // تطويل + تشكيل
    .trim();
  return !t || t.includes('فارغ');
}
// معلومات الأيام المتبقية/المنتهية لعقد الوحدة + لون الصف المناظر
function computeContractDaysInfo(contractEnd) {
  if (!contractEnd) return { label: '—', expired: false, cls: '', diffDays: null };
  const end = new Date(contractEnd + 'T00:00:00');
  if (isNaN(end.getTime())) return { label: '—', expired: false, cls: '', diffDays: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((end - today) / 86400000);
  if (diffDays < 0) return { label: `منتهي منذ ${Math.abs(diffDays)} يوم`, expired: true, cls: 'um-row-expired', diffDays };
  if (diffDays <= 10) return { label: `متبقي ${diffDays} يوم`, expired: false, cls: 'um-row-orange', diffDays };
  if (diffDays <= 30) return { label: `متبقي ${diffDays} يوم`, expired: false, cls: 'um-row-yellow', diffDays };
  return { label: `متبقي ${diffDays} يوم`, expired: false, cls: '', diffDays };
}
function resetUmFilters() {
  const propSel = document.getElementById('umPropertySelect'); if (propSel) propSel.value = '';
  const vacSel = document.getElementById('umFilterVacancy'); if (vacSel) vacSel.value = '';
  const conSel = document.getElementById('umFilterContract'); if (conSel) conSel.value = '';
  const agentSel = document.getElementById('umFilterAgent'); if (agentSel) agentSel.value = '';
  const sortSel = document.getElementById('umSortContract'); if (sortSel) sortSel.value = '';
  umActivePropertyDetail = null;
  renderUnitsByProperty();
}
let umActivePropertyDetail = null;
function renamePropertyBlock(prop) {
  ensureUnitsData();
  const records = appData.units.records.filter(r => r.propertyName === prop);
  Swal.fire({
    title: 'تعديل اسم العقار',
    input: 'text',
    inputValue: prop,
    inputLabel: `سيتم تغيير اسم العقار لجميع الوحدات المسجّلة تحته (${records.length} وحدة)`,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-save"></i> حفظ',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#0d2137',
    inputValidator: (value) => { if (!value || !value.trim()) return 'اسم العقار مطلوب'; }
  }).then(async res => {
    if (!res.isConfirmed) return;
    const newName = res.value.trim();
    if (newName === prop) return;
    for (const r of records) {
      const before = JSON.parse(JSON.stringify(r));
      await UnitsRepository.update(r.id, { propertyName: newName });
      r.propertyName = newName;
      logUnits('تعديل اسم العقار', `${prop} ← ${newName} — شقة ${r.aptNo||'—'}`, before, r);
    }
    showToast('تم تعديل اسم العقار لجميع وحداته', 'success');
    if (umActivePropertyDetail === prop) umActivePropertyDetail = newName;
    populateUmPropertySelect(); renderUnitsByProperty();
    if (typeof renderUnitsLog === 'function' && document.getElementById('umLogContainer')) renderUnitsLog();
  });
}
function deletePropertyBlock(prop) {
  ensureUnitsData();
  const records = appData.units.records.filter(r => r.propertyName === prop);
  Swal.fire({
    title: 'تأكيد حذف العقار بالكامل',
    text: `سيتم حذف جميع وحدات "${prop}" (${records.length} وحدة) نهائيًا. هل تريد المتابعة؟`,
    icon: 'warning', showCancelButton: true, confirmButtonText: 'حذف الكل', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444'
  }).then(async res => {
    if (!res.isConfirmed) return;
    for (const r of records) {
      await UnitsRepository.remove(r.id);
      logUnits('حذف وحدة (ضمن حذف عقار)', `${r.propertyName||'—'} — شقة ${r.aptNo||'—'}`, r, null);
    }
    showToast('تم حذف العقار وجميع وحداته', 'success');
    if (umActivePropertyDetail === prop) umActivePropertyDetail = null;
    populateUmPropertySelect(); renderUnitsByProperty();
    if (typeof renderUnitsLog === 'function' && document.getElementById('umLogContainer')) renderUnitsLog();
  });
}
function renderUnitsByProperty() {
  ensureUnitsData();
  const filterProp = document.getElementById('umPropertySelect')?.value || '';
  const filterVacancy = document.getElementById('umFilterVacancy')?.value || '';
  const filterContract = document.getElementById('umFilterContract')?.value || '';
  const filterAgent = document.getElementById('umFilterAgent')?.value || '';
  const sortContract = document.getElementById('umSortContract')?.value || '';
  let records = appData.units.records;
  if (filterProp) records = records.filter(r => r.propertyName === filterProp);
  if (filterVacancy === 'vacant') records = records.filter(r => isUnitVacant(r));
  if (filterVacancy === 'occupied') records = records.filter(r => !isUnitVacant(r));
  if (filterContract === 'expired') records = records.filter(r => computeContractDaysInfo(r.contractEnd).expired);
  if (filterContract === 'active') records = records.filter(r => !computeContractDaysInfo(r.contractEnd).expired);
  if (filterAgent) records = records.filter(r => r.agentName === filterAgent);
  const el = document.getElementById('umUnitsContent');
  if (!records.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد وحدات</h3></div>'; return; }

  // عند استخدام أي من فلاتر (الفراغ/العقود/المسوّق) أو الترتيب حسب حالة العقد: نعرض جدولًا مباشرًا
  // بكل الوحدات المطابقة بغض النظر عن العقار، دون تقييد بعقار واحد (حسب المطلوب)
  if (filterVacancy || filterContract || filterAgent || sortContract) {
    let sorted = records.slice();
    if (sortContract === 'asc' || sortContract === 'desc') {
      sorted.sort((a, b) => {
        const da = computeContractDaysInfo(a.contractEnd).diffDays;
        const db = computeContractDaysInfo(b.contractEnd).diffDays;
        // الوحدات بدون تاريخ نهاية عقد تُدفع لآخر القائمة دائمًا
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return sortContract === 'asc' ? da - db : db - da;
      });
    } else {
      sorted.sort((a, b) => (a.propertyName || '').localeCompare(b.propertyName || '') || (a.aptNo || '').localeCompare(b.aptNo || ''));
    }
    // إجمالي المبلغ (السعر الحالي) لكل عقار ضمن النتائج المفلترة حالياً
    const propTotals = {};
    records.forEach(r => {
      const k = r.propertyName || 'بدون اسم';
      propTotals[k] = (propTotals[k] || 0) + (parseFloat(r.currentPrice) || 0);
    });
    const totalsHtml = '<div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-bottom:14px;">' +
      Object.keys(propTotals).sort().map(p => `
        <div class="card" style="margin-top:0;padding:12px 14px;">
          <div style="font-size:12px;color:var(--text-muted);">${p}</div>
          <div style="font-size:14px;font-weight:700;color:var(--gold,#c9a227);margin-top:4px;">إجمالي: ${fmt(propTotals[p])} ﷼</div>
        </div>`).join('') + '</div>';
    el.innerHTML = totalsHtml + `
      <div class="table-wrapper"><table>
        <thead><tr>
          <th>العقار</th><th>الشقة</th><th>المستأجر</th><th>المحتويات</th><th>السعر الحالي</th><th>عدد الدفعات</th><th>حالة العقد</th>
          <th class="no-print">إجراءات</th>
        </tr></thead>
        <tbody>${sorted.map(r => {
          const di = computeContractDaysInfo(r.contractEnd);
          const rowCls = r.rowColor ? 'um-row-clickable' : `um-row-clickable ${di.cls}`;
          const rowStyle = r.rowColor ? `cursor:pointer;background:${r.rowColor} !important;` : 'cursor:pointer;';
          return `
          <tr class="${rowCls}" onclick="showUnitDetailModal('${r.id}')" style="${rowStyle}">
            <td>${r.propertyName || '—'}</td>
            <td><strong>${r.aptNo || '—'}</strong></td>
            <td>${r.tenantName || '—'}</td>
            <td style="font-size:11px;max-width:160px;">${r.contents || '—'}</td>
            <td>${r.currentPrice ? fmt(r.currentPrice) + ' ﷼' : '—'}</td>
            <td>${r.payments || '—'}</td>
            <td>${di.label}</td>
            <td class="no-print" style="white-space:nowrap;" onclick="event.stopPropagation();">
              <button class="btn btn-sm btn-secondary" onclick="editUnitRecord('${r.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm btn-warning" onclick="toggleRowColor('${r.id}')" title="تلوين الصف / إزالة اللون"><i class="fas fa-fill-drip"></i></button>
              <button class="btn btn-sm btn-danger" onclick="deleteUnitRecord('${r.id}')" title="حذف"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>`;
    return;
  }

  // لا توجد فلاتر/ترتيب مفعّل: نعرض التجميع المعتاد حسب اسم العقار (كروت)
  // تجميع حسب اسم العقار
  const groups = {};
  records.forEach(r => { const k = r.propertyName || 'بدون اسم'; (groups[k] = groups[k]||[]).push(r); });
  let html = '<div class="agents-grid">';
  Object.keys(groups).sort().forEach(prop => {
    const sorted = groups[prop].slice().sort((a,b) => {
      const an = parseInt(a.aptNo)||0, bn = parseInt(b.aptNo)||0;
      return an !== bn ? an - bn : (a.aptNo||'').localeCompare(b.aptNo||'');
    });
    const hasActive = sorted.some(r => r.contractStart && r.contractEnd);
    const totalPrice = sorted.reduce((sum, r) => sum + (parseFloat(r.currentPrice) || 0), 0);
    html += `<div class="agent-card" onclick="showUnitsPropertyDetail('${prop.replace(/'/g,"\\'")}')">
      <div class="agent-avatar"><i class="fas fa-building"></i></div>
      <div class="agent-name">${prop}</div>
      <div style="font-size:11px;color:var(--text-muted);">${sorted.length} وحدة مسجّلة</div>
      <div style="font-size:12px;color:var(--gold,#c9a227);font-weight:700;margin-top:4px;">إجمالي الأسعار الحالية: ${fmt(totalPrice)} ﷼</div>
      <div class="agent-stats" style="margin-top:12px;">
        <div class="agent-stat">
          <div class="agent-stat-val">${sorted.length}</div>
          <div class="agent-stat-lbl">وحدة</div>
        </div>
        <div class="agent-stat">
          <div class="agent-stat-val" style="font-size:13px;">${sorted.filter(r=>r.tenantName).length}</div>
          <div class="agent-stat-lbl">مستأجر</div>
        </div>
        <div class="agent-stat">
          <div class="agent-stat-val" style="font-size:13px;">${sorted.filter(r=>r.agentName).length}</div>
          <div class="agent-stat-lbl">مسوّق</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;">
        <button class="btn btn-gold btn-sm" style="flex:1;" onclick="event.stopPropagation();showUnitsPropertyDetail('${prop.replace(/'/g,"\\'")}')"><i class="fas fa-eye"></i> عرض التفاصيل</button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();renamePropertyBlock('${prop.replace(/'/g,"\\'")}')" title="تعديل اسم العقار"><i class="fas fa-edit"></i></button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deletePropertyBlock('${prop.replace(/'/g,"\\'")}')" title="حذف العقار بالكامل"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  });
  html += '</div>';

  // منطقة عرض التفاصيل عند الضغط على كارد
  html += `<div id="umPropertyDetailPanel" style="display:none;margin-top:20px;"></div>`;
  el.innerHTML = html;
  // إبقاء لوحة تفاصيل العقار مفتوحة إن كانت مفتوحة قبل إعادة الرسم (مثلاً بعد تعديل/حذف وحدة)
  if (umActivePropertyDetail && groups[umActivePropertyDetail]) {
    showUnitsPropertyDetail(umActivePropertyDetail);
  }
}
async function toggleRowColor(id) {
  ensureUnitsData();
  const r = appData.units.records.find(x => x.id === id);
  if (!r) return;
  const res = await Swal.fire({
    title: 'تلوين الصف',
    html: `<input type="color" id="swalRowColorInput" value="${r.rowColor || '#ffffff'}" style="width:100%;height:48px;border:none;cursor:pointer;">`,
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'تطبيق اللون',
    denyButtonText: 'إزالة اللون',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#0d2137',
    denyButtonColor: '#6b7280',
    preConfirm: () => document.getElementById('swalRowColorInput').value
  });
  if (res.isConfirmed) {
    await UnitsRepository.update(id, { rowColor: res.value });
    r.rowColor = res.value;
  } else if (res.isDenied) {
    await UnitsRepository.update(id, { rowColor: '' });
    r.rowColor = '';
  } else {
    return;
  }
  showToast(res.isConfirmed ? 'تم تلوين الصف' : 'تم إزالة اللون', 'success');
  renderUnitsByProperty();
}
function showUnitsPropertyDetail(prop) {
  ensureUnitsData();
  umActivePropertyDetail = prop;
  const panel = document.getElementById('umPropertyDetailPanel');
  if (!panel) return;
  const records = appData.units.records.filter(r => r.propertyName === prop);
  const sorted = records.slice().sort((a,b) => {
    const an = parseInt(a.aptNo)||0, bn = parseInt(b.aptNo)||0;
    return an !== bn ? an - bn : (a.aptNo||'').localeCompare(b.aptNo||'');
  });
  panel.style.display = 'block';
  const totalPrice = sorted.reduce((sum, r) => sum + (parseFloat(r.currentPrice) || 0), 0);
  panel.innerHTML = `
    <div class="card" style="border:2px solid var(--gold);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div class="card-title" style="margin-bottom:0;"><i class="fas fa-building"></i> ${prop} — (${sorted.length} وحدة) — إجمالي الأسعار الحالية: ${fmt(totalPrice)} ﷼</div>
        <button class="btn btn-outline btn-sm no-print" onclick="document.getElementById('umPropertyDetailPanel').style.display='none';umActivePropertyDetail=null;"><i class="fas fa-times"></i> إغلاق</button>
      </div>
      <div class="table-wrapper"><table>
        <thead><tr>
          <th>الشقة</th><th>المستأجر</th><th>المحتويات</th><th>السعر الحالي</th><th>عدد الدفعات</th><th>حالة العقد</th>
          <th class="no-print">إجراءات</th>
        </tr></thead>
        <tbody>${sorted.map((r,i) => { const di = computeContractDaysInfo(r.contractEnd);
          const rowCls = r.rowColor ? 'um-row-clickable' : `um-row-clickable ${di.cls}`;
          const rowStyle = r.rowColor ? `cursor:pointer;background:${r.rowColor} !important;` : 'cursor:pointer;';
          return `
          <tr class="${rowCls}" onclick="showUnitDetailModal('${r.id}')" style="${rowStyle}">
            <td><strong>${r.aptNo||'—'}</strong></td>
            <td>${r.tenantName||'—'}</td>
            <td style="font-size:11px;max-width:160px;">${r.contents||'—'}</td>
            <td>${r.currentPrice ? fmt(r.currentPrice)+' ﷼' : '—'}</td>
            <td>${r.payments||'—'}</td>
            <td>${di.label}</td>
            <td class="no-print" style="white-space:nowrap;" onclick="event.stopPropagation();">
              <button class="btn btn-sm btn-secondary" onclick="editUnitRecord('${r.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm btn-warning" onclick="toggleRowColor('${r.id}')" title="تلوين الصف / إزالة اللون"><i class="fas fa-fill-drip"></i></button>
              <button class="btn btn-sm btn-danger" onclick="deleteUnitRecord('${r.id}')" title="حذف"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`; }).join('')}
        </tbody>
      </table></div>
    </div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// ===== نافذة عرض كل بيانات الوحدة مع نسخ جماعي واحد =====
function showUnitDetailModal(id) {
  ensureUnitsData();
  const r = appData.units.records.find(x => x.id === id); if (!r) return;
  const fields = [
    { label: 'اسم العقار', value: r.propertyName, icon: 'fa-building' },
    { label: 'رقم الشقة', value: r.aptNo, icon: 'fa-door-open' },
    { label: 'اسم المستأجر', value: r.tenantName, icon: 'fa-user' },
    { label: 'نوع العميل', value: r.clientType, icon: 'fa-id-badge' },
    { label: 'محتويات الشقة', value: r.contents, icon: 'fa-couch' },
    { label: 'السعر الحالي', value: r.currentPrice ? fmt(r.currentPrice)+' ﷼' : '', icon: 'fa-sack-dollar' },
    { label: 'السعر المقترح', value: r.suggestedPrice ? fmt(r.suggestedPrice)+' ﷼' : '', icon: 'fa-tags' },
    { label: 'عدد الدفعات', value: r.payments, icon: 'fa-layer-group' },
    { label: 'رسوم الماء', value: r.waterFee, icon: 'fa-faucet' },
    { label: 'رسوم التأمين', value: r.insuranceFee, icon: 'fa-shield-halved' },
    { label: 'تاريخ بداية العقد', value: r.contractStart ? fmtDate(r.contractStart) : '', icon: 'fa-calendar-check' },
    { label: 'تاريخ نهاية العقد', value: r.contractEnd ? fmtDate(r.contractEnd) : '', icon: 'fa-calendar-xmark' },
    { label: 'اسم المسوق', value: r.agentName, icon: 'fa-user-tie' },
    { label: 'ملاحظات', value: r.notes, icon: 'fa-note-sticky' }
  ];
  const filledFields = fields.filter(f => f.value);
  const allText = filledFields.map(f => `${f.label}: ${f.value}`).join('\n');
  const rowsHtml = filledFields.map((f, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 4px;border-bottom:1px solid #e3e3e3;">
      <div style="font-size:12px;color:#5a5a5a;">${f.label}</div>
      <div style="font-size:13px;font-weight:600;color:#1a1a1a;text-align:left;word-break:break-word;">${f.value}</div>
    </div>`).join('');
  Swal.fire({
    title: `${r.propertyName||'—'} — شقة ${r.aptNo||'—'}`,
    width: 560,
    html: `<div style="text-align:right;direction:rtl;display:flex;flex-direction:column;max-height:60vh;overflow-y:auto;padding:0 2px;">${rowsHtml}</div>`,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-copy"></i> نسخ جميع البيانات',
    cancelButtonText: 'إغلاق',
    confirmButtonColor: '#0d2137',
    preConfirm: () => {
      navigator.clipboard.writeText(allText).then(() => showToast('تم نسخ جميع بيانات الوحدة بالترتيب', 'success'));
      return false; // تبقي النافذة مفتوحة بعد النسخ
    }
  });
}
function editUnitRecord(id) {
  ensureUnitsData(); ensureVacantData();
  const r = appData.units.records.find(x => x.id === id); if (!r) return;
  const vacProps = [...new Set(appData.vacant.units.map(u => u.propertyName).filter(Boolean))];
  const unitProps = [...new Set(appData.units.records.map(x => x.propertyName).filter(Boolean))];
  const allProps = [...new Set([...vacProps, ...unitProps])];
  const agentNames = appData.agents.map(a => a.name);
  Swal.fire({
    title: '<i class="fas fa-pen-to-square" style="color:#000;"></i> تعديل بيانات الوحدة',
    width: 560,
    customClass: { popup: 'eu-modal-popup' },
    html: `
      <style>
        .eu-modal-popup{padding-bottom:18px;}
        .eu-wrap{text-align:right;direction:rtl;}
        .eu-sec{margin-bottom:10px;padding:10px 12px;border-radius:10px;background:var(--surface2,#f5f7fa);border:1px solid var(--border,#e3e8ee);}
        .eu-sec-title{font-size:11px;font-weight:700;color:#000;margin-bottom:8px;display:flex;align-items:center;gap:6px;}
        .eu-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .eu-field{margin-bottom:0;}
        .eu-field label{font-size:11px;display:block;margin-bottom:3px;color:var(--text-muted,#7a8699);}
        .eu-field input,.eu-field textarea{
          direction:rtl;margin:0;width:100%;height:34px;font-size:13px;padding:0 10px;
          border-radius:7px;border:1px solid var(--border,#dde3ea);box-sizing:border-box;
        }
        .eu-field textarea{height:52px;padding:6px 10px;resize:vertical;}
      </style>
      <div class="eu-wrap">
        <div class="eu-sec">
          <div class="eu-sec-title"><i class="fas fa-building"></i> العقار والشقة</div>
          <div class="eu-row">
            <div class="eu-field"><label>اسم العقار</label>
              <input id="eu-propertyName" list="euPropList" value="${r.propertyName||''}">
              <datalist id="euPropList">${allProps.map(p=>`<option value="${p}">`).join('')}</datalist></div>
            <div class="eu-field"><label>رقم الشقة</label>
              <input id="eu-aptNo" value="${r.aptNo||''}"></div>
          </div>
        </div>
        <div class="eu-sec">
          <div class="eu-sec-title"><i class="fas fa-sack-dollar"></i> الأسعار والدفعات</div>
          <div class="eu-row">
            <div class="eu-field"><label>السعر الحالي</label>
              <input id="eu-currentPrice" type="number" value="${r.currentPrice||''}"></div>
            <div class="eu-field"><label>السعر المقترح</label>
              <input id="eu-suggestedPrice" type="number" value="${r.suggestedPrice||''}"></div>
          </div>
          <div class="eu-row" style="margin-top:8px;">
            <div class="eu-field"><label>عدد الدفعات</label>
              <input id="eu-payments" type="text" value="${r.payments||''}"></div>
            <div class="eu-field"><label>نوع العميل</label>
              <input id="eu-clientType" value="${r.clientType||''}"></div>
          </div>
          <div class="eu-row" style="margin-top:8px;">
            <div class="eu-field"><label>رسوم الماء</label>
              <input id="eu-waterFee" type="text" value="${r.waterFee||''}"></div>
            <div class="eu-field"><label>رسوم التأمين</label>
              <input id="eu-insuranceFee" type="text" value="${r.insuranceFee||''}"></div>
          </div>
        </div>
        <div class="eu-sec">
          <div class="eu-sec-title"><i class="fas fa-users"></i> المستأجر والمسوق</div>
          <div class="eu-row">
            <div class="eu-field"><label>اسم المستأجر</label>
              <input id="eu-tenantName" value="${r.tenantName||''}"></div>
            <div class="eu-field"><label>اسم المسوق</label>
              <input id="eu-agentName" list="euAgentList" value="${r.agentName||''}">
              <datalist id="euAgentList">${agentNames.map(n=>`<option value="${n}">`).join('')}</datalist></div>
          </div>
        </div>
        <div class="eu-sec">
          <div class="eu-sec-title"><i class="fas fa-calendar-days"></i> مدة العقد</div>
          <div class="eu-row">
            <div class="eu-field"><label>بداية العقد</label>
              <input id="eu-contractStart" type="date" value="${r.contractStart||''}"></div>
            <div class="eu-field"><label>نهاية العقد</label>
              <input id="eu-contractEnd" type="date" value="${r.contractEnd||''}"></div>
          </div>
        </div>
        <div class="eu-sec" style="margin-bottom:0;">
          <div class="eu-sec-title"><i class="fas fa-couch"></i> المحتويات والملاحظات</div>
          <div class="eu-field" style="margin-bottom:8px;"><label>محتويات الشقة</label>
            <textarea id="eu-contents">${r.contents||''}</textarea></div>
          <div class="eu-field"><label>ملاحظات</label>
            <textarea id="eu-notes">${r.notes||''}</textarea></div>
        </div>
      </div>`,
    showCancelButton: true, confirmButtonText: '<i class="fas fa-save"></i> حفظ التعديل', cancelButtonText: 'إلغاء',
    confirmButtonColor: '#0d2137',
    preConfirm: () => ({
      propertyName: document.getElementById('eu-propertyName').value.trim(),
      aptNo: document.getElementById('eu-aptNo').value.trim(),
      currentPrice: document.getElementById('eu-currentPrice').value,
      suggestedPrice: document.getElementById('eu-suggestedPrice').value,
      tenantName: document.getElementById('eu-tenantName').value.trim(),
      agentName: document.getElementById('eu-agentName').value.trim(),
      clientType: document.getElementById('eu-clientType').value.trim(),
      contents: document.getElementById('eu-contents').value.trim(),
      contractStart: document.getElementById('eu-contractStart').value,
      contractEnd: document.getElementById('eu-contractEnd').value,
      payments: document.getElementById('eu-payments').value,
      waterFee: document.getElementById('eu-waterFee').value.trim(),
      insuranceFee: document.getElementById('eu-insuranceFee').value.trim(),
      notes: document.getElementById('eu-notes').value.trim()
    })
  }).then(async res => {
    if (res.isConfirmed) {
      const before = JSON.parse(JSON.stringify(r));
      const after = { ...before, ...res.value }; // القيم الفعلية بعد التعديل، لضمان ظهورها صحيحة في مسودة الوحدات
      await UnitsRepository.update(id, res.value);
      logUnits('تعديل وحدة', `${after.propertyName||'—'} — شقة ${after.aptNo||'—'}`, before, after);
      showToast('تم التعديل وتحديث المزامنة', 'success');
      populateUmPropertySelect(); renderUnitsByProperty();
      if (typeof renderUnitsLog === 'function' && document.getElementById('umLogContainer')) renderUnitsLog();
    }
  });
}
function deleteUnitRecord(id) {
  ensureUnitsData();
  const r = appData.units.records.find(x => x.id === id);
  Swal.fire({ title:'تأكيد الحذف', text:'هل تريد حذف هذه الوحدة؟', icon:'warning', showCancelButton:true, confirmButtonText:'حذف', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(async res => {
    if (res.isConfirmed) {
      await UnitsRepository.remove(id);
      if (r) logUnits('حذف وحدة', `${r.propertyName||'—'} — شقة ${r.aptNo||'—'}`, r, null);
      showToast('تم الحذف', 'success');
      populateUmPropertySelect(); renderUnitsByProperty();
    }
  });
}
function renderUnitsLog() {
  ensureUnitsData();
  const search = (document.getElementById('umLogSearch')?.value || '').trim().toLowerCase();
  const actionFilter = document.getElementById('umLogActionFilter')?.value || '';
  let logs = [...appData.units.log].reverse();
  if (actionFilter) logs = logs.filter(ev => ev.action === actionFilter);
  if (search) logs = logs.filter(ev => (ev.details||'').toLowerCase().includes(search) || (ev.action||'').toLowerCase().includes(search));
  const c = document.getElementById('umLogContainer');
  const e = document.getElementById('umLogEmpty');
  if (!logs.length) { c.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  c.innerHTML = logs.map(ev => `
    <div onclick='showLogDiff(${JSON.stringify(ev).replace(/'/g,"&#39;")})' style="cursor:pointer;display:flex;align-items:flex-start;gap:12px;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <i class="fas fa-building" style="color:var(--gold);font-size:14px;"></i>
      </div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:var(--text);">${ev.action}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${ev.details}</div>
        <div style="font-size:11px;color:var(--gold);margin-top:2px;"><i class="fas fa-user"></i> ${ev.user||'غير معروف'}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <div style="font-size:11px;color:var(--text-light);white-space:nowrap;">${ev.ts}</div>
        <button class="btn btn-sm btn-danger no-print" onclick="event.stopPropagation();deleteUnitsLogEntry('${ev.id}')" title="حذف هذا السجل فقط"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}
function deleteUnitsLogEntry(id) {
  Swal.fire({ title:'حذف هذا السجل', text:'هل تريد حذف هذا الحدث من السجل فقط؟', icon:'warning', showCancelButton:true, confirmButtonText:'نعم، احذف', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(async res => {
    if (!res.isConfirmed) return;
    if (typeof UnitsLogCollectionService !== 'undefined' && typeof UnitsLogCollectionService.remove === 'function') {
      try {
        await UnitsLogCollectionService.remove(id);
      } catch (e) {
        console.error('تعذر حذف السجل من الخادم:', e);
        showToast('تعذر حذف السجل من الخادم', 'error');
        return;
      }
    }
    ensureUnitsData();
    markLogEntryDeleted('units', id);
    appData.units.log = appData.units.log.filter(ev => ev.id !== id);
    renderUnitsLog();
    showToast('تم حذف السجل', 'success');
  });
}
function clearUnitsLog() {
  Swal.fire({ title:'مسح السجل', text:'هل تريد حذف جميع سجلات الوحدات؟', icon:'warning', showCancelButton:true, confirmButtonText:'نعم، امسح', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(r => {
    if (r.isConfirmed) {
      ensureUnitsData();
      markAllLogEntriesDeleted('units', appData.units.log);
      appData.units.log = [];
      renderUnitsLog();
      if (typeof UnitsLogCollectionService !== 'undefined' && typeof UnitsLogCollectionService.clearAll === 'function') {
        UnitsLogCollectionService.clearAll()
          .then(() => showToast('تم مسح السجل', 'success'))
          .catch(() => showToast('تعذر مسح السجل من الخادم', 'error'));
      } else {
        save(); showToast('تم مسح السجل', 'success');
      }
    }
  });
}
function printUnitsPage() {
  const panel = document.getElementById('umPropertyDetailPanel');
  const panelVisible = panel && panel.style.display !== 'none';
  if (panelVisible) {
    // طباعة تفاصيل العقار المفتوح فقط
    const printContent = panel.innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
      <title>طباعة وحدات العقار</title>
      <style>
        body { font-family: 'Tahoma', Arial, sans-serif; direction: rtl; color: #0d2137; margin: 20px; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th { background:#0d2137; color:white; padding:10px 12px; text-align:right; }
        td { padding:9px 12px; border-bottom:1px solid #d1dce8; }
        tr:nth-child(even) { background:#f7f9fc; }
        .no-print { display:none !important; }
        h2 { color:#0d2137; border-bottom:2px solid #c9a227; padding-bottom:8px; }
        .print-header { text-align:center; margin-bottom:20px; }
        button { display:none !important; }
      </style></head><body>
      <div class="print-header">
        <h2>شركة عودة تطوير العقارية</h2>
        <p>إدارة الوحدات — ${new Date().toLocaleDateString('ar-SA')}</p>
      </div>
      ${printContent}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  } else {
    // طباعة كل العقارات
    ensureUnitsData();
    const records = appData.units.records;
    if (!records.length) { showToast('لا توجد بيانات للطباعة', 'error'); return; }
    const groups = {};
    records.forEach(r => { const k = r.propertyName||'بدون اسم'; (groups[k]=groups[k]||[]).push(r); });
    let tablesHtml = '';
    Object.keys(groups).sort().forEach(prop => {
      const sorted = groups[prop].slice().sort((a,b) => (parseInt(a.aptNo)||0)-(parseInt(b.aptNo)||0));
      tablesHtml += `<h3 style="color:#0d2137;border-right:4px solid #c9a227;padding-right:10px;margin-top:24px;">${prop} (${sorted.length} وحدة)</h3>
        <table><thead><tr>
          <th>#</th><th>الشقة</th><th>المستأجر</th><th>نوع العميل</th><th>السعر الحالي</th><th>السعر المقترح</th>
          <th>بداية العقد</th><th>نهاية العقد</th><th>الدفعات</th><th>المسوق</th><th>ملاحظات</th>
        </tr></thead><tbody>
        ${sorted.map((r,i)=>`<tr>
          <td>${i+1}</td><td><strong>${r.aptNo||'—'}</strong></td><td>${r.tenantName||'—'}</td><td>${r.clientType||'—'}</td>
          <td>${r.currentPrice?fmt(r.currentPrice)+' ﷼':'—'}</td><td>${r.suggestedPrice?fmt(r.suggestedPrice)+' ﷼':'—'}</td>
          <td>${r.contractStart?fmtDate(r.contractStart):'—'}</td><td>${r.contractEnd?fmtDate(r.contractEnd):'—'}</td>
          <td>${r.payments||'—'}</td><td>${r.agentName||'—'}</td><td>${r.notes||'—'}</td>
        </tr>`).join('')}
        </tbody></table>`;
    });
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
      <title>طباعة إدارة الوحدات</title>
      <style>
        body { font-family: 'Tahoma', Arial, sans-serif; direction: rtl; color: #0d2137; margin: 20px; }
        table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px; }
        th { background:#0d2137; color:white; padding:8px 10px; text-align:right; }
        td { padding:7px 10px; border-bottom:1px solid #d1dce8; }
        tr:nth-child(even) { background:#f7f9fc; }
        .print-header { text-align:center; margin-bottom:24px; border-bottom:2px solid #0d2137; padding-bottom:12px; }
      </style></head><body>
      <div class="print-header">
        <h2 style="color:#0d2137;">شركة عودة تطوير العقارية</h2>
        <p>إدارة الوحدات — ${new Date().toLocaleDateString('ar-SA')}</p>
      </div>
      ${tablesHtml}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }
}
