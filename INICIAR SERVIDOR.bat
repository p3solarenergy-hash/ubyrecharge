@echo off

echo.
echo  ==========================================
echo   UBY RECHARGE  --  Servidor Local
echo  ==========================================
echo.

:: Mata instancia anterior se existir
taskkill /IM streamlit.exe /F >nul 2>&1

:: Aguarda a porta liberar
timeout /t 2 /nobreak >nul

:: Descobre IP local
for /f "tokens=4 delims= " %%i in ('route print 0.0.0.0 ^| findstr "0.0.0.0.*0.0.0.0"') do (
    set IP=%%i
    goto :found
)
:found

echo  Acesse no navegador:
echo.
echo    Neste computador:   http://localhost:8501
echo    Rede local (outros): http://%IP%:8501
echo.
echo  Compartilhe o link da rede com sua equipe.
echo  (Todos precisam estar no mesmo Wi-Fi ou rede.)
echo.
echo  Para encerrar: feche esta janela ou pressione Ctrl+C
echo  ------------------------------------------
echo.

:: Inicia o Streamlit
cd /d "%~dp0uby_recharge"
"C:\Users\eduar\AppData\Local\Python\pythoncore-3.14-64\Scripts\streamlit.exe" run app.py

pause
