// ============================================================
// ===== ENTRY PAGE =====
// ============================================================
// ============================================================
// ===== VACANCY MANAGEMENT (إدارة الفوارغ) =====
// ============================================================
const UNIT_TYPES = ['سكني عزاب','سكني عوائل','محل','مستودع','صالة'];
const VAC_COPY_FIELDS = [
  {key:'propertyName', label:'🏢 اسم العقار'},
  {key:'area', label:'📐 المساحة'},
  {key:'specs', label:'📝 المواصفات'},
  {key:'price', label:'💰 السعر'},
  {key:'priceVat', label:'💰 السعر شامل الضريبة'},
  {key:'mapLink', label:'📍 الموقع على الخريطة'}
];
function buildVacShareText(u) {
  let text = '';
  // إذا كان السعر قبل الضريبة يساوي السعر شامل الضريبة، نعرض السعر مرة واحدة فقط
  const hasPrice = u.price !== undefined && u.price !== null && String(u.price).trim() !== '';
  const hasPriceVat = u.priceVat !== undefined && u.priceVat !== null && String(u.priceVat).trim() !== '';
  const samePrice = hasPrice && hasPriceVat && Number(u.price) === Number(u.priceVat);
  VAC_COPY_FIELDS.forEach(f => {
    if (f.key === 'priceVat' && samePrice) return;
    const val = u[f.key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      text += `${f.label}: ${(f.key==='price'||f.key==='priceVat') ? fmt(val)+' ريال' : (f.key==='area' ? val+' م²' : val)}\n`;
    }
  });
  return text.trim();
}
// دوال المشاركة (shareVacUnitNative وغيرها) انتقلت إلى js/modules/vacancy-share.js
let vfMediaTemp = [];

function ensureVacantData() {
  if (!appData.vacant) appData.vacant = { units: [], locations: [], cityMemory: [], propertyMemory: [], draft: '' };
  if (!appData.vacant.units) appData.vacant.units = [];
  if (!appData.vacant.locations) appData.vacant.locations = [];
  if (!appData.vacant.cityMemory) appData.vacant.cityMemory = [];
  if (!appData.vacant.propertyMemory) appData.vacant.propertyMemory = [];
}
// ============================================================
// ===== VacantRepository: مبني على BaseRepository =====
// ============================================================
const VacantRepository = createFirestoreRepository({
  migrationSection: 'vacants',
  deletionSection: 'vacant',
  getLocalArray: () => appData.vacant.units,
  setLocalArray: (items) => { appData.vacant.units = items; },
  ensureFn: ensureVacantData,
  collectionService: (typeof VacantsCollectionService !== 'undefined') ? VacantsCollectionService : null,
  onRemoteChange: () => {
    const vacPageMap = { 'vac-available': 'available', 'vac-reserved': 'reserved', 'vac-rented': 'rented' };
    if (vacPageMap[currentPage]) renderVacantList(vacPageMap[currentPage]);
  }
});
function rememberVacantValue(list, val) {
  if (val && !list.includes(val)) list.unshift(val);
  if (list.length > 30) list.length = 30;
}


function vacantFieldHTML(u = {}, p = 'vf') {
  ensureVacantData();
  return `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">مدينة العقار</label>
        <input class="form-control" id="${p}-city" list="vacCityList" value="${u.city||''}">
        <datalist id="vacCityList">${appData.vacant.cityMemory.map(c=>`<option value="${c}">`).join('')}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">اسم العقار</label>
        <input class="form-control" id="${p}-propertyName" list="vacPropList" value="${u.propertyName||''}">
        <datalist id="vacPropList">${appData.vacant.propertyMemory.map(c=>`<option value="${c}">`).join('')}</datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">تاريخ التوفر (اتركه فارغاً إن كانت متاحة الآن)</label>
        <input class="form-control" type="date" id="${p}-futureDate" value="${u.futureDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">نوع الوحدة</label>
        <input class="form-control" id="${p}-unitType" list="vacUnitTypeList" value="${u.unitType||''}" placeholder="مثال: سكني عزاب / سكني عوائل / محل / مستودع / صالة">
        <datalist id="vacUnitTypeList">${UNIT_TYPES.map(t=>`<option value="${t}">`).join('')}</datalist>
        <small style="color:var(--text-muted);font-size:11px;">اكتب النوع بحرية، مثل: سكني عزاب، سكني عوائل، محل، مستودع، صالة...</small>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">رقم الطابق</label><input class="form-control" id="${p}-floor" value="${u.floor||''}"></div>
      <div class="form-group"><label class="form-label">رقم الشقة</label><input class="form-control" id="${p}-aptNo" value="${u.aptNo||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">تاريخ استلام الوحدة</label><input class="form-control" type="date" id="${p}-receiptDate" value="${u.receiptDate||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">المساحة (م²)</label><input class="form-control" type="number" id="${p}-area" value="${u.area||''}"></div>
      <div class="form-group"><label class="form-label">رقم الصك</label><input class="form-control" id="${p}-deed" value="${u.deed||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">السعر</label><input class="form-control" type="number" id="${p}-price" value="${u.price||''}" oninput="updateVacPriceVat('${p}')"></div>
      <div class="form-group">
        <label class="form-label">السعر شامل الضريبة (15%)</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <input class="form-control" type="number" id="${p}-priceVat" value="${u.priceVat||''}" readonly>
          <button type="button" class="btn btn-sm ${u.noVat?'btn-primary':'btn-secondary'}" id="${p}-noVatBtn" onclick="toggleVacNoVat('${p}')" style="white-space:nowrap;">لا يوجد ضريبة مضافة</button>
        </div>
      </div>
    </div>
    <div class="form-group"><label class="form-label">المواصفات</label><textarea class="form-control" id="${p}-specs" rows="2">${u.specs||''}</textarea></div>
    <div class="form-group">
      <label class="form-label">الموقع على الخريطة (رابط Google Maps)</label>
      <div style="display:flex;gap:6px;">
        <input class="form-control" id="${p}-mapLink" placeholder="https://maps.google.com/..." value="${u.mapLink||''}" autocomplete="off" name="vac-map-link-${p}" data-lpignore="true">
        <button type="button" class="btn btn-sm btn-secondary" onclick="pickVacLocationFor('${p}')" style="white-space:nowrap;"><i class="fas fa-map-marker-alt"></i> من مواقع تهمك</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">صورة / فيديو</label>
      <input class="form-control" type="file" id="${p}-media" accept="image/*,video/*" multiple>
      <div id="${p}-mediaPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div>
    </div>
    <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-control" id="${p}-notes" rows="2">${u.notes||''}</textarea></div>
  `;
}
function vfBindMediaInput(existingMedia, p = 'vf') {
  vfMediaTemp = (existingMedia || []).slice();
  renderVfMediaPreview(p);
  const input = document.getElementById(p+'-media');
  if (!input) return;
  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    input.value = '';
    for (const file of files) {
      // نضيف عنصرًا مؤقتًا بحالة "جاري الرفع" حتى ينتهي الرفع إلى Cloudinary
      const tempItem = { type: file.type.startsWith('video') ? 'video' : 'image', data: null, name: file.name, uploading: true, progress: 0 };
      vfMediaTemp.push(tempItem);
      renderVfMediaPreview(p);
      try {
        const result = await uploadToCloudinary(file, (percent) => {
          tempItem.progress = percent;
          renderVfMediaPreview(p);
        });
        tempItem.data = result.url;
        tempItem.type = result.type;
        tempItem.uploading = false;
      } catch (err) {
        console.error('فشل رفع الملف إلى Cloudinary:', err);
        showToast('تعذر رفع الملف "' + file.name + '" — تحقق من الإنترنت وإعدادات Cloudinary', 'error');
        const idx = vfMediaTemp.indexOf(tempItem);
        if (idx > -1) vfMediaTemp.splice(idx, 1);
      }
      renderVfMediaPreview(p);
    }
  };
}
function renderVfMediaPreview(p = 'vf') {
  const el = document.getElementById(p+'-mediaPreview');
  if (!el) return;
  el.innerHTML = vfMediaTemp.map((m,i) => `
    <div style="position:relative;">
      ${m.uploading
        ? `<div class="vac-media-thumb" style="display:flex;align-items:center;justify-content:center;background:#eee;font-size:11px;">جاري الرفع ${m.progress||0}%</div>`
        : (m.type==='video' ? `<video src="${m.data}" class="vac-media-thumb"></video>` : `<img src="${m.data}" class="vac-media-thumb">`)}
      <button type="button" onclick="vfMediaTemp.splice(${i},1);renderVfMediaPreview('${p}');" style="position:absolute;top:-6px;left:-6px;background:var(--danger);color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;">×</button>
    </div>`).join('');
}
let vacNoVatState = {};
function toggleVacNoVat(p) {
  vacNoVatState[p] = !vacNoVatState[p];
  const btn = document.getElementById(p+'-noVatBtn');
  if (btn) btn.className = 'btn btn-sm ' + (vacNoVatState[p] ? 'btn-primary' : 'btn-secondary');
  updateVacPriceVat(p);
}
function updateVacPriceVat(p) {
  const priceEl = document.getElementById(p+'-price');
  const vatEl = document.getElementById(p+'-priceVat');
  if (!priceEl || !vatEl) return;
  const price = Number(priceEl.value) || 0;
  vatEl.value = vacNoVatState[p] ? price : Math.round(price * 1.15 * 100) / 100;
}
function collectVacFieldValues(p = 'vf') {
  return {
    city: document.getElementById(p+'-city').value.trim(),
    propertyName: document.getElementById(p+'-propertyName').value.trim(),
    futureDate: document.getElementById(p+'-futureDate').value,
    unitType: document.getElementById(p+'-unitType').value.trim(),
    floor: document.getElementById(p+'-floor').value.trim(),
    aptNo: document.getElementById(p+'-aptNo').value.trim(),
    receiptDate: document.getElementById(p+'-receiptDate').value,
    area: document.getElementById(p+'-area').value,
    price: document.getElementById(p+'-price').value,
    priceVat: document.getElementById(p+'-priceVat').value,
    noVat: !!vacNoVatState[p],
    deed: document.getElementById(p+'-deed').value.trim(),
    specs: document.getElementById(p+'-specs').value.trim(),
    mapLink: document.getElementById(p+'-mapLink').value.trim(),
    notes: document.getElementById(p+'-notes').value.trim()
  };
}

function renderVacEntryPage(force) {
  const container = document.getElementById('vacEntryForm');
  // لا نُفرغ النموذج إذا كان يحتوي بيانات لم تُحفظ بعد، إلا إذا طُلب ذلك صراحة
  // (مثلاً بعد نجاح الحفظ). هذا يمنع أي مسار غير متوقع مستقبلاً من محو كتابة المستخدم.
  if (!force && container.innerHTML.trim() !== '') return;
  container.innerHTML = vacantFieldHTML({}, 'vf');
  vfBindMediaInput([], 'vf');
  vacNoVatState['vf'] = false;
  updateVacPriceVat('vf');
}
function syncVacLocationFromUnit(u) {
  if (!u.mapLink) return;
  ensureVacantData();
  let loc = appData.vacant.locations.find(l => l.mapLink === u.mapLink)
    || appData.vacant.locations.find(l => l.propertyName && u.propertyName && l.propertyName === u.propertyName && l.city === u.city);
  if (loc) {
    loc.mapLink = u.mapLink;
    if (u.propertyName) loc.propertyName = u.propertyName;
    if (u.city) loc.city = u.city;
    if (!loc.title) loc.title = u.propertyName || '';
  } else {
    appData.vacant.locations.push({
      id: uid(), title: u.propertyName || 'بدون عنوان', city: u.city || '', propertyName: u.propertyName || '',
      mapLink: u.mapLink, notes: '', createdAt: new Date().toISOString()
    });
  }
}
async function saveVacEntry() {
  if (isSectionViewOnly('vac')) {
    showToast('وضع العرض فقط: لا يمكنك حفظ إدخال جديد', 'error');
    return;
  }
  ensureVacantData();
  const v = collectVacFieldValues();
  const u = { id: uid(), status: 'available', ...v, media: vfMediaTemp.slice(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await VacantRepository.add(u);
  rememberVacantValue(appData.vacant.cityMemory, u.city);
  rememberVacantValue(appData.vacant.propertyMemory, u.propertyName);
  syncVacLocationFromUnit(u);
  logVacDraft('إضافة وحدة', `${u.propertyName||''} — ${u.unitType||''} — طابق ${u.floor||'؟'} شقة ${u.aptNo||'؟'}`, null, u);
  save();
  const isFuture = u.futureDate && u.futureDate > new Date().toISOString().slice(0,10);
  showToast(isFuture ? 'تم حفظ الوحدة في الوحدات المستقبلية' : 'تم إضافة الوحدة إلى الوحدات المتاحة', 'success');
  renderVacEntryPage(true);
  // تحديث قوائم إدارة الوحدات إن كانت مفتوحة
  const umPropList = document.getElementById('umPropList');
  if (umPropList) {
    const vacProps = [...new Set(appData.vacant.units.map(x => x.propertyName).filter(Boolean))];
    const unitProps = [...new Set((appData.units?.records||[]).map(x => x.propertyName).filter(Boolean))];
    const allProps = [...new Set([...vacProps, ...unitProps])];
    umPropList.innerHTML = allProps.map(p => `<option value="${p}">`).join('');
  }
  const umAptList = document.getElementById('umAptList');
  if (umAptList) {
    const curProp = document.getElementById('um-propertyName')?.value;
    if (curProp) {
      const vacApts = appData.vacant.units.filter(x => x.propertyName === curProp).map(x => x.aptNo).filter(Boolean);
      const unitApts = (appData.units?.records||[]).filter(x => x.propertyName === curProp).map(x => x.aptNo).filter(Boolean);
      umAptList.innerHTML = [...new Set([...vacApts, ...unitApts])].map(a => `<option value="${a}">`).join('');
    }
  }
  const umPriceList = document.getElementById('umPriceList');
  if (umPriceList) {
    const prices = [...new Set(appData.vacant.units.map(x => x.price).filter(Boolean))];
    umPriceList.innerHTML = prices.map(p => `<option value="${p}">`).join('');
  }
  const umContentsList = document.getElementById('umContentsList');
  if (umContentsList) {
    const specs = [...new Set(appData.vacant.units.map(x => x.specs).filter(Boolean))];
    umContentsList.innerHTML = specs.map(s => `<option value="${s}">`).join('');
  }
}

function populateVacFilters(prefix) {
  ensureVacantData();
  const citySel = document.getElementById(prefix+'City');
  const propSel = document.getElementById(prefix+'Prop');
  if (!citySel) return;
  const curC = citySel.value, curP = propSel.value;
  const cities = [...new Set(appData.vacant.units.map(u=>u.city).filter(Boolean))];
  const relevantUnits = curC ? appData.vacant.units.filter(u => u.city === curC) : appData.vacant.units;
  const props = [...new Set(relevantUnits.map(u=>u.propertyName).filter(Boolean))];
  citySel.innerHTML = '<option value="">كل المدن</option>' + cities.map(c=>`<option value="${c}">${c}</option>`).join('');
  propSel.innerHTML = '<option value="">كل العقارات</option>' + props.map(p=>`<option value="${p}">${p}</option>`).join('');
  if (curC) citySel.value = curC;
  if (curP) propSel.value = curP;
}
// عند تغيير فلتر المدينة: نعيد تعيين فلتر العقارات إلى "كل العقارات" أولاً
// ثم نعيد عرض القائمة، بحيث تُبنى قائمة العقارات محصورة بالمدينة الجديدة مباشرة.
function onVacCityFilterChange(prefix, status) {
  const propSel = document.getElementById(prefix+'Prop');
  if (propSel) propSel.value = '';
  renderVacantList(status);
}
function renderVacantList(status) {
  ensureVacantData();
  const map = { available: 'vacAvail', reserved: 'vacReserved', rented: 'vacRented' };
  const prefix = map[status];
  populateVacFilters(prefix);
  const city = document.getElementById(prefix+'City')?.value || '';
  const prop = document.getElementById(prefix+'Prop')?.value || '';
  const today = new Date().toISOString().slice(0,10);
  let list;
  if (status === 'available') {
    list = appData.vacant.units.filter(u => u.status !== 'reserved' && u.status !== 'rented');
  } else {
    list = appData.vacant.units.filter(u => u.status === status);
  }
  if (city) list = list.filter(u => u.city === city);
  if (prop) list = list.filter(u => u.propertyName === prop);
  const groups = {};
  list.forEach(u => {
    const gk = (u.city||'بدون مدينة') + '|' + (u.propertyName||'بدون اسم عقار');
    (groups[gk] = groups[gk] || []).push(u);
  });
  const el = document.getElementById(prefix+'Content');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد وحدات</h3></div>'; return; }
  let html = '';
  Object.keys(groups).sort().forEach(gk => {
    const [c,p] = gk.split('|');
    html += `<div class="card" style="margin-bottom:14px;">
      <div class="card-title"><i class="fas fa-city"></i> ${c} — ${p}</div>
      <div class="table-wrapper"><table>
        <thead><tr>
          <th>#</th><th>اسم العقار</th><th>الشقة</th><th>النوع</th><th>السعر</th>
          <th class="no-print">إجراءات</th>
        </tr></thead>
        <tbody>
          ${groups[gk].map((u,i) => { const isFutureUnit = status === 'available' && u.futureDate && u.futureDate > today; return `
            <tr class="${status==='reserved' ? 'vac-reserved-row' : (isFutureUnit ? 'vac-future-row' : '')}" style="cursor:pointer;" onclick="showVacUnitDetails('${u.id}')">
              <td data-label="#">${i+1}</td>
              <td data-label="اسم العقار">${u.propertyName||'—'}${isFutureUnit ? ' <span class="badge" style="background:rgba(245,158,11,0.2);color:var(--warning);font-size:10px;"><i class="fas fa-hourglass-half"></i> مستقبلية</span>' : ''}</td>
              <td data-label="الشقة">${u.aptNo||'—'}</td>
              <td data-label="النوع">${u.unitType||'—'}</td>
              <td data-label="السعر">${u.price ? fmt(u.price) : '—'}</td>
              <td class="no-print" data-label="إجراءات" style="display:flex;gap:6px;flex-wrap:wrap;" onclick="event.stopPropagation()">
                ${!isSectionViewOnly('vac') ? `<button class="btn btn-sm btn-secondary btn-edit-vac" onclick="editVacUnit('${u.id}')" title="تعديل"><i class="fas fa-edit"></i><span class="btn-label">تعديل</span></button>` : ''}
                <button class="btn btn-sm btn-secondary" onclick="downloadVacMedia('${u.id}')" title="تنزيل الصور/الفيديوهات"><i class="fas fa-download"></i><span class="btn-label">تنزيل</span></button>
                <button class="btn btn-sm btn-secondary" onclick="sendVacUnitWhatsapp('${u.id}')" title="إرسال عبر واتساب"><i class="fab fa-whatsapp"></i><span class="btn-label">واتساب</span></button>
                <button class="btn btn-sm btn-secondary" onclick="shareVacUnitNative('${u.id}')" onpointerenter="vacWarmShare('${u.id}')" ontouchstart="vacWarmShare('${u.id}')" onfocus="vacWarmShare('${u.id}')" title="مشاركة"><i class="fas fa-share-alt"></i><span class="btn-label">مشاركة</span></button>
                ${status==='available' ? `<button class="btn btn-sm btn-danger vac-status-btn" onclick="reserveVacUnit('${u.id}')" title="حجز"><i class="fas fa-lock"></i><span class="btn-label">حجز</span></button>` : ''}
                ${status==='reserved' ? `<button class="btn btn-sm btn-primary vac-status-btn" onclick="rentVacUnit('${u.id}')" title="نقل إلى المؤجرة"><i class="fas fa-right-left"></i><span class="btn-label">تأجير</span></button>` : ''}
                ${status==='reserved' ? `<button class="btn btn-sm btn-secondary vac-status-btn" onclick="unreserveVacUnit('${u.id}')" title="فك الحجز"><i class="fas fa-lock-open"></i><span class="btn-label">فك الحجز</span></button>` : ''}
                ${status==='rented' ? `<button class="btn btn-sm btn-primary vac-status-btn" onclick="unrentVacUnit('${u.id}')" title="نقل إلى الوحدات المتاحة"><i class="fas fa-right-left"></i><span class="btn-label">إلى المتاحة</span></button>` : ''}
                ${(currentUser && (currentUser.role==='مدير' || currentUser.role==='مشرف')) || !currentUser ? `<button class="btn btn-sm btn-danger btn-delete-vac" onclick="deleteVacUnit('${u.id}')" title="حذف"><i class="fas fa-trash"></i><span class="btn-label">حذف</span></button>` : ''}
              </td>
            </tr>`; }).join('')}
        </tbody>
      </table></div>
    </div>`;
  });
  el.innerHTML = html;
}
function reserveVacUnit(id, fromStatus) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  Swal.fire({
    title: '<i class="fas fa-lock" style="color:#c0392b;"></i> تأكيد الحجز',
    width: 460,
    html: `<div style="text-align:right;direction:rtl;font-size:14px;line-height:1.9;color:#1a1a1a;background:#fff6f6;border:1px solid #f3c6c6;border-radius:10px;padding:14px 16px;">
            هل استلمت رسوم كتابة العقد والسعي؟
           </div>`,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-check"></i> تأكيد الحجز',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#c0392b',
    cancelButtonColor: '#5a5a5a',
    reverseButtons: true
  }).then(result => {
    if (!result.isConfirmed) return;
    doReserveVacUnit(id, fromStatus);
  });
}
function doReserveVacUnit(id, fromStatus) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  const before = JSON.parse(JSON.stringify(u));
  const changes = { status: 'reserved', reserveDate: new Date().toISOString().slice(0,10), updatedAt: new Date().toISOString() };
  Object.assign(u, changes);
  logVacDraft('حجز وحدة', `${u.propertyName||''} — ${u.unitType||''} — طابق ${u.floor||'؟'} شقة ${u.aptNo||'؟'}`, before, u);
  VacantRepository.update(id, changes).catch(e => { console.error(e); showToast('تعذر حفظ الحجز — تأكد من الاتصال', 'error'); });
  showToast('تم حجز الوحدة', 'success'); renderVacantList(fromStatus || 'available');
}
function unreserveVacUnit(id) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  const before = JSON.parse(JSON.stringify(u));
  const changes = { status: 'available', reserveDate: '', updatedAt: new Date().toISOString() };
  Object.assign(u, changes);
  logVacDraft('فك حجز وحدة', `${u.propertyName||''} — ${u.unitType||''} — طابق ${u.floor||'؟'} شقة ${u.aptNo||'؟'}`, before, u);VacantRepository.update(id, changes).catch(e => { console.error(e); showToast('تعذر حفظ فك الحجز — تأكد من الاتصال', 'error'); });
  showToast('تم فك حجز الوحدة', 'success'); renderVacantList('reserved');
}
function rentVacUnit(id) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  const before = JSON.parse(JSON.stringify(u));
  const changes = { status: 'rented', rentDate: new Date().toISOString().slice(0,10), updatedAt: new Date().toISOString() };
  Object.assign(u, changes);
  logVacDraft('تأجير وحدة', `${u.propertyName||''} — ${u.unitType||''} — طابق ${u.floor||'؟'} شقة ${u.aptNo||'؟'}`, before, u);
  VacantRepository.update(id, changes).catch(e => { console.error(e); showToast('تعذر حفظ التأجير — تأكد من الاتصال', 'error'); });
  showToast('تم نقل الوحدة إلى المؤجرة', 'success'); renderVacantList('reserved');
}
function deleteVacUnit(id) {
  if (isSectionViewOnly('vac')) {
    showToast('وضع العرض فقط: لا يمكنك الحذف', 'error');
    return;
  }
  if (currentUser && currentUser.role !== 'مدير' && currentUser.role !== 'مشرف') {
    showToast('هذا الإجراء متاح فقط للمشرف أو المدير', 'error');
    return;
  }
  Swal.fire({ title:'تأكيد الحذف', text:'هل تريد حذف هذه الوحدة؟', icon:'warning', showCancelButton:true, confirmButtonText:'حذف', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(r => {
    if (r.isConfirmed) {
      const u = appData.vacant.units.find(x=>x.id===id);
      VacantRepository.remove(id);
      if (u) logVacDraft('حذف وحدة', `${u.propertyName||''} — ${u.unitType||''} — طابق ${u.floor||'؟'} شقة ${u.aptNo||'؟'}`, u, null);
      showToast('تم الحذف','success');
      if (u) renderVacantList(u.status);
    }
  });
}
function showVacUnitDetails(id) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  const row = (label, val) => val !== undefined && val !== null && String(val).trim() !== ''
    ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">${label}</span><strong>${val}</strong></div>` : '';
  const html = `<div style="text-align:right;direction:rtl;">
    ${row('المدينة', u.city)}
    ${row('اسم العقار', u.propertyName)}
    ${row('نوع الوحدة', u.unitType)}
    ${row('الطابق', u.floor)}
    ${row('رقم الشقة', u.aptNo)}
    ${row('المساحة', u.area ? u.area+' م²' : '')}
    ${row('السعر', u.price ? fmt(u.price)+' ريال' : '')}
    ${row('السعر شامل الضريبة', u.priceVat ? fmt(u.priceVat)+' ريال' : '')}
   ${row('رقم الصك', u.deed)}
    ${row('تاريخ استلام الوحدة', u.receiptDate ? fmtDate(u.receiptDate) : '')}
    ${row('تاريخ التوفر', u.futureDate ? fmtDate(u.futureDate) : '')}
    ${row('تاريخ الحجز', u.reserveDate ? fmtDate(u.reserveDate) : '')}
    ${row('تاريخ التأجير', u.rentDate ? fmtDate(u.rentDate) : '')}
    ${row('المواصفات', u.specs)}
    ${u.mapLink ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">الموقع على الخريطة</span><a href="${u.mapLink}" target="_blank">فتح الخريطة</a></div>` : ''}
    ${row('ملاحظات', u.notes)}
  </div>`;
  Swal.fire({
    title: u.propertyName || 'تفاصيل الوحدة', width: 550, html,
    showCancelButton: true, confirmButtonText: 'نسخ البيانات', cancelButtonText: 'إغلاق', confirmButtonColor: '#0d2137'
  }).then(r => { if (r.isConfirmed) copyVacUnit(id); });
}
function editVacUnit(id) {
  if (isSectionViewOnly('vac')) {
    showToast('وضع العرض فقط: لا يمكنك التعديل', 'error');
    return;
  }
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  Swal.fire({
    title: 'تعديل الوحدة', width: 600,
    html: vacantFieldHTML(u, 'vfe'),
    didOpen: () => { vfBindMediaInput(u.media || [], 'vfe'); vacNoVatState['vfe'] = !!u.noVat; updateVacPriceVat('vfe'); },
    showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137',
    preConfirm: () => collectVacFieldValues('vfe')
  }).then(async r => {
    if (r.isConfirmed) {
      const before = JSON.parse(JSON.stringify(u));
      Object.assign(u, r.value);
      u.media = vfMediaTemp.slice();
      u.updatedAt = new Date().toISOString();
      rememberVacantValue(appData.vacant.cityMemory, u.city);
      rememberVacantValue(appData.vacant.propertyMemory, u.propertyName);
      syncVacLocationFromUnit(u);
      logVacDraft('تعديل وحدة', `${u.propertyName||''} — ${u.unitType||''} — طابق ${u.floor||'؟'} شقة ${u.aptNo||'؟'}`, before, u);
      const { id: _id, ...changesToSave } = JSON.parse(JSON.stringify(u));
      try {
        const saved = await Promise.race([
          VacantRepository.update(id, changesToSave),
          new Promise((_, rej) => setTimeout(() => rej(new Error('لم يتأكد الحفظ على الخادم بعد (قد يكون الاتصال ضعيفًا). لا تغلق الصفحة، وتحقق من الاتصال ثم أعد فتح الوحدة للتأكد.')), 15000))
        ]);
        if (!saved) throw new Error('الوحدة غير موجودة في القائمة الحالية');
        showToast('تم التحديث', 'success');
      } catch (e) {
        console.error(e);
        Swal.fire({ icon: 'error', title: 'لم يُحفظ التعديل', text: String(e.message || e) });
      }
      renderVacantList(u.status);
      // تحديث قوائم إدارة الوحدات إن كانت مفتوحة
      const umPropList = document.getElementById('umPropList');
      if (umPropList) {
        const vacProps = [...new Set(appData.vacant.units.map(x => x.propertyName).filter(Boolean))];
        const unitProps = [...new Set((appData.units?.records||[]).map(x => x.propertyName).filter(Boolean))];
        umPropList.innerHTML = [...new Set([...vacProps, ...unitProps])].map(p => `<option value="${p}">`).join('');
      }
      const umPriceList = document.getElementById('umPriceList');
      if (umPriceList) {
        const prices = [...new Set(appData.vacant.units.map(x => x.price).filter(Boolean))];
        umPriceList.innerHTML = prices.map(p => `<option value="${p}">`).join('');
      }
      const umContentsList = document.getElementById('umContentsList');
      if (umContentsList) {
        const specs = [...new Set(appData.vacant.units.map(x => x.specs).filter(Boolean))];
        umContentsList.innerHTML = specs.map(s => `<option value="${s}">`).join('');
      }
    }
  });
}
function copyVacUnit(id) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  const text = buildVacShareText(u);
  const clipboardApiCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => showToast('تم نسخ بيانات الوحدة', 'success')).catch(() => showToast('تعذر النسخ، يرجى نسخ النص يدويًا', 'error'));
    } else {
      showToast('تعذر النسخ، يرجى نسخ النص يدويًا', 'error');
    }
  };
  // نبدأ بطريقة execCommand القديمة لأنها تعمل مباشرة دون طلب أي إذن من المتصفح
  // (على عكس Clipboard API التي قد تطلب إذناً إذا فُقد سياق تفاعل المستخدم،
  // كما يحدث عند الوصول لهذه الدالة بعد عدة عمليات await متتالية من زر المشاركة)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  if (ok) showToast('تم نسخ بيانات الوحدة', 'success');
  else clipboardApiCopy();
}
async function downloadVacMedia(id) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  const media = u.media || [];
  if (!media.length) { showToast('لا توجد صور أو فيديوهات لهذه الوحدة', 'error'); return; }
  showToast('جاري تحضير التنزيل...', 'success');
  // ملاحظة: روابط Cloudinary من نطاق مختلف عن الموقع (cross-origin)، لذلك
  // نجلب الملف كـ blob أولاً ثم ننزّله محليًا حتى يعمل زر "تنزيل" بشكل
  // مباشر (وليس مجرد فتح الصورة في تبويب جديد).
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    const ext = (m.name && m.name.includes('.')) ? m.name.split('.').pop() : (m.type === 'video' ? 'mp4' : 'jpg');
    const fileName = `${u.propertyName||'وحدة'}-${u.aptNo||i+1}-${i+1}.${ext}`;
    try {
      const res = await fetch(m.data);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('تعذر تنزيل الملف:', fileName, e);
      // كخطة بديلة، افتح الرابط مباشرة إن تعذّر الجلب كـ blob
      window.open(m.data, '_blank');
    }
  }
  showToast('تم تنزيل الصور/الفيديوهات', 'success');
}
function sendVacUnitWhatsapp(id) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  Swal.fire({
    title: 'إرسال عبر واتساب',
    input: 'text',
    inputLabel: 'فضلاً أدخل الرقم المراد الإرسال إليه',
    inputPlaceholder: 'مثال: 05xxxxxxxx',
    showCancelButton: true, confirmButtonText: 'إرسال', cancelButtonText: 'إلغاء', confirmButtonColor: '#25D366',
    inputValidator: (value) => { if (!value || !value.trim()) return 'الرجاء إدخال رقم الجوال'; }
  }).then(r => {
    if (r.isConfirmed) {
      const text = buildVacShareText(u);
      let digits = r.value.replace(/[^\d]/g, '');
      if (digits.startsWith('0')) digits = '966' + digits.slice(1);
      else if (!digits.startsWith('966')) digits = '966' + digits;
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
      if ((u.media || []).length) showToast('تنبيه: واتساب ويب لا يدعم إرفاق الصور تلقائيًا عبر الرابط، استخدم زر "مشاركة" لإرسال الصور مباشرة', 'success');
    }
  });
}
function unrentVacUnit(id) {
  const u = appData.vacant.units.find(x=>x.id===id); if (!u) return;
  const before = JSON.parse(JSON.stringify(u));
  const changes = { status: 'available', rentDate: '', updatedAt: new Date().toISOString() };
  Object.assign(u, changes);
  logVacDraft('نقل وحدة إلى المتاحة', `${u.propertyName||''} — ${u.unitType||''} — طابق ${u.floor||'؟'} شقة ${u.aptNo||'؟'}`, before, u);
  VacantRepository.update(id, changes).catch(e => { console.error(e); showToast('تعذر الحفظ — تأكد من الاتصال', 'error'); });
  showToast('تم نقل الوحدة إلى الوحدات المتاحة', 'success'); renderVacantList('rented');
}

function populateVacLocFilters() {
  ensureVacantData();
  const sel = document.getElementById('vacLocCity'); if (!sel) return;
  const cur = sel.value;
  const cities = [...new Set(appData.vacant.locations.map(l=>l.city).filter(Boolean))];
  sel.innerHTML = '<option value="">كل المدن</option>' + cities.map(c=>`<option value="${c}">${c}</option>`).join('');
  if (cur) sel.value = cur;
}
function renderVacLocations() {
  ensureVacantData();
  const dedupBtn = document.getElementById('vacDedupBtn');
  if (dedupBtn) dedupBtn.style.display = (currentUser && currentUser.role === 'مدير') ? '' : 'none';
  const beforeCount = appData.vacant.locations.length;
  appData.vacant.units.forEach(u => syncVacLocationFromUnit(u));
  if (appData.vacant.locations.length !== beforeCount) save();
  const city = document.getElementById('vacLocCity')?.value || '';
  const propSel = document.getElementById('vacLocProp');
  if (propSel) {
    const curP = propSel.value;
    const props = [...new Set(appData.vacant.locations.map(l=>l.propertyName).filter(Boolean))];
    propSel.innerHTML = '<option value="">كل العقارات</option>' + props.map(p=>`<option value="${p}">${p}</option>`).join('');
    if (curP) propSel.value = curP;
  }
  const prop = propSel?.value || '';
  let list = appData.vacant.locations;
  if (city) list = list.filter(l => l.city === city);
  if (prop) list = list.filter(l => l.propertyName === prop);
  const el = document.getElementById('vacLocContent');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h3>لا توجد مواقع مضافة</h3></div>'; return; }
  el.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th>#</th><th>العنوان</th><th>المدينة</th><th>اسم العقار</th><th>الرابط</th><th>ملاحظات</th><th class="no-print">إجراءات</th></tr></thead>
    <tbody>${list.map((l,i)=>`<tr>
      <td>${i+1}</td><td>${l.title||'—'}</td><td>${l.city||'—'}</td><td>${l.propertyName||'—'}</td>
      <td>${l.mapLink ? `<a href="${l.mapLink}" target="_blank">فتح الخريطة</a>` : '—'}</td>
      <td style="font-size:11px;">${l.notes||'—'}</td>
      <td class="no-print"><button class="btn btn-sm btn-secondary" onclick="editVacLocation('${l.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-sm btn-danger" onclick="deleteVacLocation('${l.id}')"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('')}</tbody></table></div>`;
}
function pickVacLocationFor(p) {
  ensureVacantData();
  const cities = [...new Set(appData.vacant.locations.map(l=>l.city).filter(Boolean))];
  const props = [...new Set(appData.vacant.locations.map(l=>l.propertyName).filter(Boolean))];
  const renderList = (city, prop) => {
    let list = appData.vacant.locations;
    if (city) list = list.filter(l=>l.city===city);
    if (prop) list = list.filter(l=>l.propertyName===prop);
    // إزالة التكرار: إن تطابق العنوان والمدينة واسم العقار والرابط تمامًا، يُعرض إدخال واحد فقط
    const seenPickKeys = new Set();
    list = list.filter(l => {
      const key = [l.title||'', l.city||'', l.propertyName||'', l.mapLink||''].join('|');
      if (seenPickKeys.has(key)) return false;
      seenPickKeys.add(key);
      return true;
    });
    if (!list.length) return '<div style="padding:10px;color:var(--text-muted);">لا توجد مواقع مطابقة</div>';
    return list.map(l => `<div class="vac-loc-pick-item" data-link="${(l.mapLink||'').replace(/"/g,'&quot;')}" style="padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:pointer;text-align:right;">
      <strong>${l.title||'بدون عنوان'}</strong><br><small>${l.city||''}${l.propertyName?(' — '+l.propertyName):''}</small>
    </div>`).join('');
  };
  Swal.fire({
    title: 'اختر موقعاً من مواقع تهمك', width: 500,
    html: `<div style="text-align:right;direction:rtl;">
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <select class="swal2-input" id="vlp-city" style="margin:0;"><option value="">كل المدن</option>${cities.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
        <select class="swal2-input" id="vlp-prop" style="margin:0;"><option value="">كل العقارات</option>${props.map(pr=>`<option value="${pr}">${pr}</option>`).join('')}</select>
      </div>
      <div id="vlp-list" style="max-height:300px;overflow:auto;">${renderList('', '')}</div>
    </div>`,
    showCancelButton: true, showConfirmButton: false, cancelButtonText: 'إغلاق',
    didOpen: () => {
      const listEl = document.getElementById('vlp-list');
      const bind = () => {
        listEl.querySelectorAll('.vac-loc-pick-item').forEach(it => {
          it.onclick = () => {
            const link = it.getAttribute('data-link');
            const target = document.getElementById(p+'-mapLink');
            if (target) target.value = link;
            Swal.close();
          };
        });
      };
      bind();
      document.getElementById('vlp-city').onchange = document.getElementById('vlp-prop').onchange = () => {
        const city = document.getElementById('vlp-city').value;
        const prop = document.getElementById('vlp-prop').value;
        listEl.innerHTML = renderList(city, prop);
        bind();
      };
    }
  });
}
function addVacLocation() {
  Swal.fire({
    title: 'إضافة موقع',
    html: `<div style="text-align:right;direction:rtl;">
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">العنوان</label><input class="swal2-input" id="vl-title" style="direction:rtl;"></div>
      
al2-input" id="vl-city" style="direction:rtl;"></div>
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">المدينة</label><input class="swal2-input" id="vl-city" style="direction:rtl;"></div>
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">اسم العقار</label><input class="swal2-input" id="vl-property" style="direction:rtl;"></div>
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">رابط الخريطة</label><input class="swal2-input" id="vl-map" style="direction:rtl;"></div>
    </div>`,
    showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137',
    preConfirm: () => ({
      title: document.getElementById('vl-title').value.trim(),
      city: document.getElementById('vl-city').value.trim(),
      propertyName: document.getElementById('vl-property').value.trim(),
      mapLink: document.getElementById('vl-map').value.trim(),
      notes: document.getElementById('vl-notes').value.trim()
    })
  }).then(r => {
    if (r.isConfirmed) {
      ensureVacantData();
      const newLoc = { id: uid(), ...r.value, createdAt: new Date().toISOString() };
      appData.vacant.locations.push(newLoc);
      rememberVacantValue(appData.vacant.cityMemory, r.value.city);
      rememberVacantValue(appData.vacant.propertyMemory, r.value.propertyName);
      logVacDraft('إضافة موقع', `${r.value.title || 'بدون عنوان'} - ${r.value.city || ''}`, null, newLoc);
      save(); showToast('تمت إضافة الموقع', 'success'); renderVacLocations();
    }
  });
}
function editVacLocation(id) {
  const l = appData.vacant.locations.find(x=>x.id===id); if (!l) return;
  Swal.fire({
    title: 'تعديل الموقع',
    html: `<div style="text-align:right;direction:rtl;">
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">العنوان</label><input class="swal2-input" id="vl-title" value="${l.title||''}" style="direction:rtl;"></div>
<div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">المدينة</label><input class="swal2-input" id="vl-city" value="${l.city||''}" style="direction:rtl;"></div>
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">اسم العقار</label><input class="swal2-input" id="vl-property" value="${l.propertyName||''}" style="direction:rtl;"></div>
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">رابط الخريطة</label><input class="swal2-input" id="vl-map" value="${l.mapLink||''}" style="direction:rtl;"></div>
      <div style="margin-bottom:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">ملاحظات</label><input class="swal2-input" id="vl-notes" value="${l.notes||''}" style="direction:rtl;"></div>
    </div>`,
    showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء', confirmButtonColor: '#0d2137',
    preConfirm: () => ({
      title: document.getElementById('vl-title').value.trim(),
      city: document.getElementById('vl-city').value.trim(),
      propertyName: document.getElementById('vl-property').value.trim(),
      mapLink: document.getElementById('vl-map').value.trim(),
      notes: document.getElementById('vl-notes').value.trim()
    })
  }).then(r => {
    if (r.isConfirmed) {
      const before = JSON.parse(JSON.stringify(l));
      Object.assign(l, r.value);
      logVacDraft('تعديل موقع', `${l.title || 'بدون عنوان'} - ${l.city || ''}`, before, l);
      save(); showToast('تم التحديث', 'success'); renderVacLocations();
    }
  });
}
function deleteVacLocation(id) {
  const l = appData.vacant.locations.find(x=>x.id===id);
  appData.vacant.locations = appData.vacant.locations.filter(x=>x.id!==id);
  markDeleted('vacantLocations', id, 'manual');
  if (l) logVacDraft('حذف موقع', `${l.title || 'بدون عنوان'} - ${l.city || ''}`, l, null);
  save(); showToast('تم الحذف', 'success'); renderVacLocations();
}
async function dedupeVacLocations() {
  if (!currentUser || currentUser.role !== 'مدير') { showToast('هذا الإجراء متاح للمدير فقط', 'error'); return; }
  ensureVacantData();
  const seenKeys = new Set();
  const kept = [];
  const removed = [];
  appData.vacant.locations.forEach(l => {
    const key = [l.title||'', l.city||'', l.propertyName||'', l.mapLink||''].join('|');
    if (seenKeys.has(key)) removed.push(l);
    else { seenKeys.add(key); kept.push(l); }
  });
  if (!removed.length) { showToast('لا توجد تكرارات لحذفها', 'success'); return; }
  const r = await Swal.fire({
    title: 'حذف التكرارات', text: `سيتم حذف ${removed.length} موقع مكرر (نفس العنوان والمدينة واسم العقار والرابط). هل تريد المتابعة؟`,
    icon: 'warning', showCancelButton: true, confirmButtonText: 'حذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444'
  });
  if (!r.isConfirmed) return;
  appData.vacant.locations = kept;
  removed.forEach(l => { markDeleted('vacantLocations', l.id, 'duplicate'); logVacDraft('حذف موقع', `${l.title || 'بدون عنوان'} - ${l.city || ''} (تكرار)`, l, null); });
  save(); showToast(`تم حذف ${removed.length} موقع مكرر`, 'success'); renderVacLocations();
}

function renderVacDraft() {
  ensureVacantData();
  if (!appData.vacant.log) appData.vacant.log = [];
  const container = document.getElementById('vacLogContainer');
  const empty = document.getElementById('vacLogEmpty');
  const isAdmin = !!(currentUser && currentUser.role === 'مدير');
  const clearBtn = document.getElementById('btnClearVacLog');
  if (clearBtn) clearBtn.style.display = isAdmin ? '' : 'none';
  const typeFilter = document.getElementById('vacLogTypeFilter')?.value || '';
  let logList = appData.vacant.log;
  if (typeFilter) logList = logList.filter(e => e.action === typeFilter);
  if (!logList.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const icons = { 'إضافة وحدة':'fas fa-plus-circle', 'تعديل وحدة':'fas fa-edit', 'حذف وحدة':'fas fa-trash', 'حجز وحدة':'fas fa-lock', 'فك حجز وحدة':'fas fa-lock-open', 'تأجير وحدة':'fas fa-house-user', 'نقل وحدة إلى المتاحة':'fas fa-right-left', 'إضافة موقع':'fas fa-map-pin', 'تعديل موقع':'fas fa-map-pin', 'حذف موقع':'fas fa-map-pin' };
  const colors = { 'إضافة وحدة':'var(--success)', 'تعديل وحدة':'var(--info)', 'حذف وحدة':'var(--danger)', 'حجز وحدة':'var(--warning)', 'فك حجز وحدة':'var(--info)', 'تأجير وحدة':'var(--gold)', 'نقل وحدة إلى المتاحة':'var(--success)', 'إضافة موقع':'var(--success)', 'تعديل موقع':'var(--info)', 'حذف موقع':'var(--danger)' };
  container.innerHTML = [...logList].reverse().map(e => `
    <div onclick='showLogDiff(${JSON.stringify(e).replace(/'/g,"&#39;")})' style="cursor:pointer;display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);border-right:4px solid ${colors[e.action]||'var(--gold)'};">
      <i class="${icons[e.action]||'fas fa-circle-info'}" style="color:${colors[e.action]||'var(--gold)'};margin-top:2px;font-size:15px;flex-shrink:0;"></i>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:var(--text);">${e.action}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${e.details}</div>
        <div style="font-size:11px;color:var(--gold);margin-top:2px;"><i class="fas fa-user"></i> ${e.user||'غير معروف'}</div>
      </div>
      <div style="font-size:11px;color:var(--text-light);white-space:nowrap;">${e.ts}</div>
      ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteVacLogEntry('${e.id}')" title="حذف هذا السجل"><i class="fas fa-trash"></i></button>` : ''}
    </div>`).join('');
}
async function deleteVacLogEntry(id) {
  if (!currentUser || currentUser.role !== 'مدير') {
    showToast('هذا الإجراء متاح فقط للمدير', 'error');
    return;
  }
  const r = await Swal.fire({ title:'حذف السجل', text:'هل تريد حذف هذا السجل؟', icon:'warning', showCancelButton:true, confirmButtonText:'حذف', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' });
  if (!r.isConfirmed) return;
  if (typeof VacLogCollectionService === 'undefined' || typeof VacLogCollectionService.remove !== 'function') {
    showToast('تعذر حذف السجل من الخادم', 'error');
    return;
  }
  // ننتظر نجاح الحذف الفعلي في Firestore أولاً، ولا نُحدّث appData أو نعيد
  // رسم الواجهة إلا بعد التأكد من نجاح العملية على الخادم
  try {
    await VacLogCollectionService.remove(id);
  } catch (e) {
    console.error('تعذر حذف السجل من الخادم:', e);
    showToast('تعذر حذف السجل من الخادم', 'error');
    return;
  }
  ensureVacantData();
  if (!appData.vacant.log) appData.vacant.log = [];
  const idx = appData.vacant.log.findIndex(e => e.id === id);
  if (idx !== -1) appData.vacant.log.splice(idx, 1);
  renderVacDraft();
  showToast('تم حذف السجل', 'success');
}
function clearVacLog() {
  if (!currentUser || currentUser.role !== 'مدير') {
    showToast('هذا الإجراء متاح فقط للمدير', 'error');
    return;
  }
  Swal.fire({ title:'مسح السجل', text:'هل تريد حذف جميع سجلات الأحداث؟', icon:'warning', showCancelButton:true, confirmButtonText:'نعم، امسح', cancelButtonText:'إلغاء', confirmButtonColor:'#ef4444' }).then(r => {
    if (r.isConfirmed) {
      ensureVacantData();
      appData.vacant.log = [];
      renderVacDraft();
      if (typeof VacLogCollectionService !== 'undefined') {
        VacLogCollectionService.clearAll()
          .then(() => showToast('تم مسح السجل', 'success'))
          .catch(() => showToast('تعذر مسح السجل من الخادم', 'error'));
      } else {
        save(); showToast('تم مسح السجل', 'success');
      }
    }
  });
}
function stripHeavyLogFields(obj) {
  if (!obj) return null;
  const clone = JSON.parse(JSON.stringify(obj));
  delete clone.media;
  return clone;
}
function logVacDraft(action, details, before, after) {
  ensureVacantData();
  if (!appData.vacant.log) appData.vacant.log = [];
  const entry = {
    id: uid(), action, details,
    before: stripHeavyLogFields(before),
    after: stripHeavyLogFields(after),
    user: currentUser ? currentUser.name : 'غير معروف',
    ts: new Date().toLocaleString('ar-SA')
  };
  appData.vacant.log.push(entry); // تحديث فوري للشاشة الحالية
  if (appData.vacant.log.length > 200) appData.vacant.log.shift();
  // حفظ في Collection مستقلة (vacLog) — يصل فورًا لبقية المستخدمين عبر onSnapshot
  // دون أي تعارض مع save() الكامل للمستند الرئيسي
  if (typeof VacLogCollectionService !== 'undefined') {
    VacLogCollectionService.add(entry).then(saved => {
      // نستبدل المعرّف المؤقت المحلي (uid) بالمعرّف الحقيقي لمستند Firestore
      // فور نجاح الحفظ، حتى يعمل زر "حذف" الفردي لاحقًا على المستند الصحيح
      // فعليًا بدلاً من محاولة حذف معرّف غير موجود في القاعدة.
      if (saved && saved.id) {
        entry.id = saved.id;
        if (currentPage === 'vac-draft') renderVacDraft();
      }
    }).catch(e => console.error('تعذر حفظ سجل المسودة:', e));
  }
}
const AR_FIELD_LABELS = {
  city:'المدينة', propertyName:'اسم العقار', futureDate:'تاريخ الإتاحة المستقبلي', unitType:'نوع الوحدة',
  floor:'الطابق', aptNo:'رقم الشقة', receiptDate:'تاريخ استلام الوحدة', price:'السعر', deed:'الصك', specs:'المواصفات', mapLink:'رابط الخريطة',
  notes:'ملاحظات', status:'الحالة', reserveDate:'تاريخ الحجز', rentDate:'تاريخ التأجير',
  createdAt:'تاريخ الإنشاء', updatedAt:'تاريخ آخر تعديل', title:'العنوان',
  currentPrice:'السعر الحالي', suggestedPrice:'السعر المقترح', tenantName:'اسم المستأجر',
  agentName:'اسم المسوق', contents:'محتويات الشقة', contractStart:'بداية العقد', contractEnd:'نهاية العقد', payments:'عدد الدفعات',
  clientType:'نوع العميل'
};
function renderLogStateBlock(obj) {
  if (!obj) return '<div style="color:var(--text-muted);font-size:12px;padding:8px;">لا يوجد</div>';
  const skip = ['id','media'];
  const rows = Object.keys(obj).filter(k => !skip.includes(k) && obj[k] !== undefined && obj[k] !== '');
  if (!rows.length) return '<div style="color:var(--text-muted);font-size:12px;padding:8px;">لا توجد بيانات</div>';
  return '<table style="width:100%;font-size:12px;border-collapse:collapse;">' + rows.map(k => `
    <tr><td style="padding:4px 8px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap;">${AR_FIELD_LABELS[k]||k}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--border);">${obj[k]}</td></tr>`).join('') + '</table>';
}
function showLogDiff(entry) {
  Swal.fire({
    title: entry.action, width: 650,
    html: `<div style="text-align:right;direction:rtl;">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${entry.ts} — ${entry.details}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><div style="font-weight:700;margin-bottom:6px;color:var(--danger);">قبل</div>${renderLogStateBlock(entry.before)}</div>
        <div><div style="font-weight:700;margin-bottom:6px;color:var(--success);">بعد</div>${renderLogStateBlock(entry.after)}</div>
      </div>
    </div>`,
    confirmButtonText: 'إغلاق', confirmButtonColor: '#0d2137'
  });
}
function switchEntryTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('entry-agent').style.display = tab === 'agent' ? 'block' : 'none';
  document.getElementById('entry-contract').style.display = tab === 'contract' ? 'block' : 'none';
  if (tab === 'contract') populateContractSelects();
  if (tab === 'agent') renderAgentsGrid();
}
function renderEntryPage() {
  renderAgentsGrid();
  populateContractSelects();
}
function renderAgentsGrid() {
  const grid = document.getElementById('agentsGrid');
  if (!appData.agents.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-user-slash"></i><h3>لا يوجد مسوقون</h3><p>أضف مسوقاً أولاً</p></div>';
    return;
  }
  grid.innerHTML = appData.agents.map(a => {
    let rent = 0, comm = 0, count = 0;
    MONTH_KEYS.forEach(mk => {
      (a.months?.[mk]?.contracts || []).forEach(c => {
        rent += Number(c.rentAmount)||0; comm += Number(c.commissionAmount)||0; count++;
      });
    });
    return `<div class="agent-card" onclick="selectAgentForContract('${a.id}')">
      <div class="agent-avatar"><i class="fas fa-user-tie"></i></div>
      <div class="agent-name">${a.name}</div>
      <div style="font-size:11px;color:var(--text-muted);">أُنشئ: ${fmtDate(a.createdAt)}</div>
      <div class="agent-stats">
        <div class="agent-stat"><div class="agent-stat-val">${count}</div><div class="agent-stat-lbl">عقد</div></div>
        <div class="agent-stat"><div class="agent-stat-val" style="font-size:13px;">${fmt(rent)}</div><div class="agent-stat-lbl">إيجار</div></div>
        <div class="agent-stat"><div class="agent-stat-val" style="font-size:13px;">${fmt(comm)}</div><div class="agent-stat-lbl">سعي</div></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="event.stopPropagation();editAgent('${a.id}')"><i class="fas fa-edit"></i> تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteAgent('${a.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}
function addAgent() {
  const name = document.getElementById('agentNameInput').value.trim();
  if (!name) { showToast('يرجى إدخال اسم المسوق', 'error'); return; }
  if (appData.agents.find(a => a.name === name)) { showToast('هذا المسوق موجود بالفعل', 'error'); return; }
  const agent = { id: uid(), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), months: {} };
  MONTH_KEYS.forEach(mk => { agent.months[mk] = { contracts: [] }; });
  AgentsRepository.add(agent);
  document.getElementById('agentNameInput').value = '';
  renderAgentsGrid();
  showToast(`تم إضافة المسوق: ${name}`, 'success');
  // تحديث قائمة المسوقين في إدارة الوحدات إن كانت الصفحة مفتوحة
  const umAgentList = document.getElementById('umAgentList');
  if (umAgentList) umAgentList.innerHTML = appData.agents.map(a => `<option value="${a.name}">`).join('');
  const euAgentList = document.getElementById('euAgentList');
  if (euAgentList) euAgentList.innerHTML = appData.agents.map(a => `<option value="${a.name}">`).join('');
}
function editAgent(id) {
  const agent = appData.agents.find(a => a.id === id);
  if (!agent) return;
  Swal.fire({
    title: 'تعديل اسم المسوق',
    input: 'text', inputValue: agent.name,
    confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء',
    showCancelButton: true,
    confirmButtonColor: '#0d2137',
    inputValidator: v => !v.trim() ? 'يرجى إدخال الاسم' : null
  }).then(r => {
    if (r.isConfirmed && r.value.trim()) {
      if (appData.agents.find(a => a.name === r.value.trim() && a.id !== id)) {
        showToast('هذا الاسم موجود بالفعل', 'error'); return;
      }
      const newName = r.value.trim();
      agent.name = newName;
      if (typeof AgentsRepository !== 'undefined' && AgentsRepository._usingCollection) {
        AgentsCollectionService.updateWithFn(id, () => ({ name: newName }));
      } else {
        save();
      }
      renderAgentsGrid();
      showToast('تم تعديل الاسم', 'success');
    }
  });
}
function deleteAgent(id) {
  const agent = appData.agents.find(a => a.id === id);
  if (!agent) return;
  Swal.fire({
    title: 'حذف المسوق', text: `هل تريد حذف "${agent.name}" وجميع عقوده؟`,
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء',
    confirmButtonColor: '#ef4444'
  }).then(r => {
    if (r.isConfirmed) {
      AgentsRepository.remove(id);
      renderAgentsGrid();
      showToast(`تم حذف ${agent.name}`, 'success');
    }
  });
}
function ensureAgentsData() {
  if (!appData.agents) appData.agents = [];
}
