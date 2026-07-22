import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from django.test import override_settings
from rest_framework.exceptions import AuthenticationFailed

from apps.accounts.services import validate_telegram_init_data


def signed_init_data(token: str, user_id: int = 123) -> str:
    values = {
        "auth_date": str(int(time.time())),
        "query_id": "AAE",
        "user": json.dumps({"id": user_id, "first_name": "Иван"}, separators=(",", ":")),
    }
    check = "\n".join(f"{key}={values[key]}" for key in sorted(values))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    values["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(values)


@override_settings(TELEGRAM_BOT_TOKEN="123:secret")
def test_valid_telegram_signature():
    identity = validate_telegram_init_data(signed_init_data("123:secret"))
    assert identity.telegram_id == 123
    assert identity.first_name == "Иван"


@override_settings(TELEGRAM_BOT_TOKEN="123:secret")
def test_rejects_tampered_telegram_data():
    data = signed_init_data("123:secret").replace("123", "999", 1)
    with pytest.raises(AuthenticationFailed):
        validate_telegram_init_data(data)


@override_settings(TELEGRAM_BOT_TOKEN="123:secret")
def test_telegram_auth_endpoint_creates_user(client, db):
    response = client.post(
        "/api/v1/auth/telegram/",
        {"init_data": signed_init_data("123:secret", 777)},
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.json()["user"]["telegram_id"] == 777
    assert response.json()["access"]
    assert "refresh" not in response.json()
    cookie = response.cookies["hoopmap_refresh"]
    assert cookie["httponly"] is True
    assert cookie["path"] == "/api/v1/auth/"
    assert response["Cache-Control"] == "no-store"


@override_settings(TELEGRAM_BOT_TOKEN="123:secret")
def test_refresh_token_is_rotated_only_through_http_only_cookie(client, db):
    login = client.post(
        "/api/v1/auth/telegram/",
        {"init_data": signed_init_data("123:secret", 778)},
        content_type="application/json",
    )
    original_cookie = login.cookies["hoopmap_refresh"].value

    response = client.post("/api/v1/auth/refresh/", {}, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["access"]
    assert "refresh" not in response.json()
    assert response.cookies["hoopmap_refresh"].value != original_cookie


@override_settings(TELEGRAM_BOT_TOKEN="123:secret")
def test_logout_revokes_and_clears_refresh_cookie(client, db):
    client.post(
        "/api/v1/auth/telegram/",
        {"init_data": signed_init_data("123:secret", 779)},
        content_type="application/json",
    )

    assert client.post("/api/v1/auth/logout/").status_code == 204
    assert (
        client.post("/api/v1/auth/refresh/", {}, content_type="application/json").status_code == 401
    )


@override_settings(CORS_ALLOWED_ORIGINS=["https://app.example.com"])
def test_refresh_rejects_untrusted_browser_origin(client):
    response = client.post(
        "/api/v1/auth/refresh/",
        {},
        content_type="application/json",
        HTTP_ORIGIN="https://attacker.example",
    )

    assert response.status_code == 403


@override_settings(TELEGRAM_BOT_TOKEN="123:secret")
def test_rejects_duplicate_telegram_fields():
    data = signed_init_data("123:secret") + "&auth_date=1"
    with pytest.raises(AuthenticationFailed, match="duplicate"):
        validate_telegram_init_data(data)
