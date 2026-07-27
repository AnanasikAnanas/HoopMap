"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, GeoJSONSource, Marker } from "maplibre-gl";
import { groupGamesByCourt } from "@/lib/game-map";
import type { Court, Game } from "@/lib/types";

type Bounds = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

const EMPTY_GAMES: Game[] = [];

function colorFor(court: Court): string {
  if (["closed", "temporarily_closed"].includes(court.status)) return "#8A8A86";
  if (court.condition === "poor") return "#D94A4A";
  if (court.condition === "unknown") return "#F2B544";
  if (
    court.verified_at &&
    Date.now() - new Date(court.verified_at).getTime() < 30 * 86400000
  )
    return "#198754";
  return "#F26A2E";
}

function courtGeoJson(courts: Court[], selectedCourtId?: number | null) {
  return {
    type: "FeatureCollection" as const,
    features: courts.map((court) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [court.location.lon, court.location.lat],
      },
      properties: {
        id: court.id,
        name: court.name,
        color: colorFor(court),
        selected: court.id === selectedCourtId,
      },
    })),
  };
}

function createUserLocationMarker() {
  const marker = document.createElement("div");
  marker.className = "user-location-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.innerHTML = '<span class="user-location-marker__dot"></span>';
  return marker;
}

export function CourtsMap({
  courts,
  games = EMPTY_GAMES,
  onBounds,
  onSelect,
  onGameSelect,
  pickLocation,
  picked,
  initialCenter,
  userLocation,
  selectedCourtId,
  selectedGameId,
  focusLocationRequest,
}: {
  courts: Court[];
  games?: Game[];
  onBounds?: (bounds: Bounds) => void;
  onSelect?: (id: number) => void;
  onGameSelect?: (id: number) => void;
  pickLocation?: (location: { lat: number; lon: number }) => void;
  picked?: { lat: number; lon: number };
  initialCenter?: { lat: number; lon: number };
  userLocation?: { lat: number; lon: number };
  selectedCourtId?: number | null;
  selectedGameId?: number | null;
  focusLocationRequest?: number;
}) {
  const [mapReady, setMapReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pickedMarker = useRef<Marker | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const gameMarkers = useRef<Map<number, Marker>>(new Map());
  const userMovedMap = useRef(false);
  const lastCenteredCourtId = useRef<number | null>(null);
  const lastCenteredGameId = useRef<number | null>(null);
  const latestCourts = useRef(courts);
  const latestInitialCenter = useRef(initialCenter);
  const latestUserLocation = useRef(userLocation);
  const latestSelectedCourtId = useRef(selectedCourtId);
  const latestBounds = useRef(onBounds);
  const latestSelect = useRef(onSelect);
  const latestGameSelect = useRef(onGameSelect);
  const latestPick = useRef(pickLocation);
  useEffect(() => {
    latestBounds.current = onBounds;
    latestSelect.current = onSelect;
    latestGameSelect.current = onGameSelect;
    latestPick.current = pickLocation;
    latestCourts.current = courts;
    latestInitialCenter.current = initialCenter;
    latestUserLocation.current = userLocation;
    latestSelectedCourtId.current = selectedCourtId;
  }, [
    onBounds,
    onSelect,
    onGameSelect,
    pickLocation,
    courts,
    initialCenter,
    userLocation,
    selectedCourtId,
  ]);

  useEffect(() => {
    if (!container.current || map.current) return;
    let active = true;
    const activeGameMarkers = gameMarkers.current;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!active || !container.current) return;
      const instance = new maplibregl.Map({
        container: container.current,
        style:
          process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
          "https://tiles.openfreemap.org/styles/liberty",
        center: latestInitialCenter.current
          ? [latestInitialCenter.current.lon, latestInitialCenter.current.lat]
          : [49.4, 53.5],
        zoom: latestInitialCenter.current ? 13 : 11,
      });
      map.current = instance;
      if (latestUserLocation.current) {
        userMarker.current = new maplibregl.Marker({
          element: createUserLocationMarker(),
          anchor: "center",
        })
          .setLngLat([
            latestUserLocation.current.lon,
            latestUserLocation.current.lat,
          ])
          .addTo(instance);
      }
      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      instance.on("load", () => {
        instance.addSource("courts", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 42,
        });
        instance.addLayer({
          id: "clusters",
          type: "circle",
          source: "courts",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#F26A2E",
              10,
              "#D95822",
              50,
              "#20252B",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              18,
              10,
              23,
              50,
              28,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.94,
          },
        });
        instance.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "courts",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
          paint: { "text-color": "#fff" },
        });
        instance.addLayer({
          id: "court-selected-halo",
          type: "circle",
          source: "courts",
          filter: [
            "all",
            ["!", ["has", "point_count"]],
            ["==", ["get", "selected"], true],
          ],
          paint: {
            "circle-color": "#F26A2E",
            "circle-radius": 18,
            "circle-opacity": 0.2,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#F26A2E",
            "circle-stroke-opacity": 0.45,
          },
        });
        instance.addLayer({
          id: "court-points",
          type: "circle",
          source: "courts",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["case", ["==", ["get", "selected"], true], 12, 9],
            "circle-radius-transition": { duration: 180 },
            "circle-stroke-width": [
              "case",
              ["==", ["get", "selected"], true],
              4,
              3,
            ],
            "circle-stroke-color": "#fff",
            "circle-stroke-opacity": 0.96,
            "circle-translate": [0, -1],
          },
        });
        (instance.getSource("courts") as GeoJSONSource).setData(
          courtGeoJson(latestCourts.current, latestSelectedCourtId.current),
        );
        instance.on("click", "court-points", (event) => {
          const id = event.features?.[0]?.properties?.id as number | undefined;
          if (id) latestSelect.current?.(id);
        });
        instance.on("click", "clusters", (event) => {
          const feature = event.features?.[0];
          const clusterId = feature?.properties?.cluster_id as
            number | undefined;
          const source = instance.getSource("courts") as GeoJSONSource;
          if (clusterId != null)
            source.getClusterExpansionZoom(clusterId).then((zoom) => {
              if (feature?.geometry.type === "Point")
                instance.easeTo({
                  center: feature.geometry.coordinates as [number, number],
                  zoom,
                });
            });
        });
        for (const layer of ["court-points", "clusters"]) {
          instance.on("mouseenter", layer, () => {
            instance.getCanvas().style.cursor = "pointer";
          });
          instance.on("mouseleave", layer, () => {
            instance.getCanvas().style.cursor = "";
          });
        }
        const bounds = instance.getBounds();
        latestBounds.current?.({
          minLon: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLon: bounds.getEast(),
          maxLat: bounds.getNorth(),
        });
        setMapReady(true);
      });
      instance.on("moveend", () => {
        const bounds = instance.getBounds();
        latestBounds.current?.({
          minLon: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLon: bounds.getEast(),
          maxLat: bounds.getNorth(),
        });
      });
      instance.on("dragstart", () => {
        userMovedMap.current = true;
      });
      instance.on("click", (event) =>
        latestPick.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng }),
      );
    });
    return () => {
      active = false;
      pickedMarker.current?.remove();
      userMarker.current?.remove();
      activeGameMarkers.forEach((marker) => marker.remove());
      activeGameMarkers.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const source = map.current?.getSource("courts") as
      GeoJSONSource | undefined;
    source?.setData(courtGeoJson(courts, selectedCourtId));
    if (!selectedCourtId) {
      lastCenteredCourtId.current = null;
      return;
    }
    if (!map.current || lastCenteredCourtId.current === selectedCourtId) {
      return;
    }
    const selected = courts.find((court) => court.id === selectedCourtId);
    if (!selected) return;
    lastCenteredCourtId.current = selectedCourtId;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    map.current.easeTo({
      center: [selected.location.lon, selected.location.lat],
      duration: reduceMotion ? 0 : 420,
    });
  }, [courts, selectedCourtId]);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    let active = true;
    const markers = gameMarkers.current;

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!active || !map.current) return;
      markers.forEach((marker) => marker.remove());
      markers.clear();

      for (const group of groupGamesByCourt(games)) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `game-map-marker ${
          group.primary.id === selectedGameId ? "is-selected" : ""
        }`;
        element.setAttribute(
          "aria-label",
          `Игра «${group.primary.title}» на площадке ${group.court.name}`,
        );
        element.title =
          group.games.length > 1
            ? `${group.games.length} игры на площадке`
            : group.primary.title;
        element.innerHTML =
          '<span class="game-map-marker__ball" aria-hidden="true"></span>';
        if (group.games.length > 1) {
          const count = document.createElement("span");
          count.className = "game-map-marker__count";
          count.textContent = String(group.games.length);
          element.append(count);
        }
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          latestGameSelect.current?.(group.primary.id);
        });

        const marker = new maplibregl.Marker({
          element,
          anchor: "center",
        })
          .setLngLat([group.court.location.lon, group.court.location.lat])
          .addTo(map.current);
        markers.set(group.court.id, marker);
      }
    });

    return () => {
      active = false;
      markers.forEach((marker) => marker.remove());
      markers.clear();
    };
  }, [games, mapReady, selectedGameId]);

  useEffect(() => {
    if (!selectedGameId || !map.current) {
      lastCenteredGameId.current = null;
      return;
    }
    if (lastCenteredGameId.current === selectedGameId) return;
    const selected = games.find((game) => game.id === selectedGameId);
    if (!selected) return;
    lastCenteredGameId.current = selectedGameId;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    map.current.easeTo({
      center: [
        selected.court_details.location.lon,
        selected.court_details.location.lat,
      ],
      zoom: Math.max(map.current.getZoom(), 14),
      duration: reduceMotion ? 0 : 420,
    });
  }, [games, selectedGameId]);

  useEffect(() => {
    if (!initialCenter || !map.current || userMovedMap.current) return;
    map.current.easeTo({
      center: [initialCenter.lon, initialCenter.lat],
      zoom: Math.max(map.current.getZoom(), 13),
    });
  }, [initialCenter]);

  useEffect(() => {
    if (!userLocation || !map.current) return;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!map.current) return;
      userMarker.current?.remove();
      userMarker.current = new maplibregl.Marker({
        element: createUserLocationMarker(),
        anchor: "center",
      })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(map.current);
    });
  }, [userLocation]);

  useEffect(() => {
    if (!focusLocationRequest || !userLocation || !map.current) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    map.current.easeTo({
      center: [userLocation.lon, userLocation.lat],
      zoom: Math.max(map.current.getZoom(), 14),
      duration: reduceMotion ? 0 : 520,
    });
  }, [focusLocationRequest, userLocation]);

  useEffect(() => {
    if (!picked || !map.current) return;
    map.current.easeTo({ center: [picked.lon, picked.lat], zoom: 16 });
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!map.current) return;
      pickedMarker.current?.remove();
      pickedMarker.current = new maplibregl.Marker({ color: "#F26A2E" })
        .setLngLat([picked.lon, picked.lat])
        .addTo(map.current);
    });
  }, [picked]);
  return (
    <div
      ref={container}
      className="h-full min-h-[420px] w-full"
      aria-label="Карта баскетбольных площадок"
    />
  );
}
