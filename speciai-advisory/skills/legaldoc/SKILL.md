---
name: legaldoc
description: 법률문서 작성 — 소장·답변서·준비서면·지급명령·가압류·가처분·강제집행 신청·행정심판 청구·정관·주주간계약(SHA·SAFE)·취업규칙·합의서·위임장·진술서·사실확인서 등 30여 유형. 문서군(계약/소송/통지/진술)별 규범과 공정위·법률구조공단 참조 자산으로 실무 검토 수준 초안을 A4 DOCX·HWPX로 출력. "소장 써줘", "답변서 작성", "가압류 신청서", "정관 만들어줘", "주주간계약서", "취업규칙", /speciai-advisory:legaldoc 호출 시 사용. (계약서 일반은 contract, 내용증명은 certmail, 형사 서면은 criminal 스킬이 우선)
---

# 법률문서 파이프라인

시작하자마자 speciai_brief(domain: "skill_legaldoc")를 호출해 절차를 받고, 문서 종류가 확정되는 즉시 speciai_doc_guide(docType, context)로 해당 유형의 작성 규칙·필수 항목·참조 자산을 받는다. 두 지침을 그대로 따른다.

법령·판례 인용은 speciai_verify_citation으로 전수 검증한다. 완성본은 `node ${CLAUDE_PLUGIN_ROOT}/scripts/build-docx.mjs 입력.md 출력.docx --open`, 법원·행정기관 제출용은 build-hwpx.mjs로 .hwpx도 생성한다.

관할법원·사건번호·상대방 주소·계좌처럼 사용자가 주지 않은 값은 절대 채우지 않고 공란과 "확인이 필요한 사항"으로 남긴다.

키 미설정·한도 초과 시: 해당 문서의 일반 구조(항목 목차)만 안내하고 초안은 생성하지 않는다.
