#!/usr/bin/env node
// 마크다운-라이트 → DOCX 변환기 (의존성 0)
//
// 사용: node build-docx.mjs <입력.md> <출력.docx> [--title "문서 제목"]
//
// 지원 문법: # ## ### 제목 / - 불릿 / 1. 번호 목록 / **굵게** / 빈 줄 = 문단 구분
// 그 외 줄은 본문 문단. 표·이미지는 미지원(필요 시 본문 텍스트로 풀어 쓸 것).
//
// DOCX는 ZIP + OOXML. ZIP은 무압축(stored)으로 직접 조립한다.
// 번호 목록은 numbering.xml에 bullet/decimal을 분리 정의한다
// (본체 documentExport.ts의 F025 — ol이 불릿으로 나오던 버그 — 재발 방지).

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';

import { buildZip } from './zip.mjs';

// ── OOXML ─────────────────────────────────────────────────────────
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// **굵게** 분리 → runs
function runs(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/);
  return parts.filter(Boolean).map(p => {
    const m = /^\*\*([^*]+)\*\*$/.exec(p);
    const t = m ? m[1] : p;
    const rpr = m ? '<w:rPr><w:b/></w:rPr>' : '';
    return `<w:r>${rpr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join('');
}

const para = (text, style) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}</w:pPr>${runs(text)}</w:p>`;

// numId 1 = 불릿, numId 2부터 = 번호 목록(목록 블록마다 새 numId → 1부터 재시작)
const listItem = (text, numId) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${runs(text)}</w:p>`;

function markdownToBody(md, title) {
  const out = [];
  if (title) out.push(para(title, 'Title'));
  const lines = md.split(/\r?\n/);
  let orderedNumId = 0;      // 번호 목록 블록 카운터 (2, 3, 4…)
  let inOrdered = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const wasOrdered = inOrdered;
    inOrdered = /^\s*\d+\.\s+/.test(line);
    if (inOrdered && !wasOrdered) orderedNumId += 1;

    if (!line.trim()) continue;
    let m;
    if ((m = /^###\s+(.*)/.exec(line))) out.push(para(m[1], 'Heading3'));
    else if ((m = /^##\s+(.*)/.exec(line))) out.push(para(m[1], 'Heading2'));
    else if ((m = /^#\s+(.*)/.exec(line))) out.push(para(m[1], 'Heading1'));
    else if ((m = /^\s*[-*]\s+(.*)/.exec(line))) out.push(listItem(m[1], 1));
    else if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) out.push(listItem(m[1], 1 + orderedNumId));
    else out.push(para(line));
  }
  return { body: out.join(''), orderedBlocks: orderedNumId };
}

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕"/>
<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>
<w:pPr><w:spacing w:after="360"/><w:jc w:val="center"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
<w:pPr><w:spacing w:before="360" w:after="180"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:pPr><w:spacing w:before="280" w:after="140"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/>
<w:pPr><w:spacing w:before="220" w:after="110"/><w:outlineLvl w:val="2"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>
<w:pPr><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>`;

// abstractNumId 0 = 불릿. 번호 목록은 "블록마다 abstractNum 자체를 분리"해 1부터 재시작.
// (num 공유 + startOverride 방식은 QuickLook 등 일부 렌더러가 무시해 번호가 이어진다)
function numberingXml(orderedBlocks) {
  const abstracts = ['<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>'];
  const nums = ['<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'];
  for (let i = 1; i <= Math.max(orderedBlocks, 1); i++) {
    abstracts.push(`<w:abstractNum w:abstractNumId="${i}"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>`);
    nums.push(`<w:num w:numId="${1 + i}"><w:abstractNumId w:val="${i}"/></w:num>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${abstracts.join('')}
${nums.join('')}
</w:numbering>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

// ── A4 미리보기 HTML ──────────────────────────────────────────────
// DOCX와 같은 내용을 A4 지면 그대로 브라우저에서 보여준다.
// 대시보드 문서함이 이 파일을 모달로 띄운다. 인쇄 시에도 A4 1:1.
function previewHtml(md, title) {
  const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => escH(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const out = [];
  if (title) out.push(`<h1 class="doc-title">${inline(title)}</h1>`);
  let list = null; // 'ul' | 'ol'
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if ((m = /^###\s+(.*)/.exec(line))) { closeList(); out.push(`<h4>${inline(m[1])}</h4>`); }
    else if ((m = /^##\s+(.*)/.exec(line))) { closeList(); out.push(`<h3>${inline(m[1])}</h3>`); }
    else if ((m = /^#\s+(.*)/.exec(line))) { closeList(); out.push(`<h2>${inline(m[1])}</h2>`); }
    else if ((m = /^\s*[-*]\s+(.*)/.exec(line))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!line.trim()) closeList();
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escH(title || '문서 미리보기')}</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; }
body { background: #e9e9ec; padding: 24px 8px; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
.a4 {
  width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff;
  padding: 25.4mm; box-shadow: 0 4px 24px rgba(0,0,0,.12);
  font-size: 10pt; line-height: 1.8; color: #111; word-break: keep-all;
}
@media print { body { background:#fff; padding:0 } .a4 { box-shadow:none; margin:0 } }
@media (max-width: 820px) { .a4 { width: 100%; min-height: 0; padding: 8mm } }
.doc-title { text-align: center; font-size: 18pt; letter-spacing: .35em; margin-bottom: 12mm; font-weight: 700; }
h2 { font-size: 14pt; margin: 9mm 0 4mm; } h3 { font-size: 12pt; margin: 7mm 0 3mm; } h4 { font-size: 11pt; margin: 5mm 0 2mm; }
p { margin-bottom: 2.5mm; } ul, ol { margin: 1mm 0 3mm 7mm; } li { margin-bottom: 1.5mm; }
</style></head><body><div class="a4">${out.join('\n')}</div></body></html>`;
}

// ── 문서함 기록 — 대시보드가 읽는다 ───────────────────────────────
function recordDocument(title, docxPath, previewPath) {
  try {
    const dir = join(homedir(), '.speciai');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'documents.jsonl'), JSON.stringify({
      ts: Date.now(), title: title || basename(docxPath), docx: resolve(docxPath), preview: resolve(previewPath),
    }) + '\n');
  } catch { /* 문서함 없이도 동작 */ }
}

// ── main ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const titleIdx = argv.indexOf('--title');
const title = titleIdx >= 0 ? argv[titleIdx + 1] : '';
const openAfter = argv.includes('--open');
const files = argv.filter((a, i) => a !== '--title' && a !== '--open' && i !== titleIdx + 1);
const [input, output] = files;
if (!input || !output) {
  console.error('사용: node build-docx.mjs <입력.md> <출력.docx> [--title "문서 제목"] [--open]');
  process.exit(1);
}

const md = readFileSync(input, 'utf8');
const { body, orderedBlocks } = markdownToBody(md, title);
const zip = buildZip([
  { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
  { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
  { name: 'word/document.xml', data: Buffer.from(documentXml(body), 'utf8') },
  { name: 'word/styles.xml', data: Buffer.from(STYLES_XML, 'utf8') },
  { name: 'word/numbering.xml', data: Buffer.from(numberingXml(orderedBlocks), 'utf8') },
  { name: 'word/_rels/document.xml.rels', data: Buffer.from(DOC_RELS, 'utf8') },
]);
writeFileSync(output, zip);

const previewPath = output.replace(/\.docx$/i, '') + '.preview.html';
writeFileSync(previewPath, previewHtml(md, title), 'utf8');
recordDocument(title, output, previewPath);

console.log(`생성 완료: ${output} (${(zip.length / 1024).toFixed(1)}KB)`);
console.log(`미리보기: ${previewPath}`);
console.log('대시보드 문서함(localhost:4747)에서 클릭해 바로 볼 수 있습니다.');

if (openAfter) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', resolve(output)] : [resolve(output)];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}
