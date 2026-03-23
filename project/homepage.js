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
  // 204 No Content (DELETE 등)
  if (res.status === 204) return null;
  return res.json();
}

// ── 날짜 유틸 ─────────────────────────────
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function getNow() { return new Date(); }
function toDateStr(d) { return d.toISOString().split('T')[0]; }
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function dDay(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  const diff = Math.round((target - now) / 86400000);
  if (diff === 0) return 'D-Day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}
function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// ── 전역 상태 ──────────────────────────────
let allSchedules = [];   // 캐시된 일정 전체
let calYear, calMonth;   // 현재 달력 기준 연/월
let compactMode = false;
let showDday = false;
let showUpcoming = true;
let nearestExamDate = null; // D-day 기준 날짜 (시험 카테고리 중 가장 가까운 것)
let modalCurrentDate = null; // 모달에서 선택된 날짜 (YYYY-MM-DD)

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
      `schedule?s_date=gte.${todayStart.toISOString()}&s_date=lte.${todayEnd.toISOString()}&order=s_date.asc&limit=10`
    );
    document.getElementById('statToday').textContent = data.length;
    const doneCount = data.filter(d => d.s_end).length;
    document.getElementById('statDone').textContent = doneCount;
    const list = document.getElementById('todayList');
    if (data.length === 0) {
      list.innerHTML = '<li class="empty-msg">오늘 예정된 일정이 없습니다.</li>';
      return;
    }
    list.innerHTML = data.map(item => `
      <li class="schedule-item ${item.s_end ? 'done' : ''}">
        <div class="s-check">${item.s_end ? '✓' : ''}</div>
        <div class="s-info">
          <div class="s-name">${escapeHtml(item.s_name)}</div>
          <div class="s-time">${formatDateTime(item.s_date)}</div>
        </div>
        ${item.s_category ? `<span class="s-cat">${escapeHtml(item.s_category)}</span>` : ''}
      </li>
    `).join('');
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
    const allData = await supabaseFetch('timeschedule?select=ts_s_time,ts_e_time').catch(() => []);
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

// ── 시험 (exam 테이블 없으면 일정에서 시험 카테고리로 대체) ──
async function loadExams() {
  document.getElementById('statExam').textContent = '—';
  document.getElementById('examList').innerHTML =
    '<p class="empty-msg">시험 페이지에서 시험을 등록하세요.</p>';
}

// ==========================================
//  캘린더 시스템
// ==========================================

// 캘린더용 일정 전체 로드 (해당 월 ± 여유)
async function loadCalendarData(year, month) {
  // 해당 월 전체 + 앞뒤 주 여유
  const start = new Date(year, month - 1, 1);
  start.setDate(start.getDate() - 7);
  const end = new Date(year, month, 0);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${start.toISOString()}&s_date=lte.${end.toISOString()}&order=s_date.asc&limit=300`
    );
    allSchedules = data || [];

    // 가장 가까운 시험 날짜 계산
    const now = getNow(); now.setHours(0,0,0,0);
    const exams = allSchedules
      .filter(d => d.s_category && d.s_category.includes('시험') && !d.s_end)
      .map(d => new Date(d.s_date))
      .filter(d => d >= now)
      .sort((a, b) => a - b);
    nearestExamDate = exams.length > 0 ? exams[0] : null;

    if (nearestExamDate) {
      const diff = Math.round((nearestExamDate - now) / 86400000);
      document.getElementById('statExam').textContent = diff;
    }
  } catch (e) {
    console.error('캘린더 데이터 로드 실패:', e);
    allSchedules = [];
  }
}

// 날짜 문자열(YYYY-MM-DD)로 일정 그룹핑
function groupByDate(schedules) {
  const map = {};
  schedules.forEach(item => {
    if (!item.s_date) return;
    const key = toDateStr(new Date(item.s_date));
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return map;
}

// 달력 렌더링
function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');

  label.textContent = `${calYear}.${String(calMonth).padStart(2,'0')}`;

  const grouped = groupByDate(allSchedules);

  // 이번 달 1일의 요일
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay(); // 0=일
  // 이번 달 마지막 날
  const lastDate = new Date(calYear, calMonth, 0).getDate();
  // 이전 달 마지막 날
  const prevLastDate = new Date(calYear, calMonth - 1, 0).getDate();

  const todayStr = toDateStr(getNow());
  const now = getNow(); now.setHours(0,0,0,0);

  let cells = '';
  let dayCount = 0;

  // 이전 달 채우기
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevLastDate - i;
    const dateStr = toDateStr(new Date(calYear, calMonth - 2, d));
    cells += buildCell(dateStr, d, true, todayStr, grouped, now);
    dayCount++;
  }

  // 이번 달
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = toDateStr(new Date(calYear, calMonth - 1, d));
    cells += buildCell(dateStr, d, false, todayStr, grouped, now);
    dayCount++;
  }

  // 다음 달 채우기 (6주 완성)
  const remaining = Math.ceil(dayCount / 7) * 7 - dayCount;
  for (let d = 1; d <= remaining; d++) {
    const dateStr = toDateStr(new Date(calYear, calMonth, d));
    cells += buildCell(dateStr, d, true, todayStr, grouped, now);
  }

  grid.innerHTML = cells;
  grid.className = 'cal-grid' + (compactMode ? ' compact' : '') + (showDday ? ' show-dday' : '');

  // 셀 클릭 이벤트
  grid.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      if (date) openModal(date, grouped[date] || []);
    });
  });

  // 다가오는 일정 업데이트
  renderUpcoming(grouped, now);
}

function buildCell(dateStr, dayNum, otherMonth, todayStr, grouped, nowDate) {
  const cellDate = new Date(dateStr);
  const dow = cellDate.getDay();
  const isToday = dateStr === todayStr;
  const isSun = dow === 0;
  const isSat = dow === 6;

  let cls = 'cal-cell';
  if (otherMonth) cls += ' other-month';
  if (isToday) cls += ' today';
  if (isSun) cls += ' sun';
  if (isSat) cls += ' sat';

  // D-day 계산
  let ddayHtml = '';
  if (nearestExamDate) {
    const examDateOnly = new Date(nearestExamDate); examDateOnly.setHours(0,0,0,0);
    const cellDateOnly = new Date(dateStr); cellDateOnly.setHours(0,0,0,0);
    const diff = Math.round((examDateOnly - cellDateOnly) / 86400000);
    if (diff === 0) ddayHtml = `<span class="cal-dday-badge">D-Day</span>`;
    else if (diff > 0 && diff <= 30) ddayHtml = `<span class="cal-dday-badge">D-${diff}</span>`;
  }

  // 이벤트 칩
  const items = grouped[dateStr] || [];
  const MAX_SHOW = 3;
  const shown = items.slice(0, MAX_SHOW);
  const more = items.length - MAX_SHOW;
  const chipsHtml = shown.map(item => {
    const cc = catClass(item.s_category);
    return `<div class="cal-event-chip ${cc} ${item.s_end ? 'done' : ''}">${escapeHtml(item.s_name)}</div>`;
  }).join('');
  const moreHtml = more > 0 ? `<div class="cal-more">+${more}개 더</div>` : '';

  return `
    <div class="${cls}" data-date="${dateStr}">
      <span class="cal-date-num">${dayNum}</span>
      ${ddayHtml}
      <div class="cal-events">${chipsHtml}${moreHtml}</div>
    </div>
  `;
}

// 다가오는 일정 패널
function renderUpcoming(grouped, nowDate) {
  const panel = document.getElementById('upcomingPanel');
  const list = document.getElementById('upcomingList');

  if (!showUpcoming) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';

  const upcoming = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() + i);
    const key = toDateStr(d);
    (grouped[key] || []).forEach(item => {
      if (!item.s_end) upcoming.push({ ...item, _dateStr: key });
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

  // 클릭 시 모달 열기
  list.querySelectorAll('.upcoming-item').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.dataset.date;
      openModal(date, grouped[date] || []);
    });
  });
}

// 달력 컨트롤 초기화
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

  // 간단 보기 토글
  document.getElementById('btnCompact').addEventListener('click', () => {
    compactMode = !compactMode;
    document.getElementById('btnCompact').classList.toggle('active', compactMode);
    renderCalendar();
  });

  // D-day 토글
  document.getElementById('btnDday').addEventListener('click', () => {
    showDday = !showDday;
    document.getElementById('btnDday').classList.toggle('active', showDday);
    renderCalendar();
  });

  // 예정 일정 토글
  document.getElementById('btnUpcoming').addEventListener('click', () => {
    showUpcoming = !showUpcoming;
    document.getElementById('btnUpcoming').classList.toggle('active', showUpcoming);
    renderCalendar();
  });
  // 초기 상태: 예정 일정 활성
  document.getElementById('btnUpcoming').classList.add('active');
}

// ==========================================
//  모달 시스템
// ==========================================

function openModal(dateStr, items) {
  modalCurrentDate = dateStr;
  const overlay = document.getElementById('modalOverlay');
  const d = new Date(dateStr);
  const label = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일`;
  document.getElementById('modalDateLabel').textContent = label;

  // D-day 표시 (시험 카테고리 있을 경우)
  const ddEl = document.getElementById('modalDday');
  const examItems = items.filter(i => i.s_category && i.s_category.includes('시험'));
  ddEl.textContent = examItems.length > 0 ? `🎯 ${dDay(dateStr)}` : '';

  renderModalItems(items);
  hideForm();

  // 추가 버튼 날짜 미리 세팅
  const dateInput = document.getElementById('formDate');
  dateInput.value = `${dateStr}T09:00`;

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
      <div class="modal-item ${item.s_end ? 'done' : ''}" data-id="${item.id}">
        <div class="modal-item-header">
          <div class="modal-item-check" data-id="${item.id}">${item.s_end ? '✓' : ''}</div>
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

  // 완료 토글
  container.querySelectorAll('.modal-item-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const item = allSchedules.find(s => String(s.id) === String(id));
      if (!item) return;
      await toggleComplete(id, !item.s_end);
    });
  });

  // 수정
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = allSchedules.find(s => String(s.id) === String(id));
      if (!item) return;
      populateForm(item);
      showForm();
    });
  });

  // 삭제
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
  document.getElementById('modalForm').style.display = 'flex';
  document.getElementById('modalAddBtn').style.display = 'none';
}
function hideForm() {
  document.getElementById('modalForm').classList.remove('visible');
  document.getElementById('modalForm').style.display = 'none';
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
  document.getElementById('formKeywords').value = Array.isArray(item.s_keywords) ? item.s_keywords.join(', ') : (item.s_keywords || '');
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
      // UPDATE
      await supabaseFetch(`schedule?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    } else {
      // INSERT
      body.s_end = false;
      await supabaseFetch(`schedule`, {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    }
    hideForm();
    await refreshCalendarAndToday();
    // 모달 재렌더링
    const dateKey = modalCurrentDate;
    const grouped = groupByDate(allSchedules);
    renderModalItems(grouped[dateKey] || []);
  } catch (e) {
    console.error('저장 실패:', e);
    alert('저장에 실패했습니다.');
  }
}

async function toggleComplete(id, newState) {
  try {
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ s_end: newState })
    });
    await refreshCalendarAndToday();
    const grouped = groupByDate(allSchedules);
    renderModalItems(grouped[modalCurrentDate] || []);
  } catch (e) {
    console.error('완료 토글 실패:', e);
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
  initCalendarControls();
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