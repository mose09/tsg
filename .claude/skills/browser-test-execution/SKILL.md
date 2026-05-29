---
name: browser-test-execution
description: "Playwright MCP로 라이브 웹사이트에서 테스트 케이스를 대화형 실행. 자연어 단계를 브라우저 동작으로 매핑, 로그인 처리, 단계·기대결과 검증, 실패 시 스크린샷/비디오/트레이스 캡처, results.json 기록. 사이트 테스트 실행·시나리오 수행·E2E 검증·실패 케이스 재실행 시 반드시 사용."
---

# Browser Test Execution 스킬 (Playwright MCP)

구조화된 테스트 케이스를 읽어 **실제 브라우저를 Playwright MCP로 대화형 제어**하여 라이브 사이트에서 실행하고, 결과를 `results.json`에 구조화하여 기록한다.

왜 대화형(MCP)인가: 자연어 시나리오는 사전에 정확한 셀렉터를 알 수 없다. 런타임 접근성 스냅샷으로 실제 요소를 보고 판단해야 모호한 단계도 안정적으로 수행할 수 있다.

## 사전 조건
- Playwright MCP 서버가 연결돼 있어야 한다 (`.mcp.json`의 `playwright`). 미연결 시 `browser_*` 도구가 보이지 않으므로, 사용자에게 `.mcp.json` 확인을 요청하고 중단한다.
- 자격증명/대상은 환경변수로 주입된다 (`.env` 참조): `TEST_BASE_URL`, `TEST_USERNAME`, `TEST_PASSWORD` (+케이스가 요구하는 추가 변수).

## 도구 로딩
Playwright MCP 도구는 deferred 일 수 있다. 먼저 `ToolSearch`로 로드한다:
```
ToolSearch("playwright browser navigate click snapshot")
```
주로 쓰는 도구(서버 버전에 따라 이름 상이 가능):
`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_select_option`, `browser_press_key`, `browser_wait_for`, `browser_take_screenshot`, `browser_console_messages`, `browser_close`.

## 자연어 단계 → MCP 동작 매핑

| 단계 표현 | MCP 동작 |
|----------|----------|
| "~로 이동/접속한다" | `browser_navigate(url)` — `{{TEST_BASE_URL}}` 치환 |
| "~에 입력한다 / 작성한다" | `browser_snapshot` 으로 요소 ref 확인 → `browser_type(ref, 값)` |
| "~를 클릭/선택/누른다" | `browser_snapshot` → `browser_click(ref)` 또는 `browser_select_option` |
| "~이 보일 때까지 대기" | `browser_wait_for(text/상태)` |
| "Enter/Tab 입력" | `browser_press_key` |
| "~이 보인다/표시된다 (검증)" | `browser_snapshot` 후 트리에서 텍스트/요소 존재 확인 |

원칙:
- **스냅샷 우선**: 클릭/입력 전 `browser_snapshot`으로 요소 ref를 확정한다. 좌표 클릭은 피한다.
- **상태 변화 후 재스냅샷**: 페이지 전환·동적 렌더 후 스냅샷을 다시 찍어 stale ref 사용을 막는다.
- **명시적 대기**: 클릭 후 기대 요소가 나타날 때까지 `browser_wait_for`로 대기한 뒤 검증한다.

## 로그인 처리
케이스의 "로그인 필요: 예" 또는 인증이 필요한 경우:
1. `TEST_BASE_URL`의 로그인 경로로 이동
2. 아이디 필드에 `TEST_USERNAME`, 비밀번호 필드에 `TEST_PASSWORD` 입력
3. 로그인 버튼 클릭 → 인증 성공 신호(대시보드 이동/사용자명 노출) 대기
4. 성공 시 후속 케이스는 세션 재사용. 케이스 격리가 필요하면 케이스 시작 시 로그인 상태를 재확인하고 필요 시 재로그인.

**자격증명 안전**: 비밀번호 값을 로그·결과·리포트에 평문으로 남기지 않는다. 결과 기록 시 `****`로 마스킹한다.

## 검증(Assertion) 규칙
각 "기대 결과"를 명시적으로 검증한다:
- 텍스트 노출: 스냅샷 트리에 해당 텍스트 존재 여부
- URL 변경: 현재 URL이 기대 패턴과 일치하는지
- 요소 표시/숨김: 해당 ref의 존재/부재
- 개수 변화: 관련 요소/뱃지 수 비교

판정: 모든 기대 결과 충족 → `passed`. 하나라도 불충족 → `failed`. 선행 의존(로그인 등) 실패로 수행 불가 → `skipped`.

## 캡처 (증거 수집)
- **실패 시 필수**: `browser_take_screenshot`으로 실패 시점 스크린샷 저장.
- 비디오/트레이스는 MCP 서버의 `--output-dir`(`_workspace/artifacts/`)에 자동 수집되도록 `.mcp.json`에 설정돼 있다. 케이스 종료 시 해당 경로를 결과에 연결한다.
- 통과 케이스도 마지막 화면 스크린샷 1장을 남기면 리포트 가독성이 좋다(선택).

## 실행 흐름
1. `_workspace/01_testcases/`의 케이스를 ID 순으로 로드.
2. 브라우저 시작 → (필요 시) 로그인.
3. **케이스를 하나씩 순차 실행** (브라우저는 단일 상태 리소스 — 병렬 금지):
   - 각 단계 수행 + 단계 결과 기록
   - 기대 결과 검증 → 케이스 판정
   - 실패 시 스크린샷 캡처, **중단하지 말고 다음 케이스로**
4. 모든 케이스 종료 후 `browser_close`.
5. `_workspace/02_results/results.json` 기록.

## results.json 스키마
```json
{
  "runId": "run-{타임스탬프}",
  "startedAt": "ISO8601",
  "finishedAt": "ISO8601",
  "baseUrl": "https://...",
  "summary": { "total": 0, "passed": 0, "failed": 0, "skipped": 0 },
  "results": [
    {
      "id": "TC-001",
      "title": "로그인 성공",
      "priority": "High",
      "status": "passed | failed | skipped",
      "durationMs": 1234,
      "steps": [
        { "index": 1, "action": "navigate /login", "status": "passed", "note": "", "screenshot": null }
      ],
      "expected": [
        { "desc": "대시보드로 이동", "status": "passed" }
      ],
      "error": null,
      "screenshots": ["_workspace/artifacts/TC-001-fail.png"],
      "video": "_workspace/artifacts/TC-001.webm",
      "trace": "_workspace/artifacts/TC-001-trace.zip"
    }
  ]
}
```
- `summary`는 results 집계와 일치해야 한다.
- 아티팩트 경로는 프로젝트 루트 기준 상대경로로 기록(리포트가 링크 가능하도록).
- 민감값은 기록 전 마스킹.

## 에러 핸들링
| 상황 | 처리 |
|------|------|
| 단계 실패 | 케이스 `failed` + 스크린샷, **다음 케이스 진행** |
| 로그인 실패 | 명확히 보고, 로그인 의존 케이스는 `skipped` |
| 요소 못 찾음 | 재스냅샷 1회 재시도 → 그래도 없으면 `failed` |
| 타임아웃 | 케이스당 상한 초과 시 `failed`(timeout) 후 진행 |
| MCP 미연결 | `.mcp.json` 확인 요청 후 중단 |

## 산출물 체크리스트
- [ ] 모든 케이스가 순차 실행되고 판정됨
- [ ] 실패 케이스에 스크린샷 증거 연결
- [ ] `results.json`의 summary가 results와 일치
- [ ] 민감값 마스킹
- [ ] 실행 요약(통과/실패/스킵, 실패 요지) 보고
