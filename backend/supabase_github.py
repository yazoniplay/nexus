"""Server-side client for the Nexus GitHub Edge Function.

The GitHub PAT remains in Supabase Edge Function secrets. This module uses the
Supabase service-role key only on the backend; never import it in frontend code.
"""
from __future__ import annotations

import os
from typing import Any

import httpx


class GitHubFunctionError(RuntimeError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def _endpoint() -> tuple[str, str]:
    base = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base or not key:
        raise RuntimeError("Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend.")
    return f"{base}/functions/v1/nexus-github", key


async def invoke_github(action: str, **payload: Any) -> dict[str, Any]:
    allowed = {
        "list_repos", "get_repository", "get_contents_tree", "read_file",
        "list_branches", "list_issues", "list_pull_requests", "list_workflows",
        "list_workflow_runs", "list_commits", "create_branch", "put_file",
        "delete_file", "create_pull_request", "create_issue", "comment_issue",
        "close_issue", "close_pull_request", "merge_pull_request",
        "dispatch_workflow", "rerun_workflow", "cancel_workflow_run",
    }
    if action not in allowed:
        raise ValueError("Unsupported GitHub action.")

    url, key = _endpoint()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
            res = await client.post(
                url,
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={"action": action, **payload},
            )
    except httpx.HTTPError as exc:
        raise GitHubFunctionError(502, "Could not reach the Nexus GitHub service.") from exc

    try:
        data = res.json()
    except ValueError:
        data = {}

    if res.is_error:
        message = data.get("error", "GitHub operation failed.") if isinstance(data, dict) else "GitHub operation failed."
        details = data.get("details") if isinstance(data, dict) else None
        if details:
            message = f"{message} {details}"
        raise GitHubFunctionError(res.status_code, str(message)[:500])
    if not isinstance(data, dict):
        raise GitHubFunctionError(502, "GitHub service returned an invalid response.")
    return data
