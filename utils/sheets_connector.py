"""
sheets_connector.py — Conector Google Sheets para P3 Energy
============================================================
Lê planilhas de viabilidade EV via Google Sheets API v4 (gspread).

Configuração de credenciais (service account):
  1. Crie um projeto no Google Cloud Console
  2. Ative a Google Sheets API e Google Drive API
  3. Crie uma Service Account e baixe o JSON de credenciais
  4. Compartilhe a planilha com o e-mail da Service Account (permissão Viewer)
  5. Adicione as credenciais ao .streamlit/secrets.toml:

     [gcp_service_account]
     type                        = "service_account"
     project_id                  = "seu-projeto"
     private_key_id              = "..."
     private_key                 = "-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----\\n"
     client_email                = "p3energy@seu-projeto.iam.gserviceaccount.com"
     client_id                   = "..."
     auth_uri                    = "https://accounts.google.com/o/oauth2/auth"
     token_uri                   = "https://oauth2.googleapis.com/token"
     auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
     client_x509_cert_url        = "..."
"""

from __future__ import annotations

import streamlit as st

try:
    import gspread
    from google.oauth2.service_account import Credentials
    _GSPREAD_AVAILABLE = True
except ImportError:
    _GSPREAD_AVAILABLE = False

# ── Configurações ─────────────────────────────────────────────────────────────

_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Planilhas conhecidas (nome → spreadsheet_id)
SPREADSHEETS = {
    "rio_beach_v12": "14giw1FZcQX8zaRYe6H_NUDvZBG2DFyrQuhBxecJr5nw",
}

# Mapeamento UBY_SCHEMA: campo → (aba, célula)
_FIELD_MAP: dict[str, tuple[str, str]] = {
    # Operacional
    "chargers_dc":         ("Inputs", "B5"),
    "power_dc_kw":         ("Inputs", "B6"),
    "chargers_ac":         ("Inputs", "B7"),
    "power_ac_kw":         ("Inputs", "B8"),
    "power_total_kw":      ("Inputs", "B10"),
    # Investimento
    "capex_total":         ("Inputs", "B18"),
    # Ocupação (cenário base)
    "occupancy_dc_pct":    ("Inputs", "D43"),
    "occupancy_ac_pct":    ("Inputs", "D47"),
    # Preços
    "sale_price_dc":       ("Inputs", "D53"),
    "sale_price_ac":       ("Inputs", "D54"),
    "energy_cost_kwh":     ("Inputs", "B37"),
    # Financeiro (cenário base)
    "energy_kwh_monthly":  ("Inputs", "D131"),
    "revenue_monthly":     ("Inputs", "D133"),
    "ebitda_monthly":      ("Inputs", "D138"),
}


# ── Autenticação ──────────────────────────────────────────────────────────────

def is_configured() -> bool:
    """Retorna True se as credenciais estão presentes no st.secrets."""
    return "gcp_service_account" in st.secrets


def _get_client() -> "gspread.Client":
    """Cria e retorna um cliente gspread autenticado."""
    if not _GSPREAD_AVAILABLE:
        raise ImportError(
            "Pacotes `gspread` e `google-auth` não instalados. "
            "Adicione-os ao requirements.txt."
        )
    creds_info = dict(st.secrets["gcp_service_account"])
    creds = Credentials.from_service_account_info(creds_info, scopes=_SCOPES)
    return gspread.authorize(creds)


# ── Funções principais ────────────────────────────────────────────────────────

@st.cache_data(ttl=300, show_spinner=False)
def get_project_data(project_key: str = "rio_beach_v12") -> dict | None:
    """
    Busca os dados de um projeto via Google Sheets API.

    Parâmetros
    ----------
    project_key : str
        Chave do dicionário SPREADSHEETS (ex: "rio_beach_v12").

    Retorno
    -------
    dict com dados do projeto, ou None se não configurado.
    """
    if not is_configured():
        return None

    spreadsheet_id = SPREADSHEETS.get(project_key)
    if not spreadsheet_id:
        raise ValueError(f"Planilha desconhecida: '{project_key}'")

    try:
        client = _get_client()
        wb = client.open_by_key(spreadsheet_id)

        # Agrupar células por aba para fazer batch por aba
        by_sheet: dict[str, list[tuple[str, str]]] = {}
        for field, (sheet_name, cell) in _FIELD_MAP.items():
            by_sheet.setdefault(sheet_name, []).append((field, cell))

        raw: dict[str, float | str] = {}

        for sheet_name, field_cells in by_sheet.items():
            ws = wb.worksheet(sheet_name)
            cell_addresses = [c for _, c in field_cells]
            field_names    = [f for f, _ in field_cells]

            # UNFORMATTED_VALUE → valores numéricos sem formatação R$, ponto, etc.
            results = ws.batch_get(
                cell_addresses,
                value_render_option="UNFORMATTED_VALUE",
            )

            for field_name, result in zip(field_names, results):
                try:
                    raw[field_name] = result[0][0]
                except (IndexError, TypeError):
                    raw[field_name] = 0

        def n(key: str, default: float = 0.0) -> float:
            """Converte para float com fallback."""
            v = raw.get(key, default)
            try:
                return float(v)
            except (TypeError, ValueError):
                return default

        # Calcular payback simples
        capex   = n("capex_total")
        ebitda  = n("ebitda_monthly")
        payback = round(capex / ebitda, 1) if ebitda > 0 else None

        return {
            "project_key":  project_key,
            "name":         "Rio Beach",
            "address":      "RIO BEACH",
            "status":       "Em Estudo",
            "spreadsheet_url": (
                f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
            ),
            "operational": {
                "chargers_dc":    int(n("chargers_dc")),
                "chargers_ac":    int(n("chargers_ac")),
                "power_dc_kw":    n("power_dc_kw"),
                "power_ac_kw":    n("power_ac_kw"),
                "power_total_kw": n("power_total_kw"),
            },
            "investment": {
                "capex_total": capex,
            },
            "occupancy": {
                "dc_pct": n("occupancy_dc_pct"),
                "ac_pct": n("occupancy_ac_pct"),
            },
            "pricing": {
                "sale_price_dc":  n("sale_price_dc"),
                "sale_price_ac":  n("sale_price_ac"),
                "energy_cost":    n("energy_cost_kwh"),
            },
            "finance": {
                "energy_kwh_monthly": n("energy_kwh_monthly"),
                "revenue_monthly":    n("revenue_monthly"),
                "ebitda_monthly":     ebitda,
                "payback_months":     payback,
            },
        }

    except Exception as exc:
        # Propaga o erro para que a UI possa exibir uma mensagem clara
        raise RuntimeError(f"Erro ao ler planilha '{project_key}': {exc}") from exc


@st.cache_data(ttl=300, show_spinner=False)
def list_all_projects() -> list[dict]:
    """
    Retorna lista com dados de todos os projetos configurados em SPREADSHEETS.
    Projetos que falharem são ignorados silenciosamente.
    """
    results = []
    for key in SPREADSHEETS:
        try:
            data = get_project_data(key)
            if data:
                results.append(data)
        except Exception:
            pass
    return results
