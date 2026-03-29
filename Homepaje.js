// ==========================================
//  StudyHub — homepage.js
//  홈 페이지 전용 로직 (shared.js 필수)
// ==========================================

// ── 전역 상태 ──────────────────────────────
let allSchedules = [];
let calYear, calMonth;
let compactMode = false;
let showDday = false;
let showUpcoming = true;
let nearestExamDate = null;
let modalCurrentDate = null;

// ── Hero 날짜 ──────────────────────────────
function initHeroDate() {
  const now = getNow();
  const el = document.getElementById('heroDate');
  if (!el) return;
  el.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

// ── Stat cards 클릭 ────────────────────────
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
    document.getElementById('statDone').textContent = data.filter(d => isDone(d)).length;

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

    list.querySelectorAll('.today-check').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = data.find(s => String(s.id) === String(id));
        if (!item) return;
        await toggleComplete(id, !isDone(item));
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

// ── 이번 주 수업 시간 ─────────────────────
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
  } catch {
    document.getElementById('statClass').textContent = '—';
  }
}

// ── 시험 목록 ─────────────────────────────
async function loadExams() {
  try {
    const now = new Date(); now.setHours(0,0,0,0);
    const data = await supabaseFetch(
      `schedule?s_category=eq.시험&s_end=eq.false&order=s_date.asc&limit=5`
    );
    const upcoming = (data || []).filter(d => d.s_date && new Date(d.s_date) >= now);

    if (upcoming.length > 0) {
      const next = new Date(upcoming[0].s_date);
      document.getElementById('statExam').textContent = Math.round((next - now) / 86400000);
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
  } catch {
    document.getElementById('statExam').textContent = '—';
    document.getElementById('examList').innerHTML = '<p class="empty-msg">시험 정보를 불러오지 못했습니다.</p>';
  }
}

// ==========================================
//  캘린더 시스템
// ==========================================

async function loadCalendarData(year, month) {
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

    const nowMidnight = new Date();
    nowMidnight.setHours(0,0,0,0);

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

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  label.textContent = `${calYear}.${_pad(calMonth)}`;

  const grouped = groupByDate(allSchedules);
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
  const lastDate = new Date(calYear, calMonth, 0).getDate();
  const prevLastDate = new Date(calYear, calMonth - 1, 0).getDate();
  const todayStr = toDateStr(getNow());
  const nowMidnight = new Date();
  nowMidnight.setHours(0,0,0,0);

  let cells = '';
  let dayCount = 0;

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevLastDate - i;
    cells += buildCell(toDateStr(new Date(calYear, calMonth - 2, d)), d, true, todayStr, grouped, nowMidnight);
    dayCount++;
  }
  for (let d = 1; d <= lastDate; d++) {
    cells += buildCell(toDateStr(new Date(calYear, calMonth - 1, d)), d, false, todayStr, grouped, nowMidnight);
    dayCount++;
  }
  const remaining = Math.ceil(dayCount / 7) * 7 - dayCount;
  for (let d = 1; d <= remaining; d++) {
    cells += buildCell(toDateStr(new Date(calYear, calMonth, d)), d, true, todayStr, grouped, nowMidnight);
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
  if (nearestExamDate) {
    const examMid = new Date(nearestExamDate); examMid.setHours(0,0,0,0);
    const diff = Math.round((examMid - parseDateStr(dateStr)) / 86400000);
    if (diff === 0)             ddayHtml = `<span class="cal-dday-badge">D-Day</span>`;
    else if (diff > 0 && diff <= 30) ddayHtml = `<span class="cal-dday-badge">D-${diff}</span>`;
  }

  const items = grouped[dateStr] || [];
  const shown = items.slice(0, 3);
  const more  = items.length - 3;
  const chipsHtml = shown.map(item =>
    `<div class="cal-event-chip ${catClass(item.s_category)} ${isDone(item) ? 'done' : ''}">${escapeHtml(item.s_name)}</div>`
  ).join('');

  return `
    <div class="${cls}" data-date="${dateStr}">
      <span class="cal-date-num">${dayNum}</span>
      ${ddayHtml}
      <div class="cal-events">${chipsHtml}${more > 0 ? `<div class="cal-more">+${more}개 더</div>` : ''}</div>
    </div>
  `;
}

function renderUpcoming(grouped, nowDate) {
  const panel = document.getElementById('upcomingPanel');
  const list  = document.getElementById('upcomingList');
  if (!panel || !list) return;

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
    return `
      <div class="upcoming-item" data-date="${item._dateStr}">
        <span class="upcoming-dday ${dd === 'D-Day' ? 'today' : ''}">${dd}</span>
        <span class="upcoming-name">${escapeHtml(item.s_name)}</span>
        ${item.s_category ? `<span class="upcoming-cat ${catClass(item.s_category)}">${escapeHtml(item.s_category)}</span>` : ''}
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

function initCalendarControls() {
  const now = getNow();
  calYear  = now.getFullYear();
  calMonth = now.getMonth() + 1;

  document.getElementById('calPrev').addEventListener('click', async () => {
    if (--calMonth < 1) { calMonth = 12; calYear--; }
    await loadCalendarData(calYear, calMonth);
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', async () => {
    if (++calMonth > 12) { calMonth = 1; calYear++; }
    await loadCalendarData(calYear, calMonth);
    renderCalendar();
  });

  const btnCompact  = document.getElementById('btnCompact');
  const btnDday     = document.getElementById('btnDday');
  const btnUpcoming = document.getElementById('btnUpcoming');

  btnCompact.addEventListener('click', () => {
    compactMode = !compactMode;
    btnCompact.classList.toggle('active', compactMode);
    renderCalendar();
  });
  btnDday.addEventListener('click', () => {
    showDday = !showDday;
    btnDday.classList.toggle('active', showDday);
    renderCalendar();
  });
  btnUpcoming.addEventListener('click', () => {
    showUpcoming = !showUpcoming;
    btnUpcoming.classList.toggle('active', showUpcoming);
    renderCalendar();
  });
  btnUpcoming.classList.add('active');
}

// ── 모달 ────────────────────────────────────
function openModal(dateStr, items) {
  modalCurrentDate = dateStr;
  const overlay = document.getElementById('modalOverlay');
  const d = parseDateStr(dateStr);
  document.getElementById('modalDateLabel').textContent =
    `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일`;

  const ddEl = document.getElementById('modalDday');
  const examItems = items.filter(i => i.s_category && i.s_category.includes('시험'));
  ddEl.textContent = examItems.length > 0 ? `🎯 ${dDay(dateStr)}` : '';

  _renderHomepageModalItems(items);
  hideForm();
  document.getElementById('formDate').value = `${dateStr}T09:00`;
  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalCurrentDate = null;
}

function _renderHomepageModalItems(items) {
  const container = document.getElementById('modalItems');
  renderModalItems(container, items, allSchedules, async () => {
    await refreshCalendarAndToday();
    const grouped = groupByDate(allSchedules);
    _renderHomepageModalItems(grouped[modalCurrentDate] || []);
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

// shared.js에서 form 콜백으로 사용
window._populateForm = populateForm;
window._showForm = showForm;

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
  document.getElementById('formSave').addEventListener('click', saveScheduleForm);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

async function saveScheduleForm() {
  const name = document.getElementById('formName').value.trim();
  if (!name) { alert('제목을 입력하세요.'); return; }

  const keywordsRaw = document.getElementById('formKeywords').value.trim();
  const formData = {
    name,
    date: document.getElementById('formDate').value,
    category: document.getElementById('formCategory').value,
    keywords: keywordsRaw ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean) : [],
    content: document.getElementById('formContent').value.trim(),
    add: document.getElementById('formAdd').value.trim(),
  };
  const id = document.getElementById('formId').value;

  try {
    await saveScheduleData(formData, id || null);
    hideForm();
    await refreshCalendarAndToday();
    const grouped = groupByDate(allSchedules);
    _renderHomepageModalItems(grouped[modalCurrentDate] || []);
  } catch (e) {
    console.error('저장 실패:', e);
    alert('저장에 실패했습니다.');
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