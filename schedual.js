// ==========================================
//  StudyHub — schedual.js
// ==========================================

const SUPABASE_URL = 'https://cyqjgixdvlywkzyamerx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_casPdXLoUENk-a-oSC7RiQ_vmg9QmiR';

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

// ── 날짜 유틸 ──────────────────────────────
const DAYS_KO = ['일','월','화','수','목','금','토'];
const _pad = n => String(n).padStart(2,'0');
const toDateStr  = d => `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
const parseDateStr = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const isoToDateStr = iso => iso ? toDateStr(new Date(iso)) : '';
const toLocalISO   = d => `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;
const toLocalDTVal = iso => { if(!iso) return ''; const d=new Date(iso); return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}`; };
const formatDT = iso => { if(!iso) return ''; const d=new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`; };
const escHtml = s => s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
const isDone  = i => i.s_end === true;

function dDayInfo(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((parseDateStr(dateStr) - now) / 86400000);
  if (diff === 0) return { text:'D-Day', cls:'dd-today' };
  if (diff > 0 && diff <= 3) return { text:`D-${diff}`, cls:'dd-soon' };
  if (diff > 0) return { text:`D-${diff}`, cls:'dd-normal' };
  return { text:`D+${Math.abs(diff)}`, cls:'dd-past' };
}

function catCls(cat) {
  if (!cat) return 'cat-none';
  if (cat==='과제'||cat==='수행') return 'cat-과제';
  if (cat==='시험') return 'cat-시험';
  if (cat==='약속') return 'cat-약속';
  return 'cat-기타';
}
function catItemCls(cat) {
  if (!cat) return '';
  if (cat==='과제'||cat==='수행') return 'ci-과제';
  if (cat==='시험') return 'ci-시험';
  if (cat==='약속') return 'ci-약속';
  return 'ci-기타';
}
const CAT_COLORS = { '과제':'var(--cat-과제)','수행':'var(--cat-과제)','시험':'var(--cat-시험)','약속':'var(--cat-약속)','기타':'var(--cat-기타)' };
function catColor(cat) { return CAT_COLORS[cat] || 'var(--border2)'; }
function progColor(p) {
  if (!p || p===0) return 'var(--border2)';
  if (p<30) return 'var(--red)';
  if (p<70) return 'var(--yellow)';
  if (p<100) return 'var(--accent3)';
  return '#22c55e';
}

// ── 전역 상태 ──────────────────────────────
let allData      = [];    // 현재 기간 데이터
let filteredData = [];
let calSchedules = [];    // 캘린더용 데이터
let statsData    = [];

let calYear, calMonth;
let calSelectedDate = null;

let currentPeriod = 'today';
let currentDone   = 'all';
let currentCats   = new Set(['all']);
let currentSort   = 'date-asc';
let searchQuery   = '';
let viewMode      = 'list';
let currentDetailId = null;
let statsPeriod   = 7;

// ── GNB ─────────────────────────────────────
function initGNB() {
  const hamburger = document.getElementById('hamburger');
  const menu = document.getElementById('gnbMenu');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    menu.classList.toggle('open');
  });
  menu.querySelectorAll('.gnb-link').forEach(l => l.addEventListener('click', () => {
    hamburger.classList.remove('open'); menu.classList.remove('open');
  }));
}

function initPageDate() {
  const now = new Date();
  document.getElementById('pageDate').textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

// ══════════════════════════════════════════════
//  캘린더
// ══════════════════════════════════════════════

async function loadCalendarData() {
  const firstOfMonth = new Date(calYear, calMonth-1, 1);
  const firstDow = firstOfMonth.getDay();
  const calStart = new Date(calYear, calMonth-1, 1-firstDow);
  calStart.setHours(0,0,0,0);
  const lastOfMonth = new Date(calYear, calMonth, 0);
  const lastDow = lastOfMonth.getDay();
  const calEnd = new Date(calYear, calMonth, 6-lastDow);
  calEnd.setHours(23,59,59,999);

  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${toLocalISO(calStart)}&s_date=lte.${toLocalISO(calEnd)}&order=s_date.asc&limit=500`
    );
    calSchedules = data || [];
  } catch(e) {
    calSchedules = [];
  }
}

function groupByDate(list) {
  const m = {};
  list.forEach(i => {
    if (!i.s_date) return;
    const k = isoToDateStr(i.s_date);
    if (!m[k]) m[k] = [];
    m[k].push(i);
  });
  return m;
}

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  document.getElementById('calMonthLabel').textContent = `${calYear}.${_pad(calMonth)}`;

  const grouped  = groupByDate(calSchedules);
  const firstDay = new Date(calYear, calMonth-1, 1).getDay();
  const lastDate = new Date(calYear, calMonth, 0).getDate();
  const prevLast = new Date(calYear, calMonth-1, 0).getDate();
  const todayStr = toDateStr(new Date());

  let cells = ''; let count = 0;

  // 이전 달
  for (let i = firstDay-1; i >= 0; i--) {
    const ds = toDateStr(new Date(calYear, calMonth-2, prevLast-i));
    cells += buildMiniCell(ds, prevLast-i, true, todayStr, grouped); count++;
  }
  // 이번 달
  for (let d = 1; d <= lastDate; d++) {
    const ds = toDateStr(new Date(calYear, calMonth-1, d));
    cells += buildMiniCell(ds, d, false, todayStr, grouped); count++;
  }
  // 다음 달
  const rem = Math.ceil(count/7)*7 - count;
  for (let d = 1; d <= rem; d++) {
    const ds = toDateStr(new Date(calYear, calMonth, d));
    cells += buildMiniCell(ds, d, true, todayStr, grouped);
  }

  grid.innerHTML = cells;

  grid.querySelectorAll('.mc-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      // 선택된 날짜 하이라이트
      grid.querySelectorAll('.mc-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      calSelectedDate = cell.dataset.date;
      // 해당 날짜 기준으로 리스트 필터 (기간 = '전체' 모드에서 날짜 점프)
      scrollToDate(calSelectedDate);
    });
  });

  renderUpcoming(grouped);
}

function buildMiniCell(dateStr, dayNum, otherMonth, todayStr, grouped) {
  const dow = parseDateStr(dateStr).getDay();
  const isToday = dateStr === todayStr;
  const isSelected = dateStr === calSelectedDate;
  let cls = 'mc-cell';
  if (otherMonth) cls += ' other-month';
  if (isToday)    cls += ' today';
  if (isSelected) cls += ' selected';
  if (dow === 0)  cls += ' sun';
  if (dow === 6)  cls += ' sat';

  const items = grouped[dateStr] || [];
  const dotColors = [...new Set(items.slice(0,4).map(i => catColor(i.s_category)))];
  const dotsHtml = dotColors.map(c =>
    `<span class="mc-dot" style="background:${c};opacity:${items.every(isDone)?'.35':'1'}"></span>`
  ).join('');

  return `
    <div class="${cls}" data-date="${dateStr}">
      <span class="mc-date">${dayNum}</span>
      <div class="mc-dots">${dotsHtml}</div>
    </div>`;
}

function renderUpcoming(grouped) {
  const list = document.getElementById('upcomingList');
  const now = new Date(); now.setHours(0,0,0,0);
  const items = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate()+i);
    const key = toDateStr(d);
    (grouped[key] || []).forEach(item => {
      if (!isDone(item)) items.push({ ...item, _ds: key });
    });
  }
  items.sort((a,b) => new Date(a.s_date) - new Date(b.s_date));
  const shown = items.slice(0,6);

  if (shown.length === 0) {
    list.innerHTML = '<div style="font-size:.75rem;color:var(--text3);padding:4px 0">예정 일정 없음</div>';
    return;
  }
  list.innerHTML = shown.map(item => {
    const dd = dDayInfo(item._ds);
    const isToday = dd.text === 'D-Day';
    return `
      <div class="up-item" data-date="${item._ds}">
        <span class="up-dday ${isToday?'today':''}">${dd.text}</span>
        <span class="up-name">${escHtml(item.s_name)}</span>
        <span class="up-dot" style="background:${catColor(item.s_category)}"></span>
      </div>`;
  }).join('');

  list.querySelectorAll('.up-item').forEach(el => {
    el.addEventListener('click', () => scrollToDate(el.dataset.date));
  });
}

function scrollToDate(dateStr) {
  // 해당 날짜 그룹 헤더로 스크롤
  const hd = document.querySelector(`.date-group-hd[data-date="${dateStr}"]`);
  if (hd) hd.scrollIntoView({ behavior:'smooth', block:'start' });
}

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth()+1;

  document.getElementById('calPrev').addEventListener('click', async () => {
    calMonth--; if (calMonth < 1) { calMonth=12; calYear--; }
    await loadCalendarData(); renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', async () => {
    calMonth++; if (calMonth > 12) { calMonth=1; calYear++; }
    await loadCalendarData(); renderCalendar();
  });
}

// ══════════════════════════════════════════════
//  일정 데이터 로딩 + 필터링
// ══════════════════════════════════════════════

async function loadData() {
  const now = new Date();
  let start, end;

  if (currentPeriod === 'today') {
    start = new Date(now); start.setHours(0,0,0,0);
    end   = new Date(now); end.setHours(23,59,59,999);
  } else if (currentPeriod === 'week') {
    const dow = now.getDay();
    start = new Date(now); start.setDate(now.getDate()-dow); start.setHours(0,0,0,0);
    end   = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
  } else if (currentPeriod === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
    end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
  } else {
    start = new Date(now.getFullYear()-1, now.getMonth(), now.getDate(), 0,0,0,0);
    end   = new Date(now.getFullYear()+1, 11, 31, 23,59,59,999);
  }

  const data = await supabaseFetch(
    `schedule?s_date=gte.${toLocalISO(start)}&s_date=lte.${toLocalISO(end)}&order=s_date.asc&limit=1000`
  );
  allData = data || [];
}

function applyFilters() {
  let r = [...allData];

  if (!currentCats.has('all') && currentCats.size > 0) {
    r = r.filter(i => {
      const c = i.s_category||'';
      return [...currentCats].some(fc => fc==='과제' ? (c==='과제'||c==='수행') : c===fc);
    });
  }
  if (currentDone === 'done')   r = r.filter(isDone);
  if (currentDone === 'undone') r = r.filter(i => !isDone(i));

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    r = r.filter(i =>
      (i.s_name||'').toLowerCase().includes(q) ||
      (i.s_content||'').toLowerCase().includes(q) ||
      (i.s_category||'').toLowerCase().includes(q)
    );
  }

  if (currentSort === 'date-asc')  r.sort((a,b) => new Date(a.s_date)-new Date(b.s_date));
  if (currentSort === 'date-desc') r.sort((a,b) => new Date(b.s_date)-new Date(a.s_date));
  if (currentSort === 'name-asc')  r.sort((a,b) => (a.s_name||'').localeCompare(b.s_name||''));
  if (currentSort === 'cat')       r.sort((a,b) => (a.s_category||'').localeCompare(b.s_category||''));
  if (currentSort === 'progress')  r.sort((a,b) => (b.completion_percent||0)-(a.completion_percent||0));

  filteredData = r;
}

function updateHeaderStats() {
  const now = new Date();
  const todayStr = toDateStr(now);
  const todayItems = allData.filter(i => i.s_date && isoToDateStr(i.s_date)===todayStr);
  const doneToday = todayItems.filter(isDone).length;
  const pending   = allData.filter(i => !isDone(i)).length;
  const overdue   = allData.filter(i => i.s_date && !isDone(i) && new Date(i.s_date)<now).length;
  const rate      = todayItems.length > 0 ? Math.round(doneToday/todayItems.length*100) : 0;

  document.getElementById('hsTotalToday').textContent = todayItems.length;
  document.getElementById('hsDoneToday').textContent  = doneToday;
  document.getElementById('hsPending').textContent    = pending;
  document.getElementById('hsOverdue').textContent    = overdue;
  document.getElementById('hsRate').textContent       = rate+'%';
  document.getElementById('hsProgBar').style.width    = rate+'%';
}

function updateResultCount() {
  document.getElementById('resultCount').textContent = `${filteredData.length}개 일정`;
}

// ══════════════════════════════════════════════
//  리스트 렌더링
// ══════════════════════════════════════════════

function renderList() {
  const container = document.getElementById('scheduleList');
  if (filteredData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="es-ico">📭</div>
        <div class="es-title">일정이 없습니다</div>
        <div class="es-sub">필터를 조정하거나 새 일정을 추가해 보세요.</div>
      </div>`;
    return;
  }

  const now = new Date();
  const todayStr = toDateStr(now);

  // 날짜별 그룹핑
  const groups = {};
  filteredData.forEach(item => {
    const k = item.s_date ? isoToDateStr(item.s_date) : 'none';
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
  });

  let html = '';
  Object.entries(groups).forEach(([ds, items]) => {
    if (ds === 'none') return;
    const d = parseDateStr(ds);
    const isToday = ds === todayStr;
    html += `
      <div class="date-group-hd" data-date="${ds}">
        <span class="dg-date">${d.getMonth()+1}월 ${d.getDate()}일</span>
        <span class="dg-day">${DAYS_KO[d.getDay()]}요일</span>
        ${isToday ? '<span class="dg-today-badge">오늘</span>' : ''}
        <span class="dg-count">${items.length}개</span>
      </div>`;
    items.forEach(item => { html += buildListItem(item, now); });
  });

  container.innerHTML = html;
  bindListEvents(container);
}

function buildListItem(item, now) {
  const done = isDone(item);
  const cc = catCls(item.s_category);
  const ci = catItemCls(item.s_category);
  const pct = item.completion_percent || 0;
  const overdue = item.s_date && new Date(item.s_date)<now && !done;
  const dd = item.s_date ? dDayInfo(isoToDateStr(item.s_date)) : null;
  const showProg = item.s_category==='과제'||item.s_category==='수행';

  const kwHtml = Array.isArray(item.s_keywords) && item.s_keywords.length
    ? item.s_keywords.map(k => `<span class="sched-kw">${escHtml(k)}</span>`).join('')
    : '';

  const progHtml = showProg ? `
    <div class="sched-progress">
      <div class="sp-head">
        <span class="sp-label">완성도</span>
        <span class="sp-pct" style="color:${progColor(pct)}">${pct}%</span>
      </div>
      <div class="sp-track"><div class="sp-bar" style="width:${pct}%;background:${progColor(pct)}"></div></div>
    </div>` : '';

  return `
    <div class="sched-item ${ci} ${done?'done':''} ${overdue?'overdue':''}" data-id="${item.id}">
      <button class="sched-check" data-id="${item.id}">${done?'✓':''}</button>
      <div class="sched-info">
        <div class="sched-name">${escHtml(item.s_name)}</div>
        <div class="sched-meta">
          ${item.s_date ? `<span class="sched-time">${formatDT(item.s_date)}</span>` : ''}
          ${item.s_category ? `<span class="sched-cat ${cc}">${escHtml(item.s_category)}</span>` : ''}
          ${kwHtml}
        </div>
        ${progHtml}
      </div>
      <div class="sched-right">
        ${dd ? `<span class="dd-badge ${dd.cls}">${dd.text}</span>` : ''}
      </div>
    </div>`;
}

function bindListEvents(container) {
  container.querySelectorAll('.sched-check').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const item = allData.find(s => String(s.id)===btn.dataset.id);
      if (item) await toggleComplete(item.id, !isDone(item));
    });
  });
  container.querySelectorAll('.sched-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.sched-check')) return;
      openDetail(el.dataset.id);
    });
  });
}

// ── 카드 렌더링 ────────────────────────────
function renderCards() {
  const container = document.getElementById('scheduleCardGrid');
  if (filteredData.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="es-ico">📭</div><div class="es-title">일정이 없습니다</div></div>`;
    return;
  }
  const now = new Date();
  container.innerHTML = filteredData.map(item => buildCard(item, now)).join('');
  container.querySelectorAll('.card-check').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const item = allData.find(s => String(s.id)===btn.dataset.id);
      if (item) await toggleComplete(item.id, !isDone(item));
    });
  });
  container.querySelectorAll('.sched-card').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.card-check')) return;
      openDetail(el.dataset.id);
    });
  });
}

function buildCard(item, now) {
  const done = isDone(item);
  const cc = catCls(item.s_category);
  const ci = catItemCls(item.s_category);
  const pct = item.completion_percent || 0;
  const dd = item.s_date ? dDayInfo(isoToDateStr(item.s_date)) : null;
  const showProg = item.s_category==='과제'||item.s_category==='수행';
  return `
    <div class="sched-card ${ci} ${done?'done':''}" data-id="${item.id}">
      <div class="card-hd">
        <div>
          <div class="card-name">${escHtml(item.s_name)}</div>
          ${item.s_category ? `<span class="card-cat ${cc}">${escHtml(item.s_category)}</span>` : ''}
        </div>
        <button class="card-check" data-id="${item.id}">${done?'✓':''}</button>
      </div>
      <div class="card-meta">${item.s_date ? formatDT(item.s_date) : '날짜 없음'}</div>
      ${dd ? `<div style="margin-bottom:6px"><span class="dd-badge ${dd.cls}">${dd.text}</span></div>` : ''}
      ${showProg ? `
        <div class="sp-head"><span class="sp-label">완성도</span><span class="sp-pct" style="color:${progColor(pct)}">${pct}%</span></div>
        <div class="sp-track"><div class="sp-bar" style="width:${pct}%;background:${progColor(pct)}"></div></div>` : ''}
    </div>`;
}

function renderAll() {
  applyFilters();
  updateHeaderStats();
  updateResultCount();
  if (viewMode==='list') renderList();
  else renderCards();
}

// ══════════════════════════════════════════════
//  상세 패널
// ══════════════════════════════════════════════

function openDetail(id) {
  const item = allData.find(s => String(s.id)===String(id));
  if (!item) return;
  currentDetailId = id;
  const done = isDone(item);
  const pct  = item.completion_percent || 0;

  // 상단 스트라이프
  document.getElementById('detailStripe').style.background = catColor(item.s_category);
  document.getElementById('detailCatLabel').textContent = item.s_category || '';

  // 체크
  const checkBtn = document.getElementById('detailCheck');
  checkBtn.innerHTML = done ? '✓' : '';
  checkBtn.className = 'detail-check-btn' + (done?' checked':'');
  checkBtn.onclick = async () => { await toggleComplete(id, !isDone(item)); openDetail(id); };

  document.getElementById('detailTitle').textContent = item.s_name || '';

  // 메타
  const metaEl = document.getElementById('detailMeta');
  const lines = [];
  if (item.s_date) {
    const d = new Date(item.s_date);
    const dd = dDayInfo(isoToDateStr(item.s_date));
    lines.push(`📅 ${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일 ${_pad(d.getHours())}:${_pad(d.getMinutes())} · ${dd.text}`);
  }
  if (item.s_category) lines.push(`🏷 ${item.s_category}`);
  if (item.s_keywords?.length) lines.push(`🔑 ${item.s_keywords.join(', ')}`);
  metaEl.innerHTML = lines.map(l => `<span>${l}</span>`).join('');

  // 완성도 블록
  const showProg = item.s_category==='과제'||item.s_category==='수행';
  const block = document.getElementById('detailCompBlock');
  block.style.display = showProg ? '' : 'none';
  if (showProg) {
    const pctEl = document.getElementById('detailPct');
    const bar   = document.getElementById('detailBar');
    const slider= document.getElementById('detailSlider');
    pctEl.textContent = pct+'%';
    pctEl.style.color = progColor(pct);
    bar.style.width   = pct+'%';
    bar.style.background = progColor(pct);
    slider.value = pct;
    slider.oninput = () => {
      const v = +slider.value;
      pctEl.textContent = v+'%'; pctEl.style.color = progColor(v);
      bar.style.width = v+'%'; bar.style.background = progColor(v);
    };
    document.getElementById('detailSliderSave').onclick = async () => {
      await updateCompletion(id, +slider.value);
    };
  }

  // 내용
  let bodyText = '';
  if (item.s_content) bodyText += item.s_content;
  if (item.s_add) bodyText += (bodyText?'\n\n':'') + '📎 ' + item.s_add;
  document.getElementById('detailContent').textContent = bodyText;

  document.getElementById('detailEdit').onclick = () => { closeDetail(); openForm(item); };
  document.getElementById('detailDelete').onclick = async () => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteSchedule(id); closeDetail();
  };

  document.getElementById('detailOverlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  currentDetailId = null;
}

// ══════════════════════════════════════════════
//  폼 모달
// ══════════════════════════════════════════════

function openForm(item = null) {
  document.getElementById('modalTitle').textContent = item ? '일정 수정' : '새 일정 추가';
  document.getElementById('formId').value        = item ? item.id : '';
  document.getElementById('formName').value      = item ? (item.s_name||'') : '';
  document.getElementById('formDate').value      = item ? toLocalDTVal(item.s_date) : '';
  document.getElementById('formCategory').value  = item ? (item.s_category||'') : '';
  document.getElementById('formKeywords').value  = item
    ? (Array.isArray(item.s_keywords) ? item.s_keywords.join(', ') : (item.s_keywords||''))
    : '';
  document.getElementById('formContent').value   = item ? (item.s_content||'') : '';
  document.getElementById('formAdd').value       = item ? (item.s_add||'') : '';

  const pct = item ? (item.completion_percent||0) : 0;
  const slider = document.getElementById('formCompletion');
  slider.value = pct;
  updateCompUI(pct);
  toggleCompRow();
  document.getElementById('modalOverlay').classList.add('open');
}

function closeForm() { document.getElementById('modalOverlay').classList.remove('open'); }

function toggleCompRow() {
  const cat = document.getElementById('formCategory').value;
  document.getElementById('completionRow').style.display =
    (cat==='과제'||cat==='수행') ? '' : 'none';
}

function updateCompUI(pct) {
  const badge = document.getElementById('formCompletionBadge');
  badge.textContent = pct+'%';
  badge.style.color = progColor(pct);
  badge.style.background = pct>=100 ? 'rgba(52,211,153,.12)' : 'rgba(108,143,255,.1)';
  const slider = document.getElementById('formCompletion');
  slider.style.background = `linear-gradient(to right,${progColor(pct)} ${pct}%,var(--border) ${pct}%)`;
}

// ══════════════════════════════════════════════
//  CRUD
// ══════════════════════════════════════════════

async function saveSchedule() {
  const id   = document.getElementById('formId').value;
  const name = document.getElementById('formName').value.trim();
  if (!name) { alert('제목을 입력하세요.'); return; }

  const dateVal = document.getElementById('formDate').value;
  const cat = document.getElementById('formCategory').value;
  const kwRaw = document.getElementById('formKeywords').value.trim();
  const kws = kwRaw ? kwRaw.split(',').map(k=>k.trim()).filter(Boolean) : [];
  const showProg = cat==='과제'||cat==='수행';
  const pct = showProg ? +document.getElementById('formCompletion').value : 0;

  const body = {
    s_name: name,
    s_date: dateVal ? new Date(dateVal).toISOString() : null,
    s_category: cat||null,
    s_keywords: kws.length ? kws : null,
    s_content: document.getElementById('formContent').value.trim()||null,
    s_add: document.getElementById('formAdd').value.trim()||null,
    completion_percent: pct,
  };

  try {
    if (id) {
      await supabaseFetch(`schedule?id=eq.${id}`, {
        method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify(body)
      });
    } else {
      body.s_end = false;
      await supabaseFetch('schedule', {
        method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(body)
      });
    }
    closeForm();
    await refresh();
  } catch(e) {
    console.error(e); alert('저장에 실패했습니다.');
  }
}

async function toggleComplete(id, newState) {
  const body = { s_end: newState===true };
  if (newState===true) body.completion_percent = 100;
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify(body)
    });
    await refresh();
    if (currentDetailId===String(id)) openDetail(id);
  } catch(e) { console.error(e); alert('변경에 실패했습니다.'); }
}

async function updateCompletion(id, pct) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method:'PATCH', headers:{'Prefer':'return=representation'},
      body:JSON.stringify({ completion_percent:pct, s_end:pct>=100 })
    });
    await refresh();
    if (currentDetailId===String(id)) openDetail(id);
  } catch(e) { console.error(e); alert('완성도 저장에 실패했습니다.'); }
}

async function deleteSchedule(id) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, { method:'DELETE' });
    await refresh();
  } catch(e) { console.error(e); alert('삭제에 실패했습니다.'); }
}

async function refresh() {
  await Promise.all([ loadData(), loadCalendarData() ]);
  renderAll();
  renderCalendar();
}

// ══════════════════════════════════════════════
//  통계
// ══════════════════════════════════════════════

async function loadStatsData(days) {
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate()-days); start.setHours(0,0,0,0);
  const data = await supabaseFetch(
    `schedule?s_date=gte.${toLocalISO(start)}&order=s_date.asc&limit=2000`
  );
  statsData = data || [];
}

function renderStats() {
  const items = statsData;
  const done  = items.filter(isDone);
  const rate  = items.length ? Math.round(done.length/items.length*100) : 0;
  const avgP  = items.length ? Math.round(items.reduce((s,i)=>s+(i.completion_percent||0),0)/items.length) : 0;

  document.getElementById('ss-total').textContent   = items.length;
  document.getElementById('ss-done').textContent    = done.length;
  document.getElementById('ss-rate').textContent    = rate+'%';
  document.getElementById('ss-avg-prog').textContent= avgP+'%';

  drawBarChart(items);
  drawDonut(items);
  drawProgressDist(items);
  drawHeatmap();
}

function drawBarChart(items) {
  const canvas = document.getElementById('barChart');
  const ctx    = canvas.getContext('2d');
  const now    = new Date();
  const days   = statsPeriod;
  const map    = {};

  for (let i=days-1; i>=0; i--) {
    const d = new Date(now); d.setDate(d.getDate()-i);
    map[toDateStr(d)] = {total:0, done:0};
  }
  items.forEach(i => {
    const k = isoToDateStr(i.s_date);
    if (!map[k]) return;
    map[k].total++;
    if (isDone(i)) map[k].done++;
  });

  const labels = Object.keys(map);
  const totals = labels.map(k=>map[k].total);
  const dones  = labels.map(k=>map[k].done);
  const maxVal = Math.max(...totals, 1);

  const bW=22, gap=6, pL=20, pB=24, pT=10;
  const cW = labels.length*(bW+gap)+pL;
  const cH = 140;
  canvas.width=cW; canvas.height=cH;
  canvas.style.width='100%';
  ctx.clearRect(0,0,cW,cH);
  const iH = cH-pB-pT;

  labels.forEach((lbl,i) => {
    const x = pL+i*(bW+gap);
    const tH = Math.round((totals[i]/maxVal)*iH);
    const dH = Math.round((dones[i]/maxVal)*iH);
    const y  = pT+iH;
    if (totals[i]>0) {
      ctx.fillStyle='rgba(108,143,255,.18)';
      ctx.beginPath(); ctx.roundRect(x,y-tH,bW,tH,[3,3,0,0]); ctx.fill();
    }
    if (dones[i]>0) {
      ctx.fillStyle='rgba(52,211,153,.75)';
      ctx.beginPath(); ctx.roundRect(x,y-dH,bW,dH,[3,3,0,0]); ctx.fill();
    }
    // x축 레이블
    if (days<=14 || i%(Math.ceil(days/10))===0) {
      const d = parseDateStr(lbl);
      ctx.fillStyle='#5c6480'; ctx.font='8px monospace'; ctx.textAlign='center';
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x+bW/2, cH-6);
    }
    if (totals[i]>0) {
      ctx.fillStyle='#9aa3bf'; ctx.font='bold 8px monospace'; ctx.textAlign='center';
      ctx.fillText(`${dones[i]}/${totals[i]}`, x+bW/2, y-tH-3);
    }
  });
}

function drawDonut(items) {
  const canvas = document.getElementById('donutChart');
  const ctx = canvas.getContext('2d');
  canvas.width=130; canvas.height=130;
  const cx=65,cy=65,r=52,ir=32;
  const cats = {'과제/수행':0,'시험':0,'약속':0,'기타':0};
  items.forEach(i => {
    const c=i.s_category;
    if (c==='과제'||c==='수행') cats['과제/수행']++;
    else if (c==='시험') cats['시험']++;
    else if (c==='약속') cats['약속']++;
    else cats['기타']++;
  });
  const colors=['#6c8fff','#f87171','#34d399','#fbbf24'];
  const keys=Object.keys(cats), values=keys.map(k=>cats[k]);
  const total=values.reduce((s,v)=>s+v,0)||1;
  ctx.clearRect(0,0,130,130);
  let angle=-Math.PI/2;
  values.forEach((v,i) => {
    const sweep=(v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+sweep); ctx.closePath();
    ctx.fillStyle=colors[i]; ctx.globalAlpha=.85; ctx.fill();
    angle+=sweep;
  });
  ctx.globalAlpha=1;
  ctx.beginPath(); ctx.arc(cx,cy,ir,0,Math.PI*2);
  ctx.fillStyle='#1e2230'; ctx.fill();
  ctx.fillStyle='#f0f2f8'; ctx.font='bold 15px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(total,cx,cy-4);
  ctx.font='8px sans-serif'; ctx.fillStyle='#5c6480'; ctx.fillText('전체',cx,cy+9);

  document.getElementById('donutLegend').innerHTML = keys.map((k,i) => `
    <div class="dl-item">
      <span class="dl-dot" style="background:${colors[i]}"></span>
      <span>${k}</span>
      <span style="margin-left:auto;font-family:monospace;font-size:.7rem;color:var(--text2)">${values[i]}</span>
    </div>`).join('');
}

function drawProgressDist(items) {
  const buckets=[
    {l:'0%',min:0,max:0},{l:'1-24%',min:1,max:24},
    {l:'25-49%',min:25,max:49},{l:'50-74%',min:50,max:74},
    {l:'75-99%',min:75,max:99},{l:'100%',min:100,max:100}
  ];
  const counts=buckets.map(b=>items.filter(i=>{const p=i.completion_percent||0;return p>=b.min&&p<=b.max}).length);
  const maxC=Math.max(...counts,1);
  const colors=['var(--border2)','var(--red)','var(--yellow)','var(--yellow)','var(--accent3)','#22c55e'];
  document.getElementById('progressDist').innerHTML = buckets.map((b,i) => `
    <div class="pd-row">
      <span class="pd-lbl">${b.l}</span>
      <div class="pd-track"><div class="pd-fill" style="width:${Math.round(counts[i]/maxC*100)}%;background:${colors[i]}"></div></div>
      <span class="pd-cnt">${counts[i]}</span>
    </div>`).join('');
}

function drawHeatmap() {
  const wrap=document.getElementById('heatmapWrap');
  const now=new Date(); const days=90;
  const start=new Date(now); start.setDate(start.getDate()-days+1); start.setHours(0,0,0,0);
  const doneCounts={};
  statsData.forEach(i => {
    if (!i.s_date||!isDone(i)) return;
    const k=isoToDateStr(i.s_date); doneCounts[k]=(doneCounts[k]||0)+1;
  });

  const firstDow=start.getDay();
  const cells=[]; for(let i=0;i<firstDow;i++) cells.push(null);
  for(let i=0;i<days;i++){const d=new Date(start);d.setDate(start.getDate()+i);cells.push(toDateStr(d));}
  const weeks=[]; for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));

  const dowLabels=['일','월','화','수','목','금','토'];
  let html='<div style="display:flex;gap:3px;align-items:flex-start">';
  // 요일 레이블
  html+='<div class="hm-dow-col">';
  dowLabels.forEach(l=>{ html+=`<div class="hm-dow-lbl">${l}</div>`; });
  html+='</div>';
  // 주 열
  html+='<div class="hm-grid">';
  weeks.forEach(week=>{
    html+='<div class="hm-col">';
    for(let dow=0;dow<7;dow++){
      const ds=week[dow];
      if(!ds){html+='<div style="width:12px;height:12px"></div>';continue;}
      const c=doneCounts[ds]||0;
      const hCls=c>=4?'h4':c>=3?'h3':c>=2?'h2':c>=1?'h1':'';
      const d=parseDateStr(ds);
      html+=`<div class="hm-cell ${hCls}" title="${d.getMonth()+1}/${d.getDate()} 완료 ${c}개"></div>`;
    }
    html+='</div>';
  });
  html+='</div></div>';
  html+=`<div class="hm-legend">
    <span class="hm-leg-lbl">적음</span>
    <div class="hm-leg-cells" style="display:flex;gap:3px">
      <div class="hm-cell"></div><div class="hm-cell h1"></div><div class="hm-cell h2"></div><div class="hm-cell h3"></div><div class="hm-cell h4"></div>
    </div>
    <span class="hm-leg-lbl">많음</span>
  </div>`;
  wrap.innerHTML=html;
}

// ══════════════════════════════════════════════
//  이벤트 바인딩
// ══════════════════════════════════════════════

function initFilters() {
  document.getElementById('filterPeriod').querySelectorAll('.f-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#filterPeriod .f-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); currentPeriod=btn.dataset.period;
      await loadData(); renderAll();
    });
  });
  document.getElementById('filterDone').querySelectorAll('.f-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filterDone .f-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); currentDone=btn.dataset.done; renderAll();
    });
  });
  document.getElementById('catFilters').querySelectorAll('input').forEach(cb => {
    cb.addEventListener('change', () => {
      const allCb=document.getElementById('catAll');
      if (cb.id==='catAll') {
        document.querySelectorAll('#catFilters input:not(#catAll)').forEach(c=>c.checked=false);
        currentCats=new Set(['all']);
      } else {
        allCb.checked=false; currentCats.delete('all');
        if (cb.checked) currentCats.add(cb.value); else currentCats.delete(cb.value);
        if (currentCats.size===0){allCb.checked=true;currentCats.add('all');}
      }
      renderAll();
    });
  });
  document.getElementById('sortSelect').addEventListener('change', e=>{currentSort=e.target.value;renderAll();});
  let timer;
  document.getElementById('searchInput').addEventListener('input', e=>{
    clearTimeout(timer); timer=setTimeout(()=>{searchQuery=e.target.value;renderAll();},220);
  });
}

function initViewToggle() {
  document.getElementById('btnListView').addEventListener('click', () => {
    viewMode='list';
    document.getElementById('btnListView').classList.add('active');
    document.getElementById('btnCardView').classList.remove('active');
    document.getElementById('listView').classList.remove('hidden');
    document.getElementById('cardView').classList.add('hidden');
    renderList();
  });
  document.getElementById('btnCardView').addEventListener('click', () => {
    viewMode='card';
    document.getElementById('btnCardView').classList.add('active');
    document.getElementById('btnListView').classList.remove('active');
    document.getElementById('cardView').classList.remove('hidden');
    document.getElementById('listView').classList.add('hidden');
    renderCards();
  });
}

function initPanels() {
  // 통계 패널
  document.getElementById('btnStats').addEventListener('click', async () => {
    document.getElementById('statsPanelOverlay').classList.add('open');
    await loadStatsData(statsPeriod); renderStats();
  });
  document.getElementById('statsPanelClose').addEventListener('click', () =>
    document.getElementById('statsPanelOverlay').classList.remove('open'));
  document.getElementById('statsPanelOverlay').addEventListener('click', e => {
    if (e.target===document.getElementById('statsPanelOverlay'))
      document.getElementById('statsPanelOverlay').classList.remove('open');
  });
  document.querySelectorAll('.sp-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.sp-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); statsPeriod=+btn.dataset.sp;
      await loadStatsData(statsPeriod); renderStats();
    });
  });

  // 상세 패널
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailOverlay').addEventListener('click', e => {
    if (e.target===document.getElementById('detailOverlay')) closeDetail();
  });

  // 폼 모달
  document.getElementById('btnAdd').addEventListener('click', ()=>openForm(null));
  document.getElementById('modalClose').addEventListener('click', closeForm);
  document.getElementById('formCancel').addEventListener('click', closeForm);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target===document.getElementById('modalOverlay')) closeForm();
  });
  document.getElementById('formSave').addEventListener('click', saveSchedule);
  document.getElementById('formCategory').addEventListener('change', ()=>{toggleCompRow();updateCompUI(+document.getElementById('formCompletion').value);});
  document.getElementById('formCompletion').addEventListener('input', e=>updateCompUI(+e.target.value));

  // ESC
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') {
      document.getElementById('statsPanelOverlay').classList.remove('open');
      document.getElementById('detailOverlay').classList.remove('open');
      document.getElementById('modalOverlay').classList.remove('open');
    }
  });
}

// ── 앱 초기화 ──────────────────────────────
async function init() {
  initGNB();
  initPageDate();
  initCalendar();
  initFilters();
  initViewToggle();
  initPanels();

  await Promise.all([loadData(), loadCalendarData()]);
  renderAll();
  renderCalendar();
}

document.addEventListener('DOMContentLoaded', init);
