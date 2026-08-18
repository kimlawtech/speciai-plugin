#!/usr/bin/env node
// SpeciAI 장부 엔진 — 은행·카드 거래내역 → 원장 → 손익·세무사 전달 CSV. 의존성 0.
//
// 사용법:
//   node jangbu.mjs seed                              # 서버에서 분류 룰·계정 시드 수신 (~/.speciai/jangbu/seed.json)
//   node jangbu.mjs import <file.csv> [--type bank|card] [--bank auto|kb|shinhan|woori|hana|ibk] [--account 별칭]
//   node jangbu.mjs add '<JSON행 배열>'                # OCR·PDF 판독분 직접 추가 (Claude가 추출한 표준행)
//   node jangbu.mjs classify                          # 룰 분류 실행, 미분류 목록 출력
//   node jangbu.mjs set <txId> <계정과목> [--learn '<정규식>']   # 수동 분류(+개인 룰 학습)
//   node jangbu.mjs list [--month YYYY-MM] [--unclassified]
//   node jangbu.mjs report [--month YYYY-MM] [--open] # 손익·계정별·거래처별 집계 CSV + HTML
//   node jangbu.mjs export-tax [--month YYYY-MM]      # 세무사 전달 CSV (표준 헤더)
//
// 표준 행: { id, date, counterparty, description, amount, direction(inflow|outflow),
//            account_id, source, cardLast, bizNo, account(계정과목), nts_account, nts_code }
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const DIR = join(homedir(), '.speciai', 'jangbu');
mkdirSync(DIR, { recursive: true });
const SEED_PATH = join(DIR, 'seed.json');
const LEDGER = join(DIR, 'ledger.jsonl');
const CUSTOM_RULES = join(DIR, 'custom-rules.json');

function loadConfig() {
  const base = process.env.SPECIAI_BASE_URL || 'https://speciai.team';
  let key = process.env.SPECIAI_API_KEY || '';
  if (!key) {
    try { key = JSON.parse(readFileSync(join(homedir(), '.speciai', 'config.json'), 'utf8')).apiKey || ''; } catch { /* 없음 */ }
  }
  return { base: base.replace(/\/+$/, ''), key };
}

function loadSeed() {
  if (!existsSync(SEED_PATH)) {
    console.error('시드 없음 — 먼저 실행: node jangbu.mjs seed');
    process.exit(1);
  }
  return JSON.parse(readFileSync(SEED_PATH, 'utf8'));
}

function loadLedger() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function saveLedger(rows) {
  writeFileSync(LEDGER, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

// ── 마스킹: 주민번호는 저장 전 즉시 마스킹, 카드번호는 뒷자리만 유지 ──
function maskRow(r) {
  const rrn = /(\d{6})[- ]?([1-4]\d{6})/g;
  for (const f of ['counterparty', 'description']) {
    if (r[f]) r[f] = String(r[f]).replace(rrn, '$1-*******').replace(/\b(\d{4})[- ]\d{4}[- ]\d{4}[- ](\d{4})\b/g, '$1-****-****-$2');
  }
  return r;
}

function txId(r) {
  return 'tx_' + createHash('sha256').update(`${r.date}|${r.counterparty}|${r.amount}|${r.direction}|${r.account_id || ''}`).digest('hex').slice(0, 16);
}

function toAmount(s) {
  if (s == null) return 0;
  let t = String(s).replace(/[,\s원]/g, '');
  if (!t) return 0;
  if (t.startsWith('(') && t.endsWith(')')) t = '-' + t.slice(1, -1);
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function normDate(s) {
  if (!s) return '';
  s = String(s).trim();
  let m = s.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = s.match(/(20\d{2})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s.slice(0, 10);
}

// ── CSV 파싱 (인용부호·EUC-KR 대응) ─────────────────────────────────
function decodeKorean(buf) {
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try { return new TextDecoder('euc-kr').decode(buf); } catch { return utf8; }
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(v => v.trim() !== '')) rows.push(row); }
  return rows;
}

function resolveColumn(cols, candidates) {
  for (const cand of candidates) { const hit = cols.find(c => c.trim() === cand); if (hit) return hit; }
  for (const cand of candidates) { const hit = cols.find(c => c.includes(cand)); if (hit) return hit; }
  return null;
}

function detectBank(cols, maps) {
  const joined = cols.join(' ');
  if (joined.includes('찾으신금액') || joined.includes('맡기신금액')) return 'woori';
  if (joined.includes('거래후잔액') && joined.includes('받으신분')) return 'shinhan';
  return 'generic';
}

// 헤더 행 탐색: 은행 CSV는 상단에 안내문이 있는 경우가 많다
function findHeaderRow(rows, maps) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cols = rows[i].map(c => c.trim());
    const bank = detectBank(cols, maps);
    const cmap = maps[bank] || maps.generic;
    const hasDate = resolveColumn(cols, cmap.date);
    const hasAmt = resolveColumn(cols, cmap.inflow) || resolveColumn(cols, cmap.outflow);
    if (hasDate && hasAmt) return i;
  }
  return 0;
}

function importBankCsv(path, seed, opts) {
  const rows = parseCsv(decodeKorean(readFileSync(path)));
  const hIdx = findHeaderRow(rows, seed.bankMaps);
  const header = rows[hIdx].map(c => c.trim());
  const bank = opts.bank && opts.bank !== 'auto' ? opts.bank : detectBank(header, seed.bankMaps);
  const cmap = seed.bankMaps[bank] || seed.bankMaps.generic;
  const col = k => { const name = resolveColumn(header, cmap[k] || []); return name ? header.indexOf(name) : -1; };
  const iDate = col('date'), iDesc = col('desc'), iIn = col('inflow'), iOut = col('outflow');
  if (iDate < 0 || (iIn < 0 && iOut < 0)) {
    console.error(`컬럼 탐지 실패 (bank=${bank}). 헤더: ${header.join(', ')}`);
    process.exit(1);
  }
  const out = [];
  for (const r of rows.slice(hIdx + 1)) {
    const inflow = iIn >= 0 ? toAmount(r[iIn]) : 0;
    const outflow = iOut >= 0 ? toAmount(r[iOut]) : 0;
    if (!inflow && !outflow) continue;
    let direction = inflow > 0 ? 'inflow' : 'outflow';
    let amount = inflow > 0 ? inflow : outflow;
    if (amount < 0) { amount = Math.abs(amount); direction = direction === 'inflow' ? 'outflow' : 'inflow'; }
    const desc = iDesc >= 0 ? String(r[iDesc] || '').trim() : '';
    out.push(maskRow({
      date: normDate(r[iDate]), counterparty: desc, description: desc,
      amount, direction, account_id: opts.account || `bank-${bank}`, source: 'bank_csv',
    }));
  }
  return { bank, rows: out };
}

// 카드 CSV(카드사 이용내역 다운로드): 컬럼명이 제각각 — generic 매핑 + 가맹점 우선
const CARD_COLS = {
  date: ['이용일자', '이용일시', '승인일자', '거래일자', '매출일자', '이용일'],
  merchant: ['가맹점명', '이용가맹점', '가맹점', '이용하신곳', '거래처'],
  amount: ['이용금액', '승인금액', '거래금액', '합계', '금액'],
  bizNo: ['사업자번호', '가맹점사업자번호', '사업자등록번호'],
  cardNo: ['카드번호', '이용카드'],
  product: ['이용구분', '거래구분', '결제방법'],
};

function importCardCsv(path, opts) {
  const rows = parseCsv(decodeKorean(readFileSync(path)));
  let hIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cols = rows[i].map(c => c.trim());
    if (resolveColumn(cols, CARD_COLS.date) && resolveColumn(cols, CARD_COLS.amount)) { hIdx = i; break; }
  }
  const header = rows[hIdx].map(c => c.trim());
  const col = k => { const name = resolveColumn(header, CARD_COLS[k]); return name ? header.indexOf(name) : -1; };
  const iDate = col('date'), iMer = col('merchant'), iAmt = col('amount'), iBiz = col('bizNo'), iCard = col('cardNo');
  if (iDate < 0 || iAmt < 0) {
    console.error(`카드 CSV 컬럼 탐지 실패. 헤더: ${header.join(', ')}`);
    process.exit(1);
  }
  const out = [];
  for (const r of rows.slice(hIdx + 1)) {
    const amount = toAmount(r[iAmt]);
    if (!amount) continue;
    const merchant = iMer >= 0 ? String(r[iMer] || '').trim() : '';
    const cardRaw = iCard >= 0 ? String(r[iCard] || '') : '';
    const last4 = (cardRaw.match(/(\d{3,4})\s*$/) || [])[1] || '';
    out.push(maskRow({
      date: normDate(r[iDate]), counterparty: merchant, description: merchant,
      amount: Math.abs(amount), direction: amount < 0 ? 'inflow' : 'outflow',
      account_id: opts.account || 'card', source: 'card_csv',
      cardLast: last4, bizNo: iBiz >= 0 ? String(r[iBiz] || '').replace(/[^0-9]/g, '') : '',
    }));
  }
  return { rows: out };
}

// ── 분류 ──────────────────────────────────────────────────────────
function loadRules(seed) {
  let custom = [];
  try { custom = JSON.parse(readFileSync(CUSTOM_RULES, 'utf8')); } catch { /* 없음 */ }
  // 개인 학습 룰이 시드보다 우선
  return [...custom, ...seed.rules].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
}

function classifyRow(row, rules) {
  for (const rule of rules) {
    const target = rule.pattern_type === 'description_regex' ? row.description : row.counterparty;
    if (!target) continue;
    let re;
    try { re = new RegExp(rule.pattern, 'i'); } catch { continue; }
    if (!re.test(target)) continue;
    if (rule.amount_min != null && row.amount < rule.amount_min) continue;
    if (rule.amount_max != null && row.amount >= rule.amount_max) continue;
    return rule.internal_account;
  }
  return null;
}

function applyNts(row, seed) {
  const acc = seed.accounts.find(a => a.internal_account === row.account);
  if (acc) { row.nts_account = acc.nts_account; row.nts_code = acc.nts_code; row.statement = acc.statement; }
  return row;
}

// ── 명령 ──────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; }
  else args.push(rest[i]);
}

async function main() {
  if (cmd === 'seed') {
    const { base, key } = loadConfig();
    if (!key) { console.error('SPECIAI_API_KEY 없음 — 콘솔 로그인 또는 env 설정 필요'); process.exit(1); }
    const r = await fetch(`${base}/api/plugin/jangbu/seed`, { headers: { 'x-speciai-key': key } });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { console.error(`시드 수신 실패 (HTTP ${r.status}): ${j.error || ''}${j.paylink ? '\n결제: ' + j.paylink : ''}`); process.exit(1); }
    writeFileSync(SEED_PATH, JSON.stringify(j.seed));
    console.log(`시드 저장 완료 — 분류 룰 ${j.seed.rules.length}개, 계정과목 ${j.seed.accounts.length}개 (${SEED_PATH})`);
    return;
  }

  if (cmd === 'import') {
    const seed = loadSeed();
    const file = resolve(args[0] || '');
    if (!existsSync(file)) { console.error(`파일 없음: ${file}`); process.exit(1); }
    const type = flags.type || (/카드|card/i.test(file) ? 'card' : 'bank');
    const res = type === 'card' ? importCardCsv(file, flags) : importBankCsv(file, seed, flags);
    const ledger = loadLedger();
    const seen = new Set(ledger.map(r => r.id));
    let added = 0;
    for (const row of res.rows) {
      row.id = txId(row);
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      ledger.push(row); added++;
    }
    saveLedger(ledger);
    console.log(`가져오기 완료 — ${type}${res.bank ? ` (${res.bank})` : ''}: 신규 ${added}건 / 중복 제외 ${res.rows.length - added}건 / 원장 총 ${ledger.length}건`);
    return;
  }

  if (cmd === 'add') {
    const rows = JSON.parse(args[0] || '[]');
    const ledger = loadLedger();
    const seen = new Set(ledger.map(r => r.id));
    let added = 0;
    for (const raw of rows) {
      const row = maskRow({ source: 'manual', ...raw, amount: toAmount(raw.amount), date: normDate(raw.date) });
      row.id = row.id || txId(row);
      if (seen.has(row.id)) continue;
      seen.add(row.id); ledger.push(row); added++;
    }
    saveLedger(ledger);
    console.log(`추가 완료 — 신규 ${added}건 / 원장 총 ${ledger.length}건`);
    return;
  }

  if (cmd === 'classify') {
    const seed = loadSeed();
    const rules = loadRules(seed);
    const ledger = loadLedger();
    let hit = 0;
    const misses = [];
    for (const row of ledger) {
      if (row.account) continue;
      const acc = classifyRow(row, rules);
      if (acc) { row.account = acc; applyNts(row, seed); hit++; }
      else misses.push(row);
    }
    saveLedger(ledger);
    console.log(`룰 분류: ${hit}건 자동 분류, 미분류 ${misses.length}건`);
    if (misses.length) {
      console.log('\n[미분류 — 계정과목 판단 필요. 개인정보 없는 요약]');
      for (const m of misses.slice(0, 40)) console.log(`${m.id} | ${m.date} | ${m.counterparty} | ${m.amount.toLocaleString('ko-KR')}원 | ${m.direction}`);
      if (misses.length > 40) console.log(`… 외 ${misses.length - 40}건 (list --unclassified 로 전체)`);
      console.log(`\n사용 가능한 계정과목: ${seed.accounts.filter(a => a.statement === 'PL').map(a => a.internal_account).join(', ')}`);
    }
    return;
  }

  if (cmd === 'set') {
    const seed = loadSeed();
    const [id, account] = args;
    const ledger = loadLedger();
    const row = ledger.find(r => r.id === id);
    if (!row) { console.error(`거래 없음: ${id}`); process.exit(1); }
    if (!seed.accounts.some(a => a.internal_account === account)) console.log(`(경고) 표준 계정 밖의 계정과목: ${account}`);
    row.account = account; applyNts(row, seed);
    saveLedger(ledger);
    if (flags.learn) {
      let custom = [];
      try { custom = JSON.parse(readFileSync(CUSTOM_RULES, 'utf8')); } catch { /* 없음 */ }
      custom.push({ pattern_type: 'counterparty_regex', pattern: flags.learn === true ? row.counterparty : flags.learn, internal_account: account, priority: 5 });
      writeFileSync(CUSTOM_RULES, JSON.stringify(custom, null, 1));
      console.log(`분류 저장 + 개인 룰 학습 (${custom.length}개)`);
    } else console.log('분류 저장 완료');
    return;
  }

  if (cmd === 'list') {
    const ledger = loadLedger().filter(r =>
      (!flags.month || String(r.date).startsWith(flags.month)) &&
      (!flags.unclassified || !r.account));
    for (const r of ledger) console.log(`${r.id} | ${r.date} | ${r.counterparty} | ${r.direction === 'inflow' ? '+' : '-'}${r.amount.toLocaleString('ko-KR')} | ${r.account || '(미분류)'}`);
    console.log(`총 ${ledger.length}건`);
    return;
  }

  if (cmd === 'report') {
    const seed = loadSeed();
    const ledger = loadLedger().filter(r => !flags.month || String(r.date).startsWith(flags.month));
    const label = flags.month || '전체';
    const inflow = ledger.filter(r => r.direction === 'inflow');
    const outflow = ledger.filter(r => r.direction === 'outflow');
    const sum = rows => rows.reduce((s, r) => s + r.amount, 0);
    const byAccount = {};
    for (const r of outflow) { const k = r.account || '(미분류)'; byAccount[k] = (byAccount[k] || 0) + r.amount; }
    const byMonth = {};
    for (const r of ledger) {
      const m = String(r.date).slice(0, 7);
      byMonth[m] = byMonth[m] || { inflow: 0, outflow: 0 };
      byMonth[m][r.direction] += r.amount;
    }
    const won = n => n.toLocaleString('ko-KR');
    console.log(`[손익 요약 — ${label}]`);
    console.log(`수입: ${won(sum(inflow))}원 / 지출: ${won(sum(outflow))}원 / 순액: ${won(sum(inflow) - sum(outflow))}원`);
    console.log('\n[계정과목별 지출]');
    for (const [k, v] of Object.entries(byAccount).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${won(v)}원`);
    console.log('\n[월별]');
    for (const [m, v] of Object.entries(byMonth).sort()) console.log(`  ${m}: +${won(v.inflow)} / -${won(v.outflow)} / 순 ${won(v.inflow - v.outflow)}`);
    // CSV 저장
    const csv = ['월,수입,지출,순액', ...Object.entries(byMonth).sort().map(([m, v]) => `${m},${v.inflow},${v.outflow},${v.inflow - v.outflow}`)].join('\n');
    const csvPath = join(DIR, `report_${label.replace(/[^0-9A-Za-z가-힣-]/g, '')}.csv`);
    writeFileSync(csvPath, '﻿' + csv);
    console.log(`\nCSV: ${csvPath}`);
    if (flags.open) {
      const cmd2 = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(cmd2, process.platform === 'win32' ? ['/c', 'start', '', csvPath] : [csvPath], { detached: true, stdio: 'ignore' }).unref();
    }
    return;
  }

  if (cmd === 'export-tax') {
    const seed = loadSeed();
    const ledger = loadLedger().filter(r => !flags.month || String(r.date).startsWith(flags.month));
    const header = seed.taxCsvHeader.join(',');
    const esc = v => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = ledger.map(r => {
      const vatRate = r.statement === 'PL' && r.direction === 'outflow' ? 0.1 : 0; // 부가세 추정치 — 세무사 확인 필요 표기
      const supply = vatRate ? Math.round(r.amount / 1.1) : r.amount;
      const vat = r.amount - supply;
      return [r.date, r.counterparty, r.bizNo || '', r.description || '', r.account || '미분류', r.nts_account || '', r.nts_code || '', supply, vatRate ? vat : 0, r.amount, r.source === 'card_csv' ? '카드매출전표' : '통장거래', r.source === 'card_csv' ? '카드' : '이체'].map(esc).join(',');
    });
    const out = join(DIR, `세무사전달_${flags.month || '전체'}.csv`);
    writeFileSync(out, '﻿' + header + '\n' + lines.join('\n'));
    console.log(`세무사 전달 CSV: ${out} (${ledger.length}건)\n주의: 부가세 컬럼은 10% 역산 추정치 — 적격증빙 여부는 세무사 확인 필요`);
    return;
  }

  console.log(`사용법:
  node jangbu.mjs seed
  node jangbu.mjs import <file.csv> [--type bank|card] [--bank auto|kb|shinhan|woori|hana|ibk] [--account 별칭]
  node jangbu.mjs add '<JSON행배열>'
  node jangbu.mjs classify
  node jangbu.mjs set <txId> <계정과목> [--learn [정규식]]
  node jangbu.mjs list [--month YYYY-MM] [--unclassified]
  node jangbu.mjs report [--month YYYY-MM] [--open]
  node jangbu.mjs export-tax [--month YYYY-MM]`);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
