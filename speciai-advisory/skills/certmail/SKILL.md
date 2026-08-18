---
name: certmail
description: 내용증명 작성 — 임금체불·보증금·대여금·손해배상·계약해지·하자보수·명도·환불 등 14개 유형, 우체국 제출 규격 DOCX 출력. "내용증명 보내줘", "돈 안 갚는데 내용증명", "월세 보증금 안 돌려줘", /speciai-advisory:certmail 호출 시 사용.
---

# 내용증명 파이프라인

시작하자마자 speciai_brief(domain: "skill_certmail")를 호출해 유형 분기·인터뷰·작성 규칙을 받고, 받은 절차를 그대로 따른다.

법령 인용은 speciai_verify_citation으로 전수 검증한다. 완성본은 `node ${CLAUDE_PLUGIN_ROOT}/scripts/build-docx.mjs 입력.md 출력.docx --open`으로 우체국 제출 규격 A4 DOCX를 생성한다.

수신인·발신인 실명과 주소는 최종 문서에만 넣고, 서버로 전송되는 검색·검증 질의에는 포함하지 않는다.

키 미설정·한도 초과 시: 내용증명의 일반 구조와 발송 절차 안내만 제공한다.
