#!/usr/bin/env node
// 마크다운-라이트 → HWPX(한글 문서) 변환기 (의존성 0)
//
// 사용: node build-hwpx.mjs <입력.md> <출력.hwpx> [--title "문서 제목"] [--open]
//
// 정부지원사업 등 "한글(HWP) 제출" 요구에 대응한다. HWPX는 한글 2010 이상에서
// 열리는 공식 XML 포맷 — 한글에서 열어 '다른 이름으로 저장'하면 .hwp로도 저장 가능.
// (관공서 배포 .hwp 바이너리 양식을 직접 채우는 것은 미지원 — 공고 목차를
//  마크다운 구조로 반영해 생성하고, 최종 양식 붙여넣기는 한글에서 수행)
//
// 본체 services/documentExport.ts의 generateHwpx(검증된 헤더·섹션 구조)를 이식.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { buildZip } from './zip.mjs';

// ── 문자/문단 속성 ID (header.xml의 charProperties·paraProperties와 대응) ──
const CP_NORMAL = '1'; // 맑은 고딕 10pt
const CP_BOLD = '2';   // bold 10pt
const CP_TITLE = '3';  // bold 32pt
const CP_H1 = '4';     // bold 26pt
const CP_H2 = '5';     // bold 22pt
const PP_NORMAL = '0'; // JUSTIFY
const PP_CENTER = '1'; // CENTER

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

let _pid = 1000000000;
const nextPid = () => String(_pid++);
const makeP = (runs, paraPrId = PP_NORMAL) =>
  `<hp:p id="${nextPid()}" paraPrIDRef="${paraPrId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runs}</hp:p>`;

// **굵게** 혼합 run
function runs(text, baseCp = CP_NORMAL) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean);
  const out = parts.map(p => {
    const m = /^\*\*([^*]+)\*\*$/.exec(p);
    return `<hp:run charPrIDRef="${m ? CP_BOLD : baseCp}"><hp:t>${escapeXml(m ? m[1] : p)}</hp:t></hp:run>`;
  }).join('');
  return out || `<hp:run charPrIDRef="${baseCp}"><hp:t></hp:t></hp:run>`;
}

function markdownToBody(md, title) {
  const parts = [];
  if (title) {
    parts.push(makeP(`<hp:run charPrIDRef="${CP_TITLE}"><hp:t>${escapeXml(title)}</hp:t></hp:run>`, PP_CENTER));
    parts.push(makeP(`<hp:run charPrIDRef="${CP_NORMAL}"><hp:t> </hp:t></hp:run>`, PP_NORMAL));
  }
  let orderedNo = 0;
  let inOrdered = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const wasOrdered = inOrdered;
    inOrdered = /^\s*\d+\.\s+/.test(line);
    if (inOrdered && !wasOrdered) orderedNo = 0;
    if (!line.trim()) continue;
    let m;
    if ((m = /^#\s+(.*)/.exec(line))) {
      parts.push(makeP(`<hp:run charPrIDRef="${CP_H1}"><hp:t>${escapeXml(m[1])}</hp:t></hp:run>`, PP_NORMAL));
    } else if ((m = /^##\s+(.*)/.exec(line))) {
      parts.push(makeP(`<hp:run charPrIDRef="${CP_H2}"><hp:t>${escapeXml(m[1])}</hp:t></hp:run>`, PP_NORMAL));
    } else if ((m = /^###\s+(.*)/.exec(line))) {
      parts.push(makeP(`<hp:run charPrIDRef="${CP_BOLD}"><hp:t>${escapeXml(m[1])}</hp:t></hp:run>`, PP_NORMAL));
    } else if ((m = /^\s*[-*]\s+(.*)/.exec(line))) {
      parts.push(makeP(`<hp:run charPrIDRef="${CP_NORMAL}"><hp:t>• </hp:t></hp:run>${runs(m[1])}`, PP_NORMAL));
    } else if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) {
      orderedNo += 1;
      parts.push(makeP(`<hp:run charPrIDRef="${CP_NORMAL}"><hp:t>${orderedNo}. </hp:t></hp:run>${runs(m[1])}`, PP_NORMAL));
    } else {
      parts.push(makeP(runs(line), PP_NORMAL));
    }
  }
  if (!parts.length) parts.push(makeP(`<hp:run charPrIDRef="${CP_NORMAL}"><hp:t> </hp:t></hp:run>`));
  return parts.join('\n');
}

// ── HWPX 고정 파트 (본체 documentExport.ts에서 이식 — 한글 로드 검증본) ──
const XMLNS = `xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"`;

const SEC_PR = `<hp:p id="999999999" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="PORTRAIT" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="1700" footer="1700" gutter="0" left="5004" right="5004" top="4252" bottom="4252"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:notefillBorder id="" threeD="0" shadow="0" centerLine="0" breakCellSeparateLine="0"><hp:slash type="N" crooked="0" isCounter="0"/><hp:backSlash type="N" crooked="0" isCounter="0"/><hp:leftBorder type="N" width="0.12 mm" color="#000000"/><hp:rightBorder type="N" width="0.12 mm" color="#000000"/><hp:topBorder type="N" width="0.12 mm" color="#000000"/><hp:bottomBorder type="N" width="0.12 mm" color="#000000"/><hp:diagonal type="N" width="0.12 mm" color="#000000"/></hp:notefillBorder><hp:posRelToMM lineDistance="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="0" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="0" aboveLine="0"/><hp:notefillBorder id="" threeD="0" shadow="0" centerLine="0" breakCellSeparateLine="0"><hp:slash type="N" crooked="0" isCounter="0"/><hp:backSlash type="N" crooked="0" isCounter="0"/><hp:leftBorder type="N" width="0.12 mm" color="#000000"/><hp:rightBorder type="N" width="0.12 mm" color="#000000"/><hp:topBorder type="N" width="0.12 mm" color="#000000"/><hp:bottomBorder type="N" width="0.12 mm" color="#000000"/><hp:diagonal type="N" width="0.12 mm" color="#000000"/></hp:notefillBorder><hp:posRelToMM lineDistance="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="0" textRangeType="PAPER" headerRangeType="PAPER" footerRangeType="PAPER" fillAreaType="PAPER"/><hp:masterPage name="" gridIDRef="0" listHeaderIDRef="0" listFooterIDRef="0" masterPageIDRef="0"/></hp:secPr></hp:run></hp:p>`;

const sectionXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec ${XMLNS}>
${SEC_PR}
${body}
</hs:sec>`;

const VERSION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ver:version xmlns:ver="http://www.hancom.co.kr/hwpml/2011/version" major="5" minor="1" micro="2" buildNumber="0"/>`;

const fontface = (lang) => `<hh:fontface lang="${lang}" fontCnt="3"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_UNKNOWN" weight="0" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="252" xHeight="255"/></hh:font><hh:font id="1" face="맑은 고딕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_UNKNOWN" weight="0" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="252" xHeight="255"/></hh:font><hh:font id="2" face="굴림" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_UNKNOWN" weight="0" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="252" xHeight="255"/></hh:font></hh:fontface>`;

const charPr = (id, height, bold, fontRef) => `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0"${bold ? ' bold="1"' : ''} symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="${fontRef}" latin="${fontRef}" hanja="${fontRef}" japanese="${fontRef}" other="${fontRef}" symbol="${fontRef}" user="${fontRef}"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`;

const paraPr = (id, align) => `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hp:case><hp:default><hh:margin intent="0" left="0" right="0" prev="0" next="0"/><hh:lineSpacing type="PERCENT" value="160"/></hp:default></hp:switch></hh:paraPr>`;

const borderfill = (id, type) => `<hh:borderfill id="${id}" threeD="0" shadow="0" centerLine="0" breakCellSeparateLine="0"><hh:slash type="N" crooked="0" isCounter="0"/><hh:backSlash type="N" crooked="0" isCounter="0"/><hh:leftBorder type="${type}" width="0.12 mm" color="#000000"/><hh:rightBorder type="${type}" width="0.12 mm" color="#000000"/><hh:topBorder type="${type}" width="0.12 mm" color="#000000"/><hh:bottomBorder type="${type}" width="0.12 mm" color="#000000"/><hh:diagonal type="N" width="0.12 mm" color="#000000"/></hh:borderfill>`;

const HEADER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head ${XMLNS} version="1.5" secCnt="1">
<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
<hh:refList>
<hh:fontfaces itemCnt="7">
${['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'].map(fontface).join('\n')}
</hh:fontfaces>
<hh:borderfills itemCnt="3">
${borderfill(0, 'N')}
${borderfill(1, 'SOLID')}
${borderfill(2, 'N')}
</hh:borderfills>
<hh:charProperties itemCnt="6">
${charPr(0, 1000, false, 0)}
${charPr(1, 1000, false, 1)}
${charPr(2, 1000, true, 0)}
${charPr(3, 3200, true, 1)}
${charPr(4, 2600, true, 1)}
${charPr(5, 2200, true, 1)}
</hh:charProperties>
<hh:tabProperties itemCnt="1">
<hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>
</hh:tabProperties>
<hh:paraProperties itemCnt="2">
${paraPr(0, 'JUSTIFY')}
${paraPr(1, 'CENTER')}
</hh:paraProperties>
<hh:styles itemCnt="2">
<hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
<hh:style id="1" type="PARA" name="본문" engName="Body" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="1" langID="1042" lockForm="0"/>
</hh:styles>
</hh:refList>
<hh:compatibleDocument targetProgram="HWP201X">
<hh:layoutCompatibility/>
</hh:compatibleDocument>
</hh:head>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/META-INF/manifest.xml" ContentType="application/vnd.hancom.hwpx-manifest+xml"/>
  <Override PartName="/Contents/content.hpf" ContentType="application/hwpml-package+xml"/>
  <Override PartName="/Contents/header.xml" ContentType="application/vnd.hancom.hwpx-header+xml"/>
  <Override PartName="/Contents/section0.xml" ContentType="application/vnd.hancom.hwpx-section+xml"/>
  <Override PartName="/version.xml" ContentType="application/vnd.hancom.version+xml"/>
</Types>`;

const MANIFEST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<manifest:manifest xmlns:manifest="http://www.hancom.co.kr/hwpml/2011/manifest">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.hancom.hwpx"/>
  <manifest:file-entry manifest:full-path="META-INF/manifest.xml" manifest:media-type="application/vnd.hancom.hwpx-manifest+xml"/>
  <manifest:file-entry manifest:full-path="version.xml" manifest:media-type="application/vnd.hancom.version+xml"/>
  <manifest:file-entry manifest:full-path="Contents/content.hpf" manifest:media-type="application/hwpml-package+xml"/>
  <manifest:file-entry manifest:full-path="Contents/header.xml" manifest:media-type="application/vnd.hancom.hwpx-header+xml"/>
  <manifest:file-entry manifest:full-path="Contents/section0.xml" manifest:media-type="application/vnd.hancom.hwpx-section+xml"/>
</manifest:manifest>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://www.hancom.co.kr/hwpml/2011/relationship/hwpx" Target="Contents/header.xml"/>
</Relationships>`;

const CONTENT_HPF = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id="">
  <opf:metadata>
    <opf:title>문서</opf:title>
    <opf:language>ko</opf:language>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header" linear="yes"/>
    <opf:itemref idref="section0" linear="yes"/>
  </opf:spine>
</opf:package>`;

// ── 문서함 기록 ───────────────────────────────────────────────────
function recordDocument(title, path) {
  try {
    const dir = join(homedir(), '.speciai');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'documents.jsonl'), JSON.stringify({
      ts: Date.now(), title: title || basename(path), docx: resolve(path), preview: null,
    }) + '\n');
  } catch { /* 무시 */ }
}

// ── main ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const titleIdx = argv.indexOf('--title');
const title = titleIdx >= 0 ? argv[titleIdx + 1] : '';
const openAfter = argv.includes('--open');
const files = argv.filter((a, i) => a !== '--title' && a !== '--open' && i !== titleIdx + 1);
const [input, output] = files;
if (!input || !output) {
  console.error('사용: node build-hwpx.mjs <입력.md> <출력.hwpx> [--title "문서 제목"] [--open]');
  process.exit(1);
}

const md = readFileSync(input, 'utf8');
const body = markdownToBody(md, title);
const zip = buildZip([
  { name: 'mimetype', data: Buffer.from('application/vnd.hancom.hwpx', 'utf8') },
  { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
  { name: '_rels/.rels', data: Buffer.from(RELS, 'utf8') },
  { name: 'META-INF/manifest.xml', data: Buffer.from(MANIFEST, 'utf8') },
  { name: 'version.xml', data: Buffer.from(VERSION_XML, 'utf8') },
  { name: 'Contents/content.hpf', data: Buffer.from(CONTENT_HPF, 'utf8') },
  { name: 'Contents/header.xml', data: Buffer.from(HEADER_XML, 'utf8') },
  { name: 'Contents/section0.xml', data: Buffer.from(sectionXml(body), 'utf8') },
]);
writeFileSync(output, zip);
recordDocument(title, output);
console.log(`생성 완료: ${output} (${(zip.length / 1024).toFixed(1)}KB) — 한글 2010+ 에서 열립니다`);

if (openAfter) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', resolve(output)] : [resolve(output)];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}
