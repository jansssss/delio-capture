// Mock deliobt.kr server that mimics restrictive security headers
// to reproduce the bookmarklet failure locally.
const http = require('http');
const url = require('url');

const PORT = 3333;
const TOTAL_TX = 23; // simulate "총 23건" -> 3 pages

function makeRow(pageIdx, rowIdx) {
  const globalIdx = pageIdx * 10 + rowIdx;
  const date = `2023. 06. ${String(14 - (globalIdx % 14)).padStart(2, '0')}. 오전 06:19`;
  const amount = (0.0000042 * (globalIdx + 1)).toFixed(7);
  return `
    <tr>
      <td>${date}</td>
      <td><span class="badge badge-green">볼트</span></td>
      <td class="amount-positive">+${amount} ETH</td>
      <td>0.0530${globalIdx} ETH</td>
      <td>볼트이자</td>
    </tr>`;
}

function makePage(pageIdx) {
  const totalPages = Math.ceil(TOTAL_TX / 10);
  const rowsOnThisPage = Math.min(10, TOTAL_TX - pageIdx * 10);
  let rows = '';
  for (let i = 0; i < rowsOnThisPage; i++) rows += makeRow(pageIdx, i);

  let pager = '';
  for (let p = 1; p <= totalPages; p++) {
    pager += `<button class="page-btn${p === pageIdx + 1 ? ' active' : ''}">${p}</button>`;
  }

  // Mimic deliobt.kr's transaction.js client-side check that triggered the bug:
  // if location.search has no coinType, it logs the message and redirects to home.
  // Real-site console showed: "coinType 파라미터가 없습니다. 홈으로 리다이렉트합니다."
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Delio - ETH 거래내역</title>
  <link rel="stylesheet" href="/style.css">
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      if (!params.get('coinType')) {
        console.log('coinType 파라미터가 없습니다. 홈으로 리다이렉트합니다.');
        window.location.href = '/';
      }
    })();
  </script>
</head>
<body>
  <div class="container">
    <h1 class="logo">Delio</h1>
    <div class="info">
      <div><label>채권자 이름</label><input value="홍길동" readonly></div>
      <div><label>이메일주소</label><input value="test@example.com" readonly></div>
    </div>
    <h2>ETH 거래 내역</h2>
    <table class="tx-table">
      <thead>
        <tr><th>날짜</th><th>거래유형</th><th>수량</th><th>이전 잔액</th><th>설명</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pager">${pager}</div>
    <div class="summary">총 ${TOTAL_TX}건 중 ${pageIdx * 10 + 1}-${pageIdx * 10 + rowsOnThisPage}번째 거래</div>
  </div>
</body>
</html>`;
}

const CSS = `
body { font-family: '맑은 고딕', sans-serif; background: #f3f4f6; margin: 0; padding: 24px; }
.container { max-width: 900px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.logo { font-family: serif; font-style: italic; text-align: center; font-size: 48px; margin: 0 0 24px; }
.info { display: grid; gap: 12px; margin-bottom: 24px; }
.info div { display: grid; grid-template-columns: 120px 1fr; align-items: center; }
.info input { padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #f9fafb; }
h2 { text-align: center; margin: 24px 0; }
.tx-table { width: 100%; border-collapse: collapse; }
.tx-table th, .tx-table td { padding: 14px; border: 1px solid #e5e7eb; text-align: center; font-size: 14px; }
.tx-table th { background: #f9fafb; }
.badge { display: inline-block; padding: 4px 10px; border-radius: 4px; color: #fff; font-size: 12px; font-weight: 600; }
.badge-green { background: #10b981; }
.amount-positive { color: #10b981; font-weight: 600; }
.pager { text-align: center; margin: 24px 0; }
.page-btn { padding: 8px 14px; margin: 0 2px; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; }
.page-btn.active { background: #1a56db; color: #fff; border-color: #1a56db; }
.summary { text-align: center; color: #6b7280; font-size: 14px; }
`;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Apply the EXACT security headers that deliobt.kr returns
  // (Verified via `curl -sI https://deliobt.kr/transaction?coinType=ETH` on 2026-05-21)
  const securityHeaders = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache'
  };

  if (pathname === '/style.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', ...securityHeaders });
    res.end(CSS);
    return;
  }

  if (pathname === '/transaction') {
    const page = parseInt(parsed.query.page || '0', 10);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...securityHeaders });
    res.end(makePage(page));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[mock-server] listening on http://localhost:${PORT}`);
  console.log(`[mock-server] try: http://localhost:${PORT}/transaction?coinType=ETH&page=0`);
});
