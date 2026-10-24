@echo off
echo ===================================================
echo     DANG KHOI CHAY SELFSTORAGE AI ASSISTANT SERVICE
echo ===================================================
cd /d "%~dp0ai-service"
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
pause
