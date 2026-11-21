// ============================================================
// ===== مشاركة وحدات الفوارغ (Web Share API) =====
// ============================================================
// سبب المشكلة السابقة: واجهة navigator.share تشترط أن يُستدعى الأمر بعد نقرة
// المستخدم مباشرة (User Activation). إذا انتظرنا تحميل الصور/الفيديوهات من
// Cloudinary (await fetch) قبل الاستدعاء، تنتهي صلاحية النقرة (~5 ثوانٍ في
// كروم، وأقل بكثير في سفاري) فيرفض المتصفح المشاركة بخطأ NotAllowedError،
// فكان الزر يعمل أحيانًا (صور قليلة/سريعة/مخزنة) ولا يعمل أحيانًا.
//
// الحل: 1) تحميل الملفات مسبقًا في ذاكرة مؤقتة (عند مرور المؤشر/اللمس)
//       2) عند النقر نستدعي navigator.share بشكل متزامن بلا أي await قبله
//       3) إن لم تكن الملفات جاهزة نعرض نافذة تجهيز ثم زر "مشاركة الآن"
//          (نقرة جديدة = صلاحية جديدة) بدل المحاولة بعد انتهاء الصلاحية
// ============================================================
const VAC_SHARE_MAX_FILES = 10;
const VAC_SHARE_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const VAC_SHARE_FETCH_TIMEOUT_MS = 30000;
const VAC_SHARE_CACHE_LIMIT = 3;
const vacShareCache = new Map(); // id -> { sig, status, files, skipped, promise }
let vacShareInFlight = false;

const VAC_MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp'
};
const VAC_EXT_TO_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  avif: 'image/avif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp'
};

function vacShareMediaList(u) {
  return (u.media || []).filter(m => m && m.data && !m.uploading).slice(0, VAC_SHARE_MAX_FILES);
}
function vacShareSignature(u) {
  return vacShareMediaList(u).map(m => String(m.data).length + ':' + String(m.data).slice(-60)).join('|');
}
function vacShareResolveMime(blob, m) {
  const t = String(blob.type || '').toLowerCase().split(';')[0].trim();
  if (VAC_MIME_TO_EXT[t]) return t;
  const urlExt = String(m.data).split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  if (VAC_EXT_TO_MIME[urlExt]) return VAC_EXT_TO_MIME[urlExt];
  return m.type === 'video' ? 'video/mp4' : 'image/jpeg';
}
async function vacFetchMediaFile(u, m, i) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VAC_SHARE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(m.data, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const mime = vacShareResolveMime(blob, m);
    const base = String(u.propertyName || 'وحدة').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || 'وحدة';
    return new File([blob], `${base}-${i + 1}.${VAC_MIME_TO_EXT[mime]}`, { type: mime });
  } finally { clearTimeout(timer); }
}
async function vacBuildShareFiles(u) {
  const list = vacShareMediaList(u);
  const results = await Promise.allSettled(list.map((m, i) => vacFetchMediaFile(u, m, i)));
  const files = []; let total = 0, skipped = 0;
  results.forEach(r => {
    if (r.status !== 'fulfilled') { skipped++; return; }
    if (total + r.value.size > VAC_SHARE_MAX_TOTAL_BYTES) { skipped++; return; }
    total += r.value.size; files.push(r.value);
  });
  return { files, skipped };
}
// يبدأ (أو يعيد استخدام) تجهيز ملفات وحدة في الخلفية
function vacWarmShare(id) {
  try {
    if (!navigator.share) return null;
    const u = appData.vacant.units.find(x => x.id === id);
    if (!u || !vacShareMediaList(u).length) return null;
    const sig = vacShareSignature(u);
    const old = vacShareCache.get(id);
    if (old && old.sig === sig) { vacShareCache.delete(id); vacShareCache.set(id, old); return old; }
    const e = { sig, status: 'loading', files: [], skipped: 0 };
    e.promise = vacBuildShareFiles(u).then(r => {
      e.files = r.files; e.skipped = r.skipped;
      e.status = r.files.length ? 'ready' : 'failed';
      if (e.status === 'failed' && vacShareCache.get(id) === e) vacShareCache.delete(id); // لإعادة المحاولة لاحقًا
      return e;
    }).catch(() => {
      e.status = 'failed';
      if (vacShareCache.get(id) === e) vacShareCache.delete(id);
      return e;
    });
    vacShareCache.set(id, e);
    while (vacShareCache.size > VAC_SHARE_CACHE_LIMIT) vacShareCache.delete(vacShareCache.keys().next().value);
    return e;
  } catch (err) { return null; }
}
function vacBuildShareData(u, files) {
  const base = { title: u.propertyName || 'تفاصيل الوحدة', text: buildVacShareText(u) };
  if (!files || !files.length || !navigator.canShare) return { data: base, withFiles: false };
  const images = files.filter(f => String(f.type).startsWith('image/'));
  for (const set of [files, images]) {
    if (!set.length) continue;
    const data = Object.assign({}, base, { files: set });
    try { if (navigator.canShare(data)) return { data, withFiles: true, partial: set.length < files.length }; } catch (e) { /* جرّب المجموعة التالية */ }
  }
  return { data: base, withFiles: false };
}
// ملاحظة مهمة: هذه الدالة تستدعي navigator.share بشكل متزامن (بدون await قبلها)
function vacStartShare(u, files) {
  if (vacShareInFlight) return Promise.resolve({ status: 'busy' });
  const built = vacBuildShareData(u, files);
  vacShareInFlight = true;
  let p;
  try { p = Promise.resolve(navigator.share(built.data)); } catch (e) { p = Promise.reject(e); }
  return p.then(
    () => { vacShareInFlight = false; return { status: 'shared', withFiles: built.withFiles, partial: !!built.partial }; },
    err => {
      vacShareInFlight = false;
      if (err && err.name === 'AbortError') return { status: 'cancelled' };
      return { status: 'error', error: err };
    }
  );
}
function vacRunShare(u, files, id, skipped) {
  vacStartShare(u, files).then(res => {
    if (res.status === 'shared') {
      if (files.length && !res.withFiles) showToast('تمت مشاركة النص فقط — هذا المتصفح لا يقبل إرفاق هذه الملفات', 'success');
      else if (res.partial || skipped) showToast('تمت المشاركة، لكن بعض الملفات لم تُرفق (الحجم أو الاتصال)', 'success');
      return;
    }
    if (res.status !== 'error') return;
    console.warn('تعذرت المشاركة:', res.error);
    // المتصفح يستهلك صلاحية النقرة عند أول استدعاء حتى لو فشل، فلا فائدة من إعادة
    // المحاولة تلقائيًا؛ نعرض نافذة بأزرار أصلية (كل نقرة = صلاحية جديدة)
    vacShareDialog(u, id, 'failed');
  });
}
function shareVacUnitNative(id) {
  const u = appData.vacant.units.find(x => x.id === id); if (!u) return;
  if (!navigator.share) { copyVacUnit(id); return; } // المتصفح لا يدعم المشاركة → نسخ تلقائي
  if (vacShareInFlight) return;
  if (!vacShareMediaList(u).length) { vacRunShare(u, [], id, 0); return; }
  const e = vacWarmShare(id);
  if (e && e.status === 'ready') { vacRunShare(u, e.files, id, e.skipped); return; } // جاهزة → مشاركة فورية
  vacShareDialog(u, id, 'preparing');
}
// نافذة تظهر فقط عندما لا تكون الملفات جاهزة أو فشلت المشاركة؛ أزرارها أصلية
// (onclick مباشر) كي تكون كل نقرة صلاحية جديدة لـ navigator.share
function vacShareDialog(u, id, initial) {
  let alive = true;
  const entry = () => vacShareCache.get(id) || vacWarmShare(id);
  const render = (state) => {
    if (!alive) return;
    const box = Swal.getHtmlContainer(); if (!box) return;
    const e = vacShareCache.get(id);
    const btn = (bid, label, color) => `<button type="button" id="${bid}" class="btn" style="background:${color};color:#fff;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;margin:4px;">${label}</button>`;
    let msg = '', buttons = '';
    if (state === 'preparing') {
      msg = '<i class="fas fa-spinner fa-spin"></i> جاري تجهيز الصور والفيديوهات للمشاركة…';
      buttons = btn('vacShTextOnly', 'مشاركة النص فقط', '#64748b');
    } else if (state === 'ready') {
      const n = e ? e.files.length : 0;
      msg = `الملفات جاهزة (${n}). اضغط الزر للمشاركة.` + (e && e.skipped ? `<br><small>تعذر تجهيز ${e.skipped} ملف (الحجم أو الاتصال).</small>` : '');
      buttons = btn('vacShGo', '<i class="fas fa-share-alt"></i> مشاركة الآن', '#25D366') + btn('vacShTextOnly', 'النص فقط', '#64748b');
    } else {
      msg = 'تعذر إتمام المشاركة مع الملفات. اضغط للمحاولة مرة أخرى.';
      buttons = btn('vacShTextOnly', 'مشاركة النص فقط', '#25D366') + btn('vacShGo', 'إعادة المحاولة مع الملفات', '#64748b') + btn('vacShCopy', 'نسخ البيانات', '#0d2137');
    }
    box.innerHTML = `<div style="text-align:center;line-height:1.9;">${msg}<div style="margin-top:10px;">${buttons}</div></div>`;
    const go = box.querySelector('#vacShGo'), txt = box.querySelector('#vacShTextOnly'), cp = box.querySelector('#vacShCopy');
    if (go) go.onclick = () => {
      const cur = vacShareCache.get(id);
      if (cur && cur.status === 'ready') { vacRunShare(u, cur.files, id, cur.skipped); Swal.close(); }
      else { vacWarmShare(id); render('preparing'); waitReady(); }
    };
    if (txt) txt.onclick = () => { vacRunShare(u, [], id, 0); Swal.close(); };
    if (cp) cp.onclick = () => { copyVacUnit(id); Swal.close(); };
  };
  const waitReady = () => {
    const e = entry();
    if (!e) { render('failed'); return; }
    if (e.status === 'ready') { render('ready'); return; }
    e.promise.then(r => { if (alive) render(r.status === 'ready' ? 'ready' : 'failed'); });
  };
  Swal.fire({
    title: 'مشاركة الوحدة', html: '<div></div>', showConfirmButton: false, showCancelButton: true,
    cancelButtonText: 'إغلاق', allowOutsideClick: true,
    didOpen: () => { render(initial); if (initial === 'preparing') waitReady(); },
    willClose: () => { alive = false; }
  });
}
