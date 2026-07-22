from rest_framework.permissions import SAFE_METHODS, BasePermission


class GamePermission(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.method in SAFE_METHODS or bool(
            request.user and request.user.is_authenticated
        )

    def has_object_permission(self, request, view, obj) -> bool:
        return (
            request.method in SAFE_METHODS
            or request.user.is_moderator
            or obj.creator_id == request.user.id
        )
