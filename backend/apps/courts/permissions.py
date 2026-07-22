from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Court


class CourtPermission(BasePermission):
    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj: Court) -> bool:
        if request.method in SAFE_METHODS:
            return (
                obj.status == Court.Status.PUBLISHED
                or request.user.is_moderator
                or obj.created_by_id == request.user.id
            )
        if request.user.is_moderator:
            return True
        return obj.created_by_id == request.user.id and obj.status in {
            Court.Status.DRAFT,
            Court.Status.PENDING,
        }


class IsModerator(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_moderator)
