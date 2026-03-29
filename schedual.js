// ==========================================
//  StudyHub — schedual.js
//  일정관리 전용 스크립트
//  completion_percent 컬럼 포함
// ==========================================

// ── Supabase 클라이언트 ────────────────────
const SUPABASE_URL = 'https://cyqjgixdvlywkzyamerx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_casPdXLoUENk-a-oSC7RiQ_vmg9QmiR';

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${res.status} ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── 날짜 유틸 ──────────────────────────────
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const _pad = n => String(n).padStart(2, '0');

function toDateStr(d) { return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`; }
function isoToDateStr(iso) { if (!iso) return ''; return toDateStr(new Date(iso)); }
function parseDateStr(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); }
function toLocalISO(d) { return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`; }
function formatDateTime(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`; }
function escapeHtml(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isDone(item) { return item.s_end === true; }

function dDay(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const t = parseDateStr(dateStr);
  const diff = Math.round((t - now) / 86400000);
  if (diff === 0) return { text: 'D-Day', cls: 'dday-today' };
  if (diff > 0 && diff <= 3) return { text: `D-${diff}`, cls: 'dday-soon' };
  if (diff > 0) return { text: `D-${diff}`, cls: 'dday-normal' };
  return { text: `D+${Math.abs(diff)}`, cls: 'dday-past' };
}

function catClass(cat) {
  if (!cat) return 'cat-default';
  if (cat === '과제' || cat === '수행') return 'cat-과제';
  if (cat === '시험') return 'cat-시험';
  if (cat === '약속') return 'cat-약속';
  return 'cat-기타';
}

function catItemClass(cat) {
  if (!cat) return '';
  if (cat === '과제' || cat === '수행') return 'cat-과제-item';
  if (cat === '시험') return 'cat-시험-item';
  if (cat === '약속') return 'cat-약속-item';
  return 'cat-기타-item';
}

function progClass(pct) {
  if (!pct || pct === 0) return 'prog-0';
  if (pct < 30) return 'prog-low';
  if (pct < 70) return 'prog-mid';
  if (pct < 100) return 'prog-high';
  return 'prog-full';
}

function progColor(pct) {
  if (!pct || pct === 0) return 'var(--border2)';
  if (pct < 30) return 'var(--accent-red)';
  if (pct < 70) return 'var(--accent-yellow)';
  if (pct < 100) return 'var(--accent3)';
  return '#22c55e';
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}

// ── 전역 상태 ──────────────────────────────
let allData = [];       // 전체 로딩된 데이터
let filteredData = [];  // 필터 적용 후
let currentPeriod = 'today';
let currentDone = 'all';
let currentCats = new Set(['all']);
let currentSort = 'date-asc';
let searchQuery = '';
let viewMode = 'list';  // list | card
let currentDetailId = null;

// 통계 관련
let statsPeriod = 7;
let statsAllData = []; // 통계용 넓은 범위 데이터

// ── GNB ─────────────────────────────────────
function initGNB() {
  const gnb = document.getElementById('gnb');
  const hamburger = document.getElementById('hamburger');
  const menu = document.getElementById('gnbMenu');
  window.addEventListener('scroll', () => {
    gnb.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    menu.classList.toggle('open');
  });
  menu.querySelectorAll('.gnb-link').forEach(l => {
    l.addEventListener('click', () => {
      hamburger.classList.remove('open');
      menu.classList.remove('open');
    });
  });
}

// ── 페이지 날짜 ────────────────────────────
function initPageDate() {
  const now = new Date();
  document.getElementById('pageDate').textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

// ── 데이터 로딩 ────────────────────────────
async function loadData() {
  const now = new Date();
  let start, end;

  if (currentPeriod === 'today') {
    start = new Date(now); start.setHours(0,0,0,0);
    end   = new Date(now); end.setHours(23,59,59,999);
  } else if (currentPeriod === 'week') {
    const day = now.getDay();
    start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0,0,0,0);
    end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  } else if (currentPeriod === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
    end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
  } else {
    // 전체 — 최근 1년치
    start = new Date(now.getFullYear()-1, now.getMonth(), now.getDate(), 0,0,0,0);
    end   = new Date(now.getFullYear()+1, 11, 31, 23,59,59,999);
  }

  const data = await supabaseFetch(
    `schedule?s_date=gte.${toLocalISO(start)}&s_date=lte.${toLocalISO(end)}&order=s_date.asc&limit=1000`
  );
  allData = data || [];
}

// ── 필터 / 정렬 적용 ────────────────────────
function applyFilters() {
  let result = [...allData];

  // 카테고리 필터
  if (!currentCats.has('all') && currentCats.size > 0) {
    result = result.filter(item => {
      const cat = item.s_category || '';
      // '과제' 필터는 '수행'도 포함
      return [...currentCats].some(c => {
        if (c === '과제') return cat === '과제' || cat === '수행';
        return cat === c;
      });
    });
  }

  // 완료 상태 필터
  if (currentDone === 'done') result = result.filter(isDone);
  if (currentDone === 'undone') result = result.filter(i => !isDone(i));

  // 검색
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    result = result.filter(i =>
      (i.s_name || '').toLowerCase().includes(q) ||
      (i.s_content || '').toLowerCase().includes(q) ||
      (i.s_category || '').toLowerCase().includes(q)
    );
  }

  // 정렬
  if (currentSort === 'date-asc') result.sort((a,b) => new Date(a.s_date) - new Date(b.s_date));
  if (currentSort === 'date-desc') result.sort((a,b) => new Date(b.s_date) - new Date(a.s_date));
  if (currentSort === 'name-asc') result.sort((a,b) => (a.s_name||'').localeCompare(b.s_name||''));
  if (currentSort === 'cat') result.sort((a,b) => (a.s_category||'').localeCompare(b.s_category||''));
  if (currentSort === 'progress') result.sort((a,b) => (b.completion_percent||0) - (a.completion_percent||0));

  filteredData = result;
}

// ── 헤더 스탯 업데이트 ─────────────────────
function updateHeaderStats() {
  const now = new Date();
  const todayStr = toDateStr(now);
  const todayItems = allData.filter(i => i.s_date && isoToDateStr(i.s_date) === todayStr);
  const doneToday = todayItems.filter(isDone).length;
  const totalToday = todayItems.length;
  const pending = allData.filter(i => !isDone(i)).length;
  const overdue = allData.filter(i => {
    if (!i.s_date || isDone(i)) return false;
    return new Date(i.s_date) < now;
  }).length;
  const rate = totalToday > 0 ? Math.round(doneToday / totalToday * 100) : 0;

  document.getElementById('hsTotalToday').textContent = totalToday;
  document.getElementById('hsDoneToday').textContent  = doneToday;
  document.getElementById('hsPending').textContent     = pending;
  document.getElementById('hsOverdue').textContent     = overdue;
  document.getElementById('hsRate').textContent        = rate + '%';
  document.getElementById('hsProgBar').style.width     = rate + '%';
}

// ── 결과 카운트 ────────────────────────────
function updateResultCount() {
  document.getElementById('resultCount').textContent =
    `${filteredData.length}개 일정`;
}

// ── 리스트 렌더링 ────────────────────────────
function renderList() {
  const container = document.getElementById('scheduleList');
  if (filteredData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-ico">📭</div>
        <div class="empty-state-title">일정이 없습니다</div>
        <div class="empty-state-sub">필터를 조정하거나 새 일정을 추가해 보세요.</div>
      </div>`;
    return;
  }

  const now = new Date();

  // 날짜별 그룹핑
  const groups = {};
  filteredData.forEach(item => {
    const key = item.s_date ? isoToDateStr(item.s_date) : 'none';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const todayStr = toDateStr(now);
  let html = '';

  Object.entries(groups).forEach(([dateStr, items]) => {
    const d = parseDateStr(dateStr);
    const isToday = dateStr === todayStr;
    html += `
      <div class="date-group-header">
        <span class="dgr-date">${d.getMonth()+1}월 ${d.getDate()}일</span>
        <span class="dgr-day">${DAYS_KO[d.getDay()]}요일</span>
        ${isToday ? '<span class="dgr-today-badge">오늘</span>' : ''}
        <span class="dgr-count">${items.length}개</span>
      </div>`;

    items.forEach(item => {
      html += buildListItem(item, now);
    });
  });

  container.innerHTML = html;
  bindListEvents(container);
}

function buildListItem(item, now) {
  const done = isDone(item);
  const cc = catClass(item.s_category);
  const catItem = catItemClass(item.s_category);
  const pct = item.completion_percent || 0;
  const overdue = item.s_date && new Date(item.s_date) < now && !done;
  const dd = item.s_date ? dDay(isoToDateStr(item.s_date)) : null;

  const showProgress = (item.s_category === '과제' || item.s_category === '수행');

  const kwHtml = Array.isArray(item.s_keywords) && item.s_keywords.length > 0
    ? `<div class="sched-keywords">${item.s_keywords.map(k => `<span class="sched-kw">${escapeHtml(k)}</span>`).join('')}</div>`
    : '';

  const progHtml = showProgress ? `
    <div class="sched-progress">
      <div class="sched-prog-header">
        <span class="sched-prog-label">완성도</span>
        <span class="sched-prog-pct" style="color:${progColor(pct)}">${pct}%</span>
      </div>
      <div class="sched-prog-bar-wrap">
        <div class="sched-prog-bar ${progClass(pct)}" style="width:${pct}%"></div>
      </div>
    </div>` : '';

  return `
    <div class="sched-item ${catItem} ${done ? 'done' : ''} ${overdue ? 'overdue' : ''}" data-id="${item.id}">
      <button class="sched-check" data-id="${item.id}" title="완료 토글">${done ? '✓' : ''}</button>
      <div class="sched-info">
        <div class="sched-name">${escapeHtml(item.s_name)}</div>
        <div class="sched-meta">
          ${item.s_date ? `<span class="sched-time">${formatDateTime(item.s_date)}</span>` : ''}
          ${item.s_category ? `<span class="sched-cat ${cc}">${escapeHtml(item.s_category)}</span>` : ''}
          ${kwHtml}
        </div>
        ${progHtml}
      </div>
      <div class="sched-right">
        ${dd ? `<span class="sched-dday ${dd.cls}">${dd.text}</span>` : ''}
      </div>
    </div>`;
}

function bindListEvents(container) {
  container.querySelectorAll('.sched-check').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = allData.find(s => String(s.id) === String(id));
      if (!item) return;
      await toggleComplete(id, !isDone(item));
    });
  });

  container.querySelectorAll('.sched-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('sched-check') || e.target.closest('.sched-check')) return;
      const id = el.dataset.id;
      openDetail(id);
    });
  });
}

// ── 카드 렌더링 ────────────────────────────
function renderCards() {
  const container = document.getElementById('scheduleCardGrid');
  if (filteredData.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-ico">📭</div>
        <div class="empty-state-title">일정이 없습니다</div>
        <div class="empty-state-sub">필터를 조정하거나 새 일정을 추가해 보세요.</div>
      </div>`;
    return;
  }

  const now = new Date();
  container.innerHTML = filteredData.map(item => buildCard(item, now)).join('');

  container.querySelectorAll('.card-check').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = allData.find(s => String(s.id) === String(id));
      if (!item) return;
      await toggleComplete(id, !isDone(item));
    });
  });

  container.querySelectorAll('.sched-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('card-check') || e.target.closest('.card-check')) return;
      openDetail(el.dataset.id);
    });
  });
}

function buildCard(item, now) {
  const done = isDone(item);
  const cc = catClass(item.s_category);
  const catItem = catItemClass(item.s_category);
  const pct = item.completion_percent || 0;
  const dd = item.s_date ? dDay(isoToDateStr(item.s_date)) : null;
  const showProgress = (item.s_category === '과제' || item.s_category === '수행');

  const progHtml = showProgress ? `
    <div class="card-progress">
      <div class="card-prog-header">
        <span class="card-prog-label">완성도</span>
        <span class="card-prog-pct" style="color:${progColor(pct)}">${pct}%</span>
      </div>
      <div class="card-prog-bar-wrap">
        <div class="card-prog-bar" style="width:${pct}%;background:${progColor(pct)}"></div>
      </div>
    </div>` : '';

  return `
    <div class="sched-card ${catItem} ${done ? 'done' : ''}" data-id="${item.id}">
      <div class="card-header-row">
        <div class="card-title-area">
          <div class="card-name">${escapeHtml(item.s_name)}</div>
          ${item.s_category ? `<span class="card-cat ${cc}">${escapeHtml(item.s_category)}</span>` : ''}
        </div>
        <button class="card-check" data-id="${item.id}">${done ? '✓' : ''}</button>
      </div>
      <div class="card-meta">${item.s_date ? formatDateTime(item.s_date) : '날짜 없음'}</div>
      ${dd ? `<div class="card-dday"><span class="sched-dday ${dd.cls}">${dd.text}</span></div>` : ''}
      ${progHtml}
    </div>`;
}

// ── 전체 렌더 ─────────────────────────────
function renderAll() {
  applyFilters();
  updateHeaderStats();
  updateResultCount();
  if (viewMode === 'list') renderList();
  else renderCards();
}

// ── 상세 패널 ─────────────────────────────
function openDetail(id) {
  const item = allData.find(s => String(s.id) === String(id));
  if (!item) return;
  currentDetailId = id;

  const overlay = document.getElementById('detailOverlay');
  const done = isDone(item);
  const pct = item.completion_percent || 0;
  const cc = catClass(item.s_category);
  const catColors = {
    'cat-과제': 'var(--cat-과제)', 'cat-시험': 'var(--cat-시험)',
    'cat-약속': 'var(--cat-약속)', 'cat-기타': 'var(--cat-기타)', 'cat-default': 'var(--border2)'
  };
  document.getElementById('detailCatBar').style.background = catColors[cc] || 'var(--border2)';

  const check = document.getElementById('detailCheck');
  check.innerHTML = done ? '✓' : '';
  check.className = 'detail-check' + (done ? ' checked' : '');
  check.onclick = async () => {
    await toggleComplete(id, !isDone(item));
    openDetail(id);
  };

  document.getElementById('detailTitle').textContent = item.s_name || '';

  const metaEl = document.getElementById('detailMeta');
  metaEl.innerHTML = '';
  if (item.s_date) {
    const d = new Date(item.s_date);
    const dd = dDay(isoToDateStr(item.s_date));
    metaEl.innerHTML += `<span>📅 ${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일 ${_pad(d.getHours())}:${_pad(d.getMinutes())}</span>`;
    metaEl.innerHTML += `<span>${dd.text}</span>`;
  }
  if (item.s_category) metaEl.innerHTML += `<span>🏷 ${escapeHtml(item.s_category)}</span>`;
  if (item.s_keywords?.length) metaEl.innerHTML += `<span>🔑 ${item.s_keywords.join(', ')}</span>`;

  // 완성도 블록
  const showProgress = (item.s_category === '과제' || item.s_category === '수행');
  const compBlock = document.getElementById('detailCompletionBlock');
  compBlock.style.display = showProgress ? '' : 'none';

  if (showProgress) {
    document.getElementById('detailCompletionPct').textContent = pct + '%';
    document.getElementById('detailCompletionPct').style.color = progColor(pct);
    const bar = document.getElementById('detailCompletionBar');
    bar.style.width = pct + '%';
    bar.style.background = progColor(pct);

    const slider = document.getElementById('detailSlider');
    slider.value = pct;
    slider.oninput = () => {
      const v = parseInt(slider.value);
      document.getElementById('detailCompletionPct').textContent = v + '%';
      document.getElementById('detailCompletionPct').style.color = progColor(v);
      bar.style.width = v + '%';
      bar.style.background = progColor(v);
    };

    document.getElementById('detailSliderSave').onclick = async () => {
      const v = parseInt(slider.value);
      await updateCompletion(id, v);
    };
  }

  // 내용
  let contentHtml = '';
  if (item.s_content) contentHtml += escapeHtml(item.s_content);
  if (item.s_add) contentHtml += (contentHtml ? '\n\n' : '') + '📎 ' + escapeHtml(item.s_add);
  document.getElementById('detailContent').textContent = contentHtml ? contentHtml : (item.s_content || '');

  document.getElementById('detailEdit').onclick = () => { closeDetail(); openForm(item); };
  document.getElementById('detailDelete').onclick = async () => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    await deleteSchedule(id);
    closeDetail();
  };

  overlay.classList.add('open');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  currentDetailId = null;
}

function initDetailPanel() {
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detailOverlay')) closeDetail();
  });
}

// ── 폼 모달 ────────────────────────────────
function openForm(item = null) {
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalTitle').textContent = item ? '일정 수정' : '새 일정 추가';
  document.getElementById('formId').value = item ? item.id : '';
  document.getElementById('formName').value = item ? (item.s_name || '') : '';
  document.getElementById('formDate').value = item ? toLocalDatetimeValue(item.s_date) : '';
  document.getElementById('formCategory').value = item ? (item.s_category || '') : '';
  document.getElementById('formKeywords').value = item
    ? (Array.isArray(item.s_keywords) ? item.s_keywords.join(', ') : (item.s_keywords || ''))
    : '';
  document.getElementById('formContent').value = item ? (item.s_content || '') : '';
  document.getElementById('formAdd').value = item ? (item.s_add || '') : '';

  const pct = item ? (item.completion_percent || 0) : 0;
  const slider = document.getElementById('formCompletion');
  slider.value = pct;
  updateCompletionUI(pct);

  updateCompletionRowVisibility();
  overlay.classList.add('open');
}

function closeForm() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function updateCompletionRowVisibility() {
  const cat = document.getElementById('formCategory').value;
  const row = document.getElementById('completionRow');
  row.style.display = (cat === '과제' || cat === '수행') ? '' : 'none';
}

function updateCompletionUI(pct) {
  document.getElementById('formCompletionBadge').textContent = pct + '%';
  document.getElementById('formCompletionBadge').style.background = pct >= 100 ? 'rgba(52,211,153,0.15)' : 'rgba(108,143,255,0.12)';
  document.getElementById('formCompletionBadge').style.color = progColor(pct);
  document.getElementById('formCompletionFill').style.width = pct + '%';
  document.getElementById('formCompletionFill').style.background = progColor(pct);
  // 슬라이더 track 색상
  const slider = document.getElementById('formCompletion');
  slider.style.background = `linear-gradient(to right, ${progColor(pct)} ${pct}%, var(--border) ${pct}%)`;
}

function initFormModal() {
  document.getElementById('modalClose').addEventListener('click', closeForm);
  document.getElementById('formCancel').addEventListener('click', closeForm);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeForm();
  });
  document.getElementById('formSave').addEventListener('click', saveSchedule);
  document.getElementById('formCategory').addEventListener('change', updateCompletionRowVisibility);

  const slider = document.getElementById('formCompletion');
  slider.addEventListener('input', () => updateCompletionUI(parseInt(slider.value)));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeForm(); closeDetail(); closeStatsPanel(); }
  });
}

// ── CRUD ────────────────────────────────────
async function saveSchedule() {
  const id = document.getElementById('formId').value;
  const name = document.getElementById('formName').value.trim();
  if (!name) { alert('제목을 입력하세요.'); return; }

  const dateVal = document.getElementById('formDate').value;
  const keywordsRaw = document.getElementById('formKeywords').value.trim();
  const keywords = keywordsRaw ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean) : [];
  const cat = document.getElementById('formCategory').value;
  const showProgress = (cat === '과제' || cat === '수행');
  const pct = showProgress ? parseInt(document.getElementById('formCompletion').value) : 0;

  const body = {
    s_name: name,
    s_date: dateVal ? new Date(dateVal).toISOString() : null,
    s_category: cat || null,
    s_keywords: keywords.length > 0 ? keywords : null,
    s_content: document.getElementById('formContent').value.trim() || null,
    s_add: document.getElementById('formAdd').value.trim() || null,
    completion_percent: pct,
  };

  try {
    if (id) {
      await supabaseFetch(`schedule?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    } else {
      body.s_end = false;
      await supabaseFetch('schedule', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    }
    closeForm();
    await refresh();
  } catch (e) {
    console.error('저장 실패:', e);
    alert('저장에 실패했습니다.');
  }
}

async function toggleComplete(id, newState) {
  // 완료 시 completion_percent → 100
  const body = { s_end: newState === true };
  if (newState === true) body.completion_percent = 100;
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
    await refresh();
  } catch (e) {
    console.error('완료 토글 실패:', e);
    alert('완료 상태 변경에 실패했습니다.');
  }
}

async function updateCompletion(id, pct) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ completion_percent: pct, s_end: pct >= 100 })
    });
    await refresh();
    // 패널 갱신
    if (currentDetailId === id) openDetail(id);
  } catch (e) {
    console.error('완성도 저장 실패:', e);
    alert('완성도 저장에 실패했습니다.');
  }
}

async function deleteSchedule(id) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, { method: 'DELETE' });
    await refresh();
  } catch (e) {
    console.error('삭제 실패:', e);
    alert('삭제에 실패했습니다.');
  }
}

async function refresh() {
  await loadData();
  renderAll();
}

// ── 필터 초기화 ────────────────────────────
function initFilters() {
  // 기간 필터
  document.getElementById('filterPeriod').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#filterPeriod .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period;
      await refresh();
    });
  });

  // 완료 필터
  document.getElementById('filterDone').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filterDone .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDone = btn.dataset.done;
      renderAll();
    });
  });

  // 카테고리 체크박스
  document.getElementById('catFilters').querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const allCb = document.getElementById('catAll');
      if (cb.id === 'catAll') {
        // '전체' 선택 시 나머지 해제
        document.querySelectorAll('#catFilters input:not(#catAll)').forEach(c => { c.checked = false; });
        currentCats = new Set(['all']);
      } else {
        allCb.checked = false;
        currentCats.delete('all');
        if (cb.checked) currentCats.add(cb.value);
        else currentCats.delete(cb.value);
        if (currentCats.size === 0) { allCb.checked = true; currentCats.add('all'); }
      }
      renderAll();
    });
  });

  // 정렬
  document.getElementById('sortSelect').addEventListener('change', e => {
    currentSort = e.target.value;
    renderAll();
  });

  // 검색
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value;
      renderAll();
    }, 200);
  });
}

// ── 뷰 토글 ────────────────────────────────
function initViewToggle() {
  document.getElementById('btnListView').addEventListener('click', () => {
    viewMode = 'list';
    document.getElementById('btnListView').classList.add('active');
    document.getElementById('btnCardView').classList.remove('active');
    document.getElementById('listView').classList.remove('hidden');
    document.getElementById('cardView').classList.add('hidden');
    renderList();
  });
  document.getElementById('btnCardView').addEventListener('click', () => {
    viewMode = 'card';
    document.getElementById('btnCardView').classList.add('active');
    document.getElementById('btnListView').classList.remove('active');
    document.getElementById('cardView').classList.remove('hidden');
    document.getElementById('listView').classList.add('hidden');
    renderCards();
  });
}

// ── 새 일정 버튼 ────────────────────────────
function initAddBtn() {
  document.getElementById('btnAdd').addEventListener('click', () => openForm(null));
}

// ==========================================
//  통계 대시보드
// ==========================================

async function loadStatsData(days) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0,0,0,0);

  const data = await supabaseFetch(
    `schedule?s_date=gte.${toLocalISO(start)}&order=s_date.asc&limit=2000`
  );
  statsAllData = data || [];
}

function renderStats() {
  const items = statsAllData;
  const done = items.filter(isDone);
  const rate = items.length > 0 ? Math.round(done.length / items.length * 100) : 0;
  const avgProg = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.completion_percent || 0), 0) / items.length)
    : 0;

  document.getElementById('ss-total').textContent = items.length;
  document.getElementById('ss-done').textContent = done.length;
  document.getElementById('ss-rate').textContent = rate + '%';
  document.getElementById('ss-avg-prog').textContent = avgProg + '%';

  renderBarChart(items);
  renderDonutChart(items);
  renderProgressDist(items);
  renderHeatmap();
}

// 일별 막대 차트 (Canvas)
function renderBarChart(items) {
  const canvas = document.getElementById('barChart');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('barChartWrap');
  const days = statsPeriod;

  // 날짜별 집계
  const map = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map[toDateStr(d)] = { total: 0, done: 0 };
  }
  items.forEach(item => {
    if (!item.s_date) return;
    const key = isoToDateStr(item.s_date);
    if (!map[key]) return;
    map[key].total++;
    if (isDone(item)) map[key].done++;
  });

  const labels = Object.keys(map);
  const totals = labels.map(k => map[k].total);
  const dones  = labels.map(k => map[k].done);
  const maxVal = Math.max(...totals, 1);

  const barW = 28, gap = 8, paddingLeft = 24, paddingBottom = 28, paddingTop = 12;
  const chartW = labels.length * (barW + gap) + paddingLeft;
  const chartH = 160;

  canvas.width = chartW;
  canvas.height = chartH;
  canvas.style.width = '100%';

  ctx.clearRect(0, 0, chartW, chartH);

  const innerH = chartH - paddingBottom - paddingTop;

  labels.forEach((label, i) => {
    const x = paddingLeft + i * (barW + gap);
    const totalH = Math.round((totals[i] / maxVal) * innerH);
    const doneH  = Math.round((dones[i]  / maxVal) * innerH);
    const y = paddingTop + innerH;

    // 전체 바 (배경)
    if (totals[i] > 0) {
      ctx.fillStyle = 'rgba(108,143,255,0.15)';
      ctx.beginPath();
      ctx.roundRect(x, y - totalH, barW, totalH, [3,3,0,0]);
      ctx.fill();
    }

    // 완료 바
    if (dones[i] > 0) {
      ctx.fillStyle = 'rgba(52,211,153,0.75)';
      ctx.beginPath();
      ctx.roundRect(x, y - doneH, barW, doneH, [3,3,0,0]);
      ctx.fill();
    }

    // x축 레이블 (7일이면 날짜, 30일이면 MD)
    const d = parseDateStr(label);
    const labelStr = days <= 7 ? `${d.getMonth()+1}/${d.getDate()}` : (i % 5 === 0 ? `${d.getMonth()+1}/${d.getDate()}` : '');
    if (labelStr) {
      ctx.fillStyle = '#5c6480';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(labelStr, x + barW/2, chartH - 6);
    }

    // 값 표시 (있을 때만)
    if (totals[i] > 0) {
      ctx.fillStyle = '#9aa3bf';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(dones[i] + '/' + totals[i], x + barW/2, y - totalH - 3);
    }
  });

  // 범례
  ctx.fillStyle = 'rgba(108,143,255,0.6)';
  ctx.fillRect(0, 2, 10, 8);
  ctx.fillStyle = '#9aa3bf';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('전체', 14, 10);

  ctx.fillStyle = 'rgba(52,211,153,0.75)';
  ctx.fillRect(44, 2, 10, 8);
  ctx.fillStyle = '#9aa3bf';
  ctx.fillText('완료', 58, 10);
}

// 도넛 차트 (Canvas)
function renderDonutChart(items) {
  const canvas = document.getElementById('donutChart');
  const ctx = canvas.getContext('2d');
  canvas.width = 160; canvas.height = 160;
  const cx = 80, cy = 80, r = 60, innerR = 38;

  const cats = { '과제/수행': 0, '시험': 0, '약속': 0, '기타': 0 };
  items.forEach(item => {
    const c = item.s_category;
    if (c === '과제' || c === '수행') cats['과제/수행']++;
    else if (c === '시험') cats['시험']++;
    else if (c === '약속') cats['약속']++;
    else cats['기타']++;
  });

  const colors = ['#6c8fff','#f87171','#34d399','#fbbf24'];
  const keys = Object.keys(cats);
  const values = keys.map(k => cats[k]);
  const total = values.reduce((s, v) => s + v, 0) || 1;

  ctx.clearRect(0, 0, 160, 160);

  let startAngle = -Math.PI / 2;
  values.forEach((v, i) => {
    const sweep = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.globalAlpha = 0.85;
    ctx.fill();
    startAngle += sweep;
  });

  // 가운데 구멍
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#1e2230';
  ctx.fill();

  // 총계 텍스트
  ctx.fillStyle = '#f0f2f8';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 6);
  ctx.font = '9px sans-serif';
  ctx.fillStyle = '#5c6480';
  ctx.fillText('전체', cx, cy + 10);

  // 범례
  const legend = document.getElementById('donutLegend');
  legend.innerHTML = keys.map((k, i) => `
    <div class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${colors[i]}"></span>
      <span>${k}</span>
      <span style="margin-left:auto;font-family:monospace;font-size:0.75rem;color:#9aa3bf">${values[i]}</span>
    </div>`).join('');
}

// 완성도 분포
function renderProgressDist(items) {
  const buckets = [
    { label: '0%', min: 0, max: 0 },
    { label: '1-24%', min: 1, max: 24 },
    { label: '25-49%', min: 25, max: 49 },
    { label: '50-74%', min: 50, max: 74 },
    { label: '75-99%', min: 75, max: 99 },
    { label: '100%', min: 100, max: 100 },
  ];

  const counts = buckets.map(b =>
    items.filter(i => {
      const p = i.completion_percent || 0;
      return p >= b.min && p <= b.max;
    }).length
  );
  const maxCount = Math.max(...counts, 1);

  const colors = ['var(--border2)', 'var(--accent-red)', 'var(--accent-yellow)', 'var(--accent-yellow)', 'var(--accent3)', '#22c55e'];

  document.getElementById('progressDist').innerHTML = buckets.map((b, i) => `
    <div class="pd-row">
      <span class="pd-label">${b.label}</span>
      <div class="pd-bar-wrap">
        <div class="pd-bar" style="width:${Math.round(counts[i]/maxCount*100)}%;background:${colors[i]}"></div>
      </div>
      <span class="pd-count">${counts[i]}</span>
    </div>`).join('');
}

// 히트맵 (최근 90일)
function renderHeatmap() {
  const wrap = document.getElementById('heatmapWrap');
  const now = new Date();
  const days = 90;
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0,0,0,0);

  // 날짜별 완료 카운트
  const doneCounts = {};
  statsAllData.forEach(item => {
    if (!item.s_date || !isDone(item)) return;
    const key = isoToDateStr(item.s_date);
    doneCounts[key] = (doneCounts[key] || 0) + 1;
  });

  // 주별로 배치
  const firstDow = start.getDay(); // 시작 요일
  // 빈 칸 채우기용
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(toDateStr(d));
  }

  // 주 단위로 분리
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const dayLabels = ['일','월','화','수','목','금','토'];
  let html = '<div style="display:flex;gap:3px">';

  // 요일 레이블
  html += '<div style="display:flex;flex-direction:column;gap:3px;margin-top:0">';
  dayLabels.forEach(l => {
    html += `<div class="heatmap-label">${l}</div>`;
  });
  html += '</div>';

  weeks.forEach(week => {
    html += '<div style="display:flex;flex-direction:column;gap:3px">';
    for (let dow = 0; dow < 7; dow++) {
      const dateStr = week[dow];
      if (!dateStr) {
        html += '<div style="width:14px;height:14px"></div>';
        continue;
      }
      const count = doneCounts[dateStr] || 0;
      let cls = 'heatmap-cell';
      if (count >= 4) cls += ' h4';
      else if (count >= 3) cls += ' h3';
      else if (count >= 1) cls += ' h2';
      else if (count > 0) cls += ' h1';

      const d = parseDateStr(dateStr);
      const title = `${d.getMonth()+1}/${d.getDate()} 완료 ${count}개`;
      html += `<div class="${cls}" title="${title}"></div>`;
    }
    html += '</div>';
  });

  html += '</div>';
  html += `
    <div class="heatmap-legend">
      <span class="hm-leg-label">적음</span>
      <div class="hm-leg-cells">
        <div class="heatmap-cell"></div>
        <div class="heatmap-cell h1"></div>
        <div class="heatmap-cell h2"></div>
        <div class="heatmap-cell h3"></div>
        <div class="heatmap-cell h4"></div>
      </div>
      <span class="hm-leg-label">많음</span>
    </div>`;

  wrap.innerHTML = html;
}

// 통계 패널 열기/닫기
async function openStatsPanel() {
  document.getElementById('statsPanelOverlay').classList.add('open');
  await loadStatsData(statsPeriod);
  renderStats();
}
function closeStatsPanel() {
  document.getElementById('statsPanelOverlay').classList.remove('open');
}

function initStatsPanel() {
  document.getElementById('btnStats').addEventListener('click', openStatsPanel);
  document.getElementById('statsPanelClose').addEventListener('click', closeStatsPanel);
  document.getElementById('statsPanelOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('statsPanelOverlay')) closeStatsPanel();
  });

  document.querySelectorAll('.sp-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.sp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statsPeriod = parseInt(btn.dataset.sp);
      await loadStatsData(statsPeriod);
      renderStats();
    });
  });
}

// ── 앱 초기화 ──────────────────────────────
async function init() {
  initGNB();
  initPageDate();
  initFilters();
  initViewToggle();
  initAddBtn();
  initFormModal();
  initDetailPanel();
  initStatsPanel();

  try {
    await loadData();
    renderAll();
  } catch (e) {
    console.error('초기 로딩 실패:', e);
    document.getElementById('scheduleList').innerHTML =
      '<div class="empty-state"><div class="empty-state-ico">⚠️</div><div class="empty-state-title">데이터를 불러오지 못했습니다</div><div class="empty-state-sub">네트워크 연결을 확인해 주세요.</div></div>';
  }
}

document.addEventListener('DOMContentLoaded', init);
