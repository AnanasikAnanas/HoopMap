import pytest
from django.core.exceptions import ImproperlyConfigured

from config.settings import database_config


@pytest.fixture(autouse=True)
def clean_database_environment(monkeypatch):
    for name in (
        "DATABASE_URL",
        "DB_POOL_MODE",
        "DB_CONN_MAX_AGE",
        "DB_SSL_MODE",
        "DB_SSL_REQUIRE",
        "DB_SEARCH_PATH",
    ):
        monkeypatch.delenv(name, raising=False)


def test_database_url_supports_supabase_session_pooler(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://postgres.project:pa%24%24@pooler.supabase.com:5432/postgres?sslmode=require",
    )
    monkeypatch.setenv("DB_SEARCH_PATH", "hoopmap,extensions,gis,public")

    config = database_config()

    assert config["ENGINE"] == "django.contrib.gis.db.backends.postgis"
    assert config["USER"] == "postgres.project"
    assert config["PASSWORD"] == "pa$$"
    assert config["HOST"] == "pooler.supabase.com"
    assert config["PORT"] == "5432"
    assert config["CONN_MAX_AGE"] == 60
    assert config["CONN_HEALTH_CHECKS"] is True
    assert config["OPTIONS"] == {
        "sslmode": "require",
        "options": "-c search_path=hoopmap,extensions,gis,public",
    }


def test_transaction_pooler_disables_persistent_and_prepared_connections(monkeypatch):
    monkeypatch.setenv("DB_POOL_MODE", "transaction")
    monkeypatch.setenv("DB_CONN_MAX_AGE", "120")

    config = database_config()

    assert config["CONN_MAX_AGE"] == 0
    assert config["CONN_HEALTH_CHECKS"] is False
    assert config["OPTIONS"]["prepare_threshold"] is None


def test_invalid_search_path_is_rejected(monkeypatch):
    monkeypatch.setenv("DB_SEARCH_PATH", "hoopmap,public;drop schema public")

    with pytest.raises(ImproperlyConfigured, match="DB_SEARCH_PATH"):
        database_config()
