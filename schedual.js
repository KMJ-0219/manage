// ==========================================
//  StudyHub — schedual.js
//  캘린더 + 일정목록 + 완성도 + 공부시간
// ==========================================

const SUPABASE_URL = 'https://cyqjgixdvlywkzyamerx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_casPdXLoUENk-a-oSC7RiQ_vmg9QmiR';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

// ── 유틸 ──────────────────────────────────
const DAYS_KO = ['일','월','화','수','목','금','토'];
const _pad = n => String(n).padStart(2,'0');
const toDS  = d => `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
const parseDS = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const isoToDS = iso => iso ? toDS(new Date(iso)) : '';
const toISO   = d => `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;
const toDTVal = iso => { if(!iso) return ''; const d=new Date(iso); return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}`; };
const fmtDT   = iso => { if(!iso) return ''; const d=new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`; };
const esc     = s => s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
const isDone  = i => i.s_end === true;

function studyLabel(mins) {
  if (!mins || mins === 0) return null;
  const h = Math.floor(mins/60), m = mins%60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function dDayInfo(ds) {
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((parseDS(ds) - now) / 86400000);
  if (diff === 0) return { text:'D-Day', cls:'dd-today' };
  if (diff > 0 && diff <= 3) return { text:`D-${diff}`, cls:'dd-soon' };
  if (diff > 0) return { text:`D-${diff}`, cls:'dd-normal' };
  return { text:`D+${Math.abs(diff)}`, cls:'dd-past' };
}
function catCls(c) {
  if (!c) return 'cat-none';
  if (c==='과제'||c==='수행') return 'cat-과제';
  if (c==='시험') return 'cat-시험';
  if (c==='약속') return 'cat-약속';
  return 'cat-기타';
}
function catIC(c) {
  if (!c) return '';
  if (c==='과제'||c==='수행') return 'ci-과제';
  if (c==='시험') return 'ci-시험';
  if (c==='약속') return 'ci-약속';
  return 'ci-기타';
}
const CAT_COLOR = {'과제':'var(--cat-과제)','수행':'var(--cat-과제)','시험':'var(--cat-시험)','약속':'var(--cat-약속)'};
const catColor = c => CAT_COLOR[c] || 'var(--cat-기타)';
function progColor(p) {
  if (!p||p===0) return 'var(--border2)';
  if (p<30) return 'var(--red)';
  if (p<70) return 'var(--yellow)';
  if (p<100) return 'var(--accent3)';
  return '#22c55e';
}

// ── 전역 상태 ──────────────────────────────
let allData      = [];
let filteredData = [];
let calSchedules = [];  // 캘린더용 (해당 월 범위)
let statsData    = [];

// 캘린더
let calYear, calMonth;
let compactMode  = false;
let showDday     = false;
let showUpcoming = true;
let nearestExamDate = null;

// 목록 필터
let currentPeriod = 'today';
let currentDone   = 'all';
let currentCat    = 'all';
let currentSort   = 'date-asc';
let searchQuery   = '';
let viewMode      = 'list';

// 상태
let currentDetailId  = null;
let calModalDate     = null;
let statsPeriod      = 7;

// ── GNB ──────────────────────────────────
function initGNB() {
  const h = document.getElementById('hamburger');
  const m = document.getElementById('gnbMenu');
  h.addEventListener('click', () => { h.classList.toggle('open'); m.classList.toggle('open'); });
  m.querySelectorAll('.gnb-link').forEach(l => l.addEventListener('click', () => { h.classList.remove('open'); m.classList.remove('open'); }));
}

function initPageDate() {
  const now = new Date();
  document.getElementById('pageDate').textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

// ══════════════════════════════════════════
//  캘린더 (index.html 로직 100% 이식)
// ══════════════════════════════════════════

async function loadCalendarData() {
  const firstOfMonth = new Date(calYear, calMonth-1, 1);
  const firstDow = firstOfMonth.getDay();
  const calStart = new Date(calYear, calMonth-1, 1-firstDow); calStart.setHours(0,0,0,0);
  const lastOfMonth = new Date(calYear, calMonth, 0);
  const lastDow = lastOfMonth.getDay();
  const calEnd = new Date(calYear, calMonth, 6-lastDow); calEnd.setHours(23,59,59,999);

  try {
    const data = await sbFetch(
      `schedule?s_date=gte.${toISO(calStart)}&s_date=lte.${toISO(calEnd)}&order=s_date.asc&limit=500`
    );
    calSchedules = data || [];

    // 가장 가까운 시험 날짜
    const now = new Date(); const nm = new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const exams = calSchedules
      .filter(d => d.s_category&&d.s_category.includes('시험')&&!isDone(d))
      .map(d => new Date(d.s_date)).filter(d => d >= nm).sort((a,b) => a-b);
    nearestExamDate = exams.length > 0 ? exams[0] : null;
  } catch(e) { calSchedules = []; }
}

function groupByDate(list) {
  const m = {};
  list.forEach(i => {
    if (!i.s_date) return;
    const k = isoToDS(i.s_date);
    if (!m[k]) m[k] = [];
    m[k].push(i);
  });
  return m;
}

function renderCalendar() {
  const grid  = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  label.textContent = `${calYear}.${_pad(calMonth)}`;

  const grouped   = groupByDate(calSchedules);
  const firstDay  = new Date(calYear, calMonth-1, 1).getDay();
  const lastDate  = new Date(calYear, calMonth, 0).getDate();
  const prevLast  = new Date(calYear, calMonth-1, 0).getDate();
  const todayStr  = toDS(new Date());
  const now       = new Date();
  const nm        = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let cells = ''; let dayCount = 0;

  for (let i = firstDay-1; i >= 0; i--) {
    const ds = toDS(new Date(calYear, calMonth-2, prevLast-i));
    cells += buildCell(ds, prevLast-i, true, todayStr, grouped, nm); dayCount++;
  }
  for (let d = 1; d <= lastDate; d++) {
    const ds = toDS(new Date(calYear, calMonth-1, d));
    cells += buildCell(ds, d, false, todayStr, grouped, nm); dayCount++;
  }
  const remaining = Math.ceil(dayCount/7)*7 - dayCount;
  for (let d = 1; d <= remaining; d++) {
    const ds = toDS(new Date(calYear, calMonth, d));
    cells += buildCell(ds, d, true, todayStr, grouped, nm);
  }

  grid.innerHTML = cells;
  grid.className = 'cal-grid' + (compactMode ? ' compact' : '');

  grid.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const ds = cell.dataset.date;
      if (ds) openCalModal(ds, grouped[ds] || []);
    });
  });

  renderUpcoming(grouped, nm);
}

function buildCell(ds, dayNum, otherMonth, todayStr, grouped, nowDate) {
  const cellDate = parseDS(ds);
  const dow = cellDate.getDay();
  const isToday = ds === todayStr;

  let cls = 'cal-cell';
  if (otherMonth) cls += ' other-month';
  if (isToday)    cls += ' today';
  if (dow === 0)  cls += ' sun';
  if (dow === 6)  cls += ' sat';

  // D-day 뱃지
  let ddayHtml = '';
  if (showDday && nearestExamDate) {
    const em = new Date(nearestExamDate); em.setHours(0,0,0,0);
    const cm = parseDS(ds);
    const diff = Math.round((em - cm) / 86400000);
    if (diff === 0)              ddayHtml = `<span class="cal-dday-badge">D-Day</span>`;
    else if (diff>0&&diff<=30)   ddayHtml = `<span class="cal-dday-badge">D-${diff}</span>`;
  }

  const items    = grouped[ds] || [];
  const doneItems = items.filter(i => isDone(i));
  const total    = items.length;
  const done     = doneItems.length;

  // compact용 도트
  const dotColors = {'과제':'var(--cat-과제)','수행':'var(--cat-과제)','시험':'var(--cat-시험)','약속':'var(--cat-약속)'};
  const dotsHtml = items.slice(0,6).map(i => {
    const color = dotColors[i.s_category] || 'var(--cat-기타)';
    return `<span class="cal-dot" style="background:${color};${isDone(i)?'opacity:.35':''}"></span>`;
  }).join('');

  // compact용 진행바
  const pct = total > 0 ? Math.round(done/total*100) : 0;
  const progressHtml = total > 0
    ? `<div class="cal-progress-wrap"><div class="cal-progress-bar" style="width:${pct}%"></div></div>`
    : '<div class="cal-progress-wrap"></div>';
  const doneBadge = total > 0
    ? `<div class="cal-done-badge">${done}/${total}</div>`
    : '<div class="cal-done-badge"></div>';

  // 이벤트 칩 (일반 모드) — 완성도 바 추가
  const MAX = 2;
  const shown = items.slice(0, MAX);
  const more  = items.length - MAX;
  const chipsHtml = shown.map(i => {
    const cc = catCls(i.s_category);
    const p  = i.completion_percent || 0;
    const showProg = (i.s_category==='과제'||i.s_category==='수행') && p > 0 && !isDone(i);
    return `
      <div class="cal-event-chip ${cc} ${isDone(i)?'done':''}">${esc(i.s_name)}</div>
      ${showProg ? `<div class="cal-comp-bar-wrap"><div class="cal-comp-bar" style="width:${p}%;background:${progColor(p)}"></div></div>` : ''}
    `;
  }).join('');
  const moreHtml = more > 0 ? `<div class="cal-more">+${more}개</div>` : '';

  return `
    <div class="${cls}" data-date="${ds}">
      <span class="cal-date-num">${dayNum}</span>
      ${ddayHtml}
      <div class="cal-events">${chipsHtml}${moreHtml}</div>
      <div class="cal-dot-row">${dotsHtml}</div>
      ${progressHtml}
      ${doneBadge}
    </div>`;
}

function renderUpcoming(grouped, nowDate) {
  const panel = document.getElementById('upcomingPanel');
  const list  = document.getElementById('upcomingList');

  if (!showUpcoming) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const items = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(nowDate); d.setDate(d.getDate()+i);
    const key = toDS(d);
    (grouped[key]||[]).forEach(item => { if (!isDone(item)) items.push({...item, _ds: key}); });
  }
  items.sort((a,b) => new Date(a.s_date)-new Date(b.s_date));
  const shown = items.slice(0,5);

  if (shown.length === 0) {
    list.innerHTML = '<div class="empty-msg" style="font-size:.8rem;color:var(--text3);padding:6px 0">7일 이내 미완료 일정이 없습니다.</div>';
    return;
  }
  list.innerHTML = shown.map(i => {
    const dd = dDayInfo(i._ds);
    const isToday = dd.text==='D-Day';
    return `
      <div class="upcoming-item" data-date="${i._ds}">
        <span class="upcoming-dday ${isToday?'today':''}">${dd.text}</span>
        <span class="upcoming-name">${esc(i.s_name)}</span>
        ${i.s_category ? `<span class="upcoming-cat ${catCls(i.s_category)}">${esc(i.s_category)}</span>` : ''}
      </div>`;
  }).join('');

  list.querySelectorAll('.upcoming-item').forEach(el => {
    el.addEventListener('click', () => {
      const ds = el.dataset.date;
      openCalModal(ds, grouped[ds]||[]);
    });
  });
}

function initCalendarControls() {
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
  document.getElementById('btnCompact').addEventListener('click', () => {
    compactMode = !compactMode;
    document.getElementById('btnCompact').classList.toggle('active', compactMode);
    renderCalendar();
  });
  document.getElementById('btnDday').addEventListener('click', () => {
    showDday = !showDday;
    document.getElementById('btnDday').classList.toggle('active', showDday);
    renderCalendar();
  });
  document.getElementById('btnUpcoming').addEventListener('click', () => {
    showUpcoming = !showUpcoming;
    document.getElementById('btnUpcoming').classList.toggle('active', showUpcoming);
    renderCalendar();
  });
}

// ── 캘린더 날짜 클릭 모달 ─────────────────
function openCalModal(ds, items) {
  calModalDate = ds;
  const overlay = document.getElementById('calModalOverlay');
  const d = parseDS(ds);
  document.getElementById('calModalDateLabel').textContent =
    `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일`;

  // D-day (시험인 항목 기준)
  const examItems = items.filter(i => i.s_category&&i.s_category.includes('시험'));
  const ddEl = document.getElementById('calModalDday');
  ddEl.textContent = examItems.length > 0 ? `🎯 ${dDayInfo(ds).text}` : '';

  renderCalModalItems(items);
  overlay.classList.add('open');
}

function closeCalModal() {
  document.getElementById('calModalOverlay').classList.remove('open');
  calModalDate = null;
}

function renderCalModalItems(items) {
  const container = document.getElementById('calModalItems');
  if (items.length === 0) {
    container.innerHTML = '<div style="font-size:.82rem;color:var(--text3);text-align:center;padding:20px 0">이 날의 일정이 없습니다.</div>';
    return;
  }
  container.innerHTML = items.map(item => {
    const cc  = catCls(item.s_category);
    const pct = item.completion_percent || 0;
    const showProg = item.s_category==='과제'||item.s_category==='수행';
    const sl  = studyLabel(item.study_minutes);
    return `
      <div class="modal-item ${isDone(item)?'done':''}" data-id="${item.id}">
        <div class="mi-header">
          <div class="mi-check" data-id="${item.id}">${isDone(item)?'✓':''}</div>
          <div class="mi-name">${esc(item.s_name)}</div>
          ${item.s_category ? `<span class="mi-cat ${cc}">${esc(item.s_category)}</span>` : ''}
        </div>
        <div class="mi-meta">${fmtDT(item.s_date)}${sl?` · ⏱ ${sl}`:''}</div>
        ${item.s_content ? `<div class="mi-meta" style="padding-left:32px">${esc(item.s_content)}</div>` : ''}
        ${showProg ? `
        <div class="mi-prog">
          <div class="sp-head"><span class="sp-label">완성도</span><span class="sp-pct" style="color:${progColor(pct)}">${pct}%</span></div>
          <div class="sp-track"><div class="sp-bar" style="width:${pct}%;background:${progColor(pct)}"></div></div>
        </div>` : ''}
        <div class="mi-actions">
          <button class="mi-btn edit-btn" data-id="${item.id}">✏️ 수정</button>
          <button class="mi-btn danger del-btn" data-id="${item.id}">🗑️ 삭제</button>
        </div>
      </div>`;
  }).join('');

  // 완료 토글
  container.querySelectorAll('.mi-check').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const item = calSchedules.find(s => String(s.id)===btn.dataset.id);
      if (item) await toggleComplete(item.id, !isDone(item));
    });
  });
  // 수정
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = calSchedules.find(s => String(s.id)===btn.dataset.id);
      if (item) { closeCalModal(); openForm(item); }
    });
  });
  // 삭제
  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      await deleteSched(btn.dataset.id);
      closeCalModal();
    });
  });
}

// ══════════════════════════════════════════
//  일정 목록 데이터
// ══════════════════════════════════════════

async function loadListData() {
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
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
  } else {
    start = new Date(now.getFullYear()-1, 0, 1);
    end   = new Date(now.getFullYear()+1, 11, 31, 23,59,59,999);
  }

  const data = await sbFetch(
    `schedule?s_date=gte.${toISO(start)}&s_date=lte.${toISO(end)}&order=s_date.asc&limit=1000`
  );
  allData = data || [];
}

function applyFilters() {
  let r = [...allData];
  if (currentCat !== 'all') {
    r = r.filter(i => {
      const c = i.s_category||'';
      return currentCat==='과제' ? (c==='과제'||c==='수행') : c===currentCat;
    });
  }
  if (currentDone === 'done')   r = r.filter(isDone);
  if (currentDone === 'undone') r = r.filter(i => !isDone(i));
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    r = r.filter(i => (i.s_name||'').toLowerCase().includes(q)||(i.s_content||'').toLowerCase().includes(q));
  }
  if (currentSort==='date-asc')  r.sort((a,b)=>new Date(a.s_date)-new Date(b.s_date));
  if (currentSort==='date-desc') r.sort((a,b)=>new Date(b.s_date)-new Date(a.s_date));
  if (currentSort==='name-asc')  r.sort((a,b)=>(a.s_name||'').localeCompare(b.s_name||''));
  if (currentSort==='progress')  r.sort((a,b)=>(b.completion_percent||0)-(a.completion_percent||0));
  filteredData = r;
}

function updateHeaderStats() {
  const now = new Date();
  const todayStr = toDS(now);
  const todayItems = allData.filter(i => i.s_date && isoToDS(i.s_date)===todayStr);
  const doneToday  = todayItems.filter(isDone).length;
  const pending    = allData.filter(i => !isDone(i)).length;
  const overdue    = allData.filter(i => i.s_date && !isDone(i) && new Date(i.s_date)<now).length;
  const rate       = todayItems.length > 0 ? Math.round(doneToday/todayItems.length*100) : 0;
  const studyToday = todayItems.reduce((s,i) => s+(i.study_minutes||0), 0);

  document.getElementById('hsTotalToday').textContent = todayItems.length;
  document.getElementById('hsDoneToday').textContent  = doneToday;
  document.getElementById('hsPending').textContent    = pending;
  document.getElementById('hsOverdue').textContent    = overdue;
  document.getElementById('hsRate').textContent       = rate+'%';
  document.getElementById('hsProgBar').style.width    = rate+'%';
  document.getElementById('hsStudy').textContent      = studyLabel(studyToday) || '0분';
}

// ── 렌더링 ────────────────────────────────
function renderList() {
  const container = document.getElementById('scheduleList');
  document.getElementById('resultCount').textContent = `${filteredData.length}개`;

  if (filteredData.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="es-ico">📭</div><div class="es-title">일정이 없습니다</div><div class="es-sub">필터를 조정하거나 새 일정을 추가해 보세요.</div></div>`;
    return;
  }

  const now = new Date(); const todayStr = toDS(now);
  const groups = {};
  filteredData.forEach(i => {
    const k = i.s_date ? isoToDS(i.s_date) : 'none';
    if (!groups[k]) groups[k] = [];
    groups[k].push(i);
  });

  let html = '';
  Object.entries(groups).forEach(([ds, items]) => {
    if (ds==='none') return;
    const d = parseDS(ds);
    const isToday = ds===todayStr;
    html += `
      <div class="date-group-hd" data-date="${ds}">
        <span class="dg-date">${d.getMonth()+1}월 ${d.getDate()}일</span>
        <span class="dg-day">${DAYS_KO[d.getDay()]}요일</span>
        ${isToday?'<span class="dg-today-badge">오늘</span>':''}
        <span class="dg-count">${items.length}개</span>
      </div>`;
    items.forEach(i => { html += buildListItem(i, now); });
  });

  container.innerHTML = html;

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

function buildListItem(item, now) {
  const done = isDone(item);
  const ci  = catIC(item.s_category);
  const pct = item.completion_percent || 0;
  const overdue = item.s_date && new Date(item.s_date)<now && !done;
  const dd  = item.s_date ? dDayInfo(isoToDS(item.s_date)) : null;
  const showProg = item.s_category==='과제'||item.s_category==='수행';
  const sl = studyLabel(item.study_minutes);

  const kwHtml = Array.isArray(item.s_keywords)&&item.s_keywords.length
    ? item.s_keywords.map(k=>`<span class="sched-kw">${esc(k)}</span>`).join('') : '';

  const progHtml = showProg ? `
    <div class="sched-progress">
      <div class="sp-head"><span class="sp-label">완성도</span><span class="sp-pct" style="color:${progColor(pct)}">${pct}%</span></div>
      <div class="sp-track"><div class="sp-bar" style="width:${pct}%;background:${progColor(pct)}"></div></div>
    </div>` : '';

  const studyHtml = sl ? `<span class="sched-study-badge">⏱ ${sl}</span>` : '';

  return `
    <div class="sched-item ${ci} ${done?'done':''} ${overdue?'overdue':''}" data-id="${item.id}">
      <button class="sched-check" data-id="${item.id}">${done?'✓':''}</button>
      <div class="sched-info">
        <div class="sched-name">${esc(item.s_name)}</div>
        <div class="sched-meta">
          ${item.s_date?`<span class="sched-time">${fmtDT(item.s_date)}</span>`:''}
          ${item.s_category?`<span class="sched-cat ${catCls(item.s_category)}">${esc(item.s_category)}</span>`:''}
          ${studyHtml}
          ${kwHtml}
        </div>
        ${progHtml}
      </div>
      <div class="sched-right">
        ${dd?`<span class="dd-badge ${dd.cls}">${dd.text}</span>`:''}
      </div>
    </div>`;
}

function renderCards() {
  const container = document.getElementById('scheduleCardGrid');
  document.getElementById('resultCount').textContent = `${filteredData.length}개`;
  if (filteredData.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="es-ico">📭</div><div class="es-title">일정이 없습니다</div></div>`;
    return;
  }
  const now = new Date();
  container.innerHTML = filteredData.map(item => {
    const done = isDone(item); const ci = catIC(item.s_category);
    const pct = item.completion_percent||0; const dd = item.s_date?dDayInfo(isoToDS(item.s_date)):null;
    const showProg = item.s_category==='과제'||item.s_category==='수행';
    const sl = studyLabel(item.study_minutes);
    return `
      <div class="sched-card ${ci} ${done?'done':''}" data-id="${item.id}">
        <div class="card-hd">
          <div>
            <div class="card-name">${esc(item.s_name)}</div>
            ${item.s_category?`<span class="card-cat ${catCls(item.s_category)}">${esc(item.s_category)}</span>`:''}
          </div>
          <button class="card-check" data-id="${item.id}">${done?'✓':''}</button>
        </div>
        <div class="card-meta">${item.s_date?fmtDT(item.s_date):'날짜 없음'}${sl?` · ⏱ ${sl}`:''}</div>
        ${dd?`<div style="margin-bottom:6px"><span class="dd-badge ${dd.cls}">${dd.text}</span></div>`:''}
        ${showProg?`<div class="sp-head"><span class="sp-label">완성도</span><span class="sp-pct" style="color:${progColor(pct)}">${pct}%</span></div><div class="sp-track"><div class="sp-bar" style="width:${pct}%;background:${progColor(pct)}"></div></div>`:''}
      </div>`;
  }).join('');

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

function renderAll() {
  applyFilters(); updateHeaderStats();
  if (viewMode==='list') renderList(); else renderCards();
}

// ══════════════════════════════════════════
//  상세 패널
// ══════════════════════════════════════════

function openDetail(id) {
  const item = allData.find(s => String(s.id)===String(id));
  if (!item) return;
  currentDetailId = String(id);
  const done = isDone(item); const pct = item.completion_percent||0;

  document.getElementById('detailStripe').style.background = catColor(item.s_category);
  document.getElementById('detailCatLabel').textContent = item.s_category||'';

  const checkBtn = document.getElementById('detailCheck');
  checkBtn.innerHTML = done?'✓':'';
  checkBtn.className = 'detail-check-btn'+(done?' checked':'');
  checkBtn.onclick = async () => { await toggleComplete(id, !isDone(item)); };

  document.getElementById('detailTitle').textContent = item.s_name||'';

  const metaEl = document.getElementById('detailMeta');
  const lines = [];
  if (item.s_date) {
    const d = new Date(item.s_date);
    lines.push(`📅 ${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일 ${_pad(d.getHours())}:${_pad(d.getMinutes())} · ${dDayInfo(isoToDS(item.s_date)).text}`);
  }
  if (item.s_category)  lines.push(`🏷 ${item.s_category}`);
  if (item.s_keywords?.length) lines.push(`🔑 ${item.s_keywords.join(', ')}`);
  metaEl.innerHTML = lines.map(l=>`<span>${l}</span>`).join('');

  // 완성도
  const showProg = item.s_category==='과제'||item.s_category==='수행';
  const compBlock = document.getElementById('detailCompBlock');
  compBlock.style.display = showProg ? '' : 'none';
  if (showProg) {
    const pctEl = document.getElementById('detailPct');
    const bar   = document.getElementById('detailBar');
    const slider= document.getElementById('detailSlider');
    pctEl.textContent = pct+'%'; pctEl.style.color = progColor(pct);
    bar.style.width = pct+'%'; bar.style.background = progColor(pct);
    slider.value = pct;
    slider.oninput = () => {
      const v = +slider.value;
      pctEl.textContent=v+'%'; pctEl.style.color=progColor(v);
      bar.style.width=v+'%'; bar.style.background=progColor(v);
    };
    document.getElementById('detailSliderSave').onclick = async () => {
      await updateCompletion(id, +slider.value);
    };
  }

  // 공부 시간
  const studyBlock = document.getElementById('detailStudyBlock');
  const mins = item.study_minutes || 0;
  document.getElementById('detailStudyVal').textContent = studyLabel(mins) || '0분';
  document.getElementById('detailStudyHour').value = Math.floor(mins/60) || '';
  document.getElementById('detailStudyMin').value  = mins%60 || '';
  document.getElementById('detailStudySave').onclick = async () => {
    const h = +(document.getElementById('detailStudyHour').value||0);
    const m = +(document.getElementById('detailStudyMin').value||0);
    await updateStudyTime(id, h*60+m);
  };

  let bodyText = '';
  if (item.s_content) bodyText += item.s_content;
  if (item.s_add)     bodyText += (bodyText?'\n\n':'')+'📎 '+item.s_add;
  document.getElementById('detailContent').textContent = bodyText;

  document.getElementById('detailEdit').onclick = () => { closeDetail(); openForm(item); };
  document.getElementById('detailDelete').onclick = async () => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteSched(id); closeDetail();
  };

  document.getElementById('detailOverlay').classList.add('open');
}
function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  currentDetailId = null;
}

// ══════════════════════════════════════════
//  폼 모달
// ══════════════════════════════════════════

function openForm(item=null, prefillDate=null) {
  document.getElementById('modalTitle').textContent = item?'일정 수정':'새 일정 추가';
  document.getElementById('formId').value       = item?item.id:'';
  document.getElementById('formName').value     = item?(item.s_name||''):'';
  document.getElementById('formDate').value     = item ? toDTVal(item.s_date) : (prefillDate ? `${prefillDate}T09:00` : '');
  document.getElementById('formCategory').value = item?(item.s_category||''):'';
  document.getElementById('formKeywords').value = item?(Array.isArray(item.s_keywords)?item.s_keywords.join(', '):(item.s_keywords||'')):'';
  document.getElementById('formContent').value  = item?(item.s_content||''):'';
  document.getElementById('formAdd').value      = item?(item.s_add||''):'';

  const mins = item?(item.study_minutes||0):0;
  document.getElementById('formStudyHour').value = Math.floor(mins/60)||'';
  document.getElementById('formStudyMin').value  = mins%60||'';
  updateStudyHint();

  const pct = item?(item.completion_percent||0):0;
  const slider = document.getElementById('formCompletion');
  slider.value = pct; updateCompUI(pct);
  toggleCompRow();
  document.getElementById('modalOverlay').classList.add('open');
}

function closeForm() { document.getElementById('modalOverlay').classList.remove('open'); }

function toggleCompRow() {
  const cat = document.getElementById('formCategory').value;
  document.getElementById('completionRow').style.display = (cat==='과제'||cat==='수행')?'':'none';
}
function updateCompUI(pct) {
  const badge = document.getElementById('formCompletionBadge');
  badge.textContent = pct+'%'; badge.style.color = progColor(pct);
  const slider = document.getElementById('formCompletion');
  slider.style.background = `linear-gradient(to right,${progColor(pct)} ${pct}%,var(--border) ${pct}%)`;
}
function updateStudyHint() {
  const h = +(document.getElementById('formStudyHour').value||0);
  const m = +(document.getElementById('formStudyMin').value||0);
  const total = h*60+m;
  document.getElementById('studyTimeHint').textContent = total>0 ? `= 총 ${total}분` : '';
}

// ══════════════════════════════════════════
//  CRUD
// ══════════════════════════════════════════

async function saveSched() {
  const id   = document.getElementById('formId').value;
  const name = document.getElementById('formName').value.trim();
  if (!name) { alert('제목을 입력하세요.'); return; }

  const dateVal = document.getElementById('formDate').value;
  const cat     = document.getElementById('formCategory').value;
  const kwRaw   = document.getElementById('formKeywords').value.trim();
  const kws     = kwRaw ? kwRaw.split(',').map(k=>k.trim()).filter(Boolean) : [];
  const showProg= cat==='과제'||cat==='수행';
  const pct     = showProg ? +document.getElementById('formCompletion').value : 0;
  const sh      = +(document.getElementById('formStudyHour').value||0);
  const sm      = +(document.getElementById('formStudyMin').value||0);

  const body = {
    s_name: name,
    s_date: dateVal ? new Date(dateVal).toISOString() : null,
    s_category: cat||null,
    s_keywords: kws.length ? kws : null,
    s_content: document.getElementById('formContent').value.trim()||null,
    s_add: document.getElementById('formAdd').value.trim()||null,
    completion_percent: pct,
    study_minutes: sh*60+sm,
  };

  try {
    if (id) {
      await sbFetch(`schedule?id=eq.${id}`, { method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify(body) });
    } else {
      body.s_end = false;
      await sbFetch('schedule', { method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(body) });
    }
    closeForm();
    await refresh();
  } catch(e) { console.error(e); alert('저장에 실패했습니다.'); }
}

async function toggleComplete(id, newState) {
  const body = { s_end: newState===true };
  if (newState===true) body.completion_percent = 100;
  try {
    await sbFetch(`schedule?id=eq.${id}`, { method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify(body) });
    await refresh();
    if (currentDetailId===String(id)) openDetail(id);
    if (calModalDate) {
      const grouped = groupByDate(calSchedules);
      renderCalModalItems(grouped[calModalDate]||[]);
    }
  } catch(e) { console.error(e); alert('변경에 실패했습니다.'); }
}

async function updateCompletion(id, pct) {
  try {
    await sbFetch(`schedule?id=eq.${id}`, { method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify({completion_percent:pct, s_end:pct>=100}) });
    await refresh();
    if (currentDetailId===String(id)) openDetail(id);
  } catch(e) { console.error(e); alert('완성도 저장에 실패했습니다.'); }
}

async function updateStudyTime(id, mins) {
  try {
    await sbFetch(`schedule?id=eq.${id}`, { method:'PATCH', headers:{'Prefer':'return=representation'}, body:JSON.stringify({study_minutes:mins}) });
    await refresh();
    if (currentDetailId===String(id)) openDetail(id);
  } catch(e) { console.error(e); alert('공부 시간 저장에 실패했습니다.'); }
}

async function deleteSched(id) {
  try {
    await sbFetch(`schedule?id=eq.${id}`, { method:'DELETE' });
    await refresh();
  } catch(e) { console.error(e); alert('삭제에 실패했습니다.'); }
}

async function refresh() {
  await Promise.all([loadListData(), loadCalendarData()]);
  renderAll();
  renderCalendar();
}

// ══════════════════════════════════════════
//  통계
// ══════════════════════════════════════════

async function loadStatsData(days) {
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate()-days); start.setHours(0,0,0,0);
  const data = await sbFetch(`schedule?s_date=gte.${toISO(start)}&order=s_date.asc&limit=2000`);
  statsData = data||[];
}

function renderStats() {
  const items = statsData;
  const done  = items.filter(isDone);
  const rate  = items.length ? Math.round(done.length/items.length*100) : 0;
  const totalStudy = items.reduce((s,i)=>s+(i.study_minutes||0),0);

  document.getElementById('ss-total').textContent = items.length;
  document.getElementById('ss-done').textContent  = done.length;
  document.getElementById('ss-rate').textContent  = rate+'%';
  document.getElementById('ss-study').textContent = studyLabel(totalStudy) || '0분';

  drawBarChart(items); drawStudyChart(items); drawDonut(items); drawProgDist(items); drawHeatmap();
}

function drawBarChart(items) {
  const canvas = document.getElementById('barChart');
  const ctx = canvas.getContext('2d');
  const days = statsPeriod; const now = new Date();
  const map = {};
  for (let i=days-1;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);map[toDS(d)]={total:0,done:0};}
  items.forEach(i=>{const k=isoToDS(i.s_date);if(!map[k])return;map[k].total++;if(isDone(i))map[k].done++;});
  const labels=Object.keys(map), totals=labels.map(k=>map[k].total), dones=labels.map(k=>map[k].done);
  const maxV=Math.max(...totals,1);
  const bW=22,gap=5,pL=16,pB=22,pT=10,cH=140;
  const cW=labels.length*(bW+gap)+pL;
  canvas.width=cW; canvas.height=cH; canvas.style.width='100%';
  ctx.clearRect(0,0,cW,cH);
  const iH=cH-pB-pT;
  labels.forEach((lbl,i)=>{
    const x=pL+i*(bW+gap), y=pT+iH;
    const tH=Math.round((totals[i]/maxV)*iH), dH=Math.round((dones[i]/maxV)*iH);
    if(totals[i]>0){ctx.fillStyle='rgba(108,143,255,.18)';ctx.beginPath();ctx.roundRect(x,y-tH,bW,tH,[3,3,0,0]);ctx.fill();}
    if(dones[i]>0){ctx.fillStyle='rgba(52,211,153,.75)';ctx.beginPath();ctx.roundRect(x,y-dH,bW,dH,[3,3,0,0]);ctx.fill();}
    if(days<=14||i%(Math.ceil(days/10))===0){
      const d=parseDS(lbl); ctx.fillStyle='#5c6480';ctx.font='8px monospace';ctx.textAlign='center';
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`,x+bW/2,cH-5);
    }
    if(totals[i]>0){ctx.fillStyle='#9aa3bf';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText(`${dones[i]}/${totals[i]}`,x+bW/2,y-tH-3);}
  });
}

function drawStudyChart(items) {
  const canvas = document.getElementById('studyChart');
  const ctx = canvas.getContext('2d');
  const days = statsPeriod; const now = new Date();
  const map = {};
  for (let i=days-1;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);map[toDS(d)]=0;}
  items.forEach(i=>{const k=isoToDS(i.s_date);if(map[k]!==undefined) map[k]+=(i.study_minutes||0);});
  const labels=Object.keys(map), vals=labels.map(k=>map[k]);
  const maxV=Math.max(...vals,1);
  const bW=22,gap=5,pL=16,pB=22,pT=8,cH=120;
  const cW=labels.length*(bW+gap)+pL;
  canvas.width=cW; canvas.height=cH; canvas.style.width='100%';
  ctx.clearRect(0,0,cW,cH);
  const iH=cH-pB-pT;
  labels.forEach((lbl,i)=>{
    const x=pL+i*(bW+gap), y=pT+iH;
    const vH=Math.round((vals[i]/maxV)*iH);
    if(vals[i]>0){
      ctx.fillStyle='rgba(96,165,250,.7)';
      ctx.beginPath();ctx.roundRect(x,y-vH,bW,vH,[3,3,0,0]);ctx.fill();
      if(vH>14){ctx.fillStyle='#60a5fa';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText(vals[i]+'m',x+bW/2,y-vH-3);}
    }
    if(days<=14||i%(Math.ceil(days/10))===0){
      const d=parseDS(lbl);ctx.fillStyle='#5c6480';ctx.font='8px monospace';ctx.textAlign='center';
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`,x+bW/2,cH-5);
    }
  });
}

function drawDonut(items) {
  const canvas=document.getElementById('donutChart');const ctx=canvas.getContext('2d');
  canvas.width=130;canvas.height=130;
  const cx=65,cy=65,r=52,ir=32;
  const cats={'과제/수행':0,'시험':0,'약속':0,'기타':0};
  items.forEach(i=>{
    const c=i.s_category;
    if(c==='과제'||c==='수행') cats['과제/수행']++;
    else if(c==='시험') cats['시험']++;
    else if(c==='약속') cats['약속']++;
    else cats['기타']++;
  });
  const colors=['#6c8fff','#f87171','#34d399','#fbbf24'];
  const keys=Object.keys(cats),vals=keys.map(k=>cats[k]);
  const total=vals.reduce((s,v)=>s+v,0)||1;
  ctx.clearRect(0,0,130,130);
  let angle=-Math.PI/2;
  vals.forEach((v,i)=>{
    const sw=(v/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+sw);ctx.closePath();
    ctx.fillStyle=colors[i];ctx.globalAlpha=.85;ctx.fill();angle+=sw;
  });
  ctx.globalAlpha=1;ctx.beginPath();ctx.arc(cx,cy,ir,0,Math.PI*2);ctx.fillStyle='#1e2230';ctx.fill();
  ctx.fillStyle='#f0f2f8';ctx.font='bold 15px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(total,cx,cy-4);ctx.font='8px sans-serif';ctx.fillStyle='#5c6480';ctx.fillText('전체',cx,cy+9);
  document.getElementById('donutLegend').innerHTML=keys.map((k,i)=>`
    <div class="dl-item"><span class="dl-dot" style="background:${colors[i]}"></span><span>${k}</span><span style="margin-left:auto;font-family:monospace;font-size:.7rem;color:var(--text2)">${vals[i]}</span></div>`).join('');
}

function drawProgDist(items) {
  const buckets=[{l:'0%',min:0,max:0},{l:'1-24%',min:1,max:24},{l:'25-49%',min:25,max:49},{l:'50-74%',min:50,max:74},{l:'75-99%',min:75,max:99},{l:'100%',min:100,max:100}];
  const counts=buckets.map(b=>items.filter(i=>{const p=i.completion_percent||0;return p>=b.min&&p<=b.max}).length);
  const maxC=Math.max(...counts,1);
  const colors=['var(--border2)','var(--red)','var(--yellow)','var(--yellow)','var(--accent3)','#22c55e'];
  document.getElementById('progressDist').innerHTML=buckets.map((b,i)=>`
    <div class="pd-row"><span class="pd-lbl">${b.l}</span><div class="pd-track"><div class="pd-fill" style="width:${Math.round(counts[i]/maxC*100)}%;background:${colors[i]}"></div></div><span class="pd-cnt">${counts[i]}</span></div>`).join('');
}

function drawHeatmap() {
  const wrap=document.getElementById('heatmapWrap');
  const now=new Date();const days=90;
  const start=new Date(now);start.setDate(start.getDate()-days+1);start.setHours(0,0,0,0);
  const doneCounts={};
  statsData.forEach(i=>{if(!i.s_date||!isDone(i))return;const k=isoToDS(i.s_date);doneCounts[k]=(doneCounts[k]||0)+1;});
  const firstDow=start.getDay();
  const cells=[];for(let i=0;i<firstDow;i++)cells.push(null);
  for(let i=0;i<days;i++){const d=new Date(start);d.setDate(start.getDate()+i);cells.push(toDS(d));}
  const weeks=[];for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
  const dowL=['일','월','화','수','목','금','토'];
  let html='<div style="display:flex;gap:3px;align-items:flex-start"><div class="hm-dow-col">';
  dowL.forEach(l=>{html+=`<div class="hm-dow-lbl">${l}</div>`;});
  html+='</div><div class="hm-grid">';
  weeks.forEach(week=>{
    html+='<div class="hm-col">';
    for(let dow=0;dow<7;dow++){
      const ds=week[dow];
      if(!ds){html+='<div style="width:12px;height:12px"></div>';continue;}
      const c=doneCounts[ds]||0;
      const hc=c>=4?'h4':c>=3?'h3':c>=2?'h2':c>=1?'h1':'';
      const d=parseDS(ds);
      html+=`<div class="hm-cell ${hc}" title="${d.getMonth()+1}/${d.getDate()} 완료 ${c}개"></div>`;
    }
    html+='</div>';
  });
  html+='</div></div>';
  html+=`<div class="hm-legend"><span class="hm-leg-lbl">적음</span><div style="display:flex;gap:3px"><div class="hm-cell"></div><div class="hm-cell h1"></div><div class="hm-cell h2"></div><div class="hm-cell h3"></div><div class="hm-cell h4"></div></div><span class="hm-leg-lbl">많음</span></div>`;
  wrap.innerHTML=html;
}

// ══════════════════════════════════════════
//  이벤트 바인딩
// ══════════════════════════════════════════

function initFilters() {
  document.getElementById('filterPeriod').addEventListener('change', async e=>{currentPeriod=e.target.value; await loadListData(); renderAll();});
  document.getElementById('filterDone').addEventListener('change',   e=>{currentDone=e.target.value; renderAll();});
  document.getElementById('filterCat').addEventListener('change',    e=>{currentCat=e.target.value; renderAll();});
  document.getElementById('sortSelect').addEventListener('change',   e=>{currentSort=e.target.value; renderAll();});
  let timer;
  document.getElementById('searchInput').addEventListener('input', e=>{
    clearTimeout(timer); timer=setTimeout(()=>{searchQuery=e.target.value;renderAll();},200);
  });
}

function initViewToggle() {
  document.getElementById('btnListView').addEventListener('click', ()=>{
    viewMode='list';
    document.getElementById('btnListView').classList.add('active');
    document.getElementById('btnCardView').classList.remove('active');
    document.getElementById('listView').classList.remove('hidden');
    document.getElementById('cardView').classList.add('hidden');
    renderList();
  });
  document.getElementById('btnCardView').addEventListener('click', ()=>{
    viewMode='card';
    document.getElementById('btnCardView').classList.add('active');
    document.getElementById('btnListView').classList.remove('active');
    document.getElementById('cardView').classList.remove('hidden');
    document.getElementById('listView').classList.add('hidden');
    renderCards();
  });
}

function initPanels() {
  // 통계
  document.getElementById('btnStats').addEventListener('click', async()=>{
    document.getElementById('statsPanelOverlay').classList.add('open');
    await loadStatsData(statsPeriod); renderStats();
  });
  document.getElementById('statsPanelClose').addEventListener('click',()=>document.getElementById('statsPanelOverlay').classList.remove('open'));
  document.getElementById('statsPanelOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('statsPanelOverlay'))document.getElementById('statsPanelOverlay').classList.remove('open');});
  document.querySelectorAll('.sp-btn').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      document.querySelectorAll('.sp-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); statsPeriod=+btn.dataset.sp;
      await loadStatsData(statsPeriod); renderStats();
    });
  });

  // 상세 패널
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('detailOverlay'))closeDetail();});

  // 폼 모달
  document.getElementById('btnAdd').addEventListener('click',()=>openForm(null));
  document.getElementById('modalClose').addEventListener('click', closeForm);
  document.getElementById('formCancel').addEventListener('click', closeForm);
  document.getElementById('modalOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('modalOverlay'))closeForm();});
  document.getElementById('formSave').addEventListener('click', saveSched);
  document.getElementById('formCategory').addEventListener('change',()=>{toggleCompRow();updateCompUI(+document.getElementById('formCompletion').value);});
  document.getElementById('formCompletion').addEventListener('input',e=>updateCompUI(+e.target.value));
  document.getElementById('formStudyHour').addEventListener('input', updateStudyHint);
  document.getElementById('formStudyMin').addEventListener('input',  updateStudyHint);

  // 캘린더 모달
  document.getElementById('calModalClose').addEventListener('click', closeCalModal);
  document.getElementById('calModalOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('calModalOverlay'))closeCalModal();});
  document.getElementById('calModalAddBtn').addEventListener('click',()=>{closeCalModal();openForm(null, calModalDate);});

  // ESC
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      document.getElementById('statsPanelOverlay').classList.remove('open');
      document.getElementById('detailOverlay').classList.remove('open');
      document.getElementById('modalOverlay').classList.remove('open');
      document.getElementById('calModalOverlay').classList.remove('open');
    }
  });
}

// ── 초기화 ────────────────────────────────
async function init() {
  initGNB();
  initPageDate();
  initCalendarControls();
  initFilters();
  initViewToggle();
  initPanels();

  try {
    await Promise.all([loadListData(), loadCalendarData()]);
    renderAll();
    renderCalendar();
  } catch(e) {
    console.error('초기 로딩 실패:', e);
    document.getElementById('scheduleList').innerHTML =
      '<div class="empty-state"><div class="es-ico">⚠️</div><div class="es-title">데이터를 불러오지 못했습니다</div></div>';
  }
}

document.addEventListener('DOMContentLoaded', init);
