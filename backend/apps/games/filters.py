import django_filters

from .models import GameEvent


class GameFilter(django_filters.FilterSet):
    city = django_filters.CharFilter(field_name="court__city", lookup_expr="iexact")
    date = django_filters.DateFilter(field_name="starts_at", lookup_expr="date")
    level = django_filters.CharFilter(field_name="skill_level")

    class Meta:
        model = GameEvent
        fields = ("city", "court", "date", "level", "skill_level", "status")
