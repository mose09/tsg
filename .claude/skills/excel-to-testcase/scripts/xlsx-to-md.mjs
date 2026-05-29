#!/usr/bin/env node
// Excel(.xlsx/.xls) -> JSON 덤프 또는 테스트케이스 마크다운 변환.
// 사용법:
//   node xlsx-to-md.mjs <엑셀경로> --dump-json            # 시트/헤더/행을 JSON으로 출력(파일 미생성)
//   node xlsx-to-md.mjs <엑셀경로> --out <디렉토리>       # 행을 TC-*.md 로 변환 저장
//   옵션: --sheet <이름>  특정 시트만 처리
//
// 결정적 추출만 담당한다. 자연어 단계 분해/기대결과 정규화는 에이전트가 SKILL.md 규칙으로 수행한다.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

function fail(msg, code = 1) { console.error(msg); process.exit(code); }

let XLSX;
try {
  XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
} catch {
  fail([
    "[xlsx-to-md] 'xlsx' 패키지가 필요합니다.",
    "프로젝트 루트에서 한 번 설치하세요:",
    "  npm i xlsx",
    "설치 후 이 스크립트를 다시 실행하세요.",
  ].join('\n'));
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  fail("사용법: node xlsx-to-md.mjs <엑셀경로> [--dump-json | --out <디렉토리>] [--sheet <이름>]", 0);
}

const filePath = resolve(args[0]);
if (!existsSync(filePath)) fail(`[xlsx-to-md] 파일을 찾을 수 없습니다: ${filePath}`);

const dumpJson = args.includes('--dump-json');
const sheetIdx = args.indexOf('--sheet');
const onlySheet = sheetIdx !== -1 ? args[sheetIdx + 1] : null;
const outIdx = args.indexOf('--out');
const outDir = outIdx !== -1 ? resolve(args[outIdx + 1]) : null;

const wb = XLSX.read(readFileSync(filePath), { type: 'buffer' });
const sheetNames = onlySheet ? [onlySheet] : wb.SheetNames;

const sheets = {};
for (const name of sheetNames) {
  const ws = wb.Sheets[name];
  if (!ws) { console.error(`[경고] 시트 없음: ${name}`); continue; }
  // 헤더 포함 2차원 배열 -> 객체 배열
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  sheets[name] = { headers, rowCount: rows.length, rows };
}

if (dumpJson) {
  // 컬럼 매핑 파악용: 헤더 + 처음 5행 샘플만 보여줘 토큰 절약
  const preview = {};
  for (const [name, s] of Object.entries(sheets)) {
    preview[name] = { headers: s.headers, rowCount: s.rowCount, sample: s.rows.slice(0, 5) };
  }
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

if (!outDir) fail("[xlsx-to-md] --dump-json 또는 --out <디렉토리> 중 하나를 지정하세요.");

mkdirSync(outDir, { recursive: true });

// 헤더명을 표준 필드로 느슨하게 매핑 (대소문자/공백 무시, 부분일치)
const FIELD_HINTS = {
  id: ['tc', 'tcid', 'tc id', '케이스번호', '번호', 'no', 'id'],
  title: ['시나리오', '테스트명', '케이스명', 'title', '항목', '테스트케이스'],
  priority: ['우선순위', '중요도', 'priority'],
  precondition: ['사전조건', '전제조건', 'precondition', '선행조건'],
  steps: ['단계', '수행절차', '테스트절차', 'steps', '재현절차', '절차'],
  expected: ['기대결과', '예상결과', 'expected', '결과', '기대값'],
  url: ['url', '대상', '경로', '화면', 'link'],
};
function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
function mapHeader(h) {
  const n = norm(h);
  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    if (hints.some(hint => n === norm(hint) || n.includes(norm(hint)))) return field;
  }
  return null;
}

function slug(s) {
  return String(s).trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'case';
}

let count = 0;
const manifest = [];
for (const [sheetName, s] of Object.entries(sheets)) {
  const headerMap = {};
  for (const h of s.headers) { const f = mapHeader(h); if (f && !headerMap[f]) headerMap[f] = h; }
  s.rows.forEach((row, i) => {
    const get = (field) => headerMap[field] ? String(row[headerMap[field]] ?? '').trim() : '';
    // id에 이미 "TC-" 접두사가 있으면 중복 방지 (예: "TC-001" -> "001")
    const rawId = get('id') || String(count + 1).padStart(3, '0');
    const id = String(rawId).replace(/^tc[-_\s]*/i, '').trim() || String(count + 1).padStart(3, '0');
    const title = get('title') || `시나리오 ${id}`;
    if (!title && !get('steps')) return; // 빈 행 스킵
    count++;
    const fname = `TC-${id.replace(/[^\p{L}\p{N}_-]/gu, '')}_${slug(title)}.md`;
    const stepsRaw = get('steps');
    const expectedRaw = get('expected');
    // 줄바꿈/번호/세미콜론 기준으로 느슨하게 분리 (에이전트가 추가 정규화)
    const splitLines = (t) => t.split(/\r?\n|;|｜|│/).map(x => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    const steps = splitLines(stepsRaw);
    const expected = splitLines(expectedRaw);
    const md = [
      `# TC-${id}: ${title}`,
      ``,
      `- **우선순위**: ${get('priority') || 'Medium'}`,
      `- **대상 URL**: ${get('url') ? `{{TEST_BASE_URL}}${get('url').startsWith('http') ? '' : ''}${get('url')}` : '{{TEST_BASE_URL}}'}`,
      `- **사전조건**: ${get('precondition') || '없음'}`,
      `- **출처**: 시트 "${sheetName}" 행 ${i + 2}`,
      ``,
      `## 단계`,
      ...(steps.length ? steps.map((st, j) => `${j + 1}. ${st}`) : ['> ⚠️ 추론: 엑셀에 단계가 없어 비어 있음. 에이전트가 시나리오에서 분해 필요.']),
      ``,
      `## 기대 결과`,
      ...(expected.length ? expected.map(e => `- ${e}`) : ['> ⚠️ 추론: 기대 결과가 명시되지 않음. 검증 가능한 결과로 보완 필요.']),
      ``,
    ].join('\n');
    writeFileSync(resolve(outDir, fname), md, 'utf8');
    manifest.push({ id, title, file: fname });
  });
}

writeFileSync(resolve(outDir, '_manifest.json'), JSON.stringify({ source: basename(filePath), count, cases: manifest }, null, 2), 'utf8');
console.log(`[xlsx-to-md] ${count}개 케이스를 ${outDir} 에 생성했습니다.`);
console.log(`각 케이스의 단계/기대결과는 SKILL.md 규칙에 따라 추가 정규화하세요 (원자적 단계 + 검증 가능한 기대결과).`);
