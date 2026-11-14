'use strict';
/* Thư viện Yumi – giao diện. Máy chủ: apps-script/Library.gs (xem library/HUONG-DAN.md) */

// ⚙️ Dán URL Web app của Library.gs vào đây (Deploy → Web app → URL kết thúc bằng /exec)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxba-wFIFezd3XonNNlRFoKeHsF6fIUKSNXzSzMCW_hni1IAacL4hMvnJiQhH_n1hi4/exec';

const MAX_BYTES = 20 * 1024 * 1024; // 20MB / file
const PER_COL = 8;                  // số bài hiện sẵn trong mỗi pack, còn lại bấm "Xem thêm"
// Bảng màu dùng chung cho pack và bài đăng: [mã màu, tên]
const PALETTE = [
  ['#ffd6cc', 'Đào'], ['#ffab91', 'Cam đào'], ['#ff8a80', 'Đỏ san hô'], ['#ffcc80', 'Cam'],
  ['#ffe9a8', 'Vàng kem'], ['#fff176', 'Vàng chanh'], ['#d7f5c4', 'Xanh non'], ['#a5d6a7', 'Xanh lá'],
  ['#c8f0e2', 'Mint'], ['#80deea', 'Xanh ngọc'], ['#b3e5fc', 'Xanh trời'], ['#90caf9', 'Xanh dương'],
  ['#d9e4ff', 'Lam nhạt'], ['#b39ddb', 'Tím oải hương'], ['#f3d6ff', 'Tím nhạt'], ['#ce93d8', 'Tím'],
  ['#ffd1e1', 'Hồng phấn'], ['#f48fb1', 'Hồng đậm'], ['#e8e0d4', 'Be'], ['#cfd8dc', 'Xám xanh'],
];
const COLORS = PALETTE.map(c => c[0]);
const EMOJIS = ['📦', '📚', '🎧', '🗣️', '✏️', '📝', '🧠', '🌟', '🎯', '🧩', '📖', '🏆', '🍑', '🌱', '🎒', '🗂️'];
const TYPES = [['', 'Tất cả'], ['doc', '📄 Tài liệu'], ['image', '🖼️ Ảnh'], ['media', '🎧 Audio/Video'], ['link', '🔗 Link'], ['note', '📝 Ghi chú']];
const PEOPLE = [['', 'Mọi người'], ['Cô', '👩‍🏫 Cô'], ['Linh', '🧑‍💻 Linh']];

/* ───── lưu trên trình duyệt (mã truy cập, người dùng, bản sao dữ liệu) ───── */
const store = {
  get(k, d) { try { const v = localStorage.getItem('yumiLib.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('yumiLib.' + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem('yumiLib.' + k); } catch (_) {} },
};

const S = {
  who: store.get('who', '') === 'Trợ lý' ? 'Linh' : store.get('who', ''),
  packs: [], items: [], comments: [], classes: {}, drafts: {}, q: '', type: '', by: '',
  full: store.get('full', false), // true = mở hết các bài
  open: new Set(), shut: new Set(), more: new Set(),
  lastSync: 0,
};

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const splitTags = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const baseName = n => String(n || '').replace(/\.[^.]+$/, '');

/* ───────────────────────── Máy chủ ───────────────────────── */
let busyN = 0;
function busy(d) { busyN = Math.max(0, busyN + d); $('#busy').hidden = busyN === 0; }

async function api(action, body, mut) {
  if (!SCRIPT_URL || SCRIPT_URL.includes('PASTE_')) {
    throw new Error('Trang chưa được nối với máy chủ: hãy dán URL Apps Script vào SCRIPT_URL trong library/app.js');
  }
  busy(1);
  try {
    let r;
    try {
      r = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, body, { action: action, who: S.who })),
      });
    } catch (_) { throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'); }
    let j;
    try { j = await r.json(); } catch (_) { throw new Error('Máy chủ trả lời lạ (đã Deploy với quyền "Anyone" chưa?)'); }
    if (!j.ok) {
      const old = j.auth === false; // máy chủ bản cũ vẫn đòi mã truy cập
      throw new Error(old ? 'Máy chủ đang chạy bản cũ (còn đòi mã). Cô dán Library.gs mới vào Apps Script rồi Deploy → New version.' : (j.error || 'Lỗi máy chủ'));
    }
    // Đang có thay đổi khác chờ lưu → bỏ qua dữ liệu trả về (đã cũ), chờ lần lưu cuối cùng
    if (j.data && pendingN <= (mut ? 1 : 0)) setData(j.data);
    return j;
  } finally { busy(-1); }
}

/* ───── Lưu nền: đổi trên màn hình NGAY (local), rồi mới gửi máy chủ ─────
   Lỗi → báo đỏ và tải lại dữ liệu thật từ máy chủ. */
let pendingN = 0;
async function mutate(action, body, local, okMsg) {
  if (local) { local(); render(); }
  if (okMsg) toast(okMsg);
  pendingN++;
  try {
    return await api(action, body, true);
  } catch (er) {
    toast('Chưa lưu được: ' + er.message + ' — đã tải lại dữ liệu.', true);
    if (pendingN === 1) setTimeout(refresh, 0);
    throw er;
  } finally {
    pendingN--;
  }
}
const isTmp = id => String(id || '').startsWith('tmp');
const tmpId = () => 'tmp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const normTags = v => { const seen = {}; return String(v || '').split(/[,#\n]/).map(x => x.trim().replace(/\s+/g, ' ')).filter(x => { const k = x.toLowerCase(); if (!x || seen[k]) return false; seen[k] = 1; return true; }).join(', '); };

function setData(d) {
  S.packs = d.packs || [];
  S.items = d.items || [];
  S.comments = d.comments || [];
  S.classes = d.classes || {};
  S.ver = d.ver || 1;
  S.lastSync = Date.now();
  store.set('cache', d);
  render();
}

function refresh() {
  if (pendingN > 0) return Promise.resolve(); // đang lưu → đợi lưu xong, dữ liệu mới sẽ tự về
  return api('list').catch(er => toast(er.message, true));
}

/* ───────────────────────── Chọn người dùng (không cần mã) ───────────────────────── */
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $$('#whoPick [data-who]').forEach(b => b.classList.toggle('on', b.dataset.who === S.who));
}
function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#whoLabel').textContent = (S.who === 'Cô' ? '👩‍🏫 ' : '🧑‍💻 ') + S.who;
  render();
}

$('#whoPick').addEventListener('click', e => {
  const b = e.target.closest('[data-who]');
  if (!b) return;
  S.who = b.dataset.who;
  store.set('who', S.who);
  showApp();
  refresh();
});
$('#loginForm').addEventListener('submit', e => e.preventDefault());
$('#logoutBtn').addEventListener('click', showLogin);
$('#refreshBtn').addEventListener('click', () => refresh().then(() => toast('Đã tải lại ✨')));

/* ───────────────────────── Hiển thị ───────────────────────── */
function kindOf(it) {
  if (it.type === 'schedule') return { icon: '📅', label: 'Lịch tuần (tự động)', cat: 'note' };
  if (it.type === 'note') return { icon: '📝', label: 'Ghi chú', cat: 'note' };
  if (it.type === 'link') {
    const u = it.url || '';
    if (/youtu\.?be/i.test(u)) return { icon: '▶️', label: 'YouTube', cat: 'link' };
    if (/docs\.google\.com\/document/i.test(u)) return { icon: '📘', label: 'Google Docs', cat: 'link' };
    if (/docs\.google\.com\/spreadsheets/i.test(u)) return { icon: '📗', label: 'Google Sheets', cat: 'link' };
    if (/docs\.google\.com\/presentation/i.test(u)) return { icon: '📙', label: 'Google Slides', cat: 'link' };
    if (/drive\.google\.com/i.test(u)) return { icon: '📁', label: 'Google Drive', cat: 'link' };
    return { icon: '🔗', label: 'Link', cat: 'link' };
  }
  const m = String(it.mime || '').toLowerCase();
  if (m.startsWith('image/')) return { icon: '🖼️', label: 'Ảnh', cat: 'image' };
  if (m.startsWith('audio/')) return { icon: '🎧', label: 'Audio', cat: 'media' };
  if (m.startsWith('video/')) return { icon: '🎬', label: 'Video', cat: 'media' };
  if (m.includes('pdf')) return { icon: '📕', label: 'PDF', cat: 'doc' };
  if (/word|opendocument\.text/.test(m)) return { icon: '📘', label: 'Word', cat: 'doc' };
  if (/sheet|excel|csv/.test(m)) return { icon: '📗', label: 'Excel', cat: 'doc' };
  if (/presentation|powerpoint/.test(m)) return { icon: '📙', label: 'PowerPoint', cat: 'doc' };
  if (/zip|rar|7z|compressed/.test(m)) return { icon: '🗜️', label: 'File nén', cat: 'doc' };
  return { icon: '📄', label: 'File', cat: 'doc' };
}

function openUrl(it) {
  if (it.type === 'file' && it.fileId) return 'https://drive.google.com/file/d/' + encodeURIComponent(it.fileId) + '/view';
  if (it.type === 'link' && /^https?:\/\//i.test(it.url || '')) return it.url;
  return '';
}

function thumbOf(it) {
  const m = String(it.mime || '');
  const drive = id => 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w600';
  if (it.type === 'file' && it.fileId && (m.startsWith('image/') || m.includes('pdf'))) return drive(it.fileId);
  if (it.type === 'link') {
    const y = String(it.url || '').match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/);
    if (y) return 'https://i.ytimg.com/vi/' + y[1] + '/hqdefault.jpg';
    if (it.fileId) return drive(it.fileId);
  }
  return '';
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function fmtShort(iso) { return fmtDate(iso).slice(0, 5); }
function fmtSize(b) {
  if (!b) return '';
  return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB';
}
function linkify(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, u => '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>');
}
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
// {MONTH} trong tiêu đề → tên tháng hiện tại (vd "Task {MONTH}" → "Task NOVEMBER")
const fillTitle = s => String(s || '').replace(/\{MONTH\}/gi, MONTHS[new Date().getMonth()]);

function titleOf(it) {
  if (it.type === 'schedule') {
    const w = weekOf(it);
    return w.length ? 'Lịch dạy tuần ' + ddmm(w[0].date) + ' – ' + ddmm(w[w.length - 1].date) : fillTitle(it.title);
  }
  if (it.title) return fillTitle(it.title);
  if (it.type === 'note') return (String(it.desc || '').split('\n')[0] || 'Ghi chú').slice(0, 80);
  return 'Không tên';
}

/* ───── Lịch tuần: dữ liệu JSON do máy chủ ghi (14 ngày), trang chọn đúng tuần hiện tại ───── */
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const ddmm = s => String(s).slice(8, 10) + '/' + String(s).slice(5, 7);
const todayYmd = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
function schedOf(it) {
  if (it._sc !== undefined) return it._sc;
  try { it._sc = JSON.parse(it.desc || 'null'); } catch (_) { it._sc = null; }
  return it._sc;
}
function weekOf(it) {
  const sc = schedOf(it);
  const days = sc && Array.isArray(sc.days) ? sc.days : [];
  if (!days.length) return [];
  const t = todayYmd();
  const i = days.findIndex(d => d.date === t);
  const start = i >= 0 ? Math.floor(i / 7) * 7 : (t > days[days.length - 1].date ? Math.max(0, days.length - 7) : 0);
  return days.slice(start, start + 7);
}
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : '';
function classChip(code, extra) {
  const c = S.classes[code] || {};
  const bg = safeColor(c.bg), fg = safeColor(c.fg);
  return '<span class="cchip" style="' + (bg ? 'background:' + bg + ';' : '') + (fg ? 'color:' + fg + ';' : '') + '">' +
    (c.emo ? esc(c.emo) + ' ' : '') + esc(code) + (extra ? ' <small>' + esc(extra) + '</small>' : '') + '</span>';
}
function scheduleHTML(it) {
  const w = weekOf(it);
  const sc = schedOf(it) || {};
  if (sc.classes) Object.keys(sc.classes).forEach(k => { if (!S.classes[k]) S.classes[k] = sc.classes[k]; });
  const t = todayYmd();
  if (!w.length) return '<p class="desc">Chưa có dữ liệu lịch. Bấm 🔄 Đồng bộ ngay.</p>';
  return '<div class="sched">' + w.map((d, i) =>
    '<div class="sd' + (d.date === t ? ' today' : '') + '"><span class="wd">' + WD[i] + ' <small>' + ddmm(d.date) + '</small></span>' +
    '<span class="cl">' + (d.list.length ? d.list.map(x => classChip(x.cls, x.time)).join('') : '<span class="muted">—</span>') + '</span></div>'
  ).join('') + '</div>';
}

/* ───── Thả tim + bình luận ───── */
const commentsOf = id => S.comments.filter(c => c.itemId === id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
function fmtDT(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : fmtShort(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function socialHTML(it) {
  const likes = it.likes || [];
  const mine = likes.includes(S.who);
  const cm = commentsOf(it.id);
  return '<div class="social">' +
    '<button type="button" class="like' + (mine ? ' on' : '') + '" data-act="like" title="' + (likes.length ? esc(likes.join(', ')) + ' đã thả tim' : 'Thả tim') + '">' +
      (mine ? '❤️' : '🤍') + (likes.length ? ' ' + esc(likes.join(', ')) : '') + '</button>' +
    '<div class="cmts">' + cm.map(c =>
      '<div class="cmt"><div class="cmt-h"><b>' + esc(c.by) + '</b> <span>' + fmtDT(c.createdAt) + '</span>' +
        (c.by === S.who ? '<button type="button" class="icon" data-act="delCmt" data-cid="' + esc(c.id) + '" title="Xóa bình luận">✕</button>' : '') + '</div>' +
      '<div class="cmt-t">' + linkify(esc(c.text)) + '</div></div>').join('') +
      '<div class="cmt-new"><textarea rows="1" data-draft="' + esc(it.id) + '" placeholder="Viết bình luận… (Enter để gửi)">' + esc(S.drafts[it.id] || '') + '</textarea>' +
      '<button type="button" data-act="sendCmt">Gửi</button></div>' +
    '</div></div>';
}

const tokensOf = q => norm(q).split(/\s+/).filter(Boolean);

function match(it, tokens, pack) {
  const k = kindOf(it);
  if (S.type && k.cat !== S.type) return false;
  if (S.by && it.by !== S.by) return false;
  if (!tokens.length) return true;
  const tagN = splitTags(it.tags).map(norm);
  const body = it.type === 'schedule' ? weekOf(it).map(d => d.list.map(x => x.cls).join(' ')).join(' ') : it.desc;
  const cmts = commentsOf(it.id).map(c => c.by + ' ' + c.text).join(' ');
  const hay = norm([titleOf(it), it.tags, body, pack.name, it.by, k.label, it.url, cmts].join(' '));
  return tokens.every(t => t[0] === '#' ? (t.length === 1 || tagN.some(g => g.startsWith(t.slice(1)))) : hay.includes(t));
}

const sortFn = (a, b) => (b.pinned - a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt));

// Lịch tuần mặc định mở sẵn; các bài khác mặc định thu gọn
const defOpen = it => S.full || (it && it.type === 'schedule');
function isOpen(it, tokens) {
  const base = defOpen(it) ? !S.shut.has(it.id) : S.open.has(it.id);
  if (base) return true;
  // đang tìm và từ khóa nằm trong phần bị ẩn (mô tả, tag…) → tự mở để thấy
  const t = norm(titleOf(it));
  return tokens.some(x => x[0] !== '#' && !t.includes(x));
}
function setOpen(id, v) {
  if (defOpen(S.items.find(i => i.id === id))) { if (v) S.shut.delete(id); else S.shut.add(id); }
  else { if (v) S.open.add(id); else S.open.delete(id); }
}

function cardHTML(it, tokens) {
  const k = kindOf(it);
  const href = openUrl(it);
  const title = titleOf(it);
  const thumb = thumbOf(it);
  const tags = splitTags(it.tags);
  const sched = it.type === 'schedule';
  // "PET01 · Unit 6 Kahoot" → nhãn lớp có màu + phần tên còn lại
  const m = title.match(/^(.{1,24}?) · (.+)$/);
  const label = m ? classChip(m[1]) + ' ' + esc(m[2]) : esc(title);
  const inner = (it.pinned ? '📌 ' : '') + label;
  const ttl = href
    ? '<a class="ttl" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(title) + '">' + inner + '</a>'
    : '<span class="ttl" title="' + esc(title) + '">' + inner + '</span>';
  const color = /^#[0-9a-f]{6}$/i.test(it.color || '') ? ' style="--pc:' + it.color + '"' : '';
  const nLike = (it.likes || []).length, nCmt = commentsOf(it.id).length;
  const badges = (nLike ? '<span class="bdg">❤️' + nLike + '</span>' : '') + (nCmt ? '<span class="bdg">💬' + nCmt + '</span>' : '');
  const sc = sched ? schedOf(it) : null;
  return '<article class="card' + (isOpen(it, tokens) ? ' open' : '') + (it.pinned ? ' pinned' : '') + (color ? ' colored' : '') + (sched ? ' schedule' : '') + (isTmp(it.id) ? ' pending' : '') + '" data-id="' + esc(it.id) + '"' + color + '>' +
    '<div class="row" data-act="toggle" title="Bấm để xem thêm / thu gọn">' +
      '<span class="ico">' + k.icon + '</span>' + ttl + badges +
      '<span class="sub">' + (sched ? 'tự động' : esc(it.by) + ' · ' + fmtShort(it.createdAt)) + '</span>' +
      '<span class="tog">▾</span>' +
    '</div>' +
    '<div class="body">' +
      (thumb ? '<a class="thumb" href="' + esc(href || thumb) + '" target="_blank" rel="noopener"><img loading="lazy" alt="" src="' + esc(thumb) + '"></a>' : '') +
      (sched ? scheduleHTML(it) : it.desc ? '<p class="desc">' + linkify(esc(it.desc)) + '</p>' : '') +
      (tags.length ? '<div class="tags">' + tags.map(t => '<button type="button" class="tag" data-act="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</button>').join('') + '</div>' : '') +
      '<div class="acts">' +
        (sched
          ? '<span title="Lấy từ web Quản lý lớp học, tự cập nhật 2 ngày/lần">Tự cập nhật' + (sc && sc.syncedAt ? ' · ' + fmtDT(sc.syncedAt) : '') + '</span><span class="sp"></span>' +
            '<button type="button" data-act="sync" title="Lấy lịch mới nhất ngay">🔄 Đồng bộ</button>'
          : '<span>' + k.label + (it.size ? ' · ' + fmtSize(it.size) : '') + ' · ' + fmtDate(it.createdAt) + '</span><span class="sp"></span>' +
            (it.type === 'file' && it.fileId ? '<a href="https://drive.google.com/uc?export=download&amp;id=' + encodeURIComponent(it.fileId) + '" title="Tải về">⬇️ Tải</a>' : '') +
            '<button type="button" data-act="edit" title="Sửa / chuyển pack / xóa">✏️ Sửa</button>') +
      '</div>' +
      socialHTML(it) +
    '</div>' +
  '</article>';
}

function renderChips() {
  $('#typeChips').innerHTML = TYPES.map(([v, l]) => '<button type="button" class="chip' + (S.type === v ? ' on' : '') + '" data-type="' + v + '">' + l + '</button>').join('');
  $('#byChips').innerHTML = PEOPLE.map(([v, l]) => '<button type="button" class="chip' + (S.by === v ? ' on' : '') + '" data-by="' + esc(v) + '">' + l + '</button>').join('');
  $('#jumpChips').innerHTML = S.packs.map(p => '<button type="button" class="chip pk" style="--c:' + esc(p.color) + '" data-jump="' + esc(p.id) + '">' + esc(p.emoji) + ' ' + esc(p.name) + '</button>').join('');
}

function render() {
  if ($('#app').hidden) return;
  renderChips();
  const tokens = tokensOf(S.q);
  const filtering = !!(tokens.length || S.type || S.by);
  const packIds = new Set(S.packs.map(p => p.id));
  const byPack = {};
  S.items.forEach(it => { if (packIds.has(it.packId)) (byPack[it.packId] = byPack[it.packId] || []).push(it); });

  let html = '', total = 0;
  S.packs.forEach(p => {
    const all = byPack[p.id] || [];
    const list = all.filter(it => match(it, tokens, p)).sort(sortFn);
    total += list.length;
    if (filtering && !list.length) return;
    const expanded = filtering || S.more.has(p.id);
    const shown = expanded ? list : list.slice(0, PER_COL);
    html += '<section class="col" id="pk-' + esc(p.id) + '" data-pack="' + esc(p.id) + '" style="--c:' + esc(p.color) + '">' +
      '<div class="col-h"><span class="emo">' + esc(p.emoji) + '</span><b title="' + esc(p.name) + '">' + esc(p.name) + '</b>' +
        '<span class="cnt">' + (filtering ? list.length + '/' + all.length : all.length) + '</span>' +
        '<button type="button" class="icon" data-act="editPack" title="Sửa pack">⋯</button></div>' +
      '<button type="button" class="add-in" data-act="addTo">＋ Thêm</button>' +
      '<div class="cards">' + shown.map(it => cardHTML(it, tokens)).join('') + '</div>' +
      (!filtering && list.length > PER_COL
        ? '<button type="button" class="more" data-act="more">' + (S.more.has(p.id) ? '▴ Ẩn bớt' : '▾ Xem thêm ' + (list.length - PER_COL) + ' bài') + '</button>'
        : '') +
    '</section>';
  });
  if (!filtering) html += '<button type="button" class="col new-pack" data-act="newPack">＋ Thêm pack mới</button>';
  // giữ con trỏ trong ô bình luận đang gõ khi bảng được vẽ lại
  const ae = document.activeElement;
  const typing = ae && ae.dataset && ae.dataset.draft ? { id: ae.dataset.draft, pos: ae.selectionStart } : null;
  $('#board').innerHTML = html;
  if (typing) {
    const ta = $('#board').querySelector('textarea[data-draft="' + CSS.escape(typing.id) + '"]');
    if (ta) { ta.focus(); try { ta.setSelectionRange(typing.pos, typing.pos); } catch (_) {} }
  }

  const empty = $('#empty');
  if (!S.packs.length) { empty.hidden = false; empty.innerHTML = 'Chưa có pack nào. Bấm <b>＋ Thêm pack mới</b> để bắt đầu 🌱'; }
  else if (filtering && !total) { empty.hidden = false; empty.textContent = 'Không tìm thấy tài liệu nào phù hợp 🔍'; }
  else empty.hidden = true;
  $('#viewBtn').innerHTML = S.full ? '▴<span class="hide-m"> Thu gọn hết</span>' : '▾<span class="hide-m"> Mở hết</span>';
}

/* ───────────────────────── Sự kiện trên bảng ───────────────────────── */
let qTimer;
$('#q').addEventListener('input', e => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { S.q = e.target.value; render(); }, 120);
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('#app').hidden) { e.preventDefault(); $('#q').focus(); }
});
$('#viewBtn').addEventListener('click', () => {
  S.full = !S.full; S.open.clear(); S.shut.clear();
  store.set('full', S.full);
  render();
});
$('#fab').addEventListener('click', () => openAdd());

document.addEventListener('click', e => {
  const t = e.target;
  const closeBtn = t.closest('[data-close]');
  if (closeBtn) { closeBtn.closest('dialog').close(); return; }

  const chip = t.closest('[data-type],[data-by],[data-jump]');
  if (chip) {
    if ('type' in chip.dataset) S.type = S.type === chip.dataset.type ? '' : chip.dataset.type;
    else if ('by' in chip.dataset) S.by = S.by === chip.dataset.by ? '' : chip.dataset.by;
    else {
      const col = document.getElementById('pk-' + chip.dataset.jump);
      if (col) col.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    render();
    return;
  }

  const a = t.closest('[data-act]');
  if (!a || !$('#board').contains(a)) return;
  const card = a.closest('.card');
  const col = a.closest('.col');
  if (card && isTmp(card.dataset.id) && /^(edit|like|sendCmt|delCmt)$/.test(a.dataset.act)) { toast('Bài đang được lưu, chờ 1–2 giây nhé ⏳'); return; }
  switch (a.dataset.act) {
    case 'toggle': {
      if (t.closest('a')) return; // bấm tiêu đề = mở file
      const v = !card.classList.contains('open');
      setOpen(card.dataset.id, v);
      card.classList.toggle('open', v);
      break;
    }
    case 'tag':
      S.q = '#' + a.dataset.tag; $('#q').value = S.q; render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'edit': openEdit(card.dataset.id); break;
    case 'addTo': openAdd(col.dataset.pack); break;
    case 'editPack': openPack(col.dataset.pack); break;
    case 'newPack': openPack(null); break;
    case 'more':
      if (S.more.has(col.dataset.pack)) S.more.delete(col.dataset.pack); else S.more.add(col.dataset.pack);
      render();
      break;
    case 'like': {
      const it = S.items.find(i => i.id === card.dataset.id);
      if (!it) break;
      mutate('toggleLike', { id: it.id }, () => {
        const l = it.likes || [];
        it.likes = l.includes(S.who) ? l.filter(x => x !== S.who) : l.concat(S.who);
      }).catch(() => {});
      break;
    }
    case 'sendCmt': sendComment(card.dataset.id); break;
    case 'delCmt': {
      const cid = a.dataset.cid;
      if (isTmp(cid)) { toast('Bình luận đang được lưu, chờ 1–2 giây nhé ⏳'); break; }
      if (confirm('Xóa bình luận này?')) mutate('deleteComment', { id: cid }, () => { S.comments = S.comments.filter(c => c.id !== cid); }).catch(() => {});
      break;
    }
    case 'sync':
      a.disabled = true;
      api('syncSchedule', {}).then(j => toast(j.msg || 'Đã đồng bộ lịch ✅')).catch(er => { a.disabled = false; toast(er.message, true); });
      break;
  }
});

/* ───── Nhấn đôi vào bài → mở hộp sửa; nhấn đôi vào đầu pack → sửa pack ───── */
$('#board').addEventListener('dblclick', e => {
  const t = e.target;
  if (t.closest('a, button, textarea, input, .social')) return; // tiêu đề là link, nút, ô bình luận → giữ nguyên
  try { window.getSelection().removeAllRanges(); } catch (_) {}
  const head = t.closest('.col-h');
  if (head) { openPack(head.closest('.col').dataset.pack); return; }
  const card = t.closest('.card');
  if (!card) return;
  const it = S.items.find(i => i.id === card.dataset.id);
  if (!it) return;
  if (isTmp(it.id)) { toast('Bài đang được lưu, chờ 1–2 giây nhé ⏳'); return; }
  if (it.type === 'schedule') { toast('Lịch tuần lấy tự động từ web Quản lý lớp học — sửa lịch bên đó nhé 📅'); return; }
  // 2 lần chạm đã mở rồi đóng thẻ → giữ trạng thái như trước khi nhấn đôi
  openEdit(it.id);
});

/* ───── Bình luận: nháp được giữ khi bảng vẽ lại; Enter gửi, Shift+Enter xuống dòng ───── */
async function sendComment(id) {
  const text = String(S.drafts[id] || '').trim();
  if (!text) return;
  setOpen(id, true);
  S.drafts[id] = '';
  try {
    await mutate('addComment', { itemId: id, text: text }, () => {
      S.comments = S.comments.concat({ id: tmpId(), itemId: id, by: S.who, text: text, createdAt: new Date().toISOString() });
    });
  } catch (er) {
    S.drafts[id] = text; // trả lại chữ đã gõ để gửi lại
    render();
  }
}
$('#board').addEventListener('input', e => {
  const ta = e.target;
  if (!ta.dataset || !ta.dataset.draft) return;
  S.drafts[ta.dataset.draft] = ta.value;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
});
$('#board').addEventListener('keydown', e => {
  const ta = e.target;
  if (ta.dataset && ta.dataset.draft && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendComment(ta.dataset.draft);
  }
});

// Ảnh xem trước lỗi (file không còn, chưa chia sẻ…) → bỏ ảnh, giữ thẻ
document.addEventListener('error', e => {
  const el = e.target;
  if (el && el.tagName === 'IMG' && el.closest('.thumb')) el.closest('.thumb').remove();
}, true);

// Kéo thả file thẳng vào một cột pack
const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', e => { if (hasFiles(e)) e.preventDefault(); });
$('#board').addEventListener('dragover', e => {
  const col = e.target.closest('.col[data-pack]');
  $$('.col.drag').forEach(c => { if (c !== col) c.classList.remove('drag'); });
  if (col && hasFiles(e)) col.classList.add('drag');
});
$('#board').addEventListener('dragleave', e => {
  const col = e.target.closest('.col[data-pack]');
  if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag');
});
$('#board').addEventListener('drop', e => {
  const col = e.target.closest('.col[data-pack]');
  $$('.col.drag').forEach(c => c.classList.remove('drag'));
  if (col && hasFiles(e) && e.dataTransfer.files.length) openAdd(col.dataset.pack, 'file', e.dataTransfer.files);
});

// Quay lại tab sau ≥1 phút → tự lấy dữ liệu mới (thấy bài trợ lý / cô vừa đăng)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.who && !$('#app').hidden && Date.now() - S.lastSync > 60000) refresh();
});

/* ───────────────────────── Thêm / sửa bài: 1 hộp dùng chung (kiểu Padlet) ───────────────────────── */
// P.att: 'none' (không đính kèm → ghi chú) | 'link' | 'files' (file mới chờ tải) | 'cur' (giữ file đang có)
const P = { mode: 'add', id: null, color: '', att: 'none', origAtt: 'none', busy: false };
let pending = []; // file chờ tải: { file, st: ''|'up'|'ok'|'err'|'big', msg }

function fillPackSelect(sel, selected) {
  sel.innerHTML = S.packs.map(p => '<option value="' + esc(p.id) + '">' + esc(p.emoji + ' ' + p.name) + '</option>').join('');
  sel.value = S.packs.some(p => p.id === selected) ? selected : (S.packs[0] && S.packs[0].id) || '';
}

/** Vẽ các ô màu vào el. allowNone = có ô "Trắng" (bài không màu). */
function swatches(el, selected, allowNone) {
  const list = (allowNone ? [['', 'Trắng']] : []).concat(PALETTE);
  el.innerHTML = list.map(([c, n]) => '<button type="button" class="' + (c === selected ? 'on' : '') + (c ? '' : ' none') +
    '" data-color="' + c + '" style="background:' + (c || '#fff') + '" title="' + n + '"></button>').join('');
}

/** Màu bài: nút "● Tên màu ▾" ở thanh dưới; bấm mới hiện bảng màu, chọn xong tự đóng. */
function colorPick(popId, val) {
  const pop = document.getElementById(popId);
  swatches(pop, val, true);
  const box = pop.parentNode;
  const dot = box.querySelector('.cdot');
  dot.style.background = val || '#fff';
  dot.classList.toggle('none', !val);
  const name = (PALETTE.find(p => p[0] === val) || [0, 'Trắng'])[1];
  const lbl = box.querySelector('#pColorName');
  if (lbl) lbl.textContent = name;
  pop.hidden = true;
}
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-pop]');
  $$('.colors.pop').forEach(p => { if (!(btn && p.id === btn.dataset.pop) && !p.contains(e.target)) p.hidden = true; });
  if (btn) { const p = document.getElementById(btn.dataset.pop); p.hidden = !p.hidden; }
});
$('#pColors').addEventListener('click', e => { const b = e.target.closest('[data-color]'); if (b) { P.color = b.dataset.color; colorPick('pColors', P.color); } });

// Máy chủ bản mới (ver ≥ 2) mới cho đổi đính kèm khi SỬA bài (gắn link vào ghi chú, thay file…)
const canEditAttach = () => P.mode === 'add' || (S.ver || 1) >= 2;

function renderAttach() {
  const it = P.mode === 'edit' ? S.items.find(i => i.id === P.id) : null;
  const can = canEditAttach();
  $('#attPick').hidden = !(P.att === 'none' && can);
  $('#attLink').hidden = P.att !== 'link';
  $('#attCur').hidden = P.att !== 'cur';
  $('#pAttach').hidden = P.att === 'none' && !can;
  if (P.att === 'cur' && it) {
    const k = kindOf(it), href = openUrl(it);
    $('#attCur').innerHTML = '<span>' + k.icon + '</span>' +
      '<a href="' + esc(href) + '" target="_blank" rel="noopener" title="Mở file">' + esc(titleOf(it)) + '</a>' +
      '<span class="s">' + k.label + (it.size ? ' · ' + fmtSize(it.size) : '') + '</span>' +
      (can ? '<button type="button" class="icon" id="attCurX" title="Gỡ file (để thay file khác hoặc dán link)">✕</button>' : '');
  }
  $('#attLinkX').hidden = P.mode === 'edit' && !can; // máy chủ cũ: chỉ sửa được địa chỉ link
  $('#pTitle').placeholder = P.att === 'files' ? 'Tiêu đề (để trống = tên file)' : P.att === 'link' ? 'Tiêu đề (để trống = địa chỉ link)' : 'Tiêu đề';
  renderFiles();
}

function addFiles(list) {
  if (P.busy) return;
  if (!canEditAttach()) { toast('Máy chủ chưa cập nhật nên chưa thay file được khi sửa bài.', true); return; }
  let arr = Array.from(list || []);
  if (P.mode === 'edit') { arr = arr.slice(0, 1); pending = []; } // sửa bài: thay bằng 1 file
  arr.forEach(f => pending.push({ file: f, st: f.size > MAX_BYTES ? 'big' : '', msg: '' }));
  if (pending.length) P.att = 'files';
  renderAttach();
}

function renderFiles() {
  const icon = { '': '📄', up: '⏳', ok: '✅', err: '❌', big: '⚠️' };
  $('#fileList').hidden = P.att !== 'files';
  $('#fileList').innerHTML = P.att !== 'files' ? '' : pending.map((p, i) =>
    '<li><span>' + icon[p.st] + '</span><span class="n" title="' + esc(p.file.name) + '">' + esc(p.file.name) + '</span>' +
    '<span class="s">' + (p.st === 'big' ? 'quá 20MB' : p.st === 'err' ? esc(p.msg) : p.st === 'up' ? 'đang tải…' : fmtSize(p.file.size)) + '</span>' +
    (P.busy || p.st === 'ok' ? '' : '<button type="button" class="icon" data-rm="' + i + '" title="Bỏ">✕</button>') + '</li>'
  ).join('');
}

$('#fileList').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]');
  if (!b || P.busy) return;
  pending.splice(+b.dataset.rm, 1);
  if (!pending.length) P.att = P.origAtt === 'cur' ? 'cur' : 'none';
  renderAttach();
});
$('#fileIn').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('#attLinkBtn').addEventListener('click', () => { P.att = 'link'; renderAttach(); setTimeout(() => $('#pUrl').focus(), 0); });
$('#attLinkX').addEventListener('click', () => { P.att = 'none'; $('#pUrl').value = ''; renderAttach(); });
$('#attCur').addEventListener('click', e => { if (e.target.closest('#attCurX')) { P.att = 'none'; renderAttach(); } });
// Kéo thả file vào hộp
const pBody = $('#pBody');
pBody.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); $('#attPick').classList.add('drag'); } });
pBody.addEventListener('dragleave', e => { if (!pBody.contains(e.relatedTarget)) $('#attPick').classList.remove('drag'); });
pBody.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); $('#attPick').classList.remove('drag'); addFiles(e.dataTransfer.files); });
$('#postDlg').addEventListener('cancel', e => { if (P.busy) e.preventDefault(); });

function openPost(mode, o) {
  o = o || {};
  if (!S.packs.length) { toast('Hãy tạo một pack trước nhé 🌱'); openPack(null); return; }
  const it = mode === 'edit' ? S.items.find(i => i.id === o.id) : null;
  if (mode === 'edit' && !it) return;
  P.mode = mode; P.id = it ? it.id : null; P.busy = false; pending = [];
  $('#postForm').reset();
  $('#pTitle').value = it ? it.title || '' : '';
  $('#pDesc').value = it ? it.desc || '' : '';
  $('#pTags').value = it ? it.tags || '' : '';
  $('#pPin').checked = !!(it && it.pinned);
  $('#pUrl').value = it && it.type === 'link' ? it.url || '' : '';
  fillPackSelect($('#pPack'), it ? it.packId : (o.packId || store.get('lastPack', '')));
  P.color = it ? it.color || '' : '';
  colorPick('pColors', P.color);
  P.att = !it ? 'none' : it.type === 'file' ? 'cur' : it.type === 'link' ? 'link' : 'none';
  P.origAtt = P.att;
  $('#pDel').hidden = mode !== 'edit';
  $('#pGo').textContent = mode === 'edit' ? 'Cập nhật' : 'Đăng';
  $('#pGo').disabled = false;
  $('#pErr').textContent = '';
  if (o.files && o.files.length) addFiles(o.files); else renderAttach();
  $('#postDlg').showModal();
  if (mode === 'add') setTimeout(() => $('#pTitle').focus(), 30);
}
function openAdd(packId, type, files) { openPost('add', { packId: packId, files: files }); }
function openEdit(id) { openPost('edit', { id: id }); }

function toB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('Không đọc được file'));
    r.readAsDataURL(file);
  });
}

function lockPost(v) {
  P.busy = v;
  $('#pGo').disabled = v;
  $$('#postDlg [data-close], #pDel').forEach(b => { b.disabled = v; });
  renderFiles();
}

function tmpItem(o) {
  return Object.assign({ id: tmpId(), title: '', type: 'note', tags: '', desc: '', fileId: '', url: '', mime: '', size: 0,
    by: S.who, createdAt: new Date().toISOString(), pinned: false, color: '', likes: [] }, o, { tags: normTags(o.tags) });
}

$('#postForm').addEventListener('submit', e => {
  e.preventDefault();
  if (P.busy) return;
  $('#pErr').textContent = '';
  const f = {
    packId: $('#pPack').value, title: $('#pTitle').value.trim(), desc: $('#pDesc').value.trim(),
    tags: $('#pTags').value, color: P.color, pinned: $('#pPin').checked,
  };
  const url = $('#pUrl').value.trim();
  if (P.att === 'link' && !/^https?:\/\/\S+$/i.test(url)) { $('#pErr').textContent = 'Link phải bắt đầu bằng http:// hoặc https://'; $('#pUrl').focus(); return; }
  store.set('lastPack', f.packId);
  if (P.mode === 'add') submitAdd(f, url); else submitEdit(f, url);
});

function submitAdd(f, url) {
  if (P.att === 'files') return uploadPending(f);
  if (P.att === 'link') {
    $('#postDlg').close();
    mutate('addLink', Object.assign({ url: url }, f), () => {
      S.items = S.items.concat(tmpItem(Object.assign({}, f, { type: 'link', url: url, title: f.title || url.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 150) })));
    }, 'Đã đăng 🔗').catch(() => {});
    return;
  }
  if (!f.title && !f.desc) { $('#pErr').textContent = 'Bài đang trống: viết tiêu đề hoặc nội dung, hoặc thêm file / link.'; return; }
  $('#postDlg').close();
  mutate('addNote', f, () => { S.items = S.items.concat(tmpItem(Object.assign({}, f, { type: 'note' }))); }, 'Đã đăng 📝').catch(() => {});
}

async function uploadPending(f) {
  const todo = pending.filter(p => p.st !== 'ok' && p.st !== 'big');
  if (!todo.length) { $('#pErr').textContent = 'Không còn file nào đăng được (file quá 20MB: tải lên Drive rồi dán link).'; return; }
  lockPost(true);
  const multi = pending.length > 1;
  let okN = 0;
  for (const p of todo) {
    p.st = 'up'; p.msg = ''; renderFiles();
    try {
      const b64 = await toB64(p.file);
      const t = !multi ? f.title : (f.title ? f.title + ' – ' + baseName(p.file.name) : '');
      await api('upload', Object.assign({}, f, { name: p.file.name, mime: p.file.type, b64: b64, title: t }));
      p.st = 'ok'; okN++;
    } catch (er) { p.st = 'err'; p.msg = er.message; }
    renderFiles();
  }
  lockPost(false);
  if (pending.every(p => p.st === 'ok')) { $('#postDlg').close(); toast('Đã tải lên ' + okN + ' file 🎉'); }
  else {
    if (okN) toast('Đã tải lên ' + okN + ' file');
    $('#pErr').textContent = 'Còn file chưa đăng được (❌/⚠️). Bấm "Đăng" để thử lại, hoặc ✕ để bỏ.';
  }
}

async function submitEdit(f, url) {
  const it = S.items.find(i => i.id === P.id);
  if (!it) { $('#postDlg').close(); return; }
  const body = Object.assign({ id: it.id }, f);
  if (P.att === 'files') { // thay bằng file mới: phải chờ máy chủ lưu file
    const p = pending.find(x => x.st !== 'big');
    if (!p) { $('#pErr').textContent = 'File quá 20MB. Hãy tải lên Drive rồi dán link.'; return; }
    lockPost(true); p.st = 'up'; renderFiles();
    try {
      const b64 = await toB64(p.file);
      await api('updateItem', Object.assign(body, { attach: 'file', name: p.file.name, mime: p.file.type, b64: b64 }));
      lockPost(false);
      $('#postDlg').close(); toast('Đã cập nhật 📎');
    } catch (er) { p.st = 'err'; p.msg = er.message; lockPost(false); $('#pErr').textContent = er.message; }
    return;
  }
  const linkNow = P.att === 'link';
  const removed = P.att === 'none' && P.origAtt !== 'none';
  if (linkNow) { body.url = url; if (it.type !== 'link') body.attach = 'link'; }
  else if (removed) body.attach = 'none';
  $('#postDlg').close();
  mutate('updateItem', body, () => {
    if (f.title) it.title = f.title;
    it.desc = f.desc; it.tags = normTags(f.tags); it.pinned = f.pinned; it.color = f.color;
    if (S.packs.some(p => p.id === f.packId)) it.packId = f.packId;
    if (linkNow) { if (it.type !== 'link') it.fileId = ''; it.type = 'link'; it.url = url; it.mime = ''; it.size = 0; }
    if (removed) { it.type = 'note'; it.url = ''; it.fileId = ''; it.mime = ''; it.size = 0; }
  }, 'Đã cập nhật ✅').catch(() => {});
}

$('#pDel').addEventListener('click', () => {
  const it = S.items.find(i => i.id === P.id);
  if (!it || P.busy || !confirm('Xóa "' + titleOf(it) + '"?' + (it.type === 'file' ? '\n(File được chuyển vào Thùng rác Drive, khôi phục được trong 30 ngày.)' : ''))) return;
  const id = it.id;
  $('#postDlg').close();
  mutate('deleteItem', { id: id }, () => {
    S.items = S.items.filter(i => i.id !== id);
    S.comments = S.comments.filter(c => c.itemId !== id);
  }, 'Đã xóa 🗑').catch(() => {});
});

/* ───────────────────────── Pack ───────────────────────── */
let pkId = null, pkEmoji = EMOJIS[0], pkColor = COLORS[0];

function renderPk() {
  const emos = EMOJIS.includes(pkEmoji) ? EMOJIS : [pkEmoji].concat(EMOJIS);
  $('#pkEmojis').innerHTML = emos.map(x => '<button type="button" class="' + (x === pkEmoji ? 'on' : '') + '" data-emo="' + esc(x) + '">' + esc(x) + '</button>').join('');
  swatches($('#pkColors'), pkColor, false);
  const i = S.packs.findIndex(p => p.id === pkId);
  $('#pkLeft').disabled = i <= 0;
  $('#pkRight').disabled = i < 0 || i >= S.packs.length - 1;
}

function openPack(id) {
  const p = id ? S.packs.find(x => x.id === id) : null;
  pkId = p ? p.id : null;
  $('#pkTitle').textContent = p ? 'Sửa pack' : 'Pack mới';
  $('#pkName').value = p ? p.name : '';
  pkEmoji = p ? p.emoji : EMOJIS[0];
  pkColor = p ? p.color : COLORS[S.packs.length % COLORS.length];
  $$('#packDlg .only-edit').forEach(x => { x.hidden = !p; });
  $('#pkErr').textContent = '';
  renderPk();
  $('#packDlg').showModal();
}

$('#pkEmojis').addEventListener('click', e => { const b = e.target.closest('[data-emo]'); if (b) { pkEmoji = b.dataset.emo; renderPk(); } });
$('#pkColors').addEventListener('click', e => { const b = e.target.closest('[data-color]'); if (b) { pkColor = b.dataset.color; renderPk(); } });

$('#packForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#pkName').value.trim();
  if (!name) { $('#pkErr').textContent = 'Chưa nhập tên pack'; return; }
  if (S.packs.some(p => p.id !== pkId && p.name.toLowerCase() === name.toLowerCase())) { $('#pkErr').textContent = 'Đã có pack tên "' + name + '"'; return; }
  if (pkId) {
    const p = S.packs.find(x => x.id === pkId);
    const emoji = pkEmoji, color = pkColor;
    $('#packDlg').close();
    mutate('updatePack', { id: pkId, name: name, emoji: emoji, color: color }, () => {
      if (p) { p.name = name; p.emoji = emoji; p.color = color; }
    }, 'Đã lưu pack ✅').catch(() => {});
    return;
  }
  // Pack mới: chờ máy chủ tạo thư mục Drive và cấp mã pack (để thêm bài vào được ngay)
  try {
    await api('createPack', { name: name, emoji: pkEmoji, color: pkColor });
    $('#packDlg').close(); toast('Đã tạo pack "' + name + '" 🎉');
  } catch (er) {
    $('#pkErr').textContent = er.message;
  }
});

function movePack(dir) {
  const ids = S.packs.map(p => p.id);
  const i = ids.indexOf(pkId), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  ids[i] = ids[j]; ids[j] = pkId;
  mutate('orderPacks', { ids: ids }, () => {
    S.packs = ids.map(id => S.packs.find(p => p.id === id)).filter(Boolean);
    S.packs.forEach((p, k) => { p.order = k + 1; });
  }).catch(() => {});
  renderPk();
}
$('#pkLeft').addEventListener('click', () => movePack(-1));
$('#pkRight').addEventListener('click', () => movePack(1));

$('#pkDel').addEventListener('click', async () => {
  const p = S.packs.find(x => x.id === pkId);
  if (!p) return;
  if (S.items.some(i => i.packId === p.id)) { $('#pkErr').textContent = 'Pack còn tài liệu. Hãy xóa hoặc chuyển hết tài liệu sang pack khác trước.'; return; }
  if (!confirm('Xóa pack "' + p.name + '"?')) return;
  const id = pkId;
  $('#packDlg').close();
  mutate('deletePack', { id: id }, () => { S.packs = S.packs.filter(x => x.id !== id); }, 'Đã xóa pack 🗑').catch(() => {});
});

/* ───── Khóa cuộn trang chính khi đang mở hộp thoại (bài đăng, pack) ───── */
function syncScrollLock() {
  document.documentElement.classList.toggle('modal-open', !!document.querySelector('dialog[open]'));
}
// theo dõi thuộc tính "open" của mọi hộp: mở/đóng bằng nút, phím Esc hay code đều bắt được
const dlgObserver = new MutationObserver(syncScrollLock);
$$('dialog').forEach(d => dlgObserver.observe(d, { attributes: true, attributeFilter: ['open'] }));

/* ───────────────────────── Thông báo nhỏ ───────────────────────── */
let toastTimer;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 5000 : 2500);
}

/* ───────────────────────── Khởi động ───────────────────────── */
(function init() {
  store.del('code'); // mã truy cập cũ, không còn dùng
  if (S.who) store.set('who', S.who);
  if (S.who) {
    const c = store.get('cache', null);
    if (c) { S.packs = c.packs || []; S.items = c.items || []; S.comments = c.comments || []; S.classes = c.classes || {}; S.ver = c.ver || 1; }
    showApp();
    refresh();
  } else {
    showLogin();
  }
})();
