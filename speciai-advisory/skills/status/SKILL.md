---
name: status
description: 자문팀 현황 대시보드 — 플랜·오늘 사용량·크레딧·구독 만료·상품 목록을 터미널에 렌더링. "현황", "대시보드", "얼마나 썼지", /speciai-advisory:status 호출 시 사용.
---

# 자문팀 현황

시작하자마자 speciai_brief(domain: "skill_status")를 호출해 렌더 절차를 받고, 받은 절차를 그대로 따른다.

지침 수신 실패 시(대부분 키 미설정): 온보딩 안내를 표시한다 —
1. https://speciai.team 로그인 → 설정 → CLI 키 발급
2. 발급 키를 SPECIAI_API_KEY 환경변수로 설정 후 Claude Code 재시작
