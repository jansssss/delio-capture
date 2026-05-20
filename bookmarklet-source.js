(function () {
  'use strict';

  const BASE_URL = 'https://deliobt.kr/transaction';
  const UI_ID = 'delio-capture-ui';

  if (!location.href.includes('deliobt.kr')) {
    alert('델리오(deliobt.kr) 거래내역 페이지에서 실행해주세요.');
    return;
  }

  if (document.getElementById(UI_ID)) return;

  // ── UI ──────────────────────────────────────────────────────────────────
  function createUI() {
    const el = document.createElement('div');
    el.id = UI_ID;
    el.style.cssText =
      'position:fixed;top:20px;right:20px;width:320px;background:#fff;' +
      'border:2px solid #2d6cdf;border-radius:10px;padding:18px;z-index:2147483647;' +
      'font-family:sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);';
    el.innerHTML =
      '<div style="font-weight:700;font-size:15px;margin-bottom:10px;color:#2d6cdf">' +
      '&#128247; 델리오 캡처 도구</div>' +
      '<div id="dc-status" style="font-size:13px;color:#444;margin-bottom:10px;min-height:36px">초기화 중...</div>' +
      '<div id="dc-bar-wrap" style="display:none;margin-bottom:10px">' +
      '<div style="background:#eee;border-radius:4px;height:8px;overflow:hidden">' +
      '<div id="dc-bar" style="background:#2d6cdf;height:8px;width:0%;transition:width .3s"></div></div>' +
      '<div id="dc-bar-label" style="text-align:center;font-size:11px;color:#888;margin-top:3px"></div></div>' +
      '<button id="dc-close" style="width:100%;padding:7px;background:#888;color:#fff;' +
      'border:none;border-radius:5px;cursor:pointer;font-size:13px">취소 / 닫기</button>';
    document.body.appendChild(el);

    document.getElementById('dc-close').onclick = () => {
      cancelled = true;
      el.remove();
    };

    return {
      status(txt) { document.getElementById('dc-status').textContent = txt; },
      progress(cur, tot) {
        const wrap = document.getElementById('dc-bar-wrap');
        wrap.style.display = 'block';
        const pct = Math.round((cur / tot) * 100);
        document.getElementById('dc-bar').style.width = pct + '%';
        document.getElementById('dc-bar-label').textContent =
          cur + ' / ' + tot + ' 페이지 (' + pct + '%)';
      },
      done(msg) {
        document.getElementById('dc-status').textContent = msg;
        document.getElementById('dc-close').textContent = '닫기';
      },
    };
  }

  // ── Library loader ───────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('스크립트 로드 실패: ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ── Page count detection ─────────────────────────────────────────────────
  function getTotalPages(doc) {
    // Try "총 N건" pattern
    var walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var m = node.textContent.match(/총\s*([\d,]+)\s*건/);
      if (m) {
        var total = parseInt(m[1].replace(/,/g, ''), 10);
        return Math.ceil(total / 10);
      }
    }
    // Try largest page number button
    var maxPage = 0;
    doc.querySelectorAll('button, a').forEach(function (el) {
      var n = parseInt(el.textContent.trim(), 10);
      if (!isNaN(n) && n > maxPage) maxPage = n;
    });
    if (maxPage > 0) return maxPage;
    return null; // unknown
  }

  var cancelled = false;

  // ── Main ─────────────────────────────────────────────────────────────────
  async function run() {
    var ui = createUI();

    try {
      ui.status('라이브러리 로딩 중...');
      if (!window.html2canvas)
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      if (!window.JSZip)
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

      var params = new URLSearchParams(location.search);
      var coinType = params.get('coinType') || 'ETH';

      // Detect total pages from current page DOM
      ui.status('페이지 수 확인 중...');
      await new Promise(function (r) { setTimeout(r, 800); });
      var totalPages = getTotalPages(document);
      if (!totalPages) {
        totalPages = parseInt(prompt('페이지 수를 자동으로 확인할 수 없습니다.\n총 몇 페이지인지 입력해주세요:', '10') || '10', 10);
      }

      ui.status('총 ' + totalPages + '페이지 캡처 시작...');
      ui.progress(0, totalPages);

      var zip = new JSZip();
      var folder = zip.folder(coinType + '_captures');

      // Hidden iframe approach (same-origin: works without CORS)
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1440px;height:900px;border:none;';
      document.body.appendChild(iframe);

      for (var pg = 0; pg < totalPages; pg++) {
        if (cancelled) break;
        ui.status((pg + 1) + ' / ' + totalPages + ' 페이지 로딩 중...');

        var pageUrl = BASE_URL + '?coinType=' + coinType + '&page=' + pg;

        await new Promise(function (resolve) {
          iframe.onload = resolve;
          iframe.src = pageUrl;
        });

        // Wait for table inside iframe
        await new Promise(function (resolve) {
          var t0 = Date.now();
          (function check() {
            try {
              if (iframe.contentDocument.querySelector('table')) return resolve();
            } catch (e) { return resolve(); }
            if (Date.now() - t0 > 10000) return resolve();
            setTimeout(check, 300);
          })();
        });
        await new Promise(function (r) { setTimeout(r, 800); }); // extra render time

        ui.status((pg + 1) + ' / ' + totalPages + ' 페이지 캡처 중...');
        var canvas = await html2canvas(iframe.contentDocument.body, {
          useCORS: true,
          scale: 1,
          logging: false,
          width: 1440,
          windowWidth: 1440,
        });

        var blob = await new Promise(function (r) { canvas.toBlob(r, 'image/png'); });
        var buf = await blob.arrayBuffer();
        var fname = coinType + '_page_' + String(pg + 1).padStart(3, '0') + '.png';
        folder.file(fname, buf);

        ui.progress(pg + 1, totalPages);
      }

      iframe.remove();

      if (cancelled) {
        ui.done('취소되었습니다.');
        return;
      }

      ui.status('ZIP 파일 생성 중...');
      var zipBlob = await zip.generateAsync({ type: 'blob' });
      var url = URL.createObjectURL(zipBlob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'delio_' + coinType + '_' + new Date().toISOString().slice(0, 10) + '.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      ui.done('완료! ZIP 파일을 다운로드했습니다. ✓');
    } catch (err) {
      console.error('[Delio Capture]', err);
      ui.done('오류: ' + err.message);
    }
  }

  run();
})();
