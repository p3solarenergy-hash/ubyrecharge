"""
calendar_sync.py — Integração com Google Calendar API
========================================================
Busca próximos eventos da agenda p3solarenergy@gmail.com.
Reutiliza as credenciais OAuth do Google Drive quando disponíveis.

Escopos necessários (adicionar ao token se ainda não tiver):
  https://www.googleapis.com/auth/calendar.readonly
"""
import datetime
import os
from pathlib import Path

# ─── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────
CALENDAR_ID = "p3solarenergy@gmail.com"   # agenda principal P3 Energy
TIMEZONE    = "America/Sao_Paulo"

# Caminhos dos arquivos de credencial (mesmo padrão do drive_sync.py)
APP_DIR    = Path(__file__).resolve().parent.parent
CREDS_FILE = APP_DIR / "credentials.json"
TOKEN_FILE = APP_DIR / "drive_token.json"

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar.readonly",
]

# ─── FUNÇÕES ───────────────────────────────────────────────────────────────────

def _build_credentials():
    """
    Constrói credenciais Google a partir de:
    1. Streamlit Cloud secrets  (refresh_token em [google_oauth])
    2. drive_token.json local   (fallback local)
    Retorna None se nenhuma credencial estiver disponível ou tiver escopo.
    """
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except ImportError:
        return None

    creds = None

    # --- Streamlit Cloud: via secrets ---
    try:
        import streamlit as st
        if hasattr(st, "secrets") and "google_oauth" in st.secrets:
            sec = st.secrets["google_oauth"]
            creds = Credentials(
                token=None,
                refresh_token=sec.get("refresh_token"),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=sec.get("client_id"),
                client_secret=sec.get("client_secret"),
                scopes=SCOPES,
            )
    except Exception:
        pass

    # --- Local: via drive_token.json ---
    if not creds and TOKEN_FILE.exists():
        import json
        try:
            data = json.loads(TOKEN_FILE.read_text())
            creds = Credentials(
                token=data.get("token"),
                refresh_token=data.get("refresh_token"),
                token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
                client_id=data.get("client_id"),
                client_secret=data.get("client_secret"),
                scopes=data.get("scopes", SCOPES),
            )
        except Exception:
            pass

    # Atualiza token expirado
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            return None

    return creds


def get_upcoming_events(n: int = 8) -> list[dict]:
    """
    Retorna até `n` próximos eventos da agenda P3 Energy.

    Cada evento é um dict com:
      - summary    : título do evento
      - start      : datetime de início (aware, America/Sao_Paulo)
      - end        : datetime de fim
      - location   : local (str ou '')
      - description: descrição (str ou '')
      - link       : link do Google Calendar
    """
    try:
        from googleapiclient.discovery import build
    except ImportError:
        return []

    creds = _build_credentials()
    if not creds:
        return []

    try:
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        result = service.events().list(
            calendarId=CALENDAR_ID,
            timeMin=now,
            maxResults=n,
            singleEvents=True,
            orderBy="startTime",
        ).execute()

        events = []
        for item in result.get("items", []):
            start_raw = item.get("start", {})
            end_raw   = item.get("end",   {})

            # Suporta eventos com horário e eventos de dia inteiro
            if "dateTime" in start_raw:
                start = datetime.datetime.fromisoformat(start_raw["dateTime"])
                end   = datetime.datetime.fromisoformat(end_raw["dateTime"])
                all_day = False
            else:
                start = datetime.datetime.fromisoformat(start_raw["date"])
                end   = datetime.datetime.fromisoformat(end_raw["date"])
                all_day = True

            events.append({
                "summary":     item.get("summary", "Sem título"),
                "start":       start,
                "end":         end,
                "all_day":     all_day,
                "location":    item.get("location", ""),
                "description": item.get("description", ""),
                "link":        item.get("htmlLink", ""),
            })

        return events

    except Exception:
        return []


def calendar_connected() -> bool:
    """Retorna True se conseguiu conectar ao Google Calendar."""
    creds = _build_credentials()
    if not creds:
        return False
    try:
        from googleapiclient.discovery import build
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        service.calendarList().get(calendarId=CALENDAR_ID).execute()
        return True
    except Exception:
        return False
