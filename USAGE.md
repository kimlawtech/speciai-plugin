# SpeciAI 자문팀 — 사용 가이드

Claude Code 안에서 법무·노무·세무·재무·사업계획 자문을 받고 한국어 문서(DOCX)를 뽑는 플러그인. 이 문서는 최종 사용자 관점의 사용법. 내부 구조는 `CLI_PLUGIN_ARCHITECTURE.md`.

---

## 1. 설치

### 로컬 테스트 (지금 바로)

```bash
# 1) 서버 기동 (터미널 1)
cd ~/Desktop/speciai.team
node server/index.js                # 포트 3001

# 2) 플러그인 설치 (터미널 2)
cd ~/Desktop/speciai.team
claude plugin marketplace add ./plugin
claude plugin install speciai-advisory@speciai

# 3) 환경변수 — 로컬 서버 지정
export SPECIAI_BASE_URL=http://localhost:3001
export SPECIAI_API_KEY=sk_spc_...   # 아래 2절에서 발급
```

### 운영 배포 후 (사용자 안내용)

```bash
claude plugin marketplace add kimlawtech/speciai-plugin
claude plugin install speciai-advisory@speciai
export SPECIAI_API_KEY=sk_spc_...   # speciai.team → 설정 → CLI 키
# SPECIAI_BASE_URL 생략 시 https://speciai.team
```

영구 설정: `~/.zshrc`에 export 두 줄 추가. 설정 후 Claude Code 재시작해야 MCP가 키를 읽는다.

### Windows

요구사항은 동일(Node.js 18+ · Claude Code). PowerShell 기준:

```powershell
claude plugin marketplace add kimlawtech/speciai-plugin
claude plugin install speciai-advisory@speciai

# 세션용
$env:SPECIAI_API_KEY = "sk_spc_..."
# 영구 (새 터미널부터 적용)
setx SPECIAI_API_KEY "sk_spc_..."
```

env 설정이 번거로우면 대시보드로 대체 가능 — 플러그인 설치 경로에서:

```powershell
node "$env:USERPROFILE\.claude\plugins\<플러그인경로>\scripts\dashboard.mjs"
# → http://localhost:4747 설정 패널에서 키 저장 (%USERPROFILE%\.speciai\config.json)
# env가 없으면 MCP가 이 파일을 읽으므로 setx 없이도 동작. 저장 후 Claude Code 재시작.
```

플러그인·대시보드·DOCX 빌더 모두 의존성 0의 순수 Node라 macOS·Windows·Linux 동일 동작. 경로 처리는 전부 OS 중립(homedir 기반).

## 2. API 키 발급 — 콘솔 로그인이면 자동

가장 쉬운 방법: 콘솔에서 로그인하면 키가 자동 발급·연결된다.

```bash
node <플러그인경로>/scripts/dashboard.mjs   # → http://localhost:4747
# 회원가입 또는 Google 로그인 → CLI 키 자동 발급·저장 → 끝
```

콘솔 로그인 시 웹 계정과 완전 연동된다 — 채팅 기록·코워크 문서·쿼터가 웹과 동일하고, 사업 정보(온보딩)도 계정에서 가져온다.

## 2-1. API 키 수동 발급 (로그인 없이)

웹 UI(설정 → CLI 키)는 병행 작업 중. 그전까지는 API로 직접 발급:

```bash
# 웹 로그인 세션의 JWT 필요 (브라우저 개발자도구 → supabase auth token)
curl -X POST http://localhost:3001/api/plugin/keys \
  -H "Authorization: Bearer <JWT>" \
  -H "content-type: application/json" \
  -d '{"label":"my-cli"}'
# → {"success":true,"key":"sk_spc_..."}  ← 이 응답 1회만 노출. 즉시 저장할 것
```

키 관리:
```bash
curl http://localhost:3001/api/plugin/keys -H "Authorization: Bearer <JWT>"          # 목록
curl -X POST http://localhost:3001/api/plugin/keys/<id>/revoke -H "Authorization: Bearer <JWT>"  # 폐기(즉시 반영)
```

## 3. 기본 사용법 — 명령 4개

`/speciai-advisory:contract` — 계약서 생성. 필수 5개(유형·당사자·대금·기간·특약)만 한 번에 묻는 고속 인터뷰 → 표준 골격 초안 → 검증 → A4 DOCX 완성본이 즉시 열린다(`--open`). 한글(HWP) 제출처는 HWPX 동시 생성(한글 2010+에서 열림, .hwp 재저장 가능). 모든 완성 문서는 대시보드 문서함에 쌓여 클릭 한 번으로 A4 미리보기가 뜬다.

Claude Code 세션 안에서:

### /speciai-advisory:status — 현황 대시보드

```
> /speciai-advisory:status

┌─ SpeciAI 자문팀 ─────────────────────────
│ 플랜     : solo
│ 활성 팩  : 없음
│ 오늘 사용량 (2026-08-14)
│   search  ███░░░░░░░  3/10
│   law     █░░░░░░░░░  2/20
└──────────────────────────────────────────
```

### /speciai-advisory:advisory — 자문

```
> /speciai-advisory:advisory 직원을 해고하려는데 뭐부터 해야 해? 5인 사업장이고 입사 8개월차야
```

동작: 노무+법무 에이전트 병렬 분석 → 법령 RAG·법제처 검색으로 근거 확보 → 인용 전수 검증 → [종합 결론(액션 3개)] → [분야별 요지] → [기한] → [근거] 순으로 답변. 분야가 걸치면 [상충] 표시.

명시적으로 명령을 안 쳐도 된다 — 일반 대화에서 법률·세무·노무 질문이면 스킬이 자동 개입한다:

```
> 부가세 신고 놓쳤는데 가산세 얼마나 나와?
> 프리랜서 계약서에 꼭 넣어야 할 조항 뭐야?
> 투자받으면 세금 어떻게 돼?
```

### /speciai-advisory:bizplan — 사업계획서 생성

```
> /speciai-advisory:bizplan
```

흐름: ① 일괄 인터뷰(공고문 파일 첨부 가능 — 목차·배점 자동 추출) → ② PSST 4파트 생성 → ③ 검증 게이트(인용 실존·수치 출처·양식 대조, PASS까지 반복) → ④ `사업계획서_YYYYMMDD.docx` 출력 + 검증 리포트 부록.

무료는 문제인식 섹션 미리보기까지. 전체 생성은 결제 안내가 뜬다.

## 3-1. 로컬 대시보드 (에이전트 노드 뷰)

```bash
node ~/.claude/plugins/.../speciai-advisory/scripts/dashboard.mjs   # 또는 레포에서:
node plugin/speciai-advisory/scripts/dashboard.mjs
# → http://localhost:4747
```

브라우저 대시보드에 표시되는 것:
- 에이전트·도구 노드 맵 — 자문 중 어떤 에이전트가 움직이는지 실시간 점등 (MCP 이벤트 기반)
- 활동 로그 — 도구 호출 타임라인
- 플랜·팩·오늘 사용량 진행바 (10초 갱신)
- 설정 — API 키·서버 주소를 UI에서 저장 (~/.speciai/config.json, env 없을 때 MCP가 읽음. 저장 후 Claude Code 재시작)

127.0.0.1 전용 바인드라 외부 접근 불가. CLI 쪽에서는 별도 대시보드 없이도 에이전트 병렬 실행이 Claude Code 기본 진행 표시로 보이고, 자문 스킬이 "노무·법무 에이전트 투입" 같은 단계 내레이션을 출력한다.

## 4. MCP 도구 직접 호출 (고급)

Claude에게 자연어로 시키면 알아서 쓰지만, 직접 지시도 가능:

| 도구 | 용도 | 예시 지시 |
|---|---|---|
| speciai_search | 법령 RAG 검색 | "임금체불 지연이자 관련 법령 검색해줘" |
| speciai_law_search | 법제처 실시간 (law/prec/expc) | "근로기준법 최신 개정 확인해줘" |
| speciai_verify_citation | 인용 실존 검증 | "이 문서의 조문·판례 전부 검증해줘" |
| speciai_paylink | 결제 링크·QR | "사장님 올인원 결제 링크 줘" |
| speciai_status | 현황 | "내 사용량 보여줘" |

## 5. 요금·한도

| | 무료 | agent_labor 49,000/월 | agent_ceo 99,000/월 | agent_lawyer 149,000/월 |
|---|---|---|---|---|
| 검색/일 | 10 | 500 | 500 | 500 |
| 법령 조회/일 | 20 | 1,000 | 1,000 | 1,000 |
| 팩 | - | 노무 | 법무·노무·세무·재무·사업계획 | 법무·노무·형사서면 |
| 문서 완성본 | 미리보기 | 노무 문서 | 전체 | 법률 서면 |

건단위(구독 없이): 계약서·내용증명 29,000 / 의견서 99,000 / 사업계획서 190,000.

한도 도달 시 CLI에 결제 링크 + QR이 자동 표시된다. 결제(브라우저 또는 휴대폰 QR 스캔) 후 30초 내 반영 — 재시작 불필요.

## 6. 사용 시나리오 예시

시나리오 A — 알바 채용 (무료로 가능):
```
> 카페 알바 주 12시간 뽑으려는데 주휴수당 줘야 해?
→ labor 에이전트: 주 15시간 미만 → 주휴수당 미발생, 근거 조문 + 검증 표시
```

시나리오 B — 정부지원사업 (agent_ceo 또는 건단위):
```
> /speciai-advisory:bizplan
> (공고문 PDF 경로 제공, 아이템·팀 설명)
→ 20~30분 뒤 공고 양식에 맞춘 DOCX + 검증 리포트
```

시나리오 C — 분쟁 초기 대응:
```
> 거래처가 대금 3개월째 안 줘. 내용증명부터 소송까지 뭘 어떻게 해야 해?
→ legal 에이전트: 지급명령·소액소송 분기, 소멸시효, 내용증명은 doc_certmail 안내
```

## 7. 트러블슈팅

| 증상 | 원인·조치 |
|---|---|
| "인증 실패: SPECIAI_API_KEY가 없거나 무효" | env 미설정 또는 키 폐기됨. export 후 Claude Code 재시작 |
| 도구가 안 보임 | `claude plugin list`로 설치 확인, `/mcp`로 speciai 서버 연결 확인 |
| "오늘 무료 한도 소진" | 정상 — KST 자정 리셋 또는 결제 |
| 법령 검색 "IP 미등록" 에러 | 법제처가 로컬 IP 차단. 운영 서버(SPECIAI_BASE_URL=https://speciai.team) 경유 필요 |
| DOCX 안 열림 | `node plugin/speciai-advisory/scripts/build-docx.mjs 입력.md 출력.docx`로 단독 재실행해 에러 확인 |
| 검색이 자꾸 402 | 무료 일 10회 소진. status로 사용량 확인 |

## 8. 개인정보

- 자문 입력의 실명·주민번호·연락처는 에이전트·서버 전달 전 마스킹된다(스킬 규칙 + 서버 chatMask 이중).
- 검색 질의에는 개인정보가 포함되지 않는다 — 쟁점만 일반화해 검색.
- 최종 문서(로컬 파일)에서만 실명 복원.
- API 키는 서버에 해시로만 저장 — 유출 시 폐기 후 재발급.
