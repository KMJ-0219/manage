// ==========================================
//  StudyHub — homepage.js  (통합 완성본)
//  Supabase · 캘린더 · 완성도 · 공부시간 · 통계
// ==========================================

// ── Supabase ───────────────────────────────
const SUPABASE_URL = 'https://cyqjgixdvlywkzyamerx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_casPdXLoUENk-a-oSC7RiQ_vmg9QmiR';

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
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

function getNow() { return new Date(); }

function toDateStr(d) {
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}
function isoToDateStr(iso) {
  if (!iso) return '';
  return toDateStr(new Date(iso));
}
function parseDateStr(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function toLocalISO(d) {
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;
}
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}
function dDay(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((parseDateStr(dateStr) - now) / 86400000);
  if (diff === 0) return 'D-Day';
  if (diff > 0)  return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}
function dDayClass(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((parseDateStr(dateStr) - now) / 86400000);
  if (diff === 0)            return 'today';
  if (diff > 0 && diff <= 3) return 'soon';
  if (diff > 0)              return 'future';
  return 'past';
}
function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function catClass(cat) {
  if (!cat) return 'cat-default';
  if (cat === '과제' || cat === '수행') return 'cat-과제';
  if (cat === '시험') return 'cat-시험';
  if (cat === '약속') return 'cat-약속';
  return 'cat-기타';
}
function isDone(item) { return item.s_end === true; }

// 완성도 색상
function progColor(p) {
  if (!p || p === 0) return 'var(--border2)';
  if (p < 30)  return 'var(--accent-red)';
  if (p < 70)  return 'var(--accent-yellow)';
  if (p < 100) return 'var(--accent3)';
  return '#22c55e';
}

// 공부시간 → 표시 문자열
function studyLabel(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

// ── 전역 상태 ──────────────────────────────
let allSchedules     = [];
let calYear, calMonth;
let compactMode      = false;
let showDday         = false;
let showUpcoming     = true;
let nearestExamDate  = null;
let modalCurrentDate = null;

// 통계
let statsData   = [];
let statsPeriod = 7;

// ==========================================
//  GNB
// ==========================================
function initGNB() {
  const gnb       = document.getElementById('gnb');
  const hamburger = document.getElementById('hamburger');
  const menu      = document.getElementById('gnbMenu');

  window.addEventListener('scroll', () => {
    gnb.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    menu.classList.toggle('open');
  });
  menu.querySelectorAll('.gnb-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      menu.classList.remove('open');
    });
  });
}

// ── Hero 날짜 ──────────────────────────────
function initHeroDate() {
  const now = getNow();
  document.getElementById('heroDate').textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

// ── Stat card 클릭 ─────────────────────────
function initStatCards() {
  document.querySelectorAll('.stat-card[data-href]').forEach(card => {
    card.addEventListener('click', () => {
      const href = card.dataset.href;
      if (href.includes('#')) {
        const id = href.split('#')[1];
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        location.href = href;
      }
    });
  });
}

// ==========================================
//  오늘의 일정
// ==========================================
async function loadTodaySchedule() {
  const now      = getNow();
  const start    = new Date(now); start.setHours(0,0,0,0);
  const end      = new Date(now); end.setHours(23,59,59,999);

  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${toLocalISO(start)}&s_date=lte.${toLocalISO(end)}&order=s_date.asc&limit=20`
    );

    const doneCount  = data.filter(isDone).length;
    const pct        = data.length > 0 ? Math.round(doneCount / data.length * 100) : 0;
    const studyToday = data.reduce((s,i) => s + (i.study_minutes||0), 0);

    // 스탯 업데이트
    document.getElementById('statToday').textContent = data.length;
    document.getElementById('statDone').textContent  = doneCount;
    document.getElementById('statProgressBar').style.width = pct + '%';

    const sl = studyLabel(studyToday);
    const studyEl  = document.getElementById('statStudy');
    const studySub = document.getElementById('statStudySub');
    if (studyToday <= 0) {
      studyEl.textContent  = '—';
      studySub.textContent = '분';
    } else if (Math.floor(studyToday / 60) > 0) {
      studyEl.textContent  = Math.floor(studyToday / 60);
      studySub.textContent = '시간';
    } else {
      studyEl.textContent  = studyToday % 60;
      studySub.textContent = '분';
    }

    const doneCountEl = document.getElementById('todayDoneCount');
    doneCountEl.textContent = data.length > 0 ? `${doneCount}/${data.length} 완료` : '';

    const list = document.getElementById('todayList');
    if (data.length === 0) {
      list.innerHTML = '<li class="empty-msg">오늘 예정된 일정이 없습니다.</li>';
      return;
    }

    list.innerHTML = data.map(item => buildTodayItem(item, now)).join('');
    bindTodayEvents(list, data);
  } catch(e) {
    console.error('오늘 일정 로드 실패:', e);
    document.getElementById('todayList').innerHTML = '<li class="empty-msg">일정을 불러오지 못했습니다.</li>';
    document.getElementById('statToday').textContent = '—';
    document.getElementById('statDone').textContent  = '—';
  }
}

function buildTodayItem(item, now) {
  const done     = isDone(item);
  const cat      = item.s_category || '';
  const scCls    = cat ? `sc-${cat}` : '';
  const cc       = catClass(cat);
  const pct      = item.completion_percent || 0;
  const isAssign = cat === '과제' || cat === '수행';
  const sl       = studyLabel(item.study_minutes);
  const ds       = item.s_date ? isoToDateStr(item.s_date) : null;
  const ddText   = ds ? dDay(ds) : null;
  const ddCls    = ds ? dDayClass(ds) : '';
  const overdue  = item.s_date && new Date(item.s_date) < now && !done;

  const progHtml = isAssign ? `
    <div class="s-prog-wrap">
      <div class="s-prog-bar-row">
        <span class="s-prog-label">완성도</span>
        <span class="s-prog-pct" style="color:${progColor(pct)}">${pct}%</span>
      </div>
      <div class="s-prog-track">
        <div class="s-prog-fill" style="width:${pct}%;background:${progColor(pct)}"></div>
      </div>
    </div>` : '';

  return `
    <li class="schedule-item ${scCls} ${done ? 'done' : ''} ${overdue ? 'overdue' : ''}" data-id="${item.id}">
      <div class="s-check today-check" data-id="${item.id}">${done ? '✓' : ''}</div>
      <div class="s-info">
        <div class="s-name">${escapeHtml(item.s_name)}</div>
        <div class="s-meta">
          ${item.s_date ? `<span class="s-time">${formatDateTime(item.s_date)}</span>` : ''}
          ${cat ? `<span class="s-cat ${cc}">${escapeHtml(cat)}</span>` : ''}
          ${sl ? `<span class="s-study-badge">⏱ ${sl}</span>` : ''}
        </div>
        ${progHtml}
      </div>
      <div class="s-right">
        ${ddText ? `<span class="s-dday ${ddCls}">${ddText}</span>` : ''}
      </div>
    </li>`;
}

function bindTodayEvents(list, data) {
  list.querySelectorAll('.today-check').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const item = data.find(s => String(s.id) === btn.dataset.id);
      if (!item) return;
      await toggleComplete(btn.dataset.id, !isDone(item));
      await loadTodaySchedule();
    });
  });
  list.querySelectorAll('.schedule-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.today-check')) return;
      const id   = el.dataset.id;
      const item = data.find(s => String(s.id) === id);
      if (!item || !item.s_date) return;
      const ds      = isoToDateStr(item.s_date);
      const grouped = groupByDate(allSchedules);
      openModal(ds, grouped[ds] || data.filter(s => s.s_date && isoToDateStr(s.s_date) === ds));
    });
  });
}

// ── 이번 주 수업 ────────────────────────────
async function loadWeeklyClassHours() {
  try {
    const data = await supabaseFetch('timeschedule?select=ts_s_time,ts_e_time');
    let total = 0;
    (data || []).forEach(item => {
      if (item.ts_s_time && item.ts_e_time) {
        const [sh,sm] = item.ts_s_time.split(':').map(Number);
        const [eh,em] = item.ts_e_time.split(':').map(Number);
        total += (eh*60+em) - (sh*60+sm);
      }
    });
    document.getElementById('statClass').textContent = Math.round(total / 60);
  } catch(e) {
    document.getElementById('statClass').textContent = '—';
  }
}

// ── 시험 목록 ──────────────────────────────
async function loadExams() {
  try {
    const now  = new Date(); now.setHours(0,0,0,0);
    const data = await supabaseFetch(`schedule?s_category=eq.시험&s_end=eq.false&order=s_date.asc&limit=5`);
    const upcoming = (data || []).filter(d => d.s_date && new Date(d.s_date) >= now);

    if (upcoming.length > 0) {
      const diff = Math.round((new Date(upcoming[0].s_date) - now) / 86400000);
      document.getElementById('statExam').textContent = diff;
    } else {
      document.getElementById('statExam').textContent = '—';
    }

    const examList = document.getElementById('examList');
    if (upcoming.length === 0) {
      examList.innerHTML = '<p class="empty-msg">다가오는 시험이 없습니다.</p>';
      return;
    }
    examList.innerHTML = upcoming.map(item => {
      const ds = isoToDateStr(item.s_date);
      return `
        <div class="exam-item">
          <span class="exam-dday">${dDay(ds)}</span>
          <span class="exam-name">${escapeHtml(item.s_name)}</span>
          <span class="exam-date">${formatDateTime(item.s_date)}</span>
        </div>`;
    }).join('');
  } catch(e) {
    document.getElementById('statExam').textContent = '—';
    document.getElementById('examList').innerHTML = '<p class="empty-msg">시험 정보를 불러오지 못했습니다.</p>';
  }
}

// ==========================================
//  캘린더 시스템
// ==========================================
async function loadCalendarData(year, month) {
  const firstOfMonth = new Date(year, month-1, 1);
  const firstDow     = firstOfMonth.getDay();
  const calStart     = new Date(year, month-1, 1-firstDow); calStart.setHours(0,0,0,0);
  const lastOfMonth  = new Date(year, month, 0);
  const lastDow      = lastOfMonth.getDay();
  const calEnd       = new Date(year, month, 6-lastDow); calEnd.setHours(23,59,59,999);

  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${toLocalISO(calStart)}&s_date=lte.${toLocalISO(calEnd)}&order=s_date.asc&limit=500`
    );
    allSchedules = data || [];

    const now = new Date();
    const nm  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const exams = allSchedules
      .filter(d => d.s_category && d.s_category.includes('시험') && !isDone(d))
      .map(d => new Date(d.s_date))
      .filter(d => d >= nm)
      .sort((a,b) => a-b);
    nearestExamDate = exams.length > 0 ? exams[0] : null;

    if (nearestExamDate) {
      const diff = Math.round((nearestExamDate - nm) / 86400000);
      document.getElementById('statExam').textContent = diff;
    }
  } catch(e) {
    console.error('캘린더 데이터 로드 실패:', e);
    allSchedules = [];
  }
}

function groupByDate(list) {
  const map = {};
  list.forEach(item => {
    if (!item.s_date) return;
    const k = isoToDateStr(item.s_date);
    if (!map[k]) map[k] = [];
    map[k].push(item);
  });
  return map;
}

function renderCalendar() {
  const grid  = document.getElementById('calGrid');
  document.getElementById('calMonthLabel').textContent = `${calYear}.${_pad(calMonth)}`;

  const grouped      = groupByDate(allSchedules);
  const firstDay     = new Date(calYear, calMonth-1, 1).getDay();
  const lastDate     = new Date(calYear, calMonth, 0).getDate();
  const prevLastDate = new Date(calYear, calMonth-1, 0).getDate();
  const todayStr     = toDateStr(getNow());
  const now          = new Date();
  const nm           = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let cells = '', dayCount = 0;

  for (let i = firstDay-1; i >= 0; i--) {
    const d = prevLastDate-i;
    cells += buildCell(toDateStr(new Date(calYear, calMonth-2, d)), d, true, todayStr, grouped, nm);
    dayCount++;
  }
  for (let d = 1; d <= lastDate; d++) {
    cells += buildCell(toDateStr(new Date(calYear, calMonth-1, d)), d, false, todayStr, grouped, nm);
    dayCount++;
  }
  const rem = Math.ceil(dayCount/7)*7 - dayCount;
  for (let d = 1; d <= rem; d++) {
    cells += buildCell(toDateStr(new Date(calYear, calMonth, d)), d, true, todayStr, grouped, nm);
  }

  grid.innerHTML = cells;
  grid.className = 'cal-grid' + (compactMode ? ' compact' : '');

  grid.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      if (date) openModal(date, grouped[date] || []);
    });
  });

  renderUpcoming(grouped, nm);
}

function buildCell(dateStr, dayNum, otherMonth, todayStr, grouped, nowDate) {
  const dow     = parseDateStr(dateStr).getDay();
  const isToday = dateStr === todayStr;

  let cls = 'cal-cell';
  if (otherMonth) cls += ' other-month';
  if (isToday)    cls += ' today';
  if (dow === 0)  cls += ' sun';
  if (dow === 6)  cls += ' sat';

  // D-day 뱃지
  let ddayHtml = '';
  if (showDday && nearestExamDate) {
    const em   = new Date(nearestExamDate); em.setHours(0,0,0,0);
    const diff = Math.round((em - parseDateStr(dateStr)) / 86400000);
    if (diff === 0)              ddayHtml = `<span class="cal-dday-badge">D-Day</span>`;
    else if (diff > 0 && diff <= 30) ddayHtml = `<span class="cal-dday-badge">D-${diff}</span>`;
  }

  const items     = grouped[dateStr] || [];
  const doneCount = items.filter(isDone).length;
  const total     = items.length;

  // compact용 도트
  const dotMap  = {'과제':'var(--cat-과제)','수행':'var(--cat-과제)','시험':'var(--cat-시험)','약속':'var(--cat-약속)'};
  const dotsHtml = items.slice(0,6).map(i => {
    const color = dotMap[i.s_category] || 'var(--cat-기타)';
    return `<span class="cal-dot" style="background:${color};${isDone(i)?'opacity:.35':''}"></span>`;
  }).join('');

  const pct = total > 0 ? Math.round(doneCount/total*100) : 0;
  const progressHtml = total > 0
    ? `<div class="cal-progress-wrap"><div class="cal-progress-bar" style="width:${pct}%"></div></div>`
    : '<div class="cal-progress-wrap"></div>';
  const doneBadge = total > 0
    ? `<div class="cal-done-badge">${doneCount}/${total}</div>`
    : '<div class="cal-done-badge"></div>';

  // 이벤트 칩 + 완성도 바
  const MAX   = 3;
  const shown = items.slice(0, MAX);
  const more  = items.length - MAX;

  const chipsHtml = shown.map(item => {
    const cc       = catClass(item.s_category);
    const isAssign = item.s_category === '과제' || item.s_category === '수행';
    const p        = item.completion_percent || 0;
    const compBar  = isAssign && !isDone(item) && p > 0
      ? `<div class="cal-comp-bar" style="background:${progColor(p)};width:${p}%"></div>` : '';
    return `<div class="cal-event-chip ${cc} ${isDone(item)?'done':''}">${escapeHtml(item.s_name)}${compBar}</div>`;
  }).join('');
  const moreHtml = more > 0 ? `<div class="cal-more">+${more}개 더</div>` : '';

  return `
    <div class="${cls}" data-date="${dateStr}">
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

  const upcoming = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(nowDate); d.setDate(d.getDate()+i);
    const key = toDateStr(d);
    (grouped[key]||[]).forEach(item => {
      if (!isDone(item)) upcoming.push({...item, _dateStr: key});
    });
  }
  upcoming.sort((a,b) => new Date(a.s_date)-new Date(b.s_date));
  const shown = upcoming.slice(0,5);

  if (shown.length === 0) {
    list.innerHTML = '<div class="empty-msg" style="padding:8px 0">7일 이내 미완료 일정이 없습니다.</div>';
    return;
  }
  list.innerHTML = shown.map(item => {
    const dd = dDay(item._dateStr);
    const cc = catClass(item.s_category);
    return `
      <div class="upcoming-item" data-date="${item._dateStr}">
        <span class="upcoming-dday ${dd==='D-Day'?'today':''}">${dd}</span>
        <span class="upcoming-name">${escapeHtml(item.s_name)}</span>
        ${item.s_category?`<span class="upcoming-cat ${cc}">${escapeHtml(item.s_category)}</span>`:''}
      </div>`;
  }).join('');

  list.querySelectorAll('.upcoming-item').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.dataset.date;
      openModal(date, grouped[date]||[]);
    });
  });
}

function initCalendarControls() {
  const now = getNow();
  calYear = now.getFullYear(); calMonth = now.getMonth()+1;

  document.getElementById('calPrev').addEventListener('click', async () => {
    calMonth--; if (calMonth < 1) { calMonth=12; calYear--; }
    await loadCalendarData(calYear, calMonth); renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', async () => {
    calMonth++; if (calMonth > 12) { calMonth=1; calYear++; }
    await loadCalendarData(calYear, calMonth); renderCalendar();
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
  document.getElementById('btnUpcoming').classList.add('active');

  // 통계 버튼
  document.getElementById('btnStats').addEventListener('click', async () => {
    openStats();
    await loadStatsData(statsPeriod);
    renderStats();
  });
}

// ==========================================
//  날짜 클릭 모달
// ==========================================
function openModal(dateStr, items) {
  modalCurrentDate = dateStr;
  const d = parseDateStr(dateStr);
  document.getElementById('modalDateLabel').textContent =
    `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일`;

  const examItems = items.filter(i => i.s_category && i.s_category.includes('시험'));
  document.getElementById('modalDday').textContent =
    examItems.length > 0 ? `🎯 ${dDay(dateStr)}` : '';

  renderModalItems(items);
  hideForm();
  document.getElementById('formDate').value = `${dateStr}T09:00`;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalCurrentDate = null;
}

function renderModalItems(items) {
  const container = document.getElementById('modalItems');
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-msg">이 날의 일정이 없습니다.</div>';
    return;
  }
  container.innerHTML = items.map(item => {
    const cc       = catClass(item.s_category);
    const pct      = item.completion_percent || 0;
    const sl       = studyLabel(item.study_minutes);
    const isAssign = item.s_category === '과제' || item.s_category === '수행';

    return `
      <div class="modal-item ${isDone(item)?'done':''}" data-id="${item.id}">
        <div class="modal-item-header">
          <div class="modal-item-check" data-id="${item.id}">${isDone(item)?'✓':''}</div>
          <div class="modal-item-name">${escapeHtml(item.s_name)}</div>
          ${item.s_category?`<span class="modal-item-cat ${cc}">${escapeHtml(item.s_category)}</span>`:''}
        </div>
        <div class="modal-item-meta">
          ${formatDateTime(item.s_date)}
          ${sl ? ` &nbsp;·&nbsp; ⏱ ${sl}` : ''}
        </div>
        ${item.s_content?`<div class="modal-item-content">${escapeHtml(item.s_content)}</div>`:''}
        ${item.s_add?`<div class="modal-item-content" style="color:var(--text3)">📎 ${escapeHtml(item.s_add)}</div>`:''}
        ${isAssign ? `
        <div class="modal-item-comp">
          <div class="modal-item-comp-row">
            <span class="modal-item-comp-label">과제 완성도</span>
            <span class="modal-item-comp-pct" style="color:${progColor(pct)}">${pct}%</span>
          </div>
          <div class="modal-item-comp-track">
            <div class="modal-item-comp-fill" style="width:${pct}%;background:${progColor(pct)}"></div>
          </div>
        </div>` : ''}
        <div class="modal-item-actions">
          <button class="modal-item-btn edit-btn" data-id="${item.id}">✏️ 수정</button>
          <button class="modal-item-btn danger del-btn" data-id="${item.id}">🗑️ 삭제</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.modal-item-check').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const item = allSchedules.find(s => String(s.id) === btn.dataset.id);
      if (!item) return;
      await toggleComplete(btn.dataset.id, !isDone(item));
    });
  });
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = allSchedules.find(s => String(s.id) === btn.dataset.id);
      if (!item) return;
      populateForm(item); showForm();
    });
  });
  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      await deleteSchedule(btn.dataset.id);
    });
  });
}

function showForm() {
  document.getElementById('modalForm').classList.add('visible');
  document.getElementById('modalAddBtn').style.display = 'none';
}
function hideForm() {
  document.getElementById('modalForm').classList.remove('visible');
  document.getElementById('modalAddBtn').style.display = '';
  clearForm();
}
function clearForm() {
  document.getElementById('formId').value       = '';
  document.getElementById('formName').value     = '';
  document.getElementById('formDate').value     = modalCurrentDate ? `${modalCurrentDate}T09:00` : '';
  document.getElementById('formCategory').value = '';
  document.getElementById('formKeywords').value = '';
  document.getElementById('formContent').value  = '';
  document.getElementById('formAdd').value      = '';
  document.getElementById('formComp').value     = 0;
  document.getElementById('formStudyH').value   = '';
  document.getElementById('formStudyM').value   = '';
  updateCompUI(0);
  updateStudyHint();
  toggleCompRow();
}
function populateForm(item) {
  document.getElementById('formId').value       = item.id;
  document.getElementById('formName').value     = item.s_name || '';
  document.getElementById('formDate').value     = toLocalDatetimeValue(item.s_date);
  document.getElementById('formCategory').value = item.s_category || '';
  document.getElementById('formKeywords').value = Array.isArray(item.s_keywords)
    ? item.s_keywords.join(', ') : (item.s_keywords || '');
  document.getElementById('formContent').value  = item.s_content || '';
  document.getElementById('formAdd').value      = item.s_add || '';

  const pct = item.completion_percent || 0;
  document.getElementById('formComp').value = pct;
  updateCompUI(pct);
  toggleCompRow();

  // 공부시간: study_minutes → 시간 / 분 분리
  const mins = item.study_minutes || 0;
  document.getElementById('formStudyH').value = mins >= 60 ? Math.floor(mins / 60) : '';
  document.getElementById('formStudyM').value = mins % 60 !== 0 ? mins % 60 : (mins > 0 && mins < 60 ? mins : '');
  updateStudyHint();
}

function toggleCompRow() {
  const cat = document.getElementById('formCategory').value;
  document.getElementById('formCompRow').style.display =
    (cat === '과제' || cat === '수행') ? '' : 'none';
}
function updateCompUI(pct) {
  const badge  = document.getElementById('formCompBadge');
  badge.textContent    = pct + '%';
  badge.style.color    = progColor(pct);
  badge.style.borderColor = progColor(pct);
  badge.style.background  = pct >= 100
    ? 'rgba(34,197,94,0.12)' : 'rgba(108,143,255,0.12)';
  const slider = document.getElementById('formComp');
  slider.style.background =
    `linear-gradient(to right, ${progColor(pct)} ${pct}%, var(--border) ${pct}%)`;
}
function updateStudyHint() {
  const h     = parseInt(document.getElementById('formStudyH').value) || 0;
  const m     = parseInt(document.getElementById('formStudyM').value) || 0;
  const total = h * 60 + m;
  document.getElementById('formStudyHint').textContent =
    total > 0 ? `= 총 ${total}분` : '';
}

function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('modalAddBtn').addEventListener('click', () => { clearForm(); showForm(); });
  document.getElementById('formCancel').addEventListener('click', hideForm);
  document.getElementById('formSave').addEventListener('click', saveSchedule);

  document.getElementById('formCategory').addEventListener('change', () => {
    toggleCompRow();
    updateCompUI(parseInt(document.getElementById('formComp').value) || 0);
  });
  document.getElementById('formComp').addEventListener('input', e => updateCompUI(parseInt(e.target.value)));
  document.getElementById('formStudyH').addEventListener('input', updateStudyHint);
  document.getElementById('formStudyM').addEventListener('input', updateStudyHint);

  // 오늘 일정에 추가 버튼
  document.getElementById('btnAddToday').addEventListener('click', () => {
    const today = toDateStr(getNow());
    modalCurrentDate = today;
    clearForm();
    document.getElementById('modalDateLabel').textContent = '새 일정 추가';
    document.getElementById('modalDday').textContent = '';
    document.getElementById('modalItems').innerHTML = '';
    document.getElementById('modalAddBtn').style.display = 'none';
    showForm();
    document.getElementById('modalOverlay').classList.add('open');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeStats(); }
  });
}

// ==========================================
//  CRUD
// ==========================================
async function saveSchedule() {
  const id   = document.getElementById('formId').value;
  const name = document.getElementById('formName').value.trim();
  if (!name) { alert('제목을 입력하세요.'); return; }

  const dateVal  = document.getElementById('formDate').value;
  const cat      = document.getElementById('formCategory').value;
  const kwRaw    = document.getElementById('formKeywords').value.trim();
  const keywords = kwRaw ? kwRaw.split(',').map(k => k.trim()).filter(Boolean) : [];
  const isAssign = cat === '과제' || cat === '수행';
  const pct      = isAssign ? (parseInt(document.getElementById('formComp').value) || 0) : 0;

  // 공부시간 — 빈 칸은 0으로 처리, 정수만 허용
  const rawH = document.getElementById('formStudyH').value.trim();
  const rawM = document.getElementById('formStudyM').value.trim();
  const studyH = rawH !== '' ? Math.max(0, parseInt(rawH) || 0) : 0;
  const studyM = rawM !== '' ? Math.max(0, Math.min(59, parseInt(rawM) || 0)) : 0;
  const study_minutes = studyH * 60 + studyM;

  const body = {
    s_name:             name,
    s_date:             dateVal ? new Date(dateVal).toISOString() : null,
    s_category:         cat || null,
    s_keywords:         keywords.length > 0 ? keywords : null,
    s_content:          document.getElementById('formContent').value.trim() || null,
    s_add:              document.getElementById('formAdd').value.trim() || null,
    completion_percent: pct,
    study_minutes:      study_minutes,
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
    hideForm();
    await refreshAll();
    if (modalCurrentDate) {
      const grouped = groupByDate(allSchedules);
      renderModalItems(grouped[modalCurrentDate] || []);
    }
  } catch(e) {
    console.error('저장 실패:', e);
    alert('저장에 실패했습니다.');
  }
}

async function toggleComplete(id, newState) {
  const body = { s_end: newState === true };
  if (newState === true) body.completion_percent = 100;
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
    await refreshAll();
    if (modalCurrentDate) {
      const grouped = groupByDate(allSchedules);
      renderModalItems(grouped[modalCurrentDate] || []);
    }
  } catch(e) {
    console.error('완료 토글 실패:', e);
    alert('완료 상태 변경에 실패했습니다.');
  }
}

async function deleteSchedule(id) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, { method: 'DELETE' });
    await refreshAll();
    if (modalCurrentDate) {
      const grouped = groupByDate(allSchedules);
      renderModalItems(grouped[modalCurrentDate] || []);
    }
  } catch(e) {
    console.error('삭제 실패:', e);
    alert('삭제에 실패했습니다.');
  }
}

async function refreshAll() {
  await Promise.all([
    loadCalendarData(calYear, calMonth),
    loadTodaySchedule()
  ]);
  renderCalendar();
}

// ==========================================
//  통계 패널
// ==========================================
async function loadStatsData(days) {
  const now   = getNow();
  const start = new Date(now); start.setDate(start.getDate()-days); start.setHours(0,0,0,0);
  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${toLocalISO(start)}&order=s_date.asc&limit=2000`
    );
    statsData = data || [];
  } catch(e) { statsData = []; }
}

function renderStats() {
  const items      = statsData;
  const done       = items.filter(isDone);
  const rate       = items.length ? Math.round(done.length / items.length * 100) : 0;
  const totalStudy = items.reduce((s,i) => s + (i.study_minutes||0), 0);

  document.getElementById('ss-total').textContent = items.length;
  document.getElementById('ss-done').textContent  = done.length;
  document.getElementById('ss-rate').textContent  = rate + '%';
  document.getElementById('ss-study').textContent = studyLabel(totalStudy) || '0분';

  drawBarChart(items);
  drawStudyChart(items);
  drawDonut(items);
  drawProgDist(items);
  drawHeatmap();
}

// ── 일별 달성 막대 ────────────────────────
function drawBarChart(items) {
  const canvas = document.getElementById('barChart');
  const ctx    = canvas.getContext('2d');
  const days   = statsPeriod;
  const now    = getNow();

  const map = {};
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate()-i);
    map[toDateStr(d)] = { total:0, done:0 };
  }
  items.forEach(i => {
    const k = isoToDateStr(i.s_date);
    if (!map[k]) return;
    map[k].total++;
    if (isDone(i)) map[k].done++;
  });

  const labels = Object.keys(map);
  const totals = labels.map(k => map[k].total);
  const dones  = labels.map(k => map[k].done);
  const maxV   = Math.max(...totals, 1);

  const bW=22, gap=4, pL=28, pB=26, pT=14, cH=160;
  const cW = labels.length*(bW+gap)+pL+8;
  canvas.width  = Math.max(cW, 280);
  canvas.height = cH;
  canvas.style.width = '100%';
  ctx.clearRect(0, 0, canvas.width, cH);
  const iH = cH - pB - pT;

  // y축 눈금선
  [0.25,0.5,0.75,1].forEach(n => {
    const y = pT + iH - n*iH;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(canvas.width-4,y); ctx.stroke();
    ctx.fillStyle = '#5c6480'; ctx.font = '8px monospace'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxV*n), pL-4, y+3);
  });

  labels.forEach((lbl, i) => {
    const x  = pL + i*(bW+gap);
    const y  = pT + iH;
    const tH = Math.round((totals[i]/maxV)*iH);
    const dH = Math.round((dones[i]/maxV)*iH);

    if (totals[i] > 0) {
      ctx.fillStyle = 'rgba(108,143,255,0.28)';
      ctx.beginPath(); ctx.roundRect(x, y-tH, bW, tH, [3,3,0,0]); ctx.fill();
    }
    if (dones[i] > 0) {
      ctx.fillStyle = '#34d399'; ctx.globalAlpha = 0.88;
      ctx.beginPath(); ctx.roundRect(x, y-dH, bW, dH, [3,3,0,0]); ctx.fill();
      ctx.globalAlpha = 1;
    }

    const skip = days > 14 ? Math.ceil(days/10) : 1;
    if (i % skip === 0) {
      const d = parseDateStr(lbl);
      ctx.fillStyle = '#5c6480'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x+bW/2, cH-7);
    }
    if (totals[i] > 0 && tH > 14) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${dones[i]}/${totals[i]}`, x+bW/2, y-tH-4);
    }
  });
}

// ── 일별 공부 시간 ────────────────────────
function drawStudyChart(items) {
  const canvas = document.getElementById('studyChart');
  const ctx    = canvas.getContext('2d');
  const days   = statsPeriod;
  const now    = getNow();

  const map = {};
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate()-i);
    map[toDateStr(d)] = 0;
  }
  items.forEach(i => {
    const k = isoToDateStr(i.s_date);
    if (map[k] !== undefined) map[k] += (i.study_minutes || 0);
  });

  const labels = Object.keys(map);
  const vals   = labels.map(k => map[k]);
  const maxV   = Math.max(...vals, 1);

  const bW=22, gap=4, pL=36, pB=26, pT=14, cH=140;
  const cW = labels.length*(bW+gap)+pL+8;
  canvas.width  = Math.max(cW, 280);
  canvas.height = cH;
  canvas.style.width = '100%';
  ctx.clearRect(0, 0, canvas.width, cH);
  const iH = cH - pB - pT;

  [0.25,0.5,0.75,1].forEach(n => {
    const y = pT + iH - n*iH;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(canvas.width-4,y); ctx.stroke();
    ctx.fillStyle = '#5c6480'; ctx.font = '8px monospace'; ctx.textAlign = 'right';
    const mins = Math.round(maxV*n);
    ctx.fillText(mins >= 60 ? `${Math.floor(mins/60)}h` : `${mins}m`, pL-4, y+3);
  });

  labels.forEach((lbl, i) => {
    const x  = pL + i*(bW+gap);
    const y  = pT + iH;
    const vH = Math.round((vals[i]/maxV)*iH);

    if (vals[i] > 0) {
      const grd = ctx.createLinearGradient(0, y-vH, 0, y);
      grd.addColorStop(0, 'rgba(167,139,250,0.9)');
      grd.addColorStop(1, 'rgba(167,139,250,0.3)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.roundRect(x, y-vH, bW, vH, [3,3,0,0]); ctx.fill();

      if (vH > 14) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText(vals[i] >= 60 ? `${Math.floor(vals[i]/60)}h` : `${vals[i]}m`, x+bW/2, y-vH-4);
      }
    }

    const skip = days > 14 ? Math.ceil(days/10) : 1;
    if (i % skip === 0) {
      const d = parseDateStr(lbl);
      ctx.fillStyle = '#5c6480'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x+bW/2, cH-7);
    }
  });
}

// ── 도넛 차트 ─────────────────────────────
function drawDonut(items) {
  const canvas = document.getElementById('donutChart');
  const ctx    = canvas.getContext('2d');
  canvas.width = 130; canvas.height = 130;
  const cx=65, cy=65, r=52, ir=32;

  const cats = {'과제/수행':0,'시험':0,'약속':0,'기타':0};
  items.forEach(i => {
    const c = i.s_category;
    if (c==='과제'||c==='수행') cats['과제/수행']++;
    else if (c==='시험')        cats['시험']++;
    else if (c==='약속')        cats['약속']++;
    else                        cats['기타']++;
  });
  const colors = ['#6c8fff','#f87171','#34d399','#fbbf24'];
  const keys   = Object.keys(cats);
  const vals   = keys.map(k => cats[k]);
  const total  = vals.reduce((s,v) => s+v, 0) || 1;

  ctx.clearRect(0,0,130,130);
  let angle = -Math.PI/2;
  vals.forEach((v,i) => {
    const sweep = (v/total)*Math.PI*2;
    if (sweep > 0) {
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,angle,angle+sweep); ctx.closePath();
      ctx.fillStyle = colors[i]; ctx.globalAlpha = 0.88; ctx.fill();
    }
    angle += sweep;
  });
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(cx,cy,ir,0,Math.PI*2);
  ctx.fillStyle = '#1e2230'; ctx.fill();
  ctx.fillStyle = '#f0f2f8'; ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy-5);
  ctx.font = '9px sans-serif'; ctx.fillStyle = '#5c6480';
  ctx.fillText('전체', cx, cy+10);

  document.getElementById('donutLegend').innerHTML = keys.map((k,i) => `
    <div class="stats-donut-item">
      <span class="stats-donut-dot" style="background:${colors[i]}"></span>
      <span>${k}</span>
      <span style="margin-left:auto;font-family:monospace;font-size:.68rem;color:var(--text2)">${vals[i]}</span>
    </div>`).join('');
}

// ── 완성도 분포 ───────────────────────────
function drawProgDist(items) {
  const buckets = [
    {l:'0%',    min:0,   max:0},
    {l:'1–24%', min:1,   max:24},
    {l:'25–49%',min:25,  max:49},
    {l:'50–74%',min:50,  max:74},
    {l:'75–99%',min:75,  max:99},
    {l:'100%',  min:100, max:100},
  ];
  const counts = buckets.map(b =>
    items.filter(i => { const p=i.completion_percent||0; return p>=b.min&&p<=b.max; }).length
  );
  const maxC   = Math.max(...counts, 1);
  const colors = ['var(--border2)','var(--accent-red)','var(--accent-yellow)','var(--accent-yellow)','var(--accent3)','#22c55e'];

  document.getElementById('progressDist').innerHTML = buckets.map((b,i) => `
    <div class="stats-pd-row">
      <span class="stats-pd-lbl">${b.l}</span>
      <div class="stats-pd-track">
        <div class="stats-pd-fill" style="width:${Math.round(counts[i]/maxC*100)}%;background:${colors[i]}"></div>
      </div>
      <span class="stats-pd-cnt">${counts[i]}</span>
    </div>`).join('');
}

// ── 히트맵 ───────────────────────────────
function drawHeatmap() {
  const wrap  = document.getElementById('heatmapWrap');
  const now   = getNow();
  const DAYS  = 90;
  const start = new Date(now); start.setDate(start.getDate()-DAYS+1); start.setHours(0,0,0,0);

  const doneCounts = {};
  statsData.forEach(i => {
    if (!i.s_date || !isDone(i)) return;
    const k = isoToDateStr(i.s_date);
    doneCounts[k] = (doneCounts[k]||0) + 1;
  });

  const firstDow = start.getDay();
  const cells = [];
  for (let i=0;i<firstDow;i++) cells.push(null);
  for (let i=0;i<DAYS;i++) {
    const d = new Date(start); d.setDate(start.getDate()+i);
    cells.push(toDateStr(d));
  }
  const weeks = [];
  for (let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));

  const dowL = ['일','월','화','수','목','금','토'];
  let html = `<div class="hm-outer">
    <div class="hm-dow">${dowL.map(l=>`<div class="hm-dow-lbl">${l}</div>`).join('')}</div>
    <div class="hm-cols">`;

  weeks.forEach(week => {
    html += '<div class="hm-col">';
    for (let dow=0;dow<7;dow++) {
      const ds = week[dow];
      if (!ds) { html += '<div style="width:12px;height:12px"></div>'; continue; }
      const c  = doneCounts[ds] || 0;
      const lv = c>=4?'l4':c>=3?'l3':c>=2?'l2':c>=1?'l1':'';
      const d  = parseDateStr(ds);
      html += `<div class="hm-cell ${lv}" title="${d.getMonth()+1}/${d.getDate()} 완료 ${c}개"></div>`;
    }
    html += '</div>';
  });

  html += `</div></div>
    <div class="hm-legend">
      <span class="hm-leg-lbl">적음</span>
      <div style="display:flex;gap:3px">
        <div class="hm-cell"></div>
        <div class="hm-cell l1"></div>
        <div class="hm-cell l2"></div>
        <div class="hm-cell l3"></div>
        <div class="hm-cell l4"></div>
      </div>
      <span class="hm-leg-lbl">많음</span>
    </div>`;

  wrap.innerHTML = html;
}

function openStats() {
  document.getElementById('statsOverlay').classList.add('open');
}
function closeStats() {
  document.getElementById('statsOverlay').classList.remove('open');
}
function initStats() {
  document.getElementById('statsClose').addEventListener('click', closeStats);
  document.getElementById('statsOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('statsOverlay')) closeStats();
  });
  document.querySelectorAll('.stats-period-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.stats-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statsPeriod = parseInt(btn.dataset.days);
      await loadStatsData(statsPeriod);
      renderStats();
    });
  });
}

// ==========================================
//  앱 초기화
// ==========================================
async function init() {
  initGNB();
  initHeroDate();
  initStatCards();
  initCalendarControls();
  initModal();
  initStats();

  await Promise.allSettled([
    loadTodaySchedule(),
    loadWeeklyClassHours(),
    loadExams(),
    loadCalendarData(calYear, calMonth)
  ]);

  renderCalendar();
}

document.addEventListener('DOMContentLoaded', init);
