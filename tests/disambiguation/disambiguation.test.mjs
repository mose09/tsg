// 회귀 테스트: 요소 명확화(disambiguation) 규칙 검증.
// 셀렉터 모호성(예: "삭제" vs "협력사 삭제")에서
//  - 명확화 규칙(exact / 컨테이너 범위 / strict 모호 감지)이 의도대로 선택하는지
//  - 순진한 셀렉터가 함정(오클릭)에 빠지는지
// 를 단언한다. 실패 시 exit 1.
//
// 실행: npm test  (또는) node tests/disambiguation/disambiguation.test.mjs
// 사전: npm install && npx playwright install chromium
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(resolve(here, 'fixture.html')).href;

const browser = await chromium.launch();
const ctx = await browser.newContext();

const failures = [];
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✅ ${name}`);
  else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
}

async function attempt(locFn) {
  const page = await ctx.newPage();
  await page.goto(url);
  const r = { clicked: null, count: null, error: null };
  try {
    const loc = locFn(page);
    r.count = await loc.count();
    await loc.click({ timeout: 1500 }); // 기본 strict: 2개+ 매칭 시 예외
    r.clicked = await page.evaluate(() => window.__clicked || null);
  } catch (e) { r.error = e.message.split('\n')[0]; }
  await page.close();
  return r;
}

console.log('\n# S1 — 의도: 툴바의 "협력사 삭제"');

// 규칙2(exact): 정확 일치로 "협력사 삭제"만 유일 선택
{
  const r = await attempt(p => p.getByRole('button', { name: '협력사 삭제', exact: true }));
  check('규칙2(exact) — 유일 매칭', r.count === 1, `count=${r.count}`);
  check('규칙2(exact) — "협력사 삭제" 클릭', r.clicked === '협력사 삭제', `clicked=${r.clicked}`);
}

// 규칙5(strict 모호 감지): 부분일치는 다수 매칭 → strict 에러로 오클릭 차단
{
  const r = await attempt(p => p.getByRole('button', { name: '삭제' })); // 부분일치
  check('규칙5 — 부분일치는 다수 매칭', r.count >= 2, `count=${r.count}`);
  check('규칙5 — strict 에러로 오클릭 차단', r.error && /strict mode/i.test(r.error), `error=${r.error}`);
}

// 함정 문서화: 순진한 first()는 엉뚱한 "삭제"를 클릭
{
  const r = await attempt(p => p.getByText('삭제').first());
  check('함정 — 순진한 first()는 의도와 다른 요소 클릭', r.clicked !== '협력사 삭제', `clicked=${r.clicked}`);
}

console.log('\n# S2 — 의도: 표에서 "협력사 B" 행의 삭제');

// 규칙4(컨테이너 범위): 협력사 행으로 좁혀 정확 선택
{
  const r = await attempt(p => p.getByRole('row', { name: /협력사/ }).getByRole('button', { name: '삭제', exact: true }));
  check('규칙4(컨테이너) — 유일 매칭', r.count === 1, `count=${r.count}`);
  check('규칙4(컨테이너) — 협력사 B 행 삭제 클릭', r.clicked === '삭제 @ 협력사 B', `clicked=${r.clicked}`);
}

// 함정 문서화: exact라도 범위 없이 first()면 엉뚱한 행/툴바 클릭
{
  const r = await attempt(p => p.getByRole('button', { name: '삭제', exact: true }).first());
  check('함정 — 범위 없는 first()는 협력사 B 행이 아님', r.clicked !== '삭제 @ 협력사 B', `clicked=${r.clicked}`);
}

await browser.close();

if (failures.length) {
  console.error(`\n❌ 회귀 테스트 실패 ${failures.length}건: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\n✅ 모든 명확화 회귀 테스트 통과');
