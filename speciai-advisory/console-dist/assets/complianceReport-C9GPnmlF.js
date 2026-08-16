const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-ClIWWXPh.js","assets/index-CQvy5D3i.css"])))=>i.map(i=>d[i]);
import{_}from"./index-ClIWWXPh.js";const j={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function e(o){return o?o.replace(/[&<>"']/g,n=>j[n]??n):""}function k(o){return o?o.replace(/\.+/g,".").replace(/\.$/,"").slice(0,10):""}function m(){const o=new Date;return`${o.getFullYear()}-${String(o.getMonth()+1).padStart(2,"0")}-${String(o.getDate()).padStart(2,"0")}`}function z(o){var s;const n=new Date,r=`${n.getFullYear()}년 ${n.getMonth()+1}월`;return`${((s=o.basicInfo)==null?void 0:s.name)||"회사"} 컴플라이언스 리포트 (${r})`}function p(o){var g,f,b,y,x,w,$,v,F;const{company:n,obligations:r,adminAnnounce:s,lawmakingAnnounce:i,compliance:c,peerCases:l,enforcement:a}=o,d=z(n),E=m(),A=r.map((t,D)=>`
    <tr>
      <td class="num">${D+1}</td>
      <td><span class="badge ${t.category}">${t.category==="mandatory"?"의무":t.category==="enforcement"?"집행":"권고"}</span></td>
      <td><strong>${e(t.title)}</strong></td>
      <td>${e(t.source)}</td>
      <td>${e(t.deadline??"")}</td>
      <td>${e(t.rationale)}</td>
      <td class="num">${t.score}</td>
    </tr>
  `).join(""),C=s.slice(0,15).map(t=>`
    <tr>
      <td>${e(t.admAnnounceNm)}</td>
      <td>${e(t.cptOfiOrgNm)}</td>
      <td class="num">${e(t.admAnnounceDt)}</td>
      <td class="num">${e(t.admAnnounceEdDt)}</td>
    </tr>
  `).join(""),R=i.slice(0,15).map(t=>`
    <tr>
      <td>${e(t.lsNmKo)}</td>
      <td>${e(t.cptOfiOrgNm)}</td>
      <td>${e(t.rrFrNm)}</td>
      <td class="num">${e(t.lmAnnounceDt)}</td>
      <td class="num">${e(t.lmAnnounceEdDt)}</td>
    </tr>
  `).join(""),B=c.slice(0,12).map(t=>`
    <tr>
      <td>${e(t.source)}</td>
      <td>${e(t.category)}</td>
      <td><strong>${e(t.title)}</strong>${t.summary?`<br/><span class="muted">${e(t.summary)}</span>`:""}</td>
      <td class="num">${e(t.date)}</td>
    </tr>
  `).join(""),u=l.slice(0,10).map(t=>`
    <li><strong>${e(t.title)}</strong><br/><span class="muted">${e(t.media.name)} · ${e(k(t.pubDate))}</span></li>
  `).join(""),h=a.slice(0,10).map(t=>`
    <li><strong>${e(t.title)}</strong><br/><span class="muted">${e(t.media.name)} · ${e(k(t.pubDate))}</span></li>
  `).join("");return`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${e(d)}</title>
<link rel="preload" href="/fonts/Pretendard-Regular.woff2" as="font" type="font/woff2" crossorigin />
<style>
  @font-face {
    font-family: 'Pretendard';
    font-weight: 400;
    font-style: normal;
    font-display: swap;
    src: url('/fonts/Pretendard-Regular.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Pretendard';
    font-weight: 700;
    font-style: normal;
    font-display: swap;
    src: url('/fonts/Pretendard-Bold.woff2') format('woff2');
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #191F28;
    background: white;
    margin: 0;
    padding: 32px 40px;
    font-size: 12px;
    line-height: 1.5;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #191F28; }
  .meta { color: #6B7684; font-size: 11px; margin-bottom: 24px; }
  .summary {
    background: #F9FAFB;
    border: 1px solid #E5E8EB;
    border-radius: 8px;
    padding: 14px;
    margin: 16px 0 8px;
    font-size: 11.5px;
  }
  .summary strong { display: inline-block; min-width: 110px; color: #4E5968; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  th, td { padding: 7px 8px; text-align: left; border-bottom: 1px solid #E5E8EB; vertical-align: top; }
  th { background: #F2F4F6; font-weight: 700; color: #4E5968; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #8B95A1; font-size: 10.5px; }
  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    border: 1px solid;
  }
  .badge.mandatory { background: #FEF2F2; color: #B91C1C; border-color: #FECACA; }
  .badge.enforcement { background: #FFF7ED; color: #C2410C; border-color: #FED7AA; }
  .badge.advisory { background: #FFFBEB; color: #B45309; border-color: #FDE68A; }
  ul { padding-left: 18px; margin: 8px 0; }
  ul li { margin-bottom: 6px; }
  .footer {
    margin-top: 40px;
    padding-top: 14px;
    border-top: 1px solid #E5E8EB;
    font-size: 10px;
    color: #8B95A1;
    text-align: center;
  }
  .actions {
    position: sticky; top: 0;
    background: white;
    padding: 12px 0;
    margin: -32px -40px 24px;
    padding: 16px 40px;
    border-bottom: 1px solid #E5E8EB;
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  .actions button {
    background: #1558E0;
    color: white;
    border: 0;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 700;
    cursor: pointer;
    font-size: 12px;
  }
  .actions button.secondary { background: #F2F4F6; color: #4E5968; }
  @media print {
    .actions { display: none !important; }
    body { padding: 24px; }
    h2 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
  @page { size: A4; margin: 16mm; }
</style>
</head>
<body>
  <div class="actions">
    <span class="muted">컴플라이언스 리포트 — 화면을 확인 후 인쇄(또는 PDF로 저장)하세요.</span>
    <div>
      <button class="secondary" onclick="window.close()">닫기</button>
      <button onclick="window.print()">인쇄 / PDF 저장</button>
    </div>
  </div>

  <h1>${e(d)}</h1>
  <div class="meta">생성일 ${E} · 회사 ${e(((g=n.basicInfo)==null?void 0:g.name)??"")} · 업종 ${e((((f=n.business)==null?void 0:f.industry)??[]).join(", "))}</div>

  <div class="summary">
    <div><strong>대표자</strong> ${e(((b=n.basicInfo)==null?void 0:b.ceoName)??"-")}</div>
    <div><strong>사업자번호</strong> ${e(((y=n.basicInfo)==null?void 0:y.regNumber)??"-")}</div>
    <div><strong>직원수</strong> ${e(((x=n.organization)==null?void 0:x.employeeCount)??"-")} (${((w=n.organization)==null?void 0:w.employeeCountNum)??0}명)</div>
    <div><strong>연 매출</strong> ${e((($=n.investment)==null?void 0:$.annualRevenue)??"-")}</div>
    <div><strong>업종/섹터</strong> ${e([...((v=n.business)==null?void 0:v.industry)??[],...((F=n.business)==null?void 0:F.sectors)??[]].join(", ")||"-")}</div>
  </div>

  <h2>1. 우선순위 컴플라이언스 의무 Top ${r.length}</h2>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th style="width:48px">분류</th>
        <th>의무 항목</th>
        <th style="width:120px">근거 기관</th>
        <th style="width:160px">시행일</th>
        <th>임박 사유</th>
        <th style="width:50px">점수</th>
      </tr>
    </thead>
    <tbody>${A||'<tr><td colspan="7" class="muted">데이터 없음</td></tr>'}</tbody>
  </table>

  <h2>2. 행정예고 (고시·훈령·예규)</h2>
  <table>
    <thead>
      <tr>
        <th>예고명</th>
        <th style="width:140px">소관부처</th>
        <th style="width:100px">시작일</th>
        <th style="width:100px">종료일</th>
      </tr>
    </thead>
    <tbody>${C||'<tr><td colspan="4" class="muted">데이터 없음</td></tr>'}</tbody>
  </table>

  <h2>3. 입법예고</h2>
  <table>
    <thead>
      <tr>
        <th>법령명</th>
        <th style="width:140px">소관부처</th>
        <th style="width:80px">제·개정</th>
        <th style="width:100px">시작일</th>
        <th style="width:100px">종료일</th>
      </tr>
    </thead>
    <tbody>${R||'<tr><td colspan="5" class="muted">데이터 없음</td></tr>'}</tbody>
  </table>

  <h2>4. 주요 컴플라이언스 가이드·보도자료</h2>
  <table>
    <thead>
      <tr>
        <th style="width:120px">기관</th>
        <th style="width:80px">분류</th>
        <th>제목·요약</th>
        <th style="width:90px">일자</th>
      </tr>
    </thead>
    <tbody>${B||'<tr><td colspan="4" class="muted">데이터 없음</td></tr>'}</tbody>
  </table>

  <h2>5. 집행·제재 동향</h2>
  ${h?`<ul>${h}</ul>`:'<div class="muted">데이터 없음</div>'}

  <h2>6. 동종업계 처분 사례</h2>
  ${u?`<ul>${u}</ul>`:'<div class="muted">매칭되는 최근 사례 없음</div>'}

  <div class="footer">
    Speciai.team 컴플라이언스 리포트 · 본 리포트는 자동 수집된 공개 정보 기반의 참고자료이며 법률 자문을 대신하지 않습니다.
  </div>
</body>
</html>`}function P(o){return p(o)}function N(o){var a;if(typeof window>"u")return;const n=p(o),r=new Blob([n],{type:"text/html;charset=utf-8"}),s=URL.createObjectURL(r),i=document.createElement("a"),c=m(),l=(((a=o.company.basicInfo)==null?void 0:a.name)||"company").replace(/[^\w가-힣\-]/g,"_");i.href=s,i.download=`${l}_컴플라이언스리포트_${c}.html`,document.body.appendChild(i),i.click(),document.body.removeChild(i),setTimeout(()=>URL.revokeObjectURL(s),1e3)}async function O(o,n){var l;const r=p(o),i=`[Speciai] ${((l=o.company.basicInfo)==null?void 0:l.name)||"회사"} 컴플라이언스 리포트 (${m()})`,{apiFetch:c}=await _(async()=>{const{apiFetch:a}=await import("./index-ClIWWXPh.js").then(d=>d.$);return{apiFetch:a}},__vite__mapDeps([0,1]));try{const a=await c("/api/compliance/report/email",{method:"POST",body:JSON.stringify({html:r,subject:i,to:n})}),d=await a.json().catch(()=>({}));return a.ok&&d.success?{ok:!0,configured:!0,to:d.to}:d.error==="email_provider_not_configured"?{ok:!1,configured:!1,message:d.message||"이메일 인프라 미연결"}:{ok:!1,configured:!0,message:d.message||d.error||"발송 실패"}}catch(a){return{ok:!1,configured:!0,message:String(a)}}}function I(o){if(typeof window>"u")return!1;const n=p(o),r=window.open("","_blank","width=900,height=1100");if(!r)return alert("팝업이 차단되었습니다. 인앱 모달에서 보거나 파일로 다운로드해주세요."),!1;try{r.opener=null}catch{}return r.document.open(),r.document.write(n),r.document.close(),!0}export{P as buildComplianceReportHtml,N as downloadComplianceReport,O as emailComplianceReport,I as openComplianceReport};
