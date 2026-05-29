# 핸드오프 — 자연어 시나리오 기반 웹 테스트 하네스 (tsg)

> 이 문서는 다른 세션/환경에서 작업을 이어가기 위한 자기완결적 요약이다.
> 프로젝트 경로: `D:\tsg` · 원격: https://github.com/mose09/tsg (branch `main`)
> 작성 시점: 2026-05-29

---

## 1. 프로젝트 목적

엑셀로 작성된 **자연어 테스트 시나리오**를 받아 **라이브 웹사이트에서 직접 테스트를 수행**하고 **HTML 리포트**를 산출하는 Claude Code 하네스.

```
엑셀(.xlsx) ─▶ 테스트 케이스(.md) ─▶ 브라우저 실행(Playwright MCP) ─▶ HTML 리포트
```

핵심 설계 의도: 정적 Playwright 코드 생성이 아니라 **런타임 접근성 스냅샷 기반(MCP)** 으로 실행하여, 셀렉터 모호성 문제를 줄인다. (→ 5번 문제의식 참조)

---

## 2. 현재까지 완료된 것

- [x] 하네스 전체 구성 (서브 에이전트 **파이프라인** 모드)
- [x] 샘플 엑셀(TodoMVC 데모)로 전 파이프라인 **실행 검증 완료** — 통과 2 / 실패 1
- [x] 발견된 버그 수정: `xlsx-to-md.mjs` id 중복 접두사(`TC-TC-001` → `TC-001`)
- [x] GitHub 업로드 (`main`), README + 실행 예시 스크린샷 2장 포함
- [ ] **(다음 작업) `browser-test-execution` 스킬에 "요소 명확화(disambiguation)" 규칙 추가** — 6번 참조

### 아키텍처 (서브 에이전트 파이프라인)
Playwright MCP 브라우저는 동시에 여러 에이전트가 제어할 수 없는 **단일 상태 리소스**이고 단계가 순차 의존하므로, 팀 모드 대신 순차 파이프라인 채택.

| 단계 | 에이전트 | 스킬 | 입력 → 출력 |
|------|---------|------|------------|
| 1 | `test-case-builder` | `excel-to-testcase` | 엑셀 → `_workspace/01_testcases/*.md` |
| 2 | `test-executor` | `browser-test-execution` | 케이스 → `_workspace/02_results/results.json` + `_workspace/artifacts/` |
| 3 | `test-reporter` | `test-report-builder` | 결과 → `report/index.html` + `report/summary.md` |

오케스트레이터: **`web-test-orchestrator`** 스킬 (Phase 0 컨텍스트 확인 → 준비 → 변환 → 실행 → 리포트 → 정리).

---

## 3. 파일 맵

```
.claude/
├── agents/
│   ├── test-case-builder.md
│   ├── test-executor.md
│   └── test-reporter.md
└── skills/
    ├── web-test-orchestrator/SKILL.md      # 오케스트레이터
    ├── excel-to-testcase/
    │   ├── SKILL.md
    │   ├── assets/testcase-template.md
    │   └── scripts/xlsx-to-md.mjs          # 엑셀→케이스 (결정적)
    ├── browser-test-execution/SKILL.md     # ★ 다음 작업 대상
    └── test-report-builder/
        ├── SKILL.md
        └── scripts/build-report.mjs        # results.json→HTML (결정적)
.mcp.json            # Playwright MCP 서버 등록
.env.example         # 자격증명 템플릿 → .env 로 복사
CLAUDE.md            # 하네스 포인터 + 변경 이력
README.md            # 사용법 + 실행 예시 스크린샷
docs/images/         # report.png, execution-browser.png (gitignore 제외 안 됨)
```

gitignore: `.env`, `node_modules/`, `_workspace/`, `_workspace_*/`, `report/`

---

## 4. 환경 / 실행 명령어

- Node v24.13, Playwright 1.60 (로컬 설치됨), `xlsx` 설치됨
- **Playwright MCP는 세션 재시작 후 연결됨** (`.mcp.json` 등록). 미연결 시 `browser_*` 도구 안 보임.

```bash
# 의존성
npm install && npx playwright install chromium

# 자격증명: .env.example → .env 복사 후 TEST_BASE_URL / TEST_USERNAME / TEST_PASSWORD 입력

# 결정적 스크립트 직접 실행
node .claude/skills/excel-to-testcase/scripts/xlsx-to-md.mjs <엑셀> --out _workspace/01_testcases
node .claude/skills/test-report-builder/scripts/build-report.mjs _workspace/02_results/results.json --out report
```

엑셀 헤더 자동 매핑(부분일치): 번호→id, 시나리오/테스트명→title, 우선순위→priority, 사전조건→precondition, 단계/수행절차→steps, 기대결과→expected, URL/대상→url. `steps`/`expected`는 줄바꿈으로 다중 항목 구분. 자격증명은 `{{TEST_USERNAME}}` 플레이스홀더.

---

## 5. 핵심 문제의식 (이 실험을 하는 이유) ★

사용자는 이미 **정적 Playwright 코드 기반 테스트 자동화**를 구현했으나, 실제 프로젝트에서 **실패 케이스가 너무 많았다.**

대표 실패 패턴 — **셀렉터 모호성**:
> 화면에 `삭제` 버튼과 `협력사 삭제` 버튼이 둘 다 있음. 시나리오는 "협력사 삭제"인데, 생성된 코드가 `삭제` 버튼을 타깃해서 실패.

**근본 원인:** 정적 코드 생성은 **실행 전(=실제 DOM을 보기 전)에** 셀렉터를 추측해서 박아넣는다. `getByText('삭제')`는 `'협력사 삭제'`에도 부분 일치 → strict mode 에러 또는 엉뚱한 버튼 클릭. 의도와 셀렉터의 간극을 화면 없이 메울 수 없음.

**런타임/에이전트(MCP) 방식이 푸는 원리:** 클릭 직전 접근성 스냅샷으로 `[12] button "삭제"`, `[13] button "협력사 삭제"`를 **실제로 보고**, 시나리오 의도와 의미적으로 매칭해 13번을 선택. 문자열 매칭이 아니라 **의도 기반 선택**.

현재 단계 = "런타임 방식으로 이 실패가 실제로 줄어드는지 실험하는 단계".

---

## 6. 다음 작업 (구체안) ★

`browser-test-execution` 스킬에 **"요소 명확화(disambiguation)" 섹션**을 추가한다. 규칙:

| 문제 | 해법 |
|------|------|
| `'삭제'`가 `'협력사 삭제'`에 부분 매칭 | **exact 매칭**: `getByRole('button', { name: '삭제', exact: true })` |
| 같은 이름 버튼이 여러 행/영역에 존재 | **컨테이너 범위 한정**: `getByRole('row', { name: /협력사/ }).getByRole('button', { name: '삭제' })` |
| 모호한데 첫 번째를 클릭 | **strict mode를 아군으로**: 2개+ 매칭 시 에러 → 재스냅샷 후 의도로 재선택 |
| 텍스트만 의존 | role + accessible name 조합 우선 |

추가로 **하이브리드(검증된 셀렉터 캐싱)** 도입 검토:
> 에이전트가 런타임에 "협력사 삭제 = 13번"을 한 번 해석·**유일성 검증** → 안정적 셀렉터를 케이스에 기록 → 다음 회차부턴 그 셀렉터로 빠르고 결정적으로 재실행. (에이전트의 똑똑함 + 정적 코드의 결정성)

트레이드오프: 런타임 방식은 모호성·DOM 변화에 강하지만 느리고 토큰 비용·비결정성 있음. 하이브리드가 절충.

**검증 방법:** 사용자의 실제 실패 화면/시나리오 1~2개로, 위 규칙이 그 케이스를 잡는지 재현 테스트.

---

## 7. 참고 — LLM 브라우저 에이전트 동작 원리 (코멧 등)

루프: **목표 → ① 페이지 인식 → ② LLM이 행동 결정 → ③ 브라우저 실행 → 반복**
- ① 인식: (a) 접근성/DOM 트리(텍스트, = 우리 MCP `browser_snapshot` 방식) / (b) 스크린샷 + Set-of-Marks(비전) / 보통 하이브리드
- ② 결정: Tool/Function calling 으로 구조화된 행동(click/type/navigate/scroll) 출력
- ③ 실행: CDP(Chrome DevTools Protocol) 또는 Playwright/Puppeteer

우리 하네스는 이 메커니즘의 **검증 목적 축소판**. (코멧은 "목표 달성까지 자율 실행", 우리는 "정해진 케이스 검증 후 종료".) 자율 실행 에이전트로의 확장은 별도 설계이며, 결제 등 비가역 작업엔 "확인 후 실행" 가드 필수.

---

## 8. 이어서 시작하는 법

새 세션에서 이 문서를 읽힌 뒤, 다음 중 하나로 시작:

1. **다음 작업 진행**: "`docs/HANDOFF.md`의 6번 — `browser-test-execution` 스킬에 disambiguation 섹션 추가해줘."
2. **실패 케이스 검증 먼저**: 실제 실패했던 화면 구조/시나리오를 제공 → 규칙이 잡는지 재현.
3. **자율 실행 에이전트 확장**(별개 트랙): 7번 마지막 단락 참조.

변경 이력은 `CLAUDE.md` 의 "변경 이력" 테이블에 계속 기록할 것.
