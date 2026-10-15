// ============================================================
// ===== AgentsRepository: مبني على BaseRepository =====
// ============================================================
const AgentsRepository = createFirestoreRepository({
  migrationSection: 'agents',
  getLocalArray: () => appData.agents,
  setLocalArray: (items) => { appData.agents = items; },
  ensureFn: ensureAgentsData,
  collectionService: (typeof AgentsCollectionService !== 'undefined') ? AgentsCollectionService : null,
  onRemoteChange: () => { if (document.getElementById('agentsGridContent')) renderAgentsGrid(); }
});
// ============================================================
// ===== ContractsRepository: عقود متداخلة داخل agent.months[monthKey].contracts =====
// ============================================================
// العقود ليست مستندًا مستقلًا — بقيت متداخلة داخل مستند المسوّق نفسه بقرار
// معماري مقصود (لا تُفصل عن المسوّق). لهذا كل تعديل/حذف يمر عبر
// AgentsCollectionService.updateWithFn التي تقرأ أحدث نسخة من مستند المسوّق
// نفسه وتُعدّلها ضمن نفس المعاملة (Transaction) — فلا حاجة لتومبستون هنا؛
// المستند نفسه محمي بمعاملة Firestore حقيقية بدل الاعتماد على مستند كبير مشترك.
const ContractsRepository = {
  ensure() { ensureAgentsData(); },
  async getAll() {
    this.ensure();
    const all = [];
    appData.agents.forEach(a => Object.entries(a.months || {}).forEach(([mk, m]) => (m.contracts || []).forEach(c => all.push({ ...c, agentId: a.id, monthKey: mk }))));
    return all;
  },
  // إضافة عقد واحد فقط: مستند جديد في agents/{agentId}/contracts — لا قراءة
  // ولا كتابة لأي عقد آخر أو لمستند المسوّق نفسه.
  async add(agentId, monthKey, contract) {
    this.ensure();
    const agent = appData.agents.find(a => a.id === agentId);
    if (!agent) return null;
    if (!agent.months[monthKey]) agent.months[monthKey] = { contracts: [] };
    const withMonth = { ...contract, monthKey };
    agent.months[monthKey].contracts.push(withMonth);
    if (AgentsRepository._usingCollection) {
      await AgentContractsService.add(agentId, withMonth);
    } else {
      await save();
    }
    return withMonth;
  },
  // حذف عقد واحد فقط بمعرّفه — لا يلمس أي عقد آخر لنفس المسوّق.
  async remove(contractId) {
    this.ensure();
    markDeleted('contracts', contractId, 'manual'); // طبقة أمان مؤقتة إضافية
    let owningAgentId = null;
    appData.agents.forEach(a => {
      Object.values(a.months || {}).forEach(m => {
        if (m && Array.isArray(m.contracts) && m.contracts.some(c => c.id === contractId)) owningAgentId = a.id;
      });
    });
    appData.agents.forEach(a => {
      Object.values(a.months || {}).forEach(m => {
        if (m && Array.isArray(m.contracts)) m.contracts = m.contracts.filter(c => c.id !== contractId);
      });
    });
    if (AgentsRepository._usingCollection && owningAgentId) {
      await AgentContractsService.remove(owningAgentId, contractId);
    } else if (!AgentsRepository._usingCollection) {
      await save();
    }
  }
};

// ============================================================
// ===== تحميل عقود المسوّق من subcollection عند فتح شاشته =====
// ============================================================
// يُشغّل الترحيل مرة واحدة فقط (idempotent) ثم يقرأ عقود هذا المسوّق من
// الـ subcollection ليجعلها مصدر العرض المحلي appData.agents[].months —
// بدون لمس النسخة الاحتياطية القديمة داخل مستند المسوّق نفسه.
const __agentContractsLoaded = new Set();
async function ensureAgentContractsLoaded(agentId) {
  if (!agentId || !AgentsRepository._usingCollection || __agentContractsLoaded.has(agentId)) return;
  const agent = appData.agents.find(a => a.id === agentId);
  if (!agent) return;
  try {
    await migrateAgentContractsToSubcollection(agentId, agent.months || {});
    const items = await AgentContractsService.getAll(agentId);
    const months = {};
    items.forEach(c => {
      const mk = c.monthKey;
      if (!mk) return;
      if (!months[mk]) months[mk] = { contracts: [] };
      months[mk].contracts.push(c);
    });
    agent.months = months;
    __agentContractsLoaded.add(agentId);
  } catch (e) {
    console.error('[ensureAgentContractsLoaded] فشل تحميل عقود المسوّق:', agentId, e && e.message);
    showToast('تعذر تحميل عقود المسوّق، الرجاء إعادة المحاولة', 'error');
  }
}
function selectAgentForContract(id) {
  switchEntryTab('contract', document.querySelectorAll('.tab-btn')[1]);
  document.getElementById('contractAgentSelect').value = id;
  loadAgentMonths();
}
function populateContractSelects() {
  const sel = document.getElementById('contractAgentSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- اختر المسوق --</option>' +
    appData.agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  if (cur) sel.value = cur;
  populateYearSelect();
  populateMonthSelect();
}
function populateYearSelect() {
  const ySel = document.getElementById('contractYearSelect');
  const curY = ySel.value;
  ySel.innerHTML = '<option value="">-- اختر السنة --</option>' +
    YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
  ySel.value = curY || String(CURRENT_YEAR);
}
function populateMonthSelect() {
  const sel = document.getElementById('contractMonthSelect');
  const yearSel = document.getElementById('contractYearSelect').value;
  const now = new Date().getMonth();
  const limit = (Number(yearSel) === CURRENT_YEAR) ? now : 11;
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- اختر الشهر --</option>' +
    MONTHS.slice(0, limit + 1).map((m, i) => `<option value="${MONTH_KEYS[i]}">${m}</option>`).join('');
  if (cur) sel.value = cur;
}
async function loadAgentMonths() {
  const agentId = document.getElementById('contractAgentSelect').value;
  const monthKey = document.getElementById('contractMonthSelect').value;
  const year = document.getElementById('contractYearSelect').value;
  const container = document.getElementById('contractsContainer');
  const addBtn = document.getElementById('addContractBtnArea');
  const saveBtn = document.getElementById('saveContractBtnArea');
  if (!agentId || !monthKey || !year) {
    container.innerHTML = '';
    addBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    return;
  }
  container.innerHTML = '<div style="padding:12px;text-align:center;color:#888;">جارٍ التحميل...</div>';
  await ensureAgentContractsLoaded(agentId);
  contractRowCount = 0;
  container.innerHTML = '';
  const agent = appData.agents.find(a => a.id === agentId);
  const contracts = (agent?.months?.[monthKey]?.contracts || []).filter(c => String(c.year || CURRENT_YEAR) === String(year));
  if (contracts.length) {
    contracts.forEach(c => addContractRow(c));
  } else {
    addContractRow();
  }
  addBtn.style.display = 'block';
  saveBtn.style.display = 'flex';
}
document.getElementById('contractMonthSelect').addEventListener('change', loadAgentMonths);
function addContractRow(data = {}) {
  contractRowCount++;
  const id = contractRowCount;
  const row = document.createElement('div');
  row.className = 'contract-form-row';
  row.id = `contract-row-${id}`;
  row.innerHTML = `
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">اسم الوحدة *</label>
      <input type="text" class="form-control" id="cr-unit-${id}" placeholder="الوحدة" value="${data.unitName||''}">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">اسم العميل *</label>
      <input type="text" class="form-control" id="cr-tenant-${id}" placeholder="العميل" value="${data.tenantName||''}">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">تاريخ العقد *</label>
      <input type="date" class="form-control" id="cr-date-${id}" value="${data.contractDate||''}">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">الإيجار *</label>
      <input type="number" class="form-control" id="cr-rent-${id}" placeholder="0" min="0" value="${data.rentAmount||''}">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">السعي *</label>
      <input type="number" class="form-control" id="cr-comm-${id}" placeholder="0" min="0" value="${data.commissionAmount||''}">
    </div>
    <div class="form-group" style="margin:0;">
      <label class="form-label" style="font-size:11px;">ملاحظات</label>
      <input type="text" class="form-control" id="cr-notes-${id}" placeholder="اختياري" value="${data.notes||''}">
    </div>
    <div style="display:flex;align-items:flex-end;padding-bottom:0;">
      <button class="btn btn-danger btn-icon" onclick="removeContractRow(${id})" title="حذف"><i class="fas fa-trash"></i></button>
    </div>
    <input type="hidden" id="cr-id-${id}" value="${data.id||''}">
  `;
  document.getElementById('contractsContainer').appendChild(row);
}
function removeContractRow(id) {
  const row = document.getElementById(`contract-row-${id}`);
  if (row) row.remove();
}
// يمنع أكثر من عملية حفظ متزامنة لنفس المسوّق، ويمنع أي استدعاء مزدوج
// لـ saveContracts() (نقرتان سريعتان على الزر) قبل انتهاء العملية الحالية.
const __contractsSaveInProgress = new Set();

const __contractsBulkSaveInProgress = new Set();
async function saveContracts() {
  const agentId = document.getElementById('contractAgentSelect').value;
  const monthKey = document.getElementById('contractMonthSelect').value;
  const year = document.getElementById('contractYearSelect').value;
  if (!agentId || !monthKey || !year) { showToast('اختر المسوق والسنة والشهر', 'error'); return; }

  if (__contractsBulkSaveInProgress.has(agentId)) {
    showToast('عملية حفظ سابقة لنفس المسوّق ما زالت جارية، الرجاء الانتظار', 'warning');
    return;
  }

  const agent = appData.agents.find(a => a.id === agentId);
  if (!agent) return;
  const rows = document.querySelectorAll('[id^="contract-row-"]');
  const contracts = [];
  let valid = true;
  rows.forEach(row => {
    const rowId = row.id.replace('contract-row-', '');
    const unit = document.getElementById(`cr-unit-${rowId}`)?.value.trim();
    const tenant = document.getElementById(`cr-tenant-${rowId}`)?.value.trim();
    const date = document.getElementById(`cr-date-${rowId}`)?.value;
    const rent = parseFloat(document.getElementById(`cr-rent-${rowId}`)?.value) || 0;
    const comm = parseFloat(document.getElementById(`cr-comm-${rowId}`)?.value) || 0;
    const notes = document.getElementById(`cr-notes-${rowId}`)?.value.trim() || '';
    const existId = document.getElementById(`cr-id-${rowId}`)?.value || '';
    if (!unit || !tenant || !date) { valid = false; return; }
    if (rent < 0 || comm < 0) { valid = false; return; }
    contracts.push({ id: existId || uid(), monthKey, year, unitName: unit, tenantName: tenant, contractDate: date, rentAmount: rent, commissionAmount: comm, notes, createdAt: existId ? undefined : new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  if (!valid) { showToast('يرجى تعبئة جميع الحقول المطلوبة', 'error'); return; }

  if (!agent.months) agent.months = {};
  if (!agent.months[monthKey]) agent.months[monthKey] = { contracts: [] };

  const otherYears = (agent.months[monthKey].contracts || []).filter(c => String(c.year || CURRENT_YEAR) !== String(year));
  const previousThisYear = (agent.months[monthKey].contracts || []).filter(c => String(c.year || CURRENT_YEAR) === String(year));
  agent.months[monthKey].contracts = otherYears.concat(contracts);

  if (!AgentsRepository._usingCollection) {
    // المسار القديم فقط — راجع الأولوية 3 للتأكد من تفعيل _usingCollection
    await save();
    showToast(`تم حفظ ${contracts.length} عقد بنجاح`, 'success');
    return;
  }

  // ===== Diff: لا نُرسل إلا ما تغيّر فعليًا =====
  const CONTRACT_FIELDS = ['unitName', 'tenantName', 'contractDate', 'rentAmount', 'commissionAmount', 'notes', 'year', 'monthKey'];
  const prevById = new Map(previousThisYear.map(c => [c.id, c]));
  const currentIds = new Set(contracts.map(c => c.id));

  const toAdd = contracts.filter(c => !prevById.has(c.id));
  const toUpdate = contracts.filter(c => {
    const prev = prevById.get(c.id);
    if (!prev) return false;
    return CONTRACT_FIELDS.some(f => String(prev[f] ?? '') !== String(c[f] ?? ''));
  });
  const toRemove = previousThisYear.filter(c => !currentIds.has(c.id));

  if (!toAdd.length && !toUpdate.length && !toRemove.length) {
    showToast('لا توجد تغييرات لحفظها', 'success');
    return;
  }

  __contractsBulkSaveInProgress.add(agentId);
  const btn = document.getElementById('btnSaveContracts');
  if (btn) btn.disabled = true;

  try {
    for (const c of toAdd) {
      const { id, ...rest } = c;
      await AgentContractsService.add(agentId, c);
    }
    for (const c of toUpdate) {
      const { id, ...rest } = c;
      await AgentContractsService.update(agentId, id, rest);
    }
    for (const c of toRemove) {
      await AgentContractsService.remove(agentId, c.id);
    }
    showToast(`تم حفظ التغييرات (${toAdd.length} إضافة، ${toUpdate.length} تعديل، ${toRemove.length} حذف)`, 'success');
  } catch (e) {
    const code = e && e.code;
    if (code === 'resource-exhausted' || (e && /429|quota/i.test(e.message || ''))) {
      showToast('الخادم مشغول حاليًا، يرجى المحاولة بعد قليل', 'error');
    } else {
      showToast('تعذر حفظ بعض التغييرات، حاول مرة أخرى', 'error');
    }
    console.error('[saveContracts] فشل الحفظ:', code || '', e && e.message);
    // لا Retry هنا عمدًا.
  } finally {
    __contractsBulkSaveInProgress.delete(agentId);
    if (btn) btn.disabled = false;
  }
}

