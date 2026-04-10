import json
import os
from copy import deepcopy

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UI_SETTINGS_FILE = os.path.join(APP_DIR, "ui_settings.json")

DEFAULT_UI_SETTINGS = {
    "brand": {
        "app_title": "UBY RECHARGE - Plataforma de Gestao",
        "app_caption": "Gerencie implantacao, operacao e faturamento dos seus eletropostos.",
    },
    "navigation": {
        "section_home": "Home",
        "section_implantation": "Implantacao",
        "section_management": "Gestao",
        "section_admin": "Administracao",
        "home": "Home",
        "implantation_summary": "Resumo do Projeto",
        "implantation_viability": "CAPEX e Viabilidade",
        "implantation_timeline": "Cronograma",
        "implantation_comparison": "Comparacao de Implantacao",
        "management_executive": "Visao Executiva",
        "management_operations": "Operacao",
        "management_billing": "Faturamento",
        "management_comparison": "Comparacao Operacional",
        "management_partners": "Parceiros",
        "integrations": "Integracoes",
        "manager_area": "Area Gestor",
        "ui_settings": "Configuracoes",
    },
    "home_cards": {
        "home_title": "Mapa",
        "home_subtitle": "Monitoramento",
        "implantation_title": "Implantacao",
        "implantation_subtitle": "Projetos e viabilidade",
        "management_title": "Gestao",
        "management_subtitle": "Operacao e faturamento",
        "manager_title": "Area do Gestor",
        "manager_subtitle": "Protegida",
        "integrations_title": "Integracoes",
        "integrations_subtitle": "Drive e parceiros",
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
