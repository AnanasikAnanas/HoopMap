import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Check the Supabase PostGIS connection and optionally Storage read/write access"

    def add_arguments(self, parser):
        parser.add_argument(
            "--storage",
            action="store_true",
            help="Write, read and delete a temporary object in the configured Storage bucket",
        )

    def handle(self, *args, **options):
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select current_database(), current_schema(), extnamespace::regnamespace::text,
                           postgis_version()
                    from pg_extension
                    where extname = 'postgis'
                    """
                )
                result = cursor.fetchone()
        except Exception as exc:
            raise CommandError(f"Supabase database check failed: {exc}") from exc

        if not result:
            raise CommandError("PostGIS is not enabled in the connected database")

        database, schema, extension_schema, postgis_version = result
        self.stdout.write(
            self.style.SUCCESS(
                f"Database OK: {database}; schema={schema}; "
                f"PostGIS={postgis_version} ({extension_schema})"
            )
        )

        expected_schema = settings.DATABASES["default"].get("OPTIONS", {}).get("options", "")
        if "hoopmap" in expected_schema and schema != "hoopmap":
            raise CommandError(
                "The private hoopmap schema is not first in the active DB_SEARCH_PATH"
            )

        if not options["storage"]:
            return

        object_name = f"_health/{uuid.uuid4().hex}.txt"
        saved_name = ""
        try:
            saved_name = default_storage.save(object_name, ContentFile(b"hoopmap-storage-check"))
            if not default_storage.exists(saved_name):
                raise CommandError("Storage wrote the object but could not read it back")
            self.stdout.write(
                self.style.SUCCESS(
                    f"Storage OK: {default_storage.__class__.__name__}; "
                    f"bucket={getattr(settings, 'AWS_STORAGE_BUCKET_NAME', 'local')}"
                )
            )
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f"Supabase Storage check failed: {exc}") from exc
        finally:
            if saved_name:
                default_storage.delete(saved_name)
