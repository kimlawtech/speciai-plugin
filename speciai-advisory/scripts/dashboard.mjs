#!/usr/bin/env node
// SpeciAI 자문팀 — 사용자 콘솔 (의존성 0, SPA)
//
// 실행: node dashboard.mjs   → http://localhost:4747
//
// 웹 서비스와 같은 페이지 구조:
//  내 팀        에이전트 카드(실아바타) — 켜기/끄기·맞춤 지시. CLI 자문에 실반영
//  채팅         상담 데스크 — 서버 LLM, 마스킹 적용, 무료 일 5회
//  워크플로우   빌더 + 저장 목록 — CLI에서 "워크플로우 [이름] 실행"
//  문서함       완성 문서 A4 미리보기·열기
//  설정         이용 현황·연결
//
// 로컬 전용(127.0.0.1). 키·설정은 이 머신에만 저장.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SPECIAI_DASH_PORT || 4747);
const DIR = join(homedir(), '.speciai');
const CFG = join(DIR, 'config.json');
const EVENTS = join(DIR, 'events.jsonl');
const DOCS = join(DIR, 'documents.jsonl');
const TEAM = join(DIR, 'agents.json');
const FLOWS = join(DIR, 'workflows.json');
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, v) => { mkdirSync(DIR, { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2)); };

function resolve_() {
  const cfg = readJson(CFG, {});
  return {
    baseUrl: (process.env.SPECIAI_BASE_URL || cfg.baseUrl || 'https://speciai.team').replace(/\/+$/, ''),
    apiKey: process.env.SPECIAI_API_KEY || cfg.apiKey || '',
  };
}

function tailEvents(n = 100) {
  try {
    return readFileSync(EVENTS, 'utf8').trim().split('\n').slice(-n)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function listDocs() {
  try {
    const rows = readFileSync(DOCS, 'utf8').trim().split('\n')
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const byPath = new Map();
    for (const r of rows) byPath.set(r.docx, r);
    return [...byPath.values()].filter(r => existsSync(r.docx)).sort((a, b) => b.ts - a.ts).slice(0, 30);
  } catch { return []; }
}

function openLocal(path) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

// 콘솔 UI는 본체 프론트 코드로 빌드된 React 앱 — console-dist를 정적 서빙한다.
// 빌드: 레포 루트에서 `npm run build:console` (vite.config.console.ts)
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'console-dist');
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', woff2: 'font/woff2', ico: 'image/x-icon', map: 'application/json' };
function serveStatic(res, relPath) {
  const safe = relPath.replace(/\.\./g, '');
  const p = join(DIST, safe);
  if (!existsSync(p) || !statSync(p).isFile()) return false;
  const ext = p.split('.').pop();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': safe.startsWith('assets/') ? 'max-age=86400' : 'no-cache' });
  res.end(readFileSync(p));
  return true;
}
// ── SSE ───────────────────────────────────────────────────────────
const sseClients = new Set();
let lastSize = 0;
try { lastSize = statSync(EVENTS).size; } catch { /* 아직 없음 */ }

setInterval(() => {
  let size = 0;
  try { size = statSync(EVENTS).size; } catch { return; }
  if (size < lastSize) lastSize = 0;
  if (size === lastSize || sseClients.size === 0) { lastSize = size; return; }
  try {
    const fd = openSync(EVENTS, 'r');
    const buf = Buffer.alloc(size - lastSize);
    readSync(fd, buf, 0, buf.length, lastSize);
    closeSync(fd);
    lastSize = size;
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      for (const res of sseClients) res.write(`data: ${line}\n\n`);
    }
  } catch { /* 다음 tick */ }
}, 1000);

function readBody(req, cb) {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
  req.on('end', () => cb(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (serveStatic(res, 'index.html')) return;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end('<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">콘솔 UI가 아직 빌드되지 않았습니다.<br>레포 루트에서 <code>npm run build:console</code> 실행 후 새로고침하세요.</body>');
  }

  // 정적 자산 (React 빌드 산출물 + 아바타)
  if ((url.pathname.startsWith('/assets/') || url.pathname.startsWith('/avatars/')) && req.method === 'GET') {
    if (serveStatic(res, url.pathname.slice(1))) return;
    res.writeHead(404); return res.end();
  }

  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    for (const e of tailEvents(50)) res.write(`data: ${JSON.stringify(e)}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── 채팅 프록시 — 서버 /api/plugin/chat (키는 로컬에서만 부착) ──
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    return readBody(req, async (body) => {
      const { baseUrl, apiKey } = resolve_();
      try {
        const r = await fetch(`${baseUrl}/api/plugin/chat`, {
          method: 'POST',
          headers: { 'x-speciai-key': apiKey, 'content-type': 'application/json' },
          body, signal: AbortSignal.timeout(60_000),
        });
        const text = await r.text();
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(text);
      } catch (e) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '서버 연결 실패: ' + e.message }));
      }
    });
  }

  // 공개 데이터 프록시 — 대시보드(컴플라이언스)가 쓰는 운영 공개 라우트 패스스루
  if (/^\/(lawmaking|openapi|naver|nts|nabo)\//.test(url.pathname) || url.pathname.startsWith('/api/bizinfo/') || url.pathname.startsWith('/api/gov-extra/')) {
    const { baseUrl } = resolve_();
    try {
      // POST(국세청 사업자 상태조회 등)도 메서드·바디 그대로 중계
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const reqBody = hasBody ? await new Promise((ok) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => ok(Buffer.concat(chunks)));
      }) : undefined;
      const r = await fetch(baseUrl + url.pathname + url.search, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] || 'application/json' },
        body: reqBody,
        signal: AbortSignal.timeout(20_000),
      });
      const body = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream' });
      return res.end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: String(e.message) }));
    }
  }

  // 코워크 문서(문서 편집기) — 로컬 저장 (본체 /api/cowork/documents 형태 호환)
  if (url.pathname.startsWith('/api/cowork/documents')) {
    const CW = join(DIR, 'cowork-documents.json');
    const store = readJson(CW, { documents: [] });
    const id = url.pathname.split('/')[4];
    if (!id && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: true, documents: store.documents }));
    }
    if (!id && req.method === 'POST') {
      return readBody(req, (body) => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch { /* 무시 */ }
        const now = new Date().toISOString();
        const doc = { id: 'cw' + Date.now().toString(36), title: String(b.title || '제목 없는 문서').slice(0, 120), html: String(b.html || ''), metadata: b.metadata || {}, created_at: now, updated_at: now };
        store.documents.unshift(doc);
        writeJson(CW, store);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, document: doc }));
      });
    }
    if (id && req.method === 'GET') {
      const doc = store.documents.find(d => d.id === id);
      res.writeHead(doc ? 200 : 404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(doc ? { success: true, document: doc } : { success: false }));
    }
    if (id && req.method === 'PATCH') {
      return readBody(req, (body) => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch { /* 무시 */ }
        let updated = null;
        store.documents = store.documents.map(d => {
          if (d.id !== id) return d;
          updated = { ...d, ...(b.title != null ? { title: String(b.title).slice(0, 120) } : {}), ...(b.html != null ? { html: String(b.html) } : {}), ...(b.metadata !== undefined ? { metadata: b.metadata } : {}), updated_at: new Date().toISOString() };
          return updated;
        });
        writeJson(CW, store);
        res.writeHead(updated ? 200 : 404, { 'content-type': 'application/json' });
        res.end(JSON.stringify(updated ? { success: true, document: updated } : { success: false }));
      });
    }
    if (id && req.method === 'DELETE') {
      store.documents = store.documents.filter(d => d.id !== id);
      writeJson(CW, store);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"success":true}');
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{"success":false}');
  }

  // ── JWT 프록시 — 콘솔(브라우저)의 운영 API 호출 중계 (CORS 회피) ──
  // 로그인 세션의 Bearer가 붙은 /api/* 요청을 운영 서버로 그대로 전달한다.
  // 응답은 스트리밍(pipe)이라 SSE(실시간 채팅)도 통과한다.
  if (url.pathname.startsWith('/api/') && req.headers.authorization
      && !['/api/custom-agents', '/api/team', '/api/workflows', '/api/docs', '/api/open', '/api/config'].some(p => url.pathname.startsWith(p))) {
    return readBody(req, async (body) => {
      const { baseUrl } = resolve_();
      let upstream;
      try {
        upstream = await fetch(baseUrl + url.pathname + url.search, {
          method: req.method,
          headers: {
            authorization: req.headers.authorization,
            'content-type': req.headers['content-type'] || 'application/json',
          },
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
          signal: AbortSignal.timeout(180_000),
        });
      } catch (e) {
        res.writeHead(502, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: String(e.message) }));
      }
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
      try {
        if (upstream.body) { for await (const chunk of upstream.body) res.write(chunk); }
      } catch { /* 클라이언트 중단 */ }
      res.end();
    });
  }

  // ── 본체 MultiChat 원본 구동용 어댑터 ─────────────────────────
  // 법제처 프록시 — 운영 서버로 플러그인 키 첨부 포워딩 (lawApi·citationVerify 실동작)
  if (url.pathname.startsWith('/api/law/')) {
    const { baseUrl, apiKey } = resolve_();
    try {
      const r = await fetch(baseUrl + url.pathname + url.search, {
        headers: { 'x-speciai-key': apiKey }, signal: AbortSignal.timeout(15_000),
      });
      const body = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/xml' });
      return res.end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: String(e.message) }));
    }
  }

  // 법령 RAG — 운영 플러그인 검색으로 포워딩 (응답 형태 동일: {success, hits})
  if (url.pathname === '/api/knowledge/search' && req.method === 'POST') {
    return readBody(req, async (body) => {
      const { baseUrl, apiKey } = resolve_();
      try {
        const r = await fetch(baseUrl + '/api/plugin/search', {
          method: 'POST',
          headers: { 'x-speciai-key': apiKey, 'content-type': 'application/json' },
          body, signal: AbortSignal.timeout(20_000),
        });
        const text = await r.text();
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(text);
      } catch (e) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(e.message) }));
      }
    });
  }

  // 채팅 — 운영 플러그인 채팅을 호출해 MultiChat이 기대하는 SSE(event: delta/done)로 변환
  if ((url.pathname === '/api/chat/claude' || url.pathname === '/api/chat/claude/once') && req.method === 'POST') {
    return readBody(req, async (body) => {
      const { baseUrl, apiKey } = resolve_();
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch { /* 빈 body */ }
      let upstream;
      try {
        upstream = await fetch(baseUrl + '/api/plugin/chat', {
          method: 'POST',
          headers: { 'x-speciai-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: (payload.messages || []).map(m => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content
                : Array.isArray(m.content) ? m.content.map(c => c?.text || '').join('\n') : String(m.content ?? ''),
            })),
            system: payload.system,
            maxTokens: payload.maxTokens,
          }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (e) {
        res.writeHead(502, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: String(e.message) }));
      }
      const j = await upstream.json().catch(() => ({}));
      if (url.pathname.endsWith('/once')) {
        res.writeHead(upstream.ok ? 200 : upstream.status, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(upstream.ok ? { success: true, text: j.text || '' } : j));
      }
      if (!upstream.ok) {
        // 402(한도)·401(키) — MultiChat이 JSON 분기로 처리
        res.writeHead(upstream.status, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(j));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': connected\n\n');
      const text = j.text || '';
      // 800자 단위 의사 스트리밍 — 원본 리더(event/data 파싱)와 호환
      for (let i = 0; i < text.length; i += 800) {
        res.write('event: delta\n');
        res.write('data: ' + JSON.stringify({ text: text.slice(i, i + 800) }) + '\n\n');
      }
      res.write('event: done\n');
      res.write('data: ' + JSON.stringify({ stopReason: 'end_turn' }) + '\n\n');
      return res.end();
    });
  }

  // 채팅 쿼터 — 운영 플러그인 상담 한도를 본체 형태로 변환
  if (url.pathname === '/api/chat/quota') {
    const { baseUrl, apiKey } = resolve_();
    try {
      const r = await fetch(baseUrl + '/api/plugin/status', {
        headers: { 'x-speciai-key': apiKey }, signal: AbortSignal.timeout(10_000),
      });
      const d = await r.json();
      const limit = d?.limits?.chat ?? 5;
      const used = (d?.usage || []).find(u => u.tool === 'chat')?.count || 0;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: true, plan: d?.plan || 'solo', used, limit, unlimited: false }));
    } catch {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"success":false}');
    }
  }
  if (url.pathname === '/api/credits/balance') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"success":false}');
  }

  // 대화 저장 — 로컬 파일 (본체 conversations 서비스 형태 호환)
  if (url.pathname.startsWith('/api/conversations')) {
    const CONV = join(DIR, 'conversations.json');
    const load = () => readJson(CONV, { conversations: [], messages: {} });
    const parts = url.pathname.split('/').filter(Boolean); // api, conversations, :id?, messages?, :mid?
    const cid = parts[2];
    const isMsgs = parts[3] === 'messages';
    const mid = parts[4];
    const store = load();

    if (!cid && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: true, conversations: store.conversations }));
    }
    if (!cid && req.method === 'POST') {
      return readBody(req, (body) => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch { /* 무시 */ }
        const conv = { id: 'c' + Date.now().toString(36), title: String(b.title || '새 대화').slice(0, 80), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        store.conversations.unshift(conv);
        writeJson(CONV, store);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, conversation: conv }));
      });
    }
    if (cid && !isMsgs && req.method === 'PATCH') {
      return readBody(req, (body) => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch { /* 무시 */ }
        store.conversations = store.conversations.map(c => c.id === cid ? { ...c, ...(b.title ? { title: String(b.title).slice(0, 80) } : {}), updated_at: new Date().toISOString() } : c);
        writeJson(CONV, store);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"success":true}');
      });
    }
    if (cid && !isMsgs && req.method === 'DELETE') {
      store.conversations = store.conversations.filter(c => c.id !== cid);
      delete store.messages[cid];
      writeJson(CONV, store);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"success":true}');
    }
    if (cid && isMsgs && !mid && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: true, messages: store.messages[cid] || [] }));
    }
    if (cid && isMsgs && !mid && req.method === 'POST') {
      return readBody(req, (body) => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch { /* 무시 */ }
        const msg = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), role: b.role || 'user', content: String(b.content ?? ''), metadata: b.metadata || null, created_at: new Date().toISOString() };
        store.messages[cid] = [...(store.messages[cid] || []), msg];
        store.conversations = store.conversations.map(c => c.id === cid ? { ...c, updated_at: new Date().toISOString() } : c);
        writeJson(CONV, store);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: msg }));
      });
    }
    if (cid && isMsgs && mid && req.method === 'PATCH') {
      return readBody(req, (body) => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch { /* 무시 */ }
        store.messages[cid] = (store.messages[cid] || []).map(m => m.id === mid ? { ...m, ...(b.content != null ? { content: String(b.content) } : {}), ...(b.metadata !== undefined ? { metadata: b.metadata } : {}) } : m);
        writeJson(CONV, store);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"success":true}');
      });
    }
    if (cid && isMsgs && mid && req.method === 'DELETE') {
      store.messages[cid] = (store.messages[cid] || []).filter(m => m.id !== mid);
      writeJson(CONV, store);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"success":true}');
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{"success":false}');
  }

  // 사업 정보 (본체 Onboarding 원본이 저장하는 CompanyProfile — 로컬 보관, 자문에 반영)
  if (url.pathname === '/api/company' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ success: true, company: readJson(join(DIR, 'company.json'), null) }));
  }
  if (url.pathname === '/api/company' && req.method === 'POST') {
    return readBody(req, (body) => {
      try {
        const profile = JSON.parse(body || '{}');
        writeJson(join(DIR, 'company.json'), profile);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, company: { ...profile, id: 'local' } }));
      } catch { res.writeHead(400); res.end('{"success":false}'); }
    });
  }
  // 본체 온보딩이 호출하는 사업자번호 조회 — 로컬 콘솔 미지원(수동 입력으로 진행)
  if (url.pathname.startsWith('/api/dart/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"success":false}');
  }

  // 커스텀 에이전트·프리셋 페르소나 (본체 userAgents 서비스의 로컬 대체 저장소)
  if (url.pathname === '/api/custom-agents' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(readJson(join(DIR, 'custom-agents.json'), { agents: [], personas: {} })));
  }
  if (url.pathname === '/api/custom-agents' && req.method === 'POST') {
    return readBody(req, (body) => {
      try {
        const store = JSON.parse(body || '{}');
        writeJson(join(DIR, 'custom-agents.json'), {
          agents: Array.isArray(store.agents) ? store.agents.slice(0, 50) : [],
          personas: store.personas && typeof store.personas === 'object' ? store.personas : {},
        });
        res.writeHead(200); res.end('{"success":true}');
      } catch { res.writeHead(400); res.end('{}'); }
    });
  }

  if (url.pathname === '/api/team' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ team: readJson(TEAM, {}), flows: readJson(FLOWS, []) }));
  }
  if (url.pathname === '/api/team' && req.method === 'POST') {
    return readBody(req, (body) => {
      try { writeJson(TEAM, JSON.parse(body || '{}')); res.writeHead(200); res.end('{"success":true}'); }
      catch { res.writeHead(400); res.end('{}'); }
    });
  }
  if (url.pathname === '/api/workflows' && req.method === 'POST') {
    return readBody(req, (body) => {
      try {
        const flows = JSON.parse(body || '[]');
        if (!Array.isArray(flows)) throw new Error('bad');
        writeJson(FLOWS, flows.slice(0, 50).map(f => ({
          id: String(f.id || 'wf-' + Math.random().toString(36).slice(2, 8)).slice(0, 40),
          name: String(f.name || '').slice(0, 60),
          steps: (Array.isArray(f.steps) ? f.steps : []).map(x => String(x).slice(0, 40)).slice(0, 20),
          nodes: Array.isArray(f.nodes) ? f.nodes.slice(0, 20) : [],
          edges: Array.isArray(f.edges) ? f.edges.slice(0, 40) : [],
          updatedAt: Number(f.updatedAt) || 0,
        })).filter(f => f.name));
        res.writeHead(200); res.end('{"success":true}');
      } catch { res.writeHead(400); res.end('{}'); }
    });
  }

  if (url.pathname === '/api/docs') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ docs: listDocs().map((d, i) => ({ i, ts: d.ts, title: d.title, file: d.docx.split(/[\\/]/).pop(), hasPreview: !!d.preview && existsSync(d.preview) })) }));
  }

  if (url.pathname === '/preview') {
    const d = listDocs()[Number(url.searchParams.get('i'))];
    if (!d?.preview || !existsSync(d.preview)) { res.writeHead(404); return res.end('미리보기 없음'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(readFileSync(d.preview, 'utf8'));
  }

  if (url.pathname === '/api/open' && req.method === 'POST') {
    const d = listDocs()[Number(url.searchParams.get('i'))];
    if (!d) { res.writeHead(404); return res.end('{}'); }
    openLocal(d.docx); // 문서함 기록 파일만 — 임의 경로 실행 불가
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"success":true}');
  }

  if (url.pathname === '/api/status') {
    const { baseUrl, apiKey } = resolve_();
    try {
      const r = await fetch(`${baseUrl}/api/plugin/status`, {
        headers: { 'x-speciai-key': apiKey }, signal: AbortSignal.timeout(10_000),
      });
      const body = await r.text();
      res.writeHead(r.status, { 'content-type': 'application/json' });
      return res.end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: '서버 연결 실패: ' + e.message }));
    }
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    const cfg = readJson(CFG, {});
    const { baseUrl } = resolve_();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      baseUrl,
      apiKeyMasked: cfg.apiKey ? cfg.apiKey.slice(0, 12) + '…' : (process.env.SPECIAI_API_KEY ? 'env 설정됨' : ''),
    }));
  }

  if (url.pathname === '/api/config' && req.method === 'POST') {
    return readBody(req, (body) => {
      try {
        const input = JSON.parse(body || '{}');
        const cfg = readJson(CFG, {});
        if (typeof input.apiKey === 'string' && input.apiKey.startsWith('sk_spc_')) cfg.apiKey = input.apiKey;
        if (typeof input.baseUrl === 'string' && /^https?:\/\//.test(input.baseUrl)) cfg.baseUrl = input.baseUrl.replace(/\/+$/, '');
        mkdirSync(DIR, { recursive: true });
        writeFileSync(CFG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"success":true}');
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end('{"success":false}');
      }
    });
  }

  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{"success":false,"error":"local_console_unsupported"}');
  }
  res.writeHead(404); res.end();
});

// 로컬 전용 바인드 — 외부 노출 금지 (키가 오가는 설정 API가 있다)
server.listen(PORT, '127.0.0.1', () => {
  console.log(`SpeciAI 자문팀 콘솔 → http://localhost:${PORT}`);
});
