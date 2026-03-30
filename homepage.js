// ==========================================
//  StudyHub — homepage.js
//  Supabase 연동 + 홈 대시보드 로직
// ==========================================

// ── Supabase 클라이언트 초기화 ─────────────
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

// ── 날짜 유틸 ─────────────────────────────
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const _pad = n => String(n).padStart(2, '0');

function getNow() { return new Date(); }

// Date → 로컬 기준 'YYYY-MM-DD' (UTC 버그 방지)
function toDateStr(d) {
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}

// ISO → 로컬 'YYYY-MM-DD'
function isoToDateStr(iso) {
  if (!iso) return '';
  return toDateStr(new Date(iso));
}

// 'YYYY-MM-DD' → 로컬 자정 Date (new Date('YYYY-MM-DD')는 UTC 자정이라 KST에서 날짜 밀림 방지)
function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 로컬 Date → 'YYYY-MM-DDTHH:MM:SS' (Supabase 쿼리용 로컬 타임)
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
  const target = parseDateStr(dateStr);
  const diff = Math.round((target - now) / 86400000);
  if (diff === 0) return 'D-Day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function catClass(cat) {
  if (!cat) return 'cat-default';
  if (cat.includes('과제') || cat.includes('수행')) return 'cat-과제';
  if (cat.includes('시험')) return 'cat-시험';
  if (cat.includes('약속')) return 'cat-약속';
  return 'cat-기타';
}

// ──────────────────────────────────────────
//  [핵심 수정] s_end 완료 여부 판단
//  DB 컬럼이 boolean이므로 true/false만 허용
//  null, false → 미완료 / true → 완료
// ──────────────────────────────────────────
function isDone(item) {
  return item.s_end === true;
}

// ── 전역 상태 ──────────────────────────────
let allSchedules = [];
let calYear, calMonth;
let compactMode = false;
let showDday = false;
let showUpcoming = true;
let nearestExamDate = null;
let modalCurrentDate = null;

// ── GNB ─────────────────────────────────
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
  const el = document.getElementById('heroDate');
  el.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

// ── Stat cards ─────────────────────────────
function initStatCards() {
  document.querySelectorAll('.stat-card[data-href]').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => { location.href = card.dataset.href; });
  });
}

// ── 오늘의 일정 ────────────────────────────
async function loadTodaySchedule() {
  const now = getNow();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);

  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${toLocalISO(todayStart)}&s_date=lte.${toLocalISO(todayEnd)}&order=s_date.asc&limit=10`
    );
    document.getElementById('statToday').textContent = data.length;
    const doneCount = data.filter(d => isDone(d)).length;
    document.getElementById('statDone').textContent = doneCount;

    // 완료 진행 바 업데이트
    const pct = data.length > 0 ? Math.round(doneCount / data.length * 100) : 0;
    const bar = document.getElementById('statProgressBar');
    if (bar) bar.style.width = pct + '%';

    // 오늘 일정 카드 완료 카운트
    const doneCountEl = document.getElementById('todayDoneCount');
    if (doneCountEl) {
      doneCountEl.textContent = data.length > 0 ? `${doneCount}/${data.length} 완료` : '';
    }
    const list = document.getElementById('todayList');
    if (data.length === 0) {
      list.innerHTML = '<li class="empty-msg">오늘 예정된 일정이 없습니다.</li>';
      return;
    }
    list.innerHTML = data.map(item => `
      <li class="schedule-item ${isDone(item) ? 'done' : ''}" data-id="${item.id}">
        <div class="s-check today-check" data-id="${item.id}" title="완료 토글">${isDone(item) ? '✓' : ''}</div>
        <div class="s-info">
          <div class="s-name">${escapeHtml(item.s_name)}</div>
          <div class="s-time">${formatDateTime(item.s_date)}</div>
        </div>
        ${item.s_category ? `<span class="s-cat">${escapeHtml(item.s_category)}</span>` : ''}
      </li>
    `).join('');

    // [핵심 수정] 오늘의 일정 체크박스 클릭 이벤트 바인딩
    list.querySelectorAll('.today-check').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = data.find(s => String(s.id) === String(id));
        if (!item) return;
        await toggleComplete(id, !isDone(item));
        // 오늘 일정 목록 새로고침
        await loadTodaySchedule();
      });
    });

  } catch (e) {
    console.error('일정 로드 실패:', e);
    document.getElementById('todayList').innerHTML = '<li class="empty-msg">일정을 불러오지 못했습니다.</li>';
    document.getElementById('statToday').textContent = '—';
    document.getElementById('statDone').textContent = '—';
  }
}

// ── 이번 주 수업 시간 (시간표) ─────────────
async function loadWeeklyClassHours() {
  try {
    const allData = await supabaseFetch('timeschedule?select=ts_s_time,ts_e_time');
    let totalMinutes = 0;
    (allData || []).forEach(item => {
      if (item.ts_s_time && item.ts_e_time) {
        const [sh, sm] = item.ts_s_time.split(':').map(Number);
        const [eh, em] = item.ts_e_time.split(':').map(Number);
        totalMinutes += (eh * 60 + em) - (sh * 60 + sm);
      }
    });
    document.getElementById('statClass').textContent = Math.round(totalMinutes / 60);
  } catch (e) {
    document.getElementById('statClass').textContent = '—';
  }
}

// ── 시험 (schedule 테이블의 시험 카테고리 항목으로 대체) ──
async function loadExams() {
  try {
    const now = new Date(); now.setHours(0,0,0,0);
    const data = await supabaseFetch(
      `schedule?s_category=eq.시험&s_end=eq.false&order=s_date.asc&limit=5`
    );
    const upcoming = (data || []).filter(d => d.s_date && new Date(d.s_date) >= now);

    // 가장 가까운 시험 D-day 스탯
    if (upcoming.length > 0) {
      const next = new Date(upcoming[0].s_date);
      const diff = Math.round((next - now) / 86400000);
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
      const dateStr = isoToDateStr(item.s_date);
      return `
        <div class="exam-item">
          <span class="exam-dday">${dDay(dateStr)}</span>
          <span class="exam-name">${escapeHtml(item.s_name)}</span>
          <span class="exam-date">${formatDateTime(item.s_date)}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    document.getElementById('statExam').textContent = '—';
    document.getElementById('examList').innerHTML =
      '<p class="empty-msg">시험 정보를 불러오지 못했습니다.</p>';
  }
}

// ==========================================
//  캘린더 시스템
// ==========================================

async function loadCalendarData(year, month) {
  // 달력에 표시되는 실제 첫/마지막 날 계산 (이전달 채우기 포함)
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDow = firstOfMonth.getDay(); // 0=일
  const calStart = new Date(year, month - 1, 1 - firstDow);
  calStart.setHours(0, 0, 0, 0);

  const lastOfMonth = new Date(year, month, 0);
  const lastDow = lastOfMonth.getDay();
  const calEnd = new Date(year, month, 6 - lastDow); // 마지막 주 토요일
  calEnd.setHours(23, 59, 59, 999);

  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${toLocalISO(calStart)}&s_date=lte.${toLocalISO(calEnd)}&order=s_date.asc&limit=500`
    );
    allSchedules = data || [];

    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 가장 가까운 시험 날짜 계산
    const exams = allSchedules
      .filter(d => d.s_category && d.s_category.includes('시험') && !isDone(d))
      .map(d => new Date(d.s_date))
      .filter(d => d >= nowMidnight)
      .sort((a, b) => a - b);
    nearestExamDate = exams.length > 0 ? exams[0] : null;

    if (nearestExamDate) {
      const diff = Math.round((nearestExamDate - nowMidnight) / 86400000);
      document.getElementById('statExam').textContent = diff;
    }
  } catch (e) {
    console.error('캘린더 데이터 로드 실패:', e);
    allSchedules = [];
  }
}

// 날짜별 일정 그룹핑
function groupByDate(schedules) {
  const map = {};
  schedules.forEach(item => {
    if (!item.s_date) return;
    const key = isoToDateStr(item.s_date);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return map;
}

// 달력 렌더링
function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  label.textContent = `${calYear}.${_pad(calMonth)}`;

  const grouped = groupByDate(allSchedules);
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
  const lastDate = new Date(calYear, calMonth, 0).getDate();
  const prevLastDate = new Date(calYear, calMonth - 1, 0).getDate();
  const todayStr = toDateStr(getNow());
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let cells = '';
  let dayCount = 0;

  // 이전 달
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevLastDate - i;
    const dateStr = toDateStr(new Date(calYear, calMonth - 2, d));
    cells += buildCell(dateStr, d, true, todayStr, grouped, nowMidnight);
    dayCount++;
  }
  // 이번 달
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = toDateStr(new Date(calYear, calMonth - 1, d));
    cells += buildCell(dateStr, d, false, todayStr, grouped, nowMidnight);
    dayCount++;
  }
  // 다음 달
  const remaining = Math.ceil(dayCount / 7) * 7 - dayCount;
  for (let d = 1; d <= remaining; d++) {
    const dateStr = toDateStr(new Date(calYear, calMonth, d));
    cells += buildCell(dateStr, d, true, todayStr, grouped, nowMidnight);
  }

  grid.innerHTML = cells;
  grid.className = 'cal-grid' + (compactMode ? ' compact' : '') + (showDday ? ' show-dday' : '');

  grid.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      if (date) openModal(date, grouped[date] || []);
    });
  });

  renderUpcoming(grouped, nowMidnight);
}

function buildCell(dateStr, dayNum, otherMonth, todayStr, grouped, nowDate) {
  const cellDate = parseDateStr(dateStr);
  const dow = cellDate.getDay();
  const isToday = dateStr === todayStr;

  let cls = 'cal-cell';
  if (otherMonth) cls += ' other-month';
  if (isToday)    cls += ' today';
  if (dow === 0)  cls += ' sun';
  if (dow === 6)  cls += ' sat';

  let ddayHtml = '';
  if (showDday && nearestExamDate) {
    const examMid = new Date(nearestExamDate); examMid.setHours(0,0,0,0);
    const cellMid = parseDateStr(dateStr);
    const diff = Math.round((examMid - cellMid) / 86400000);
    if (diff === 0)           ddayHtml = `<span class="cal-dday-badge">D-Day</span>`;
    else if (diff > 0 && diff <= 30) ddayHtml = `<span class="cal-dday-badge">D-${diff}</span>`;
  }

  const items = grouped[dateStr] || [];
  const doneItems = items.filter(i => isDone(i));
  const totalCount = items.length;
  const doneCount = doneItems.length;

  // compact용: 카테고리 도트
  const dotColors = { '과제': 'var(--cat-과제)', '수행': 'var(--cat-과제)', '시험': 'var(--cat-시험)', '약속': 'var(--cat-약속)' };
  const dotsHtml = items.slice(0, 6).map(item => {
    const color = dotColors[item.s_category] || 'var(--cat-기타)';
    const opacity = isDone(item) ? 'opacity:0.35;' : '';
    return `<span class="cal-dot" style="background:${color};${opacity}"></span>`;
  }).join('');

  // compact용: 진행 바 (일정 있는 날만)
  const progressPct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const progressHtml = totalCount > 0
    ? `<div class="cal-progress-wrap"><div class="cal-progress-bar" style="width:${progressPct}%"></div></div>`
    : '<div class="cal-progress-wrap"></div>';

  // compact용: 완료 카운트 (일정 있을 때만)
  const doneBadgeHtml = totalCount > 0
    ? `<div class="cal-done-badge">${doneCount}/${totalCount}</div>`
    : '<div class="cal-done-badge"></div>';

  const MAX_SHOW = 3;
  const shown = items.slice(0, MAX_SHOW);
  const more = items.length - MAX_SHOW;
  const chipsHtml = shown.map(item => {
    const cc = catClass(item.s_category);
    return `<div class="cal-event-chip ${cc} ${isDone(item) ? 'done' : ''}">${escapeHtml(item.s_name)}</div>`;
  }).join('');
  const moreHtml = more > 0 ? `<div class="cal-more">+${more}개 더</div>` : '';

  return `
    <div class="${cls}" data-date="${dateStr}">
      <span class="cal-date-num">${dayNum}</span>
      ${ddayHtml}
      <div class="cal-events">${chipsHtml}${moreHtml}</div>
      <div class="cal-dot-row">${dotsHtml}</div>
      ${progressHtml}
      ${doneBadgeHtml}
    </div>
  `;
}

// 다가오는 일정 패널
function renderUpcoming(grouped, nowDate) {
  const panel = document.getElementById('upcomingPanel');
  const list = document.getElementById('upcomingList');

  if (!showUpcoming) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const upcoming = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() + i);
    const key = toDateStr(d);
    (grouped[key] || []).forEach(item => {
      if (!isDone(item)) upcoming.push({ ...item, _dateStr: key });
    });
  }
  upcoming.sort((a, b) => new Date(a.s_date) - new Date(b.s_date));
  const shown = upcoming.slice(0, 5);

  if (shown.length === 0) {
    list.innerHTML = '<div class="empty-msg" style="padding:8px 0">7일 이내 미완료 일정이 없습니다.</div>';
    return;
  }

  list.innerHTML = shown.map(item => {
    const dd = dDay(item._dateStr);
    const isToday = dd === 'D-Day';
    const cc = catClass(item.s_category);
    return `
      <div class="upcoming-item" data-date="${item._dateStr}">
        <span class="upcoming-dday ${isToday ? 'today' : ''}">${dd}</span>
        <span class="upcoming-name">${escapeHtml(item.s_name)}</span>
        ${item.s_category ? `<span class="upcoming-cat ${cc}">${escapeHtml(item.s_category)}</span>` : ''}
      </div>
    `;
  }).join('');

  list.querySelectorAll('.upcoming-item').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.dataset.date;
      openModal(date, grouped[date] || []);
    });
  });
}

// 달력 컨트롤
function initCalendarControls() {
  const now = getNow();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;

  document.getElementById('calPrev').addEventListener('click', async () => {
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    await loadCalendarData(calYear, calMonth);
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', async () => {
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    await loadCalendarData(calYear, calMonth);
    renderCalendar();
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
}

// ==========================================
//  모달 시스템
// ==========================================

function openModal(dateStr, items) {
  modalCurrentDate = dateStr;
  const overlay = document.getElementById('modalOverlay');
  const d = parseDateStr(dateStr);
  const label = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일`;
  document.getElementById('modalDateLabel').textContent = label;

  const ddEl = document.getElementById('modalDday');
  const examItems = items.filter(i => i.s_category && i.s_category.includes('시험'));
  ddEl.textContent = examItems.length > 0 ? `🎯 ${dDay(dateStr)}` : '';

  renderModalItems(items);
  hideForm();

  document.getElementById('formDate').value = `${dateStr}T09:00`;
  overlay.classList.add('open');
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
    const cc = catClass(item.s_category);
    return `
      <div class="modal-item ${isDone(item) ? 'done' : ''}" data-id="${item.id}">
        <div class="modal-item-header">
          <div class="modal-item-check" data-id="${item.id}" title="완료 토글">${isDone(item) ? '✓' : ''}</div>
          <div class="modal-item-name">${escapeHtml(item.s_name)}</div>
          ${item.s_category ? `<span class="modal-item-cat ${cc}">${escapeHtml(item.s_category)}</span>` : ''}
        </div>
        <div class="modal-item-meta">${formatDateTime(item.s_date)}</div>
        ${item.s_content ? `<div class="modal-item-content">${escapeHtml(item.s_content)}</div>` : ''}
        ${item.s_add ? `<div class="modal-item-content" style="color:var(--text3)">📎 ${escapeHtml(item.s_add)}</div>` : ''}
        <div class="modal-item-actions">
          <button class="modal-item-btn edit-btn" data-id="${item.id}">✏️ 수정</button>
          <button class="modal-item-btn danger del-btn" data-id="${item.id}">🗑️ 삭제</button>
        </div>
      </div>
    `;
  }).join('');

  // ──────────────────────────────────────
  //  [핵심 수정] 완료 체크박스 토글
  //  s_end 컬럼이 boolean이므로 true/false 전송
  // ──────────────────────────────────────
  container.querySelectorAll('.modal-item-check').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = allSchedules.find(s => String(s.id) === String(id));
      if (!item) return;
      await toggleComplete(id, !isDone(item));
    });
  });

  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = allSchedules.find(s => String(s.id) === String(id));
      if (!item) return;
      populateForm(item);
      showForm();
    });
  });

  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      await deleteSchedule(id);
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
  document.getElementById('formId').value = '';
  document.getElementById('formName').value = '';
  document.getElementById('formDate').value = modalCurrentDate ? `${modalCurrentDate}T09:00` : '';
  document.getElementById('formCategory').value = '';
  document.getElementById('formKeywords').value = '';
  document.getElementById('formContent').value = '';
  document.getElementById('formAdd').value = '';
}
function populateForm(item) {
  document.getElementById('formId').value = item.id;
  document.getElementById('formName').value = item.s_name || '';
  document.getElementById('formDate').value = toLocalDatetimeValue(item.s_date);
  document.getElementById('formCategory').value = item.s_category || '';
  document.getElementById('formKeywords').value = Array.isArray(item.s_keywords)
    ? item.s_keywords.join(', ')
    : (item.s_keywords || '');
  document.getElementById('formContent').value = item.s_content || '';
  document.getElementById('formAdd').value = item.s_add || '';
}

function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('modalAddBtn').addEventListener('click', () => {
    clearForm();
    showForm();
  });
  document.getElementById('formCancel').addEventListener('click', hideForm);
  document.getElementById('formSave').addEventListener('click', saveSchedule);
  // ESC 키로 모달 닫기
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── CRUD ───────────────────────────────────

async function saveSchedule() {
  const id = document.getElementById('formId').value;
  const name = document.getElementById('formName').value.trim();
  if (!name) { alert('제목을 입력하세요.'); return; }

  const dateVal = document.getElementById('formDate').value;
  const keywordsRaw = document.getElementById('formKeywords').value.trim();
  const keywords = keywordsRaw ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean) : [];

  const body = {
    s_name: name,
    s_date: dateVal ? new Date(dateVal).toISOString() : null,
    s_category: document.getElementById('formCategory').value || null,
    s_keywords: keywords.length > 0 ? keywords : null,
    s_content: document.getElementById('formContent').value.trim() || null,
    s_add: document.getElementById('formAdd').value.trim() || null,
  };

  try {
    if (id) {
      await supabaseFetch(`schedule?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    } else {
      // [핵심 수정] 신규 등록 시 s_end = false (boolean)
      body.s_end = false;
      await supabaseFetch(`schedule`, {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    }
    hideForm();
    await refreshCalendarAndToday();
    const grouped = groupByDate(allSchedules);
    renderModalItems(grouped[modalCurrentDate] || []);
  } catch (e) {
    console.error('저장 실패:', e);
    alert('저장에 실패했습니다.');
  }
}

// ──────────────────────────────────────────
//  [핵심 수정] 완료 토글
//  s_end가 boolean 컬럼이므로 true / false 전송
//  (이전 코드는 timestamp 문자열을 전송했었음 → 타입 미스매치로 저장 안 됨)
// ──────────────────────────────────────────
async function toggleComplete(id, newState) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ s_end: newState === true })
    });
    await refreshCalendarAndToday();
    if (modalCurrentDate) {
      const grouped = groupByDate(allSchedules);
      renderModalItems(grouped[modalCurrentDate] || []);
    }
  } catch (e) {
    console.error('완료 토글 실패:', e);
    alert('완료 상태 변경에 실패했습니다.');
  }
}

async function deleteSchedule(id) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, { method: 'DELETE' });
    await refreshCalendarAndToday();
    const grouped = groupByDate(allSchedules);
    renderModalItems(grouped[modalCurrentDate] || []);
  } catch (e) {
    console.error('삭제 실패:', e);
    alert('삭제에 실패했습니다.');
  }
}

async function refreshCalendarAndToday() {
  await loadCalendarData(calYear, calMonth);
  renderCalendar();
  await loadTodaySchedule();
}

// ── 앱 초기화 ──────────────────────────────
async function init() {
  initGNB();
  initHeroDate();
  initStatCards();
  initCalendarControls(); // calYear/calMonth 초기화 먼저
  initModal();

  await Promise.allSettled([
    loadTodaySchedule(),
    loadWeeklyClassHours(),
    loadExams(),
    loadCalendarData(calYear, calMonth)
  ]);

  renderCalendar();
}

document.addEventListener('DOMContentLoaded', init);
