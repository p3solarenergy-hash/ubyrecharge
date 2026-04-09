import json
import os
from copy import deepcopy

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UI_SETTINGS_FILE = os.path.join(APP_DIR, "ui_settings.json")

DEFAULT_UI_SETTINGS = {
    "brand": {
        "app_title": "UBY RECHARGE — Plataforma de Gestão",
        "app_caption": "Gerencie, analise e compare seus projetos de recarga elétrica.",
    },
    "navigation": {
        "section_general": "Geral",
        "home": "Home",
        "dashboard": "Dashboard",
        "projects": "Projetos",
        "comparison": "Comparacao",
        "analysis": "Analise",
        "integrations": "Integracoes",
        "manager_area": "Area Gestor",
        "ui_settings": "Configuracoes",
    },
    "home_cards": {
        "home_title": "Home",
        "home_subtitle": "Visão geral",
        "dashboard_title": "Dashboard",
        "dashboard_subtitle": "Indicadores",
        "projects_title": "Projetos",
        "projects_subtitle": "Operação",
        "comparison_title": "Comparação",
        "comparison_subtitle": "Lado a lado",
        "manager_title": "Área do Gestor",
        "manager_subtitle": "Protegida",
        "integrations_title": "Integrações",
        "integrations_subtitle": "Drive",
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_ui_settings() -> dict:
    if not os.path.exists(UI_SETTINGS_FILE):
        return deepcopy(DEFAULT_UI_SETTINGS)

    try:
        with open(UI_SETTINGS_FILE, "r", encoding="utf-8") as file:
            saved = json.load(file)
        return _deep_merge(DEFAULT_UI_SETTINGS, saved)
    except Exception:
        return deepcopy(DEFAULT_UI_SETTINGS)


def save_ui_settings(data: dict):
    merged = _deep_merge(DEFAULT_UI_SETTINGS, data)
    with open(UI_SETTINGS_FILE, "w", encoding="utf-8") as file:
        json.dump(merged, file, ensure_ascii=False, indent=2)


def reset_ui_settings():
    save_ui_settings(DEFAULT_UI_SETTINGS)
