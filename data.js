// ==========================================
//  StudyHub — data.js
//  자료 페이지 (플레이리스트 + 아이템 + 카테고리)
//  Supabase REST API 직접 호출
// ==========================================

const SUPABASE_URL = 'https://cyqjgixdvlywkzyamerx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_casPdXLoUENk-a-oSC7RiQ_vmg9QmiR';

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      ...opts.headers
    }
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

// ── 유틸 ───────────────────────────────────
const DAYS_KO = ['일','월','화','수','목','금','토'];
const _pad = n => String(n).padStart(2,'0');
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${_pad(d.getMonth()+1)}.${_pad(d.getDate())}`;
}
function relDate(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7)  return `${diff}일 전`;
  if (diff < 30) return `${Math.floor(diff/7)}주 전`;
  if (diff < 365)return `${Math.floor(diff/30)}개월 전`;
  return `${Math.floor(diff/365)}년 전`;
}

// 타입별 아이콘/라벨
const TYPE_INFO = {
  link:  { ico: '🔗', label: '링크' },
  note:  { ico: '📝', label: '노트' },
  file:  { ico: '📎', label: '파일' },
  video: { ico: '🎬', label: '영상' },
};
function typeIco(t)   { return (TYPE_INFO[t] || TYPE_INFO.note).ico; }
function typeLabel(t) { return (TYPE_INFO[t] || TYPE_INFO.note).label; }

// 플레이리스트 커버 색상 팔레트
const COVER_COLORS = [
  'linear-gradient(135deg,#4f46e5,#7c3aed)',
  'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#ec4899,#a855f7)',
  'linear-gradient(135deg,#14b8a6,#0284c7)',
  'linear-gradient(135deg,#f97316,#eab308)',
  'linear-gradient(135deg,#8b5cf6,#3b82f6)',
];
const COVER_ICOS = ['📚','📖','📗','📘','📙','🗂️','💡','🔬','🎓','✏️','🧮','🗺️'];

function coverGradient(id) {
  // uuid 첫 글자로 결정적으로 색상 선택
  const idx = (id || '').charCodeAt(0) % COVER_COLORS.length;
  return COVER_COLORS[idx];
}
function coverIco(id) {
  const idx = ((id || '').charCodeAt(1) || 0) % COVER_ICOS.length;
  return COVER_ICOS[idx];
}

// ── 전역 상태 ──────────────────────────────
let allPlaylists   = [];   // 전체 플레이리스트
let allCategories  = [];   // 전체 카테고리
let plCategories   = {};   // { playlist_id: [cat_id, ...] }

let currentPlaylistId = null;
let currentItems      = [];
let currentItemFilter = 'all';

let filterCatId  = 'all';
let sortMode     = 'updated';
let searchQuery  = '';

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
  menu.querySelectorAll('.gnb-link').forEach(l => l.addEventListener('click', () => {
    hamburger.classList.remove('open');
    menu.classList.remove('open');
  }));
}

function initDate() {
  const now = new Date();
  document.getElementById('dhDate').textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

// ==========================================
//  데이터 로딩
// ==========================================
async function loadAll() {
  await Promise.all([loadPlaylists(), loadCategories(), loadPlCategories()]);
}

async function loadPlaylists() {
  const data = await sb('playlists?select=*&order=updated_at.desc');
  allPlaylists = data || [];
}

async function loadCategories() {
  const data = await sb('categories?select=*&order=name.asc');
  allCategories = data || [];
}

async function loadPlCategories() {
  const data = await sb('playlist_categories?select=playlist_id,category_id');
  plCategories = {};
  (data || []).forEach(r => {
    if (!plCategories[r.playlist_id]) plCategories[r.playlist_id] = [];
    plCategories[r.playlist_id].push(r.category_id);
  });
}

async function loadItems(playlistId) {
  const data = await sb(
    `playlist_items?playlist_id=eq.${playlistId}&order=position.asc,created_at.asc`
  );
  currentItems = data || [];
}

// ==========================================
//  플레이리스트 그리드 렌더링
// ==========================================
function getFilteredPlaylists() {
  let list = [...allPlaylists];

  // 카테고리 필터
  if (filterCatId !== 'all') {
    list = list.filter(pl => (plCategories[pl.id] || []).includes(filterCatId));
  }

  // 검색
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(pl =>
      (pl.title || '').toLowerCase().includes(q) ||
      (pl.description || '').toLowerCase().includes(q)
    );
  }

  // 정렬
  if (sortMode === 'updated') list.sort((a,b) => new Date(b.updated_at)-new Date(a.updated_at));
  if (sortMode === 'created') list.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  if (sortMode === 'name')    list.sort((a,b) => (a.title||'').localeCompare(b.title||'','ko'));

  return list;
}

function renderPlaylistGrid() {
  const grid       = document.getElementById('playlistGrid');
  const emptyState = document.getElementById('emptyState');
  const filtered   = getFilteredPlaylists();

  if (filtered.length === 0) {
    grid.style.display  = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  grid.style.display  = '';
  emptyState.style.display = 'none';

  // 아이템 수는 allPlaylists에 별도 필드 없으므로 추후 캐시
  grid.innerHTML = filtered.map(pl => buildPlCard(pl)).join('');

  grid.querySelectorAll('.dh-pl-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

function buildPlCard(pl) {
  const cats = (plCategories[pl.id] || [])
    .map(cid => allCategories.find(c => c.id === cid))
    .filter(Boolean)
    .slice(0,3);
  const catHtml = cats.map(c => `<span class="dh-pl-cat-tag">${escHtml(c.name)}</span>`).join('');
  const diffClass = pl.difficulty ? `dh-diff-${pl.difficulty}` : '';
  const isActive  = pl.id === currentPlaylistId;

  return `
    <div class="dh-pl-card ${isActive?'active':''}" data-id="${pl.id}">
      <div class="dh-pl-cover" style="background:${coverGradient(pl.id)}">
        <span class="dh-pl-cover-ico">${coverIco(pl.id)}</span>
      </div>
      <div class="dh-pl-body">
        ${catHtml ? `<div class="dh-pl-cats">${catHtml}</div>` : ''}
        <div class="dh-pl-name">${escHtml(pl.title)}</div>
        ${pl.description ? `<div class="dh-pl-desc">${escHtml(pl.description)}</div>` : ''}
        <div class="dh-pl-footer">
          <span class="dh-pl-count">📄 자료 로딩 중...</span>
          ${pl.difficulty ? `<span class="dh-pl-diff ${diffClass}">${pl.difficulty}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// 카드 아이템 수 업데이트 (items 로드 후)
function updateCardItemCount(playlistId, count) {
  const card = document.querySelector(`.dh-pl-card[data-id="${playlistId}"] .dh-pl-count`);
  if (card) card.textContent = `📄 ${count}개 자료`;
}

// ==========================================
//  카테고리 필터 바 렌더링
// ==========================================
function renderCatFilterBar() {
  const bar = document.getElementById('catFilterBar');
  bar.innerHTML = `<button class="dh-cat-chip ${filterCatId==='all'?'active':''}" data-cat-id="all">전체</button>`
    + allCategories.map(c =>
        `<button class="dh-cat-chip ${filterCatId===c.id?'active':''}" data-cat-id="${c.id}">${escHtml(c.name)}</button>`
      ).join('');

  bar.querySelectorAll('.dh-cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filterCatId = btn.dataset.catId;
      bar.querySelectorAll('.dh-cat-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPlaylistGrid();
    });
  });
}

// ==========================================
//  플레이리스트 상세 패널
// ==========================================
async function openDetail(playlistId) {
  currentPlaylistId = playlistId;
  currentItemFilter = 'all';

  // 카드 active 표시
  document.querySelectorAll('.dh-pl-card').forEach(c => {
    c.classList.toggle('active', c.dataset.id === playlistId);
  });

  const pl = allPlaylists.find(p => p.id === playlistId);
  if (!pl) return;

  // 모바일: 패널 열기
  document.getElementById('detailPanel').classList.add('open');
  document.getElementById('detailEmpty').style.display = 'none';
  const content = document.getElementById('detailContent');
  content.style.display = '';

  // 커버
  const cover = document.getElementById('detailCover');
  cover.style.background = coverGradient(pl.id);
  cover.textContent = coverIco(pl.id);

  // 카테고리
  const cats = (plCategories[pl.id] || [])
    .map(cid => allCategories.find(c => c.id === cid))
    .filter(Boolean);
  document.getElementById('detailCats').innerHTML =
    cats.map(c => `<span class="dh-pl-cat-tag">${escHtml(c.name)}</span>`).join('');

  // 제목/설명/메타
  document.getElementById('detailTitle').textContent = pl.title || '';
  document.getElementById('detailDesc').textContent  = pl.description || '';

  const diffHtml = pl.difficulty
    ? `<span class="dh-pl-diff dh-diff-${pl.difficulty}">${pl.difficulty}</span>` : '';
  document.getElementById('detailMeta').innerHTML =
    `${diffHtml}<span>수정 ${relDate(pl.updated_at)}</span><span>생성 ${fmtDate(pl.created_at)}</span>`;

  // 아이템 로드 + 렌더
  document.getElementById('itemsList').innerHTML =
    '<div class="dh-items-empty"><div class="dh-items-empty-ico">⏳</div></div>';
  document.getElementById('itemsCount').textContent = '불러오는 중...';

  await loadItems(playlistId);
  updateCardItemCount(playlistId, currentItems.length);
  renderItems();

  // 버튼 이벤트 재바인딩
  document.getElementById('btnEditPlaylist').onclick   = () => openPlModal(pl);
  document.getElementById('btnDeletePlaylist').onclick = () => deletePlaylist(playlistId);
  document.getElementById('btnAddItem').onclick        = () => openItemModal(null, playlistId);
  document.getElementById('detailClose').onclick       = closeDetail;
}

function closeDetail() {
  currentPlaylistId = null;
  document.getElementById('detailPanel').classList.remove('open');
  document.getElementById('detailEmpty').style.display = '';
  document.getElementById('detailContent').style.display = 'none';
  document.querySelectorAll('.dh-pl-card').forEach(c => c.classList.remove('active'));
}

// ==========================================
//  자료 아이템 렌더링
// ==========================================
function renderItems() {
  const list = document.getElementById('itemsList');
  const countEl = document.getElementById('itemsCount');

  let filtered = currentItemFilter === 'all'
    ? currentItems
    : currentItems.filter(i => i.type === currentItemFilter);

  countEl.textContent = `${filtered.length}개 자료`;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="dh-items-empty">
        <div class="dh-items-empty-ico">📭</div>
        <div class="dh-items-empty-title">자료가 없습니다</div>
        <div class="dh-items-empty-sub">+ 자료 추가 버튼으로 첫 자료를 등록해 보세요.</div>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((item, idx) => buildItemRow(item, idx)).join('');

  // 클릭 → 뷰어
  list.querySelectorAll('.dh-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.dh-item-action-btn') || e.target.closest('.dh-item-handle')) return;
      const id   = el.dataset.id;
      const item = currentItems.find(i => i.id === id);
      if (item) openViewer(item);
    });
  });

  // 수정/삭제 버튼
  list.querySelectorAll('.dh-item-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = currentItems.find(i => i.id === btn.dataset.id);
      if (item) openItemModal(item, currentPlaylistId);
    });
  });
  list.querySelectorAll('.dh-item-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('이 자료를 삭제하시겠습니까?')) return;
      await deleteItem(btn.dataset.id);
    });
  });
}

function buildItemRow(item, idx) {
  const ti = TYPE_INFO[item.type] || TYPE_INFO.note;
  const preview = item.content
    ? item.content.replace(/\n/g,' ').slice(0, 80) + (item.content.length > 80 ? '…' : '')
    : '';
  const urlDisplay = item.url ? item.url.replace(/^https?:\/\//,'').slice(0, 50) : '';

  return `
    <div class="dh-item" data-id="${item.id}">
      <div class="dh-item-handle">⣿</div>
      <div class="dh-item-ico ${item.type || 'note'}">${ti.ico}</div>
      <div class="dh-item-info">
        <div class="dh-item-title">${escHtml(item.title)}</div>
        ${preview    ? `<div class="dh-item-preview">${escHtml(preview)}</div>` : ''}
        ${urlDisplay ? `<div class="dh-item-url">🔗 ${escHtml(urlDisplay)}</div>` : ''}
      </div>
      <div class="dh-item-actions">
        <button class="dh-item-action-btn dh-item-edit-btn" data-id="${item.id}" title="수정">✏️</button>
        <button class="dh-item-action-btn danger dh-item-del-btn" data-id="${item.id}" title="삭제">🗑️</button>
      </div>
    </div>`;
}

// ==========================================
//  뷰어
// ==========================================
function openViewer(item) {
  const overlay = document.getElementById('viewerOverlay');
  const ti = TYPE_INFO[item.type] || TYPE_INFO.note;

  document.getElementById('viewerTypeBadge').textContent = ti.label;
  document.getElementById('viewerTitle').textContent     = item.title || '';

  const linkBtn = document.getElementById('viewerLinkBtn');
  if (item.url) {
    linkBtn.href = item.url;
    linkBtn.style.display = '';
  } else {
    linkBtn.style.display = 'none';
  }

  const body = document.getElementById('viewerBody');
  if (item.type === 'link' && item.url && !item.content) {
    // 링크만 있는 경우 → 바로 열기 안내
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--text3)">
        <div style="font-size:2.5rem">🔗</div>
        <p style="font-size:0.9rem">외부 링크입니다.</p>
        <a href="${escHtml(item.url)}" target="_blank" rel="noopener"
           style="padding:9px 20px;border-radius:8px;background:var(--accent);color:#fff;font-size:0.85rem;font-weight:700;text-decoration:none">
          링크 열기 →
        </a>
        <p style="font-size:0.72rem;word-break:break-all;color:var(--text3)">${escHtml(item.url)}</p>
      </div>`;
  } else {
    // 노트/내용 표시
    body.innerHTML = '';
    if (item.url && item.content) {
      body.innerHTML += `<div style="margin-bottom:12px;padding:10px 14px;background:var(--bg3);border-radius:8px;border:1px solid var(--border)">
        <a href="${escHtml(item.url)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:0.82rem;word-break:break-all">🔗 ${escHtml(item.url)}</a>
      </div>`;
    }
    body.innerHTML += `<div style="white-space:pre-wrap;word-break:break-word">${escHtml(item.content || '(내용 없음)')}</div>`;
  }

  overlay.classList.add('open');
  document.getElementById('viewerClose').onclick = () => overlay.classList.remove('open');
  overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove('open'); };
}

// ==========================================
//  플레이리스트 CRUD
// ==========================================
function openPlModal(pl = null) {
  const overlay = document.getElementById('plModalOverlay');
  document.getElementById('plModalTitle').textContent = pl ? '플레이리스트 수정' : '새 플레이리스트';
  document.getElementById('plId').value    = pl ? pl.id : '';
  document.getElementById('plTitle').value = pl ? (pl.title || '') : '';
  document.getElementById('plDesc').value  = pl ? (pl.description || '') : '';
  document.getElementById('plDiff').value  = pl ? (pl.difficulty || '') : '';

  // 난이도 버튼
  document.querySelectorAll('.dh-diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === (pl?.difficulty || ''));
  });

  // 카테고리 선택 렌더
  const selectedCats = pl ? (plCategories[pl.id] || []) : [];
  renderPlCatSelect(selectedCats);

  overlay.classList.add('open');
}

function renderPlCatSelect(selected = []) {
  const container = document.getElementById('plCatList');
  if (allCategories.length === 0) {
    container.innerHTML = '<span style="font-size:.78rem;color:var(--text3)">카테고리가 없습니다. 먼저 카테고리를 추가하세요.</span>';
    return;
  }
  container.innerHTML = allCategories.map(c => `
    <span class="dh-cat-sel-chip ${selected.includes(c.id)?'selected':''}" data-cat-id="${c.id}">
      ${escHtml(c.name)}
    </span>`).join('');

  container.querySelectorAll('.dh-cat-sel-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });
}

async function savePl() {
  const id    = document.getElementById('plId').value;
  const title = document.getElementById('plTitle').value.trim();
  if (!title) { alert('제목을 입력하세요.'); return; }

  const body = {
    title,
    description: document.getElementById('plDesc').value.trim() || null,
    difficulty:  document.getElementById('plDiff').value || null,
  };

  try {
    let plId = id;
    if (id) {
      await sb(`playlists?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    } else {
      const res = await sb('playlists', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
      plId = res?.[0]?.id || res?.id;
    }

    // 카테고리 연결 업데이트
    if (plId) {
      // 기존 삭제
      await sb(`playlist_categories?playlist_id=eq.${plId}`, { method: 'DELETE' });
      // 새로 선택된 것들 삽입
      const selectedCatIds = [...document.querySelectorAll('#plCatList .dh-cat-sel-chip.selected')]
        .map(el => el.dataset.catId);
      if (selectedCatIds.length > 0) {
        const rows = selectedCatIds.map(cid => ({ playlist_id: plId, category_id: cid }));
        await sb('playlist_categories', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(rows)
        });
      }
    }

    closePlModal();
    await loadAll();
    renderCatFilterBar();
    renderPlaylistGrid();
    if (plId && currentPlaylistId === plId) openDetail(plId);
  } catch(e) {
    console.error('플레이리스트 저장 실패:', e);
    alert('저장에 실패했습니다.');
  }
}

async function deletePlaylist(id) {
  if (!confirm('플레이리스트와 모든 자료를 삭제하시겠습니까?')) return;
  try {
    await sb(`playlists?id=eq.${id}`, { method: 'DELETE' });
    closeDetail();
    await loadAll();
    renderCatFilterBar();
    renderPlaylistGrid();
  } catch(e) {
    console.error('삭제 실패:', e);
    alert('삭제에 실패했습니다.');
  }
}

function closePlModal() { document.getElementById('plModalOverlay').classList.remove('open'); }

// ==========================================
//  자료 아이템 CRUD
// ==========================================
function openItemModal(item = null, playlistId) {
  const overlay = document.getElementById('itemModalOverlay');
  document.getElementById('itemModalTitle').textContent = item ? '자료 수정' : '자료 추가';
  document.getElementById('itemId').value      = item ? item.id : '';
  document.getElementById('itemTitle').value   = item ? (item.title || '') : '';
  document.getElementById('itemUrl').value     = item ? (item.url || '') : '';
  document.getElementById('itemContent').value = item ? (item.content || '') : '';

  const type = item?.type || 'link';
  document.getElementById('itemType').value = type;

  document.querySelectorAll('.dh-type-sel-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  toggleUrlRow(type);

  overlay.classList.add('open');
}

function toggleUrlRow(type) {
  document.getElementById('itemUrlRow').style.display =
    (type === 'link' || type === 'video') ? '' : 'none';
}

async function saveItem() {
  const id    = document.getElementById('itemId').value;
  const title = document.getElementById('itemTitle').value.trim();
  const type  = document.getElementById('itemType').value;
  if (!title) { alert('제목을 입력하세요.'); return; }

  const body = {
    playlist_id: currentPlaylistId,
    title,
    type,
    url:     document.getElementById('itemUrl').value.trim() || null,
    content: document.getElementById('itemContent').value.trim() || null,
    position: id ? undefined : currentItems.length,
  };
  if (id) delete body.playlist_id; // PATCH 시 playlist_id 변경 안 함

  try {
    if (id) {
      await sb(`playlist_items?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    } else {
      await sb('playlist_items', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
    }
    closeItemModal();
    await loadItems(currentPlaylistId);
    updateCardItemCount(currentPlaylistId, currentItems.length);
    renderItems();
  } catch(e) {
    console.error('자료 저장 실패:', e);
    alert('저장에 실패했습니다.');
  }
}

async function deleteItem(id) {
  try {
    await sb(`playlist_items?id=eq.${id}`, { method: 'DELETE' });
    await loadItems(currentPlaylistId);
    updateCardItemCount(currentPlaylistId, currentItems.length);
    renderItems();
  } catch(e) {
    console.error('자료 삭제 실패:', e);
    alert('삭제에 실패했습니다.');
  }
}

function closeItemModal() { document.getElementById('itemModalOverlay').classList.remove('open'); }

// ==========================================
//  카테고리 관리
// ==========================================
function openCatModal() {
  document.getElementById('catModalOverlay').classList.add('open');
  renderCatMgrList();
  populateCatParentSelect();
  resetCatForm();
}
function closeCatModal() { document.getElementById('catModalOverlay').classList.remove('open'); }

function renderCatMgrList() {
  const container = document.getElementById('catMgrList');
  if (allCategories.length === 0) {
    container.innerHTML = '<span style="font-size:.78rem;color:var(--text3)">카테고리가 없습니다.</span>';
    return;
  }
  // 부모 → 자식 순으로 정렬하여 표시
  const roots    = allCategories.filter(c => !c.parent_id);
  const children = allCategories.filter(c =>  c.parent_id);

  let html = '';
  roots.forEach(r => {
    html += buildCatMgrItem(r, false);
    children.filter(c => c.parent_id === r.id).forEach(c => {
      html += buildCatMgrItem(c, true);
    });
  });
  // 부모 없는 고아 child (데이터 이상 등)
  children.filter(c => !roots.find(r => r.id === c.parent_id)).forEach(c => {
    html += buildCatMgrItem(c, true);
  });

  container.innerHTML = html;
  container.querySelectorAll('.dh-cat-mgr-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('카테고리를 삭제하시겠습니까?')) return;
      await sb(`categories?id=eq.${btn.dataset.id}`, { method: 'DELETE' });
      await loadCategories();
      renderCatMgrList();
      renderCatFilterBar();
      populateCatParentSelect();
    });
  });
}

function buildCatMgrItem(cat, isChild) {
  const indent = isChild ? '<span class="dh-cat-mgr-indent">└</span>' : '';
  return `
    <div class="dh-cat-mgr-item">
      ${indent}
      <span class="dh-cat-mgr-name">${escHtml(cat.name)}</span>
      <button class="dh-cat-mgr-del" data-id="${cat.id}">✕</button>
    </div>`;
}

function populateCatParentSelect() {
  const sel = document.getElementById('catParent');
  sel.innerHTML = '<option value="">없음 (최상위)</option>'
    + allCategories.filter(c => !c.parent_id)
        .map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`)
        .join('');
}

function resetCatForm() {
  document.getElementById('catEditId').value = '';
  document.getElementById('catName').value   = '';
  document.getElementById('catParent').value = '';
  document.getElementById('catFormSave').textContent = '추가';
}

async function saveCat() {
  const name = document.getElementById('catName').value.trim();
  if (!name) { alert('카테고리 이름을 입력하세요.'); return; }

  const parentId = document.getElementById('catParent').value || null;
  try {
    await sb('categories', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ name, parent_id: parentId })
    });
    await loadCategories();
    renderCatMgrList();
    renderCatFilterBar();
    populateCatParentSelect();
    resetCatForm();
    // 플레이리스트 수정 모달이 열려 있으면 카테고리 목록도 갱신
    const plModalOpen = document.getElementById('plModalOverlay').classList.contains('open');
    if (plModalOpen) {
      const selectedCats = [...document.querySelectorAll('#plCatList .dh-cat-sel-chip.selected')]
        .map(el => el.dataset.catId);
      renderPlCatSelect(selectedCats);
    }
  } catch(e) {
    console.error('카테고리 추가 실패:', e);
    alert('카테고리 추가에 실패했습니다.');
  }
}

// ==========================================
//  이벤트 초기화
// ==========================================
function initEvents() {

  // 검색
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value;
      renderPlaylistGrid();
    }, 220);
  });

  // 정렬
  document.getElementById('sortSelect').addEventListener('change', e => {
    sortMode = e.target.value;
    renderPlaylistGrid();
  });

  // 새 플레이리스트 버튼들
  document.getElementById('btnNewPlaylist').addEventListener('click', () => openPlModal(null));
  document.getElementById('btnNewPlaylistEmpty').addEventListener('click', () => openPlModal(null));

  // 카테고리 관리 버튼
  document.getElementById('btnManageCategories').addEventListener('click', openCatModal);

  // 플레이리스트 모달
  document.getElementById('plModalClose').addEventListener('click', closePlModal);
  document.getElementById('plModalCancel').addEventListener('click', closePlModal);
  document.getElementById('plModalSave').addEventListener('click', savePl);
  document.getElementById('plModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('plModalOverlay')) closePlModal();
  });

  // 난이도 버튼
  document.querySelectorAll('.dh-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dh-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('plDiff').value = btn.dataset.diff;
    });
  });

  // 자료 아이템 모달
  document.getElementById('itemModalClose').addEventListener('click', closeItemModal);
  document.getElementById('itemModalCancel').addEventListener('click', closeItemModal);
  document.getElementById('itemModalSave').addEventListener('click', saveItem);
  document.getElementById('itemModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('itemModalOverlay')) closeItemModal();
  });

  // 유형 선택 버튼
  document.querySelectorAll('.dh-type-sel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dh-type-sel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('itemType').value = btn.dataset.type;
      toggleUrlRow(btn.dataset.type);
    });
  });

  // 자료 필터 칩 (상세 패널)
  document.querySelectorAll('.dh-type-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dh-type-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentItemFilter = btn.dataset.type;
      renderItems();
    });
  });

  // 카테고리 관리 모달
  document.getElementById('catModalClose').addEventListener('click', closeCatModal);
  document.getElementById('catModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('catModalOverlay')) closeCatModal();
  });
  document.getElementById('catFormReset').addEventListener('click', resetCatForm);
  document.getElementById('catFormSave').addEventListener('click', saveCat);

  // ESC 키
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.getElementById('plModalOverlay').classList.remove('open');
    document.getElementById('itemModalOverlay').classList.remove('open');
    document.getElementById('catModalOverlay').classList.remove('open');
    document.getElementById('viewerOverlay').classList.remove('open');
  });
}

// ==========================================
//  앱 초기화
// ==========================================
async function init() {
  initGNB();
  initDate();
  initEvents();

  try {
    await loadAll();
    renderCatFilterBar();
    renderPlaylistGrid();
  } catch(e) {
    console.error('초기 로딩 실패:', e);
    document.getElementById('playlistGrid').innerHTML = '';
    document.getElementById('emptyState').style.display = 'flex';
    document.querySelector('.dh-empty-title').textContent = '데이터를 불러오지 못했습니다';
    document.querySelector('.dh-empty-sub').textContent   = '네트워크 연결을 확인해 주세요.';
  }
}

document.addEventListener('DOMContentLoaded', init);
