"""
Delio 거래내역 페이지 자동 캡처 스크립트
- 브라우저가 열리면 직접 로그인하세요
- 로그인 완료 후 자동으로 전 페이지 캡처가 시작됩니다

설치: pip install playwright && python -m playwright install chromium
실행: python capture_delio.py
"""

import sys
import time
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

BASE_URL = "https://deliobt.kr/transaction"
OUTPUT_DIR = Path(__file__).parent / "captures"

COIN_TYPES = ["ETH"]  # 필요시 추가: ["ETH", "BTC", "USDT", ...]


def wait_for_login(page):
    print("\n[대기] 브라우저에서 로그인해 주세요...")
    print("      로그인 완료 후 거래내역 페이지가 보이면 자동으로 캡처를 시작합니다.\n")
    page.wait_for_selector("table", timeout=300_000)
    time.sleep(1)
    print("[완료] 로그인 감지됨. 캡처를 시작합니다.\n")


def get_total_pages(page):
    try:
        text = page.locator("text=/총 \\d+건/").first.inner_text()
        total = int("".join(filter(str.isdigit, text.split("건")[0].split("총")[1])))
        pages = (total + 9) // 10
        print(f"  총 {total}건 → {pages}페이지")
        return pages
    except Exception:
        pass

    try:
        buttons = page.locator("button, a").all()
        page_nums = []
        for btn in buttons:
            t = btn.inner_text().strip()
            if t.isdigit():
                page_nums.append(int(t))
        if page_nums:
            return max(page_nums)
    except Exception:
        pass

    return 20  # 기본값


def capture_all_pages(coin_type: str, output_dir: Path, page):
    coin_dir = output_dir / coin_type
    coin_dir.mkdir(parents=True, exist_ok=True)

    url = f"{BASE_URL}?coinType={coin_type}&page=0"
    print(f"[{coin_type}] 첫 페이지 로딩: {url}")
    page.goto(url, wait_until="networkidle", timeout=30_000)
    time.sleep(1.5)

    total_pages = get_total_pages(page)
    print(f"[{coin_type}] 총 {total_pages}페이지 캡처 시작\n")

    for i in range(total_pages):
        page_url = f"{BASE_URL}?coinType={coin_type}&page={i}"
        if i > 0:
            page.goto(page_url, wait_until="networkidle", timeout=30_000)
            time.sleep(1.0)

        try:
            page.wait_for_selector("table", timeout=10_000)
        except Exception:
            print(f"  [경고] {i+1}페이지 테이블 감지 실패, 그냥 캡처합니다.")

        filename = coin_dir / f"{coin_type}_page_{i+1:03d}.png"
        page.screenshot(path=str(filename), full_page=True)
        print(f"  저장: {filename.name}  ({i+1}/{total_pages})")

    print(f"\n[{coin_type}] 완료: {coin_dir}\n")


def main():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = OUTPUT_DIR / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"저장 경로: {output_dir}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--start-maximized"],
        )
        context = browser.new_context(
            viewport={"width": 1400, "height": 900},
            locale="ko-KR",
        )
        page = context.new_page()

        print("브라우저를 엽니다...")
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)

        wait_for_login(page)

        for coin in COIN_TYPES:
            try:
                capture_all_pages(coin, output_dir, page)
            except Exception as e:
                print(f"[오류] {coin} 캡처 중 오류 발생: {e}")

        print("=" * 50)
        print(f"모든 캡처 완료!")
        print(f"저장 위치: {output_dir}")
        print("=" * 50)

        input("\n엔터를 누르면 브라우저를 닫습니다...")
        browser.close()


if __name__ == "__main__":
    main()
