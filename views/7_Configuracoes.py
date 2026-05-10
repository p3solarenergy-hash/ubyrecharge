"""
Configurações de Interface — ajuste navegação e marcas sem editar código
"""
import os
import sys

import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.manager_auth import render_manager_login
from utils.p3_styles import inject, page_header, section_title
from utils.ui_settings import load_ui_settings, reset_ui_settings, save_ui_settings

inject()

page_header(
    "⚙️ Configurações de Interface",
    "Ajuste os blocos principais do app sem editar o código.",
)

if not render_manager_login("Configuracoes"):
    st.stop()

settings = load_ui_settings()

with st.form("ui_settings_form"):
    # ── Marca ────────────────────────────────────────────────────────────────
    section_title("Marca")
    bc1, bc2 = st.columns(2)
    app_title   = bc1.text_input("Título principal",  value=settings["brand"]["app_title"])
    app_caption = bc2.text_input("Subtítulo",          value=settings["brand"]["app_caption"])

    st.markdown("")

    # ── Navegação ─────────────────────────────────────────────────────────────
    section_title("Navegação")
    nav = settings["navigation"]
    nc1, nc2 = st.columns(2)

    section_home         = nc1.text_input("Seção Home",                value=nav["section_home"])
    section_implantation = nc2.text_input("Seção Implantação",         value=nav["section_implantation"])
    section_management   = nc1.text_input("Seção Gestão",              value=nav["section_management"])
    section_admin        = nc2.text_input("Seção Administração",       value=nav["section_admin"])
    home                 = nc1.text_input("Página Home",               value=nav["home"])
    implantation_summary = nc2.text_input("Resumo do Projeto",         value=nav["implantation_summary"])
    implantation_viability = nc1.text_input("CAPEX e Viabilidade",     value=nav.get("implantation_viability",""))
    implantation_timeline  = nc2.text_input("Cronograma",              value=nav.get("implantation_timeline",""))
    implantation_comparison = nc1.text_input("Comparação Implantação", value=nav["implantation_comparison"])
    management_executive  = nc2.text_input("Visão Executiva",          value=nav.get("management_executive",""))
    management_operations = nc1.text_input("Operação",                 value=nav.get("management_operations",""))
    management_billing    = nc2.text_input("Faturamento",              value=nav["management_billing"])
    management_comparison = nc1.text_input("Comparação Operacional",   value=nav.get("management_comparison",""))
    management_partners   = nc2.text_input("Parceiros",                value=nav.get("management_partners",""))
    integrations          = nc1.text_input("Integrações",              value=nav["integrations"])
    instagram_agent       = nc2.text_input("Agente Instagram",         value=nav.get("instagram_agent","Agente Instagram"))
    crm_implantation      = nc1.text_input("CRM Implantação",          value=nav.get("crm_implantation",""))
    manager_area          = nc2.text_input("Área do Gestor",           value=nav.get("manager_area",""))
    ui_settings_label     = nc1.text_input("Configurações",            value=nav["ui_settings"])

    st.markdown("")

    # ── Cards da Home ─────────────────────────────────────────────────────────
    section_title("Cards da Home")
    cards = settings["home_cards"]
    cc1, cc2 = st.columns(2)

    home_title             = cc1.text_input("Mapa — título",             value=cards["home_title"])
    home_subtitle          = cc2.text_input("Mapa — subtítulo",          value=cards["home_subtitle"])
    implantation_title     = cc1.text_input("Implantação — título",      value=cards["implantation_title"])
    implantation_subtitle  = cc2.text_input("Implantação — subtítulo",   value=cards["implantation_subtitle"])
    management_title       = cc1.text_input("Gestão — título",           value=cards["management_title"])
    management_subtitle    = cc2.text_input("Gestão — subtítulo",        value=cards["management_subtitle"])
    manager_title          = cc1.text_input("Gestor — título",           value=cards["manager_title"])
    manager_subtitle       = cc2.text_input("Gestor — subtítulo",        value=cards["manager_subtitle"])
    integrations_title     = cc1.text_input("Integrações — título",      value=cards["integrations_title"])
    integrations_subtitle  = cc2.text_input("Integrações — subtítulo",   value=cards["integrations_subtitle"])

    st.markdown("")
    submitted = st.form_submit_button("💾 Salvar configurações", type="primary", use_container_width=True)

if submitted:
    save_ui_settings({
        "brand": {
            "app_title":   app_title.strip()   or settings["brand"]["app_title"],
            "app_caption": app_caption.strip() or settings["brand"]["app_caption"],
        },
        "navigation": {
            "section_home":            section_home.strip()            or nav["section_home"],
            "section_implantation":    section_implantation.strip()    or nav["section_implantation"],
            "section_management":      section_management.strip()      or nav["section_management"],
            "section_admin":           section_admin.strip()           or nav["section_admin"],
            "home":                    home.strip()                    or nav["home"],
            "implantation_summary":    implantation_summary.strip()    or nav["implantation_summary"],
            "implantation_viability":  implantation_viability.strip()  or nav.get("implantation_viability",""),
            "implantation_timeline":   implantation_timeline.strip()   or nav.get("implantation_timeline",""),
            "implantation_comparison": implantation_comparison.strip() or nav["implantation_comparison"],
            "management_executive":    management_executive.strip()    or nav.get("management_executive",""),
            "management_operations":   management_operations.strip()   or nav.get("management_operations",""),
            "management_billing":      management_billing.strip()      or nav["management_billing"],
            "management_comparison":   management_comparison.strip()   or nav.get("management_comparison",""),
            "management_partners":     management_partners.strip()     or nav.get("management_partners",""),
            "integrations":            integrations.strip()            or nav["integrations"],
            "instagram_agent":         instagram_agent.strip()         or nav.get("instagram_agent","Agente Instagram"),
            "crm_implantation":        crm_implantation.strip()        or nav.get("crm_implantation",""),
            "manager_area":            manager_area.strip()            or nav.get("manager_area",""),
            "ui_settings":             ui_settings_label.strip()       or nav["ui_settings"],
        },
        "home_cards": {
            "home_title":            home_title.strip()            or cards["home_title"],
            "home_subtitle":         home_subtitle.strip()         or cards["home_subtitle"],
            "implantation_title":    implantation_title.strip()    or cards["implantation_title"],
            "implantation_subtitle": implantation_subtitle.strip() or cards["implantation_subtitle"],
            "management_title":      management_title.strip()      or cards["management_title"],
            "management_subtitle":   management_subtitle.strip()   or cards["management_subtitle"],
            "manager_title":         manager_title.strip()         or cards["manager_title"],
            "manager_subtitle":      manager_subtitle.strip()      or cards["manager_subtitle"],
            "integrations_title":    integrations_title.strip()    or cards["integrations_title"],
            "integrations_subtitle": integrations_subtitle.strip() or cards["integrations_subtitle"],
        },
    })
    st.success("✅ Configurações salvas. Recarregue o app para ver a nova navegação.")

st.markdown("---")

col_reset, col_preview = st.columns([1, 3])
with col_reset:
    if st.button("🔄 Restaurar padrão", use_container_width=True):
        reset_ui_settings()
        st.success("Configuração padrão restaurada.")
        st.rerun()

section_title("Prévia das configurações atuais")
st.json(load_ui_settings())

st.markdown("---")
st.caption("P3 Energy • Configurações de interface e navegação.")
