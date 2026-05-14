"""Cliente seguro para a API da movE.

As credenciais devem ficar em Streamlit secrets ou variaveis de ambiente.
Nunca coloque usuario/senha em HTML estatico ou arquivos publicados.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

import requests

try:
    import streamlit as st
except Exception:  # pragma: no cover
    st = None  # type: ignore


DEFAULT_BASE_URL = "https://cs-test.use-move.com"
DEFAULT_DOCS_URL = "https://cs-test.use-move.com/doc-api"


@dataclass(frozen=True)
class MoveConfig:
    base_url: str = DEFAULT_BASE_URL
    docs_url: str = DEFAULT_DOCS_URL
    username: str = ""
    password: str = ""
    api_key: str = ""
    platform: str = "DASHBOARD"
    token: str = ""
    timeout: int = 30


class MoveApiError(RuntimeError):
    pass


def _secret(section: str, key: str, env_name: str, default: str = "") -> str:
    value: Any = ""
    if st is not None:
        try:
            value = st.secrets.get(section, {}).get(key, "")
        except Exception:
            value = ""
    return str(value or os.getenv(env_name, default) or "").strip()


def get_move_config() -> MoveConfig:
    return MoveConfig(
        base_url=_secret("move_api", "base_url", "MOVE_API_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
        docs_url=_secret("move_api", "docs_url", "MOVE_API_DOCS_URL", DEFAULT_DOCS_URL),
        username=_secret("move_api", "username", "MOVE_API_USERNAME"),
        password=_secret("move_api", "password", "MOVE_API_PASSWORD"),
        api_key=_secret("move_api", "api_key", "MOVE_API_KEY"),
        platform=_secret("move_api", "platform", "MOVE_API_PLATFORM", "DASHBOARD"),
        token=_secret("move_api", "token", "MOVE_API_TOKEN"),
        timeout=int(_secret("move_api", "timeout", "MOVE_API_TIMEOUT", "30") or "30"),
    )


def is_configured(config: MoveConfig | None = None) -> bool:
    cfg = config or get_move_config()
    return bool(cfg.base_url and cfg.username and cfg.password and cfg.api_key)


class MoveClient:
    def __init__(self, config: MoveConfig | None = None, token: str = "") -> None:
        self.config = config or get_move_config()
        self.token = token or self.config.token
        self.session = requests.Session()

    def _headers(self, authenticated: bool = True) -> dict[str, str]:
        headers = {"Platform": self.config.platform or "DASHBOARD"}
        if self.config.api_key:
            headers["Api-Key"] = self.config.api_key
        if authenticated and self.token:
            headers["Authorization"] = self.token
        return headers

    def login(self) -> dict[str, Any]:
        if not self.config.username or not self.config.password or not self.config.api_key:
            raise MoveApiError("Configure usuario, senha e Api-Key da movE antes de autenticar.")
        response = self.request(
            "/api/v1/login",
            method="POST",
            json={
                "email": self.config.username,
                "password": self.config.password,
                "recaptchaResponse": "",
            },
            authenticated=False,
        )
        data = response.json()
        token = str(data.get("token") or "").strip()
        if token:
            self.token = token
        return data

    def request(
        self,
        path_or_url: str,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        authenticated: bool = True,
    ) -> requests.Response:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            url = path_or_url
        else:
            url = urljoin(self.config.base_url + "/", path_or_url.lstrip("/"))
        try:
            response = self.session.request(
                method=method.upper(),
                url=url,
                params=params,
                json=json,
                headers=self._headers(authenticated=authenticated),
                timeout=self.config.timeout,
            )
        except requests.RequestException as exc:
            raise MoveApiError(f"Falha de conexao com a movE: {exc}") from exc
        if response.status_code >= 400:
            detail = response.text[:500].replace("\n", " ")
            raise MoveApiError(f"movE retornou HTTP {response.status_code}: {detail}")
        return response

    def get_json(self, path_or_url: str, params: dict[str, Any] | None = None) -> Any:
        response = self.request(path_or_url, params=params)
        try:
            return response.json()
        except ValueError as exc:
            raise MoveApiError("Resposta da movE nao veio em JSON.") from exc

    def get_text(self, path_or_url: str) -> str:
        return self.request(path_or_url).text


def normalize_records(payload: Any) -> list[dict[str, Any]]:
    """Converte formatos comuns de API em lista de registros para tabela."""
    if isinstance(payload, list):
        return [item if isinstance(item, dict) else {"valor": item} for item in payload]
    if isinstance(payload, dict):
        for key in ("data", "items", "results", "records", "content"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item if isinstance(item, dict) else {"valor": item} for item in value]
        return [payload]
    return [{"valor": payload}]
