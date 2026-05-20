@echo off
chcp 65001 > nul
echo.
echo =========================================
echo   델리오 캡처 도구 - Python 환경 설치
echo =========================================
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo        https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요.
    echo        설치 시 "Add Python to PATH" 체크 필수!
    pause
    exit /b 1
)

echo [1/2] playwright 라이브러리 설치 중...
pip install playwright
if %errorlevel% neq 0 (
    echo [오류] 설치 실패. 인터넷 연결을 확인하세요.
    pause
    exit /b 1
)

echo.
echo [2/2] Chromium 브라우저 설치 중...
python -m playwright install chromium
if %errorlevel% neq 0 (
    echo [오류] Chromium 설치 실패.
    pause
    exit /b 1
)

echo.
echo =========================================
echo   설치 완료!
echo   이제 capture_delio.py 를 실행하세요.
echo =========================================
echo.
pause
