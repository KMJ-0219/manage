// ==========================================
//  StudyHub — schedual.js
//  일정관리 페이지 전용 로직 (shared.js 필수)
// ==========================================

// ── 전역 상태 ──────────────────────────────
let allItems = [];        // Supabase에서 불러온 전체 일정
let filteredItems = [];   // 필터/검색 적용 결과
let currentView = 'list'; // 'list' | 'kanban'
let currentPage = 1;
const PAGE_SIZE = 30;

let editingId = null;      // 수정 중인 일정 ID
let detailDate = null;     // 사이드 패널에 열린 날짜

// ── 데이터 로드 ─────────────────────────────
async function loadAllSchedules() {
  try {
    const data = await supabaseFetch('schedule?order=s_date.asc&limit=1000');
    allItems = data || [];
    applyFilters();
    updateSummary();
  } catch (e) {
    console.error('일정 로드 실패:', e);
    showToast('일정을 불러오지 못했습니다.', 'error');
  }
}

// ── 필터 & 검색 ─────────────────────────────
function applyFilters() {
  const query    = document.getElementById('searchInput').value.trim().toLowerCase();
  const catFilter = document.getElementById('catFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;
  const sortBy   = document.getElementById('sortSelect').value;

  filteredItems = allItems.filter(item => {
    // 검색어
    if (query) {
      const haystack = [item.s_name, item.s_content, item.s_add,
        ...(Array.isArray(item.s_keywords) ? item.s_keywords : [])
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    // 카테고리
    if (catFilter && catFilter !== '전체') {
      if (!item.s_category || !item.s_category.includes(catFilter)) return false;
    }
    // 완료 상태
    if (statusFilter === '미완료' && isDone(item)) return false;
    if (statusFilter === '완료'   && !isDone(item)) return false;

    return true;
  });

  // 정렬
  filteredItems.sort((a, b) => {
    if (sortBy === '날짜순') return new Date(a.s_date) - new Date(b.s_date);
    if (sortBy === '날짜역순') return new Date(b.s_date) - new Date(a.s_date);
    if (sortBy === '이름순') return (a.s_name || '').localeCompare(b.s_name || '');
    return 0;
  });

  currentPage = 1;
  renderCurrentView();
}

// ── 요약 스탯 ───────────────────────────────
function updateSummary() {
  const now = new Date(); now.setHours(0,0,0,0);
  const todayStr = toDateStr(getNow());

  const total   = allItems.length;
  const done    = allItems.filter(isDone).length;
  const today   = allItems.filter(i => i.s_date && isoToDateStr(i.s_date) === todayStr && !isDone(i)).length;
  const exams   = allItems.filter(i => i.s_category === '시험' && !isDone(i)
    && i.s_date && new Date(i.s_date) >= now).length;

  setEl('summTotal', total);
  setEl('summDone', done);
  setEl('summToday', today);
  setEl('summExam', exams);
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── 뷰 렌더링 ───────────────────────────────
function renderCurrentView() {
  if (currentView === 'list') renderListView();
  else renderKanbanView();
}

/* ---- 리스트 뷰 ---- */
function renderListView() {
  const container = document.getElementById('listView');
  if (!container) return;

  if (filteredItems.length === 0) {
    container.innerHTML = '<div class="empty-msg" style="padding:40px 0">일정이 없습니다.</div>';
    document.getElementById('paginationWrap').innerHTML = '';
    return;
  }

  // 페이지네이션
  const total = filteredItems.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);

  // 날짜 그룹핑
  const groups = {};
  pageItems.forEach(item => {
    const key = item.s_date ? isoToDateStr(item.s_date) : '날짜 없음';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const todayStr = toDateStr(getNow());

  container.innerHTML = Object.entries(groups).map(([dateStr, items]) => {
    const isToday = dateStr === todayStr;
    const dateLabel = dateStr === '날짜 없음' ? '날짜 없음' : (() => {
      const d = parseDateStr(dateStr);
      return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;
    })();
    const ddayStr = dateStr !== '날짜 없음' ? dDay(dateStr) : '';
    const isExamDay = items.some(i => i.s_category === '시험');

    return `
      <div class="date-group">
        <div class="date-group-header">
          <span class="date-group-label ${isToday ? 'today-label' : ''}">${dateLabel}</span>
          ${ddayStr && isExamDay ? `<span class="date-group-dday">${ddayStr}</span>` : ''}
          <span class="date-group-count">${items.length}개</span>
        </div>
        ${items.map(item => buildSchedItem(item)).join('')}
      </div>
    `;
  }).join('');

  // 이벤트 바인딩
  bindListEvents(container);

  // 페이지네이션 렌더
  renderPagination(totalPages);
}

function buildSchedItem(item) {
  const cc = catClass(item.s_category);
  const keywords = Array.isArray(item.s_keywords) ? item.s_keywords : [];
  return `
    <div class="sched-item ${isDone(item) ? 'done' : ''}" data-id="${item.id}">
      <div class="sched-check" data-id="${item.id}">${isDone(item) ? '✓' : ''}</div>
      <div class="sched-body">
        <div class="sched-name">${escapeHtml(item.s_name)}</div>
        <div class="sched-meta">
          ${item.s_date ? `<span class="sched-time">${formatDateTime(item.s_date)}</span>` : ''}
          ${item.s_category ? `<span class="sched-cat ${cc}">${escapeHtml(item.s_category)}</span>` : ''}
          ${keywords.slice(0,3).map(k => `<span class="sched-keyword">${escapeHtml(k)}</span>`).join('')}
        </div>
        ${item.s_content ? `<div class="sched-content-preview">${escapeHtml(item.s_content)}</div>` : ''}
      </div>
      <div class="sched-actions">
        <button class="sched-action-btn edit-btn" data-id="${item.id}">✏️</button>
        <button class="sched-action-btn del del-btn" data-id="${item.id}">🗑️</button>
      </div>
    </div>
  `;
}

function bindListEvents(container) {
  // 완료 체크
  container.querySelectorAll('.sched-check').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = allItems.find(i => String(i.id) === String(id));
      if (!item) return;
      try {
        await toggleComplete(id, !isDone(item));
        await loadAllSchedules();
      } catch {
        showToast('완료 상태 변경 실패', 'error');
      }
    });
  });

  // 수정
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = allItems.find(i => String(i.id) === String(btn.dataset.id));
      if (item) openForm(item);
    });
  });

  // 삭제
  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      try {
        await deleteSchedule(btn.dataset.id);
        await loadAllSchedules();
        showToast('삭제되었습니다.');
      } catch {
        showToast('삭제 실패', 'error');
      }
    });
  });
}

/* ---- 칸반 뷰 ---- */
const KANBAN_CATS = ['과제', '시험', '약속', '기타'];
const KANBAN_ICONS = { '과제': '📋', '시험': '📝', '약속': '🤝', '기타': '📌' };

function renderKanbanView() {
  const container = document.getElementById('kanbanView');
  if (!container) return;
  document.getElementById('paginationWrap').innerHTML = '';

  container.innerHTML = KANBAN_CATS.map(cat => {
    const items = filteredItems.filter(i => {
      if (cat === '기타') {
        return !i.s_category || !KANBAN_CATS.slice(0,-1).some(c => i.s_category.includes(c));
      }
      return i.s_category && i.s_category.includes(cat);
    });
    return `
      <div class="kanban-col" data-cat="${cat}">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${KANBAN_ICONS[cat]} ${cat}</span>
          <span class="kanban-col-count">${items.length}</span>
        </div>
        ${items.length === 0
          ? '<div class="empty-msg" style="padding:20px 0;font-size:0.78rem">없음</div>'
          : items.map(buildKanbanCard).join('')
        }
      </div>
    `;
  }).join('');

  container.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      const item = allItems.find(i => String(i.id) === String(card.dataset.id));
      if (item) openDetailForItem(item);
    });
  });
}

function buildKanbanCard(item) {
  const dateStr = item.s_date ? isoToDateStr(item.s_date) : null;
  const cc = catClass(item.s_category);
  return `
    <div class="kanban-card ${isDone(item) ? 'done' : ''}" data-id="${item.id}">
      ${item.s_category ? `<span class="kanban-card-cat ${cc}">${escapeHtml(item.s_category)}</span>` : ''}
      <div class="kanban-card-name">${escapeHtml(item.s_name)}</div>
      ${dateStr ? `<div class="kanban-card-date">${formatDate(item.s_date)}</div>` : ''}
      ${dateStr && !isDone(item) ? `<div class="kanban-card-dday">${dDay(dateStr)}</div>` : ''}
    </div>
  `;
}

/* ---- 페이지네이션 ---- */
function renderPagination(totalPages) {
  const wrap = document.getElementById('paginationWrap');
  if (!wrap || totalPages <= 1) { if (wrap) wrap.innerHTML = ''; return; }

  let html = `<button class="page-btn" id="pgPrev" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 3) {
      html += `<span style="color:var(--text3);align-self:center">…</span>`;
    }
  }
  html += `<button class="page-btn" id="pgNext" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
  wrap.innerHTML = html;

  wrap.querySelector('#pgPrev')?.addEventListener('click', () => { currentPage--; renderCurrentView(); });
  wrap.querySelector('#pgNext')?.addEventListener('click', () => { currentPage++; renderCurrentView(); });
  wrap.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = +btn.dataset.page; renderCurrentView(); });
  });
}

// ── 인라인 폼 (추가/수정) ──────────────────
function openForm(item = null) {
  editingId = item ? item.id : null;
  const overlay = document.getElementById('formOverlay');
  const title   = document.getElementById('formPanelTitle');

  title.textContent = item ? '일정 수정' : '새 일정 추가';

  document.getElementById('fpId').value       = item ? item.id : '';
  document.getElementById('fpName').value     = item ? (item.s_name || '') : '';
  document.getElementById('fpDate').value     = item ? toLocalDatetimeValue(item.s_date) : '';
  document.getElementById('fpCategory').value = item ? (item.s_category || '') : '';
  document.getElementById('fpKeywords').value = item
    ? (Array.isArray(item.s_keywords) ? item.s_keywords.join(', ') : (item.s_keywords || ''))
    : '';
  document.getElementById('fpContent').value  = item ? (item.s_content || '') : '';
  document.getElementById('fpAdd').value      = item ? (item.s_add || '') : '';

  overlay.classList.add('open');
  document.getElementById('fpName').focus();
}

function closeForm() {
  document.getElementById('formOverlay').classList.remove('open');
  editingId = null;
}

async function submitForm() {
  const name = document.getElementById('fpName').value.trim();
  if (!name) { alert('제목을 입력하세요.'); return; }

  const keywordsRaw = document.getElementById('fpKeywords').value.trim();
  const formData = {
    name,
    date: document.getElementById('fpDate').value,
    category: document.getElementById('fpCategory').value,
    keywords: keywordsRaw ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean) : [],
    content: document.getElementById('fpContent').value.trim(),
    add: document.getElementById('fpAdd').value.trim(),
  };

  try {
    await saveScheduleData(formData, editingId);
    closeForm();
    await loadAllSchedules();
    showToast(editingId ? '수정되었습니다.' : '추가되었습니다.');
  } catch (e) {
    console.error('저장 실패:', e);
    showToast('저장에 실패했습니다.', 'error');
  }
}

// ── 상세 사이드 패널 ──────────────────────
function openDetailForItem(item) {
  const dateStr = item.s_date ? isoToDateStr(item.s_date) : null;
  if (dateStr) openDetailPanel(dateStr);
}

function openDetailPanel(dateStr) {
  detailDate = dateStr;
  const overlay = document.getElementById('detailOverlay');
  const d = parseDateStr(dateStr);
  document.getElementById('detailDateLabel').textContent =
    `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;

  const examItems = allItems.filter(i =>
    i.s_date && isoToDateStr(i.s_date) === dateStr && i.s_category === '시험' && !isDone(i)
  );
  document.getElementById('detailDday').textContent = examItems.length > 0 ? `🎯 ${dDay(dateStr)}` : '';

  renderDetailItems();
  overlay.classList.add('open');
}

function closeDetailPanel() {
  document.getElementById('detailOverlay').classList.remove('open');
  detailDate = null;
}

function renderDetailItems() {
  const container = document.getElementById('detailItems');
  if (!container || !detailDate) return;

  const items = allItems.filter(i => i.s_date && isoToDateStr(i.s_date) === detailDate);
  renderModalItems(container, items, allItems, async () => {
    await loadAllSchedules();
    renderDetailItems();
  });
}

// ── 토스트 알림 ─────────────────────────────
function showToast(msg, type = 'success') {
  const existing = document.getElementById('toastEl');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toastEl';
  toast.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:${type === 'error' ? 'var(--accent-red)' : 'var(--accent3)'};
    color:${type === 'error' ? 'white' : '#0d0f14'};
    padding:10px 20px; border-radius:8px; font-size:0.85rem; font-weight:600;
    z-index:9999; box-shadow:var(--shadow); animation:fadeUp 0.3s ease;
    white-space:nowrap;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ── 이벤트 초기화 ───────────────────────────
function initSchedualPage() {
  initGNB();

  // 필터/검색 이벤트
  document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 300));
  document.getElementById('catFilter').addEventListener('change', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('sortSelect').addEventListener('change', applyFilters);

  // 뷰 전환
  document.getElementById('viewList').addEventListener('click', () => {
    currentView = 'list';
    document.getElementById('viewList').classList.add('active');
    document.getElementById('viewKanban').classList.remove('active');
    document.getElementById('listView').classList.add('active');
    document.getElementById('kanbanView').classList.remove('active');
    renderCurrentView();
  });
  document.getElementById('viewKanban').addEventListener('click', () => {
    currentView = 'kanban';
    document.getElementById('viewKanban').classList.add('active');
    document.getElementById('viewList').classList.remove('active');
    document.getElementById('kanbanView').classList.add('active');
    document.getElementById('listView').classList.remove('active');
    renderCurrentView();
  });

  // 추가 버튼
  document.getElementById('addBtn').addEventListener('click', () => openForm());

  // 인라인 폼
  document.getElementById('formOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('formOverlay')) closeForm();
  });
  document.getElementById('formPanelClose').addEventListener('click', closeForm);
  document.getElementById('fpCancel').addEventListener('click', closeForm);
  document.getElementById('fpSave').addEventListener('click', submitForm);

  // 사이드 패널
  document.getElementById('detailOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detailOverlay')) closeDetailPanel();
  });
  document.getElementById('detailClose').addEventListener('click', closeDetailPanel);
  document.getElementById('detailAddBtn').addEventListener('click', () => {
    closeDetailPanel();
    openForm();
  });

  // ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeForm(); closeDetailPanel(); }
  });

  // shared.js 콜백 연동
  window._populateForm = openForm;
  window._showForm = () => {};
}

// ── 디바운스 ────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── 앱 초기화 ──────────────────────────────
async function init() {
  initSchedualPage();
  await loadAllSchedules();
}

document.addEventListener('DOMContentLoaded', init);