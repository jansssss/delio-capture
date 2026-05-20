(function () {
  'use strict';

  var BASE_URL = 'https://deliobt.kr/transaction';
  var UI_ID = 'delio-capture-ui';

  if (!location.href.includes('deliobt.kr')) {
    alert('델리오(deliobt.kr) 거래내역 페이지에서 실행해주세요.');
    return;
  }
  if (document.getElementById(UI_ID)) return;

  var cancelled = false;

  // ── UI ──────────────────────────────────────────────────────────────────
  function createUI() {
    var el = document.createElement('div');
    el.id = UI_ID;
    el.style.cssText =
      'position:fixed;top:16px;right:16px;width:300px;background:#fff;' +
      'border:3px solid #1a56db;border-radius:14px;padding:20px;z-index:2147483647;' +
      'font-family:"맑은 고딕",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);';
    el.innerHTML =
      '<div style="font-size:18px;font-weight:700;color:#1a56db;margin-bottom:12px">📸 캡처 진행 중</div>' +
      '<div id="dc-status" style="font-size:16px;color:#222;margin-bottom:14px;line-height:1.5">준비 중...</div>' +
      '<div id="dc-bar-wrap" style="display:none;margin-bottom:14px">' +
        '<div style="background:#e5e7eb;border-radius:8px;height:12px;overflow:hidden">' +
          '<div id="dc-bar" style="background:#1a56db;height:12px;width:0%;transition:width .4s;border-radius:8px"></div>' +
        '</div>' +
        '<div id="dc-lbl" style="text-align:center;font-size:14px;color:#555;margin-top:6px"></div>' +
      '</div>' +
      '<button id="dc-close" style="width:100%;padding:10px;background:#6b7280;color:#fff;' +
        'border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600">취소</button>';
    document.body.appendChild(el);
    document.getElementById('dc-close').onclick = function () { cancelled = true; el.remove(); };
    return {
      status: function (t) { document.getElementById('dc-status').innerHTML = t; },
      progress: function (c, tot) {
        document.getElementById('dc-bar-wrap').style.display = 'block';
        var p = Math.round(c / tot * 100);
        document.getElementById('dc-bar').style.width = p + '%';
        document.getElementById('dc-lbl').textContent = c + ' / ' + tot + ' 페이지 (' + p + '%)';
      },
      done: function (m) {
        document.getElementById('dc-status').innerHTML = m;
        document.getElementById('dc-close').textContent = '닫기';
      }
    };
  }

  // ── Script loader ────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('로드 실패: ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ── Total page count ─────────────────────────────────────────────────────
  function getTotalPages(doc) {
    var walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var m = node.textContent.match(/총\s*([\d,]+)\s*건/);
      if (m) return Math.ceil(parseInt(m[1].replace(/,/g, ''), 10) / 10);
    }
    var max = 0;
    doc.querySelectorAll('button,a').forEach(function (el) {
      var n = parseInt(el.textContent.trim(), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max > 0 ? max : null;
  }

  // ── Save ZIP: Desktop first, fallback to auto-download ──────────────────
  async function saveZip(zipBlob, coin) {
    var fname = 'delio_' + coin + '_' + new Date().toISOString().slice(0, 10) + '.zip';
    // showSaveFilePicker opens the save dialog starting at the Desktop
    if (window.showSaveFilePicker) {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: fname,
          startIn: 'desktop',
          types: [{ description: 'ZIP 파일', accept: { 'application/zip': ['.zip'] } }]
        });
        var writable = await handle.createWritable();
        await writable.write(zipBlob);
        await writable.close();
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false; // user cancelled
      }
    }
    // Fallback: browser default download
    var url = URL.createObjectURL(zipBlob);
    var a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  async function run() {
    var ui = createUI();
    try {
      ui.status('라이브러리 불러오는 중...');
      if (!window.html2canvas)
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      if (!window.JSZip)
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

      var params = new URLSearchParams(location.search);
      var coin = params.get('coinType') || 'ETH';

      ui.status('페이지 수 확인 중...');
      await new Promise(function (r) { setTimeout(r, 800); });
      var total = getTotalPages(document);
      if (!total) {
        total = parseInt(prompt('페이지 수를 자동으로 확인하지 못했습니다.\n총 몇 페이지인지 숫자만 입력해 주세요.', '10') || '10', 10);
      }

      ui.status('총 <b>' + total + '페이지</b> 캡처를 시작합니다.<br><small>잠시 기다려 주세요!</small>');
      ui.progress(0, total);

      var zip = new JSZip();
      var folder = zip.folder(coin + '_captures');

      // Hidden iframe (same-origin — no CORS issues)
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1440px;height:900px;border:none;';
      document.body.appendChild(iframe);

      for (var pg = 0; pg < total; pg++) {
        if (cancelled) break;
        ui.status((pg + 1) + '번째 페이지 캡처 중...<br><small>창을 닫지 마세요!</small>');

        await new Promise(function (resolve) {
          iframe.onload = resolve;
          iframe.src = BASE_URL + '?coinType=' + coin + '&page=' + pg;
        });

        // Wait for table
        await new Promise(function (resolve) {
          var t0 = Date.now();
          (function check() {
            try { if (iframe.contentDocument.querySelector('table')) return resolve(); } catch (e) { return resolve(); }
            if (Date.now() - t0 > 10000) return resolve();
            setTimeout(check, 300);
          })();
        });
        await new Promise(function (r) { setTimeout(r, 900); });

        var canvas = await html2canvas(iframe.contentDocument.body, {
          useCORS: true, scale: 1, logging: false, width: 1440, windowWidth: 1440
        });
        var blob = await new Promise(function (r) { canvas.toBlob(r, 'image/png'); });
        var buf = await blob.arrayBuffer();
        folder.file(coin + '_page_' + String(pg + 1).padStart(3, '0') + '.png', buf);
        ui.progress(pg + 1, total);
      }

      iframe.remove();
      if (cancelled) { ui.done('취소되었습니다.'); return; }

      ui.status('파일 저장 중...');
      var zipBlob = await zip.generateAsync({ type: 'blob' });
      var saved = await saveZip(zipBlob, coin);

      if (saved) {
        ui.done('✅ 완료!<br>바탕화면에 <b>' + coin + ' 파일</b>이 저장되었습니다.');
      } else {
        ui.done('저장이 취소되었습니다.');
      }
    } catch (err) {
      console.error('[Delio Capture]', err);
      ui.done('⚠️ 오류: ' + err.message);
    }
  }

  run();
})();
