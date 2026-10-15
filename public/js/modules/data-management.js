// ============================================================
// ===== DATA MANAGEMENT =====
// ============================================================
function populateFilterDropdowns() {
  const agentSel = document.getElementById('filterAgent');
  const cur = agentSel.value;
  agentSel.innerHTML = '<option value="">كل المسوقين</option>' + appData.agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  if (cur) agentSel.value = cur;
  const yearSel = document.getElementById('filterYear');
  const curY = yearSel.value;
  yearSel.innerHTML = '<option value="">كل السنوات</option>' + YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
  if (curY) yearSel.value = curY;
  const monthSel = document.getElementById('filterMonth');
  const curM = monthSel.value;
  monthSel.innerHTML = '<option value="">كل الأشهر</option>' + MONTHS.map((m,i) => `<option value="${MONTH_KEYS[i]}">${m}</option>`).join('');
  if (curM) monthSel.value = curM;
}
function clearFilters() {
  document.getElementById('dataSearch').value = '';
  document.getElementById('filterAgent').value = '';
  document.getElementById('filterYear').value = '';
  document.getElementById('filterMonth').value = '';
  renderDataTable();
}
function renderDataTable() {
  const search = document.getElementById('dataSearch').value.toLowerCase();
  const agentFilter = document.getElementById('filterAgent').value;
  const yearFilter = document.getElementById('filterYear').value;
  const monthFilter = document.getElementById('filterMonth').value;
  const tbody = document.getElementById('dataTableBody');
  tbody.innerHTML = '';
  let rows = [], idx = 0;
  appData.agents.forEach(agent => {
    if (agentFilter && agent.id !== agentFilter) return;
    MONTH_KEYS.forEach((mk, mi) => {
      if (monthFilter && mk !== monthFilter) return;
      (agent.months?.[mk]?.contracts || []).forEach(c => {
        const cYear = String(c.year || CURRENT_YEAR);
        if (yearFilter && cYear !== String(yearFilter)) return;
        if (search && !`${agent.name} ${c.unitName} ${c.tenantName} ${c.notes}`.toLowerCase().includes(search)) return;
        rows.push({ agent, mk, mi, c });
      });
    });
  });
  if (!rows.length) {
    document.getElementById('dataTableEmpty').style.display = 'block';
    document.getElementById('dataTable').style.display = 'none';
    return;
  }
  document.getElementById('dataTableEmpty').style.display = 'none';
  document.getElementById('dataTable').style.display = 'table';
  rows.forEach(({ agent, mk, mi, c }) => {
    idx++;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx}</td>
      <td><strong>${agent.name}</strong></td>
      <td><span class="badge badge-info">${c.year || CURRENT_YEAR}</span></td>
      <td><span class="badge badge-info">${MONTHS[mi]}</span></td>
      <td>${c.unitName}</td>
      <td>${c.tenantName}</td>
      <td>${fmtDate(c.contractDate)}</td>
      <td><strong style="color:var(--gold);">${fmt(c.rentAmount)}</strong></td>
      <td>${fmt(c.commissionAmount)}</td>
      <td style="font-size:11px;color:var(--text-muted);">${c.notes||'—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-outline btn-icon btn-sm" onclick="editContract('${agent.id}','${mk}','${c.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteContract('${agent.id}','${mk}','${c.id}')" title="حذف"><i class="fas fa-trash"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}
const __contractEditInProgress = new Set();
function editContract(agentId, monthKey, contractId) {
  const agent = appData.agents.find(a => a.id === agentId);
  if (!agent) return;
  const c = (agent.months?.[monthKey]?.contracts || []).find(x => x.id === contractId);
  if (!c) return;
  Swal.fire({
    title: 'تعديل العقد',
    html: `
      <div style="text-align:right;direction:rtl;">
        <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">السنة</label>
          <select class="swal2-select" id="e-year" style="direction:rtl;width:100%;">${YEARS.map(y => `<option value="${y}" ${String(c.year||CURRENT_YEAR)===String(y)?'selected':''}>${y}</option>`).join('')}</select>
        </div>
        <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">اسم الوحدة</label><input class="swal2-input" id="e-unit" value="${c.unitName}" style="direction:rtl;"></div>
        <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">اسم العميل</label><input class="swal2-input" id="e-tenant" value="${c.tenantName}" style="direction:rtl;"></div>
        <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">التاريخ</label><input type="date" class="swal2-input" id="e-date" value="${c.contractDate}" style="direction:rtl;"></div>
        <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">الإيجار</label><input type="number" class="swal2-input" id="e-rent" value="${c.rentAmount}" min="0" style="direction:rtl;"></div>
        <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">السعي</label><input type="number" class="swal2-input" id="e-comm" value="${c.commissionAmount}" min="0" style="direction:rtl;"></div>
        <div><label style="font-size:12px;display:block;margin-bottom:4px;">ملاحظات</label><input class="swal2-input" id="e-notes" value="${c.notes||''}" style="direction:rtl;"></div>
      </div>`,
    confirmButtonText: 'حفظ التعديل', cancelButtonText: 'إلغاء',
    showCancelButton: true, confirmButtonColor: '#0d2137',
    preConfirm: () => {
      const unit = document.getElementById('e-unit').value.trim();
      const tenant = document.getElementById('e-tenant').value.trim();
      if (!unit || !tenant) { Swal.showValidationMessage('يرجى تعبئة الحقول المطلوبة'); return false; }
      return { unit, tenant, date: document.getElementById('e-date').value, rent: parseFloat(document.getElementById('e-rent').value)||0, comm: parseFloat(document.getElementById('e-comm').value)||0, notes: document.getElementById('e-notes').value.trim(), year: document.getElementById('e-year').value };
    }
  }).then(r => {
    if (r.isConfirmed) {
      const changes = { unitName: r.value.unit, tenantName: r.value.tenant, contractDate: r.value.date,
        rentAmount: r.value.rent, commissionAmount: r.value.comm, notes: r.value.notes, year: r.value.year,
        updatedAt: new Date().toISOString() };
      Object.assign(c, changes);
      if (__contractEditInProgress.has(contractId)) { return; }
      __contractEditInProgress.add(contractId);
      (async () => {
        try {
          if (typeof AgentsRepository !== 'undefined' && AgentsRepository._usingCollection) {
            await AgentContractsService.update(agentId, contractId, changes);
          } else {
            await save();
          }
          renderDataTable();
          showToast('تم تعديل العقد', 'success');
        } catch (e) {
          const code = e && e.code;
          showToast(code === 'resource-exhausted' ? 'الخادم مشغول حاليًا، يرجى المحاولة بعد قليل' : 'تعذر حفظ التعديل', 'error');
          console.error('[editContract] فشل الحفظ:', code || '', e && e.message);
        } finally {
          __contractEditInProgress.delete(contractId);
        }
      })();
    }
  });
}
function deleteContract(agentId, monthKey, contractId) {
  Swal.fire({
    title: 'حذف العقد', text: 'هل أنت متأكد من حذف هذا العقد؟',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء',
    confirmButtonColor: '#ef4444'
  }).then(r => {
    if (r.isConfirmed) {
      ContractsRepository.remove(contractId);
      renderDataTable();
      showToast('تم حذف العقد', 'success');
    }
  });
}

