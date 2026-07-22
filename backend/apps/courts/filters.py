import django_filters

from .models import Court


class CourtFilter(django_filters.FilterSet):
    hoops_count = django_filters.NumberFilter()
    hoops_count_min = django_filters.NumberFilter(field_name="hoops_count", lookup_expr="gte")

    class Meta:
        model = Court
        fields = (
            "city",
            "country",
            "surface",
            "condition",
            "access_type",
            "court_type",
            "has_lighting",
            "has_nets",
            "hoops_count",
            "status",
        )
