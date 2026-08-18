---
name: privacy
description: 개인정보처리방침·이용약관 생성 — 한국 개인정보 보호법(2025.4 작성지침·2026.3 개정 반영) 기준. "개인정보처리방침 만들어줘", "이용약관 작성", "우리 서비스 약관 검토", GDPR·해외 서비스 언급 시, /speciai-advisory:privacy 호출 시 사용.
---

# 개인정보처리방침·이용약관 파이프라인

시작하자마자 speciai_brief(domain: "skill_privacy")를 호출해 인터뷰 항목·필수 기재사항 체크리스트를 받고, 받은 절차를 그대로 따른다.

완성 문서의 법령 인용(개인정보 보호법 조문 등)은 speciai_verify_citation으로 전수 검증 후 출력한다. 산출물은 마크다운으로 제시하고, 요청 시 `node ${CLAUDE_PLUGIN_ROOT}/scripts/build-docx.mjs`로 DOCX 변환한다.

키 미설정·한도 초과 시: 일반 구조(필수 기재 항목 목차) 안내만 제공하고 완성 문서는 생성하지 않는다.
