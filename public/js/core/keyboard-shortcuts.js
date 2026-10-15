// ============================================================
// ===== KEYBOARD SHORTCUTS =====
// ============================================================
document.addEventListener('keydown', e => {
  if (e.ctrlKey) {
    if (e.key === '1') { e.preventDefault(); showPage('dashboard'); }
    if (e.key === '2') { e.preventDefault(); showPage('entry'); }
    if (e.key === '3') { e.preventDefault(); showPage('data'); }
    if (e.key === '4') { e.preventDefault(); showPage('report-all'); }
    if (e.key === 'p') { e.preventDefault(); window.print(); }
  }
});

