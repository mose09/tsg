#!/usr/bin/env node
// results.json -> Playwright 스타일 정적 HTML 리포트 생성. 외부 의존성 없음.
// 사용법: node build-report.mjs <results.json> --out <리포트디렉토리>

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';

function fail(m, c = 1) { console.error(m); process.exit(c); }

const args = process.argv.slice(2);
if (!args[0] || args.includes('-h')) fail('사용법: node build-report.mjs <results.json> --out <디렉토리>', args.includes('-h') ? 0 : 1);
const resultsPath = resolve(args[0]);
if (!existsSync(resultsPath)) fail(`[build-report] results.json 없음: ${resultsPath}`);
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx !== -1 ? args[outIdx + 1] : 'report');
mkdirSync(outDir, { recursive: true });

let data;
try { data = JSON.parse(readFileSync(resultsPath, 'utf8')); }
catch (e) { fail(`[build-report] JSON 파싱 실패: ${e.message}`); }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 아티팩트 경로를 리포트 디렉토리 기준 상대경로로
const rel = (p) => { if (!p) return null; const abs = resolve(p); return relative(outDir, abs).split('\\').join('/'); };

const results = Array.isArray(data.results) ? data.results : [];
const sum = data.summary || results.reduce((a, r) => {
  a.total++; a[r.status] = (a[r.status] || 0) + 1; return a;
}, { total: 0, passed: 0, failed: 0, skipped: 0 });
const passRate = sum.total ? Math.round((sum.passed / sum.total) * 100) : 0;
// 실패 -> 스킵 -> 통과 순 정렬
const order = { failed: 0, skipped: 1, passed: 2 };
const sorted = [...results].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

const badge = (st) => `<span class="badge ${st}">${st}</span>`;

function caseHtml(r) {
  const steps = (r.steps || []).map(s => `
    <tr class="step ${esc(s.status)}">
      <td class="idx">${esc(s.index ?? '')}</td>
      <td>${esc(s.action)}</td>
      <td>${badge(esc(s.status))}</td>
      <td class="note">${esc(s.note || '')}${s.screenshot ? ` <a href="${rel(s.screenshot)}" target="_blank">[shot]</a>` : ''}</td>
    </tr>`).join('');
  const expected = (r.expected || []).map(e => `<li class="${esc(e.status)}">${esc(e.desc)} — ${badge(esc(e.status))}</li>`).join('');
  const shots = (r.screenshots || []).map(p => `<a href="${rel(p)}" target="_blank"><img src="${rel(p)}" alt="screenshot"/></a>`).join('');
  const media = [
    r.video ? `<a href="${rel(r.video)}" target="_blank">🎬 video</a>` : '',
    r.trace ? `<a href="${rel(r.trace)}" target="_blank">🧵 trace</a>` : '',
  ].filter(Boolean).join(' · ');
  return `
  <details class="case ${esc(r.status)}" ${r.status === 'failed' ? 'open' : ''}>
    <summary>
      ${badge(esc(r.status))}
      <strong>${esc(r.id)}</strong> ${esc(r.title)}
      ${r.priority ? `<span class="pri">${esc(r.priority)}</span>` : ''}
      ${r.durationMs != null ? `<span class="dur">${esc(r.durationMs)}ms</span>` : ''}
    </summary>
    <div class="body">
      ${r.error ? `<pre class="error">${esc(r.error)}</pre>` : ''}
      ${expected ? `<h4>기대 결과</h4><ul class="expected">${expected}</ul>` : ''}
      ${steps ? `<h4>단계</h4><table class="steps"><thead><tr><th>#</th><th>동작</th><th>상태</th><th>비고</th></tr></thead><tbody>${steps}</tbody></table>` : ''}
      ${media ? `<p class="media">${media}</p>` : ''}
      ${shots ? `<div class="shots">${shots}</div>` : ''}
    </div>
  </details>`;
}

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>테스트 리포트 — ${esc(data.runId || '')}</title>
<style>
  :root{--pass:#22a06b;--fail:#e5484d;--skip:#daa520;--bg:#f6f8fa;--card:#fff;--line:#e2e5e9;--ink:#1c2128}
  *{box-sizing:border-box} body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,'Malgun Gothic',sans-serif;background:var(--bg);color:var(--ink)}
  header{background:#0f172a;color:#fff;padding:20px 28px}
  header h1{margin:0 0 6px;font-size:18px} header .meta{opacity:.8;font-size:12px}
  .stats{display:flex;gap:12px;padding:18px 28px;flex-wrap:wrap}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 18px;min-width:96px}
  .stat .n{font-size:24px;font-weight:700} .stat .l{font-size:12px;opacity:.7}
  .stat.passed .n{color:var(--pass)} .stat.failed .n{color:var(--fail)} .stat.skipped .n{color:var(--skip)}
  .bar{height:8px;border-radius:6px;background:var(--line);margin:0 28px 16px;overflow:hidden;display:flex}
  .bar i{display:block;height:100%} .bar .p{background:var(--pass)} .bar .f{background:var(--fail)} .bar .s{background:var(--skip)}
  main{padding:0 28px 40px}
  .case{background:var(--card);border:1px solid var(--line);border-left-width:4px;border-radius:8px;margin:10px 0;overflow:hidden}
  .case.passed{border-left-color:var(--pass)} .case.failed{border-left-color:var(--fail)} .case.skipped{border-left-color:var(--skip)}
  summary{cursor:pointer;padding:12px 16px;display:flex;align-items:center;gap:10px;list-style:none}
  summary::-webkit-details-marker{display:none}
  .badge{font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:20px;color:#fff}
  .badge.passed{background:var(--pass)} .badge.failed{background:var(--fail)} .badge.skipped{background:var(--skip)}
  .pri{font-size:11px;background:#eef;border-radius:4px;padding:1px 6px;color:#446}
  .dur{margin-left:auto;font-size:12px;opacity:.6}
  .body{padding:4px 16px 16px;border-top:1px solid var(--line)}
  h4{margin:14px 0 6px;font-size:13px}
  .error{background:#fff1f1;border:1px solid #f5c2c2;color:#a11;padding:10px;border-radius:6px;white-space:pre-wrap;font:12px ui-monospace,monospace}
  table.steps{width:100%;border-collapse:collapse;font-size:13px}
  table.steps th,table.steps td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
  table.steps .idx{width:32px;opacity:.6} .note a{font-size:11px}
  .step.failed{background:#fff6f6}
  ul.expected{margin:6px 0;padding-left:18px} ul.expected li.failed{color:var(--fail)}
  .shots{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px} .shots img{max-width:280px;border:1px solid var(--line);border-radius:6px}
  .media a{margin-right:10px}
  footer{padding:16px 28px;font-size:12px;opacity:.6}
</style></head>
<body>
<header>
  <h1>웹 테스트 리포트</h1>
  <div class="meta">Run: ${esc(data.runId || '-')} · 대상: ${esc(data.baseUrl || '-')} · 시작: ${esc(data.startedAt || '-')} ${data.finishedAt ? '· 종료: ' + esc(data.finishedAt) : ''}</div>
</header>
<section class="stats">
  <div class="stat"><div class="n">${sum.total}</div><div class="l">전체</div></div>
  <div class="stat passed"><div class="n">${sum.passed || 0}</div><div class="l">통과</div></div>
  <div class="stat failed"><div class="n">${sum.failed || 0}</div><div class="l">실패</div></div>
  <div class="stat skipped"><div class="n">${sum.skipped || 0}</div><div class="l">스킵</div></div>
  <div class="stat"><div class="n">${passRate}%</div><div class="l">통과율</div></div>
</section>
<div class="bar">
  <i class="p" style="width:${sum.total ? (sum.passed || 0) / sum.total * 100 : 0}%"></i>
  <i class="f" style="width:${sum.total ? (sum.failed || 0) / sum.total * 100 : 0}%"></i>
  <i class="s" style="width:${sum.total ? (sum.skipped || 0) / sum.total * 100 : 0}%"></i>
</div>
<main>
  ${sorted.map(caseHtml).join('\n')}
  ${sorted.length ? '' : '<p>결과가 없습니다.</p>'}
</main>
<footer>Generated by test-report-builder · ${esc(data.runId || '')}</footer>
</body></html>`;

writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
console.log(`[build-report] ${resolve(outDir, 'index.html')} 생성 (통과율 ${passRate}%, 실패 ${sum.failed || 0}건)`);
