from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, BasePermission, IsAdminUser

docs_permissions: list[type[BasePermission]] = (
    [AllowAny] if settings.API_DOCS_PUBLIC else [IsAdminUser]
)
docs_authentication = [] if settings.API_DOCS_PUBLIC else [SessionAuthentication]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.courts.urls")),
    path("api/v1/", include("apps.games.urls")),
    path(
        "api/schema/",
        SpectacularAPIView.as_view(
            permission_classes=docs_permissions, authentication_classes=docs_authentication
        ),
        name="schema",
    ),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(
            url_name="schema",
            permission_classes=docs_permissions,
            authentication_classes=docs_authentication,
        ),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(
            url_name="schema",
            permission_classes=docs_permissions,
            authentication_classes=docs_authentication,
        ),
        name="redoc",
    ),
    path("health/", include("apps.common.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
