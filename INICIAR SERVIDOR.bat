@echo off

echo.
echo  ==========================================
echo   UBY RECHARGE  --  Servidor Local
echo  ==========================================
echo.

echo  Acesse no navegador:
echo.
echo    Neste computador:   http://localhost:8501
echo.
echo  Para encerrar: feche a janela do servidor ou pressione Ctrl+C
echo  ------------------------------------------
echo.

cd /d "%~dp0"
start "UBY RECHARGE" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start_streamlit.ps1"
