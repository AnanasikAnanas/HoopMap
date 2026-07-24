"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinned, SlidersHorizontal } from "lucide-react";
import { CourtsMap } from "@/components/courts-map";
import { CourtCard } from "@/components/court-card";
import { Header, MobileNav } from "@/components/header";
import { Button, Input } from "@/components/ui";
import { authApi, courtsApi } from "@/lib/api";
import { useMapStore } from "@/store/map";

export default function MapPage() {
  const [bbox, setBbox] = useState("48.9,53.2,49.9,53.8");
  const [search, setSearch] = useState("");
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lon: number;
  }>();
  const [dismissLocationSave, setDismissLocationSave] = useState(false);
  const [locationSaveError, setLocationSaveError] = useState("");
  const queryClient = useQueryClient();
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
    },
    onError: () =>
      setLocationSaveError(
        "Не удалось сохранить район. Проверьте вход в профиль.",
      ),
  });
  const { selectedCourtId, selectCourt, filters, setFilters } = useMapStore();
  const query = useMemo(() => {
    const p = new URLSearchParams({ bbox, page_size: "100" });
    if (filters.surface) p.set("surface", filters.surface);
    if (filters.condition) p.set("condition", filters.condition);
    if (filters.hasLighting) p.set("has_lighting", "true");
    return p.toString();
  }, [bbox, filters]);
  const courts =
    useQuery({
      queryKey: ["courts", query],
      queryFn: () => courtsApi.list(query),
    }).data?.results ?? [];
  const visible = courts.filter(
    (court) =>
      court.name.toLowerCase().includes(search.toLowerCase()) ||
      court.address.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = courts.find((court) => court.id === selectedCourtId);
  const onBounds = useCallback(
    (b: { minLon: number; minLat: number; maxLon: number; maxLat: number }) =>
      setBbox(`${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`),
    [],
  );
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => undefined,
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 5 * 60_000,
      },
    );
  }, []);
  return (
    <div className="h-dvh overflow-hidden">
      <Header />
      <main className="grid h-[calc(100dvh-64px)] md:grid-cols-[390px_1fr]">
        <aside className="hidden overflow-y-auto border-r border-line bg-canvas p-4 md:block">
          <div className="mb-4 flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Название или адрес"
            />
            <button
              aria-label="Фильтры"
              className="rounded-xl border border-line bg-surface px-4 text-ink"
            >
              <SlidersHorizontal />
            </button>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto">
            <select
              className="rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink"
              value={filters.surface}
              onChange={(e) => setFilters({ surface: e.target.value })}
            >
              <option value="">Покрытие</option>
              <option value="asphalt">Асфальт</option>
              <option value="rubber">Резина</option>
              <option value="concrete">Бетон</option>
            </select>
            <label className="whitespace-nowrap rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={filters.hasLighting}
                onChange={(e) => setFilters({ hasLighting: e.target.checked })}
              />{" "}
              Со светом
            </label>
          </div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            Найдено: {visible.length}
          </p>
          <div className="space-y-3">
            {visible.map((court) => (
              <CourtCard
                key={court.id}
                court={court}
                compact
                onClick={() => selectCourt(court.id)}
              />
            ))}
          </div>
        </aside>
        <section className="relative">
          <CourtsMap
            courts={visible}
            onBounds={onBounds}
            onSelect={selectCourt}
            initialCenter={userLocation ?? user?.map_home ?? undefined}
            userLocation={userLocation}
          />
          {userLocation &&
            user &&
            !user.map_home &&
            !dismissLocationSave && (
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
            <div className="absolute inset-x-3 bottom-20 z-20 md:bottom-4 md:left-auto md:w-96">
              <CourtCard court={selected} compact />
            </div>
          )}
          <div className="absolute left-3 top-3 z-10 flex w-[calc(100%-24px)] gap-2 md:hidden">
            <Input
              className="shadow-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск площадки"
            />
            <button className="rounded-xl bg-dark px-4 text-white">
              <SlidersHorizontal />
            </button>
          </div>
        </section>
      </main>
      <MobileNav />
    </div>
  );
}
