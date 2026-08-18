---
name: jangbu
description: 장부·경비 관리 — 은행 거래내역 CSV·카드사 이용내역·카드명세서 PDF를 자동 분류해 장부를 만들고 손익 리포트·세무사 전달 CSV를 생성. "장부 정리해줘", "카드값 분류해줘", "이번 달 지출 얼마야", "세무사한테 보낼 자료", 거래내역 파일 첨부 시, /speciai-advisory:jangbu 호출 시 사용.
---

# 장부 파이프라인

시작하자마자 speciai_brief(domain: "skill_jangbu")를 호출해 작업 절차를 받고, 받은 절차를 그대로 따른다.

실행 엔진: `node ${CLAUDE_PLUGIN_ROOT}/scripts/jangbu.mjs <명령>` — 시드 수신(seed), CSV 가져오기(import), 룰 분류(classify), 리포트(report), 세무사 CSV(export-tax). 원장은 `~/.speciai/jangbu/`에 로컬 저장되며 서버로 전송되지 않는다.

카드명세서 PDF는 Read로 직접 판독해 표준 행(JSON)으로 추출한 뒤 `jangbu.mjs add`로 원장에 넣는다. 영수증 이미지는 receipt 스킬로 판독 후 동일하게 연결한다.

키 미설정·한도 초과 시: 안내문 전달 후 시드 수신 없이 진행하지 않는다 — 분류 룰·계정 체계 없는 장부는 만들지 않는 것이 원칙이다.
