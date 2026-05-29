# tsg

## 하네스: 자연어 시나리오 기반 웹 테스트 자동화

**목표:** 엑셀로 작성된 자연어 테스트 시나리오로 라이브 사이트를 직접 테스트하고(Playwright MCP), 결과를 HTML 리포트로 산출한다.

**트리거:** 사이트 테스트 수행·테스트 시나리오 실행·E2E 테스트·테스트 케이스 변환·결과 리포트·테스트 재실행 요청 시 `web-test-orchestrator` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**전제 설정:**
- Playwright MCP 서버: `.mcp.json` 에 `playwright` 등록됨 (`npx @playwright/mcp`).
- 자격증명: `.env` (`.env.example` 복사) — 채팅에 평문 입력 대신 `.env`에 작성.
- 엑셀 파싱 스크립트는 `xlsx` 패키지 필요 시 `npm i xlsx`.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-29 | 초기 구성 (3에이전트 파이프라인 + 오케스트레이터) | 전체 | - |
| 2026-05-29 | 샘플 엑셀로 전 파이프라인 실행 검증 (TodoMVC, 통과2/실패1) | 전체 | 동작 확인 |
| 2026-05-29 | id 중복 접두사(TC-TC-001) 버그 수정 | skills/excel-to-testcase/scripts/xlsx-to-md.mjs | 테스트 중 발견 |
| 2026-05-29 | 요소 명확화(disambiguation) 섹션 추가 | skills/browser-test-execution/SKILL.md | 셀렉터 모호성 실패(삭제 vs 협력사 삭제) 대응 |
