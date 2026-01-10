@echo off
echo ========================================
echo   RAG Voice Bot - Startup Script
echo ========================================
echo.

REM Проверка Docker
echo [1/3] Проверка Docker Desktop...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Desktop не запущен!
    echo 💡 Запустите Docker Desktop и попробуйте снова.
    pause
    exit /b 1
)
echo ✅ Docker Desktop работает

REM Проверка ChromaDB
echo.
echo [2/3] Проверка ChromaDB контейнера...
docker ps | findstr chromadb >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ ChromaDB не запущен, запускаем...
    docker start chromadb >nul 2>&1
    if %errorlevel% neq 0 (
        echo ❌ Не удалось запустить ChromaDB
        echo 💡 Попробуйте: docker run -d -p 8000:8000 --name chromadb chromadb/chroma
        pause
        exit /b 1
    )
    timeout /t 3 >nul
)
echo ✅ ChromaDB работает на порту 8000

REM Запуск Cloudflare Tunnel
echo.
echo [3/3] Запуск Cloudflare Tunnel...
pm2 start config/ecosystem.config.js
if %errorlevel% neq 0 (
    echo ⚠️ Ошибка запуска туннеля
)

echo.
echo ========================================
echo   ✅ Всё готово!
echo ========================================
echo.
echo Теперь запустите в ОТДЕЛЬНОМ терминале:
echo   node handlers/answer_phone.js
echo.
echo Для остановки туннеля:
echo   pm2 stop leader-tunnel
echo.
pause
