// 창의경영고 분실물 센터 — 웹 버전 (Android 앱과 같은 서버를 씁니다)
import { firebaseConfig, kakaoRestKey, authServer } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut, GoogleAuthProvider, linkWithPopup, signInWithCredential, signInWithCustomToken,
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  reauthenticateWithCredential, updatePassword, reload, onIdTokenChanged,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, query, orderBy, limit, limitToLast, where, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, addDoc,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const VERSION = '2.0.1';
// 관리자 계정(인증된 이메일)의 해시. 실제 권한은 서버 규칙이 확인하고, 여기서는 관리자 메뉴를 보일지만 정합니다.
const ADMIN_HASHES = ['45f11a86004acc099565e8f3462b54ead74a417eeaeb31146d917a5d6f2c4be6'];
const BANNED_TEXT = '운영자가 이 계정의 이용을 제한했어요. 글을 올리거나 채팅할 수 없어요.';
const ITEM_LIMIT = 150;
const CATEGORIES = ['학용품', '전자기기', '의류', '가방', '지갑·카드', '액세서리', '도서·교재', '체육용품', '기타'];
const STORAGES = ['교무실', '담임 선생님', '행정실', '학생부', '직접 보관 중'];
const REASONS = ['욕설·비하', '거짓 정보·사기', '개인정보를 물어봄', '광고·도배', '기타'];
const HOMEPAGE = 'https://cem-h.goegm.kr/cem-h/main.do';
const MAX_PHOTO = 700000, MAX_THUMB = 30000, MAX_CHAT_PHOTO = 600000;

// ---------- Firebase ----------
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
auth.languageCode = 'ko';
let db;
try {
  db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  db = initializeFirestore(fbApp, { localCache: memoryLocalCache() });
}

// ---------- 상태 ----------
const S = { uid: null, items: [], itemsLoaded: false, chats: [], problem: null, unsubItems: null, unsubChats: null, admin: false, adminChecked: false, banned: '', unsubBan: null };
const listState = { lost: { cat: '', resolved: false, q: '', search: false }, found: { cat: '', resolved: false, q: '', search: false } };
let current = null; // 지금 화면 { refresh(), cleanup(), dirty() }
const stack = [];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 사생활 보호 모드 */ } },
};
function nickname() {
  let n = store.get('lf_nick');
  if (!n) { n = '익명' + (1000 + Math.floor(Math.random() * 9000)); store.set('lf_nick', n); }
  return n;
}

// ---------- 아이콘 ----------
const P = {
  home: 'M10,20v-6h4v6h5v-8h3L12,3 2,12h3v8z',
  box: 'M20,2H4C3,2 2,2.9 2,4v3.01c0,0.72 0.43,1.34 1,1.69V20c0,1.1 1.1,2 2,2h14c0.9,0 2,-0.9 2,-2V8.7c0.57,-0.35 1,-0.97 1,-1.69V4C22,2.9 21,2 20,2zM15,14H9v-2h6V14zM20,7H4V4l16,0V7z',
  search: 'M15.5,14h-0.79l-0.28,-0.27C15.41,12.59 16,11.11 16,9.5 16,5.91 13.09,3 9.5,3S3,5.91 3,9.5 5.91,16 9.5,16c1.61,0 3.09,-0.59 4.23,-1.57l0.27,0.28v0.79l5,4.99L20.49,19l-4.99,-5zM9.5,14C7.01,14 5,11.99 5,9.5S7.01,5 9.5,5 14,7.01 14,9.5 11.99,14 9.5,14z',
  chat: 'M20,2H4c-1.1,0 -1.99,0.9 -1.99,2L2,22l4,-4h14c1.1,0 2,-0.9 2,-2V4c0,-1.1 -0.9,-2 -2,-2zM6,9h12v2H6V9zM14,14H6v-2h8v2zM18,8H6V6h12v2z',
  person: 'M12,12c2.21,0 4,-1.79 4,-4s-1.79,-4 -4,-4 -4,1.79 -4,4 1.79,4 4,4zM12,14c-2.67,0 -8,1.34 -8,4v2h16v-2c0,-2.66 -5.33,-4 -8,-4z',
  back: 'M20,11H7.83l5.59,-5.59L12,4l-8,8 8,8 1.41,-1.41L7.83,13H20v-2z',
  menu: 'M3,18h18v-2H3v2zM3,13h18v-2H3v2zM3,6v2h18V6H3z',
  chev: 'M10,6L8.59,7.41 13.17,12l-4.58,4.59L10,18l6,-6z',
  camera: 'M8.8,12a3.2,3.2 0,1 0,6.4 0a3.2,3.2 0,1 0,-6.4 0M9,2L7.17,4H4c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V6c0,-1.1 -0.9,-2 -2,-2h-3.17L15,2H9zM12,17c-2.76,0 -5,-2.24 -5,-5s2.24,-5 5,-5 5,2.24 5,5 -2.24,5 -5,5z',
  image: 'M21,19V5c0,-1.1 -0.9,-2 -2,-2H5c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2zM8.5,13.5l2.5,3.01L14.5,12l4.5,6H5l3.5,-4.5z',
  megaphone: 'M18,11v2h4v-2h-4zM16,17.61c0.96,0.71 2.21,1.65 3.2,2.39 0.4,-0.53 0.8,-1.07 1.2,-1.6 -0.99,-0.74 -2.24,-1.68 -3.2,-2.4 -0.4,0.54 -0.8,1.08 -1.2,1.61zM20.4,5.6c-0.4,-0.53 -0.8,-1.07 -1.2,-1.6 -0.99,0.74 -2.24,1.68 -3.2,2.4 0.4,0.53 0.8,1.07 1.2,1.6 0.96,-0.72 2.21,-1.65 3.2,-2.4zM4,9c-1.1,0 -2,0.9 -2,2v2c0,1.1 0.9,2 2,2h1v4h2v-4h1l5,3V6L8,9H4zM15.5,12c0,-1.33 -0.58,-2.53 -1.5,-3.35v6.69c0.92,-0.81 1.5,-2.01 1.5,-3.34z',
  info: 'M11,7h2v2h-2zM11,11h2v6h-2zM12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM12,20c-4.41,0 -8,-3.59 -8,-8s3.59,-8 8,-8 8,3.59 8,8 -3.59,8 -8,8z',
  addbox: 'M19,3H5c-1.11,0 -2,0.9 -2,2v14c0,1.1 0.89,2 2,2h14c1.1,0 2,-0.9 2,-2V5c0,-1.1 -0.9,-2 -2,-2zM17,13h-4v4h-2v-4H7v-2h4V7h2v4h4v2z',
  shield: 'M12,1L3,5v6c0,5.55 3.84,10.74 9,12 5.16,-1.26 9,-6.45 9,-12V5l-9,-4zM12,11.99h7c-0.53,4.12 -3.28,7.79 -7,8.94V12H5V6.3l7,-3.11v8.8z',
};
const icon = (name, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true"><path d="${P[name]}"/></svg>`;
const WALLET = `<svg class="ill" viewBox="0 0 132 96" aria-hidden="true">
  <ellipse cx="70" cy="88" rx="52" ry="6" fill="#0B2A55" fill-opacity=".1"/>
  <g transform="rotate(-14 62 40)"><rect x="24" y="14" width="68" height="46" rx="6" fill="#fff"/><rect x="24" y="22" width="68" height="8" fill="#F4B740"/>
  <rect x="32" y="36" width="14" height="16" fill="#C9D6EA"/><rect x="52" y="38" width="30" height="4" fill="#DDE5F1"/><rect x="52" y="46" width="22" height="4" fill="#DDE5F1"/></g>
  <rect x="18" y="40" width="104" height="48" rx="10" fill="#3A74E0"/><rect x="78" y="52" width="48" height="26" rx="6" fill="#2C5DC2"/><circle cx="111" cy="65" r="5" fill="#BFD3F7"/></svg>`;

// ---------- 도구 ----------
const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeId = (s) => /^[\w-]{1,200}$/.test(s || '') ? s : '';
const isB64 = (s) => typeof s === 'string' && s.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : Date.now());

const blobUrls = new Map();
function photoUrl(key, b64) {
  if (!isB64(b64)) return '';
  if (blobUrls.has(key)) return blobUrls.get(key);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  blobUrls.set(key, url);
  return url;
}
function thumbHtml(key, b64, extra = '') {
  const url = photoUrl(key, b64);
  return url ? `<div class="thumb ${extra}" style="background-image:url('${url}')"></div>`
    : `<div class="thumb none ${extra}">${icon('image')}</div>`;
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/** 버튼이 있는 대화상자. 누른 버튼의 key(바깥을 누르면 null)를 돌려줍니다. */
function dialog({ title = '', text = '', body = '', actions = [['ok', '확인', 'primary']], onOpen }) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'dialog-bg';
    bg.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">
      ${title ? `<h3>${esc(title)}</h3>` : ''}${text ? `<p>${esc(text)}</p>` : ''}${body}
      <div class="acts">${actions.map(([k, label, kind]) => `<button class="text-btn" data-k="${k}" style="${kind === 'danger' ? 'color:var(--danger)' : kind === 'muted' ? 'color:var(--text2)' : ''}">${esc(label)}</button>`).join('')}</div></div>`;
    const close = (k) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(k); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    bg.addEventListener('click', (e) => {
      if (e.target === bg) return close(null);
      const b = e.target.closest('[data-k]');
      if (!b) return;
      if (b.dataset.k !== 'cancel' && onOpen && onOpen.validate && !onOpen.validate(bg, b.dataset.k)) return;
      close(b.dataset.k);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    if (onOpen && onOpen.init) onOpen.init(bg);
    const first = bg.querySelector('input, textarea, select, button');
    if (first) first.focus();
  });
}

function showPhoto(url) {
  if (!url) return;
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = `<img src="${url}" alt="사진, 누르면 닫혀요">`;
  v.addEventListener('click', () => v.remove());
  document.body.appendChild(v);
}

// ---------- 날짜 ----------
const DAYS = '일월화수목금토';
function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12);
  return d.getMonth() === +m[2] - 1 ? d : null;
}
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoOf(new Date());
function fullDate(iso) {
  const d = parseIso(iso);
  return d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})` : (iso || '');
}
function briefDate(iso) {
  const d = parseIso(iso);
  if (!d) return iso || '';
  return d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}
const briefMs = (t) => briefDate(isoOf(new Date(t)));
function clock(t) {
  const d = new Date(t);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}`;
}
const timeLabel = (t) => (isoOf(new Date(t)) === todayIso() ? clock(t) : briefMs(t));
function daysBetween(a, b) {
  const x = parseIso(a), y = parseIso(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
}

// ---------- 모델 ----------
function itemFrom(d) {
  const x = d.data({ serverTimestamps: 'estimate' }) || {};
  return {
    id: d.id, ownerUid: x.ownerUid || '', ownerName: x.ownerName || '', kind: x.kind === 'found' ? 'found' : 'lost',
    name: x.name || '', category: x.category || '', place: x.place || '', date: x.date || '', storage: x.storage || '',
    detail: x.detail || '', status: x.status === 'resolved' ? 'resolved' : 'open', thumb: x.thumb || '',
    hasPhoto: !!x.hasPhoto, createdAt: ms(x.createdAt), updatedAt: ms(x.updatedAt), resolvedAt: x.resolvedAt || 0,
  };
}
function chatFrom(d) {
  const x = d.data({ serverTimestamps: 'estimate' }) || {};
  return {
    id: d.id, itemId: x.itemId || '', itemName: x.itemName || '', itemKind: x.itemKind === 'found' ? 'found' : 'lost',
    itemThumb: x.itemThumb || '', ownerUid: x.ownerUid || '', ownerName: x.ownerName || '', guestUid: x.guestUid || '',
    guestName: x.guestName || '', lastText: x.lastText || '', lastSender: x.lastSender || '', lastAt: ms(x.lastAt),
    ownerReadAt: ms(x.ownerReadAt), guestReadAt: ms(x.guestReadAt), blockedBy: x.blockedBy || '',
    leftBy: Array.isArray(x.leftBy) ? x.leftBy : [],
  };
}
const isLost = (r) => r.kind === 'lost';
const kindLabel = (k) => (k === 'lost' ? '분실물' : '습득물');
const statusLabel = (r) => (isLost(r) ? (r.status === 'resolved' ? '찾음' : '찾는 중') : (r.status === 'resolved' ? '돌려줌' : '보관 중'));
const placeTitle = (r) => (isLost(r) ? '잃어버린 곳' : '주운 곳');
const dateTitle = (r) => (isLost(r) ? '잃어버린 날' : '주운 날');
const isOwnerOf = (c) => c.ownerUid === S.uid;
const otherName = (c) => (isOwnerOf(c) ? c.guestName : c.ownerName);
const otherUid = (c) => (isOwnerOf(c) ? c.guestUid : c.ownerUid);
const myReadField = (c) => (isOwnerOf(c) ? 'ownerReadAt' : 'guestReadAt');
const isUnread = (c) => c.lastSender && c.lastSender !== S.uid && c.lastAt > (isOwnerOf(c) ? c.ownerReadAt : c.guestReadAt);
const myRole = (c) => (isOwnerOf(c) ? (c.itemKind === 'lost' ? '잃어버린 사람' : '주운 사람') : (c.itemKind === 'lost' ? '주운 사람' : '주인'));
const findItem = (id) => S.items.find((r) => r.id === id) || null;

function matches(target) {
  const words = (s) => (s || '').toLowerCase().split(/[\s,./·()[\]-]+/).filter((w) => w.length >= 2);
  const shared = (a, b) => { const r = words(b); return words(a).filter((x) => r.some((y) => x.includes(y) || y.includes(x))).length; };
  const out = [];
  for (const o of S.items) {
    if (o.id === target.id || o.kind === target.kind || o.status === 'resolved') continue;
    let score = 0;
    if (target.category && target.category === o.category) score += 2;
    score += 3 * shared(target.name, o.name);
    if (shared(target.place, o.place) > 0) score += 1;
    const lost = isLost(target) ? target : o, kept = isLost(target) ? o : target;
    const gap = daysBetween(lost.date, kept.date);
    if (gap !== null) { if (gap >= -1 && gap <= 14) score += 1; else if (gap < -1) score -= 3; }
    if (score >= 3) out.push([score, o]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 5).map((x) => x[1]);
}

// ---------- 서버 ----------
let authReadyResolve;
const authReady = new Promise((r) => { authReadyResolve = r; });
function stopUserListeners() {
  if (S.unsubChats) { S.unsubChats(); S.unsubChats = null; }
  if (S.unsubBan) { S.unsubBan(); S.unsubBan = null; }
  S.chats = [];
  S.banned = '';
}
// 저장된 계정 없이 처음 들어온 사람이면 로그인 창을 한 번 보여 줍니다. (이미 쓰던 사람은 건너뜀)
let firstAuth = true, firstVisit = false;
onAuthStateChanged(auth, (user) => {
  if (firstAuth) { firstAuth = false; firstVisit = !user && !store.get('lf_seen'); store.set('lf_seen', '1'); }
  if (user) {
    authReadyResolve();
    if (S.uid !== user.uid) stopUserListeners();
    S.uid = user.uid;
    startListeners();
    refresh();
  } else {
    stopUserListeners();
    S.uid = null;
    signInAnonymously(auth).catch(() => {
      S.problem = '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';
      refresh();
    });
  }
});

function startListeners() {
  if (!S.unsubItems) {
    S.unsubItems = onSnapshot(query(collection(db, 'items'), orderBy('createdAt', 'desc'), limit(ITEM_LIMIT)), (snap) => {
      S.items = snap.docs.map(itemFrom);
      S.itemsLoaded = true;
      S.problem = null;
      refresh();
    }, () => {
      S.unsubItems = null; // 오류가 나면 구독이 끊기므로 다음 로그인 때 다시 엽니다.
      if (S.uid) S.problem = '목록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
      refresh();
    });
  }
  if (!S.unsubChats) {
    S.unsubChats = onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', S.uid)), (snap) => {
      S.chats = snap.docs.map(chatFrom).filter((c) => !c.leftBy.includes(S.uid)).sort((a, b) => b.lastAt - a.lastAt);
      refresh();
    });
  }
  if (!S.unsubBan) {
    S.unsubBan = onSnapshot(doc(db, 'bans', S.uid), (d) => {
      S.banned = d.exists() ? (d.data().reason || '운영 정책 위반') : '';
      refresh();
    }, () => { S.unsubBan = null; });
  }
}

// 로그인 정보(토큰)가 바뀔 때마다 관리자인지 다시 봅니다.
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
onIdTokenChanged(auth, async (user) => {
  let admin = false;
  try {
    if (user && !user.isAnonymous) {
      const { claims } = await user.getIdTokenResult();
      admin = claims.email_verified === true && typeof claims.email === 'string'
        && ADMIN_HASHES.includes(await sha256('lostfound:' + claims.email.toLowerCase()));
    }
  } catch { admin = false; }
  if (admin !== S.admin || !S.adminChecked) { S.admin = admin; S.adminChecked = true; refresh(); }
});
/** 이용이 제한된 계정이면 알리고 true를 돌려줍니다. */
function blockedByBan() {
  if (!S.banned) return false;
  toast(BANNED_TEXT);
  return true;
}

const fail = (msg) => () => toast(msg);

function saveItem(r, isNew, photo) {
  const ref = doc(db, 'items', r.id);
  const data = {
    ownerName: r.ownerName, kind: r.kind, name: r.name, category: r.category, place: r.place, date: r.date,
    storage: r.storage, detail: r.detail, status: r.status, thumb: r.thumb, hasPhoto: r.hasPhoto,
    resolvedAt: r.resolvedAt || 0, updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  if (isNew) batch.set(ref, { ...data, ownerUid: S.uid, createdAt: serverTimestamp() });
  else batch.update(ref, data);
  const photoRef = doc(db, 'items', r.id, 'photo', 'main');
  if (photo === '') batch.delete(photoRef);
  else if (photo) batch.set(photoRef, { data: photo });
  batch.commit().catch(fail('저장하지 못했어요. 다시 시도해 주세요.'));
}
function setResolved(r, resolved) {
  updateDoc(doc(db, 'items', r.id), { status: resolved ? 'resolved' : 'open', resolvedAt: resolved ? Date.now() : 0, updatedAt: serverTimestamp() })
    .catch(fail('상태를 바꾸지 못했어요.'));
}
function deleteItem(r) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'items', r.id, 'photo', 'main'));
  batch.delete(doc(db, 'items', r.id));
  batch.commit().catch(fail('삭제하지 못했어요.'));
}
async function openChat(item) {
  const id = `${item.id}_${S.uid}`;
  const ref = doc(db, 'chats', id);
  const d = await getDoc(ref);
  if (d.exists()) {
    if ((d.data().leftBy || []).includes(S.uid)) updateDoc(ref, { leftBy: arrayRemove(S.uid) }).catch(() => {});
    return id;
  }
  // 서버에 대화방이 생긴 뒤에 열어야 메시지 목록을 볼 권한이 생깁니다.
  await setDoc(ref, {
    itemId: item.id, itemName: item.name, itemKind: item.kind, itemThumb: item.thumb, ownerUid: item.ownerUid,
    ownerName: item.ownerName, guestUid: S.uid, guestName: nickname(), members: [item.ownerUid, S.uid],
    createdAt: serverTimestamp(), lastText: '', lastSender: '', lastAt: serverTimestamp(),
    ownerReadAt: serverTimestamp(), guestReadAt: serverTimestamp(), blockedBy: '', leftBy: [],
  });
  return id;
}
function preview(type, text) {
  if (type === 'image') return '사진';
  if (type === 'meet') return ('약속: ' + text.replace('\n', ' ')).slice(0, 100);
  return text.slice(0, 100);
}
function send(c, type, text, image) {
  const ref = doc(db, 'chats', c.id);
  const batch = writeBatch(db);
  batch.set(doc(collection(ref, 'messages')), { sender: S.uid, type, text, image, at: serverTimestamp() });
  batch.update(ref, { lastText: preview(type, text), lastSender: S.uid, lastAt: serverTimestamp(), [myReadField(c)]: serverTimestamp() });
  batch.commit().catch(fail('메시지를 보내지 못했어요.'));
}
function report(targetUid, itemId, chatId, reason) {
  addDoc(collection(db, 'abuseReports'), { reporterUid: S.uid, targetUid, itemId, chatId, reason, detail: '', at: serverTimestamp() })
    .catch(fail('신고를 보내지 못했어요.'));
  // 신고가 들어온 대화만 운영자가 열어 볼 수 있습니다. (이미 표시된 대화면 서버가 거절하지만 괜찮습니다.)
  if (chatId) setDoc(doc(db, 'reportedChats', chatId), { at: serverTimestamp() }).catch(() => {});
}

// ---------- 사진 ----------
async function readImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  }
}
function toB64(canvas, maxChars) {
  let c = canvas;
  for (let round = 0; round < 3; round++) {
    for (const q of [0.82, 0.7, 0.58, 0.46]) {
      const s = c.toDataURL('image/jpeg', q).split(',')[1] || '';
      if (s && s.length <= maxChars) return s;
    }
    const n = document.createElement('canvas');
    n.width = Math.round(c.width * 0.75);
    n.height = Math.round(c.height * 0.75);
    n.getContext('2d').drawImage(c, 0, 0, n.width, n.height);
    c = n;
  }
  return '';
}
async function prepareImage(file, maxChars) {
  const img = await readImage(file);
  const w0 = img.width, h0 = img.height;
  const scale = Math.min(1, 1024 / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * scale);
  c.height = Math.round(h0 * scale);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const side = Math.min(c.width, c.height);
  const t = document.createElement('canvas');
  t.width = t.height = Math.min(200, side);
  t.getContext('2d').drawImage(c, (c.width - side) / 2, (c.height - side) / 2, side, side, 0, 0, t.width, t.height);
  return { full: toB64(c, maxChars), thumb: toB64(t, MAX_THUMB) };
}
function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
    input.click();
  });
}

// ---------- 공유 ----------
function shareText(r) {
  const lines = [`[창의경영고 분실물 센터] ${kindLabel(r.kind)} ${isLost(r) ? '신고' : '등록'}`];
  const add = (k, v) => { if (v) lines.push(`${k}: ${v}`); };
  add('물건명', r.name); add('종류', r.category); add(placeTitle(r), r.place); add(dateTitle(r), fullDate(r.date));
  if (!isLost(r)) add('맡긴 곳', r.storage);
  add('특징', r.detail); add('상태', statusLabel(r)); add('올린 사람', r.ownerName);
  lines.push(location.href.split('#')[0] + '#/item/' + r.id);
  return lines.join('\n');
}
async function share(r, photoB64) {
  const text = shareText(r);
  try {
    if (navigator.share) {
      const data = { title: `창의경영고 ${kindLabel(r.kind)} - ${r.name}`, text };
      if (photoB64 && navigator.canShare) {
        const blob = await (await fetch(photoUrl('share' + r.id, photoB64))).blob();
        const file = new File([blob], 'item.jpg', { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) data.files = [file];
      }
      await navigator.share(data);
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('내용을 복사했어요. 메신저에 붙여 넣어 보내 주세요.');
  } catch {
    toast('공유할 수 없어요.');
  }
}

// ---------- 틀: 앱 바, 탭 ----------
const TABS = [['#/', '홈', 'home'], ['#/found', '습득물', 'box'], ['#/lost', '분실물', 'search'], ['#/chats', '채팅', 'chat'], ['#/me', '이용 방법', 'info']];
function renderNav() {
  const hash = location.hash || '#/';
  const active = TABS.find(([h]) => h !== '#/' && hash.startsWith(h))?.[0] || (TABS.some(([h]) => h === hash) ? hash : '');
  const unread = S.chats.some(isUnread);
  const links = TABS.map(([h, label, ic]) => `<a href="${h}" data-nav class="${active === h ? 'on' : ''}" ${active === h ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${h === '#/chats' && unread ? '<i class="dot"></i>' : ''}</a>`).join('');
  $('#tabbar').innerHTML = links;
  $('#rail').innerHTML = `<div class="brand"><img src="../icons/icon-192.png" alt=""><span>창의경영고<br>분실물 센터</span></div>${links}
    <a class="btn primary write" href="#/new/lost" data-nav style="color:#fff;justify-content:center">분실물 신고</a>
    <a class="btn secondary" href="#/new/found" data-nav style="margin-top:8px;justify-content:center">습득물 등록</a>
    ${S.admin ? `<a href="#/admin" data-nav class="${hash === '#/admin' ? 'on' : ''}" style="margin-top:18px">${icon('shield')}<span>관리자</span></a>` : ''}`;
}

function setBar({ title, back = false, right = '' }) {
  $('#bar-title').textContent = title;
  document.title = title === '창의경영고 분실물 센터' ? title : `${title} · 창의경영고 분실물 센터`;
  $('#bar-left').innerHTML = back ? `<button class="icon-btn" id="bar-back" aria-label="뒤로">${icon('back')}</button>` : '';
  $('#bar-right').innerHTML = right;
  if (back) $('#bar-back').onclick = typeof back === 'function' ? back : goBack;
}
function goBack() {
  if (stack.length > 1) history.back();
  else location.replace('#/');
}

// 작성 중에 다른 화면으로 가려고 하면 한 번 묻습니다.
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || !current || !current.dirty || !current.dirty()) return;
  e.preventDefault();
  const k = await dialog({ text: '작성 중인 내용을 지우고 나갈까요?', actions: [['cancel', '계속 작성', 'muted'], ['go', '나가기', 'danger']] });
  if (k === 'go') { current.dirty = null; location.hash = a.getAttribute('href'); }
});
window.addEventListener('beforeunload', (e) => {
  if (current && current.dirty && current.dirty()) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- 라우터 ----------
const ROUTES = [
  [/^#?\/?$/, () => homeView()],
  [/^#\/found$/, () => listView('found')],
  [/^#\/lost$/, () => listView('lost')],
  [/^#\/chats$/, () => chatsView()],
  [/^#\/me$/, () => meView()],
  [/^#\/item\/([\w-]+)$/, (m) => itemView(m[1])],
  [/^#\/new\/(lost|found)$/, (m) => formView(m[1], null)],
  [/^#\/edit\/([\w-]+)$/, (m) => formView(null, m[1])],
  [/^#\/chat\/([\w-]+)$/, (m) => chatView(m[1])],
  [/^#\/admin$/, () => adminView()],
];
function route() {
  const hash = location.hash || '#/';
  if (stack.length > 1 && stack[stack.length - 2] === hash) stack.pop();
  else if (stack[stack.length - 1] !== hash) stack.push(hash);
  if (current && current.cleanup) current.cleanup();
  current = null;
  document.body.classList.remove('chat-view', 'form-view');
  for (const [re, fn] of ROUTES) {
    const m = re.exec(hash);
    if (m) { current = fn(m) || null; break; }
  }
  if (!current) { location.replace('#/'); return; }
  renderNav();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function refresh() {
  renderNav();
  if (current && current.refresh) current.refresh();
}
function statusBlock() {
  if (S.problem) return `<div class="empty">${esc(S.problem)}</div>`;
  if (!S.itemsLoaded) return '<div class="empty">불러오는 중…</div>';
  return '';
}

// ---------- 물건 행 ----------
function line(label, value) {
  return value ? `<div class="ln"><b>${esc(label)}</b>${esc(value)}</div>` : '';
}
function itemRow(r) {
  return `<a class="item ${r.status === 'resolved' ? 'done' : ''}" href="#/item/${safeId(r.id)}">
    ${thumbHtml(r.id + r.updatedAt, r.thumb)}
    <div style="flex:1;min-width:0">
      <div class="top"><span><span class="st">${statusLabel(r)}</span>${r.category ? ' · ' + esc(r.category) : ''}</span><span>${esc(briefDate(r.date))}</span></div>
      <div class="title">${esc(r.name)}</div>
      ${line(placeTitle(r), r.place)}${isLost(r) ? line('특징', (r.detail || '').split('\n')[0]) : line('맡긴 곳', r.storage)}
    </div></a>`;
}
function chatRow(c) {
  let last = c.lastText || '대화를 시작해 보세요.';
  if (c.blockedBy) last = '차단된 대화';
  else if (c.leftBy.includes(otherUid(c))) last = '상대가 대화방을 나갔어요.';
  const unread = isUnread(c);
  return `<a class="chatrow" href="#/chat/${safeId(c.id)}">${thumbHtml('chat' + c.itemId, c.itemThumb)}
    <div style="flex:1;min-width:0"><div class="l1"><span class="who"><span class="n">${esc(otherName(c))}</span><span class="it">${esc(c.itemName)}</span></span><span class="tm">${c.lastText ? timeLabel(c.lastAt) : ''}</span></div>
    <div class="l2"><span class="last ${unread ? 'unread' : ''}">${esc(last)}</span>${unread ? '<i class="dot"></i>' : ''}</div></div></a>`;
}

// ---------- 홈 ----------
function menuCard(href, ic, color, title, sub) {
  return `<a class="menu" href="${href}" data-nav><svg class="mi" viewBox="0 0 24 24" aria-hidden="true" style="fill:${color}"><path d="${P[ic]}"/></svg>
    <div style="flex:1"><b>${title}</b><small>${esc(sub)}</small></div>${icon('chev', 'chev')}</a>`;
}
function homeView() {
  setBar({ title: '창의경영고 분실물 센터' });
  const render = () => {
    const open = (k) => S.items.filter((r) => r.kind === k && r.status === 'open').length;
    const loaded = S.itemsLoaded;
    const recent = statusBlock() || (S.items.length ? S.items.slice(0, 3).map(itemRow).join('') : '<div class="empty">아직 등록된 물건이 없어요.</div>');
    view.innerHTML = `<div class="page">
      <section class="hero"><h2>교실, 복도, 급식실…<br>잃어버린 물건이 있나요?</h2>
        <p>학교에 보관 중인 습득물을 찾아보거나,<br>잃어버린 물건을 신고해 보세요.</p>${WALLET}</section>
      <div class="menus">
        ${menuCard('#/found', 'box', 'var(--amber)', '보관 중이에요', loaded ? `주인을 기다리는 습득물 ${open('found')}건` : '주인을 기다리는 습득물')}
        ${menuCard('#/lost', 'search', 'var(--green)', '찾아 주세요', loaded ? `친구가 찾고 있는 분실물 ${open('lost')}건` : '친구가 찾고 있는 분실물')}
        ${menuCard('#/new/lost', 'megaphone', 'var(--red)', '분실물 신고', '잃어버린 물건을 신고해요.')}
        ${menuCard('#/new/found', 'addbox', 'var(--blue)', '습득물 등록', '주운 물건을 사진과 함께 등록해요.')}
        <p class="caption">올린 물건은 우리 학교 학생 누구나 볼 수 있어요. 주인이나 주운 사람과는 앱 안에서 바로 채팅할 수 있어요.</p>
      </div>
      <div class="home-recent"><div class="section-h">최근 등록</div><div class="list" style="border-top:1px solid var(--line);border-bottom:1px solid var(--line)">${recent}</div></div>
    </div>`;
  };
  render();
  return { refresh: render };
}

// ---------- 목록 ----------
function listView(kind) {
  const st = listState[kind];
  const lost = kind === 'lost';
  setBar({
    title: lost ? '물건을 찾고 있어요' : '주인을 찾아요',
    right: `<button class="icon-btn" id="btn-search" aria-label="검색">${icon('search')}</button><a class="text-btn" href="#/new/${kind}" data-nav style="text-decoration:none">${lost ? '신고' : '등록'}</a>`,
  });
  view.innerHTML = `<div class="page">
    <div class="searchbox" ${st.search ? '' : 'hidden'}><input class="input" id="q" type="search" maxlength="40" placeholder="물건명, 장소, 특징 검색" value="${esc(st.q)}"></div>
    <div class="chips" id="chips">${['', ...CATEGORIES].map((c) => `<button class="chip" data-c="${esc(c)}">${c || '전체'}</button>`).join('')}</div>
    <div class="filterbar"><span class="count" id="count"></span>
      <label>${lost ? '찾은 물건도 보기' : '돌려준 물건도 보기'} <input type="checkbox" class="switch" id="resolved" ${st.resolved ? 'checked' : ''}></label></div>
    <div id="rows"></div></div>`;
  $('#btn-search').onclick = () => {
    st.search = !st.search;
    $('.searchbox').hidden = !st.search;
    if (st.search) $('#q').focus(); else { st.q = ''; $('#q').value = ''; render(); }
  };
  $('#q').oninput = (e) => { st.q = e.target.value; render(); };
  $('#chips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) { st.cat = b.dataset.c; render(); } };
  $('#resolved').onchange = (e) => { st.resolved = e.target.checked; render(); };
  const render = () => {
    document.querySelectorAll('#chips .chip').forEach((b) => b.classList.toggle('on', b.dataset.c === st.cat));
    const q = st.q.trim().toLowerCase();
    const all = S.items.filter((r) => r.kind === kind);
    const shown = all.filter((r) => (st.resolved || r.status === 'open') && (!st.cat || r.category === st.cat)
      && (!q || [r.name, r.place, r.detail, r.category, r.storage].some((s) => s.toLowerCase().includes(q))));
    $('#count').textContent = `${st.resolved ? '전체' : lost ? '찾는 중' : '보관 중'} ${shown.length}건`;
    let empty = '';
    if (S.problem) empty = S.problem;
    else if (!S.itemsLoaded) empty = '불러오는 중…';
    else if (!all.length) empty = lost ? "아직 등록된 분실물이 없어요.\n오른쪽 위 '신고'로 잃어버린 물건을 알려 주세요." : "아직 등록된 습득물이 없어요.\n물건을 주웠다면 오른쪽 위 '등록'을 눌러 주세요.";
    else if (q) empty = `'${st.q.trim()}'에 맞는 물건이 없어요.`;
    else empty = '조건에 맞는 물건이 없어요.';
    $('#rows').innerHTML = shown.length ? `<div class="list">${shown.map(itemRow).join('')}</div>` : `<div class="empty-big">${esc(empty)}</div>`;
  };
  render();
  return { refresh: render };
}

// ---------- 상세 ----------
function itemView(id) {
  let photo = null, photoFor = '', loadingSingle = false, single = null;
  setBar({ title: '', back: true });
  const render = () => {
    const r = findItem(id) || single;
    if (!r) {
      if (S.uid && !loadingSingle) {
        loadingSingle = true;
        getDoc(doc(db, 'items', id)).then((d) => {
          if (d.exists()) { single = itemFrom(d); render(); } else view.innerHTML = '<div class="empty-big">삭제된 글이에요.</div>';
        }).catch(() => { view.innerHTML = '<div class="empty-big">불러오지 못했어요.</div>'; });
      }
      if (!single) view.innerHTML = '<div class="empty-big">불러오는 중…</div>';
      return;
    }
    const mine = r.ownerUid === S.uid;
    setBar({ title: kindLabel(r.kind), back: true, right: mine ? `<a class="text-btn" href="#/edit/${safeId(r.id)}" style="text-decoration:none">수정</a>` : '' });
    const field = (k, v) => `<div class="field"><dt>${esc(k)}</dt><dd class="${v ? '' : 'none'}">${v ? esc(v) : '적지 않음'}</dd></div>`;
    const fields = [field('종류', r.category), field(placeTitle(r), r.place), field(dateTitle(r), fullDate(r.date)),
      ...(isLost(r) ? [] : [field('맡긴 곳', r.storage)]), field('특징', r.detail), field('올린 사람', r.ownerName)];
    const chats = S.chats.filter((c) => c.itemId === r.id);
    const m = r.status === 'resolved' ? [] : matches(r);
    const other = isLost(r) ? '습득물' : '분실물';
    const primary = mine ? (r.status === 'resolved' ? (isLost(r) ? '다시 찾는 중으로' : '다시 보관 중으로') : (isLost(r) ? '찾았어요' : '주인에게 돌려줬어요'))
      : (isLost(r) ? '제가 주웠어요 · 채팅' : '제 물건이에요 · 채팅');
    const note = mine ? "내가 올린 글이에요. 채팅이 오면 아래 '이 물건으로 온 대화'와 채팅 탭에 보여요."
      : isLost(r) ? '이 물건을 주웠다면 채팅으로 주인에게 알려 주세요. 로그인하지 않아도 돼요.'
        : '내 물건이라면 채팅으로 주운 사람과 돌려받을 장소와 시간을 정해 보세요. 로그인하지 않아도 돼요.';
    const thumbUrl = photoUrl(r.id + r.updatedAt, r.thumb);
    view.innerHTML = `<div class="page">
      ${r.hasPhoto ? `<img class="photo-big" id="photo" alt="${esc(r.name)} 사진" src="${photo ? photoUrl('full' + r.id + r.updatedAt, photo) : thumbUrl}">` : ''}
      <div class="head"><div class="caption">${kindLabel(r.kind)} · ${briefMs(r.createdAt)} 올림 · ${esc(r.ownerName)}</div>
        <h2>${esc(r.name)}</h2>
        <div class="status ${r.status === 'resolved' ? 'done' : ''}">${statusLabel(r)}${r.status === 'resolved' && r.resolvedAt ? ' · ' + briefMs(r.resolvedAt) : ''}</div>
        <div class="btn-row"><button class="btn primary" id="primary">${primary}</button><button class="btn secondary" id="share">공유하기</button></div>
        <div class="caption">${note}</div></div>
      <div class="section-h">내용</div><dl class="section" style="margin:0">${fields.join('<div class="divider"></div>')}</dl>
      ${mine ? `<div class="section-h">이 물건으로 온 대화</div><div class="section list">${chats.length ? chats.map(chatRow).join('') : '<div class="empty">아직 온 대화가 없어요.</div>'}</div>` : ''}
      ${r.status === 'resolved' ? '' : `<div class="section-h">비슷한 ${other}</div><div class="section list">${m.length ? m.map(itemRow).join('') : `<div class="empty">아직 비슷한 ${other}이 없어요. 종류와 이름이 비슷한 물건이 올라오면 여기에 보여요.</div>`}</div>`}
      <div class="section danger-row"><button id="bottom">${mine ? '삭제하기' : '이 글 신고하기'}</button></div></div>`;
    const ph = $('#photo');
    if (ph) ph.onclick = () => showPhoto(photo ? photoUrl('full' + r.id + r.updatedAt, photo) : thumbUrl);
    if (r.hasPhoto && photoFor !== r.id + r.updatedAt) {
      photoFor = r.id + r.updatedAt;
      getDoc(doc(db, 'items', r.id, 'photo', 'main')).then((d) => {
        const data = d.exists() ? d.data().data : '';
        if (isB64(data)) { photo = data; const el = $('#photo'); if (el) el.src = photoUrl('full' + r.id + r.updatedAt, data); }
      }).catch(() => {});
    }
    $('#share').onclick = () => share(r, photo);
    $('#primary').onclick = async () => {
      if (mine) { setResolved(r, r.status !== 'resolved'); toast(r.status === 'resolved' ? '다시 진행 중으로 바꿨어요.' : '해결로 바꿨어요.'); return; }
      const existing = S.chats.find((c) => c.itemId === r.id && c.guestUid === S.uid);
      if (existing) { location.hash = '#/chat/' + safeId(existing.id); return; }
      if (blockedByBan()) return;
      try { location.hash = '#/chat/' + await openChat(r); } catch { toast('인터넷 연결을 확인해 주세요.'); }
    };
    $('#bottom').onclick = async () => {
      if (mine) {
        const k = await dialog({ title: '삭제할까요?', text: `'${r.name}' 글과 사진을 지웁니다. 이 물건으로 나눈 대화는 남아요.`, actions: [['cancel', '취소', 'muted'], ['del', '삭제', 'danger']] });
        if (k === 'del') { deleteItem(r); toast('삭제했어요.'); location.replace('#/'); }
      } else {
        const reason = await askReason();
        if (reason) { report(r.ownerUid, r.id, '', reason); toast('신고했어요. 운영자가 확인할게요.'); }
      }
    };
  };
  render();
  return { refresh: render };
}

async function askReason() {
  let picked = null;
  const body = `<div class="opts">${REASONS.map((r, i) => `<label class="opt"><input type="radio" name="reason" value="${i}">${esc(r)}</label>`).join('')}</div>`;
  const k = await dialog({
    title: '신고하기', body, actions: [['cancel', '취소', 'muted'], ['ok', '신고', 'danger']],
    onOpen: {
      validate: (bg) => { const c = bg.querySelector('input[name=reason]:checked'); if (!c) { toast('이유를 골라 주세요.'); return false; } picked = REASONS[+c.value]; return true; },
    },
  });
  return k === 'ok' ? picked : null;
}

// ---------- 등록, 수정 ----------
function formView(kindArg, editId) {
  const editing = editId ? findItem(editId) : null;
  if (editId && (!editing || editing.ownerUid !== S.uid)) {
    setBar({ title: '수정', back: true });
    view.innerHTML = `<div class="empty-big">${S.itemsLoaded ? '이 글을 고칠 수 없어요.' : '불러오는 중…'}</div>`;
    return { refresh: () => { if (S.itemsLoaded && findItem(editId)) route(); } };
  }
  document.body.classList.add('form-view');
  const kind = editing ? editing.kind : kindArg;
  const lost = kind === 'lost';
  setBar({ title: editing ? `${kindLabel(kind)} 수정` : lost ? '분실물 신고' : '습득물 등록', back: () => leave() });
  let photoState = editing && editing.hasPhoto ? 'keep' : 'none';
  let newPhoto = null; // { full, thumb }
  let busy = false;
  view.innerHTML = `<div class="page">
    <p class="caption" style="padding:14px 16px;margin:0">${lost ? '물건의 생김새와 잃어버린 곳을 자세히 적을수록 찾기 쉬워요. 비슷한 사진이 있으면 같이 올려 주세요.' : '주운 물건은 교무실이나 담임 선생님께 맡기고, 맡긴 곳을 함께 적어 주세요.'}</p>
    <form class="form" id="f" novalidate>
      <label class="l">사진</label>
      <div class="photo-pick"><button type="button" class="photo-box" id="pbox">${icon('camera')}<span id="plabel">사진 추가</span></button>
        <div class="side"><p class="caption" style="margin:0">얼굴이나 이름표가 찍히지 않게 물건만 찍어 주세요.</p><button type="button" class="remove" id="premove" hidden>사진 빼기</button></div></div>
      <label class="l" for="name">물건명</label><input class="input" id="name" maxlength="40" placeholder="예: 검은색 필통" autocomplete="off"><div class="error" id="e-name" hidden></div>
      <label class="l" for="cat">종류</label><select class="input" id="cat"><option value="">선택해 주세요</option>${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select><div class="error" id="e-cat" hidden></div>
      <label class="l" for="place">${lost ? '잃어버린 장소' : '주운 장소'}</label><input class="input" id="place" maxlength="40" placeholder="예: 3층 1학년4반 복도" autocomplete="off">
      <label class="l" for="date">${lost ? '잃어버린 날짜' : '주운 날짜'}</label><input class="input" id="date" type="date" max="${todayIso()}">
      ${lost ? '' : `<label class="l" for="storage">지금 맡겨 둔 곳</label><input class="input" id="storage" maxlength="30" placeholder="예: 교무실" list="storages" autocomplete="off"><datalist id="storages">${STORAGES.map((s) => `<option value="${esc(s)}">`).join('')}</datalist><div class="error" id="e-storage" hidden></div>`}
      <label class="l" for="detail">특징</label><textarea class="input" id="detail" maxlength="300" placeholder="색상, 브랜드, 붙어 있는 스티커 등 공개해도 되는 정보"></textarea>
      <p class="caption" style="margin:8px 0 0">이름, 연락처, 학번 같은 개인정보는 적지 마세요.</p>
    </form></div>
    <div class="bottom-bar"><button class="btn primary" id="submit">${editing ? '저장하기' : lost ? '신고하기' : '등록하기'}</button></div>`;
  const f = (id) => $('#' + id);
  if (editing) {
    f('name').value = editing.name; f('cat').value = editing.category; f('place').value = editing.place;
    f('date').value = parseIso(editing.date) ? editing.date : ''; f('detail').value = editing.detail;
    if (!lost) f('storage').value = editing.storage;
  } else f('date').value = todayIso();
  const snapshot = () => [f('name').value, f('cat').value, f('place').value, f('date').value, lost ? '' : f('storage').value, f('detail').value, photoState, newPhoto ? newPhoto.thumb.length : 0].join('\u0001');
  const initial = snapshot();
  let saved = false;
  const dirty = () => !saved && snapshot() !== initial;
  const renderPhoto = () => {
    const box = f('pbox');
    let url = '';
    if (photoState === 'new' && newPhoto) url = photoUrl('new' + newPhoto.thumb.length + newPhoto.thumb.slice(-16), newPhoto.thumb);
    else if (photoState === 'keep' && editing) url = photoUrl(editing.id + editing.updatedAt, editing.thumb);
    box.style.backgroundImage = url ? `url('${url}')` : '';
    box.classList.toggle('has', !!url);
    f('plabel').textContent = busy ? '불러오는 중…' : '사진 추가';
    f('premove').hidden = photoState === 'none';
    f('submit').disabled = busy;
  };
  renderPhoto();
  f('pbox').onclick = async () => {
    if (busy) return;
    const file = await pickFile();
    if (!file) return;
    busy = true; renderPhoto();
    try {
      const p = await prepareImage(file, MAX_PHOTO);
      if (!p.full || !p.thumb) throw new Error('too big');
      newPhoto = p; photoState = 'new';
    } catch { toast('사진을 불러오지 못했어요. 다른 사진을 골라 주세요.'); }
    busy = false; renderPhoto();
  };
  f('premove').onclick = () => { photoState = 'none'; newPhoto = null; renderPhoto(); };
  const err = (id, msg) => { const e = f('e-' + id); if (e) { e.textContent = msg; e.hidden = !msg; } };
  async function leave() {
    if (dirty()) {
      const k = await dialog({ text: editing ? '고친 내용을 저장하지 않고 나갈까요?' : '작성 중인 내용을 지우고 나갈까요?', actions: [['cancel', '계속 작성', 'muted'], ['go', '나가기', 'danger']] });
      if (k !== 'go') return;
    }
    saved = true;
    goBack();
  }
  f('submit').onclick = () => {
    if (busy) return;
    const name = f('name').value.trim();
    const cat = f('cat').value;
    const storage = lost ? '' : f('storage').value.trim();
    err('name', name ? '' : '물건명을 적어 주세요.');
    err('cat', cat ? '' : '종류를 골라 주세요.');
    if (!lost) err('storage', storage ? '' : '물건을 맡겨 둔 곳을 적어 주세요.');
    if (!name) return f('name').focus();
    if (!cat) return f('cat').focus();
    if (!lost && !storage) return f('storage').focus();
    if (!S.uid) return toast('서버에 연결하는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    const isNew = !editing;
    if (isNew && blockedByBan()) return;
    const r = isNew ? { id: doc(collection(db, 'items')).id, kind, ownerName: nickname(), status: 'open', resolvedAt: 0, thumb: '', hasPhoto: false } : { ...editing };
    r.name = name; r.category = cat; r.place = f('place').value.trim();
    r.date = f('date').value || (editing && !parseIso(editing.date) ? editing.date : '');
    r.storage = storage; r.detail = f('detail').value.trim();
    let photoArg = null;
    if (photoState === 'new' && newPhoto) { r.thumb = newPhoto.thumb; r.hasPhoto = true; photoArg = newPhoto.full; }
    else if (photoState === 'none') { if (r.hasPhoto) photoArg = ''; r.thumb = ''; r.hasPhoto = false; }
    saveItem(r, isNew, photoArg);
    saved = true;
    toast(isNew ? '올렸어요. 이제 다른 학생도 볼 수 있어요.' : '저장했어요.');
    if (isNew) location.replace('#/item/' + r.id); else goBack();
  };
  return { dirty };
}

// ---------- 채팅 목록 ----------
function chatsView() {
  setBar({ title: '채팅' });
  const render = () => {
    view.innerHTML = `<div class="page">${S.chats.length ? `<div class="list">${S.chats.map(chatRow).join('')}</div>`
      : '<div class="empty-big">아직 대화가 없어요.\n습득물이나 분실물 상세 화면에서\n채팅하기를 눌러 대화를 시작해 보세요.</div>'}</div>`;
  };
  render();
  return { refresh: render };
}

// ---------- 채팅방 ----------
function chatView(id) {
  document.body.classList.add('chat-view');
  let chat = null, messages = [], markedAt = 0, drawerOpen = false;
  const chatRef = doc(db, 'chats', id);
  setBar({ title: '', back: true, right: `<button class="icon-btn" id="btn-menu" aria-label="채팅방 메뉴">${icon('menu')}</button>` });
  view.innerHTML = `<a class="itembar" id="itembar" href="#"></a><div class="msgs" id="msgs"></div>
    <div class="inputbar" id="inputbar"><button class="icon-btn" id="btn-photo" aria-label="사진 보내기" style="color:var(--text3)">${icon('camera')}</button>
      <textarea id="input" rows="1" maxlength="1000" placeholder="메시지 보내기" aria-label="메시지"></textarea><button class="btn dark" id="btn-send">전송</button></div>
    <div class="closed" id="closed" hidden></div>
    <div class="scrim" id="scrim" hidden></div><aside class="drawer" id="drawer" aria-label="채팅방 메뉴" hidden></aside>`;
  const msgs = $('#msgs'), input = $('#input');

  let unsubMsgs = null;
  const unsubChat = onSnapshot(chatRef, (d) => {
    if (!d.exists()) { view.innerHTML = '<div class="empty-big">대화방을 찾을 수 없어요.</div>'; return; }
    chat = chatFrom(d);
    if (!unsubMsgs) listenMessages();
    render();
    markRead();
  }, () => { view.innerHTML = '<div class="empty-big">이 대화방을 볼 수 없어요.</div>'; });
  function listenMessages() { unsubMsgs = onSnapshot(query(collection(chatRef, 'messages'), orderBy('at', 'asc'), limitToLast(300)), (snap) => {
    messages = snap.docs.map((d) => {
      const x = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, sender: x.sender || '', type: x.type || 'text', text: x.text || '', image: x.image || '', at: ms(x.at), pending: d.metadata.hasPendingWrites };
    });
    renderMessages();
    if (drawerOpen) renderDrawer();
    markRead();
  }, () => { if (unsubMsgs) unsubMsgs(); unsubMsgs = null; }); };

  function markRead() {
    if (!chat || !isUnread(chat) || chat.lastAt === markedAt || document.hidden) return;
    markedAt = chat.lastAt;
    updateDoc(chatRef, { [myReadField(chat)]: serverTimestamp() }).catch(() => {});
  }
  const onVisible = () => markRead();
  document.addEventListener('visibilitychange', onVisible);

  function closedReason() {
    if (!chat) return null;
    if (S.banned) return BANNED_TEXT;
    if (chat.blockedBy === S.uid) return '내가 차단한 대화예요. 메뉴에서 차단을 풀 수 있어요.';
    if (chat.blockedBy) return '상대가 대화를 차단했어요.';
    if (chat.leftBy.includes(otherUid(chat))) return '상대가 대화방을 나갔어요.';
    return null;
  }

  function render() {
    if (!chat) return;
    const item = findItem(chat.itemId);
    setBar({ title: `${chat.itemName} · ${otherName(chat)}`, back: true, right: `<button class="icon-btn" id="btn-menu" aria-label="채팅방 메뉴">${icon('menu')}</button>` });
    $('#btn-menu').onclick = openDrawer;
    const sub = `${kindLabel(chat.itemKind)}${item ? ' · ' + statusLabel(item) : ''} · 나는 ${myRole(chat)}`;
    const bar = $('#itembar');
    bar.href = '#/item/' + safeId(chat.itemId);
    bar.innerHTML = `${thumbHtml(item ? item.id + item.updatedAt : 'chat' + chat.itemId, item ? item.thumb : chat.itemThumb)}<div style="flex:1;min-width:0"><b>${esc(chat.itemName)}</b><small>${esc(sub)}</small></div>${icon('chev', 'chev')}`;
    const closed = closedReason();
    $('#inputbar').hidden = !!closed;
    $('#closed').hidden = !closed;
    if (closed) $('#closed').textContent = closed;
    if (drawerOpen) renderDrawer();
    renderMessages();
  }

  function renderMessages() {
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    let html = '';
    messages.forEach((m, i) => {
      const prev = messages[i - 1], next = messages[i + 1];
      const day = isoOf(new Date(m.at));
      const newDay = !prev || isoOf(new Date(prev.at)) !== day;
      if (newDay) html += `<div class="day"><span>${fullDate(day)}</span></div>`;
      if (m.type === 'notice') { html += `<div class="notice">${esc(m.text)}</div>`; return; }
      const mine = m.sender === S.uid;
      const first = newDay || !prev || prev.sender !== m.sender || prev.type === 'notice';
      const last = !next || next.sender !== m.sender || next.type === 'notice' || Math.floor(next.at / 60000) !== Math.floor(m.at / 60000);
      const time = last ? `<span class="tm">${m.pending ? '보내는 중' : clock(m.at)}</span>` : '';
      let body;
      if (m.type === 'image') {
        const url = photoUrl('m' + m.id, m.image);
        body = url ? `<img src="${url}" alt="보낸 사진" data-photo="${url}">` : '';
      } else if (m.type === 'meet') {
        const [where, when] = m.text.split('\n');
        body = `<div class="bubble"><span class="meet-label">약속</span>장소  ${esc(where)}\n시간  ${esc(when || '')}</div>`;
      } else body = `<div class="bubble">${esc(m.text)}</div>`;
      if (!mine && first && chat) html += `<div class="who">${esc(otherName(chat))}</div>`;
      html += `<div class="msg ${mine ? 'me' : ''}">${mine ? time + body : body + time}</div>`;
    });
    msgs.innerHTML = html || '<div class="notice" style="padding-top:40px">첫 메시지를 보내 보세요. 만날 장소와 시간은 메뉴의 \'약속 잡기\'로 정할 수 있어요.</div>';
    if (nearBottom || messages.length && messages[messages.length - 1].sender === S.uid) msgs.scrollTop = msgs.scrollHeight;
  }
  msgs.addEventListener('click', (e) => { const img = e.target.closest('img[data-photo]'); if (img) showPhoto(img.dataset.photo); });

  function sendText() {
    const text = input.value.trim();
    if (!text || !chat || closedReason()) return;
    send(chat, 'text', text, '');
    input.value = '';
    input.style.height = '';
    input.focus();
  }
  $('#btn-send').onclick = sendText;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); sendText(); }
  });
  input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
  $('#btn-photo').onclick = async () => {
    if (!chat || closedReason()) return;
    const file = await pickFile();
    if (!file) return;
    toast('사진을 보내는 중이에요.');
    try {
      const p = await prepareImage(file, MAX_CHAT_PHOTO);
      if (!p.full) throw new Error();
      send(chat, 'image', '', p.full);
    } catch { toast('사진을 보내지 못했어요.'); }
  };

  // 메뉴 서랍
  function openDrawer() {
    if (!chat) return;
    drawerOpen = true;
    renderDrawer();
    const s = $('#scrim'), d = $('#drawer');
    s.hidden = false; d.hidden = false;
    requestAnimationFrame(() => { s.classList.add('show'); d.classList.add('show'); });
  }
  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    const s = $('#scrim'), d = $('#drawer');
    s.classList.remove('show'); d.classList.remove('show');
    setTimeout(() => { if (!drawerOpen) { s.hidden = true; d.hidden = true; } }, 230);
  }
  $('#scrim').onclick = closeDrawer;
  const photos = () => messages.filter((m) => m.type === 'image' && isB64(m.image));
  function renderDrawer() {
    const item = findItem(chat.itemId);
    const owner = item && item.ownerUid === S.uid;
    const closed = closedReason();
    const ps = photos();
    const recent = ps.slice(-6).reverse();
    const blockedByOther = chat.blockedBy && chat.blockedBy !== S.uid;
    const sub = `${kindLabel(chat.itemKind)}${item ? ' · ' + statusLabel(item) : ''} · 나는 ${myRole(chat)}`;
    $('#drawer').innerHTML = `<h3>채팅방 메뉴</h3>
      <a class="ditem" href="#/item/${safeId(chat.itemId)}">${thumbHtml(item ? item.id + item.updatedAt : 'chat' + chat.itemId, item ? item.thumb : chat.itemThumb)}<div style="flex:1;min-width:0"><b>${esc(chat.itemName)}</b><small>${esc(sub)}</small></div>${icon('chev', 'chev')}</a>
      <div class="ph-h"><span>사진 ${ps.length}</span>${ps.length > 6 ? '<button class="text-btn" data-a="all">모두 보기</button>' : ''}</div>
      ${recent.length ? `<div class="grid">${recent.map((m) => { const u = photoUrl('m' + m.id, m.image); return `<img src="${u}" alt="" data-photo="${u}">`; }).join('')}</div>` : '<p class="caption" style="padding:6px 20px 14px;margin:0">주고받은 사진이 여기에 모여요.</p>'}
      <div class="sep"></div>
      ${closed ? '' : '<button class="act" data-a="meet">약속 잡기</button>'}
      ${owner ? `<button class="act" data-a="resolve">${item.status === 'resolved' ? (isLost(item) ? '다시 찾는 중으로 바꾸기' : '다시 보관 중으로 바꾸기') : (isLost(item) ? '물건을 찾았어요' : '주인에게 돌려줬어요')}</button>` : ''}
      <button class="act" data-a="item">물건 정보 보기</button>
      <div class="sep"></div>
      <button class="act" data-a="report">신고하기</button>
      ${blockedByOther ? '' : `<button class="act" data-a="block">${chat.blockedBy === S.uid ? '차단 풀기' : '차단하기'}</button>`}
      <button class="act red" data-a="leave">채팅방 나가기</button>`;
  }
  $('#drawer').addEventListener('click', async (e) => {
    const img = e.target.closest('img[data-photo]');
    if (img) return showPhoto(img.dataset.photo);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const item = findItem(chat.itemId);
    if (a === 'all') return gallery();
    closeDrawer();
    if (a === 'item') location.hash = '#/item/' + safeId(chat.itemId);
    else if (a === 'meet') meet();
    else if (a === 'resolve' && item) {
      if (item.status === 'resolved') return setResolved(item, false);
      const k = await dialog({ text: `${isLost(item) ? '물건을 찾았다고' : '주인에게 물건을 돌려줬다고'} 표시할까요? 목록에서 '${isLost(item) ? '찾음' : '돌려줌'}'으로 바뀌어요.`, actions: [['cancel', '취소', 'muted'], ['ok', '표시하기']] });
      if (k === 'ok') { setResolved(item, true); send(chat, 'notice', isLost(item) ? '주인이 물건을 찾았다고 표시했어요.' : '주운 사람이 물건을 돌려줬다고 표시했어요.', ''); }
    } else if (a === 'report') {
      const reason = await askReason();
      if (!reason) return;
      report(otherUid(chat), chat.itemId, chat.id, reason);
      if (chat.blockedBy) return toast('신고했어요. 운영자가 확인할게요.');
      const k = await dialog({ title: '신고했어요', text: '운영자가 확인할게요. 이 사람과 더 대화하지 않으려면 차단할 수 있어요.', actions: [['cancel', '닫기', 'muted'], ['block', '차단하기', 'danger']] });
      if (k === 'block') updateDoc(chatRef, { blockedBy: S.uid }).catch(fail('바꾸지 못했어요.'));
    } else if (a === 'block') {
      if (chat.blockedBy === S.uid) { updateDoc(chatRef, { blockedBy: '' }).catch(fail('바꾸지 못했어요.')); return toast('차단을 풀었어요.'); }
      const k = await dialog({ title: '차단할까요?', text: '차단하면 이 대화에서 서로 메시지를 보낼 수 없어요. 메뉴에서 언제든 풀 수 있어요.', actions: [['cancel', '취소', 'muted'], ['ok', '차단', 'danger']] });
      if (k === 'ok') updateDoc(chatRef, { blockedBy: S.uid }).catch(fail('바꾸지 못했어요.'));
    } else if (a === 'leave') {
      const k = await dialog({ title: '채팅방을 나갈까요?', text: '대화 목록에서 사라지고, 상대도 더 이상 메시지를 보낼 수 없어요.', actions: [['cancel', '취소', 'muted'], ['ok', '나가기', 'danger']] });
      if (k === 'ok') { updateDoc(chatRef, { leftBy: arrayUnion(S.uid) }).catch(fail('나가지 못했어요.')); location.replace('#/chats'); }
    }
  });

  function gallery() {
    const ps = photos().slice().reverse();
    const v = document.createElement('div');
    v.className = 'dialog-bg';
    v.style.placeItems = 'stretch';
    v.style.padding = '0';
    v.innerHTML = `<div style="background:var(--surface);display:flex;flex-direction:column;height:100%"><header class="appbar" style="position:relative"><div class="left"><button class="icon-btn" aria-label="닫기" data-close>${icon('back')}</button></div><h1>사진 ${ps.length}장</h1></header>
      <div class="grid" style="overflow-y:auto;padding:4px">${ps.map((m) => { const u = photoUrl('m' + m.id, m.image); return `<img src="${u}" alt="" data-photo="${u}">`; }).join('')}</div></div>`;
    v.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return v.remove();
      const img = e.target.closest('img[data-photo]');
      if (img) showPhoto(img.dataset.photo);
    });
    document.body.appendChild(v);
  }

  async function meet() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 30), 0, 0);
    const body = `<label class="l" for="m-place">만날 장소</label><input class="input" id="m-place" maxlength="40" placeholder="예: 1층 교무실 앞">
      <label class="l" for="m-date">날짜</label><input class="input" id="m-date" type="date" min="${todayIso()}" value="${isoOf(now)}">
      <label class="l" for="m-time">시간</label><input class="input" id="m-time" type="time" value="${pad(now.getHours())}:${pad(now.getMinutes())}">`;
    let values = null;
    const k = await dialog({
      title: '약속 잡기', body, actions: [['cancel', '취소', 'muted'], ['ok', '보내기']],
      onOpen: {
        validate: (bg) => {
          const place = bg.querySelector('#m-place').value.trim();
          const date = bg.querySelector('#m-date').value, time = bg.querySelector('#m-time').value;
          if (!place) { toast('만날 장소를 적어 주세요.'); return false; }
          if (!date || !time) { toast('날짜와 시간을 골라 주세요.'); return false; }
          const [h, mi] = time.split(':').map(Number);
          const d = parseIso(date); d.setHours(h, mi, 0, 0);
          values = `${place}\n${fullDate(date)} ${clock(d.getTime())}`;
          return true;
        },
      },
    });
    if (k === 'ok' && values && chat && !closedReason()) send(chat, 'meet', values, '');
  }

  return {
    refresh: () => { if (chat) render(); },
    cleanup: () => { unsubChat(); if (unsubMsgs) unsubMsgs(); document.removeEventListener('visibilitychange', onVisible); },
  };
}

// ---------- 이용 방법 ----------
const GUIDE = [
  ['물건을 잃어버렸다면', true, [
    "'습득물' 탭에서 누가 이미 주워서 올려 두었는지 먼저 찾아보세요. 위쪽 종류 버튼이나 검색으로 좁힐 수 있어요.",
    "없으면 홈의 '분실물 신고'를 눌러 물건 이름, 종류, 잃어버린 장소와 날짜를 적어 올려요. 비슷한 사진이 있으면 같이 올리면 좋아요.",
    "내가 올린 글 아래 '비슷한 습득물'을 가끔 확인해 보세요. 비슷한 물건이 올라오면 거기에 보여요.",
    "내 물건 같으면 '제 물건이에요 · 채팅'을 눌러 주운 사람과 이야기하고, 채팅방 메뉴의 '약속 잡기'로 만날 장소와 시간을 정해요.",
    "돌려받았으면 내 글에서 '찾았어요'를 눌러 주세요. 다른 친구들이 헷갈리지 않아요."]],
  ['물건을 주웠다면', true, [
    '지갑, 휴대폰 같은 귀중품은 먼저 담임 선생님이나 교무실에 맡겨요.',
    "홈의 '습득물 등록'에서 물건 사진을 찍고, 주운 장소와 맡겨 둔 곳을 적어 올려요.",
    "주인이 채팅을 보내면 '채팅' 탭에 빨간 점이 생겨요. 돌려줄 장소와 시간을 정해요.",
    "돌려줬으면 글이나 채팅방 메뉴에서 '주인에게 돌려줬어요'를 눌러 주세요."]],
  ['채팅할 때 지켜 주세요', false, [
    '전화번호, 주소, 학번 같은 개인정보는 보내지 마세요.',
    '만날 때는 교무실 앞처럼 사람이 많은 학교 안 장소에서 만나요.',
    '불쾌한 말을 들었다면 채팅방 오른쪽 위 메뉴에서 신고하거나 차단할 수 있어요.']],
  ['자주 묻는 질문', false, [
    ['로그인해야 하나요?', "아니요. 처음 열면 익명 계정이 자동으로 만들어져서 바로 쓸 수 있어요. 원하면 아래 '계정'에서 이메일로 가입하거나 Google·카카오로 로그인할 수 있어요."],
    ['닉네임은 어떻게 바꾸나요?', "아래 '내 정보'에서 바꿀 수 있어요. 실명이나 학번은 쓰지 마세요."],
    ['브라우저 기록을 지우면 어떻게 되나요?', '가입하지 않았다면 익명 계정과 대화 목록이 사라져요. 이메일·Google·카카오로 로그인해 두면 다시 로그인해서 이어서 쓸 수 있어요.'],
    ['비밀번호를 잊었다면요?', "아래 '계정'을 눌러 로그인 화면의 '비밀번호 찾기'에서 재설정 메일을 받을 수 있어요. 로그인한 뒤에는 '비밀번호 변경'으로 바꿀 수 있어요."]]],
];
function guideHtml() {
  return GUIDE.map(([title, numbered, rows]) => `<div class="section-h" style="color:var(--text2);font-size:14px">${title}</div>
    <div class="section">${rows.map((r, i) => `<div class="step"><span class="no">${numbered ? i + 1 : '·'}</span><p>${Array.isArray(r) ? `<b>${esc(r[0])}</b><br>${esc(r[1])}` : esc(r)}</p></div>`).join('<div class="divider"></div>')}</div>`).join('');
}

// ---------- 계정 (선택): 로그인 화면 ----------
const providerOf = (id) => (auth.currentUser?.providerData || []).find((p) => p.providerId === id) || null;
const accountEmail = () => (providerOf('password') ? auth.currentUser.email : null);
const googleEmail = () => { const p = providerOf('google.com'); return p ? (p.email || 'Google 계정') : null; };
const kakaoLinked = () => !!S.uid && store.get('lf_kakao_uid') === S.uid;
const loggedIn = () => !!(accountEmail() || googleEmail() || kakaoLinked());
const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 100;
function passwordProblem(pw) {
  if (pw.length < 8) return '비밀번호는 8자 이상으로 만들어 주세요.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '비밀번호에 영문과 숫자를 함께 넣어 주세요.';
  return null;
}
function authError(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/email-already-in-use' || c === 'auth/credential-already-in-use' || c === 'auth/provider-already-linked') return "이미 가입된 이메일이에요. 로그인 화면에서 로그인해 주세요.";
  if (c === 'auth/weak-password' || c === 'auth/password-does-not-meet-requirements') return '비밀번호가 너무 쉬워요. 8자 이상, 영문과 숫자를 섞어 주세요.';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return '이메일이나 비밀번호가 맞지 않아요.';
  if (c === 'auth/too-many-requests') return '너무 여러 번 시도했어요. 잠시 뒤 다시 해 주세요.';
  if (c === 'auth/network-request-failed') return '인터넷 연결을 확인해 주세요.';
  if (c === 'auth/requires-recent-login') return '보안을 위해 다시 로그인한 뒤 해 주세요.';
  return '처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
}
function hasAnonymousData() {
  return !loggedIn() && (S.chats.length > 0 || S.items.some((r) => r.ownerUid === S.uid));
}
function afterLogin(method, message) {
  store.set('lf_last_login', method);
  toast(message);
  refresh();
  return true;
}

async function googleLogin(showError) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await linkWithPopup(auth.currentUser, provider);
    return afterLogin('google', 'Google 계정으로 로그인했어요. 지금 글과 대화는 그대로예요.');
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use') {
      const cred = GoogleAuthProvider.credentialFromError(e);
      const k = await dialog({ title: '이미 쓰던 계정이에요', text: '이 Google 계정은 다른 기기나 앱에서 이미 쓰던 계정이에요. 그 계정으로 바꾸면 그 계정의 글과 대화가 보이고, 지금 익명으로 올린 글과 대화는 여기서 더 이상 보이지 않아요.', actions: [['cancel', '취소', 'muted'], ['ok', '그 계정으로 바꾸기']] });
      if (k === 'ok' && cred) {
        try { await signInWithCredential(auth, cred); return afterLogin('google', 'Google 계정으로 바꿨어요.'); } catch (err) { showError(authError(err)); }
      }
    } else if (e.code === 'auth/popup-blocked') showError('팝업이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
    else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') showError(authError(e));
  }
  return false;
}

// 카카오: 카카오 로그인 페이지로 갔다가 ?code= 를 들고 이 페이지로 돌아옵니다.
const kakaoRedirectUri = () => location.origin + location.pathname;
function kakaoLogin(showError) {
  if (!kakaoRestKey || !authServer) return showError('카카오 로그인은 준비 중이에요. Google이나 이메일로 먼저 이용해 주세요.');
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { sessionStorage.setItem('lf_kakao_state', state); } catch { /* 무시 */ }
  location.href = 'https://kauth.kakao.com/oauth/authorize?response_type=code'
    + '&client_id=' + encodeURIComponent(kakaoRestKey)
    + '&redirect_uri=' + encodeURIComponent(kakaoRedirectUri())
    + '&state=' + encodeURIComponent(state);
}
async function finishKakaoRedirect() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code'), state = q.get('state');
  if (!code && !q.get('error')) return;
  let saved = null;
  try { saved = sessionStorage.getItem('lf_kakao_state'); sessionStorage.removeItem('lf_kakao_state'); } catch { /* 무시 */ }
  history.replaceState(null, '', location.pathname + location.hash);
  if (!code || !state || state !== saved) { if (code) toast('카카오 로그인을 다시 해 주세요.'); return; }
  toast('카카오 계정을 확인하고 있어요. 처음에는 30초쯤 걸릴 수 있어요.');
  try {
    await authReady;
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const r = await fetch(authServer + '/auth/kakao', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: kakaoRedirectUri(), idToken }),
    });
    const j = await r.json();
    if (!r.ok || !j.customToken) throw new Error('kakao');
    await signInWithCustomToken(auth, j.customToken);
    store.set('lf_kakao_uid', auth.currentUser.uid);
    store.set('lf_last_login', 'kakao');
    toast(j.switched ? '카카오로 쓰던 계정으로 바꿨어요.' : '카카오 계정으로 로그인했어요.');
    refresh();
  } catch {
    toast('카카오 로그인을 하지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
}

const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const KAKAO_BUBBLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M12 3.5C6.75 3.5 2.5 6.85 2.5 10.98c0 2.66 1.77 5 4.43 6.32l-.9 3.31c-.08.29.25.52.5.35l3.95-2.62c.49.05.99.08 1.52.08 5.25 0 9.5-3.35 9.5-7.48S17.25 3.5 12 3.5z"/></svg>';

const MAIL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20,4H4C2.9,4 2.01,4.9 2.01,6L2,18c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V6C22,4.9 21.1,4 20,4zM20,18H4V8l8,5 8,-5V18zM12,11L4,6h16L12,11z"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18,8h-1V6c0,-2.76 -2.24,-5 -5,-5S7,3.24 7,6v2H6c-1.1,0 -2,0.9 -2,2v10c0,1.1 0.9,2 2,2h12c1.1,0 2,-0.9 2,-2V10C20,8.9 19.1,8 18,8zM9,6c0,-1.66 1.34,-3 3,-3s3,1.34 3,3v2H9V6zM18,20H6V10h12V20zM12,17c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2z"/></svg>';
const EYE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12,4.5C7,4.5 2.73,7.61 1,12c1.73,4.39 6,7.5 11,7.5s9.27,-3.11 11,-7.5c-1.73,-4.39 -6,-7.5 -11,-7.5zM12,17c-2.76,0 -5,-2.24 -5,-5s2.24,-5 5,-5 5,2.24 5,5 -2.24,5 -5,5zM12,9c-1.66,0 -3,1.34 -3,3s1.34,3 3,3 3,-1.34 3,-3 -1.34,-3 -3,-3z"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12,7c2.76,0 5,2.24 5,5 0,0.65 -0.13,1.26 -0.36,1.83l2.92,2.92c1.51,-1.26 2.7,-2.89 3.43,-4.75 -1.73,-4.39 -6,-7.5 -11,-7.5 -1.4,0 -2.74,0.25 -3.98,0.7l2.16,2.16C10.74,7.13 11.35,7 12,7zM2,4.27l2.28,2.28 0.46,0.46C3.08,8.3 1.78,10.02 1,12c1.73,4.39 6,7.5 11,7.5 1.55,0 3.03,-0.3 4.38,-0.84l0.42,0.42L19.73,22 21,20.73 3.27,3 2,4.27zM7.53,9.8l1.55,1.55c-0.05,0.21 -0.08,0.43 -0.08,0.65 0,1.66 1.34,3 3,3 0.22,0 0.44,-0.03 0.65,-0.08l1.55,1.55c-0.67,0.33 -1.41,0.53 -2.2,0.53 -2.76,0 -5,-2.24 -5,-5 0,-0.79 0.2,-1.53 0.53,-2.2zM11.84,9.02l3.15,3.15 0.02,-0.16c0,-1.66 -1.34,-3 -3,-3l-0.17,0.01z"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z"/></svg>';

const LOGIN_MODES = {
  login: {
    title: '다시 만나서 반가워요', button: '로그인', bottom: ['아직 계정이 없으신가요?', '회원가입', 'signup'],
    fields: [['이메일', 'email', 'username', '이메일 주소를 입력하세요'], ['비밀번호', 'password', 'current-password', '비밀번호를 입력하세요']],
  },
  signup: {
    title: '회원가입', button: '가입하고 인증 메일 받기', bottom: ['이미 계정이 있으신가요?', '로그인', 'login'],
    sub: '지금 쓰던 글과 대화는 그대로 남아요.\n가입하면 인증 메일을 보내 드려요.',
    fields: [['이메일', 'email', 'email', '이메일 주소를 입력하세요'], ['비밀번호', 'password', 'new-password', '영문+숫자 8자 이상'], ['비밀번호 확인', 'password', 'new-password', '한 번 더 입력하세요']],
  },
  reset: {
    title: '비밀번호 찾기', button: '재설정 메일 받기', bottom: ['비밀번호가 생각났나요?', '로그인', 'login'],
    sub: '가입한 이메일을 적으면\n비밀번호를 새로 만드는 메일을 보내 드려요.',
    fields: [['이메일', 'email', 'email', '이메일 주소를 입력하세요']],
  },
  password: {
    title: '비밀번호 변경', button: '변경하기',
    sub: '지금 비밀번호를 확인한 뒤 새 비밀번호로 바꿔요.',
    fields: [['지금 비밀번호', 'password', 'current-password', '지금 비밀번호를 입력하세요'], ['새 비밀번호', 'password', 'new-password', '영문+숫자 8자 이상'], ['새 비밀번호 확인', 'password', 'new-password', '한 번 더 입력하세요']],
  },
};

/** 로그인 모달. 로그인 / 회원가입 / 비밀번호 찾기 / 비밀번호 변경을 카드 하나에서 바꿔 가며 보여 줍니다. */
function openLogin(startMode, { first = false } = {}) {
  const bg = document.createElement('div');
  bg.className = 'dialog-bg login-bg';
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });

  function render(mode) {
    const M = LOGIN_MODES[mode];
    const sub = mode === 'login'
      ? (first ? '로그인해 두면 휴대폰을 바꾸거나 앱에서도 내 글과 대화를 이어서 볼 수 있어요.\n로그인하지 않아도 바로 쓸 수 있어요.' : hasAnonymousData() ? '다른 기기에서 가입한 계정으로 로그인하면, 지금 익명으로 올린 글과 대화는 이 브라우저에서 더 이상 보이지 않아요.' : '계정에 로그인하고 글과 대화를 어디서든 이어서 보세요.')
      : M.sub;
    const last = store.get('lf_last_login') || '';
    bg.innerHTML = `<div class="login-card" role="dialog" aria-modal="true" aria-labelledby="lm-title">
      <button class="icon-btn lm-close" type="button" aria-label="닫기">${CLOSE_ICON}</button>
      <h2 id="lm-title">${esc(first && mode === 'login' ? '반가워요' : M.title)}</h2>
      <p class="lm-sub">${esc(sub)}</p>
      <form id="lm-form" novalidate>
        ${M.fields.map(([label, type, auto, hint], i) => `<label class="lm-label" for="lm${i}">${esc(label)}</label>
          <div class="lm-box">${type === 'email' ? MAIL_ICON : LOCK_ICON}<input id="lm${i}" type="${type}" placeholder="${esc(hint)}" autocomplete="${auto}" maxlength="${type === 'email' ? 100 : 64}">
          ${type === 'password' ? `<button class="lm-eye" type="button" data-eye="${i}" aria-label="비밀번호 보기">${EYE_OFF_ICON}</button>` : ''}</div>`).join('')}
        ${mode === 'login' ? '<div class="lm-forgot"><button type="button" data-mode="reset">비밀번호를 잊으셨나요?</button></div>' : ''}
        <div class="error" id="lm-err" hidden></div>
        <div class="lm-done" id="lm-done" hidden></div>
        <button class="btn primary lm-main" id="lm-main" type="submit">${esc(M.button)}</button>
      </form>
      ${mode === 'login' ? `<div class="lm-or"><span>또는</span></div>
      <div class="lm-sns">
        <button type="button" class="lm-google" id="lm-google">${GOOGLE_G}<span>Google</span>${last === 'google' ? '<i class="recent">최근 로그인</i>' : ''}</button>
        <button type="button" class="lm-kakao" id="lm-kakao">${KAKAO_BUBBLE}<span>카카오</span>${last === 'kakao' ? '<i class="recent">최근 로그인</i>' : ''}</button>
      </div>` : ''}
      ${M.bottom ? `<p class="lm-bottom">${esc(M.bottom[0])} <button type="button" data-mode="${M.bottom[2]}">${esc(M.bottom[1])}</button></p>` : ''}
      ${first && mode === 'login' ? '<button type="button" class="lm-skip" id="lm-skip">로그인 없이 시작하기</button>' : ''}
    </div>`;
    const card = bg.querySelector('.login-card');
    const err = card.querySelector('#lm-err'), done = card.querySelector('#lm-done'), main = card.querySelector('#lm-main');
    const showError = (m) => { err.textContent = m || ''; err.hidden = !m; };
    const showDone = (m) => {
      done.textContent = m; done.hidden = false;
      card.querySelectorAll('.lm-label, .lm-box, .lm-forgot').forEach((el) => { el.hidden = true; });
      showError(null);
      main.textContent = '확인';
      main.dataset.done = '1';
    };
    card.querySelector('.lm-close').onclick = close;
    const skip = card.querySelector('#lm-skip');
    if (skip) skip.onclick = close;
    card.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => render(b.dataset.mode); });
    card.querySelectorAll('[data-eye]').forEach((b) => {
      b.onclick = () => {
        const input = card.querySelector('#lm' + b.dataset.eye);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.innerHTML = show ? EYE_ICON : EYE_OFF_ICON;
        b.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
      };
    });
    const g = card.querySelector('#lm-google');
    if (g) g.onclick = async () => { if (await googleLogin(showError)) close(); };
    const k = card.querySelector('#lm-kakao');
    if (k) k.onclick = () => kakaoLogin(showError);
    const firstInput = card.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 30);

    card.querySelector('#lm-form').onsubmit = async (ev) => {
      ev.preventDefault();
      if (main.dataset.done) return close();
      if (!auth.currentUser) return showError('서버에 연결하는 중이에요. 잠시 뒤 다시 눌러 주세요.');
      const [a = '', b = '', c = ''] = M.fields.map((_, i) => card.querySelector('#lm' + i).value.trim());
      showError(null);
      const busy = (on) => { main.disabled = on; main.textContent = on ? '확인하는 중…' : M.button; };
      try {
        if (mode === 'signup') {
          if (!validEmail(a)) return showError('이메일 주소를 확인해 주세요.');
          const p = passwordProblem(b); if (p) return showError(p);
          if (b !== c) return showError('비밀번호 확인이 달라요.');
          busy(true);
          const r = await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(a, b));
          await sendEmailVerification(r.user).catch(() => {});
          busy(false);
          store.set('lf_last_login', 'email');
          refresh();
          showDone(`${a} 메일함에서 '이메일을 인증하세요' 메일의 링크를 눌러 주세요. 인증을 마치면 '이용 방법 › 내 정보'에서 '인증 확인'을 누르면 돼요.\n\n메일이 안 보이면 스팸함도 확인해 주세요.`);
        } else if (mode === 'reset') {
          if (!validEmail(a)) return showError('이메일 주소를 확인해 주세요.');
          busy(true);
          try { await sendPasswordResetEmail(auth, a); } catch (e) {
            if (e.code === 'auth/network-request-failed' || e.code === 'auth/too-many-requests') { busy(false); return showError(authError(e)); }
          }
          busy(false);
          // 가입 여부를 알려 주지 않도록 같은 안내를 보여 줍니다.
          showDone(`가입된 이메일이라면 ${a}로 비밀번호 재설정 메일을 보냈어요. 메일의 링크에서 새 비밀번호를 만든 뒤 로그인해 주세요.`);
        } else if (mode === 'password') {
          if (!accountEmail()) return showError('이메일로 가입한 계정에서만 바꿀 수 있어요.');
          if (!a) return showError('지금 비밀번호를 적어 주세요.');
          const p = passwordProblem(b); if (p) return showError(p);
          if (b !== c) return showError('새 비밀번호 확인이 달라요.');
          if (a === b) return showError('지금과 다른 비밀번호로 만들어 주세요.');
          busy(true);
          try { await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(accountEmail(), a)); } catch (e) {
            busy(false);
            return showError(e.code === 'auth/too-many-requests' ? authError(e) : '지금 비밀번호가 맞지 않아요.');
          }
          await updatePassword(auth.currentUser, b);
          busy(false);
          toast('비밀번호를 바꿨어요.');
          close();
        } else {
          if (!validEmail(a)) return showError('이메일 주소를 확인해 주세요.');
          if (!b) return showError('비밀번호를 적어 주세요.');
          busy(true);
          const r = await signInWithEmailAndPassword(auth, a, b);
          busy(false);
          if (!r.user.emailVerified) {
            await sendEmailVerification(r.user).catch(() => {});
            await signOut(auth);
            return showDone(`아직 인증하지 않은 계정이에요. ${a}로 인증 메일을 다시 보냈어요. 메일의 링크를 누른 뒤 다시 로그인해 주세요.`);
          }
          store.set('lf_last_login', 'email');
          toast('로그인했어요.');
          close();
        }
      } catch (e) {
        busy(false);
        showError(authError(e));
      }
    };
  }
  render(startMode);
}

function accountRows(email, google) {
  if (!email && !google && !kakaoLinked()) return '';
  const rows = [];
  if (email && !auth.currentUser.emailVerified) rows.push(['resend', '인증 메일 다시 보내기'], ['check', '인증 확인']);
  if (email) rows.push(['pw', '비밀번호 변경']);
  rows.push(['out', '로그아웃']);
  return rows.map(([k, label]) => `<div class="divider"></div><button class="row act-row ${k === 'out' ? 'red' : ''}" data-acct="${k}">${label}</button>`).join('');
}

async function accountAction(k) {
  const email = accountEmail();
  if (k === 'resend') sendEmailVerification(auth.currentUser).then(() => toast(`${email}로 인증 메일을 보냈어요.`)).catch((e) => toast(authError(e)));
  else if (k === 'check') {
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); toast('인증을 마쳤어요.'); } else toast('아직 인증되지 않았어요. 메일의 링크를 눌러 주세요.');
    } catch (e) { toast(authError(e)); }
    refresh();
  } else if (k === 'pw') openLogin('password');
  else if (k === 'out') {
    const ok = await dialog({ title: '로그아웃할까요?', text: '로그아웃하면 새 익명 계정으로 바뀌어요. 다시 같은 계정으로 로그인하면 지금 글과 대화가 돌아와요.', actions: [['cancel', '취소', 'muted'], ['ok', '로그아웃', 'danger']] });
    if (ok === 'ok') { store.set('lf_kakao_uid', ''); await signOut(auth); toast('로그아웃했어요.'); }
  }
}

// ---------- 내 정보 ----------
function meView() {
  setBar({ title: '이용 방법' });
  const render = () => {
    const mine = S.items.filter((r) => r.ownerUid === S.uid);
    const email = accountEmail(), google = googleEmail();
    const verified = !!auth.currentUser?.emailVerified;
    const acct = email
      ? { value: verified ? email : `${email} · 인증 필요`, color: verified ? 'var(--text2)' : 'var(--danger)',
        note: verified ? '이메일 계정으로 로그인되어 있어요. 다른 휴대폰이나 앱에서 같은 이메일로 로그인하면 글과 대화를 이어서 볼 수 있어요. 다른 사람에게는 이메일이 아니라 닉네임만 보여요.'
          : "메일함에서 '이메일을 인증하세요' 메일의 링크를 눌러 인증을 마쳐 주세요. 인증해야 다른 기기에서 이 계정으로 로그인할 수 있어요. 메일이 없으면 스팸함도 확인해 주세요." }
      : (google || kakaoLinked()) ? { value: google || '카카오 계정', color: 'var(--text2)', note: (google ? 'Google' : '카카오') + ' 계정으로 로그인되어 있어요. 다른 휴대폰이나 앱에서 같은 계정으로 로그인하면 글과 대화를 이어서 볼 수 있어요. 다른 사람에게는 이메일이 아니라 닉네임만 보여요.' }
        : { value: '로그인·회원가입', color: 'var(--accent)', note: '로그인 없이 익명 계정으로 쓰고 있어요. 이메일로 가입하거나 Google·카카오로 로그인해 두면 브라우저 기록을 지우거나 다른 기기·앱에서도 지금 글과 대화를 이어서 볼 수 있어요. 가입은 선택이에요.' };
    view.innerHTML = `<div class="page">${S.banned ? `<div class="ban-note"><b>이용이 제한된 계정이에요</b>글을 올리거나 채팅할 수 없어요. 사유: ${esc(S.banned)}</div>` : ''}${guideHtml()}
      <div class="section-h">내 정보</div>
      <div class="section"><button class="row" id="nick"><span class="grow">닉네임</span><span style="color:var(--text2)">${esc(nickname())}</span>${icon('chev', 'chev')}</button>
        <div class="divider"></div>
        <button class="row" id="account"><span>계정</span><span class="grow" style="text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${acct.color}">${esc(acct.value)}</span>${icon('chev', 'chev')}</button>${accountRows(email, google)}
        <p class="caption" style="padding:12px 16px 14px;margin:0">${esc(acct.note)}</p></div>
      <div class="section-h">내가 올린 물건</div>
      <div class="section list">${statusBlock() || (mine.length ? mine.map(itemRow).join('') : '<div class="empty">아직 올린 물건이 없어요.</div>')}</div>
      <div class="section-h">저장과 개인정보</div>
      <div class="section"><p style="margin:0;padding:13px 16px;color:var(--text2);font-size:14px">올린 물건과 채팅은 분실물 센터 서버(Google Firebase, 서울)에 저장돼요. 물건 글은 앱을 쓰는 사람 누구나 볼 수 있고, 채팅은 대화하는 두 사람만 볼 수 있어요. 불쾌한 글이나 대화는 신고해 주세요. 신고가 들어온 대화는 운영자가 확인할 수 있어요.</p></div>
      <div class="section-h">정보</div>
      <div class="section">${S.admin ? `<a class="row" href="#/admin">관리자 페이지<span class="grow"></span>${icon('chev', 'chev')}</a><div class="divider"></div>` : ''}<a class="row" href="../">앱 설치 안내<span class="grow"></span>${icon('chev', 'chev')}</a><div class="divider"></div>
        <a class="row" href="${HOMEPAGE}" target="_blank" rel="noopener">학교 홈페이지<span class="grow"></span>${icon('chev', 'chev')}</a><div class="divider"></div>
        <div class="row"><span class="grow">버전</span><span style="color:var(--text3)">웹 ${VERSION}</span></div></div>
    </div>`;
    $('#account').onclick = () => { if (!loggedIn()) openLogin('login'); };
    document.querySelectorAll('[data-acct]').forEach((b) => { b.onclick = () => accountAction(b.dataset.acct); });
    $('#nick').onclick = async () => {
      const body = '<p>채팅과 물건 글에 보이는 이름이에요. 실명이나 학번은 쓰지 마세요. (12자까지)</p><input class="input" id="nick-in" maxlength="12">';
      let value = '';
      const k = await dialog({
        title: '닉네임', body, actions: [['cancel', '취소', 'muted'], ['ok', '저장']],
        onOpen: {
          init: (bg) => { const i = bg.querySelector('#nick-in'); i.value = nickname(); i.select(); },
          validate: (bg) => { value = bg.querySelector('#nick-in').value.trim(); if (!value) { toast('닉네임을 적어 주세요.'); return false; } return true; },
        },
      });
      if (k === 'ok') { store.set('lf_nick', value); toast(`앞으로 올리는 글과 새 대화에 '${value}'(으)로 보여요.`); render(); }
    };
  };
  render();
  return { refresh: render };
}

// ---------- 관리자 ----------
const adminState = { tab: 'open' };
function adminView() {
  setBar({ title: '관리자', back: true });
  let reports = [], bans = [], loaded = false, problem = '';
  let unsubR = null, unsubB = null;
  const items = new Map(); // 목록(최근 150개) 밖의 글: id -> 물건 | null(삭제됨) | 'loading'
  const chats = new Map(); // id -> 대화 | null(볼 수 없음) | 'loading'

  function start() {
    if (!S.admin || unsubR) return;
    unsubR = onSnapshot(query(collection(db, 'abuseReports'), orderBy('at', 'desc'), limit(300)), (snap) => {
      reports = snap.docs.map((d) => {
        const x = d.data({ serverTimestamps: 'estimate' });
        return { id: d.id, targetUid: x.targetUid || '', itemId: x.itemId || '', chatId: x.chatId || '', reason: x.reason || '',
          detail: x.detail || '', at: ms(x.at), status: x.status === 'done' ? 'done' : 'open', handledAt: x.handledAt ? ms(x.handledAt) : 0 };
      });
      loaded = true; problem = ''; render();
    }, () => { unsubR = null; problem = '신고 목록을 불러오지 못했어요. 관리자 계정으로 로그인했는지 확인해 주세요.'; render(); });
    unsubB = onSnapshot(collection(db, 'bans'), (snap) => {
      bans = snap.docs.map((d) => { const x = d.data({ serverTimestamps: 'estimate' }); return { uid: d.id, reason: x.reason || '', at: ms(x.at) }; })
        .sort((a, b) => b.at - a.at);
      render();
    }, () => { unsubB = null; });
  }
  function stop() { if (unsubR) unsubR(); if (unsubB) unsubB(); unsubR = unsubB = null; }

  function itemOf(id) {
    if (!id) return null;
    const r = findItem(id);
    if (r) return r;
    if (!items.has(id)) {
      items.set(id, 'loading');
      getDoc(doc(db, 'items', id)).then((d) => { items.set(id, d.exists() ? itemFrom(d) : null); render(); })
        .catch(() => { items.set(id, null); render(); });
    }
    const v = items.get(id);
    return v === 'loading' ? null : v;
  }
  function chatOf(id) {
    if (!id) return null;
    if (!chats.has(id)) {
      chats.set(id, 'loading');
      getDoc(doc(db, 'chats', id)).then((d) => { chats.set(id, d.exists() ? chatFrom(d) : null); render(); })
        .catch(() => { chats.set(id, null); render(); });
    }
    const v = chats.get(id);
    return v === 'loading' ? null : v;
  }
  function nameOf(uid) {
    const r = S.items.find((x) => x.ownerUid === uid) || [...items.values()].find((x) => x && x !== 'loading' && x.ownerUid === uid);
    if (r) return r.ownerName;
    for (const c of chats.values()) {
      if (!c || c === 'loading') continue;
      if (c.ownerUid === uid) return c.ownerName;
      if (c.guestUid === uid) return c.guestName;
    }
    return '이름 모름';
  }
  const who = (uid) => `${nameOf(uid)} (${uid.slice(0, 6)})`;
  const banOf = (uid) => bans.find((b) => b.uid === uid);
  const stamp = (t) => `${briefMs(t)} ${clock(t)}`;

  function reportCard(r) {
    const item = itemOf(r.itemId), chat = chatOf(r.chatId);
    const count = reports.filter((x) => x.targetUid === r.targetUid).length;
    const ban = banOf(r.targetUid);
    const itemName = item ? item.name : chat ? chat.itemName : (items.get(r.itemId) === null ? '삭제된 글' : '불러오는 중…');
    const acts = [
      item ? ['item', '글 보기'] : null,
      r.chatId ? ['chat', '대화 보기'] : null,
      item && item.ownerUid === r.targetUid ? ['del', '글 삭제', 'red'] : null,
      ban ? ['unban', '제한 풀기'] : ['ban', '이용 제한', 'red'],
      r.status === 'done' ? ['reopen', '다시 열기'] : ['done', '처리 완료'],
    ].filter(Boolean);
    return `<div class="rep" data-id="${esc(r.id)}">
      <div class="rep-top"><span class="rep-kind">${r.chatId ? '대화 신고' : '글 신고'}</span><span>${stamp(r.at)}</span></div>
      <div class="rep-title">${esc(r.reason)}</div>
      ${line('물건', itemName)}
      ${line('신고 대상', `${who(r.targetUid)} · 신고 ${count}건${ban ? ' · 이용 제한 중' : ''}`)}
      ${line('내용', r.detail)}
      ${r.status === 'done' && r.handledAt ? line('처리', stamp(r.handledAt)) : ''}
      <div class="rep-acts">${acts.map(([a, label, cls]) => `<button class="text-btn ${cls || ''}" data-a="${a}">${label}</button>`).join('')}</div></div>`;
  }
  function banCard(b) {
    return `<div class="rep" data-uid="${esc(b.uid)}">
      <div class="rep-top"><span class="rep-kind">이용 제한</span><span>${stamp(b.at)}</span></div>
      <div class="rep-title">${esc(who(b.uid))}</div>
      ${line('사유', b.reason)}${line('받은 신고', reports.filter((x) => x.targetUid === b.uid).length + '건')}
      <div class="rep-acts"><button class="text-btn" data-a="unban">제한 풀기</button></div></div>`;
  }

  function render() {
    if (!S.admin) {
      stop();
      view.innerHTML = `<div class="empty-big">${S.adminChecked ? '관리자만 볼 수 있는 화면이에요.\n관리자 계정(Google 또는 인증을 마친 이메일)으로 로그인해 주세요.' : '확인하는 중…'}</div>
        ${S.adminChecked && !loggedIn() ? '<div style="text-align:center"><button class="btn primary" id="adm-login">로그인</button></div>' : ''}`;
      const b = $('#adm-login');
      if (b) b.onclick = () => openLogin('login');
      return;
    }
    start();
    const open = reports.filter((r) => r.status === 'open'), done = reports.filter((r) => r.status === 'done');
    const tabs = [['open', `처리할 신고 ${open.length}`], ['done', `처리한 신고 ${done.length}`], ['bans', `이용 제한 ${bans.length}`]];
    const t = adminState.tab;
    let body;
    if (problem) body = `<div class="empty-big">${esc(problem)}</div>`;
    else if (!loaded) body = '<div class="empty-big">불러오는 중…</div>';
    else if (t === 'bans') body = bans.length ? bans.map(banCard).join('') : '<div class="empty-big">이용을 제한한 계정이 없어요.</div>';
    else {
      const list = t === 'open' ? open : done;
      body = list.length ? list.map(reportCard).join('') : `<div class="empty-big">${t === 'open' ? '처리할 신고가 없어요.' : '처리한 신고가 없어요.'}</div>`;
    }
    view.innerHTML = `<div class="page">
      <div class="chips" id="adm-tabs">${tabs.map(([k, label]) => `<button class="chip ${t === k ? 'on' : ''}" data-t="${k}">${label}</button>`).join('')}</div>
      <p class="caption" style="margin:0;padding:10px 16px">신고가 들어온 대화만 열어 볼 수 있어요. 이용을 제한하면 그 계정은 글을 올리거나 채팅할 수 없어요.</p>
      <div id="adm-list">${body}</div></div>`;
    $('#adm-tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { adminState.tab = b.dataset.t; render(); } };
  }

  view.addEventListener('click', onClick);
  async function onClick(e) {
    const btn = e.target.closest('.rep [data-a]');
    if (!btn || !S.admin) return;
    const card = btn.closest('.rep'), a = btn.dataset.a;
    const r = reports.find((x) => x.id === card.dataset.id);
    const uid = r ? r.targetUid : card.dataset.uid;
    if (a === 'item') location.hash = '#/item/' + safeId(r.itemId);
    else if (a === 'chat') adminChat(r.chatId, r.targetUid, chatOf(r.chatId));
    else if (a === 'del') {
      const item = itemOf(r.itemId);
      if (!item) return;
      const k = await dialog({ title: '글을 삭제할까요?', text: `'${item.name}' 글과 사진을 지웁니다. 되돌릴 수 없어요.`, actions: [['cancel', '취소', 'muted'], ['del', '삭제', 'danger']] });
      if (k !== 'del') return;
      const batch = writeBatch(db);
      batch.delete(doc(db, 'items', item.id, 'photo', 'main'));
      batch.delete(doc(db, 'items', item.id));
      batch.commit().then(() => { items.set(item.id, null); toast('글을 삭제했어요.'); render(); }).catch(fail('삭제하지 못했어요.'));
    } else if (a === 'ban') {
      if (uid === S.uid) return toast('내 계정은 제한할 수 없어요.');
      let reason = '';
      const k = await dialog({
        title: '이용을 제한할까요?', body: `<p>${esc(who(uid))} 계정은 글을 올리거나 채팅할 수 없게 돼요. 언제든 풀 수 있어요.</p><label class="l" for="ban-in">사유 (본인에게 보여요)</label><input class="input" id="ban-in" maxlength="100">`,
        actions: [['cancel', '취소', 'muted'], ['ok', '제한하기', 'danger']],
        onOpen: {
          init: (bg) => { bg.querySelector('#ban-in').value = r ? r.reason : ''; },
          validate: (bg) => { reason = bg.querySelector('#ban-in').value.trim(); if (!reason) { toast('사유를 적어 주세요.'); return false; } return true; },
        },
      });
      if (k === 'ok') setDoc(doc(db, 'bans', uid), { reason, at: serverTimestamp(), by: S.uid }).then(() => toast('이용을 제한했어요.')).catch(fail('제한하지 못했어요.'));
    } else if (a === 'unban') {
      const k = await dialog({ text: `${who(uid)} 계정의 이용 제한을 풀까요?`, actions: [['cancel', '취소', 'muted'], ['ok', '풀기']] });
      if (k === 'ok') deleteDoc(doc(db, 'bans', uid)).then(() => toast('제한을 풀었어요.')).catch(fail('풀지 못했어요.'));
    } else if (a === 'done' || a === 'reopen') {
      updateDoc(doc(db, 'abuseReports', r.id), { status: a === 'done' ? 'done' : 'open', handledAt: serverTimestamp(), handledBy: S.uid })
        .then(() => toast(a === 'done' ? '처리한 신고로 옮겼어요.' : '처리할 신고로 옮겼어요.')).catch(fail('바꾸지 못했어요.'));
    }
  }

  render();
  return { refresh: render, cleanup: () => { stop(); view.removeEventListener('click', onClick); } };
}

/** 신고된 대화를 읽기 전용으로 보여 줍니다. */
async function adminChat(chatId, targetUid, known) {
  const v = document.createElement('div');
  v.className = 'dialog-bg';
  v.style.placeItems = 'stretch';
  v.style.padding = '0';
  v.innerHTML = `<div class="adm-chat"><header class="appbar" style="position:relative"><div class="left"><button class="icon-btn" aria-label="닫기" data-close>${icon('back')}</button></div><h1>대화 보기</h1></header>
    <p class="caption" id="adm-chat-sub" style="margin:0;padding:10px 16px;border-bottom:1px solid var(--line)"></p><div class="msgs" id="adm-msgs"><div class="notice" style="padding-top:40px">불러오는 중…</div></div></div>`;
  const close = () => { v.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  v.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const img = e.target.closest('img[data-photo]');
    if (img) showPhoto(img.dataset.photo);
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(v);
  const box = $('#adm-msgs', v);
  try {
    let chat = known;
    if (!chat) { const d = await getDoc(doc(db, 'chats', chatId)); if (!d.exists()) throw new Error('gone'); chat = chatFrom(d); }
    const snap = await getDocs(query(collection(db, 'chats', chatId, 'messages'), orderBy('at', 'asc'), limitToLast(300)));
    const name = (uid) => (uid === chat.ownerUid ? chat.ownerName + ' (글쓴 사람)' : uid === chat.guestUid ? chat.guestName + ' (말을 건 사람)' : '알 수 없음') + (uid === targetUid ? ' · 신고 대상' : '');
    $('#adm-chat-sub', v).textContent = `${kindLabel(chat.itemKind)} '${chat.itemName}' · ${chat.ownerName} ↔ ${chat.guestName}${chat.blockedBy ? ' · 차단됨' : ''}`;
    let html = '', prev = null;
    snap.docs.forEach((d) => {
      const x = d.data({ serverTimestamps: 'estimate' });
      const m = { id: d.id, sender: x.sender || '', type: x.type || 'text', text: x.text || '', image: x.image || '', at: ms(x.at) };
      const day = isoOf(new Date(m.at));
      if (!prev || isoOf(new Date(prev.at)) !== day) html += `<div class="day"><span>${fullDate(day)}</span></div>`;
      if (m.type === 'notice') html += `<div class="notice">${esc(m.text)}</div>`;
      else {
        if (!prev || prev.sender !== m.sender || prev.type === 'notice') html += `<div class="who ${m.sender === targetUid ? 'target' : ''}">${esc(name(m.sender))}</div>`;
        let body;
        if (m.type === 'image') { const u = photoUrl('m' + m.id, m.image); body = u ? `<img src="${u}" alt="보낸 사진" data-photo="${u}">` : ''; }
        else if (m.type === 'meet') { const [where, when] = m.text.split('\n'); body = `<div class="bubble"><span class="meet-label">약속</span>장소  ${esc(where)}\n시간  ${esc(when || '')}</div>`; }
        else body = `<div class="bubble">${esc(m.text)}</div>`;
        html += `<div class="msg">${body}<span class="tm">${clock(m.at)}</span></div>`;
      }
      prev = m;
    });
    box.innerHTML = html || '<div class="notice" style="padding-top:40px">주고받은 메시지가 없어요.</div>';
  } catch {
    box.innerHTML = '<div class="notice" style="padding-top:40px">이 대화를 열 수 없어요.\n삭제됐거나, 예전 버전 앱에서 신고되어 열람 표시가 없는 대화예요.</div>';
  }
}

// ---------- 설치 ----------
let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  if (store.get('lf_install_hide')) return;
  $('#banner').innerHTML = '<div class="banner"><span>앱으로 설치하면 바탕화면이나 시작 메뉴에서 바로 열 수 있어요.</span><button class="btn primary" id="install" style="height:36px">설치</button><button class="text-btn" id="install-x" style="color:var(--text3)">닫기</button></div>';
  $('#install').onclick = async () => { installEvent.prompt(); await installEvent.userChoice; $('#banner').innerHTML = ''; };
  $('#install-x').onclick = () => { store.set('lf_install_hide', '1'); $('#banner').innerHTML = ''; };
});
window.addEventListener('appinstalled', () => { $('#banner').innerHTML = ''; toast('설치했어요.'); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});

route();
finishKakaoRedirect();
authReady.then(() => {
  if (firstVisit && !loggedIn() && !document.querySelector('.login-bg')) openLogin('login', { first: true });
});
