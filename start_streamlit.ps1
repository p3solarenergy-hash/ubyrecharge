$ErrorActionPreference = "Continue"

Set-Location $PSScriptRoot

New-Item -ItemType Directory -Force ".logs" | Out-Null

$python = "C:\Users\Eduardo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

Write-Host ""
Write-Host "=========================================="
Write-Host " UBY RECHARGE - Servidor Local"
Write-Host "=========================================="
Write-Host ""
Write-Host "Acesse: http://localhost:8501"
Write-Host "Para encerrar: pressione Ctrl+C ou feche esta janela."
Write-Host ""

$existing = Get-NetTCPConnection -LocalPort 8501 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $existing) {
    if ($processId -and $processId -ne $PID) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

& $python -m streamlit run app.py --server.headless true --server.port 8501
