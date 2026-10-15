// ============================================================
// ===== COLLECTION MANAGEMENT (إدارة التحصيل) =====
// ============================================================

function ensureColData() {
  if (!appData.collection) appData.collection = { contracts: [], log: [] };
  if (!appData.collection.contracts) appData.collection.contracts = [];
  if (!appData.collection.log) appData.collection.log = [];
}
// ============================================================
// ===== CollectionsRepository (التحصيل): مبني على BaseRepository =====
// ============================================================
const CollectionsRepository = createFirestoreRepository({
  migrationSection: 'collections',
  getLocalArray: () => appData.collection.contracts,
  setLocalArray: (items) => { appData.collection.contracts = items; },
  ensureFn: ensureColData,
  collectionService: (typeof CollectionsCollectionService !== 'undefined') ? CollectionsCollectionService : null,
  onRemoteChange: () => { if (document.getElementById('colViewContent')) renderColView(); }
});

function colLog(action, detail) {
  ensureColData();
  appData.collection.log.unshift({ action, detail, user: currentUser ? currentUser.name : 'غير معروف', date: new Date().toISOString() });
  if (appData.collection.log.length > 200) appData.collection.log.length = 200;
}

function toggleCollectionSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-collection-submenu').classList.toggle('open', !wasOpen);
  showPage('col-dashboard');
}

// ===== populate datalists from existing data =====
function colPopulateLists() {
  ensureColData();
  const contracts = appData.collection.contracts;
  const propNames = [...new Set(contracts.map(c => c.propName).filter(Boolean))];
  const unitNos   = [...new Set(contracts.map(c => c.unitNo).filter(Boolean))];
  const propTypes = [...new Set(contracts.map(c => c.propType).filter(Boolean))];
  const tenants   = [...new Set(contracts.map(c => c.tenantName).filter(Boolean))];
  const phones    = [...new Set(contracts.map(c => c.phone).filter(Boolean))];
  const agents    = [...new Set([
    ...contracts.map(c => c.agentName).filter(Boolean),
    ...(appData.agents||[]).map(a => a.name).filter(Boolean)
  ])];

  // also pull from vacant & units
  if (appData.vacant && appData.vacant.propertyMemory)
    propNames.push(...appData.vacant.propertyMemory.filter(p => !propNames.includes(p)));
  if (appData.units && appData.units.properties)
    propNames.push(...appData.units.properties.map(p=>p.name).filter(p=>!propNames.includes(p)));

  const fill = (id, arr) => { const d = document.getElementById(id); if(d) d.innerHTML = arr.map(v=>`<option value="${v}">`).join(''); };
  fill('colPropNameList', propNames);
  fill('colUnitNoList', unitNos);
  fill('colPropTypeList', propTypes);
  fill('colTenantNameList', tenants);
  fill('colPhoneList', phones);
  fill('colAgentNameList', agents);
}

function colSameAsTenant() {
  const name = document.getElementById('col-tenantName').value.trim();
  document.getElementById('col-repName').value = name;
}

function colCalcPayments() {
  const rent = parseFloat(document.getElementById('col-annualRent').value) || 0;
  const count = parseInt(document.getElementById('col-payCount').value) || 0;
  const startDate = document.getElementById('col-startDate').value;
  const preview = document.getElementById('col-payments-preview');
  const tbody = document.getElementById('col-payments-tbody');

  if (!rent || !count || !startDate) { preview.style.display = 'none'; return; }
  preview.style.display = 'block';
  const amount = rent / count;
  const rows = [];
  const start = new Date(startDate);
  const monthsInterval = Math.round(12 / count);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * monthsInterval);
    rows.push({ amount, dueDate: d.toISOString().slice(0,10), paid: false });
  }
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${r.amount.toLocaleString('ar-SA', {minimumFractionDigits:0})} ﷼</td>
      <td><input type="date" class="form-control" id="col-due-${i}" value="${r.dueDate}" style="padding:6px 10px;font-size:12px;"></td>
      <td><span class="badge badge-muted">غير مسددة</span></td>
    </tr>`).join('');
}

function colGetPaymentsFromForm() {
  const count = parseInt(document.getElementById('col-payCount').value) || 0;
  const rent = parseFloat(document.getElementById('col-annualRent').value) || 0;
  const amount = count > 0 ? rent / count : 0;
  const payments = [];
  for (let i = 0; i < count; i++) {
    const el = document.getElementById(`col-due-${i}`);
    payments.push({ amount, dueDate: el ? el.value : '', paid: false, paidDate: null });
  }
  return payments;
}

function colSaveContract() {
  ensureColData();
  const propName   = document.getElementById('col-propName').value.trim();
  const unitNo     = document.getElementById('col-unitNo').value.trim();
  const propType   = document.getElementById('col-propType').value.trim();
  const tenantName = document.getElementById('col-tenantName').value.trim();
  const repName    = document.getElementById('col-repName').value.trim();
  const phone      = document.getElementById('col-phone').value.trim();
  const contractNo = document.getElementById('col-contractNo').value.trim();
  const startDate  = document.getElementById('col-startDate').value;
  const endDate    = document.getElementById('col-endDate').value;
  const annualRent = parseFloat(document.getElementById('col-annualRent').value) || 0;
  const payCount   = parseInt(document.getElementById('col-payCount').value) || 0;
  const deposit    = parseFloat(document.getElementById('col-deposit').value) || 0;
  const agentName  = document.getElementById('col-agentName').value.trim();
  const notes      = document.getElementById('col-notes').value.trim();

  if (!propName||!unitNo||!propType||!tenantName||!phone||!startDate||!endDate||!annualRent||!payCount||!notes) {
    showToast('يرجى ملء جميع الحقول الإجبارية', 'error'); return;
  }
  const payments = colGetPaymentsFromForm();
  const id = 'col_' + Date.now();
  const contract = { id, propName, unitNo, propType, tenantName, repName, phone, contractNo, startDate, endDate, annualRent, payCount, deposit, agentName, notes, payments, status: 'active', createdAt: new Date().toISOString() };
  CollectionsRepository.add(contract);
  colLog('add', `تمت إضافة عقد للمستأجر ${tenantName} — ${propName}`);
  showToast('تم حفظ العقد بنجاح', 'success');
  // reset
  ['col-propName','col-unitNo','col-propType','col-tenantName','col-repName','col-phone','col-contractNo','col-startDate','col-endDate','col-annualRent','col-deposit','col-agentName','col-notes'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  document.getElementById('col-payCount').value = '';
  document.getElementById('col-payments-preview').style.display = 'none';
}

// ===== VIEW DATA =====
function renderColView() {
  ensureColData();
  const search  = (document.getElementById('colViewSearch')||{}).value?.toLowerCase()||'';
  const prop    = (document.getElementById('colViewProp')||{}).value||'';
  const agent   = (document.getElementById('colViewAgent')||{}).value||'';
  const status  = (document.getElementById('colViewStatus')||{}).value||'';

  // populate filters
  const contracts = appData.collection.contracts;
  const props  = [...new Set(contracts.map(c=>c.propName).filter(Boolean))];
  const agents = [...new Set(contracts.map(c=>c.agentName).filter(Boolean))];
  const selProp  = document.getElementById('colViewProp');
  const selAgent = document.getElementById('colViewAgent');
  if(selProp)  selProp.innerHTML  = `<option value="">كل العقارات</option>`  + props.map(p=>`<option value="${p}" ${prop===p?'selected':''}>${p}</option>`).join('');
  if(selAgent) selAgent.innerHTML = `<option value="">كل المسوقين</option>` + agents.map(a=>`<option value="${a}" ${agent===a?'selected':''}>${a}</option>`).join('');

  const today = new Date().toISOString().slice(0,10);
  let filtered = contracts.filter(c => {
    const matchSearch = !search || c.tenantName?.toLowerCase().includes(search) || c.phone?.includes(search);
    const matchProp   = !prop   || c.propName === prop;
    const matchAgent  = !agent  || c.agentName === agent;
    let matchStatus   = true;
    if (status) {
      if (status === 'active')    matchStatus = c.status === 'active' && c.endDate >= today;
      if (status === 'expired')   matchStatus = c.endDate < today;
      if (status === 'cancelled') matchStatus = c.status === 'cancelled';
    }
    return matchSearch && matchProp && matchAgent && matchStatus;
  });

  const el = document.getElementById('colViewContent');
  if (!filtered.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-file-contract"></i><h3>لا توجد عقود</h3><p>لا توجد عقود تطابق الفلاتر المحددة</p></div>`; return; }

  el.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>#</th><th>اسم المستأجر</th><th>رقم الجوال</th><th>العقار</th><th>الوحدة</th><th>الإيجار السنوي</th><th>الدفعات</th><th>بداية العقد</th><th>نهاية العقد</th><th>المسوق</th><th>الحالة</th><th>إجراءات</th></tr></thead>
    <tbody>${filtered.map((c,i)=>{
      const isExpired = c.endDate < today;
      const statusBadge = c.status==='cancelled' ? `<span class="badge badge-danger">ملغي</span>` : isExpired ? `<span class="badge badge-muted">منتهي</span>` : `<span class="badge badge-success">نشط</span>`;
      return `<tr>
        <td>${i+1}</td>
        <td><strong>${c.tenantName}</strong>${c.repName?`<br><small style="color:var(--text-muted)">ممثل: ${c.repName}</small>`:''}</td>
        <td>${c.phone}</td>
        <td>${c.propName}</td>
        <td>${c.unitNo}</td>
        <td>${(c.annualRent||0).toLocaleString('ar-SA')} ﷼</td>
        <td>${c.payCount}</td>
        <td>${c.startDate||'—'}</td>
        <td>${c.endDate||'—'}</td>
        <td>${c.agentName||'—'}</td>
        <td>${statusBadge}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm" onclick="colEditContract('${c.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-warning btn-sm" onclick="colOpenPaymentsModal('${c.id}')" title="تعديل الدفعات"><i class="fas fa-calendar-alt"></i></button>
          <button class="btn btn-danger btn-sm" onclick="colDeleteContract('${c.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function colEditContract(id) {
  ensureColData();
  const c = appData.collection.contracts.find(x=>x.id===id);
  if (!c) return;
  Swal.fire({
    title: 'تعديل بيانات العقد',
    width: 640,
    html: '<div style="text-align:right;direction:rtl;max-height:65vh;overflow-y:auto;padding:4px 8px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
      '<div><label style="font-size:13px;font-weight:600;">اسم المستأجر</label><input id="swal-tenantName" class="swal2-input" style="margin:4px 0;" value="' + (c.tenantName||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">اسم الممثل</label><input id="swal-repName" class="swal2-input" style="margin:4px 0;" value="' + (c.repName||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">رقم الجوال</label><input id="swal-phone" class="swal2-input" style="margin:4px 0;" value="' + (c.phone||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">رقم العقد</label><input id="swal-contractNo" class="swal2-input" style="margin:4px 0;" value="' + (c.contractNo||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">اسم العقار</label><input id="swal-propName" class="swal2-input" style="margin:4px 0;" value="' + (c.propName||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">رقم الوحدة</label><input id="swal-unitNo" class="swal2-input" style="margin:4px 0;" value="' + (c.unitNo||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">نوع العقار</label><input id="swal-propType" class="swal2-input" style="margin:4px 0;" value="' + (c.propType||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">اسم المسوّق</label><input id="swal-agentName" class="swal2-input" style="margin:4px 0;" value="' + (c.agentName||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">بداية العقد</label><input id="swal-startDate" type="date" class="swal2-input" style="margin:4px 0;" value="' + (c.startDate||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">نهاية العقد</label><input id="swal-endDate" type="date" class="swal2-input" style="margin:4px 0;" value="' + (c.endDate||'') + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">الإيجار السنوي</label><input id="swal-annualRent" type="number" step="0.01" class="swal2-input" style="margin:4px 0;" value="' + (c.annualRent||0) + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">التأمين</label><input id="swal-deposit" type="number" step="0.01" class="swal2-input" style="margin:4px 0;" value="' + (c.deposit||0) + '"></div>' +
      '<div><label style="font-size:13px;font-weight:600;">حالة العقد</label>' +
      '<select id="swal-status" class="swal2-input" style="margin:4px 0;">' +
      '<option value="active" ' + (c.status==='active'?'selected':'') + '>نشط</option>' +
      '<option value="cancelled" ' + (c.status==='cancelled'?'selected':'') + '>ملغي</option>' +
      '</select></div>' +
      '</div>' +
      '<label style="font-size:13px;font-weight:600;margin-top:10px;display:block;">ملاحظات</label>' +
      '<textarea id="swal-notes" class="swal2-textarea" style="direction:rtl;">' + (c.notes||'') + '</textarea>' +
      '</div>',
    showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء',
    direction: 'rtl', confirmButtonColor: '#0d2137',
    preConfirm: function() {
      const tenantName = document.getElementById('swal-tenantName').value.trim();
      const phone = document.getElementById('swal-phone').value.trim();
      if (!tenantName || !phone) { Swal.showValidationMessage('اسم المستأجر ورقم الجوال إجباريان'); return false; }
      return {
        tenantName: tenantName,
        phone: phone,
        repName: document.getElementById('swal-repName').value.trim(),
        contractNo: document.getElementById('swal-contractNo').value.trim(),
        propName: document.getElementById('swal-propName').value.trim(),
        unitNo: document.getElementById('swal-unitNo').value.trim(),
        propType: document.getElementById('swal-propType').value.trim(),
        agentName: document.getElementById('swal-agentName').value.trim(),
        startDate: document.getElementById('swal-startDate').value,
        endDate: document.getElementById('swal-endDate').value,
        annualRent: parseFloat(document.getElementById('swal-annualRent').value) || 0,
        deposit: parseFloat(document.getElementById('swal-deposit').value) || 0,
        status: document.getElementById('swal-status').value,
        notes: document.getElementById('swal-notes').value.trim()
      };
    }
  }).then(function(r) {
    if (r.isConfirmed && r.value) {
      colLog('edit', 'تعديل بيانات عقد ' + c.tenantName + ' → ' + r.value.tenantName + ' (' + r.value.propName + ' — ' + r.value.unitNo + ')');
      CollectionsRepository.update(id, r.value);
      renderColView(); showToast('تم حفظ التعديلات', 'success');
    }
  });
}

// ===== نظام تعديل الدفعات (محمي + مؤشر مطابقة مع الإيجار السنوي) =====
let _epContractId = null;
let _epRows = [];

function colOpenPaymentsModal(id) {
  ensureColData();
  const c = appData.collection.contracts.find(x=>x.id===id);
  if (!c) return;
  _epContractId = id;
  _epRows = JSON.parse(JSON.stringify(c.payments || []));
  if (!_epRows.length) _epRows = [{ amount: c.annualRent||0, dueDate: '', paid: false, paidDate: null }];

  Swal.fire({
    title: 'تعديل دفعات العقد',
    width: 680,
    html: '<div style="text-align:right;direction:rtl;">' +
      '<div style="margin-bottom:8px;font-size:13px;"><b>' + (c.tenantName||'-') + '</b> | العقار: <b>' + (c.propName||'') + '</b> ' + (c.unitNo?('- ' + c.unitNo):'') + ' | الإيجار السنوي: <b>' + (c.annualRent||0).toLocaleString('ar-SA') + ' ﷼</b></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
      '<button type="button" id="swal-ep-add" class="btn btn-outline btn-sm"><i class="fas fa-plus"></i> إضافة دفعة</button>' +
      '<div id="swal-ep-balance" style="font-weight:700;font-size:13px;"></div>' +
      '</div>' +
      '<div class="table-wrapper" style="max-height:280px;overflow-y:auto;">' +
      '<table style="width:100%;"><thead><tr><th>#</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead>' +
      '<tbody id="swal-ep-tbody"></tbody></table></div>' +
      '<div style="margin-top:6px;font-size:13px;">الإجمالي: <b id="swal-ep-total">0</b> ﷼</div>' +
      '</div>',
    showCancelButton: true, confirmButtonText: 'حفظ الدفعات', cancelButtonText: 'إلغاء',
    direction: 'rtl', confirmButtonColor: '#0d2137',
    didOpen: function() {
      colRenderEpTable(c.annualRent || 0);
      document.getElementById('swal-ep-add').onclick = function() {
        _epRows.push({ amount: 0, dueDate: '', paid: false, paidDate: null });
        colRenderEpTable(c.annualRent || 0);
      };
    },
    preConfirm: function() {
      for (let i = 0; i < _epRows.length; i++) {
        if (!_epRows[i].paid && !_epRows[i].dueDate) { Swal.showValidationMessage('الدفعة ' + (i+1) + ' تحتاج تاريخ استحقاق'); return false; }
        if ((_epRows[i].amount || 0) <= 0) { Swal.showValidationMessage('الدفعة ' + (i+1) + ' يجب أن يكون مبلغها أكبر من صفر'); return false; }
      }
      return true;
    }
  }).then(function(r) {
    if (!r.isConfirmed) return;
    const paymentsToSave = _epRows;
    const payCountToSave = _epRows.length;
    CollectionsRepository.update(id, { payments: paymentsToSave, payCount: payCountToSave })
      .then(function(saved) {
        if (!saved) { showToast('تعذر العثور على العقد لحفظ الدفعات', 'error'); return; }
        colLog('edit', 'تعديل دفعات عقد ' + c.tenantName + ' (' + payCountToSave + ' دفعة)');
        renderColView();
        showToast('تم حفظ الدفعات', 'success');
      })
      .catch(function(e) {
        console.error('فشل حفظ الدفعات:', e);
        showToast('تعذر حفظ الدفعات — تأكد من الاتصال', 'error');
      });
  });
}

function colRenderEpTable(annualRent) {
  const tbody = document.getElementById('swal-ep-tbody');
  if (!tbody) return;
  tbody.innerHTML = _epRows.map(function(row, i) {
    const isPaid = !!row.paid;
    return '<tr style="' + (isPaid?'background:rgba(34,197,94,0.06)':'') + '">' +
      '<td style="text-align:center;font-weight:700;">' + (i+1) + '</td>' +
      '<td><input type="date" class="swal2-input" style="margin:0;padding:6px 8px;width:150px;' + (isPaid?'opacity:0.6':'') + '" value="' + (row.dueDate||'') + '" ' + (isPaid?'readonly':'') + ' onchange="_epRows[' + i + '].dueDate=this.value; colRefreshEpTotal(' + annualRent + ')"></td>' +
      '<td><input type="number" step="0.01" class="swal2-input" style="margin:0;padding:6px 8px;width:110px;font-weight:700;' + (isPaid?'color:var(--success)':'') + '" value="' + (row.amount||0) + '" ' + (isPaid?'readonly':'') + ' oninput="_epRows[' + i + '].amount=parseFloat(this.value)||0; colRefreshEpTotal(' + annualRent + ')"></td>' +
      '<td><span class="badge ' + (isPaid?'badge-success':'badge-warning') + '">' + (isPaid?'مسددة':'معلّقة') + '</span></td>' +
      '<td>' + (isPaid
        ? '<button type="button" class="btn btn-danger btn-sm" onclick="colEpUnpay(' + i + ', ' + annualRent + ')" title="تراجع عن التسديد"><i class="fas fa-undo"></i></button>'
        : '<button type="button" class="btn btn-danger btn-sm" onclick="colEpRemove(' + i + ', ' + annualRent + ')" title="حذف الدفعة"><i class="fas fa-trash"></i></button>') +
      '</td></tr>';
  }).join('');
  colRefreshEpTotal(annualRent);
}

function colRefreshEpTotal(annualRent) {
  const total = _epRows.reduce(function(s, r) { return s + (parseFloat(r.amount) || 0); }, 0);
  const totalEl = document.getElementById('swal-ep-total');
  if (totalEl) totalEl.textContent = total.toLocaleString('ar-SA');
  const balEl = document.getElementById('swal-ep-balance');
  if (!balEl) return;
  if (!annualRent) { balEl.innerHTML = ''; return; }
  const diff = total - annualRent;
  if (Math.abs(diff) < 1) balEl.innerHTML = '<span style="color:var(--success)"><i class="fas fa-check-circle"></i> مطابق للإيجار السنوي</span>';
  else if (diff > 0) balEl.innerHTML = '<span style="color:var(--danger)">زيادة ' + diff.toLocaleString('ar-SA') + ' ﷼</span>';
  else balEl.innerHTML = '<span style="color:var(--warning)">ناقص ' + Math.abs(diff).toLocaleString('ar-SA') + ' ﷼</span>';
}

function colEpRemove(i, annualRent) { _epRows.splice(i, 1); colRenderEpTable(annualRent); }

function colEpUnpay(i, annualRent) {
  // ملاحظة: لا يجوز استدعاء Swal.fire() متداخلة هنا — النافذة الأم (تعديل دفعات العقد)
  // لا تزال مفتوحة، وSwal.fire جديدة ستُغلقها فورًا (singleton) وتُطلق then() الخاص بها
  // بحالة غير مؤكدة، مما يُنهي عملية الحفظ بالكامل قبل الوصول إليها. لذلك نستخدم confirm() الأصلي.
  if (window.confirm('هل تريد إعادة هذه الدفعة لحالة معلّقة؟')) {
    _epRows[i].paid = false;
    _epRows[i].paidDate = null;
    colRenderEpTable(annualRent);
  }
}

function colDeleteContract(id) {
  ensureColData();
  const c = appData.collection.contracts.find(x=>x.id===id);
  if (!c) return;
  Swal.fire({
    title: 'حذف العقد', text: `هل تريد حذف عقد ${c.tenantName}؟`,
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'حذف', cancelButtonText: 'إلغاء',
    confirmButtonColor: '#ef4444'
  }).then(r => {
    if (r.isConfirmed) {
      CollectionsRepository.remove(id);
      colLog('delete', `حذف عقد ${c.tenantName} — ${c.propName}`);
      renderColView(); showToast('تم الحذف', 'success');
    }
  });
}

// ===== COLLECTIONS =====
function renderColCollections() {
  ensureColData();
  const prop = (document.getElementById('colCollProp')||{}).value||'';
  const contracts = appData.collection.contracts;
  const props = [...new Set(contracts.map(c=>c.propName).filter(Boolean))];
  const sel = document.getElementById('colCollProp');
  if(sel) sel.innerHTML = `<option value="">كل العقارات</option>` + props.map(p=>`<option value="${p}" ${prop===p?'selected':''}>${p}</option>`).join('');

  const today = new Date();
  const thisMonth = today.toISOString().slice(0,7);
  let totalMonth=0, totalAll=0, regularCount=0;

  const filtered = contracts.filter(c => !prop || c.propName===prop);
  const rows = filtered.map(c => {
    const paid   = (c.payments||[]).filter(p=>p.paid);
    const unpaid = (c.payments||[]).filter(p=>!p.paid);
    const paidTotal = paid.reduce((s,p)=>s+p.amount,0);
    const monthPaid = paid.filter(p=>p.paidDate&&p.paidDate.startsWith(thisMonth)).reduce((s,p)=>s+p.amount,0);
    const isRegular = unpaid.length===0 || unpaid.every(p=> new Date(p.dueDate) > today);
    totalMonth += monthPaid;
    totalAll += paidTotal;
    if(isRegular) regularCount++;
    return { c, paid, unpaid, paidTotal };
  });

  // stats
  const statsEl = document.getElementById('colCollStats');
  if(statsEl) statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-icon" style="background:rgba(34,197,94,0.1);color:var(--success);"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-value">${totalMonth.toLocaleString('ar-SA')} ﷼</div><div class="stat-label">تحصيلات الشهر الحالي</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(201,162,39,0.1);color:var(--gold);"><i class="fas fa-coins"></i></div><div class="stat-value">${totalAll.toLocaleString('ar-SA')} ﷼</div><div class="stat-label">إجمالي التحصيلات الكلية</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(59,130,246,0.1);color:var(--info);"><i class="fas fa-user-check"></i></div><div class="stat-value">${regularCount}</div><div class="stat-label">المستأجرون المنتظمون</div></div>`;

  const el = document.getElementById('colCollContent');
  if (!rows.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-hand-holding-dollar"></i><h3>لا توجد بيانات</h3></div>`; return; }

  el.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>#</th><th>المستأجر</th><th>العقار</th><th>الدفعات المسددة</th><th>الدفعات الغير مسددة</th><th>المبلغ المحصل</th><th>إجراءات</th></tr></thead>
    <tbody>${rows.map(({c,paid,unpaid,paidTotal},i)=>`
      <tr>
        <td>${i+1}</td>
        <td><strong>${c.tenantName}</strong></td>
        <td>${c.propName} — ${c.unitNo}</td>
        <td><span class="badge badge-success">${paid.length} دفعة</span></td>
        <td><span class="badge badge-danger">${unpaid.length} دفعة</span></td>
        <td>${paidTotal.toLocaleString('ar-SA')} ﷼</td>
        <td><button class="btn btn-primary btn-sm" onclick="colPrintTenantReport('${c.id}')"><i class="fas fa-print"></i> طباعة تقرير</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function colPrintTenantReport(id) {
  ensureColData();
  const c = appData.collection.contracts.find(x=>x.id===id);
  if (!c) return;
  const w = window.open('','_blank');
  const paid = (c.payments||[]).filter(p=>p.paid);
  const unpaid = (c.payments||[]).filter(p=>!p.paid);
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير مستأجر</title>
  <style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;color:#0d2137;margin:24px;}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;}th{background:#0d2137;color:white;padding:8px;}td{padding:7px 10px;border-bottom:1px solid #ddd;}h2{color:#0d2137;border-right:4px solid #c9a227;padding-right:10px;}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}.info-item{padding:10px;background:#f7f9fc;border-radius:6px;border:1px solid #d1dce8;}</style>
  </head><body>
  <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #0d2137;padding-bottom:12px;"><h1 style="color:#0d2137;">شركة عودة تطوير العقارية</h1><p>تقرير مستأجر — ${new Date().toLocaleDateString('ar-SA')}</p></div>
  <h2>بيانات المستأجر</h2>
  <div class="info-grid">
    <div class="info-item"><strong>الاسم:</strong> ${c.tenantName}</div>
    <div class="info-item"><strong>الجوال:</strong> ${c.phone}</div>
    <div class="info-item"><strong>العقار:</strong> ${c.propName}</div>
    <div class="info-item"><strong>الوحدة:</strong> ${c.unitNo}</div>
    <div class="info-item"><strong>الإيجار السنوي:</strong> ${(c.annualRent||0).toLocaleString('ar-SA')} ﷼</div>
    <div class="info-item"><strong>مبلغ الدفعة:</strong> ${(c.annualRent/c.payCount||0).toLocaleString('ar-SA')} ﷼</div>
    <div class="info-item"><strong>بداية العقد:</strong> ${c.startDate}</div>
    <div class="info-item"><strong>نهاية العقد:</strong> ${c.endDate}</div>
  </div>
  <h2>جدول الدفعات</h2>
  <table><thead><tr><th>#</th><th>المبلغ</th><th>تاريخ الاستحقاق</th><th>الحالة</th><th>تاريخ السداد</th></tr></thead>
  <tbody>${(c.payments||[]).map((p,i)=>`<tr style="${p.paid?'background:#f0fdf4':''}"><td>${i+1}</td><td>${p.amount.toLocaleString('ar-SA')} ﷼</td><td>${p.dueDate}</td><td>${p.paid?'✅ مسددة':'❌ غير مسددة'}</td><td>${p.paidDate||'—'}</td></tr>`).join('')}</tbody>
  </table>
  <div style="margin-top:20px;padding:14px;background:#f7f9fc;border-radius:8px;border:1px solid #d1dce8;">
    <strong>المسدد:</strong> ${paid.length} دفعة (${paid.reduce((s,p)=>s+p.amount,0).toLocaleString('ar-SA')} ﷼) &nbsp;|&nbsp;
    <strong>المتبقي:</strong> ${unpaid.length} دفعة (${unpaid.reduce((s,p)=>s+p.amount,0).toLocaleString('ar-SA')} ﷼)
  </div>
  </body></html>`);
  w.document.close(); w.focus(); w.print(); w.close();
}

// ===== OVERDUE =====
function renderColOverdue() {
  ensureColData();
  const prop = (document.getElementById('colOverdueProp')||{}).value||'';
  const contracts = appData.collection.contracts;
  const props = [...new Set(contracts.map(c=>c.propName).filter(Boolean))];
  const sel = document.getElementById('colOverdueProp');
  if(sel) sel.innerHTML = `<option value="">كل العقارات</option>` + props.map(p=>`<option value="${p}" ${prop===p?'selected':''}>${p}</option>`).join('');

  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const rows = [];
  contracts.filter(c => !prop || c.propName===prop).forEach(c => {
    (c.payments||[]).forEach((p, idx) => {
      if (!p.paid && p.dueDate < todayStr) {
        const diffDays = Math.floor((today - new Date(p.dueDate)) / 86400000);
        rows.push({ c, p, idx, diffDays });
      }
    });
  });

  const el = document.getElementById('colOverdueContent');
  if (!rows.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle" style="color:var(--success);"></i><h3>لا توجد متأخرات</h3><p>جميع الدفعات في موعدها</p></div>`; return; }

  el.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>#</th><th>المستأجر</th><th>العقار</th><th>رقم الدفعة</th><th>مبلغ الدفعة</th><th>تاريخ الاستحقاق</th><th>أيام التأخير</th><th>إجراءات</th></tr></thead>
    <tbody>${rows.map(({c,p,idx,diffDays},i)=>`
      <tr>
        <td>${i+1}</td>
        <td><strong>${c.tenantName}</strong><br><small style="color:var(--text-muted)">${c.phone}</small></td>
        <td>${c.propName} — ${c.unitNo}</td>
        <td>الدفعة ${idx+1} من ${c.payCount}</td>
        <td>${p.amount.toLocaleString('ar-SA')} ﷼</td>
        <td>${p.dueDate}</td>
        <td><span class="badge badge-danger">${diffDays} يوم</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-success btn-sm" onclick="colMarkPaid('${c.id}',${idx})"><i class="fas fa-check"></i> تم السداد</button>
          <button class="btn btn-outline btn-sm" onclick="colSendWhatsApp('${c.phone}','${c.tenantName}',${p.amount},'${c.propName}')" title="إرسال واتساب"><i class="fab fa-whatsapp"></i></button>
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function colMarkPaid(contractId, payIdx) {
  ensureColData();
  const c = appData.collection.contracts.find(x=>x.id===contractId);
  if (!c || !c.payments[payIdx]) return;
  c.payments[payIdx].paid = true;
  c.payments[payIdx].paidDate = new Date().toISOString().slice(0,10);
  colLog('edit', `تسجيل سداد الدفعة ${payIdx+1} من مستأجر ${c.tenantName}`);
  CollectionsRepository.update(contractId, { payments: c.payments });
  showToast('تم تسجيل السداد', 'success');
  renderColOverdue();
  renderColCollections();
}

function colSendWhatsApp(phone, name, amount, propName) {
  const msg = encodeURIComponent(`السلام عليكم ورحمة الله وبركاته،\nالأخ/الأخت ${name} المحترم/ة،\n\nنود إفادتكم بأنه لديكم دفعة إيجارية مستحقة بمبلغ ${amount.toLocaleString('ar-SA')} ريال للوحدة في ${propName}.\n\nنرجو التكرم بتسديد المبلغ المستحق في أقرب وقت ممكن لصالح شركة عودة تطوير العقارية.\n\nشكراً لتعاونكم،\nشركة عودة تطوير العقارية`);
  const cleanPhone = phone.replace(/\D/g,'');
  const intl = cleanPhone.startsWith('0') ? '966' + cleanPhone.slice(1) : cleanPhone;
  window.open(`https://wa.me/${intl}?text=${msg}`, '_blank');
}

// ===== ALERTS =====
function renderColAlerts() {
  ensureColData();
  const prop = (document.getElementById('colAlertsProp')||{}).value||'';
  const contracts = appData.collection.contracts;
  const props = [...new Set(contracts.map(c=>c.propName).filter(Boolean))];
  const sel = document.getElementById('colAlertsProp');
  if(sel) sel.innerHTML = `<option value="">كل العقارات</option>` + props.map(p=>`<option value="${p}" ${prop===p?'selected':''}>${p}</option>`).join('');

  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const alerts = [];
  contracts.filter(c => !prop || c.propName===prop).forEach(c => {
    (c.payments||[]).forEach((p, idx) => {
      if (!p.paid && p.dueDate >= todayStr) {
        const diffDays = Math.floor((new Date(p.dueDate) - today) / 86400000);
        if (diffDays <= 10) alerts.push({ c, p, idx, diffDays });
      }
    });
  });
  alerts.sort((a,b)=>a.diffDays-b.diffDays);

  const el = document.getElementById('colAlertsContent');
  if (!alerts.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-bell-slash"></i><h3>لا توجد تنبيهات حالية</h3><p>لا توجد دفعات مستحقة خلال الـ 10 أيام القادمة</p></div>`; return; }

  const getLevel = (d) => d <= 1 ? {color:'#ef4444',bg:'rgba(239,68,68,0.08)',label:'عاجل جداً - يوم واحد'} : d <= 5 ? {color:'#f97316',bg:'rgba(249,115,22,0.08)',label:`${d} أيام`} : {color:'#eab308',bg:'rgba(234,179,8,0.08)',label:`${d} أيام`};

  el.innerHTML = alerts.map(({c,p,idx,diffDays})=>{
    const lv = getLevel(diffDays);
    return `<div style="padding:16px;border-radius:10px;border:1px solid ${lv.color};background:${lv.bg};margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-weight:700;font-size:14px;color:${lv.color};">● ${c.tenantName}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${c.propName} — ${c.unitNo} | الدفعة ${idx+1} من ${c.payCount} | ${p.amount.toLocaleString('ar-SA')} ﷼</div>
        <div style="font-size:12px;margin-top:3px;color:${lv.color};">تاريخ الاستحقاق: ${p.dueDate} (${lv.label})</div>
      </div>
      <button class="btn btn-sm" style="background:${lv.color};color:white;" onclick="colSendWhatsApp('${c.phone}','${c.tenantName}',${p.amount},'${c.propName}')"><i class="fab fa-whatsapp"></i> تذكير واتساب</button>
    </div>`;
  }).join('');
}

// ===== TENANTS LIST =====
function renderColTenants() {
  ensureColData();
  const prop  = (document.getElementById('colTenantsProp')||{}).value||'';
  const agent = (document.getElementById('colTenantsAgent')||{}).value||'';
  const contracts = appData.collection.contracts;
  const props  = [...new Set(contracts.map(c=>c.propName).filter(Boolean))];
  const agents = [...new Set(contracts.map(c=>c.agentName).filter(Boolean))];
  const selP = document.getElementById('colTenantsProp');
  const selA = document.getElementById('colTenantsAgent');
  if(selP) selP.innerHTML = `<option value="">كل العقارات</option>` + props.map(p=>`<option value="${p}" ${prop===p?'selected':''}>${p}</option>`).join('');
  if(selA) selA.innerHTML = `<option value="">كل المسوقين</option>` + agents.map(a=>`<option value="${a}" ${agent===a?'selected':''}>${a}</option>`).join('');

  const filtered = contracts.filter(c => (!prop||c.propName===prop) && (!agent||c.agentName===agent));
  const el = document.getElementById('colTenantsContent');
  if (!filtered.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-address-book"></i><h3>لا توجد بيانات</h3></div>`; return; }

  el.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>#</th><th>اسم المستأجر</th><th>رقم الجوال</th><th>العقار</th><th>الوحدة</th><th>المسوق</th></tr></thead>
    <tbody>${filtered.map((c,i)=>`<tr>
      <td>${i+1}</td><td><strong>${c.tenantName}</strong></td>
      <td><a href="tel:${c.phone}" style="color:var(--info);">${c.phone}</a></td>
      <td>${c.propName}</td><td>${c.unitNo}</td><td>${c.agentName||'—'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function colExportTenantsExcel() {
  ensureColData();
  const prop  = (document.getElementById('colTenantsProp')||{}).value||'';
  const agent = (document.getElementById('colTenantsAgent')||{}).value||'';
  const filtered = appData.collection.contracts.filter(c => (!prop||c.propName===prop) && (!agent||c.agentName===agent));
  const data = [['#','اسم المستأجر','رقم الجوال','العقار','الوحدة','المسوق']];
  filtered.forEach((c,i) => data.push([i+1, c.tenantName, c.phone, c.propName, c.unitNo, c.agentName||'—']));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'أرقام المستأجرين');
  XLSX.writeFile(wb, `أرقام_المستأجرين_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  showToast('تم تصدير الملف', 'success');
}

// ===== LOG =====
function renderColLog() {
  ensureColData();
  const type = (document.getElementById('colLogType')||{}).value||'';
  let logs = appData.collection.log;
  if (type) logs = logs.filter(l=>l.action===type);
  const el = document.getElementById('colLogContent');
  if (!logs.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>لا توجد أحداث</h3></div>`; return; }

  const actionColor = { add:'var(--success)', edit:'var(--info)', delete:'var(--danger)' };
  const actionLabel = { add:'إضافة', edit:'تعديل', delete:'حذف' };
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
    ${logs.map(l=>`<div style="padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;border-right:4px solid ${actionColor[l.action]||'var(--gold)'};display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <span class="badge" style="background:${actionColor[l.action]||'var(--gold)'};color:white;">${actionLabel[l.action]||l.action}</span>
      <span style="flex:1;font-size:13px;">${l.detail}</span>
      <span style="font-size:11px;color:var(--gold);white-space:nowrap;"><i class="fas fa-user"></i> ${l.user||'غير معروف'}</span>
      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${new Date(l.date).toLocaleString('ar-SA')}</span>
    </div>`).join('')}
  </div>`;
}

function colClearLog() {
  ensureColData();
  Swal.fire({ title:'مسح السجل', text:'هل تريد مسح سجل التحصيل كاملاً؟', icon:'warning', showCancelButton:true, confirmButtonText:'مسح', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(r=>{
    if(r.isConfirmed) { markAllLogEntriesDeleted('collection', appData.collection.log); appData.collection.log=[]; save(); renderColLog(); showToast('تم مسح السجل','success'); }
  });
}
