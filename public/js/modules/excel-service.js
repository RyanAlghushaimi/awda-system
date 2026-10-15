// ============================================================
// ===== EXCEL SERVICE =====
// ============================================================
function exportExcel() {
  const wb = XLSX.utils.book_new();
  if (!appData.agents.length) { showToast('لا توجد بيانات للتصدير', 'warning'); return; }
  appData.agents.forEach(agent => {
    const rows = [['الشهر','الوحدة','العميل','التاريخ','الإيجار','السعي','ملاحظات']];
    let totalRent = 0, totalComm = 0, totalCount = 0;
    MONTHS.forEach((m, mi) => {
      const contracts = agent.months?.[MONTH_KEYS[mi]]?.contracts || [];
      contracts.forEach(c => {
        rows.push([m, c.unitName, c.tenantName, c.contractDate, Number(c.rentAmount)||0, Number(c.commissionAmount)||0, c.notes||'']);
        totalRent += Number(c.rentAmount)||0;
        totalComm += Number(c.commissionAmount)||0;
        totalCount++;
      });
      if (contracts.length) {
        const mr = contracts.reduce((s,c)=>s+(Number(c.rentAmount)||0),0);
        const mc = contracts.reduce((s,c)=>s+(Number(c.commissionAmount)||0),0);
        rows.push([`إجمالي ${m}`,'','','',mr,mc,`${contracts.length} عقد`]);
      }
    });
    rows.push([]);
    rows.push(['الإجمالي','','','',totalRent,totalComm,`${totalCount} عقد`]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:12},{wch:18},{wch:18},{wch:14},{wch:14},{wch:14},{wch:22}];
    XLSX.utils.book_append_sheet(wb, ws, agent.name.slice(0,31));
  });
  XLSX.writeFile(wb, `عودة_تطوير_العقارية_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  showToast('تم تصدير Excel بنجاح', 'success');
}
function exportAgentExcel() {
  const agentId = document.getElementById('reportAgentSelect').value;
  if (!agentId) { showToast('اختر مسوقاً أولاً', 'warning'); return; }
  const agent = appData.agents.find(a => a.id === agentId);
  if (!agent) return;
  const wb = XLSX.utils.book_new();
  const rows = [['الشهر','الوحدة','العميل','التاريخ','الإيجار','السعي','ملاحظات']];
  MONTHS.forEach((m, mi) => {
    const contracts = agent.months?.[MONTH_KEYS[mi]]?.contracts || [];
    contracts.forEach(c => {
      rows.push([m, c.unitName, c.tenantName, c.contractDate, Number(c.rentAmount)||0, Number(c.commissionAmount)||0, c.notes||'']);
    });
    if (!contracts.length) rows.push([m,'لم يتم تحقيق التارجيت','','','','','']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:12},{wch:18},{wch:18},{wch:14},{wch:14},{wch:14},{wch:22}];
  XLSX.utils.book_append_sheet(wb, ws, agent.name.slice(0,31));
  XLSX.writeFile(wb, `تقرير_${agent.name}_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  showToast('تم تصدير Excel بنجاح', 'success');
}
function importExcel(event) {
  if (isSectionViewOnly('backup')) { showToast('وضع العرض فقط: لا يمكنك استعادة البيانات', 'error'); event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      Swal.fire({
        title: 'استيراد Excel',
        text: 'هل تريد استبدال البيانات الحالية بالبيانات المستوردة؟',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'نعم', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
      }).then(r => {
        if (!r.isConfirmed) return;
        const newAgents = [];
        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
          const agent = { id: uid(), name: sheetName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), months: {} };
          MONTH_KEYS.forEach(mk => { agent.months[mk] = { contracts: [] }; });
          data.slice(1).forEach(row => {
            if (!row[0] || !row[1]) return;
            const monthName = String(row[0]).trim();
            const mi = MONTHS.indexOf(monthName);
            if (mi < 0) return;
            const mk = MONTH_KEYS[mi];
            agent.months[mk].contracts.push({
              id: uid(), unitName: row[1]||'', tenantName: row[2]||'',
              contractDate: row[3]||'', rentAmount: Number(row[4])||0,
              commissionAmount: Number(row[5])||0, notes: row[6]||'',
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            });
          });
          newAgents.push(agent);
        });
        appData.agents = newAgents;
        if (typeof AgentsRepository !== 'undefined' && AgentsRepository._usingCollection) {
          AgentsCollectionService.replaceAll(newAgents).then(() => {
            showToast(`تم استيراد ${newAgents.length} مسوق من Excel`, 'success');
            renderDashboard();
          }).catch(err => showToast('فشل رفع البيانات المستوردة إلى Firestore: ' + err.message, 'error'));
        } else {
          save();
          showToast(`تم استيراد ${newAgents.length} مسوق من Excel`, 'success');
          renderDashboard();
        }
      });
    } catch(err) { showToast('خطأ في قراءة الملف', 'error'); }
  };
  reader.readAsBinaryString(file);
  event.target.value = '';
}
