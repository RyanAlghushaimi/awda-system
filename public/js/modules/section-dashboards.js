// ============================================================
// ===== SECTION DASHBOARDS =====
// ============================================================
function statCardHTML(icon, bg, color, value, label) {
  return `<div class="stat-card"><div class="stat-icon" style="background:${bg};color:${color};"><i class="fas ${icon}"></i></div>
    <div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}
function renderVacDashboard() {
  ensureVacantData();
  const units = appData.vacant.units || [];
  const today = new Date().toISOString().slice(0,10);
  const available = units.filter(u => u.status !== 'reserved' && u.status !== 'rented' && (!u.futureDate || u.futureDate <= today)).length;
  const future = units.filter(u => u.status !== 'reserved' && u.status !== 'rented' && u.futureDate && u.futureDate > today).length;
  const reserved = units.filter(u => u.status === 'reserved').length;
  const rented = units.filter(u => u.status === 'rented').length;
  document.getElementById('vacDashStats').innerHTML =
    statCardHTML('fa-house-circle-check','rgba(34,197,94,0.12)','var(--success)', available, 'وحدات متاحة') +
    statCardHTML('fa-hourglass-half','rgba(245,158,11,0.12)','var(--warning)', future, 'وحدات مستقبلية') +
    statCardHTML('fa-lock','rgba(59,130,246,0.12)','var(--info)', reserved, 'وحدات محجوزة') +
    statCardHTML('fa-house-user','rgba(201,162,39,0.12)','var(--gold)', rented, 'وحدات مؤجرة');
  const cities = {};
  units.forEach(u => { if (u.city) cities[u.city] = (cities[u.city]||0)+1; });
  const rows = Object.entries(cities).sort((a,b)=>b[1]-a[1]);
  document.getElementById('vacDashCities').innerHTML = '<div class="card-title"><i class="fas fa-map-location-dot"></i> توزيع الوحدات حسب المدينة</div>' +
    (rows.length ? '<div class="table-wrapper"><table><thead><tr><th>المدينة</th><th>عدد الوحدات</th></tr></thead><tbody>' +
      rows.map(([c,n]) => `<tr><td>${c}</td><td>${n}</td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد بيانات</h3></div>');
}
function renderUnitsDashboard() {
  ensureUnitsData();
  const recs = appData.units.records || [];
  const props = [...new Set(recs.map(r => r.propertyName).filter(Boolean))];
  const withTenant = recs.filter(r => r.tenantName).length;
  document.getElementById('unitsDashStats').innerHTML =
    statCardHTML('fa-building','rgba(13,33,55,0.1)','var(--primary)', props.length, 'عدد العقارات') +
    statCardHTML('fa-door-open','rgba(201,162,39,0.12)','var(--gold)', recs.length, 'إجمالي الوحدات') +
    statCardHTML('fa-house-user','rgba(34,197,94,0.12)','var(--success)', withTenant, 'وحدات مؤجرة (بمستأجر)') +
    statCardHTML('fa-house','rgba(239,68,68,0.12)','var(--danger)', recs.length - withTenant, 'وحدات بدون مستأجر');
  const perProp = {};
  recs.forEach(r => { if (r.propertyName) perProp[r.propertyName] = (perProp[r.propertyName]||0)+1; });
  const rows = Object.entries(perProp).sort((a,b)=>b[1]-a[1]);
  document.getElementById('unitsDashProps').innerHTML = '<div class="card-title"><i class="fas fa-building"></i> عدد الوحدات حسب العقار</div>' +
    (rows.length ? '<div class="table-wrapper"><table><thead><tr><th>العقار</th><th>عدد الوحدات</th></tr></thead><tbody>' +
      rows.map(([p,n]) => `<tr><td>${p}</td><td>${n}</td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد بيانات</h3></div>');
}
function renderEmpDashboard() {
  ensureEmployeesData();
  const list = appData.employees.list || [];
  const totalSalary = list.reduce((s,e)=>s+(Number(e.salary)||0),0);
  const avgSalary = list.length ? Math.round(totalSalary/list.length) : 0;
  const deptCounts = {}; list.forEach(e => { const d = e.department||'غير محدد'; deptCounts[d]=(deptCounts[d]||0)+1; });
  const depts = Object.keys(deptCounts).length;
  const maleCount = list.filter(e => e.gender === 'ذكر').length;
  const femaleCount = list.filter(e => e.gender === 'أنثى').length;
  document.getElementById('empDashStats').innerHTML =
    statCardHTML('fa-users','rgba(13,33,55,0.1)','var(--primary)', list.length, 'إجمالي الموظفين') +
    statCardHTML('fa-sitemap','rgba(201,162,39,0.12)','var(--gold)', depts, 'عدد الأقسام') +
    statCardHTML('fa-person','rgba(59,130,246,0.12)','var(--info)', maleCount, 'عدد الذكور') +
    statCardHTML('fa-person-dress','rgba(236,72,153,0.12)','#ec4899', femaleCount, 'عدد الإناث') +
    statCardHTML('fa-sack-dollar','rgba(34,197,94,0.12)','var(--success)', fmt(totalSalary), 'إجمالي الرواتب') +
    statCardHTML('fa-calculator','rgba(245,158,11,0.12)','var(--warning)', fmt(avgSalary), 'متوسط الراتب');
  // جدول التوزيع حسب القسم — يشمل عدد الموظفين وعدد الذكور والإناث لكل قسم
  const deptRows = Object.keys(deptCounts).sort((a,b)=>deptCounts[b]-deptCounts[a]).map(d => {
    const inDept = list.filter(e => (e.department||'غير محدد') === d);
    const m = inDept.filter(e=>e.gender==='ذكر').length;
    const f = inDept.filter(e=>e.gender==='أنثى').length;
    const pct = list.length ? Math.round(inDept.length/list.length*100) : 0;
    return `<tr>
      <td style="font-weight:700;">${d}</td>
      <td>${inDept.length}</td>
      <td><span class="badge badge-info">${m}</span></td>
      <td><span class="badge" style="background:rgba(236,72,153,0.12);color:#ec4899;">${f}</span></td>
      <td style="min-width:140px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="emp-dept-bar" style="flex:1;"><div class="emp-dept-bar-fill" style="width:${pct}%;"></div></div>
          <span style="font-size:12px;color:var(--text-muted);min-width:32px;">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('empDashDeptTable').innerHTML = deptRows ? `<div class="table-wrapper"><table>
    <thead><tr><th>القسم</th><th>عدد الموظفين</th><th>ذكور</th><th>إناث</th><th>النسبة من إجمالي الموظفين</th></tr></thead>
    <tbody>${deptRows}
      <tr style="background:var(--surface2);font-weight:800;">
        <td>الإجمالي</td><td>${list.length}</td><td>${maleCount}</td><td>${femaleCount}</td><td>100%</td>
      </tr>
    </tbody>
  </table></div>` : '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد بيانات</h3></div>';
  // أحدث الموظفين المضافين
  const recent = [...list].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0)).slice(0,6);
  document.getElementById('empDashRecent').innerHTML = recent.length ? '<div class="table-wrapper"><table><thead><tr><th>الاسم</th><th>القسم</th><th>الجنس</th><th>تاريخ الإضافة</th></tr></thead><tbody>' +
    recent.map(e => `<tr><td>${e.name||'—'}</td><td>${e.department||'—'}</td><td>${e.gender||'—'}</td><td>${e.createdAt ? new Date(e.createdAt).toLocaleDateString('ar-SA') : '—'}</td></tr>`).join('') + '</tbody></table></div>'
    : '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا يوجد موظفون بعد</h3></div>';
}
function renderMaintDashboard() {
  ensureMaintenanceData();
  const reqs = appData.maintenance.requests || [];
  const pending = reqs.filter(r=>r.status==='pending').length;
  const inprogress = reqs.filter(r=>r.status==='inprogress').length;
  const done = reqs.filter(r=>r.status==='done').length;
  const today = new Date().toISOString().slice(0,10);
  const dueSchedules = (appData.maintenance.schedules||[]).filter(s => s.nextDue && s.nextDue <= today).length;
  document.getElementById('maintDashStats').innerHTML =
    statCardHTML('fa-hourglass-half','rgba(148,163,184,0.15)','var(--text-muted)', pending, 'قيد الانتظار') +
    statCardHTML('fa-screwdriver-wrench','rgba(59,130,246,0.12)','var(--info)', inprogress, 'قيد التنفيذ') +
    statCardHTML('fa-circle-check','rgba(34,197,94,0.12)','var(--success)', done, 'مكتمل') +
    statCardHTML('fa-calendar-day','rgba(239,68,68,0.12)','var(--danger)', dueSchedules, 'صيانة دورية مستحقة');
  const urgent = reqs.filter(r => r.status !== 'done' && r.priority === 'طارئة');
  document.getElementById('maintDashUrgent').innerHTML = '<div class="card-title"><i class="fas fa-triangle-exclamation"></i> طلبات طارئة لم تُنجز بعد</div>' +
    (urgent.length ? '<div class="table-wrapper"><table><thead><tr><th>العنوان</th><th>العقار</th><th>المسؤول</th><th>الحالة</th></tr></thead><tbody>' +
      urgent.map(r => `<tr><td>${r.title}</td><td>${r.property||'—'}</td><td>${r.assignee||'—'}</td><td><span class="badge ${MAINT_STATUS_BADGE[r.status]}">${MAINT_STATUS_LABELS[r.status]}</span></td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>لا توجد طلبات طارئة معلقة</h3></div>');
}
function renderColDashboard() {
  ensureColData();
  const contracts = appData.collection?.contracts || [];
  const today = new Date().toISOString().slice(0,10);
  let totalCollected = 0, totalDue = 0, overdue = 0;
  contracts.forEach(c => {
    (c.payments||[]).forEach(p => {
      if (p.paid) totalCollected += Number(p.amount)||0;
      else { totalDue += Number(p.amount)||0; if (p.dueDate && p.dueDate < today) overdue++; }
    });
  });
  document.getElementById('colDashStats').innerHTML =
    statCardHTML('fa-file-signature','rgba(13,33,55,0.1)','var(--primary)', contracts.length, 'إجمالي العقود') +
    statCardHTML('fa-hand-holding-dollar','rgba(34,197,94,0.12)','var(--success)', fmt(totalCollected), 'إجمالي المحصّل') +
    statCardHTML('fa-coins','rgba(201,162,39,0.12)','var(--gold)', fmt(totalDue), 'مستحقات غير محصّلة') +
    statCardHTML('fa-clock-rotate-left','rgba(239,68,68,0.12)','var(--danger)', overdue, 'دفعات متأخرة');
  document.getElementById('colDashRecent').innerHTML = '<div class="card-title"><i class="fas fa-file-signature"></i> أحدث العقود</div>' +
    ([...contracts].reverse().slice(0,8).length ? '<div class="table-wrapper"><table><thead><tr><th>الوحدة</th><th>المستأجر</th><th>الحالة</th></tr></thead><tbody>' +
      [...contracts].reverse().slice(0,8).map(c => `<tr><td>${c.unitNo||c.propName||'—'}</td><td>${c.tenantName||'—'}</td><td>${c.status==='cancelled'?'<span class="badge badge-danger">ملغي</span>':'<span class="badge badge-success">نشط</span>'}</td></tr>`).join('') + '</tbody></table></div>'
      : '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد عقود بعد</h3></div>');
}

