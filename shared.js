// ==========================================
//  StudyHub — shared.js
//  공통 유틸리티: Supabase, 날짜, GNB, CRUD
//  모든 페이지에서 이 파일을 먼저 로드하세요.
// ==========================================

// ── Supabase ────────────────────────────────
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

// Date → 로컬 기준 'YYYY-MM-DD'
function toDateStr(d) {
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}

// ISO → 로컬 'YYYY-MM-DD'
function isoToDateStr(iso) {
  if (!iso) return '';
  return toDateStr(new Date(iso));
}

// 'YYYY-MM-DD' → 로컬 자정 Date (UTC 버그 방지)
function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 로컬 Date → 'YYYY-MM-DDTHH:MM:SS' (Supabase 쿼리용)
function toLocalISO(d) {
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
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

// ── 카테고리 유틸 ──────────────────────────
function catClass(cat) {
  if (!cat) return 'cat-default';
  if (cat.includes('과제') || cat.includes('수행')) return 'cat-과제';
  if (cat.includes('시험')) return 'cat-시험';
  if (cat.includes('약속')) return 'cat-약속';
  return 'cat-기타';
}

// s_end 완료 여부 (boolean)
function isDone(item) {
  return item.s_end === true;
}

// ── GNB 초기화 ───────────────────────────
function initGNB() {
  const gnb = document.getElementById('gnb');
  const hamburger = document.getElementById('hamburger');
  const menu = document.getElementById('gnbMenu');
  if (!gnb || !hamburger || !menu) return;

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

// ── 모달 아이템 렌더링 (공통) ─────────────
function renderModalItems(container, items, allSchedules, onRefresh) {
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

  container.querySelectorAll('.modal-item-check').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = allSchedules.find(s => String(s.id) === String(id));
      if (!item) return;
      await toggleComplete(id, !isDone(item));
      if (onRefresh) await onRefresh();
    });
  });

  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = allSchedules.find(s => String(s.id) === String(id));
      if (!item || !window._populateForm) return;
      window._populateForm(item);
      window._showForm && window._showForm();
    });
  });

  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      await deleteSchedule(id);
      if (onRefresh) await onRefresh();
    });
  });
}

// ── CRUD ────────────────────────────────────
async function toggleComplete(id, newState) {
  await supabaseFetch(`schedule?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ s_end: newState === true })
  });
}

async function deleteSchedule(id) {
  await supabaseFetch(`schedule?id=eq.${id}`, { method: 'DELETE' });
}

async function saveScheduleData(formData, id = null) {
  const body = {
    s_name: formData.name,
    s_date: formData.date ? new Date(formData.date).toISOString() : null,
    s_category: formData.category || null,
    s_keywords: formData.keywords.length > 0 ? formData.keywords : null,
    s_content: formData.content || null,
    s_add: formData.add || null,
  };
  if (id) {
    return supabaseFetch(`schedule?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
  } else {
    body.s_end = false;
    return supabaseFetch(`schedule`, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
  }
}

// ── 날짜별 일정 그룹핑 ──────────────────────
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