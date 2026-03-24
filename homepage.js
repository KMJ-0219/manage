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

const _pad = n => String(n).padStart(2, '0');

// Date 객체 → 로컬 기준 'YYYY-MM-DD' 문자열
// ※ toISOString()은 UTC 기준이므로 UTC+9 환경에서 자정 이전 시각이면 날짜가 하루 밀림
function toDateStr(d) {
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}

// ISO 타임스탬프(Supabase 등) → 로컬 기준 'YYYY-MM-DD' 문자열
// new Date(isoStr)는 로컬로 변환하므로 getFullYear 등은 로컬 기준 → OK
function isoToDateStr(iso) {
  if (!iso) return '';
  const d = new Date(iso); // ISO 파싱은 로컬 시간으로 보정됨
  return toDateStr(d);
}

// 'YYYY-MM-DD' 문자열 → 로컬 자정 Date 객체
// ※ new Date('YYYY-MM-DD')는 UTC 자정으로 파싱 → UTC+9에서 getDay()가 전날 요일 반환
// → new Date(y, m-1, d)로 로컬 자정 명시적 생성
function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 로컬 Date → 'YYYY-MM-DDTHH:MM:SS' (Supabase 쿼리용, timezone offset 없이 로컬 시간 그대로)
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
  // ※ new Date(dateStr) UTC 파싱 버그 방지 → parseDateStr 사용
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

// [BUG FIX] s_end 필드가 날짜 문자열이거나 boolean일 수 있으므로
// truthy 판단을 일관되게 처리하는 헬퍼 함수
function isDone(item) {
  return !!item.s_end;
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
      `schedule?s_date=gte.${toLocalISO(todayStart)}&s_date=lte.${toLocalISO(todayEnd)}&order=s_date.asc&limit=10`
    );
    document.getElementById('statToday').textContent = data.length;
    // [BUG FIX] isDone() 헬퍼로 완료 여부 일관 처리
    const doneCount = data.filter(d => isDone(d)).length;
    document.getElementById('statDone').textContent = doneCount;
    const list = document.getElementById('todayList');
    if (data.length === 0) {
      list.innerHTML = '<li class="empty-msg">오늘 예정된 일정이 없습니다.</li>';
      return;
    }
    list.innerHTML = data.map(item => `
      <li class="schedule-item ${isDone(item) ? 'done' : ''}">
        <div class="s-check">${isDone(item) ? '✓' : ''}</div>
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
// [BUG FIX] .catch(() => []) 와 outer try-catch 이중 처리 제거 → try-catch 단일화
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
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month, 0);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  try {
    const data = await supabaseFetch(
      `schedule?s_date=gte.${toLocalISO(start)}&s_date=lte.${toLocalISO(end)}&order=s_date.asc&limit=300`
    );
    allSchedules = data || [];

    // [BUG FIX] getNow() 원본 변형 방지 → 새 Date 객체로 분리
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

// 날짜 문자열(YYYY-MM-DD)로 일정 그룹핑
function groupByDate(schedules) {
  const map = {};
  schedules.forEach(item => {
    if (!item.s_date) return;
    // Supabase ISO 타임스탬프 → 로컬 기준 날짜 키
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

  label.textContent = `${calYear}.${String(calMonth).padStart(2,'0')}`;

  const grouped = groupByDate(allSchedules);

  // 이번 달 1일의 요일
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay(); // 0=일
  // 이번 달 마지막 날
  const lastDate = new Date(calYear, calMonth, 0).getDate();
  // 이전 달 마지막 날
  const prevLastDate = new Date(calYear, calMonth - 1, 0).getDate();

  const todayStr = toDateStr(getNow());
  // [BUG FIX] getNow() 원본 변형 방지 → 새 Date 객체로 분리
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let cells = '';
  let dayCount = 0;

  // 이전 달 채우기
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

  // 다음 달 채우기 (6주 완성)
  const remaining = Math.ceil(dayCount / 7) * 7 - dayCount;
  for (let d = 1; d <= remaining; d++) {
    const dateStr = toDateStr(new Date(calYear, calMonth, d));
    cells += buildCell(dateStr, d, true, todayStr, grouped, nowMidnight);
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
  renderUpcoming(grouped, nowMidnight);
}

function buildCell(dateStr, dayNum, otherMonth, todayStr, grouped, nowDate) {
  // [BUG FIX] new Date('YYYY-MM-DD')는 UTC 기준으로 파싱됨 → UTC+9에서 getDay()가 전날 요일 반환
  // → 로컬 자정으로 명시적 파싱하여 요일 정확히 계산
  const [y, m, d2] = dateStr.split('-').map(Number);
  const cellDate = new Date(y, m - 1, d2);
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
    // ※ new Date(dateStr) UTC 버그 방지 → parseDateStr 사용
    const cellDateOnly = parseDateStr(dateStr);
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
    return `<div class="cal-event-chip ${cc} ${isDone(item) ? 'done' : ''}">${escapeHtml(item.s_name)}</div>`;
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
  // [BUG FIX] i <= 7 → i < 7 로 수정 (8일치→7일치, "7일 이내" 정확히 처리)
  for (let i = 0; i < 7; i++) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() + i);
    const key = toDateStr(d);
    (grouped[key] || []).forEach(item => {
      // [BUG FIX] isDone() 헬퍼로 완료 여부 일관 처리
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
  // [BUG FIX] new Date('YYYY-MM-DD') → UTC 기준 파싱으로 getDay()가 전날 요일 반환
  // → 로컬 자정으로 파싱
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const label = `${dateObj.getFullYear()}년 ${dateObj.getMonth()+1}월 ${dateObj.getDate()}일 ${DAYS_KO[dateObj.getDay()]}요일`;
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
    // [BUG FIX] isDone() 헬퍼로 완료 여부 일관 처리
    return `
      <div class="modal-item ${isDone(item) ? 'done' : ''}" data-id="${item.id}">
        <div class="modal-item-header">
          <div class="modal-item-check" data-id="${item.id}">${isDone(item) ? '✓' : ''}</div>
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
      // [BUG FIX] isDone() 헬퍼로 현재 완료 여부 판단 후 반전
      await toggleComplete(id, !isDone(item));
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
  // [BUG FIX] CSS .modal-form { display: none } 수정으로 JS style 강제 오버라이드 불필요
  // visible 클래스 추가만으로 display: flex 전환됨
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
      body.s_end = null;
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
    // [BUG FIX] newState가 true면 현재 시각 ISO 문자열, false면 null 전송
    // s_end 컬럼이 timestamp 타입일 때도 boolean 타입일 때도 대응
    const s_end = newState ? new Date().toISOString() : null;
    await supabaseFetch(`schedule?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ s_end })
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
  // [BUG FIX] initCalendarControls()가 calYear/calMonth를 초기화하므로
  // 반드시 loadCalendarData() 호출 이전에 실행되어야 함
  initCalendarControls();
  initModal();

  await Promise.allSettled([
    loadTodaySchedule(),
    loadWeeklyClassHours(),
    loadExams(),
    loadCalendarData(calYear, calMonth)  // calYear/calMonth 이제 정상 초기화됨
  ]);

  renderCalendar();
}

document.addEventListener('DOMContentLoaded', init);
