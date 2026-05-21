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
  var navTimer = null;

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
      '<div id="dc-s" style="font-size:16px;color:#222;margin-bottom:14px;line-height:1.6">준비 중...</div>' +
      '<div id="dc-bw" style="display:none;margin-bottom:14px">' +
        '<div style="background:#e5e7eb;border-radius:8px;height:12px;overflow:hidden">' +
          '<div id="dc-b" style="background:#1a56db;height:12px;width:0%;transition:width .4s;border-radius:8px"></div>' +
        '</div>' +
        '<div id="dc-l" style="text-align:center;font-size:14px;color:#555;margin-top:6px"></div>' +
      '</div>' +
      '<button id="dc-x" style="width:100%;padding:10px;background:#6b7280;color:#fff;' +
        'border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600">취소</button>';
    document.body.appendChild(el);
    document.getElementById('dc-x').onclick = function () {
      cancelled = true;
      if (navTimer) clearInterval(navTimer);
      el.remove();
    };
    return {
      status: function (t) { document.getElementById('dc-s').innerHTML = t; },
      progress: function (c, tot) {
        document.getElementById('dc-bw').style.display = 'block';
        var p = Math.round(c / tot * 100);
        document.getElementById('dc-b').style.width = p + '%';
        document.getElementById('dc-l').textContent = c + ' / ' + tot + ' 페이지 (' + p + '%)';
      },
      done: function (m) {
        document.getElementById('dc-s').innerHTML = m;
        document.getElementById('dc-x').textContent = '닫기 (자동 이동 취소)';
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

  // ── Save ZIP (Desktop first) ─────────────────────────────────────────────
  async function saveZip(zipBlob, coin) {
    var fname = 'delio_' + coin + '_' + new Date().toISOString().slice(0, 10) + '.zip';
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
        if (e.name === 'AbortError') return false;
      }
    }
    var url = URL.createObjectURL(zipBlob);
    var a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  // ── 완료 후 코인 목록으로 자동 복귀 ────────────────────────────────────────
  function startReturnCountdown(ui, coin) {
    var count = 5;
    ui.done(
      '✅ <b>' + coin + '</b> 캡처 완료!<br>' +
      '바탕화면에 파일이 저장되었습니다.<br><br>' +
      '다른 코인도 저장하려면<br>코인 목록으로 돌아가 다음 코인을 클릭하세요.<br><br>' +
      '<span id="dc-count" style="font-size:14px;color:#6b7280">' + count + '초 후 코인 목록으로 자동 이동...</span>'
    );
    navTimer = setInterval(function () {
      count--;
      var el = document.getElementById('dc-count');
      if (el) el.textContent = count + '초 후 코인 목록으로 자동 이동...';
      if (count <= 0) {
        clearInterval(navTimer);
        history.back();
      }
    }, 1000);
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

      ui.status('총 <b>' + total + '페이지</b> 캡처 시작!<br><small>잠시 기다려 주세요</small>');
      ui.progress(0, total);

      var zip = new JSZip();
      var folder = zip.folder(coin + '_captures');

      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1440px;height:900px;border:none;';
      document.body.appendChild(iframe);

      for (var pg = 0; pg < total; pg++) {
        if (cancelled) break;
        ui.status((pg + 1) + '번째 페이지 캡처 중...<br><small>창을 닫지 마세요!</small>');

        var resp = await fetch(BASE_URL + '?coinType=' + coin + '&page=' + pg, { credentials: 'include' });
        if (!resp.ok) throw new Error('페이지 요청 실패 (HTTP ' + resp.status + ')');
        var pageHtml = await resp.text();

        // <base> 태그를 주입해 상대 경로 CSS/이미지가 원본 도메인에서 로드되도록 함
        if (!pageHtml.match(/<base\s/i)) {
          pageHtml = pageHtml.replace(/(<head[^>]*>)/i, '$1<base href="https://deliobt.kr/">');
        }

        await new Promise(function (resolve) {
          iframe.onload = resolve;
          iframe.srcdoc = pageHtml;
        });
        await new Promise(function (r) { setTimeout(r, 600); });

        if (!iframe.contentDocument || !iframe.contentDocument.body)
          throw new Error('페이지 렌더링 실패. 콘솔에서 오류를 확인하세요.');

        var canvas = await html2canvas(iframe.contentDocument.body, {
          useCORS: true, scale: 1, logging: false, width: 1440, windowWidth: 1440
        });
        var blob = await new Promise(function (r) { canvas.toBlob(r, 'image/png'); });
        folder.file(coin + '_page_' + String(pg + 1).padStart(3, '0') + '.png', await blob.arrayBuffer());
        ui.progress(pg + 1, total);
      }

      iframe.remove();

      if (cancelled) { ui.done('취소되었습니다.'); return; }

      ui.status('파일 저장 중...');
      var zipBlob = await zip.generateAsync({ type: 'blob' });
      var saved = await saveZip(zipBlob, coin);

      if (saved) {
        startReturnCountdown(ui, coin);
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
