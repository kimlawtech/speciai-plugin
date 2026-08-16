#!/usr/bin/env node
// SpeciAI Advisory MCP — 의존성 0 stdio 서버 (newline-delimited JSON-RPC 2.0)
//
// 모든 도구는 speciai 서버를 x-speciai-key로 호출한다. 키가 없거나 한도 초과면
// 서버가 401/402와 결제 안내를 내려주고, 여기서는 그대로 사용자에게 전달한다.
// LLM 호출은 하지 않는다 — 추론은 Claude Code 세션이, 근거·검증·과금은 서버가 담당.
//
// env:
//   SPECIAI_API_KEY   — https://speciai.team 설정에서 발급 (sk_spc_…)
//   SPECIAI_BASE_URL  — 기본 https://speciai.team (로컬 개발 시 http://localhost:3001)

import { createInterface } from 'node:readline';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 설정 우선순위: env → ~/.speciai/config.json (대시보드에서 저장 가능)
const CFG_DIR = join(homedir(), '.speciai');
let fileCfg = {};
try { fileCfg = JSON.parse(readFileSync(join(CFG_DIR, 'config.json'), 'utf8')); } catch { /* 없으면 무시 */ }

const BASE = (process.env.SPECIAI_BASE_URL || fileCfg.baseUrl || 'https://speciai.team').replace(/\/+$/, '');
const KEY = process.env.SPECIAI_API_KEY || fileCfg.apiKey || '';

// 이벤트 로그 — 로컬 대시보드(scripts/dashboard.mjs)가 tail한다. 실패해도 무시(best-effort).
function logEvent(tool, args, ok) {
  try {
    mkdirSync(CFG_DIR, { recursive: true });
    appendFileSync(join(CFG_DIR, 'events.jsonl'), JSON.stringify({
      ts: Date.now(), tool, domain: args?.domain || args?.target || null, ok,
    }) + '\n');
  } catch { /* 대시보드 없이도 동작 */ }
}

// ── 서버 호출 ──────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'x-speciai-key': KEY,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* XML 등 비JSON 응답 */ }
  return { status: res.status, json, text };
}

function gateMessage(r) {
  if (r.status === 401) {
    return '인증 실패: SPECIAI_API_KEY가 없거나 무효. https://speciai.team 설정 > CLI 키에서 발급 후 환경변수로 설정.';
  }
  if (r.status === 402) {
    const { plan, limit, paylink } = r.json || {};
    return `오늘 무료 한도(${limit}회, 플랜: ${plan}) 소진.\n업그레이드: ${paylink}\n(브라우저에서 열거나 휴대폰 카메라로 링크 QR 스캔)`;
  }
  return null;
}

// ── 법제처 DRF 응답(JSON) 유틸 ─────────────────────────────────────
// DRF JSON 구조가 종별로 달라 최상위 키를 벗겨 배열을 찾는다.
function drfRows(json, listKey) {
  if (!json || typeof json !== 'object') return [];
  const root = json[Object.keys(json)[0]] || {};
  const rows = root[listKey];
  if (!rows) return [];
  return Array.isArray(rows) ? rows : [rows];
}

async function lawSearch(target, query, display = 5) {
  const qs = new URLSearchParams({ target, query, type: 'JSON', display: String(display) });
  return api('GET', `/api/law/lawSearch.do?${qs}`);
}

// ── 도구 정의 ─────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'speciai_status',
    description: '자문팀 현황 대시보드 — 플랜·오늘 사용량·크레딧·구독 만료일·상품 목록. CLI에서 /speciai-advisory:status 로 호출.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'speciai_search',
    description: '법령·판례·해설 지식베이스(RAG) 검색. 자문 답변 전 근거 확보용. 무료 일 10회.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 질의 (한국어, 3자 이상)' },
        sourceType: { type: 'string', enum: ['statute', 'precedent', 'commentary', 'news'] },
        topK: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'speciai_law_search',
    description: '국가법령정보센터 실시간 검색 — 법령명·판례·법령해석례. RAG에 없는 최신 자료 확인용.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        target: { type: 'string', enum: ['law', 'prec', 'expc'], default: 'law', description: 'law=법령, prec=판례, expc=법령해석례' },
      },
      required: ['query'],
    },
  },
  {
    name: 'speciai_verify_citation',
    description: '인용 검증 게이트 — 답변·문서에 인용된 조문("근로기준법 제17조")·판례 사건번호("2023다12345")가 실존하는지 법제처에서 확인. 문서 최종본 전 필수.',
    inputSchema: {
      type: 'object',
      properties: {
        citations: { type: 'array', items: { type: 'string' }, description: '인용 문자열 배열 (최대 10건)' },
      },
      required: ['citations'],
    },
  },
  {
    name: 'speciai_brief',
    description: '전문 지침 수신 — 자문팀 에이전트·스킬이 작업 시작 전 반드시 호출해 작업 지침을 받는다. 에이전트: legal·labor·tax·finance·bizplan·verifier·criminal(변호사 에디션 전용). 스킬 워크플로우: skill_advisory·skill_bizplan·skill_status.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['legal', 'labor', 'tax', 'finance', 'bizplan', 'verifier', 'criminal', 'skill_advisory', 'skill_bizplan', 'skill_contract', 'skill_criminal', 'skill_status'],
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'speciai_team',
    description: '사용자의 팀 설정 조회 — 자문 시작 전 반드시 호출. 콘솔(localhost:4747)에서 설정한 에이전트 켜기/끄기·맞춤 지시·저장된 워크플로우를 반환한다. 꺼진 에이전트는 스폰하지 않고, 맞춤 지시는 해당 에이전트 프롬프트에 포함하며, 사용자가 워크플로우 이름을 부르면 그 단계 순서대로 실행한다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'speciai_paylink',
    description: '유료 기능 결제 링크·QR 생성 — 에이전트 구독(agent_labor 노무 49,000/월 · agent_ceo 사장님 올인원 99,000/월 · agent_lawyer 변호사 에디션 149,000/월) 또는 건단위 문서(doc_contract·doc_certmail·doc_opinion·doc_bizplan).',
    inputSchema: {
      type: 'object',
      properties: { product: { type: 'string' } },
      required: ['product'],
    },
  },
];

// ── 도구 실행 ─────────────────────────────────────────────────────
async function callTool(name, args) {
  if (name === 'speciai_status') {
    const r = await api('GET', '/api/plugin/status');
    const gate = gateMessage(r);
    if (gate) return { text: gate, isError: true };
    const s = r.json || {};
    const usage = (s.usage || []).map(u => `  ${u.tool}: ${u.count}/${s.limits?.[u.tool] ?? '-'}`).join('\n') || '  (오늘 사용 없음)';
    const sub = s.subscription
      ? `${s.subscription.plan} (${s.subscription.status}, ~${String(s.subscription.current_period_end || '').slice(0, 10)})`
      : '없음 (무료)';
    const packs = (s.packs || []).length ? s.packs.join('·') : '없음';
    const products = Object.entries(s.products || {})
      .map(([k, p]) => `  ${k}: ${p.name} — ${p.price.toLocaleString('ko-KR')}원`).join('\n');
    return {
      text: `[SpeciAI 자문팀 현황] ${s.usage_date}\n플랜: ${s.plan}\n활성 팩: ${packs}\n구독: ${sub}\n크레딧: ${s.credits ?? '-'}\n오늘 사용량:\n${usage}\n\n상품:\n${products}`,
    };
  }

  if (name === 'speciai_search') {
    const r = await api('POST', '/api/plugin/search', {
      query: args.query, sourceType: args.sourceType, topK: args.topK,
    });
    const gate = gateMessage(r);
    if (gate) return { text: gate, isError: true };
    if (!r.json?.success) return { text: `검색 실패: ${r.json?.error || r.status}`, isError: true };
    const hits = r.json.hits || [];
    if (!hits.length) return { text: '검색 결과 없음. 질의를 바꾸거나 speciai_law_search로 실시간 검색을 시도하세요.' };
    const body = hits.map((h, i) =>
      `[${i + 1}] (${h.source_type || '?'}, 유사도 ${Number(h.similarity || 0).toFixed(2)}) ${h.title || ''}\n${String(h.content || '').slice(0, 600)}`,
    ).join('\n\n');
    return { text: `${body}\n\n(남은 오늘 검색: ${r.json.remaining ?? '-'}회. 유사도 0.55 미만은 근거로 쓰지 말 것)` };
  }

  if (name === 'speciai_law_search') {
    const r = await lawSearch(args.target || 'law', args.query, 8);
    const gate = gateMessage(r);
    if (gate) return { text: gate, isError: true };
    const target = args.target || 'law';
    const rows = drfRows(r.json, target === 'law' ? 'law' : target === 'prec' ? 'prec' : 'expc');
    if (!rows.length) return { text: `검색 결과 없음: ${args.query}` };
    const body = rows.map((x, i) => target === 'prec'
      ? `[${i + 1}] ${x['사건명'] || ''} — ${x['사건번호'] || ''} (${x['법원명'] || ''} ${x['선고일자'] || ''})`
      : `[${i + 1}] ${x['법령명한글'] || x['안건명'] || ''} (${x['시행일자'] || x['회신일자'] || ''}) MST=${x['법령일련번호'] || '-'}`,
    ).join('\n');
    return { text: body };
  }

  if (name === 'speciai_verify_citation') {
    const citations = (args.citations || []).slice(0, 10);
    if (!citations.length) return { text: '검증할 인용이 없습니다.', isError: true };
    const r = await api('POST', '/api/plugin/verify', { citations });
    const gate = gateMessage(r);
    if (gate) return { text: gate, isError: true };
    if (!r.json?.success) return { text: `검증 실패: ${r.json?.error || r.status}`, isError: true };
    const results = r.json.results || [];
    const ok = results.filter(r2 => r2.verified).length;
    const body = results.map(r =>
      r.verified ? `✔ ${r.citation} — ${r.matched}` : `✘ ${r.citation} — ${r.reason}`,
    ).join('\n');
    return {
      text: `[인용 검증 ${ok}/${results.length} 통과]\n${body}${ok < results.length ? '\n\n✘ 항목은 본문에서 제거하거나 올바른 근거로 교체 후 재검증할 것.' : ''}`,
      isError: false,
    };
  }

  if (name === 'speciai_brief') {
    const r = await api('GET', `/api/plugin/brief/${encodeURIComponent(args.domain)}`);
    const gate = gateMessage(r);
    if (gate) return { text: gate, isError: true };
    if (r.status === 402 && r.json?.error === 'pack_required') {
      return { text: `이 지침(${args.domain})은 변호사 에디션 전용입니다.\n결제: ${r.json.paylink}`, isError: true };
    }
    if (!r.json?.success) return { text: `지침 수신 실패: ${r.json?.error || r.status}`, isError: true };
    return { text: r.json.brief };
  }

  if (name === 'speciai_team') {
    let team = {}, flows = [], company = null;
    try { team = JSON.parse(readFileSync(join(CFG_DIR, 'agents.json'), 'utf8')); } catch { /* 기본값 */ }
    try { flows = JSON.parse(readFileSync(join(CFG_DIR, 'workflows.json'), 'utf8')); } catch { /* 없음 */ }
    try { company = JSON.parse(readFileSync(join(CFG_DIR, 'company.json'), 'utf8')); } catch { /* 미입력 */ }
    // 콘솔 온보딩(본체 CompanyProfile)의 핵심만 요약 — 자문 시 사실관계 기본값으로 사용
    let companyTxt = '(미입력 — 콘솔 localhost:4747 첫 실행 온보딩에서 입력 가능)';
    if (company) {
      const b = company.basicInfo || {};
      const parts = [
        b.name && `회사명 ${b.name}`,
        company.userType && `유형 ${company.userType}`,
        b.foundingDate && `설립 ${b.foundingDate}`,
        b.address && `소재지 ${String(b.address).slice(0, 40)}`,
      ].filter(Boolean);
      const extra = JSON.stringify({ ...company, basicInfo: undefined }).slice(0, 600);
      companyTxt = `${parts.join(' · ') || '입력됨'}\n상세(JSON): ${extra}`;
    }
    // 콘솔은 본체 에이전트 레지스트리 id로 저장하며 name을 함께 기록한다.
    const label = (k, v) => (v?.name || k);
    const off = Object.entries(team).filter(([, v]) => v?.enabled === false).map(([k, v]) => label(k, v));
    const notes = Object.entries(team).filter(([, v]) => (v?.note || '').trim())
      .map(([k, v]) => `- ${label(k, v)}: ${v.note.trim()}`);
    const flowsTxt = flows.length
      ? flows.map(f => `- "${f.name}": ${(f.steps || []).join(' → ')}`).join('\n')
      : '(저장된 워크플로우 없음)';
    return {
      text: `[팀 설정]\n꺼진 에이전트: ${off.length ? off.join(', ') + ' — 스폰 금지' : '없음'}\n` +
        `맞춤 지시 (해당 에이전트 스폰 시 프롬프트에 그대로 포함할 것):\n${notes.length ? notes.join('\n') : '(없음)'}\n` +
        `저장된 워크플로우 (사용자가 이름을 부르면 이 순서대로 실행):\n${flowsTxt}\n` +
        `사업 정보 (자문 시 사실관계 기본값 — 되묻지 말고 활용):\n${companyTxt}`,
    };
  }

  if (name === 'speciai_paylink') {
    const r = await api('POST', '/api/plugin/paylink', { product: args.product });
    const gate = gateMessage(r);
    if (gate) return { text: gate, isError: true };
    if (!r.json?.success) {
      return { text: `알 수 없는 상품: ${args.product}\n가능: ${(r.json?.products || []).join(', ')}`, isError: true };
    }
    const p = r.json;
    const qrBlock = p.qr ? `\n\n${p.qr}\n(휴대폰 카메라로 QR 스캔 가능)` : '';
    return {
      text: `[결제] ${p.name} — ${p.price.toLocaleString('ko-KR')}원${p.kind === 'subscription' ? '/월' : ' (1건)'}\n${p.url}\n브라우저에서 링크를 열어 결제하세요. 결제 후 즉시 반영됩니다.${qrBlock}`,
    };
  }

  return { text: `Unknown tool: ${name}`, isError: true };
}

// ── JSON-RPC (stdio, newline-delimited) ───────────────────────────
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  line = line.trim();
  if (!line) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  if (req.method?.startsWith('notifications/')) return; // 알림은 무응답

  const reply = (result) => send({ jsonrpc: '2.0', id: req.id, result });
  try {
    if (req.method === 'initialize') {
      return reply({
        protocolVersion: req.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'speciai-advisory', version: '0.1.0' },
      });
    }
    if (req.method === 'ping') return reply({});
    if (req.method === 'tools/list') return reply({ tools: TOOLS });
    if (req.method === 'tools/call') {
      const { text, isError } = await callTool(req.params?.name, req.params?.arguments || {});
      logEvent(req.params?.name, req.params?.arguments, !isError);
      return reply({ content: [{ type: 'text', text }], isError: !!isError });
    }
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } });
  } catch (e) {
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: String(e?.message || e) } });
  }
});

console.error(`[speciai-advisory] ready · ${TOOLS.length} tools · ${BASE}${KEY ? '' : ' · (키 미설정 — 인증 필요 도구는 안내만 반환)'}`);
