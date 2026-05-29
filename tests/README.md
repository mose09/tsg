# 회귀 테스트 (regression)

하네스의 핵심 규칙이 퇴행하지 않는지 검증하는 테스트.

## disambiguation — 요소 명확화 규칙

`browser-test-execution` 스킬의 **요소 명확화(disambiguation)** 규칙을 검증한다.
자연어 시나리오 테스트의 대표 실패 원인인 **셀렉터 모호성**(예: 화면에 `삭제`와 `협력사 삭제`가 함께 있어 엉뚱한 버튼을 클릭)을 재현하고, 규칙이 의도대로 선택하는지 단언한다.

- `fixture.html` — 모호성을 담은 테스트 페이지 (부분일치 레이블 + 여러 행 반복 레이블)
- `disambiguation.test.mjs` — 검증:
  - 규칙2(exact 정확 일치) → `협력사 삭제`만 유일 선택
  - 규칙4(컨테이너 범위 한정) → 협력사 행의 `삭제`만 선택
  - 규칙5(strict 모호 감지) → 부분일치 다수 매칭 시 에러로 오클릭 차단
  - 함정 문서화 — 순진한 `.first()` 셀렉터가 의도와 다른 요소를 클릭함을 단언

## 실행

```bash
npm install && npx playwright install chromium   # 최초 1회
npm test
```

실패하는 단언이 있으면 비정상 종료(exit 1)한다.
