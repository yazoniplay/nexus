"""GitHub OAuth and encrypted connection persistence for Nexus.

This is a single-workspace MVP: the signed HttpOnly session identifies the GitHub
account that completed OAuth. The OAuth token is encrypted before it is stored.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request, Response

SESSION_COOKIE = "nexus_session"
STATE_COOKIE = "nexus_oauth_state"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
HTTP_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured on the backend.")
    return value


def _signing_key() -> bytes:
    return _required("NEXUS_SESSION_SECRET").encode("utf-8")


def _fernet() -> Fernet:
    try:
        return Fernet(_required("NEXUS_ENCRYPTION_KEY").encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError("NEXUS_ENCRYPTION_KEY must be a valid Fernet key.") from exc


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signed_payload(payload: dict[str, Any]) -> str:
    encoded = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signature = _b64(hmac.new(_signing_key(), encoded.encode(), hashlib.sha256).digest())
    return encoded + "." + signature


def _verify_payload(value: str) -> dict[str, Any] | None:
    try:
        encoded, supplied = value.split(".", 1)
        expected = _b64(hmac.new(_signing_key(), encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(supplied, expected):
            return None
        payload = json.loads(_unb64(encoded))
        if not isinstance(payload, dict) or int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None


def github_is_configured() -> bool:
    names = ("GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_CALLBACK_URL",
             "NEXUS_SESSION_SECRET", "NEXUS_ENCRYPTION_KEY", "SUPABASE_URL",
             "SUPABASE_SERVICE_ROLE_KEY")
    return all(os.getenv(name, "").strip() for name in names)


def _supabase_config() -> tuple[str, str]:
    return _required("SUPABASE_URL").rstrip("/"), _required("SUPABASE_SERVICE_ROLE_KEY")


async def _supabase_upsert(record: dict[str, Any]) -> None:
    base, key = _supabase_config()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.post(
            f"{base}/rest/v1/github_connections",
            params={"on_conflict": "github_id"},
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=record,
        )
    if response.is_error:
        raise RuntimeError(f"Supabase connection storage failed (HTTP {response.status_code}).")


async def _supabase_get(github_id: int) -> dict[str, Any] | None:
    base, key = _supabase_config()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.get(
            f"{base}/rest/v1/github_connections",
            params={"select": "github_id,login,token_ciphertext,scopes", "github_id": f"eq.{github_id}", "limit": "1"},
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
    if response.is_error:
        raise RuntimeError(f"Supabase connection lookup failed (HTTP {response.status_code}).")
    rows = response.json()
    return rows[0] if rows else None


async def _supabase_delete(github_id: int) -> None:
    base, key = _supabase_config()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.delete(
            f"{base}/rest/v1/github_connections",
            params={"github_id": f"eq.{github_id}"},
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
    if response.is_error:
        raise RuntimeError(f"Supabase connection removal failed (HTTP {response.status_code}).")


def _set_cookie(response: Response, name: str, value: str, max_age: int) -> None:
    response.set_cookie(
        key=name,
        value=value,
        max_age=max_age,
        httponly=True,
        secure=os.getenv("APP_ENV", "development").lower() == "production",
        samesite="lax",
        path="/",
    )


def _github_identity(request: Request) -> dict[str, Any]:
    value = request.cookies.get(SESSION_COOKIE, "")
    payload = _verify_payload(value) if value else None
    if not payload or not isinstance(payload.get("github_id"), int):
        raise HTTPException(status_code=401, detail="Connect GitHub to continue.")
    return payload


def configure_github_routes(app) -> None:
    @app.get("/api/github/connect")
    async def github_connect(response: Response):
        try:
            client_id = _required("GITHUB_APP_CLIENT_ID")
            _required("GITHUB_APP_CLIENT_SECRET")
            _required("NEXUS_SESSION_SECRET")
            _required("NEXUS_ENCRYPTION_KEY")
            _supabase_config()
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        state = _b64(os.urandom(32))
        signed_state = _signed_payload({"state": state, "exp": int(time.time()) + 600})
        response = Response(status_code=302, headers={
            "Location": "https://github.com/login/oauth/authorize?" + urlencode({
                "client_id": client_id,
                "redirect_uri": _required("GITHUB_CALLBACK_URL"),
                "scope": "read:user repo",
                "state": state,
                "allow_signup": "false",
            })
        })
        _set_cookie(response, STATE_COOKIE, signed_state, 600)
        return response

    @app.get("/api/github/callback")
    async def github_callback(request: Request, code: str = "", state: str = "", error: str = ""):
        frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500").rstrip("/")
        if error:
            return Response(status_code=302, headers={"Location": frontend_url + "/?github=cancelled"})
        saved = _verify_payload(request.cookies.get(STATE_COOKIE, ""))
        if not code or not state or not saved or not hmac.compare_digest(str(saved.get("state", "")), state):
            raise HTTPException(status_code=400, detail="GitHub OAuth state validation failed. Restart the connection flow.")
        try:
            client_id = _required("GITHUB_APP_CLIENT_ID")
            client_secret = _required("GITHUB_APP_CLIENT_SECRET")
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                token_response = await client.post(
                    "https://github.com/login/oauth/access_token",
                    headers={"Accept": "application/json"},
                    json={"client_id": client_id, "client_secret": client_secret, "code": code,
                          "redirect_uri": _required("GITHUB_CALLBACK_URL")},
                )
                if token_response.is_error:
                    raise RuntimeError("GitHub token exchange failed.")
                token_data = token_response.json()
                access_token = token_data.get("access_token")
                if not access_token:
                    raise RuntimeError("GitHub did not return an access token.")
                gh_headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
                user_response = await client.get("https://api.github.com/user", headers=gh_headers)
                if user_response.is_error:
                    raise RuntimeError("Could not verify the GitHub account.")
                user = user_response.json()
            encrypted = _fernet().encrypt(access_token.encode()).decode("ascii")
            await _supabase_upsert({
                "github_id": int(user["id"]),
                "login": str(user["login"]),
                "token_ciphertext": encrypted,
                "scopes": token_data.get("scope", ""),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            session = _signed_payload({
                "github_id": int(user["id"]),
                "login": str(user["login"]),
                "exp": int(time.time()) + SESSION_TTL_SECONDS,
            })
        except (RuntimeError, KeyError, ValueError, InvalidToken) as exc:
            raise HTTPException(status_code=502, detail=str(exc)[:400])
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="A network error interrupted GitHub connection.")
        response = Response(status_code=302, headers={"Location": frontend_url + "/?github=connected"})
        _set_cookie(response, SESSION_COOKIE, session, SESSION_TTL_SECONDS)
        response.delete_cookie(STATE_COOKIE, path="/")
        return response

    @app.get("/api/github/connection")
    async def github_connection(request: Request):
        payload = _verify_payload(request.cookies.get(SESSION_COOKIE, ""))
        if not payload or not isinstance(payload.get("github_id"), int):
            return {"connected": False, "configured": github_is_configured()}
        return {"connected": True, "configured": github_is_configured(), "login": payload.get("login", "")}

    @app.get("/api/github/repositories")
    async def github_repositories(request: Request):
        payload = _github_identity(request)
        try:
            row = await _supabase_get(int(payload["github_id"]))
            if not row:
                raise HTTPException(status_code=401, detail="GitHub connection has expired. Reconnect GitHub.")
            token = _fernet().decrypt(row["token_ciphertext"].encode()).decode()
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                response = await client.get(
                    "https://api.github.com/user/repos",
                    params={"sort": "updated", "per_page": 100, "affiliation": "owner,collaborator,organization_member"},
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
                )
            if response.status_code == 401:
                await _supabase_delete(int(payload["github_id"]))
                raise HTTPException(status_code=401, detail="GitHub token expired or revoked. Reconnect GitHub.")
            if response.is_error:
                raise HTTPException(status_code=502, detail=f"GitHub repository request failed (HTTP {response.status_code}).")
            repos = response.json()
            return {"repositories": [
                {"id": item["id"], "name": item["name"], "full_name": item["full_name"],
                 "description": item.get("description"), "private": item.get("private", False),
                 "default_branch": item.get("default_branch"), "html_url": item.get("html_url"),
                 "permissions": item.get("permissions", {})}
                for item in repos
            ]}
        except HTTPException:
            raise
        except (RuntimeError, KeyError, ValueError, InvalidToken) as exc:
            raise HTTPException(status_code=503, detail=str(exc)[:400])
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="A network error interrupted repository loading.")

    @app.post("/api/github/disconnect")
    async def github_disconnect(request: Request):
        payload = _github_identity(request)
        try:
            await _supabase_delete(int(payload["github_id"]))
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)[:300])
        response = Response(content=json.dumps({"connected": False}), media_type="application/json")
        response.delete_cookie(SESSION_COOKIE, path="/")
        return response
