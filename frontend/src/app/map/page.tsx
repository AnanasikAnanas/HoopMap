"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  LocateFixed,
  LoaderCircle,
  MapPinned,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { BasketballLoader } from "@/components/basketball-feedback";
import { CourtsMap } from "@/components/courts-map";
import { CourtCard } from "@/components/court-card";
import { Header, MobileNav } from "@/components/header";
import { MapFilterPanel } from "@/components/map-filter-panel";
import { Button, Input } from "@/components/ui";
import { authApi, courtsApi } from "@/lib/api";
import {
  hapticImpact,
  hapticNotification,
  hapticSelection,
} from "@/lib/haptics";
import { useMapStore } from "@/store/map";
import { useToast } from "@/components/toast";
import { distanceMeters } from "@/lib/geo";

export default function MapPage() {
  const [bbox, setBbox] = useState("48.9,53.2,49.9,53.8");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lon: number;
  }>();
  const [dismissLocationSave, setDismissLocationSave] = useState(false);
  const [locationSaveError, setLocationSaveError] = useState("");
  const [locationState, setLocationState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [focusLocationRequest, setFocusLocationRequest] = useState(0);
  const [sortByDistance, setSortByDistance] = useState(true);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
  });
  const saveMapHome = useMutation({
    mutationFn: () => authApi.updateMapHome(userLocation!),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      setDismissLocationSave(true);
      hapticNotification("success");
      showToast("Стартовый район сохранён", { tone: "success" });
    },
    onError: () => {
      hapticNotification("error");
      showToast("Не удалось сохранить стартовый район", { tone: "error" });
      setLocationSaveError(
        "Не удалось сохранить район. Проверьте вход в профиль.",
      );
    },
  });
  const { selectedCourtId, selectCourt, filters, setFilters } = useMapStore();
  const activeFilterCount = [
    filters.surface,
    filters.condition,
    filters.hasLighting,
  ].filter(Boolean).length;
  const resetFilters = () => {
    hapticImpact("light");
    setFilters({ surface: "", condition: "", hasLighting: false });
  };
  const updateFilters = (next: Parameters<typeof setFilters>[0]) => {
    hapticSelection();
    setFilters(next);
  };
  const toggleFilters = () => {
    hapticImpact("light");
    setFiltersOpen((open) => !open);
  };
  const handleCourtSelect = (id: number | null) => {
    if (id == null) hapticImpact("light");
    else hapticSelection();
    selectCourt(id);
  };
  const query = useMemo(() => {
    const p = new URLSearchParams({ bbox, page_size: "100" });
    if (filters.surface) p.set("surface", filters.surface);
    if (filters.condition) p.set("condition", filters.condition);
    if (filters.hasLighting) p.set("has_lighting", "true");
    return p.toString();
  }, [bbox, filters]);
  const { data: courtPage, isLoading: courtsLoading } = useQuery({
    queryKey: ["courts", query],
    queryFn: () => courtsApi.list(query),
  });
  const courts = courtPage?.results;
  const courtsWithDistance = useMemo(
    () =>
      (courts ?? []).map((court) => ({
        ...court,
        distance_m: userLocation
          ? distanceMeters(userLocation, court.location)
          : court.distance_m,
      })),
    [courts, userLocation],
  );
  const visible = useMemo(() => {
    const matching = courtsWithDistance.filter(
      (court) =>
        court.name.toLowerCase().includes(search.toLowerCase()) ||
        court.address.toLowerCase().includes(search.toLowerCase()),
    );
    if (sortByDistance && userLocation) {
      matching.sort(
        (first, second) =>
          (first.distance_m ?? Number.POSITIVE_INFINITY) -
          (second.distance_m ?? Number.POSITIVE_INFINITY),
      );
    }
    return matching;
  }, [courtsWithDistance, search, sortByDistance, userLocation]);
  const selected = courtsWithDistance.find(
    (court) => court.id === selectedCourtId,
  );
  const onBounds = useCallback(
    (b: { minLon: number; minLat: number; maxLon: number; maxLat: number }) =>
      setBbox(`${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`),
    [],
  );
  const requestUserLocation = useCallback(
    (announce = false) => {
      if (!("geolocation" in navigator)) {
        setLocationState("error");
        if (announce) {
          hapticNotification("error");
          showToast("Геолокация не поддерживается устройством", {
            tone: "error",
          });
        }
        return;
      }
      setLocationState("loading");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
          setLocationState("ready");
          if (announce) {
            setFocusLocationRequest((request) => request + 1);
            hapticSelection();
            showToast("Показываем площадки рядом с вами", {
              tone: "info",
              duration: 2200,
            });
          }
        },
        () => {
          setLocationState("error");
          if (announce) {
            hapticNotification("error");
            showToast("Разрешите доступ к геопозиции в настройках", {
              tone: "error",
            });
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 5 * 60_000,
        },
      );
    },
    [showToast],
  );
  const focusUserLocation = () => {
    hapticImpact("light");
    if (userLocation) {
      setFocusLocationRequest((request) => request + 1);
      return;
    }
    requestUserLocation(true);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => requestUserLocation(), 0);
    return () => window.clearTimeout(timer);
  }, [requestUserLocation]);
  return (
    <div className="h-dvh overflow-hidden">
      <Header />
      <main className="grid h-[calc(100dvh-64px)] md:grid-cols-[390px_1fr]">
        <aside className="hidden overflow-y-auto border-r border-line bg-canvas p-4 md:block">
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Input
                className="pr-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Название или адрес"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Фильтры"
              aria-expanded={filtersOpen}
              aria-controls="desktop-map-filters"
              onClick={toggleFilters}
              className={`relative rounded-xl border px-4 transition active:scale-95 ${
                filtersOpen || activeFilterCount
                  ? "border-orange bg-orange text-white"
                  : "border-line bg-surface text-ink hover:border-orange hover:text-orange"
              }`}
            >
              <SlidersHorizontal />
              {activeFilterCount > 0 && (
                <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full border-2 border-canvas bg-dark px-1 text-[11px] font-extrabold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <div
            className={`map-filter-reveal ${filtersOpen ? "is-open mb-4" : ""}`}
            aria-hidden={!filtersOpen}
            inert={!filtersOpen}
          >
            <div className="min-h-0 overflow-hidden">
              <MapFilterPanel
                id="desktop-map-filters"
                className="shadow-md"
                filters={filters}
                onChange={updateFilters}
                onReset={resetFilters}
              />
            </div>
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              Найдено: {visible.length}
            </p>
            <button
              type="button"
              aria-pressed={sortByDistance}
              disabled={!userLocation}
              onClick={() => {
                hapticSelection();
                setSortByDistance((active) => !active);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition ${
                sortByDistance && userLocation
                  ? "bg-orange/10 text-orange"
                  : "bg-surface text-muted hover:text-ink"
              } disabled:cursor-not-allowed disabled:opacity-45`}
              title={
                userLocation
                  ? "Переключить сортировку по расстоянию"
                  : "Разрешите геолокацию для сортировки"
              }
            >
              <ArrowDownWideNarrow size={14} />
              Ближайшие
            </button>
          </div>
          <div className="space-y-3">
            {visible.map((court) => (
              <CourtCard
                key={court.id}
                court={court}
                compact
                onClick={() => handleCourtSelect(court.id)}
              />
            ))}
            {!courtsLoading && visible.length === 0 && (
              <div className="rounded-3xl border border-dashed border-line bg-surface px-5 py-10 text-center">
                <SearchX className="mx-auto mb-3 text-muted" />
                <p className="font-extrabold">Площадок не найдено</p>
                <p className="mt-1 text-sm leading-5 text-muted">
                  Попробуйте изменить поиск или сбросить фильтры.
                </p>
                {(search || activeFilterCount > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      resetFilters();
                    }}
                    className="mt-4 text-sm font-bold text-orange hover:underline"
                  >
                    Показать все площадки
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
        <section className="relative">
          <CourtsMap
            courts={visible}
            onBounds={onBounds}
            onSelect={handleCourtSelect}
            initialCenter={userLocation ?? user?.map_home ?? undefined}
            userLocation={userLocation}
            selectedCourtId={selectedCourtId}
            focusLocationRequest={focusLocationRequest}
          />
          {courtsLoading && !courtPage && (
            <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-canvas/20">
              <BasketballLoader label="Ищем площадки" />
            </div>
          )}
          <button
            type="button"
            aria-label="Показать моё местоположение"
            onClick={focusUserLocation}
            disabled={locationState === "loading"}
            title={
              locationState === "error"
                ? "Повторно запросить геопозицию"
                : "Вернуться к моей геопозиции"
            }
            className={`absolute right-3 top-[72px] z-10 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface shadow-lg transition hover:-translate-y-0.5 hover:text-orange active:scale-95 disabled:cursor-wait md:top-[92px] ${
              filtersOpen
                ? "pointer-events-none scale-90 opacity-0 md:pointer-events-auto md:scale-100 md:opacity-100"
                : ""
            } ${
              locationState === "ready"
                ? "text-orange"
                : locationState === "error"
                  ? "text-danger"
                  : "text-ink"
            }`}
          >
            {locationState === "loading" ? (
              <LoaderCircle className="animate-spin" size={21} />
            ) : (
              <LocateFixed size={21} />
            )}
          </button>
          {userLocation && user && !user.map_home && !dismissLocationSave && (
            <div className="absolute inset-x-3 bottom-20 z-30 rounded-2xl border border-line bg-surface p-4 shadow-xl md:bottom-4 md:left-auto md:right-4 md:w-96">
              <div className="flex items-start gap-3">
                <MapPinned className="mt-0.5 shrink-0 text-orange" size={21} />
                <div>
                  <p className="font-bold">Сохранить этот район?</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Сохраним только округлённую точку примерно до 1 км. Точная
                    геопозиция останется на этом устройстве.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1"
                  disabled={saveMapHome.isPending}
                  onClick={() => saveMapHome.mutate()}
                >
                  {saveMapHome.isPending ? "Сохраняем…" : "Сохранить"}
                </Button>
                <Button
                  className="bg-canvas text-ink ring-1 ring-line"
                  onClick={() => setDismissLocationSave(true)}
                >
                  Не сейчас
                </Button>
              </div>
              {locationSaveError && (
                <p className="mt-3 text-xs font-bold text-danger">
                  {locationSaveError}
                </p>
              )}
            </div>
          )}
          {selected && (
            <div
              key={selected.id}
              className="court-sheet-enter absolute inset-x-3 bottom-20 z-20 rounded-3xl border border-line bg-surface p-2 shadow-2xl md:bottom-4 md:left-auto md:w-96"
            >
              <div className="relative flex min-h-8 items-center justify-center md:justify-end">
                <span className="h-1 w-12 rounded-full bg-line md:hidden" />
                <button
                  type="button"
                  aria-label="Закрыть карточку площадки"
                  onClick={() => handleCourtSelect(null)}
                  className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink active:scale-90"
                >
                  <X size={18} />
                </button>
              </div>
              <CourtCard
                court={selected}
                compact
                className="border-0 shadow-none hover:translate-y-0 hover:shadow-none"
              />
            </div>
          )}
          {!courtsLoading && visible.length === 0 && !filtersOpen && (
            <div className="absolute left-3 top-[72px] z-10 inline-flex max-w-[calc(100%-76px)] items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold text-ink shadow-lg md:hidden">
              <SearchX size={15} className="shrink-0 text-orange" />
              Ничего не найдено
            </div>
          )}
          <div className="absolute left-3 top-3 z-10 flex w-[calc(100%-24px)] gap-2 md:hidden">
            <div className="relative flex-1">
              <Input
                className="pr-11 shadow-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск площадки"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Фильтры"
              aria-expanded={filtersOpen}
              aria-controls="mobile-map-filters"
              onClick={toggleFilters}
              className={`relative rounded-xl px-4 text-white shadow-lg transition active:scale-95 ${
                filtersOpen || activeFilterCount ? "bg-orange" : "bg-dark"
              }`}
            >
              <SlidersHorizontal />
              {activeFilterCount > 0 && (
                <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full border-2 border-surface bg-dark px-1 text-[11px] font-extrabold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <div
            className={`map-filter-popover absolute left-3 right-3 top-[72px] z-20 md:hidden ${
              filtersOpen ? "is-open" : ""
            }`}
            aria-hidden={!filtersOpen}
            inert={!filtersOpen}
          >
            <MapFilterPanel
              id="mobile-map-filters"
              filters={filters}
              onChange={updateFilters}
              onReset={resetFilters}
            />
          </div>
        </section>
      </main>
      <MobileNav />
    </div>
  );
}
