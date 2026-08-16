# SpeciAI CLI 자문팀 플러그인

Claude Code 안에서 법무·노무·세무·재무·사업계획 전문 에이전트가 검증된 근거로 자문하고, 한국어 문서(사업계획서·계약서·의견서)를 DOCX로 생성한다.

## 설치

```bash
# 1. 마켓플레이스 추가
claude plugin marketplace add kimlawtech/speciai-plugin

# 2. 플러그인 설치
claude plugin install speciai-advisory@speciai

# 3. API 키 설정 (https://speciai.team → 설정 → CLI 키 발급)
export SPECIAI_API_KEY=sk_spc_...
```

## 사용

| 명령 | 기능 |
|---|---|
| `/speciai-advisory:advisory <질문>` | 자문팀 종합 자문 — 분야 자동 분해·병렬 분석·상충 표시 |
| `/speciai-advisory:bizplan` | 정부지원 사업계획서 생성 (인터뷰→생성→검증→DOCX) |
| `/speciai-advisory:status` | 플랜·사용량·크레딧 대시보드 |

일반 대화 중에도 법령·세무·노무 질문이면 자문팀 에이전트가 자동 개입한다.

## 무엇이 다른가

- 인용 검증 게이트: 모든 조문·판례를 법제처 API로 실존 확인. 환각 인용은 문서에 실리지 않는다.
- 수치 단일 소스: 최저임금·요율·기한은 모델 기억이 아니라 서버 데이터가 정답.
- 검증 리포트 첨부: 무엇을 어떤 근거로 확인했는지 문서에 부록으로 남는다.

## 요금

| 상품 | 가격 | 포함 |
|---|---|---|
| 무료 | 0 | 검색 일 10회 · 법령 조회 일 20회 · 문서 미리보기 |
| 노무 에이전트 (agent_labor) | 월 49,000원 | 노무 자문 무제한 |
| 사장님 올인원 (agent_ceo) | 월 99,000원 | 법무·노무·세무·재무·사업계획 전체 |
| 변호사 에디션 (agent_lawyer) | 월 149,000원 | 법무·노무 + 형사서면 |
| 건단위: 계약서·내용증명 | 29,000원/건 | 구독 없이 1건 |
| 건단위: 법률 의견서 | 99,000원/건 | |
| 건단위: 사업계획서(정부양식) | 190,000원/건 | |

구독은 웹 크레딧도 함께 부여 — 구독 하나로 CLI + 웹.

한도 도달 시 CLI에 결제 링크가 표시된다. 결제 후 즉시 반영.

## 디렉토리

```
speciai-advisory/
├── .claude-plugin/plugin.json
├── .mcp.json                 # MCP 서버 등록 (의존성 0, node 단일 파일)
├── mcp/server.mjs            # status·search·law·verify·paylink 도구
├── agents/                   # legal·labor·tax·finance·bizplan·verifier
├── skills/                   # advisory·bizplan·status
└── scripts/build-docx.mjs    # 마크다운 → DOCX (의존성 0)
```

## 면책

본 플러그인의 산출물은 일반적 정보 제공이며 변호사·세무사·노무사의 개별 자문을 대체하지 않는다.
