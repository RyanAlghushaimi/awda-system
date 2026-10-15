// ============================================================
// ===== JSON BACKUP =====
// ============================================================
function exportJSON() {
  const json = JSON.stringify(appData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `نسخة_احتياطية_${new Date().toLocaleDateString('en-CA')}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('تم تصدير النسخة الاحتياطية', 'success');
}
function importJSON(event) {
  if (isSectionViewOnly('backup')) { showToast('وضع العرض فقط: لا يمكنك استعادة البيانات', 'error'); event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.agents) throw new Error('ملف غير صالح');
      Swal.fire({
        title: 'استعادة البيانات',
        text: `سيتم استبدال جميع البيانات الحالية بـ ${data.agents.length} مسوق. هل تريد المتابعة؟`,
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'نعم، استعادة', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
      }).then(r => {
        if (r.isConfirmed) {
          appData = data;
          save();
          showToast(`تم استعادة ${data.agents.length} مسوق`, 'success');
          renderDashboard();
        }
      });
    } catch { showToast('ملف غير صالح', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================
// ===== SYSTEM INFO =====
// ============================================================
function renderSystemInfo() {
  const stats = computeGlobalStats();
  const lsSize = new Blob([JSON.stringify(appData)||'']).size;
  document.getElementById('systemInfo').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;font-size:13px;">
      <div style="padding:14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
        <div style="color:var(--text-muted);font-size:11px;">عدد المسوقين</div>
        <div style="font-size:20px;font-weight:800;color:var(--gold);margin-top:4px;">${stats.agentCount}</div>
      </div>
      <div style="padding:14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
        <div style="color:var(--text-muted);font-size:11px;">عدد العقود</div>
        <div style="font-size:20px;font-weight:800;color:var(--gold);margin-top:4px;">${stats.contractCount}</div>
      </div>
      <div style="padding:14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
        <div style="color:var(--text-muted);font-size:11px;">حجم البيانات</div>
        <div style="font-size:20px;font-weight:800;color:var(--gold);margin-top:4px;">${(lsSize/1024).toFixed(1)} KB</div>
      </div>
      <div style="padding:14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
        <div style="color:var(--text-muted);font-size:11px;">آخر تحديث</div>
        <div style="font-size:13px;font-weight:700;margin-top:4px;">${new Date().toLocaleDateString('ar-SA')}</div>
      </div>
    </div>`;
}

// ============================================================
// ===== SETTINGS =====
// ============================================================
function setAccentColor(gold, dark, light) {
  document.documentElement.style.setProperty('--gold', gold);
  document.documentElement.style.setProperty('--gold-dark', dark);
  document.documentElement.style.setProperty('--gold-light', light);
  settings.accentColor = { gold, dark, light };
  StorageService.saveSettings(settings);
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  event.target.classList.add('selected');
  showToast('تم تغيير اللون', 'success');
}
function applyAccentColor() {
  if (settings.accentColor) {
    const { gold, dark, light } = settings.accentColor;
    document.documentElement.style.setProperty('--gold', gold);
    document.documentElement.style.setProperty('--gold-dark', dark);
    document.documentElement.style.setProperty('--gold-light', light);
  }
}
function exportSettings() {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'awda_settings.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('تم تصدير الإعدادات', 'success');
}
function resetSettings() {
  Swal.fire({ title: 'إعادة ضبط الإعدادات', text: 'سيتم إعادة جميع الإعدادات للقيم الافتراضية', icon: 'question', showCancelButton: true, confirmButtonText: 'نعم', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137' }).then(r => {
    if (r.isConfirmed) {
      settings = {};
      StorageService.saveSettings(settings);
      darkMode = false;
      document.documentElement.style.removeProperty('--gold');
      document.documentElement.style.removeProperty('--gold-dark');
      document.documentElement.style.removeProperty('--gold-light');
      applyDarkMode();
      showToast('تمت إعادة الضبط', 'success');
    }
  });
}
function deleteAllData() {
  Swal.fire({
    title: 'تحذير!', html: 'ستُحذف <strong>جميع البيانات نهائياً</strong>.<br>هذه العملية لا يمكن التراجع عنها.',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'نعم، احذف الكل', cancelButtonText: 'إلغاء',
    confirmButtonColor: '#ef4444'
  }).then(r => {
    if (!r.isConfirmed) return;
    Swal.fire({
      title: 'تأكيد نهائي', text: 'هل أنت متأكد 100%؟ اكتب "احذف" للتأكيد',
      input: 'text', showCancelButton: true,
      confirmButtonText: 'حذف نهائي', cancelButtonText: 'إلغاء',
      confirmButtonColor: '#ef4444',
      inputValidator: v => v !== 'احذف' ? 'اكتب "احذف" بالضبط' : null
    }).then(r2 => {
      if (r2.isConfirmed) {
        appData = { agents: [] };
        save();
        showToast('تم حذف جميع البيانات', 'success');
        renderDashboard();
      }
    });
  });
}
