---
name: web-test-orchestrator
description: "자연어 테스트 시나리오로 라이브 사이트를 직접 테스트하는 에이전트 파이프라인을 조율. 엑셀 시나리오를 테스트 케이스로 변환→Playwright MCP로 사이트 실행→HTML 리포트 생성까지 전 과정 자동화. 사이트 테스트 수행, 테스트 시나리오 실행, E2E 테스트, 자동화 테스트 요청 시 반드시 이 스킬을 사용. 후속 작업: 테스트 재실행, 실패 케이스만 다시, 시나리오 업데이트, 리포트 재생성, 결과 개선 요청에도 사용."
---

# Web Test Orchestrator — 자연어 시나리오 기반 사이트 테스트 파이프라인

엑셀 테스트 시나리오 → 구조화 테스트 케이스 → 라이브 사이트 실행(Playwright MCP) → HTML 리포트까지 조율하는 통합 스킬.

## 실행 모드: 서브 에이전트 (파이프라인)

순차 의존이 강하고(파싱→실행→리포트), **Playwright MCP 브라우저는 동시에 여러 에이전트가 제어할 수 없는 단일 상태 리소스**이므로 서브 에이전트 파이프라인으로 구성한다. 팀 통신 오버헤드가 불필요하다. 각 단계는 `Agent` 도구로 순차 호출하고, 단계 간 데이터는 `_workspace/` 파일로 전달한다.

## 에이전트 구성

| 단계 | 에이전트 | subagent_type | 역할 | 스킬 | 출력 |
|------|---------|---------------|------|------|------|
| 1 | test-case-builder | test-case-builder | 엑셀→구조화 .md 케이스 | excel-to-testcase | `_workspace/01_testcases/` |
| 2 | test-executor | test-executor | Playwright MCP로 사이트 실행 | browser-test-execution | `_workspace/02_results/results.json` + `_workspace/artifacts/` |
| 3 | test-reporter | test-reporter | HTML 리포트 + md 요약 | test-report-builder | `report/index.html`, `report/summary.md` |

모든 Agent 호출에 `model: "opus"` 를 명시한다.

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)
1. `_workspace/` 존재 여부 확인.
2. 모드 결정:
   - **미존재** → 초기 실행. Phase 1.
   - **존재 + 부분 수정 요청** (예: "실패 케이스만 다시", "리포트만 재생성", "TC-003만 다시") → **부분 재실행**. 해당 단계 에이전트만 호출하고 나머지 산출물 보존.
   - **존재 + 새 엑셀/새 입력 제공** → **새 실행**. 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1.
3. 부분 재실행 시 이전 산출물 경로를 에이전트 프롬프트에 전달해 갱신 대상만 덮어쓰게 한다.

### Phase 1: 준비
1. 사용자 입력에서 다음을 파악: 엑셀 파일 경로, 대상 사이트, 로그인 필요 여부.
2. `_workspace/` 및 하위(`00_input/`, `01_testcases/`, `02_results/`, `artifacts/`) 생성.
3. 입력 엑셀을 `_workspace/00_input/`에 복사.
4. **자격증명 확인**: 로그인이 필요하면 `.env`에 `TEST_BASE_URL`/`TEST_USERNAME`/`TEST_PASSWORD`가 설정됐는지 확인. 없으면 `.env.example`을 안내하고 사용자에게 입력을 요청한다 (자격증명을 채팅에 평문으로 받지 않도록 `.env` 작성을 권한다).
5. **MCP 확인**: Playwright MCP(`.mcp.json`의 `playwright`)가 연결됐는지 확인. 미연결이면 안내 후 진행 보류.

### Phase 2: 테스트 케이스 변환
`Agent(subagent_type: "test-case-builder", model: "opus", prompt: ...)` 호출.
- 입력: `_workspace/00_input/<엑셀>`, 변환 지침.
- 출력: `_workspace/01_testcases/`.
- 반환된 변환 요약(케이스 수, 추론/누락)을 검토. 누락이 심각하면 사용자에게 보고 후 진행 여부 확인.

### Phase 3: 사이트 테스트 실행
`Agent(subagent_type: "test-executor", model: "opus", prompt: ...)` 호출.
- 입력: `_workspace/01_testcases/`, 환경변수(`.env`).
- 출력: `_workspace/02_results/results.json`, `_workspace/artifacts/`.
- **브라우저는 단일 리소스** — 이 단계는 단일 에이전트가 순차 실행한다. 병렬 호출 금지.
- 반환된 실행 요약(통과/실패/스킵) 검토.

### Phase 4: 리포트 생성
`Agent(subagent_type: "test-reporter", model: "opus", prompt: ...)` 호출.
- 입력: `_workspace/02_results/results.json`, `_workspace/artifacts/`.
- 출력: `report/index.html`, `report/summary.md`.

### Phase 5: 정리 및 보고
1. `_workspace/` 보존 (사후 검증·감사 추적).
2. 사용자에게 보고: 통과율, 실패 건수, `report/index.html` 경로, 핵심 실패 요지.
3. 실행 후 피드백 기회 제공 ("실패 케이스를 더 깊게 볼까요? 시나리오를 보완할까요?").

## 데이터 흐름
```
엑셀(.xlsx)
   │  test-case-builder (excel-to-testcase)
   ▼
_workspace/01_testcases/*.md
   │  test-executor (browser-test-execution + Playwright MCP)
   ▼
_workspace/02_results/results.json  +  _workspace/artifacts/(shot·video·trace)
   │  test-reporter (test-report-builder)
   ▼
report/index.html  +  report/summary.md
```

## 에러 핸들링
| 상황 | 전략 |
|------|------|
| 엑셀 파싱 실패 | builder가 컬럼 매핑 가정 보고 → 사용자 확인 후 진행 |
| 자격증명 누락 | `.env` 작성 안내 후 보류. 평문 채팅 입력 지양 |
| MCP 미연결 | `.mcp.json` 확인 안내 후 실행 단계 보류 |
| 일부 케이스 실패 | 정상 흐름. executor가 다음 케이스 진행, 리포트에 실패로 표기 |
| 로그인 실패 | 의존 케이스 skip, 리포트·요약에 사유 명시 |
| 단계 1회 재시도 후 재실패 | 해당 결과 없이 진행, 리포트에 누락/실패 명시 |

## 테스트 시나리오

### 정상 흐름
1. 사용자가 엑셀 시나리오 파일 + 대상 사이트(로그인 정보는 `.env`) 제공.
2. Phase 1에서 `_workspace/` 준비, 자격증명·MCP 확인.
3. Phase 2에서 builder가 N개 케이스를 `01_testcases/`에 생성.
4. Phase 3에서 executor가 케이스를 순차 실행, `results.json`+아티팩트 생성.
5. Phase 4에서 reporter가 `report/index.html`+`summary.md` 생성.
6. Phase 5에서 통과율·실패 요지·리포트 경로 보고.
7. 예상 결과: `report/index.html` 생성, 실패 케이스에 스크린샷 연결.

### 에러 흐름
1. Phase 3에서 로그인 단계 실패 (자격증명 오류).
2. executor가 로그인 의존 케이스를 `skipped` 처리, 나머지 독립 케이스는 실행.
3. `results.json`에 skip 사유 기록.
4. reporter가 리포트 상단에 실패/스킵 케이스와 사유 표기.
5. 오케스트레이터가 사용자에게 "자격증명 확인 필요"를 명시해 보고.
