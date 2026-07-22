from django.db import connection
from django.http import JsonResponse
from django.urls import path


def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    response = JsonResponse({"status": "ok"})
    response["Cache-Control"] = "no-store"
    return response


urlpatterns = [path("", health, name="health")]
