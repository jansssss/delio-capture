# 📸 델리오 거래내역 캡처 도구

델리오(deliobt.kr) 거래내역 전 페이지를 자동 캡처하여 ZIP 파일로 저장하는 도구입니다.

**🌐 [바로 사용하기 (GitHub Pages)](https://jansssss.github.io/delio-capture)**

---

## 🔖 방법 1: 브라우저 북마클릿 (설치 불필요)

1. 위 링크(GitHub Pages)에서 **"📸 델리오 캡처" 버튼을 북마크바로 드래그**
2. 델리오에 로그인 → 거래내역 페이지 이동
3. 북마크바의 **"📸 델리오 캡처" 클릭**
4. 자동 캡처 후 ZIP 파일 다운로드

---

## 🐍 방법 2: Python 스크립트 (고품질 캡처)

### 요구사항
- Python 3.8 이상
- Chrome 브라우저

### 설치

```bash
pip install playwright
python -m playwright install chromium
```

Windows는 `setup.bat`를 더블클릭해도 됩니다.

### 실행

```bash
python capture_delio.py
```

1. 브라우저가 열리면 델리오에 로그인
2. 거래내역 페이지가 로드되면 자동으로 캡처 시작
3. `captures/` 폴더에 날짜별 PNG 파일 저장

### 코인 종류 변경

`capture_delio.py` 파일의 16번째 줄을 수정하세요:

```python
COIN_TYPES = ["ETH"]  # 예: ["ETH", "BTC", "USDT"]
```

---

## 📁 저장 위치

| 방법 | 위치 |
|------|------|
| 북마클릿 | 다운로드 폴더 (`.zip`) |
| Python | `captures/YYYYMMDD_HHMMSS/코인명/` |

---

## ⚠️ 주의사항

- 이 도구는 본인 계정의 데이터를 백업하기 위한 개인 용도입니다.
- 수집된 데이터는 외부 서버로 전송되지 않습니다.
- 델리오 서비스 정책을 확인하고 사용하세요.

---

## 🔧 문제 해결

**북마클릿이 동작하지 않는 경우**  
→ 브라우저의 보안 정책(CSP)으로 차단될 수 있습니다. Python 스크립트를 사용하세요.

**페이지 수가 잘못 감지되는 경우**  
→ 팝업창에서 직접 페이지 수를 입력하세요.

---

## 📜 라이선스

MIT License
