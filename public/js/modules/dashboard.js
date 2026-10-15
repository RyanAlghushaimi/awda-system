// ============================================================
// ===== DASHBOARD =====
// ============================================================
function renderDashboard() {
  const yearSel = document.getElementById('dashYearFilter');
  if (!yearSel.dataset.filled) {
    yearSel.innerHTML = '<option value="">كل السنوات</option>' + YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(CURRENT_YEAR);
    yearSel.dataset.filled = '1';
  }
  const stats = computeGlobalStats(yearSel.value);
  const el = document.getElementById('dashStats');
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(13,33,55,0.1);color:var(--primary);"><i class="fas fa-users"></i></div>
      <div class="stat-value counter" data-target="${stats.agentCount}">${stats.agentCount}</div>
      <div class="stat-label">عدد المسوقين</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(201,162,39,0.12);color:var(--gold);"><i class="fas fa-file-contract"></i></div>
      <div class="stat-value counter" data-target="${stats.contractCount}">${stats.contractCount}</div>
      <div class="stat-label">عدد العقود</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(34,197,94,0.12);color:var(--success);"><i class="fas fa-money-bill-wave"></i></div>
      <div class="stat-value" style="font-size:18px;">${fmt(stats.totalRent)}</div>
      <div class="stat-label">إجمالي الإيجارات (ريال)</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(59,130,246,0.12);color:var(--info);"><i class="fas fa-hand-holding-dollar"></i></div>
      <div class="stat-value" style="font-size:18px;">${fmt(stats.totalCommission)}</div>
      <div class="stat-label">إجمالي السعي (ريال)</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(168,85,247,0.12);color:#a855f7;"><i class="fas fa-trophy"></i></div>
      <div class="stat-value" style="font-size:16px;">${stats.bestAgent || '—'}</div>
      <div class="stat-label">أفضل مسوق</div>
      <div class="stat-sub">${stats.bestAgent ? fmt(stats.bestRent) + ' ريال' : ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(245,158,11,0.12);color:var(--warning);"><i class="fas fa-calculator"></i></div>
      <div class="stat-value" style="font-size:18px;">${fmt(stats.avgContract)}</div>
      <div class="stat-label">متوسط قيمة العقد (ريال)</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(239,68,68,0.12);color:var(--danger);"><i class="fas fa-calendar-star"></i></div>
      <div class="stat-value" style="font-size:16px;">${stats.topMonth || '—'}</div>
      <div class="stat-label">أعلى شهر إيراداً</div>
      <div class="stat-sub">${stats.topMonth ? fmt(stats.topMonthRent) + ' ريال' : ''}</div>
    </div>
  `;
  renderDashCharts(stats);
  renderDashTopAgents(stats, yearSel.value);
}
function computeGlobalStats(yearFilter) {
  let agentCount = appData.agents.length;
  let contractCount = 0, totalRent = 0, totalCommission = 0;
  let bestAgent = '', bestRent = 0;
  let monthlyRent = Array(12).fill(0), monthlyComm = Array(12).fill(0);
  appData.agents.forEach(agent => {
    let agentRent = 0;
    MONTH_KEYS.forEach((mk, mi) => {
      const m = agent.months?.[mk];
      if (!m) return;
      (m.contracts || []).filter(c => !yearFilter || String(c.year || CURRENT_YEAR) === String(yearFilter)).forEach(c => {
        contractCount++;
        totalRent += Number(c.rentAmount)||0;
        totalCommission += Number(c.commissionAmount)||0;
        agentRent += Number(c.rentAmount)||0;
        monthlyRent[mi] += Number(c.rentAmount)||0;
        monthlyComm[mi] += Number(c.commissionAmount)||0;
      });
    });
    if (agentRent > bestRent) { bestRent = agentRent; bestAgent = agent.name; }
  });
  const avgContract = contractCount ? Math.round(totalRent / contractCount) : 0;
  let topMonthIdx = monthlyRent.indexOf(Math.max(...monthlyRent));
  const topMonth = monthlyRent[topMonthIdx] > 0 ? MONTHS[topMonthIdx] : '';
  const topMonthRent = monthlyRent[topMonthIdx] || 0;
  return { agentCount, contractCount, totalRent, totalCommission, bestAgent, bestRent, avgContract, topMonth, topMonthRent, monthlyRent, monthlyComm };
}
function renderDashCharts(stats) {
  const yf = document.getElementById('dashYearFilter').value;
  const nowMonth = (!yf || Number(yf) === CURRENT_YEAR) ? new Date().getMonth() : 11;
  const labels = MONTHS.slice(0, nowMonth + 1);
  const rentData = stats.monthlyRent.slice(0, nowMonth + 1);
  const commData = stats.monthlyComm.slice(0, nowMonth + 1);
  if (chartRent) chartRent.destroy();
  if (chartCommission) chartCommission.destroy();
  const isDark = darkMode;
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#8aa4bf' : '#5a7394';
  const baseOpts = {
    responsive: true, maintainAspectRatio: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Tahoma', size: 11 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Tahoma', size: 11 }, callback: v => fmt(v) } }
    }
  };
  chartRent = new Chart(document.getElementById('chartRent'), {
    type: 'bar',
    data: { labels, datasets: [{ data: rentData, backgroundColor: 'rgba(201,162,39,0.7)', borderColor: 'rgba(201,162,39,1)', borderWidth: 2, borderRadius: 6 }] },
    options: { ...baseOpts }
  });
  chartCommission = new Chart(document.getElementById('chartCommission'), {
    type: 'line',
    data: { labels, datasets: [{ data: commData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4, borderWidth: 2.5, pointBackgroundColor: '#3b82f6', pointRadius: 4 }] },
    options: { ...baseOpts }
  });
}
function renderDashTopAgents(stats, yearFilter) {
  const agentStats = appData.agents.map(a => {
    let rent = 0, comm = 0, count = 0;
    MONTH_KEYS.forEach(mk => {
      (a.months?.[mk]?.contracts || []).filter(c => !yearFilter || String(c.year || CURRENT_YEAR) === String(yearFilter)).forEach(c => {
        rent += Number(c.rentAmount)||0;
        comm += Number(c.commissionAmount)||0;
        count++;
      });
    });
    return { name: a.name, rent, comm, count };
  }).sort((a,b) => b.rent - a.rent).slice(0, 5);
  const el = document.getElementById('dashTopAgents');
  if (!agentStats.length) { el.innerHTML = ''; return; }
  const total = agentStats.reduce((s,a) => s + a.rent, 0);
  el.innerHTML = `<div class="card-title"><i class="fas fa-ranking-star"></i> أداء المسوقين</div>
    <div style="display:grid;gap:10px;">
      ${agentStats.map((a, i) => {
        const pct = total ? Math.round(a.rent/total*100) : 0;
        return `<div style="display:flex;align-items:center;gap:12px;">
          <div style="width:28px;height:28px;border-radius:50%;background:${i===0?'var(--gold)':i===1?'#c0c0c0':i===2?'#cd7f32':'var(--surface2)'};color:${i<3?'white':'var(--text-muted)'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${i+1}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;">${a.name}</div>
            <div class="contrib-bar"><div class="contrib-fill" style="width:${pct}%;"></div></div>
          </div>
          <div style="text-align:left;min-width:80px;">
            <div style="font-size:12px;font-weight:700;color:var(--gold);">${fmt(a.rent)}</div>
            <div style="font-size:10px;color:var(--text-muted);">${a.count} عقد | ${pct}%</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

