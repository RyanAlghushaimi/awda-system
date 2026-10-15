// ============================================================
// ===== EMPLOYEES MANAGEMENT =====
// ============================================================
function ensureEmployeesData() {
  if (!appData.employees) appData.employees = { list: [], log: [] };
  if (!appData.employees.list) appData.employees.list = [];
  if (!appData.employees.log) appData.employees.log = [];
}
// ============================================================
// ===== EmployeesRepository: مبني على BaseRepository =====
// ============================================================
const _empBaseRepo = createFirestoreRepository({
  migrationSection: 'employees',
  getLocalArray: () => appData.employees.list,
  setLocalArray: (items) => { appData.employees.list = items; },
  ensureFn: ensureEmployeesData,
  collectionService: (typeof EmployeesCollectionService !== 'undefined') ? EmployeesCollectionService : null,
  onRemoteChange: () => { if (document.getElementById('empGrid')) renderEmpGrid(); if (document.getElementById('empTableBody')) renderEmpList(); }
});
const EmployeesRepository = Object.assign({}, _empBaseRepo, {
  async getLog() { ensureEmployeesData(); return appData.employees.log; },
  _logEntry(action, details, before, after) {
    ensureEmployeesData();
    const entry = { id: uid(), action, details, before: stripHeavyLogFields(before), after: stripHeavyLogFields(after), ts: new Date().toLocaleString('ar-SA') };
    this.addLog(entry);
    if (document.getElementById('empLogType')) renderEmpDraft();
  },
  addLog(entry) {
    ensureEmployeesData();
    appData.employees.log.push(entry);
    if (appData.employees.log.length > 300) appData.employees.log.shift();
  },
  async clearLog() { ensureEmployeesData(); markAllLogEntriesDeleted('employees', appData.employees.log); appData.employees.log = []; await save(); },
  async add(item) {
    const saved = await _empBaseRepo.add.call(this, item);
    if (saved) this._logEntry('add', `تمت إضافة الموظف: ${saved.name}`, null, saved);
    return saved;
  },
  async update(id, changes) {
    ensureEmployeesData();
    const existing = appData.employees.list.find(x => x.id === id);
    const before = existing ? JSON.parse(JSON.stringify(existing)) : null;
    const item = await _empBaseRepo.update.call(this, id, changes);
    if (item) this._logEntry('edit', `تم تعديل بيانات الموظف: ${item.name}`, before, item);
    return item;
  },
  async remove(id) {
    ensureEmployeesData();
    let removedItem;
    try {
      removedItem = await _empBaseRepo.remove.call(this, id);
    } catch (e) {
      console.error('فشل حذف الموظف من Firestore، لن يُسجَّل:', e);
      throw e;
    }
    if (removedItem) this._logEntry('delete', `تم حذف الموظف: ${removedItem.name}`, removedItem, null);
    return removedItem;
  }
});

function renderEmpEntryPage() {
  ensureEmployeesData();
  document.getElementById('emp-name').value = '';
  document.getElementById('emp-personalId').value = '';
  document.getElementById('emp-companyId').value = '';
  document.getElementById('emp-salary').value = '';
  document.getElementById('emp-department').value = '';
  document.getElementById('emp-manager').value = '';
  document.getElementById('emp-marital').value = '';
  document.getElementById('emp-gender').value = '';
  document.getElementById('emp-nationality').value = '';
  const depts = [...new Set(appData.employees.list.map(e => e.department).filter(Boolean))];
  const mgrs = [...new Set(appData.employees.list.map(e => e.manager).filter(Boolean))];
  const nats = [...new Set(appData.employees.list.map(e => e.nationality).filter(Boolean))];
  document.getElementById('empDeptList').innerHTML = depts.map(d => `<option value="${d}">`).join('');
  document.getElementById('empManagerList').innerHTML = mgrs.map(m => `<option value="${m}">`).join('');
  document.getElementById('empNatList').innerHTML = nats.map(n => `<option value="${n}">`).join('');
  renderEmpGrid();
}
function renderEmpGrid() {
  const grid = document.getElementById('empGrid');
  if (!appData.employees.list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-user-slash"></i><h3>لا يوجد موظفون</h3><p>أضف موظفاً أولاً</p></div>';
    return;
  }
  grid.innerHTML = [...appData.employees.list].reverse().map(e => `
    <div class="agent-card">
      <div class="agent-avatar"><i class="fas fa-id-badge"></i></div>
      <div class="agent-name">${e.name}</div>
      <div style="font-size:11px;color:var(--text-muted);">${e.department || '—'} ${e.manager ? '· يتبع: ' + e.manager : ''}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${e.personalId ? 'رقم شخصي: ' + e.personalId : ''}</div>
      <div class="agent-stats">
        <div class="agent-stat"><div class="agent-stat-val" style="font-size:13px;">${e.salary ? fmt(e.salary) : '—'}</div><div class="agent-stat-lbl">الراتب</div></div>
        <div class="agent-stat"><div class="agent-stat-val" style="font-size:13px;">${e.gender || '—'}</div><div class="agent-stat-lbl">الجنس</div></div>
        <div class="agent-stat"><div class="agent-stat-val" style="font-size:13px;">${e.nationality || '—'}</div><div class="agent-stat-lbl">الجنسية</div></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="editEmployee('${e.id}')"><i class="fas fa-edit"></i> تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${e.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}
async function addEmployee() {
  ensureEmployeesData();
  const name = document.getElementById('emp-name').value.trim();
  const personalId = document.getElementById('emp-personalId').value.trim();
  if (!name) { showToast('يرجى إدخال اسم الموظف', 'error'); return; }
  if (!personalId) { showToast('يرجى إدخال الرقم الشخصي', 'error'); return; }
  if (appData.employees.list.find(e => e.personalId === personalId)) { showToast('يوجد موظف بنفس الرقم الشخصي', 'error'); return; }
  const emp = {
    id: uid(), name, personalId,
    companyId: document.getElementById('emp-companyId').value.trim(),
    salary: document.getElementById('emp-salary').value,
    department: document.getElementById('emp-department').value.trim(),
    manager: document.getElementById('emp-manager').value.trim(),
    maritalStatus: document.getElementById('emp-marital').value,
    gender: document.getElementById('emp-gender').value,
    nationality: document.getElementById('emp-nationality').value.trim(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await EmployeesRepository.add(emp);
  showToast(`تم إضافة الموظف: ${name}`, 'success');
  renderEmpEntryPage();
}
function empFieldHTML(e) {
  return `<div style="text-align:right;display:flex;flex-direction:column;gap:8px;">
    <label>اسم الموظف<input id="sw-name" class="swal2-input" style="margin:2px 0;" value="${e.name||''}"></label>
    <label>الرقم الشخصي<input id="sw-personalId" class="swal2-input" style="margin:2px 0;" value="${e.personalId||''}"></label>
    <label>رقم الشركة<input id="sw-companyId" class="swal2-input" style="margin:2px 0;" value="${e.companyId||''}"></label>
    <label>الراتب الكلي<input id="sw-salary" type="number" class="swal2-input" style="margin:2px 0;" value="${e.salary||''}"></label>
    <label>القسم<input id="sw-department" class="swal2-input" style="margin:2px 0;" value="${e.department||''}"></label>
    <label>المدير المباشر<input id="sw-manager" class="swal2-input" style="margin:2px 0;" value="${e.manager||''}"></label>
    <label>الحالة الاجتماعية
      <select id="sw-marital" class="swal2-input" style="margin:2px 0;">
        <option value="" ${!e.maritalStatus?'selected':''}>-- اختر --</option>
        <option value="أعزب" ${e.maritalStatus==='أعزب'?'selected':''}>أعزب</option>
        <option value="متزوج" ${e.maritalStatus==='متزوج'?'selected':''}>متزوج</option>
        <option value="مطلق" ${e.maritalStatus==='مطلق'?'selected':''}>مطلق</option>
        <option value="أرمل" ${e.maritalStatus==='أرمل'?'selected':''}>أرمل</option>
      </select>
    </label>
    <label>الجنس
      <select id="sw-gender" class="swal2-input" style="margin:2px 0;">
        <option value="" ${!e.gender?'selected':''}>-- اختر --</option>
        <option value="ذكر" ${e.gender==='ذكر'?'selected':''}>ذكر</option>
        <option value="أنثى" ${e.gender==='أنثى'?'selected':''}>أنثى</option>
      </select>
    </label>
    <label>الجنسية<input id="sw-nationality" class="swal2-input" style="margin:2px 0;" value="${e.nationality||''}"></label>
  </div>`;
}
function collectEmpFieldValues() {
  return {
    name: document.getElementById('sw-name').value.trim(),
    personalId: document.getElementById('sw-personalId').value.trim(),
    companyId: document.getElementById('sw-companyId').value.trim(),
    salary: document.getElementById('sw-salary').value,
    department: document.getElementById('sw-department').value.trim(),
    manager: document.getElementById('sw-manager').value.trim(),
    maritalStatus: document.getElementById('sw-marital').value,
    gender: document.getElementById('sw-gender').value,
    nationality: document.getElementById('sw-nationality').value.trim()
  };
}
function editEmployee(id) {
  const e = appData.employees.list.find(x => x.id === id); if (!e) return;
  Swal.fire({
    title: 'تعديل بيانات الموظف', width: 520, html: empFieldHTML(e),
    showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137',
    preConfirm: () => {
      const v = collectEmpFieldValues();
      if (!v.name) { Swal.showValidationMessage('يرجى إدخال اسم الموظف'); return false; }
      if (!v.personalId) { Swal.showValidationMessage('يرجى إدخال الرقم الشخصي'); return false; }
      if (appData.employees.list.find(x => x.personalId === v.personalId && x.id !== id)) { Swal.showValidationMessage('يوجد موظف آخر بنفس الرقم الشخصي'); return false; }
      return v;
    }
  }).then(async r => {
    if (r.isConfirmed) {
      await EmployeesRepository.update(id, r.value);
      showToast('تم تحديث بيانات الموظف', 'success');
      renderEmpGrid(); renderEmpList();
    }
  });
}
function deleteEmployee(id) {
  const e = appData.employees.list.find(x => x.id === id); if (!e) return;
  Swal.fire({
    title: 'حذف الموظف', text: `هل تريد حذف "${e.name}"؟`, icon: 'warning', showCancelButton: true,
    confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444'
}).then(async r => {
    if (r.isConfirmed) {
      try {
        await EmployeesRepository.remove(id);
        showToast('تم حذف الموظف', 'success');
        renderEmpGrid(); renderEmpList();
      } catch (err) {
        showToast('تعذر حذف الموظف، حاول مرة أخرى', 'error');
      }
    }
  });
}
function populateEmpFilters() {
  ensureEmployeesData();
  const depts = [...new Set(appData.employees.list.map(e => e.department).filter(Boolean))];
  const nats = [...new Set(appData.employees.list.map(e => e.nationality).filter(Boolean))];
  const dSel = document.getElementById('empFilterDept'); const cur1 = dSel.value;
  dSel.innerHTML = '<option value="">كل الأقسام</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join(''); dSel.value = cur1;
  const nSel = document.getElementById('empFilterNat'); const cur2 = nSel.value;
  nSel.innerHTML = '<option value="">كل الجنسيات</option>' + nats.map(n => `<option value="${n}">${n}</option>`).join(''); nSel.value = cur2;
}
function clearEmpFilters() {
  document.getElementById('empSearch').value = '';
  document.getElementById('empFilterDept').value = '';
  document.getElementById('empFilterGender').value = '';
  document.getElementById('empFilterMarital').value = '';
  document.getElementById('empFilterNat').value = '';
  renderEmpList();
}
function renderEmpList() {
  ensureEmployeesData();
  const q = (document.getElementById('empSearch')?.value || '').trim().toLowerCase();
  const fDept = document.getElementById('empFilterDept')?.value || '';
  const fGender = document.getElementById('empFilterGender')?.value || '';
  const fMarital = document.getElementById('empFilterMarital')?.value || '';
  const fNat = document.getElementById('empFilterNat')?.value || '';
  let list = appData.employees.list.filter(e => {
    if (q && !(`${e.name} ${e.personalId} ${e.department||''}`.toLowerCase().includes(q))) return false;
    if (fDept && e.department !== fDept) return false;
    if (fGender && e.gender !== fGender) return false;
    if (fMarital && e.maritalStatus !== fMarital) return false;
    if (fNat && e.nationality !== fNat) return false;
    return true;
  });
  const body = document.getElementById('empTableBody');
  const empty = document.getElementById('empTableEmpty');
  if (!list.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = list.map((e, i) => `
    <tr>
      <td>${i+1}</td><td>${e.name}</td><td>${e.personalId||'—'}</td><td>${e.companyId||'—'}</td>
      <td>${e.salary ? fmt(e.salary) : '—'}</td><td>${e.department||'—'}</td><td>${e.manager||'—'}</td>
      <td>${e.maritalStatus||'—'}</td><td>${e.gender||'—'}</td><td>${e.nationality||'—'}</td>
      <td><div style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" onclick="editEmployee('${e.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${e.id}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}
function renderEmpDraft() {
  ensureEmployeesData();
  const type = document.getElementById('empLogType').value;
  const labels = { add: 'إضافة', edit: 'تعديل', delete: 'حذف' };
  const icons = { add: 'fas fa-plus-circle', edit: 'fas fa-edit', delete: 'fas fa-trash' };
  const colors = { add: 'var(--success)', edit: 'var(--info)', delete: 'var(--danger)' };
  let list = [...appData.employees.log].reverse();
  if (type) list = list.filter(l => l.action === type);
  const container = document.getElementById('empLogContainer');
  const empty = document.getElementById('empLogEmpty');
  if (!list.length) { container.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  container.innerHTML = list.map(l => `
    <div onclick='showLogDiff(${JSON.stringify(l).replace(/'/g,"&#39;")})' style="cursor:pointer;display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);border-right:4px solid ${colors[l.action]};">
      <i class="${icons[l.action]}" style="color:${colors[l.action]};margin-top:2px;font-size:15px;flex-shrink:0;"></i>
      <div style="flex:1;"><div style="font-size:13px;font-weight:700;color:var(--text);">${labels[l.action]}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${l.details}</div></div>
      <div style="font-size:11px;color:var(--text-light);white-space:nowrap;">${l.ts}</div>
    </div>`).join('');
}
function clearEmpLog() {
  Swal.fire({ title:'مسح السجل', text:'هل تريد حذف جميع سجلات الأحداث؟', icon:'warning', showCancelButton:true, confirmButtonText:'نعم، امسح', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(r => {
    if (r.isConfirmed) { EmployeesRepository.clearLog(); renderEmpDraft(); showToast('تم مسح السجل', 'success'); }
  });
}

