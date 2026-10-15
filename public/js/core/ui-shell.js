// ============================================================
// ===== TOAST =====
// ============================================================
function showToast(msg, type = 'info') {
  const icons = { info: 'fa-info-circle', success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 320); }, 3000);
}

// ============================================================
// ===== NAVIGATION =====
// ============================================================
const pageTitles = {
  dashboard: 'لوحة التحكم الرئيسية',
  entry: 'إدخال جديد',
  data: 'تعديل البيانات',
  'report-all': 'التقرير الشامل',
  'report-agent': 'بحث عن مسوق',
  backup: 'النسخ الاحتياطي والاستعادة',
  settings: 'الإعدادات',
  'vac-entry': 'إدخال جديد — إدارة الفوارغ',
  'vac-available': 'الوحدات المتاحة',
  'vac-reserved': 'الوحدات المحجوزة',
  'vac-rented': 'الوحدات المؤجرة',
  'vac-locations': 'مواقع تهمك',
  'vac-draft': 'مسودة الفوارغ',
  'units-entry': 'إدارة الوحدات — إدخال جديد',
  'units-log': 'مسودة الوحدات',
  'emp-entry': 'إدخال جديد — إدارة الموظفين',
  'emp-list': 'الموظفون المسجلون',
  'emp-draft': 'مسودة إدارة الموظفين',
  'maint-new': 'إنشاء طلب صيانة',
  'maint-track': 'متابعة الطلبات',
  'maint-schedule': 'جدولة الصيانة الدورية',
  'maint-log': 'سجل الصيانة',
  'maint-draft': 'مسودة الصيانة',
  'users-entry': 'إدخال جديد — إدارة المستخدمين',
  'users-list': 'المستخدمون المسجلون',
  'contracts-entry': 'إدخال اتفاقية جديدة',
  'contracts-undocumented': 'الاتفاقيات الغير موثقة',
  'contracts-documented': 'الاتفاقيات الموثقة',
  'contracts-draft': 'مسودة إدارة العقود',
  'contracts-dashboard': 'لوحة تحكم إدارة العقود',
  'vac-dashboard': 'لوحة تحكم إدارة الفوارغ',
  'units-dashboard': 'لوحة تحكم إدارة الوحدات',
  'emp-dashboard': 'لوحة تحكم إدارة الموظفين',
  'maint-dashboard': 'لوحة تحكم إدارة الصيانة',
  'col-dashboard': 'لوحة تحكم إدارة التحصيل'
};
function showPage(page, keepMobileSidebar, fromHistory) {
  if (!userCanAccessPage(page)) {
    Swal.fire({
      icon: 'warning', title: 'عذرًا', text: 'ليس لديك صلاحية للوصول إلى هذا القسم',
      confirmButtonText: 'حسنًا', confirmButtonColor: '#0d2137'
    }).then(() => redirectToAllowedSection());
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) {
    console.warn('[showPage] الصفحة غير موجودة في DOM: "page-' + page + '" — تحقق من اسم pageId المستخدم.');
    return;
  }
  pageEl.classList.add('active');
  const nav = document.getElementById('nav-' + page);
  if (nav) nav.classList.add('active');
  const topbarTitleEl = document.getElementById('topbarTitle');
  if (topbarTitleEl) topbarTitleEl.textContent = pageTitles[page] || '';
  const printTitleEl = document.getElementById('printTitle');
  if (printTitleEl) printTitleEl.textContent = pageTitles[page] || '';
  const printDateEl = document.getElementById('printDate');
  if (printDateEl) printDateEl.textContent = 'التاريخ: ' + new Date().toLocaleDateString('ar-SA');
  currentPage = page;
  if (page === 'dashboard') renderDashboard();
  if (page === 'entry') renderEntryPage();
  if (page === 'data') { populateFilterDropdowns(); renderDataTable(); }
  if (page === 'report-all') renderReportAll();
  if (page === 'report-agent') renderReportAgentPage();
  if (page === 'backup') renderSystemInfo();
  if (page === 'vac-entry') renderVacEntryPage();
  if (page === 'vac-available') renderVacantList('available');
  if (page === 'vac-reserved') renderVacantList('reserved');
  if (page === 'vac-rented') renderVacantList('rented');
  if (page === 'vac-locations') { populateVacLocFilters(); renderVacLocations(); }
  if (page === 'vac-draft') renderVacDraft();
  if (page === 'contracts-entry') renderContractsEntryPage();
  if (page === 'contracts-undocumented') renderContractsUndocumented();
  if (page === 'contracts-documented') renderContractsDocumented();
  if (page === 'contracts-draft') renderContractsDraft();
  if (page === 'contracts-dashboard') renderContractsDashboard();
  if (page === 'col-new-contract') colPopulateLists();
  if (page === 'col-view') renderColView();
  if (page === 'col-collections') renderColCollections();
  if (page === 'col-overdue') renderColOverdue();
  if (page === 'col-alerts') renderColAlerts();
  if (page === 'col-tenants') renderColTenants();
  if (page === 'col-log') renderColLog();
  if (page === 'units-entry') renderUnitsEntryPage();
  if (page === 'units-log') renderUnitsLog();
  if (page === 'emp-entry') renderEmpEntryPage();
  if (page === 'emp-list') { populateEmpFilters(); renderEmpList(); }
  if (page === 'emp-draft') renderEmpDraft();
  if (page === 'maint-new') renderMaintNewPage();
  if (page === 'maint-track') { populateMaintFilters(); renderMaintTrack(); renderMaintSheetRequests(); }
  if (page === 'maint-schedule') renderMaintSchedule();
  if (page === 'maint-log') renderMaintLog();
  if (page === 'maint-draft') renderMaintDraft();
  if (page === 'users-entry') renderUsersEntryPage();
  if (page === 'users-list') renderUsersList();
  if (page === 'vac-dashboard') renderVacDashboard();
  if (page === 'units-dashboard') renderUnitsDashboard();
  if (page === 'emp-dashboard') renderEmpDashboard();
  if (page === 'maint-dashboard') renderMaintDashboard();
  if (page === 'col-dashboard') renderColDashboard();
  // إغلاق القائمة تلقائيًا على الجوال بعد اختيار أي صفحة (نفس سلوك الملف المرجعي)
  // القائمة تبقى مفتوحة عند التنقل بين الصفحات، وتُغلق فقط بزر القائمة أو بالضغط خارجها
  if (!fromHistory) {
    try { history.pushState({ appPage: page }, '', location.href); } catch (e) {}
  }
}
// عند رفض الوصول لقسم غير مصرح به: تحويل المستخدم عشوائيًا لأحد الأقسام الرئيسية المصرح له بها
function redirectToAllowedSection() {
  if (!currentUser || currentUser.role === 'مدير') { showPage('dashboard'); return; }
  const dashboardMap = { dashboard:'dashboard', contracts:'contracts-dashboard', emp:'emp-dashboard', vac:'vac-dashboard', units:'units-dashboard', users:'users-list', collection:'col-dashboard', maint:'maint-dashboard' };
  const allowedSections = SECTION_TREE.filter(sec => currentUser.perms && currentUser.perms[sec.key] && dashboardMap[sec.key]);
  if (!allowedSections.length) { showPage('dashboard'); return; }
  // أول قسم متاح له بترتيب ظهوره في القائمة الجانبية (SECTION_TREE)، وليس اختيارًا عشوائيًا
  showPage(dashboardMap[allowedSections[0].key]);
}
// يُستدعى بعد كل تسجيل دخول (يدوي أو استعادة جلسة) ليضمن أن أول صفحة تظهر للمستخدم
// هي أول قسم متاح له بحسب صلاحياته، لا الصفحة الرئيسية الافتراضية إن لم تكن مصرَّحة له
function goToLandingPage() {
  if (!currentUser || currentUser.role === 'مدير' || userCanAccessPage('dashboard')) return;
  redirectToAllowedSection();
}

// ============================================================
// ===== SIDEBAR TOGGLE =====
// ============================================================
// Accordion: closes any other open submenu before opening the tapped one, so the
// sidebar doesn't turn into one long, messy scrolling list on phones/tablets.
function closeOtherSubmenus(exceptParentId) {
  document.querySelectorAll('.nav-parent.open').forEach(p => {
    if (p.id !== exceptParentId) p.classList.remove('open');
  });
  document.querySelectorAll('.nav-submenu.open').forEach(s => {
    if (s.id !== exceptParentId.replace('-parent','-submenu')) s.classList.remove('open');
  });
}
function toggleNavSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-dashboard-submenu').classList.toggle('open', !wasOpen);
  showPage('dashboard', true);
}
function toggleVacSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-vac-submenu').classList.toggle('open', !wasOpen);
  showPage('vac-dashboard', true);
}
function toggleUnitsSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-units-submenu').classList.toggle('open', !wasOpen);
  showPage('units-dashboard', true);
}
function toggleContractsSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-contracts-submenu').classList.toggle('open', !wasOpen);
  showPage('contracts-dashboard', true);
}
function toggleEmpSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-emp-submenu').classList.toggle('open', !wasOpen);
  showPage('emp-dashboard', true);
}
function toggleMaintSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-maint-submenu').classList.toggle('open', !wasOpen);
  showPage('maint-dashboard', true);
}
function toggleUsersSubmenu(el) {
  const wasOpen = el.classList.contains('open');
  closeOtherSubmenus(el.id);
  el.classList.toggle('open', !wasOpen);
  document.getElementById('nav-users-submenu').classList.toggle('open', !wasOpen);
  showPage('users-list', true);
}
let sidebarCollapsed = false;

function toggleSidebar() {
  if (window.innerWidth < 900) { toggleMobileSidebar(); return; }
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('main').classList.toggle('sidebar-collapsed', sidebarCollapsed);
}

// لم تعد هناك حاجة لتمييز صفحات الفوارغ/التحصيل عن غيرها — القائمة على الجوال
// أصلاً مخفية افتراضيًا (درج منزلق) ولا تحجز أي مساحة إلا عند فتحها يدويًا
function autoHideSidebarForPage(page) {
  if (window.innerWidth < 900) closeMobileSidebar();
}
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('mobile-open');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
  document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

// ============================================================
// ===== DARK MODE =====
// ============================================================
function applyDarkMode() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  document.getElementById('darkModeIcon').className = darkMode ? 'fas fa-sun' : 'fas fa-moon';
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = darkMode;
}
function toggleDarkMode() {
  darkMode = !darkMode;
  settings.darkMode = darkMode;
  StorageService.saveSettings(settings);
  applyDarkMode();
}

// ============================================================
// ===== CLOCK =====
// ============================================================
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('ar-SA');
  document.getElementById('dateDisplay').textContent = now.toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================
// ===== FORMAT HELPERS =====
// ============================================================
function fmt(n) { return (Number(n)||0).toLocaleString('ar-SA'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d).toLocaleDateString('ar-SA'); } catch { return d; } }
// تنسيق تاريخ التأجير للعرض/الطباعة فقط بصيغة يوم/شهر/سنة (DD/MM/YYYY)، دون
// المساس بالقيمة المخزَّنة (تبقى yyyy-mm-dd) حتى لا تتأثر مقارنات التحقق من
// صحة نطاقات التاريخ في saveContractAgreement.
function fmtRentalDate(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

