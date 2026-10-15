// ===== المزامنة اللحظية بين جميع المستخدمين =====
// الأصل: استماع لحظي فعلي عبر FirebaseStorageService.subscribe() (Firestore onSnapshot) —
// أي تعديل يصل فورًا لكل المستخدمين المفتوح عندهم الموقع، دون انتظار دورة استعلام،
// وبغض النظر عن إغلاق جهاز من قام بالتعديل بعد نجاح الحفظ.
// الاستعلام الدوري أدناه يبقى فقط كحل احتياطي تلقائي في حال لم تتوفر subscribe() بعد في firebase-init.js.
let liveSyncTimer = null;
let _liveUnsubscribe = null;
let _agentContractsLiveUnsubscribe = null;
const LIVE_SYNC_INTERVAL_ACTIVE = 4000;   // 4 ثوانٍ عند النشاط (وضع الاحتياط فقط)
const LIVE_SYNC_INTERVAL_IDLE   = 20000;  // 20 ثانية عند عدم الرؤية أو لا يوجد مستخدمون آخرون (وضع الاحتياط فقط)
let _liveSyncCurrentInterval = LIVE_SYNC_INTERVAL_ACTIVE;

function getAdaptiveInterval() {
  // إذا الصفحة غير ظاهرة → بطيء
  if (document.visibilityState === 'hidden') return LIVE_SYNC_INTERVAL_IDLE;
  // إذا لا يوجد مستخدمون آخرون متصلون → بطيءconst online = (appData.users && appData.users.online) || {};
  const otherUsers = Object.keys(online).filter(name => {
    const e = _getOnlineEntry(online[name]);
    return name !== (currentUser && currentUser.username) && e && (Date.now() - e.ts < 90000);
  });
  if (!otherUsers.length) return LIVE_SYNC_INTERVAL_IDLE;
  return LIVE_SYNC_INTERVAL_ACTIVE;
}

function scheduleNextSync() {
  if (liveSyncTimer) clearTimeout(liveSyncTimer);
  const interval = getAdaptiveInterval();
  _liveSyncCurrentInterval = interval;
  liveSyncTimer = setTimeout(async () => {
    await pullLiveUpdates();
    scheduleNextSync();
  }, interval);
}

// تُستدعى من الاستماع اللحظي (subscribe) عند وصول تحديث فوري من Firestore،
// أو من pullLiveUpdates عند وضع الاحتياط الدوري
function applyRemoteUpdate(fresh) {
  const __tid = window.__TRACE_CONTRACT_ID;
  const __ltid = window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID') || null; // تتبع سجل مسودة العقود (contracts.log) تحديدًا
  if (__tid) console.log('[TRACE 3] applyRemoteUpdate استُدعيت | savePending =', savePending, '| currentPage =', currentPage, '| fresh موجودة =', !!(fresh && typeof fresh === 'object'));
  if (__ltid) {
    console.log('[TRACE-LOG 4] دخول applyRemoteUpdate | savePending =', savePending,
      '| ID موجود في fresh.contracts.log؟', (fresh?.contracts?.log || []).some(l => l.id === __ltid),
      '| Tombstone موجود في fresh.deleted.logEntries.contracts؟', !!(fresh?.deleted?.logEntries?.contracts?.[__ltid]));
  }
  if (!fresh || typeof fresh !== 'object') { if (__tid) console.log('[TRACE 3] توقفت: fresh غير صالحة'); if (__ltid) console.log('[TRACE-LOG 4] توقفت: fresh غير صالحة'); return; }
  if (savePending > 0) { if (__tid) console.log('[TRACE 3] توقفت: savePending > 0 — لن تُنفَّذ mergeAppData'); if (__ltid) console.log('[TRACE-LOG 4] توقفت: savePending > 0'); return; } // يوجد حفظ جارٍ حاليًا، لا نستبدل فوقه
  if (document.querySelector('.swal2-container')) { if (__tid) console.log('[TRACE 3] توقفت: نافذة swal2 مفتوحة'); if (__ltid) console.log('[TRACE-LOG 4] توقفت: نافذة swal2 مفتوحة'); return; } // نافذة تعديل/إدخال مفتوحة
  if (LIVE_SYNC_EXCLUDED_PAGES.includes(currentPage)) { if (__tid) console.log('[TRACE 3] توقفت: currentPage ضمن LIVE_SYNC_EXCLUDED_PAGES'); if (__ltid) console.log('[TRACE-LOG 4] توقفت: currentPage ضمن LIVE_SYNC_EXCLUDED_PAGES'); return; } // لا نحدّث أثناء تعبئة نموذج إدخال جديد
  if (__tid) {
    console.log('[TRACE 3] لم تتوقف — ستُنفَّذ mergeAppData الآن');
    console.log('[TRACE 3] appData.collection.contracts (قبل mergeAppData):', JSON.parse(JSON.stringify(__traceFindContract((appData.collection||{}).contracts, __tid) || null)));
  }
  if (__ltid) {
    console.log('[TRACE-LOG 4] appData (المحلي) قبل mergeAppData | ID موجود في appData.contracts.log؟',
      (appData?.contracts?.log || []).some(l => l.id === __ltid),
      '| Tombstone محلي موجود؟', !!(appData?.deleted?.logEntries?.contracts?.[__ltid]));
  }
  const merged = mergeAppData(fresh, appData);
  if (__tid) console.log('[TRACE 3] appData.collection.contracts (بعد mergeAppData، قبل الإسناد النهائي):', JSON.parse(JSON.stringify(__traceFindContract((merged.collection||{}).contracts, __tid) || null)));
  if (__ltid) {
    console.log('[TRACE-LOG 5] بعد mergeAppData(fresh, appData) | ID موجود في merged.contracts.log؟',
      (merged?.contracts?.log || []).some(l => l.id === __ltid),
      '| Tombstone موجود في merged.deleted.logEntries.contracts؟', !!(merged?.deleted?.logEntries?.contracts?.[__ltid]));
  }
  const newFingerprint = computeDataFingerprint(merged);
  const changed = (newFingerprint !== _lastDataFingerprint);
  appData = merged;
  {
    const __tid = window.__TRACE_CONTRACT_ID;
    if (__tid) console.log('[TRACE 5] appData.collection.contracts النهائية بعد applyRemoteUpdate بالكامل:', JSON.parse(JSON.stringify(__traceFindContract((appData.collection||{}).contracts, __tid) || null)), '| changed =', changed);
    const __ltid2 = window.__TRACE_TEST_ID || sessionStorage.getItem('__TRACE_TEST_ID') || null;
    if (__ltid2) {
      console.log('[TRACE-LOG 5-final] appData النهائية بعد الإسناد | ID موجود في contracts.log؟',
        (appData?.contracts?.log || []).some(l => l.id === __ltid2),
        '| Tombstone موجود؟', !!(appData?.deleted?.logEntries?.contracts?.[__ltid2]), '| changed =', changed);
    }
  }
  if (changed) {
    _lastDataFingerprint = newFingerprint;
    if (currentPage) { try { showPage(currentPage, true, true); } catch(e) {} }
  }
  updateOnlineAvatars();
}
let _vacLogUnsubscribe = null;
let _unitsLogUnsubscribe = null;
let _contractsLogUnsubscribe = null;
function startLiveSync() {
  startIdleWatcher(); // بدء مراقبة الخمول عند كل بدء جلسة (دخول جديد أو استرجاع جلسة محفوظة)
  stopLiveSync();
  const realtimeFn = (typeof FirebaseStorageService !== 'undefined')
    ? (FirebaseStorageService.subscribe || FirebaseStorageService.onRealtimeUpdate)
    : null;
  if (typeof realtimeFn === 'function') {
    // وضع الاستماع اللحظي الفعلي — الأفضلية دائمًا له
    try {
      _liveUnsubscribe = realtimeFn.call(FirebaseStorageService, applyRemoteUpdate);
    } catch (e) {
      scheduleNextSync(); // فشل تفعيل الاستماع اللحظي، رجوع مؤقت للاستعلام الدوري
    }
  } else {
    // لا توجد دالة استماع لحظي في firebase-init.js — نعمل بوضع الاحتياط الدوري
    scheduleNextSync();
  }
  // استماع لحظي مستقل لسجل مسودة الفوارغ (vacLog Collection)
  if (typeof VacLogCollectionService !== 'undefined') {
    if (_vacLogUnsubscribe) { try { _vacLogUnsubscribe(); } catch(e) {} }
    _vacLogUnsubscribe = VacLogCollectionService.onRealtimeUpdate((entries) => {
      if (!appData.vacant) appData.vacant = {};
      appData.vacant.log = entries;
      if (currentPage === 'vac-draft') renderVacDraft();
    });
  }
  // استماع لحظي مستقل لسجل الوحدات (unitsLog Collection)
  if (typeof UnitsLogCollectionService !== 'undefined') {
    if (_unitsLogUnsubscribe) { try { _unitsLogUnsubscribe(); } catch(e) {} }
    _unitsLogUnsubscribe = UnitsLogCollectionService.onRealtimeUpdate((entries) => {
      ensureUnitsData();
      appData.units.log = entries;
      if (currentPage === 'units-log') renderUnitsLog();
    });
  }
  // استماع لحظي مستقل لسجل مسودة العقود (contractsLog Collection)
  if (typeof ContractsLogCollectionService !== 'undefined') {
    if (_contractsLogUnsubscribe) { try { _contractsLogUnsubscribe(); } catch(e) {} }
    _contractsLogUnsubscribe = ContractsLogCollectionService.onRealtimeUpdate((entries) => {
      ensureContractsData();
      appData.contracts.log = entries;
      if (currentPage === 'contracts-draft') renderContractsDraft();
    });
  }
  // استماع لحظي واحد على مستوى النظام بالكامل لعقود كل المسوّقين (collectionGroup)
  // — يغذّي الداشبورد/التقارير بآخر تحديث فقط، دون أي حاجة لزيارة كل مسوّق يدويًا،
  // ودون أي طلب متكرر عند تسجيل الدخول أو تحديث الصفحة (راجع startAgentContractsLiveSync).
  startAgentContractsLiveSync();
  // إعادة الجدولة عند تغيّر رؤية الصفحة (وضع الاحتياط فقط)
  document.addEventListener('visibilitychange', _onVisibilityChange);
}
// ============================================================
// ===== مزامنة لحظية موحّدة لعقود كل المسوّقين (Dashboard/التقارير) =====
// ============================================================
// بديل عن الاعتماد على agent.months (كانت تُحدَّث فقط عند فتح شاشة مسوّق
// معيّن يدويًا). الآن: استعلام لحظي واحد يغطي عقود كل المسوّقين، فيُعاد بناء
// agent.months محليًا من الحقيقة القادمة من Firestore في كل مرة يحدث فيها
// تغيير فعلي فقط (إضافة/تعديل/حذف عقد واحد لأي مسوّق) — الداشبورد يبقى
// ثابتًا تمامًا بين التحديثات، ولا يُعاد جلب أي بيانات إضافية عند كل
// تسجيل دخول أو تحديث صفحة (يُقرأ أولًا من كاش Offline Persistence فورًا
// إن وُجد، ثم يتزامن بهدوء دون أي كتلة قراءة كبيرة).
function applyLiveAgentContractsSnapshot(items) {
  const byAgent = {};
  items.forEach(c => {
    if (!c || !c.agentId || !c.monthKey) return;
    if (!byAgent[c.agentId]) byAgent[c.agentId] = {};
    if (!byAgent[c.agentId][c.monthKey]) byAgent[c.agentId][c.monthKey] = { contracts: [] };
    byAgent[c.agentId][c.monthKey].contracts.push(c);
  });
  appData.agents.forEach(a => { a.months = byAgent[a.id] || {}; });
  if (typeof __agentContractsLoaded !== 'undefined') __agentContractsLoaded.clear();
  // إعادة رسم الشاشة المعروضة فعليًا حاليًا فقط (الداشبورد أو جدول البيانات
  // أو التقرير الشامل) — لا داعي لإعادة رسم أي شاشة أخرى غير مفتوحة أمام
  // المستخدم؛ ستقرأ تلقائيًا آخر بيانات عند فتحها لاحقًا لأن agent.months
  // محدَّثة دائمًا في appData بغض النظر عن الشاشة المعروضة.
  try {
    if (currentPage === 'dashboard' && document.getElementById('dashStats')) renderDashboard();
    else if (currentPage === 'data') renderDataTable();
    else if (currentPage === 'report-all') renderReportAll();
  } catch (e) { console.error('[applyLiveAgentContractsSnapshot] فشل تحديث الشاشة الحالية:', e); }
}
function startAgentContractsLiveSync() {
  if (typeof AgentContractsService === 'undefined' || typeof AgentContractsService.onRealtimeUpdateAll !== 'function') return;
  if (_agentContractsLiveUnsubscribe) return; // مُفعّل مسبقًا، لا داعي لفتح اشتراك ثانٍ
  _agentContractsLiveUnsubscribe = AgentContractsService.onRealtimeUpdateAll(applyLiveAgentContractsSnapshot);
}
function stopAgentContractsLiveSync() {
  if (_agentContractsLiveUnsubscribe) { try { _agentContractsLiveUnsubscribe(); } catch (e) {} _agentContractsLiveUnsubscribe = null; }
}
function _onVisibilityChange() {
  if (_liveUnsubscribe) return; // في وضع الاستماع اللحظي الفعلي لا حاجة لأي تدخل يدوي
  // وضع الاحتياط: عند العودة للصفحة: استدعاء فوري ثم إعادة الجدولة بالفاصل المناسب
  if (document.visibilityState === 'visible') {
    if (liveSyncTimer) { clearTimeout(liveSyncTimer); clearInterval(liveSyncTimer); }
    pullLiveUpdates().then(() => scheduleNextSync());
  }
}
function stopLiveSync() {
  if (liveSyncTimer) { clearTimeout(liveSyncTimer); clearInterval(liveSyncTimer); }
  liveSyncTimer = null;
  if (_liveUnsubscribe) { try { _liveUnsubscribe(); } catch(e) {} _liveUnsubscribe = null; }
  if (_vacLogUnsubscribe) { try { _vacLogUnsubscribe(); } catch(e) {} _vacLogUnsubscribe = null; }
  if (_contractsLogUnsubscribe) { try { _contractsLogUnsubscribe(); } catch(e) {} _contractsLogUnsubscribe = null; }
  stopAgentContractsLiveSync();
  document.removeEventListener('visibilitychange', _onVisibilityChange);
}
const LIVE_SYNC_EXCLUDED_PAGES = ['entry', 'vac-entry', 'units-entry', 'emp-entry', 'maint-new', 'users-entry', 'col-new-contract'];

// ===== بصمة البيانات — تخطي إعادة الرسم لو لم يتغيّر شيء =====
let _lastDataFingerprint = '';
function computeDataFingerprint(data) {
  try {
    // نستثني كائن online لأنه يتغيّر كل heartbeat ولا يستوجب إعادة رسم
    const { users, ...rest } = data || {};
    const usersWithoutOnline = users ? { list: users.list, permissions: users.permissions } : {};
    return JSON.stringify({ ...rest, users: usersWithoutOnline });
  } catch(e) { return ''; }
}

async function pullLiveUpdates() {
  if (!currentUser) return;
  try {
    const fresh = await StorageService.load();
    applyRemoteUpdate(fresh);
  } catch (e) {
    // تعذر الجلب في هذه الدورة، ستُعاد المحاولة تلقائيًا
  }
}
// ===== تتبّع المستخدمين المتصلين الآن (يظهر فقط للمدير) =====
let presenceTimer = null;
let _presenceUnsubscribe = null;
function startPresenceHeartbeat() {
  if (presenceTimer) clearInterval(presenceTimer);
  sendPresenceHeartbeat();
  presenceTimer = setInterval(sendPresenceHeartbeat, 60000);
  if (typeof PresenceService !== 'undefined') {
    if (_presenceUnsubscribe) { try { _presenceUnsubscribe(); } catch(e) {} }
    _presenceUnsubscribe = PresenceService.onRealtimeUpdate((online) => {
      if (!appData.users) appData.users = {};
      appData.users.online = online;
      if (currentUser && currentUser.role === 'مدير') updateOnlineAvatars();
    });
  }
}
async function sendPresenceHeartbeat() {
  if (!currentUser) return;
  // تحديد القسم الحالي من currentPage
  const sectionKey = currentPage ? currentPage.split('-')[0] : 'dashboard';
  const sectionLabel = NAV_SECTION_LABEL_MAP[sectionKey] || pageTitles[currentPage] || currentPage || '';
  if (typeof PresenceService !== 'undefined') {
    // كتابة صغيرة جدًا (merge) بلا أي قراءة/كتابة لكامل المستند الرئيسي
    PresenceService.heartbeat(currentUser.username, sectionLabel).catch(e => {
      // تعذر الاتصال بالسيرفر: لا مشكلة، ستُعاد المحاولة في النبضة القادمة
    });
  }
}
// دوائر المستخدمين المتصلين الآن (تظهر للمدراء فقط) — تمرير الماوس فوق الدائرة يظهر الاسم + القسم الحالي
function _getOnlineEntry(entry) {
  // يدعم الصيغتين: رقم timestamp قديم، أو كائن { ts, section }
  if (!entry) return null;
  if (typeof entry === 'number') return { ts: entry, section: '' };
  if (typeof entry === 'object' && entry.ts) return entry;
  return null;
}
function updateOnlineAvatars() {
  const avatarsEl = document.getElementById('onlineAvatarsBar');
  if (!avatarsEl) return;
  if (!currentUser || currentUser.role !== 'مدير') { avatarsEl.style.display = 'none'; return; }
  const online = (appData.users && appData.users.online) || {};
  const now = Date.now();
  const onlineNames = Object.keys(online).filter(name => {
    const e = _getOnlineEntry(online[name]);
    return e && (now - e.ts < PRESENCE_ONLINE_WINDOW);
  });
  if (!onlineNames.length) { avatarsEl.innerHTML = ''; avatarsEl.style.display = 'none'; return; }
  const users = (appData.users && appData.users.list) || [];
  avatarsEl.innerHTML = onlineNames.map(username => {
    const u = users.find(x => x.username === username);
    const fullName = u ? u.name : username;
    const initial = (fullName || '?').trim().charAt(0);
    const e = _getOnlineEntry(online[username]);
    const section = e && e.section ? e.section : '';
    const tooltipText = section ? `${fullName}\n📂 ${section}` : fullName;
    return `<div class="online-avatar-circle" title="${tooltipText}" data-username="${username}" data-section="${section}">${initial}</div>`;
  }).join('');
  avatarsEl.style.display = 'flex';
  // إضافة tooltip مُفصَّل عند hover
  avatarsEl.querySelectorAll('.online-avatar-circle').forEach(el => {
    el.addEventListener('mouseenter', function(ev) {
      const existingTip = document.getElementById('_presenceTip');
      if (existingTip) existingTip.remove();
      const tip = document.createElement('div');
      tip.id = '_presenceTip';
      const nm = this.dataset.username;
      const uu = users.find(x => x.username === nm);
      const name = uu ? uu.name : nm;
      const sec = this.dataset.section;
      tip.innerHTML = `<strong>${name}</strong>${sec ? `<br><span style="opacity:.8;font-size:12px;">📂 ${sec}</span>` : ''}`;
      tip.style.cssText = 'position:fixed;z-index:9999;background:#0d2137;color:#fff;padding:6px 12px;border-radius:8px;font-size:13px;line-height:1.6;box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;white-space:nowrap;';
      document.body.appendChild(tip);
      const rect = this.getBoundingClientRect();
      tip.style.top = (rect.bottom + 8) + 'px';
      tip.style.left = Math.max(8, rect.left + rect.width/2 - tip.offsetWidth/2) + 'px';
    });
    el.addEventListener('mouseleave', function() {
      const t = document.getElementById('_presenceTip');
      if (t) t.remove();
    });
  });
}
async function renderOnlineUsersStatus() {
  if (!currentUser || currentUser.role !== 'مدير') return;
  try {
    const fresh = await StorageService.load();
    appData.users.online = (fresh.users && fresh.users.online) || {};
  } catch(e) {}
  renderUsersList();
  updateOnlineAvatars();
}

