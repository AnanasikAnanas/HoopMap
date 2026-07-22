from rest_framework.routers import DefaultRouter

from .views import CourtViewSet

router = DefaultRouter()
router.register("courts", CourtViewSet, basename="court")
urlpatterns = router.urls
