// ==========================================
//  StudyHub — data.js
//  자료 보관함 v3
//  · 묶음 클릭 → 확장 패널 (전체화면)
//  · 파일 업로드 → Supabase Storage
//  · 링크/영상 → 인라인 iframe 임베드
//  · 노트 → 텍스트 뷰어
// ==========================================

const SUPABASE_URL = 'https://cyqjgixdvlywkzyamerx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_casPdXLoUENk-a-oSC7RiQ_vmg9QmiR';
const STORAGE_BUCKET = 'study-files';   // ← Supabase Storage 버킷 이름 (없으면 생성 필요)

/* ─── REST API 래퍼 ──────────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...opts.headers
    }
  });
  if (res.status === 204 || res.status === 205) return null;
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    const msg = typeof json === 'object'
      ? (json.message || json.hint || JSON.stringify(json)) : text;
    console.error(`[SB] ${res.status} ${path}`, msg);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return json;
}

/* ─── Storage 업로드 ─────────────────────── */
async function uploadFile(file) {
  const ext  = file.name.split('.').pop();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  file.type || 'application/octet-stream',
        'x-upsert':      'true',
      },
      body: file
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Storage 업로드 실패: ${t}`);
  }
  // 퍼블릭 URL 반환
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

/* ─── 유틸 ───────────────────────────────── */
const DAYS_KO = ['일','월','화','수','목','금','토'];
const _pad = n => String(n).padStart(2,'0');
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${_pad(d.getMonth()+1)}.${_pad(d.getDate())}`;
}
function relDate(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff === 0)  return '오늘';
  if (diff === 1)  return '어제';
  if (diff < 7)   return `${diff}일 전`;
  if (diff < 30)  return `${Math.floor(diff/7)}주 전`;
  if (diff < 365) return `${Math.floor(diff/30)}개월 전`;
  return `${Math.floor(diff/365)}년 전`;
}

const TYPES = {
  link:  { ico:'🔗', label:'링크'  },
  note:  { ico:'📝', label:'노트'  },
  file:  { ico:'📎', label:'파일'  },
  video: { ico:'🎬', label:'영상'  },
};
const typeInfo = t => TYPES[t] || TYPES.note;

// 파일 확장자 → 아이콘
function fileIco(name) {
  if (!name) return '📎';
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼️';
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return '🎬';
  if (['mp3','wav','ogg','flac'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📄';
  if (['zip','rar','7z','tar'].includes(ext)) return '🗜️';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📊';
  return '📎';
}

// URL이 임베드 가능한지 + embed URL 반환
function getEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0`;

    // YouTube Shorts
    const ytsMatch = url.match(/youtube\.com\/shorts\/([\w-]+)/);
    if (ytsMatch) return `https://www.youtube.com/embed/${ytsMatch[1]}`;

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

    // Google Docs / Sheets / Slides
    if (u.hostname === 'docs.google.com') {
      return url.replace(/\/edit.*$/, '/preview').replace(/\/pub.*$/, '/preview');
    }

    return null;  // 임베드 불가
  } catch { return null; }
}

// 커버 팔레트
const GRADS = [
  'linear-gradient(135deg,#4f46e5,#7c3aed)',
  'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#ec4899,#a855f7)',
  'linear-gradient(135deg,#14b8a6,#0284c7)',
  'linear-gradient(135deg,#f97316,#eab308)',
  'linear-gradient(135deg,#8b5cf6,#3b82f6)',
];
const ICONS_LIST = ['📚','📖','📗','📘','📙','🗂️','💡','🔬','🎓','✏️','🧮','🗺️'];
const pickGrad = id => GRADS[((id||'').charCodeAt(0)||0) % GRADS.length];
const pickIcon = id => ICONS_LIST[((id||'').charCodeAt(1)||0) % ICONS_LIST.length];

/* ─── 전역 상태 ──────────────────────────── */
let allLists      = [];
let allCats       = [];
let listCatMap    = {};
let currentListId = null;
let currentItems  = [];
let typeFilter    = 'all';
let catFilter     = 'all';
let sortMode      = 'updated';
let searchQ       = '';
let pendingFile   = null;   // 업로드 대기 파일

/* ─── GNB ────────────────────────────────── */
function initGNB() {
  const gnb  = document.getElementById('gnb');
  const ham  = document.getElementById('hamburger');
  const menu = document.getElementById('gnbMenu');
  window.addEventListener('scroll', () =>
    gnb.classList.toggle('scrolled', window.scrollY > 10), { passive:true });
  ham.addEventListener('click', () => {
    ham.classList.toggle('open'); menu.classList.toggle('open');
  });
  menu.querySelectorAll('.gnb-link').forEach(l => l.addEventListener('click', () => {
    ham.classList.remove('open'); menu.classList.remove('open');
  }));
}

function initDate() {
  const now = new Date();
  const el  = document.getElementById('dhDate');
  if (el) el.textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_KO[now.getDay()]}요일`;
}

/* ─── 데이터 로딩 ────────────────────────── */
async function loadAll() {
  const [lists, cats, plCats] = await Promise.all([
    sbFetch('playlists?select=*&order=updated_at.desc'),
    sbFetch('categories?select=*&order=name.asc'),
    sbFetch('playlist_categories?select=playlist_id,category_id'),
  ]);
  allLists   = lists  || [];
  allCats    = cats   || [];
  listCatMap = {};
  (plCats||[]).forEach(r => {
    if (!listCatMap[r.playlist_id]) listCatMap[r.playlist_id] = [];
    listCatMap[r.playlist_id].push(r.category_id);
  });
}

async function loadItems(listId) {
  const data = await sbFetch(
    `playlist_items?playlist_id=eq.${listId}&order=position.asc,created_at.asc`
  );
  currentItems = data || [];
}

/* ─── 카테고리 칩 ────────────────────────── */
function renderCatChips() {
  const bar = document.getElementById('catChips');
  bar.innerHTML =
    `<button class="dh-chip ${catFilter==='all'?'active':''}" data-id="all">전체</button>`
    + allCats.map(c =>
        `<button class="dh-chip ${catFilter===c.id?'active':''}" data-id="${c.id}">${esc(c.name)}</button>`
      ).join('');
  bar.querySelectorAll('.dh-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      catFilter = btn.dataset.id;
      bar.querySelectorAll('.dh-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrid();
    });
  });
}

/* ─── 묶음 그리드 ────────────────────────── */
function getFiltered() {
  let list = [...allLists];
  if (catFilter !== 'all')
    list = list.filter(pl => (listCatMap[pl.id]||[]).includes(catFilter));
  if (searchQ.trim()) {
    const q = searchQ.trim().toLowerCase();
    list = list.filter(pl =>
      (pl.title||'').toLowerCase().includes(q) ||
      (pl.description||'').toLowerCase().includes(q));
  }
  if (sortMode==='updated') list.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  if (sortMode==='created') list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if (sortMode==='name')    list.sort((a,b)=>(a.title||'').localeCompare(b.title||'','ko'));
  return list;
}

function renderGrid() {
  const grid  = document.getElementById('listGrid');
  const empty = document.getElementById('emptyMsg');
  const filt  = getFiltered();

  if (filt.length === 0) {
    grid.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }
  grid.style.display  = '';
  empty.style.display = 'none';
  grid.innerHTML = filt.map(pl => buildCard(pl)).join('');
  grid.querySelectorAll('.dh-card').forEach(card => {
    card.addEventListener('click', () => openExpand(card.dataset.id));
  });
}

function buildCard(pl) {
  const catHtml = (listCatMap[pl.id]||[])
    .map(cid => allCats.find(c=>c.id===cid))
    .filter(Boolean).slice(0,3)
    .map(c => `<span class="dh-tag">${esc(c.name)}</span>`).join('');
  const diffHtml = pl.difficulty
    ? `<span class="dh-diff-badge dh-diff-${esc(pl.difficulty)}">${esc(pl.difficulty)}</span>` : '';
  return `
    <div class="dh-card" data-id="${pl.id}">
      <div class="dh-card-cover" style="background:${pickGrad(pl.id)}">
        <span>${pickIcon(pl.id)}</span>
      </div>
      <div class="dh-card-body">
        ${catHtml ? `<div class="dh-card-tags">${catHtml}</div>` : ''}
        <div class="dh-card-name">${esc(pl.title)}</div>
        ${pl.description ? `<div class="dh-card-desc">${esc(pl.description)}</div>` : ''}
        <div class="dh-card-foot">
          <span class="dh-card-cnt" id="cnt-${pl.id}">📄 —</span>
          ${diffHtml}
        </div>
      </div>
    </div>`;
}

function updateCardCnt(id, n) {
  const el = document.getElementById(`cnt-${id}`);
  if (el) el.textContent = `📄 ${n}개`;
}

/* ─── 확장 패널 (오버레이) ───────────────── */
async function openExpand(id) {
  currentListId = id;
  typeFilter    = 'all';
  const pl = allLists.find(p => p.id === id);
  if (!pl) return;

  // 카드 active
  document.querySelectorAll('.dh-card').forEach(c =>
    c.classList.toggle('active', c.dataset.id === id));

  // 헤더 채우기
  const cover = document.getElementById('expCover');
  cover.style.background = pickGrad(pl.id);
  cover.textContent = pickIcon(pl.id);

  const cats = (listCatMap[pl.id]||[])
    .map(cid => allCats.find(c=>c.id===cid)).filter(Boolean);
  document.getElementById('expTags').innerHTML =
    cats.map(c=>`<span class="dh-tag">${esc(c.name)}</span>`).join('');

  document.getElementById('expName').textContent = pl.title || '';
  document.getElementById('expDesc').textContent = pl.description || '';

  const diffHtml = pl.difficulty
    ? `<span class="dh-diff-badge dh-diff-${esc(pl.difficulty)}">${esc(pl.difficulty)}</span>` : '';
  document.getElementById('expMeta').innerHTML =
    `${diffHtml}<span>수정 ${relDate(pl.updated_at)}</span><span>생성 ${fmtDate(pl.created_at)}</span>`;

  // 버튼 바인딩
  document.getElementById('expBtnAdd').onclick  = () => openItemModal(null);
  document.getElementById('expBtnEdit').onclick = () => openListModal(pl);
  document.getElementById('expBtnDel').onclick  = () => deleteList(id);

  // 유형 필터 초기화
  document.querySelectorAll('#typeChips .dh-chip').forEach(b =>
    b.classList.toggle('active', b.dataset.type === 'all'));

  // 뷰어 초기화
  resetViewer();

  // 패널 표시
  const panel = document.getElementById('expandPanel');
  panel.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // 자료 로드
  document.getElementById('itemsList').innerHTML =
    '<div class="dh-items-empty"><span>⏳</span><p>불러오는 중...</p></div>';
  document.getElementById('itemsCnt').textContent = '';

  await loadItems(id);
  updateCardCnt(id, currentItems.length);
  renderItems();
}

function closeExpand() {
  document.getElementById('expandPanel').style.display = 'none';
  document.body.style.overflow = '';
  document.querySelectorAll('.dh-card').forEach(c => c.classList.remove('active'));
  currentListId = null;
  resetViewer();
}

/* ─── 자료 목록 렌더 ─────────────────────── */
function renderItems() {
  const list = document.getElementById('itemsList');
  const filt = typeFilter === 'all'
    ? currentItems
    : currentItems.filter(i => i.type === typeFilter);

  document.getElementById('itemsCnt').textContent = `${filt.length}개`;

  if (filt.length === 0) {
    list.innerHTML = `
      <div class="dh-items-empty">
        <span>📭</span>
        <p>자료가 없습니다</p>
        <small>+ 자료 추가로 등록해 보세요.</small>
      </div>`;
    return;
  }

  list.innerHTML = filt.map(item => buildItemRow(item)).join('');

  list.querySelectorAll('.dh-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.dh-ib')) return;
      const item = currentItems.find(i => i.id === el.dataset.id);
      if (item) openViewer(item, el);
    });
  });
  list.querySelectorAll('.dh-item-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = currentItems.find(i => i.id === btn.dataset.id);
      if (item) openItemModal(item);
    });
  });
  list.querySelectorAll('.dh-item-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('이 자료를 삭제하시겠습니까?')) return;
      await deleteItem(btn.dataset.id);
    });
  });
}

function buildItemRow(item) {
  const ti = typeInfo(item.type);
  let sub = '';
  if (item.type === 'file' && item.file_path) {
    const fname = item.file_path.split('/').pop().replace(/^\d+_[a-z0-9]+\./, '');
    sub = fname;
  } else if (item.url) {
    sub = item.url.replace(/^https?:\/\//,'').slice(0,55);
  } else if (item.content) {
    sub = item.content.replace(/\n/g,' ').slice(0,55);
  }
  const subCls = item.url && item.type !== 'file' ? 'url' : '';

  return `
    <div class="dh-item" data-id="${item.id}">
      <div class="dh-item-ico ${item.type||'note'}">${ti.ico}</div>
      <div class="dh-item-body">
        <div class="dh-item-title">${esc(item.title)}</div>
        ${sub ? `<div class="dh-item-sub ${subCls}">${esc(sub)}${sub.length>=55?'…':''}</div>` : ''}
      </div>
      <div class="dh-item-btns">
        <button class="dh-ib dh-item-edit" data-id="${item.id}" title="수정">✏️</button>
        <button class="dh-ib del dh-item-del" data-id="${item.id}" title="삭제">🗑️</button>
      </div>
    </div>`;
}

/* ─── 뷰어 ───────────────────────────────── */
function resetViewer() {
  document.getElementById('viewerPlaceholder').style.display = '';
  document.getElementById('viewerContent').style.display = 'none';
  document.getElementById('viewerBody').innerHTML = '';
}

function openViewer(item, listEl) {
  // 선택 표시
  document.querySelectorAll('.dh-item').forEach(e => e.classList.remove('viewing'));
  if (listEl) listEl.classList.add('viewing');

  const ti = typeInfo(item.type);
  document.getElementById('viewerPlaceholder').style.display = 'none';
  const content = document.getElementById('viewerContent');
  content.style.display = 'flex';

  // 헤더
  const hd = document.getElementById('viewerHd');
  let hdHtml = `<span class="dh-viewer-badge">${ti.label}</span>
                <span class="dh-viewer-name">${esc(item.title)}</span>`;

  // 외부 링크 버튼
  const linkTarget = item.url || item.file_path;
  if (linkTarget) {
    hdHtml += `<a class="dh-viewer-open-btn" href="${esc(linkTarget)}" target="_blank" rel="noopener">↗ 열기</a>`;
  }
  hd.innerHTML = hdHtml;

  // 바디
  const body = document.getElementById('viewerBody');
  body.innerHTML = '';

  if (item.type === 'note' || (!item.url && !item.file_path)) {
    // 노트
    const div = document.createElement('div');
    div.className = 'dh-viewer-text';
    div.textContent = item.content || '(내용 없음)';
    body.appendChild(div);
    return;
  }

  if (item.type === 'file' && item.file_path) {
    // 파일 — 이미지/영상은 인라인, 나머지는 다운로드 버튼
    const fname = item.file_path.split('/').pop();
    const ext   = fname.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) {
      // 이미지 직접 표시
      body.innerHTML = `
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto">
          <img src="${esc(item.file_path)}" alt="${esc(item.title)}"
               style="max-width:100%;max-height:100%;border-radius:8px;object-fit:contain" />
        </div>`;
    } else if (['mp4','webm','mov'].includes(ext)) {
      // 영상 직접 재생
      body.innerHTML = `
        <div style="flex:1;display:flex;align-items:center;justify-content:center;background:#000;padding:0">
          <video controls style="max-width:100%;max-height:100%" src="${esc(item.file_path)}">
            브라우저가 동영상을 지원하지 않습니다.
          </video>
        </div>`;
    } else if (['mp3','wav','ogg','flac'].includes(ext)) {
      body.innerHTML = `
        <div class="dh-viewer-file">
          <div class="dh-viewer-file-ico">🎵</div>
          <div class="dh-viewer-file-name">${esc(item.title)}</div>
          <audio controls style="width:100%;max-width:360px" src="${esc(item.file_path)}">
            브라우저가 오디오를 지원하지 않습니다.
          </audio>
        </div>`;
    } else if (ext === 'pdf') {
      // PDF → iframe
      body.innerHTML = `<iframe class="dh-viewer-iframe" src="${esc(item.file_path)}" title="${esc(item.title)}"></iframe>`;
    } else {
      // 기타 파일 → 다운로드
      body.innerHTML = `
        <div class="dh-viewer-file">
          <div class="dh-viewer-file-ico">${fileIco(fname)}</div>
          <div class="dh-viewer-file-name">${esc(item.title)}</div>
          <a class="dh-viewer-file-btn" href="${esc(item.file_path)}" download target="_blank" rel="noopener">
            ⬇ 다운로드
          </a>
        </div>`;
    }
    // 메모가 있으면 아래 표시
    if (item.content) {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'dh-viewer-text';
      noteDiv.style.borderTop = '1px solid var(--border)';
      noteDiv.textContent = item.content;
      body.appendChild(noteDiv);
    }
    return;
  }

  // 링크 / 영상 URL
  if (item.url) {
    const embedUrl = getEmbedUrl(item.url);
    if (embedUrl) {
      // 임베드 가능
      body.innerHTML = `<iframe class="dh-viewer-iframe" src="${esc(embedUrl)}"
        allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
        allowfullscreen title="${esc(item.title)}"></iframe>`;
    } else {
      // 임베드 불가 → 링크 + 설명
      body.innerHTML = `
        <div class="dh-viewer-text">
          <div style="margin-bottom:14px;padding:12px 16px;background:var(--bg3);
                      border-radius:8px;border:1px solid var(--border)">
            <a href="${esc(item.url)}" target="_blank" rel="noopener"
               style="color:var(--accent);font-size:.88rem;word-break:break-all">
              🔗 ${esc(item.url)}
            </a>
          </div>
          ${item.content ? `<div style="white-space:pre-wrap">${esc(item.content)}</div>` : ''}
        </div>`;
    }
    return;
  }

  // fallback
  const div = document.createElement('div');
  div.className = 'dh-viewer-text';
  div.textContent = item.content || '(내용 없음)';
  body.appendChild(div);
}

/* ─── 묶음 CRUD ──────────────────────────── */
function openListModal(pl = null) {
  document.getElementById('listModalTitle').textContent = pl ? '자료 묶음 수정' : '새 자료 묶음';
  document.getElementById('listId').value    = pl?.id    || '';
  document.getElementById('listTitle').value = pl?.title || '';
  document.getElementById('listDesc').value  = pl?.description || '';
  document.getElementById('listDiff').value  = pl?.difficulty  || '';

  document.querySelectorAll('#listModal .dh-tog').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.v === (pl?.difficulty||'')));

  renderListCatSel(pl ? (listCatMap[pl.id]||[]) : []);
  openModal('listModal');
}

function renderListCatSel(selected=[]) {
  const el = document.getElementById('listCatSel');
  if (allCats.length === 0) {
    el.innerHTML = '<span class="dh-hint">카테고리가 없습니다. 먼저 추가하세요.</span>';
    return;
  }
  el.innerHTML = allCats.map(c =>
    `<button class="dh-cat-chip ${selected.includes(c.id)?'selected':''}" data-id="${c.id}">${esc(c.name)}</button>`
  ).join('');
  el.querySelectorAll('.dh-cat-chip').forEach(b => b.addEventListener('click', () => b.classList.toggle('selected')));
}

async function saveList() {
  const id    = document.getElementById('listId').value.trim();
  const title = document.getElementById('listTitle').value.trim();
  if (!title) { alert('제목을 입력하세요.'); return; }

  const body = {
    title,
    description: document.getElementById('listDesc').value.trim() || null,
    difficulty:  document.getElementById('listDiff').value || null,
  };

  try {
    let plId = id;
    if (id) {
      await sbFetch(`playlists?id=eq.${id}`, { method:'PATCH', body:JSON.stringify(body) });
    } else {
      const res = await sbFetch('playlists', { method:'POST', body:JSON.stringify(body) });
      const created = Array.isArray(res) ? res[0] : res;
      plId = created?.id;
      if (!plId) throw new Error('생성된 ID 없음');
    }

    // 카테고리 연결
    await sbFetch(`playlist_categories?playlist_id=eq.${plId}`, { method:'DELETE' });
    const selIds = [...document.querySelectorAll('#listCatSel .dh-cat-chip.selected')].map(b=>b.dataset.id);
    if (selIds.length > 0) {
      await sbFetch('playlist_categories', {
        method:'POST', body:JSON.stringify(selIds.map(cid=>({playlist_id:plId, category_id:cid})))
      });
    }

    closeModal('listModal');
    await loadAll();
    renderCatChips();
    renderGrid();
    if (plId) await openExpand(plId);

  } catch(e) {
    console.error('묶음 저장 실패:', e);
    alert(`저장 실패: ${e.message}\n\nSupabase RLS policy에서 anon 접근을 허용했는지 확인하세요.`);
  }
}

async function deleteList(id) {
  if (!confirm('이 묶음과 모든 자료를 삭제하시겠습니까?')) return;
  try {
    await sbFetch(`playlists?id=eq.${id}`, { method:'DELETE' });
    closeExpand();
    await loadAll();
    renderCatChips();
    renderGrid();
  } catch(e) { alert(`삭제 실패: ${e.message}`); }
}

/* ─── 자료 CRUD ──────────────────────────── */
function openItemModal(item=null) {
  document.getElementById('itemModalTitle').textContent = item ? '자료 수정' : '자료 추가';
  document.getElementById('itemId').value      = item?.id      || '';
  document.getElementById('itemTitle').value   = item?.title   || '';
  document.getElementById('itemUrl').value     = item?.url     || '';
  document.getElementById('itemContent').value = item?.content || '';

  const type = item?.type || 'link';
  document.getElementById('itemType').value = type;
  document.querySelectorAll('#typeBtnRow .dh-tog').forEach(b =>
    b.classList.toggle('active', b.dataset.v === type));

  // 파일 미리보기 초기화
  pendingFile = null;
  resetFileUI();
  // 기존 파일 표시
  if (item?.type === 'file' && item?.file_path) {
    const fname = item.file_path.split('/').pop().replace(/^\d+_[a-z0-9]+\./, '');
    showFilePreview(fname, fileIco(fname));
  }

  toggleItemFields(type);
  openModal('itemModal');
}

function resetFileUI() {
  document.getElementById('filePreview').style.display  = 'none';
  document.getElementById('uploadBar').style.display    = 'none';
  document.getElementById('uploadStatus').textContent   = '';
  document.getElementById('dropzoneInner').style.display = '';
  document.getElementById('fileInput').value = '';
  pendingFile = null;
}

function showFilePreview(name, ico='📎') {
  document.getElementById('dropzoneInner').style.display = 'none';
  document.getElementById('filePreview').style.display   = 'flex';
  document.getElementById('filePreviewIco').textContent  = ico;
  document.getElementById('filePreviewName').textContent = name;
}

function toggleItemFields(type) {
  document.getElementById('fldUrl').style.display  = (type==='link'||type==='video') ? '' : 'none';
  document.getElementById('fldFile').style.display = (type==='file')                 ? '' : 'none';
  const hint = document.getElementById('urlHint');
  if (type === 'video') hint.textContent = 'YouTube, Vimeo, Google Docs 등은 자동 임베드됩니다';
  else if (type === 'link') hint.textContent = '';
}

async function saveItem() {
  const id    = document.getElementById('itemId').value.trim();
  const title = document.getElementById('itemTitle').value.trim();
  const type  = document.getElementById('itemType').value;
  if (!title)         { alert('제목을 입력하세요.'); return; }
  if (!currentListId) { alert('묶음이 선택되지 않았습니다.'); return; }

  const body = { title, type };
  body.url     = document.getElementById('itemUrl').value.trim() || null;
  body.content = document.getElementById('itemContent').value.trim() || null;

  // 파일 업로드 처리
  if (type === 'file') {
    if (pendingFile) {
      // 새 파일 업로드
      document.getElementById('uploadBar').style.display   = '';
      document.getElementById('uploadStatus').textContent  = '업로드 중...';
      document.getElementById('itemModalSave').disabled   = true;
      try {
        // 진행 표시 (Storage API는 XHR 없이 진행률 없음 → 가짜 애니메이션)
        animateProgress();
        const fileUrl = await uploadFile(pendingFile);
        body.file_path = fileUrl;
        body.url = fileUrl;  // file_path와 url 둘 다 저장
        document.getElementById('uploadFill').style.width  = '100%';
        document.getElementById('uploadStatus').textContent = '✓ 업로드 완료';
      } catch(e) {
        document.getElementById('uploadStatus').textContent = `업로드 실패: ${e.message}`;
        document.getElementById('itemModalSave').disabled  = false;
        return;
      }
      document.getElementById('itemModalSave').disabled = false;
    } else if (!id) {
      alert('파일을 선택하세요.');
      return;
    }
    // 수정 시 파일 미선택 → 기존 file_path 유지 (body에 없으므로 PATCH에서 변경 안됨)
  }

  try {
    if (id) {
      await sbFetch(`playlist_items?id=eq.${id}`, { method:'PATCH', body:JSON.stringify(body) });
    } else {
      body.playlist_id = currentListId;
      body.position    = currentItems.length;
      await sbFetch('playlist_items', { method:'POST', body:JSON.stringify(body) });
    }
    closeModal('itemModal');
    await loadItems(currentListId);
    updateCardCnt(currentListId, currentItems.length);
    renderItems();
  } catch(e) {
    console.error('자료 저장 실패:', e);
    alert(`저장 실패: ${e.message}`);
  }
}

function animateProgress() {
  const fill = document.getElementById('uploadFill');
  let w = 0;
  const iv = setInterval(() => {
    w = Math.min(w + Math.random()*8, 85);
    fill.style.width = w + '%';
    if (w >= 85) clearInterval(iv);
  }, 200);
}

async function deleteItem(id) {
  try {
    await sbFetch(`playlist_items?id=eq.${id}`, { method:'DELETE' });
    await loadItems(currentListId);
    updateCardCnt(currentListId, currentItems.length);
    renderItems();
    resetViewer();
  } catch(e) { alert(`삭제 실패: ${e.message}`); }
}

/* ─── 카테고리 CRUD ──────────────────────── */
function openCatModal() {
  renderCatMgrList();
  populateCatParent();
  document.getElementById('catName').value   = '';
  document.getElementById('catParent').value = '';
  openModal('catModal');
}

function renderCatMgrList() {
  const el = document.getElementById('catMgrList');
  if (allCats.length === 0) { el.innerHTML = '<span class="dh-hint">없음</span>'; return; }
  const roots  = allCats.filter(c=>!c.parent_id);
  const childs = allCats.filter(c=> c.parent_id);
  let html = '';
  roots.forEach(r => {
    html += `<div class="dh-cat-row"><span class="dh-cat-row-name">${esc(r.name)}</span><button class="dh-cat-row-del" data-id="${r.id}">✕</button></div>`;
    childs.filter(c=>c.parent_id===r.id).forEach(c => {
      html += `<div class="dh-cat-row"><span class="dh-cat-row-name" style="padding-left:14px">└ ${esc(c.name)}</span><button class="dh-cat-row-del" data-id="${c.id}">✕</button></div>`;
    });
  });
  el.innerHTML = html;
  el.querySelectorAll('.dh-cat-row-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('카테고리를 삭제하시겠습니까?')) return;
      try {
        await sbFetch(`categories?id=eq.${btn.dataset.id}`, { method:'DELETE' });
        await loadAll(); renderCatMgrList(); populateCatParent(); renderCatChips(); renderGrid();
      } catch(e) { alert(`삭제 실패: ${e.message}`); }
    });
  });
}

function populateCatParent() {
  const sel = document.getElementById('catParent');
  sel.innerHTML = '<option value="">없음 (최상위)</option>'
    + allCats.filter(c=>!c.parent_id).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

async function addCat() {
  const name = document.getElementById('catName').value.trim();
  if (!name) { alert('이름을 입력하세요.'); return; }
  const parentId = document.getElementById('catParent').value || null;
  try {
    await sbFetch('categories', { method:'POST', body:JSON.stringify({name, parent_id:parentId}) });
    await loadAll(); renderCatMgrList(); populateCatParent(); renderCatChips(); renderGrid();
    document.getElementById('catName').value   = '';
    document.getElementById('catParent').value = '';
    // 묶음 모달 열려있으면 갱신
    if (document.getElementById('listModal').classList.contains('open')) {
      const sel = [...document.querySelectorAll('#listCatSel .dh-cat-chip.selected')].map(b=>b.dataset.id);
      renderListCatSel(sel);
    }
  } catch(e) { alert(`추가 실패: ${e.message}`); }
}

/* ─── 모달 헬퍼 ──────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ─── 이벤트 초기화 ─────────────────────── */
function initEvents() {

  /* 헤더 */
  document.getElementById('btnNewList').addEventListener('click',      () => openListModal(null));
  document.getElementById('btnNewListEmpty').addEventListener('click', () => openListModal(null));
  document.getElementById('btnManageCat').addEventListener('click',   openCatModal);

  /* 검색 */
  let st;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(st);
    st = setTimeout(()=>{ searchQ=e.target.value; renderGrid(); }, 220);
  });

  /* 정렬 */
  document.getElementById('sortSelect').addEventListener('change', e => {
    sortMode = e.target.value; renderGrid();
  });

  /* 확장 패널 닫기 */
  document.getElementById('expandClose').addEventListener('click', closeExpand);
  document.getElementById('expandBg').addEventListener('click',    closeExpand);

  /* 유형 필터 (확장 패널) */
  document.getElementById('typeChips').querySelectorAll('.dh-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#typeChips .dh-chip').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      typeFilter = btn.dataset.type;
      renderItems();
    });
  });

  /* 묶음 모달 */
  document.getElementById('listModalClose').addEventListener('click',  ()=>closeModal('listModal'));
  document.getElementById('listModalCancel').addEventListener('click', ()=>closeModal('listModal'));
  document.getElementById('listModalSave').addEventListener('click',   saveList);
  document.getElementById('listModal').addEventListener('click', e=>{
    if (e.target===document.getElementById('listModal')) closeModal('listModal');
  });
  /* 난이도 */
  document.querySelectorAll('#listModal .dh-tog').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#listModal .dh-tog').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('listDiff').value = btn.dataset.v;
    });
  });

  /* 자료 모달 */
  document.getElementById('itemModalClose').addEventListener('click',  ()=>{ resetFileUI(); closeModal('itemModal'); });
  document.getElementById('itemModalCancel').addEventListener('click', ()=>{ resetFileUI(); closeModal('itemModal'); });
  document.getElementById('itemModalSave').addEventListener('click',   saveItem);
  document.getElementById('itemModal').addEventListener('click', e=>{
    if (e.target===document.getElementById('itemModal')){ resetFileUI(); closeModal('itemModal'); }
  });
  /* 유형 버튼 */
  document.querySelectorAll('#typeBtnRow .dh-tog').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#typeBtnRow .dh-tog').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('itemType').value = btn.dataset.v;
      toggleItemFields(btn.dataset.v);
    });
  });

  /* 파일 드래그앤드롭 */
  const dz = document.getElementById('dropzone');
  const fi = document.getElementById('fileInput');

  dz.addEventListener('dragover',  e=>{ e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', ()=>dz.classList.remove('drag'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  });
  fi.addEventListener('change', e=>{
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });
  document.getElementById('fileRemove').addEventListener('click', ()=>{
    resetFileUI();
  });

  /* 카테고리 모달 */
  document.getElementById('catModalClose').addEventListener('click', ()=>closeModal('catModal'));
  document.getElementById('catModal').addEventListener('click', e=>{
    if (e.target===document.getElementById('catModal')) closeModal('catModal');
  });
  document.getElementById('catAddBtn').addEventListener('click', addCat);
  document.getElementById('catName').addEventListener('keydown', e=>{ if(e.key==='Enter') addCat(); });

  /* ESC */
  document.addEventListener('keydown', e=>{
    if (e.key!=='Escape') return;
    ['listModal','itemModal','catModal'].forEach(id=>closeModal(id));
    // 확장 패널은 ESC 로 닫지 않음 (실수 방지)
  });
}

function handleFileSelect(file) {
  if (file.size > 50 * 1024 * 1024) {
    alert('파일 크기가 50MB를 초과합니다.');
    return;
  }
  pendingFile = file;
  // 제목 자동 채우기 (비어있을 때)
  const titleEl = document.getElementById('itemTitle');
  if (!titleEl.value.trim()) {
    titleEl.value = file.name.replace(/\.[^.]+$/, '');
  }
  showFilePreview(file.name, fileIco(file.name));
}

/* ─── 앱 초기화 ─────────────────────────── */
async function init() {
  initGNB();
  initDate();
  initEvents();

  try {
    await loadAll();
    renderCatChips();
    renderGrid();
  } catch(e) {
    console.error('초기 로딩 실패:', e);
    document.getElementById('listGrid').style.display = 'none';
    const em = document.getElementById('emptyMsg');
    em.style.display = 'flex';
    em.querySelector('.dh-empty-t').textContent = '데이터를 불러오지 못했습니다';
    em.querySelector('.dh-empty-s').textContent = e.message || '네트워크를 확인하세요.';
  }
}

document.addEventListener('DOMContentLoaded', init);
