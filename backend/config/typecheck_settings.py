import os

os.environ["HOOPMAP_NO_GIS"] = "1"
os.environ["DJANGO_DB_ENGINE"] = "django.db.backends.sqlite3"
os.environ["POSTGRES_DB"] = "/tmp/hoopmap-typecheck.sqlite3"

from .settings import *  # noqa: E402,F403

INSTALLED_APPS = [
    app  # noqa: F405
    for app in INSTALLED_APPS  # noqa: F405
    if app not in {"django.contrib.admin", "django.contrib.gis"}
]
ROOT_URLCONF = "config.typecheck_urls"
