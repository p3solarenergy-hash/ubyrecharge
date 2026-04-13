import os

import streamlit as st

SESSION_KEY = "manager_authenticated"


def get_manager_password() -> str:
    try:
        manager_section = st.secrets.get("manager")
        if manager_section and manager_section.get("password"):
            return str(manager_section["password"])
    except Exception:
        pass

    return os.getenv("UBY_MANAGER_PASSWORD", "").strip()


def manager_password_configured() -> bool:
    return bool(get_manager_password())


def is_manager_authenticated() -> bool:
    return bool(st.session_state.get(SESSION_KEY, False))


def authenticate_manager(password: str) -> bool:
    expected_password = get_manager_password()
    if not expected_password:
        return False

    is_valid = password == expected_password
    st.session_state[SESSION_KEY] = is_valid
    return is_valid


def logout_manager():
    st.session_state[SESSION_KEY] = False


def render_manager_login(section_name: str = "Área do Gestor") -> bool:
    if is_manager_authenticated():
        return True

    if not manager_password_configured():
        st.warning(f"🔓 {section_name} está temporariamente aberta porque nenhuma senha do gestor foi configurada.")
        st.info(
            "Quando quisermos proteger de novo, basta configurar `manager.password` no Streamlit secrets "
            "ou a variável `UBY_MANAGER_PASSWORD`."
        )
        st.session_state[SESSION_KEY] = True
        return True

    st.warning(f"🔒 {section_name} protegida por senha.")

    with st.form(f"manager_login_{section_name}"):
        password = st.text_input("Senha do gestor", type="password")
        submitted = st.form_submit_button("Entrar", type="primary")

        if submitted:
            if authenticate_manager(password):
                st.success("Acesso liberado.")
                st.rerun()
            else:
                st.error("Senha incorreta.")

    return False


def show_manager_hint(message: str = "🔒 Disponível na Área do Gestor.") -> str:
    return message
