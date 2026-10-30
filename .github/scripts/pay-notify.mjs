// LOTV 잔금 안내 텔레그램 알림
// 매주 금요일 아침 깃허브가 자동으로 실행 → 계약서 보관함을 읽어 잔금 안내할 예식을 텔레그램 단체방으로 보냄
// 계산 기준은 contract.html 보관함과 같음
//  · 대상: 계약완 + 잔금 남음 + '잔금 받음' 체크 안 됨
//  · 안내일(잔금 정산일): 예식이 속한 주(월~일)의 전주 금요일
//  · 계약금: 25만원 이상이면 10만원, 그 미만이면 전액 (보관함에서 직접 적은 계약금이 있으면 그 금액)

const API_KEY = 'AIzaSyCP5wakGnA9ToM_NvYE9w2NCTVN3nNXzLc';
const PROJECT = 'lotv-d8904';
const NOTIFY_EMAIL = process.env.LOTV_NOTIFY_EMAIL || 'notify@lotv.co.kr';
const NOTIFY_PASSWORD = process.env.LOTV_NOTIFY_PASSWORD;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MODE = process.env.MODE || 'weekly'; // weekly | test

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = n => String(n).padStart(2, '0');

function need(v, name) {
  if (!v) { console.error(`깃허브 비밀값 ${name} 이(가) 비어 있습니다.`); process.exit(1); }
}

/* 한국 시간 기준 오늘 (YYYY-MM-DD) */
function todayKST() {
  const t = new Date(Date.now() + 9 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function dow(date) { return DAY_KO[new Date(date + 'T00:00:00Z').getUTCDay()]; }
function noticeDateOf(date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, -((dow + 6) % 7) - 3);
}
function shortDate(date) { return `${date.slice(5, 7)}.${date.slice(8, 10)}(${dow(date)})`; }

function priceNum(v) { const n = String(v || '').replace(/[^\d]/g, ''); return n ? Number(n) : 0; }
function won(n) { return n.toLocaleString('ko-KR') + '원'; }
function depositOf(c) {
  const price = priceNum(c.price);
  if (c.deposit !== undefined && c.deposit !== null && String(c.deposit).trim() !== '') return Math.min(priceNum(c.deposit), price);
  if (price >= 250000) return 100000;
  return price;
}
function balanceOf(c) { return Math.max(priceNum(c.price) - depositOf(c), 0); }

/* 파이어스토어 값 → 일반 값 */
function plain(f) {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('nullValue' in f) return null;
  return undefined;
}

async function signIn() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: NOTIFY_EMAIL, password: NOTIFY_PASSWORD, returnSecureToken: true })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('알림용 계정 로그인 실패: ' + (j.error && j.error.message));
  return j.idToken;
}

async function loadContracts(idToken) {
  const out = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/contracts?pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    const j = await r.json();
    if (!r.ok) throw new Error('보관함 읽기 실패 (파이어베이스 규칙 확인): ' + (j.error && j.error.message));
    (j.documents || []).forEach(d => {
      const c = {};
      for (const k in (d.fields || {})) c[k] = plain(d.fields[k]);
      out.push(c);
    });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

// 받는 사람이 여러 명이면 비밀값에 쉼표로 이어서 넣음 (예: 12345,67890)
async function sendTelegram(text) {
  const ids = String(CHAT_ID).split(',').map(x => x.trim()).filter(Boolean);
  for (const id of ids) {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: id, text, disable_web_page_preview: true })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`텔레그램 보내기 실패 (${id}): ` + j.description);
  }
}

function line(c, today) {
  const late = c.date < today ? '  ⚠️ 예식 지남' : '';
  return `• ${shortDate(c.date)} ${c.time || ''}  ${c.name || ''}` + (c.venue ? `\n   ${c.venue}` : '') + `\n   잔금 ${won(balanceOf(c))}${late}`;
}

async function main() {
  need(NOTIFY_PASSWORD, 'LOTV_NOTIFY_PASSWORD');
  need(BOT_TOKEN, 'TELEGRAM_BOT_TOKEN');
  need(CHAT_ID, 'TELEGRAM_CHAT_ID');

  const today = todayKST();
  const idToken = await signIn();
  const contracts = await loadContracts(idToken);

  const base = contracts.filter(c => c.status === 'done' && balanceOf(c) > 0 && !c.balancePaid && c.date);
  const sortKey = c => c.date + (c.time || '');
  // 예식이 30일 넘게 지난 건은 알림에서 뺌 (보관함 '잔금 미수'에서는 계속 보임)
  const due = base.filter(c => noticeDateOf(c.date) <= today && c.date >= addDays(today, -30)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const nextWeek = addDays(today, 7);
  const soon = base.filter(c => noticeDateOf(c.date) > today && noticeDateOf(c.date) <= nextWeek)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  let text = `💰 LOTV 잔금 안내 (${shortDate(today)})\n\n`;
  if (due.length) {
    const sum = due.reduce((s, c) => s + balanceOf(c), 0);
    text += `오늘 안내·확인할 예식 ${due.length}건 · 합계 ${won(sum)}\n\n`;
    text += due.map(c => line(c, today)).join('\n\n');
  } else {
    text += '오늘 안내할 잔금이 없습니다.';
  }
  if (soon.length) {
    text += `\n\n다음 주 안내 예정: ` + soon.map(c => `${shortDate(c.date)} ${c.name || ''}`).join(', ');
  }
  text += `\n\n잔금을 받으면 계약서 보관함에서 [잔금 미수] → '잔금 받음'으로 바꿔 주세요.\nhttps://www.lotv.co.kr/contract.html#archive`;
  if (MODE === 'test') text = '🔧 시험 발송입니다.\n\n' + text;

  await sendTelegram(text);
  console.log(`보냄: 대상 ${due.length}건, 다음 주 ${soon.length}건`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
