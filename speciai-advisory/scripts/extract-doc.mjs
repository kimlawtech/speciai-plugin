#!/usr/bin/env node
// 문서 양식 리더 (의존성 0) — 사용자가 첨부한 양식 파일에서 텍스트·구조를 추출한다.
//
// 사용: node extract-doc.mjs <파일.docx|.hwpx|.hwp>
// 출력: 마크다운-라이트 (# 제목 계층, [표] 행 표기) — 스킬이 이 구조 그대로 문서를 작성한다.
//
// 지원:
//  - DOCX  : zip + word/document.xml — 제목 스타일(Heading·outlineLvl)→#, 표→행 단위
//  - HWPX  : zip + Contents/section*.xml — 문단·표 텍스트
//  - HWP   : 구형 바이너리(CFB) — 텍스트 추출(베타). 서식 구조는 제한적
//  - PDF·이미지 공고문은 이 스크립트 없이 Claude Code가 직접 읽는다.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// ── ZIP 리더 (central directory 파싱 + stored/deflate) ────────────
function readZip(buf) {
  // EOCD 탐색 (뒤에서부터)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP 형식이 아님');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    // local header에서 실제 데이터 위치 계산
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    entries.set(name, { method, data: buf.subarray(dataStart, dataStart + csize) });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return (name) => {
    const e = entries.get(name);
    if (!e) return null;
    return e.method === 8 ? inflateRawSync(e.data) : Buffer.from(e.data);
  };
}

const unescXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// ── DOCX ──────────────────────────────────────────────────────────
function extractDocx(buf) {
  const get = readZip(buf);
  const xml = get('word/document.xml')?.toString('utf8');
  if (!xml) throw new Error('word/document.xml 없음');
  const out = [];
  // 표를 먼저 행 단위로 치환 처리하기 위해 최상위 블록(w:p, w:tbl)을 순서대로 스캔
  const blockRe = /<w:(p|tbl)[ >][\s\S]*?<\/w:\1>/g;
  let m;
  while ((m = blockRe.exec(xml))) {
    const block = m[0];
    if (m[1] === 'tbl') {
      for (const row of block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) {
        const cells = (row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [])
          .map(tc => (tc.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
            .map(t => unescXml(t.replace(/<[^>]+>/g, ''))).join('').trim());
        if (cells.some(c => c)) out.push('[표] ' + cells.join(' | '));
      }
      continue;
    }
    const text = (block.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map(t => unescXml(t.replace(/<[^>]+>/g, ''))).join('').trim();
    if (!text) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(block)?.[1] || '';
    const outline = /<w:outlineLvl w:val="(\d+)"/.exec(block)?.[1];
    let level = 0;
    if (/^(Heading|heading|제목)\s*1|^Title/.test(style) || outline === '0') level = 1;
    else if (/^(Heading|heading|제목)\s*2/.test(style) || outline === '1') level = 2;
    else if (/^(Heading|heading|제목)\s*[3-9]/.test(style) || Number(outline) >= 2) level = 3;
    out.push(level ? '#'.repeat(level) + ' ' + text : text);
  }
  return out.join('\n');
}

// ── HWPX ──────────────────────────────────────────────────────────
function extractHwpx(buf) {
  const get = readZip(buf);
  const out = [];
  for (let i = 0; i < 16; i++) {
    const xml = get(`Contents/section${i}.xml`)?.toString('utf8');
    if (!xml) break;
    for (const p of xml.match(/<hp:p[ >][\s\S]*?<\/hp:p>/g) || []) {
      const text = (p.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [])
        .map(t => unescXml(t.replace(/<[^>]+>/g, ''))).join('').trim();
      if (text) out.push(text);
    }
  }
  return out.join('\n');
}

// ── HWP 5.0 (CFB 바이너리, 베타 — 텍스트만) ───────────────────────
function extractHwp(buf) {
  if (buf.readUInt32LE(0) !== 0xE011CFD0) throw new Error('HWP(CFB) 형식이 아님');
  const sectorSize = 1 << buf.readUInt16LE(30);
  const dirStart = buf.readUInt32LE(48);
  // FAT 로드 (DIFAT 첫 109개만 — 일반 문서 크기에 충분)
  const fat = [];
  for (let i = 0; i < 109; i++) {
    const s = buf.readInt32LE(76 + i * 4);
    if (s < 0) break;
    const base = 512 + s * sectorSize;
    for (let j = 0; j < sectorSize / 4; j++) fat.push(buf.readInt32LE(base + j * 4));
  }
  const chain = (start) => {
    const out = [];
    for (let s = start, guard = 0; s >= 0 && guard < 100000; s = fat[s], guard++) {
      out.push(buf.subarray(512 + s * sectorSize, 512 + (s + 1) * sectorSize));
    }
    return Buffer.concat(out);
  };
  // MiniFAT — 4096바이트 미만 스트림은 루트 ministream 안의 64바이트 섹터 체인
  const miniFatStart = buf.readInt32LE(60);
  const miniFat = [];
  if (miniFatStart >= 0) {
    const mf = chain(miniFatStart);
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mf.readInt32LE(i));
  }
  const dir = chain(dirStart);
  const rootStart = dir.readUInt32LE(116); // 루트 엔트리(첫 번째) = ministream 위치
  const ministream = chain(rootStart);
  const miniChain = (start) => {
    const out = [];
    for (let s = start, guard = 0; s >= 0 && guard < 100000; s = miniFat[s], guard++) {
      out.push(ministream.subarray(s * 64, (s + 1) * 64));
    }
    return Buffer.concat(out);
  };
  const readStream = (start, size) => (size < 4096 ? miniChain(start) : chain(start)).subarray(0, size);

  // 디렉토리 엔트리 순회 → BodyText 하위 Section 스트림 수집
  const sections = [];
  let compressed = true;
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = dir.readUInt16LE(off + 64);
    if (!nameLen) continue;
    const name = dir.subarray(off, off + nameLen - 2).toString('utf16le');
    const start = dir.readUInt32LE(off + 116);
    const size = dir.readUInt32LE(off + 120);
    if (name === 'FileHeader') {
      const fh = readStream(start, size);
      compressed = !!(fh.readUInt32LE(36) & 1);
    }
    if (/^Section\d+$/.test(name)) sections.push({ n: Number(name.slice(7)), start, size });
  }
  if (!sections.length) throw new Error('BodyText 섹션 없음 (암호화 문서 가능성)');
  sections.sort((a, b) => a.n - b.n);

  const texts = [];
  for (const s of sections) {
    let data = readStream(s.start, s.size);
    if (compressed) { try { data = inflateRawSync(data); } catch { /* 미압축 폴백 */ } }
    // 레코드 순회 — HWPTAG_PARA_TEXT(67)의 UTF-16LE 본문 추출
    let off = 0;
    while (off + 4 <= data.length) {
      const header = data.readUInt32LE(off);
      const tag = header & 0x3ff;
      let size = (header >> 20) & 0xfff;
      off += 4;
      if (size === 0xfff) { size = data.readUInt32LE(off); off += 4; }
      if (off + size > data.length) break;
      if (tag === 67) { // PARA_TEXT
        const raw = data.subarray(off, off + size);
        let line = '';
        for (let i = 0; i + 1 < raw.length; i += 2) {
          const code = raw.readUInt16LE(i);
          if (code >= 32 && !(code >= 0xd800 && code <= 0xdfff)) line += String.fromCharCode(code);
          else if (code < 32) { // 제어문자 — 인라인 컨트롤은 부가정보 스킵
            if ([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23].includes(code)) i += 14; // 확장 컨트롤 7워드
            if (code === 13 && line.trim()) { texts.push(line.trim()); line = ''; }
          }
        }
        if (line.trim()) texts.push(line.trim());
      }
      off += size;
    }
  }
  return texts.join('\n');
}

// ── main ──────────────────────────────────────────────────────────
const file = process.argv[2];
if (!file) {
  console.error('사용: node extract-doc.mjs <파일.docx|.hwpx|.hwp>');
  process.exit(1);
}
const buf = readFileSync(file);
const ext = file.toLowerCase().split('.').pop();
try {
  let text;
  if (ext === 'docx') text = extractDocx(buf);
  else if (ext === 'hwpx') text = extractHwpx(buf);
  else if (ext === 'hwp') text = extractHwp(buf);
  else throw new Error(`지원하지 않는 확장자: .${ext} (docx·hwpx·hwp)`);
  if (!text.trim()) throw new Error('추출된 텍스트 없음');
  console.log(text);
} catch (e) {
  console.error(`추출 실패: ${e.message}`);
  if (ext === 'hwp') console.error('구형 HWP는 한글에서 "다른 이름으로 저장 → HWPX"로 변환하면 정확도가 높아집니다.');
  process.exit(1);
}
