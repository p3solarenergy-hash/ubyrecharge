from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = BASE_DIR / ".logs"
LOG_DIR.mkdir(exist_ok=True)

os.chdir(BASE_DIR)

stdout = open(LOG_DIR / "streamlit.out.log", "a", encoding="utf-8", buffering=1)
stderr = open(LOG_DIR / "streamlit.err.log", "a", encoding="utf-8", buffering=1)

sys.stdout = stdout
sys.stderr = stderr
sys.argv = [
    "streamlit",
    "run",
    "app.py",
    "--server.headless",
    "true",
    "--server.port",
    "8501",
]

runpy.run_module("streamlit", run_name="__main__")
