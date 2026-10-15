// ============================================================
// ===== REPORT ALL =====
// ============================================================
function renderReportAll() {
  const el = document.getElementById('reportAllContent');
  const yearSel = document.getElementById('reportAllYear');
  if (!yearSel.dataset.filled) {
    yearSel.innerHTML = '<option value="">كل السنوات</option>' + YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(CURRENT_YEAR);
    yearSel.dataset.filled = '1';
  }
  const yearFilter = yearSel.value;
  const nowMonth = (!yearFilter || Number(yearFilter) === CURRENT_YEAR) ? new Date().getMonth() : 11;
  const byYear = c => !yearFilter || String(c.year || CURRENT_YEAR) === String(yearFilter);
  // Sort agents by total rent
  const agentStats = appData.agents.map(a => {
    let totalRent = 0, totalComm = 0, totalContracts = 0;
    MONTH_KEYS.forEach(mk => {
      (a.months?.[mk]?.contracts || []).filter(byYear).forEach(c => {
        totalRent += Number(c.rentAmount)||0;
        totalComm += Number(c.commissionAmount)||0;
        totalContracts++;
      });
    });
    return { agent: a, totalRent, totalComm, totalContracts };
  }).sort((a, b) => b.totalRent - a.totalRent);
  if (!agentStats.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><h3>لا توجد بيانات</h3></div>';
    return;
  }
  const globalRent = agentStats.reduce((s, a) => s + a.totalRent, 0);
  const globalComm = agentStats.reduce((s, a) => s + a.totalComm, 0);
  const globalContracts = agentStats.reduce((s, a) => s + a.totalContracts, 0);
  let html = '';
  agentStats.forEach(({ agent, totalRent, totalComm, totalContracts }, rank) => {
    const contrib = globalRent ? Math.round(totalRent/globalRent*100) : 0;
    html += `<div class="report-agent-header">
      <div class="report-rank">${rank+1}</div>
      <div style="flex:1;">
        <div class="report-agent-name">${agent.name}</div>
        <div class="report-agent-meta">تاريخ التسجيل: ${fmtDate(agent.createdAt)}</div>
      </div>
      <div class="report-agent-totals">
        <div><div class="report-total-val">${totalContracts}</div><div class="report-total-lbl">عقد</div></div>
        <div><div class="report-total-val">${fmt(totalRent)}</div><div class="report-total-lbl">إيجار</div></div>
        <div><div class="report-total-val">${fmt(totalComm)}</div><div class="report-total-lbl">سعي</div></div>
        <div><div class="report-total-val">${contrib}%</div><div class="report-total-lbl">مساهمة</div></div>
      </div>
    </div>`;
    // Monthly tables
    for (let mi = 0; mi <= nowMonth; mi++) {
      const mk = MONTH_KEYS[mi];
      const contracts = (agent.months?.[mk]?.contracts || []).filter(byYear);
      html += `<div class="month-report">
        <div class="month-report-header">
          <div class="month-report-title"><i class="fas fa-calendar-alt" style="margin-left:6px;"></i>${MONTHS[mi]}${yearFilter?'':' '+(mk?'':'')}</div>
          ${contracts.length ? `<span class="month-report-badge">${contracts.length} عقد</span>` : ''}
        </div>`;
      if (!contracts.length) {
        html += `<div class="no-target"><i class="fas fa-times-circle" style="margin-left:6px;"></i>لم يتم تحقيق التارجيت</div>`;
      } else {
        const mRent = contracts.reduce((s,c) => s+(Number(c.rentAmount)||0),0);
        const mComm = contracts.reduce((s,c) => s+(Number(c.commissionAmount)||0),0);
        if (mRent < 80000) {
          html += `<div class="no-target"><i class="fas fa-times-circle" style="margin-left:6px;"></i>لم يتم تحقيق التارجيت</div>`;
        }
        html += `<div class="table-wrapper" style="border-radius:0 0 ${8}px ${8}px;">
          <table><thead><tr><th>#</th><th>الوحدة</th><th>العميل</th><th>التاريخ</th><th>الإيجار</th><th>السعي</th><th>ملاحظات</th></tr></thead>
          <tbody>${contracts.map((c,i) => `<tr><td>${i+1}</td><td>${c.unitName}</td><td>${c.tenantName}</td><td>${fmtDate(c.contractDate)}</td><td><strong style="color:var(--gold);">${fmt(c.rentAmount)}</strong></td><td>${fmt(c.commissionAmount)}</td><td style="font-size:11px;">${c.notes||'—'}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="4"><strong>إجمالي ${MONTHS[mi]}</strong></td><td>${fmt(mRent)}</td><td>${fmt(mComm)}</td><td>${contracts.length} عقد</td></tr></tfoot>
          </table></div>`;
      }
      html += '</div>';
    }
    html += '<div class="divider"></div>';
  });
  // Summary
  const avgContract = globalContracts ? Math.round(globalRent/globalContracts) : 0;
  const bestByContracts = [...agentStats].sort((a,b)=>b.totalContracts-a.totalContracts)[0];
  const bestByRent = agentStats[0];
  const bestByComm = [...agentStats].sort((a,b)=>b.totalComm-a.totalComm)[0];
  html += `<div class="summary-box">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px;"><i class="fas fa-sigma" style="margin-left:8px;color:var(--gold);"></i>الملخص النهائي</div>
    <div class="summary-grid">
      <div class="summary-item"><div class="summary-val">${globalContracts}</div><div class="summary-lbl">إجمالي العقود</div></div>
      <div class="summary-item"><div class="summary-val">${fmt(globalRent)}</div><div class="summary-lbl">إجمالي الإيجارات</div></div>
      <div class="summary-item"><div class="summary-val">${fmt(globalComm)}</div><div class="summary-lbl">إجمالي السعي</div></div>
      <div class="summary-item"><div class="summary-val">${fmt(avgContract)}</div><div class="summary-lbl">متوسط العقد</div></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px;">
    <div class="card-title"><i class="fas fa-trophy"></i> أفضل المسوقين</div>
    <div class="best-agents-grid">
      <div class="best-agent-card">
        <div class="best-agent-medal">🥇</div>
        <div class="best-agent-category">أكثر عقوداً</div>
        <div class="best-agent-name">${bestByContracts?.agent.name||'—'}</div>
        <div class="best-agent-val">${bestByContracts?.totalContracts||0} عقد</div>
      </div>
      <div class="best-agent-card">
        <div class="best-agent-medal">🏆</div>
        <div class="best-agent-category">أعلى إيجارات</div>
        <div class="best-agent-name">${bestByRent?.agent.name||'—'}</div>
        <div class="best-agent-val">${fmt(bestByRent?.totalRent||0)} ريال</div>
      </div>
      <div class="best-agent-card">
        <div class="best-agent-medal">⭐</div>
        <div class="best-agent-category">أعلى سعي</div>
        <div class="best-agent-name">${bestByComm?.agent.name||'—'}</div>
        <div class="best-agent-val">${fmt(bestByComm?.totalComm||0)} ريال</div>
      </div>
    </div>
  </div>`;
  el.innerHTML = html;
}

// ============================================================
// ===== REPORT AGENT =====
// ============================================================
function renderReportAgentPage() {
  const sel = document.getElementById('reportAgentSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- اختر المسوق --</option>' + appData.agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  if (cur) sel.value = cur;
  renderAgentReport();
}
function renderAgentReport() {
  const agentId = document.getElementById('reportAgentSelect').value;
  const el = document.getElementById('reportAgentContent');
  const yearSel = document.getElementById('reportAgentYear');
  if (!yearSel.dataset.filled) {
    yearSel.innerHTML = '<option value="">كل السنوات</option>' + YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(CURRENT_YEAR);
    yearSel.dataset.filled = '1';
  }
  if (!agentId) { el.innerHTML = ''; return; }
  const agent = appData.agents.find(a => a.id === agentId);
  if (!agent) return;
  const yearFilter = yearSel.value;
  const nowMonth = (!yearFilter || Number(yearFilter) === CURRENT_YEAR) ? new Date().getMonth() : 11;
  const byYear = c => !yearFilter || String(c.year || CURRENT_YEAR) === String(yearFilter);
  let totalRent = 0, totalComm = 0, totalContracts = 0;
  MONTH_KEYS.forEach(mk => {
    (agent.months?.[mk]?.contracts || []).filter(byYear).forEach(c => {
      totalRent += Number(c.rentAmount)||0;
      totalComm += Number(c.commissionAmount)||0;
      totalContracts++;
    });
  });
  let html = `<div class="report-agent-header">
    <div class="report-rank">★</div>
    <div style="flex:1;">
      <div class="report-agent-name">${agent.name}</div>
      <div class="report-agent-meta">تاريخ التسجيل: ${fmtDate(agent.createdAt)}</div>
    </div>
    <div class="report-agent-totals">
      <div><div class="report-total-val">${totalContracts}</div><div class="report-total-lbl">عقد</div></div>
      <div><div class="report-total-val">${fmt(totalRent)}</div><div class="report-total-lbl">إيجار</div></div>
      <div><div class="report-total-val">${fmt(totalComm)}</div><div class="report-total-lbl">سعي</div></div>
    </div>
  </div>`;
  for (let mi = 0; mi <= nowMonth; mi++) {
    const mk = MONTH_KEYS[mi];
    const contracts = (agent.months?.[mk]?.contracts || []).filter(byYear);
    html += `<div class="month-report">
      <div class="month-report-header">
        <div class="month-report-title"><i class="fas fa-calendar-alt" style="margin-left:6px;"></i>${MONTHS[mi]}</div>
        ${contracts.length ? `<span class="month-report-badge">${contracts.length} عقد</span>` : ''}
      </div>`;
    if (!contracts.length) {
      html += `<div class="no-target"><i class="fas fa-times-circle" style="margin-left:6px;"></i>لم يتم تحقيق التارجيت</div>`;
    } else {
      const mRent = contracts.reduce((s,c)=>s+(Number(c.rentAmount)||0),0);
      const mComm = contracts.reduce((s,c)=>s+(Number(c.commissionAmount)||0),0);
      if (mRent < 80000) {
        html += `<div class="no-target"><i class="fas fa-times-circle" style="margin-left:6px;"></i>لم يتم تحقيق التارجيت</div>`;
      }
      html += `<div class="table-wrapper" style="border-radius:0 0 8px 8px;">
        <table><thead><tr><th>#</th><th>الوحدة</th><th>العميل</th><th>التاريخ</th><th>الإيجار</th><th>السعي</th><th>ملاحظات</th></tr></thead>
        <tbody>${contracts.map((c,i)=>`<tr><td>${i+1}</td><td>${c.unitName}</td><td>${c.tenantName}</td><td>${fmtDate(c.contractDate)}</td><td><strong style="color:var(--gold);">${fmt(c.rentAmount)}</strong></td><td>${fmt(c.commissionAmount)}</td><td style="font-size:11px;">${c.notes||'—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4"><strong>إجمالي ${MONTHS[mi]}</strong></td><td>${fmt(mRent)}</td><td>${fmt(mComm)}</td><td>${contracts.length} عقد</td></tr></tfoot>
        </table></div>`;
    }
    html += '</div>';
  }
  html += `<div class="summary-box">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px;"><i class="fas fa-sigma" style="margin-left:8px;color:var(--gold);"></i>ملخص ${agent.name}</div>
    <div class="summary-grid">
      <div class="summary-item"><div class="summary-val">${totalContracts}</div><div class="summary-lbl">إجمالي العقود</div></div>
      <div class="summary-item"><div class="summary-val">${fmt(totalRent)}</div><div class="summary-lbl">إجمالي الإيجارات</div></div>
      <div class="summary-item"><div class="summary-val">${fmt(totalComm)}</div><div class="summary-lbl">إجمالي السعي</div></div>
      <div class="summary-item"><div class="summary-val">${totalContracts?fmt(Math.round(totalRent/totalContracts)):0}</div><div class="summary-lbl">متوسط العقد</div></div>
    </div>
  </div>`;
  el.innerHTML = html;
}

