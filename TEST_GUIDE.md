# SpeciAI 자문팀 플러그인 — 테스트 가이드

테스터가 설치부터 문서 생성까지 직접 돌려보고 합격/불합격을 판정하기 위한 절차. 각 항목에 기대 결과와 합격 기준을 적어 두었다. 소요 시간 전체 약 40분.

## 0. 준비물

| 항목 | macOS | Windows |
|---|---|---|
| Node.js 18+ | `node -v` | `node -v` (공식 설치본 — 한글 CSV 디코딩에 필요한 ICU가 들어 있다) |
| Claude Code | `claude --version` | 동일 + Git for Windows(Claude Code 선행 요구사항, 내부 Bash 실행에 사용) |
| 계정 | speciai.team 계정(구글 로그인 가능) | 동일 |
| 브라우저 | Chrome/Safari | Chrome/Edge |

플러그인 자체는 npm 의존성 0 — `npm install` 없음.

## 1. 설치 (5분)

```bash
claude plugin marketplace add kimlawtech/speciai-plugin
claude plugin install speciai-advisory@speciai
claude plugin list          # speciai-advisory 표시되면 OK
```

Windows PowerShell도 명령 동일. 설치 경로: macOS `~/.claude/plugins/marketplaces/speciai/speciai-advisory`, Windows `%USERPROFILE%\.claude\plugins\marketplaces\speciai\speciai-advisory`.

합격: `claude plugin list`에 표시 + 설치 폴더에 `skills/` 10개, `mcp/server.mjs` 존재.

## 2. 키 연결 (3분)

### A. 콘솔 로그인 — 권장

```bash
node <설치경로>/scripts/dashboard.mjs
# Windows: node "%USERPROFILE%\.claude\plugins\marketplaces\speciai\speciai-advisory\scripts\dashboard.mjs"
```

브라우저에서 http://localhost:4747 열림 → 로그인(구글 또는 이메일) → 유형 선택(기업/소상공인/전문직) → 사업정보 온보딩.

체크:
- [ ] 구글 로그인 후 404 없이 콘솔로 복귀
- [ ] 이메일 가입 시 확인 메일이 `contact@speciai.ai.kr`에서 5분 내 도착
- [ ] 온보딩 1단계에서 사업자등록번호 입력 → "국세청 조회" → 초록색 "계속사업자 · 과세유형" 표시
- [ ] 온보딩 완료 → 팀 설정 화면 진입, 새로고침해도 유지
- [ ] 콘솔 설정(톱니) 페이지에 CLI 키가 "sk_spc_…" 마스킹으로 표시 (자동 발급됨)

### B. 수동 (콘솔 없이)

speciai.team → 설정 → CLI 키 발급 → 환경변수:

```bash
export SPECIAI_API_KEY=sk_spc_...        # macOS/Linux (~/.zshrc)
setx SPECIAI_API_KEY "sk_spc_..."        # Windows (새 터미널부터)
```

키 없이 Claude Code에서 `/speciai-advisory:status`를 치면 콘솔 로그인 안내가 떠야 한다(합격 기준).

## 3. Claude Code 재시작 후 기본 동작 (5분)

```
> /speciai-advisory:status
```
- [ ] 고정폭 박스로 플랜·오늘 사용량 표시 (무료: search 10 / law 20 / verify 20 / brief 30 / chat 5)

```
> 사업자번호 192-34-01701 이 거래처 정상이야?
```
- [ ] "계속사업자 · 부가가치세 일반과세자" 응답 (국세청 실시간)

```
> 근로기준법 제17조랑 민법 제999조 실제로 있는 조문이야? 확인해줘
```
- [ ] 두 건 모두 "실존 확인" (법제처). 가짜 조문(예: 근로기준법 제999조)을 넣으면 "환각 의심"으로 걸러져야 한다

## 4. 자문 (5분)

```
> 카페 알바 주 12시간 뽑으려는데 주휴수당 줘야 해?
```
- [ ] 노무 에이전트 개입, 주 15시간 미만 → 미발생 결론, 근거 조문 번호 표시
- [ ] 개인정보(실명·연락처)를 섞어 물어도 답변·검색 질의에 그대로 노출되지 않음

콘솔 `팀` 페이지에서 세무 에이전트를 끄고 "부가세 신고 언제야?"를 물으면 세무 에이전트가 스폰되지 않아야 한다(팀 설정 연동 합격 기준).

## 5. 문서 생성 (10분)

### 계약서
```
> /speciai-advisory:contract
> 프리랜서 개발 용역, 갑 주식회사 테스트 / 을 홍길동, 대금 500만원 검수 후 지급, 기간 2개월, 특약 없음
```
- [ ] 질문은 한 번(필수 5개)만 — 되묻기 없음
- [ ] 완성 후 DOCX가 자동으로 열림(Word/Pages/한글). A4, 제N조(제목) 체계
- [ ] 무료 플랜이면 주요 조항 3개 미리보기 + 결제 링크·QR 표시 (터미널에 QR 렌더)
- [ ] 콘솔 `문서함`에 항목이 생기고 클릭 시 A4 미리보기

### 법률문서
```
> 거래처가 물품대금 3,300만원을 안 줘. 소장 써줘. 우리는 개인사업자, 상대는 주식회사야
```
- [ ] 소장 구조(당사자→청구취지→청구원인→입증방법→첨부서류) 유지
- [ ] 관할법원·사건번호는 채우지 않고 "확인이 필요한 사항"에 남김
- [ ] 소멸시효(상사 5년)·인지액 언급

### 내용증명
```
> 월세 보증금 2,000만원 계약 끝났는데 안 돌려줘. 내용증명 보내줘
```
- [ ] 보증금 반환 유형 자동 분기, 우체국 규격 DOCX

## 6. 장부·증빙 (7분)

은행 거래내역 CSV 하나 준비(KB·신한·우리·하나·IBK 아무거나. 없으면 아래 샘플).

```csv
거래일자,적요,출금액,입금액,잔액
2026-07-02,스타벅스 강남점,12500,,987500
2026-07-03,GOOGLE ADS,330000,,657500
2026-07-05,입금 (주)클라이언트,,2200000,2857500
2026-07-10,배달의민족,89000,,2768500
```

```
> 이 폴더의 bank.csv 장부로 정리해줘
```
- [ ] 스타벅스→복리후생비, GOOGLE ADS→광고선전비, 배민 89,000(5만 초과)→접대비 자동 분류
- [ ] "입금 (주)클라이언트"는 미분류로 남아 계정과목을 물어봄
- [ ] 손익 요약 + `~/.speciai/jangbu/세무사전달_*.csv` 생성(국세청 코드 컬럼 포함)
- [ ] 거래 내역이 서버로 전송되지 않음(네트워크 요청은 시드 수신 1회뿐)

영수증 사진 첨부 후 "이 영수증 장부에 넣어줘":
- [ ] 공급자·금액·세액 추출, 합계 검산, 사업자번호 국세청 교차검증

## 7. 콘솔 화면 (5분)

http://localhost:4747 에서:
- [ ] 채팅: 웹과 동일한 대화 기록, 메시지 전송 시 실시간 스트리밍
- [ ] 워크플로우 캔버스: 노드 생성·저장 → CLI에서 워크플로우 이름 부르면 그 순서로 실행
- [ ] 컴플라이언스 대시보드: 온보딩 업종 태그·트래킹 키워드 표시
- [ ] 문서 편집기: 한글(HWP) 편집기 메뉴바·캔버스 로드(WASM), HWP 열기·저장

## 8. 결제 (2분, 실결제는 선택)

```
> 사장님 올인원 결제 링크 줘
```
- [ ] 링크 + 터미널 QR. 링크 열면 "사장님 올인원 99,000원" 결제 모달 + 카드 결제 위젯
- [ ] (실결제 시) 30초 내 `/speciai-advisory:status`의 활성 팩이 5개로 바뀜 — 재시작 불필요

## 9. 성능 기준치 (참고)

| 항목 | 기준 |
|---|---|
| status·brief·문서 가이드 | 0.5초 이내 (첫 호출), 이후 0.1초 |
| 인용 검증 | 건당 0.6초 (법제처 응답) |
| DOCX/HWPX 생성 | 0.1초 이내 |
| 장부 5,000건 분류 | 0.1초 이내 |
| 콘솔 기동 | 1초 이내 |
| 분당 60회 초과 호출 | 429 — 정상 |

이보다 눈에 띄게 느리면 `SPECIAI_BASE_URL`이 로컬 서버를 가리키고 있거나 법제처 장애다.

## 10. Windows 특이사항

- 전 스크립트가 `process.platform` 분기와 `path.join`을 써서 경로·파일 열기(`cmd /c start`)가 Windows에서 동일 동작한다. 별도 셸 의존 없음.
- 환경변수는 `setx` 후 새 터미널에서만 반영. 콘솔 로그인 방식(2-A)을 쓰면 `%USERPROFILE%\.speciai\config.json`에 저장돼 env 설정이 필요 없다.
- 한글 파일명(`세무사전달_2026-07.csv`) 생성·열기 정상. CSV를 Excel로 열 때 BOM이 포함돼 한글 깨짐 없음.
- HWP 편집기(콘솔)는 브라우저 WASM이라 OS 무관. `.hwpx` 산출물은 한글 2010+에서 열린다.
- 알려진 제약: PowerShell에서 `${CLAUDE_PLUGIN_ROOT}` 같은 변수는 Claude Code가 내부에서 치환하므로 사용자가 직접 칠 일은 없다. 직접 스크립트를 실행할 때만 절대경로를 쓴다.

## 11. 트러블슈팅

| 증상 | 조치 |
|---|---|
| 도구가 안 보임 | `claude plugin list` 확인 → Claude Code 재시작 → `/mcp`에서 speciai 연결 확인 |
| "인증 실패: SPECIAI_API_KEY" | 콘솔 로그인(2-A) 또는 env 설정 후 재시작 |
| 국세청 조회 실패 | 사업자번호 10자리 확인. 콘솔이 구버전이면 `dashboard.mjs` 재실행 |
| 확인 메일 안 옴 | 스팸함 확인. 시간당 30통 한도 — 대량 테스트 시 구글 로그인 사용 |
| 문서가 안 열림 | `node <설치경로>/scripts/build-docx.mjs 입력.md 출력.docx`를 직접 실행해 에러 확인 |
| 402 daily_limit | 무료 한도 소진 — KST 자정 리셋 또는 결제 |

## 12. 결과 보고 양식

```
환경: macOS 15 / Windows 11, Node 22.x, Claude Code x.y
[1 설치] PASS/FAIL
[2 키] PASS/FAIL — 방식 A/B
[3 기본] PASS/FAIL
[4 자문] PASS/FAIL
[5 문서] 계약서 PASS/FAIL · 소장 PASS/FAIL · 내용증명 PASS/FAIL
[6 장부] PASS/FAIL
[7 콘솔] PASS/FAIL
[8 결제] PASS/FAIL/SKIP
특이사항: (증상 · 재현 명령 · 스크린샷)
```
