"use client";

import {
  CircleDot,
  Lightbulb,
  LocateFixed,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { MapFilters } from "@/store/map";
import { cn } from "@/lib/utils";

type QuickFilterProps = {
  filters: MapFilters;
  showGames: boolean;
  nearby: boolean;
  nearbyDisabled?: boolean;
  resultCount?: number;
  onChange: (filters: Partial<MapFilters>) => void;
  onToggleGames: () => void;
  onToggleNearby: () => void;
  onReset: () => void;
  className?: string;
};

const chipClass =
  "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-extrabold shadow-sm transition active:scale-95";

export function MapQuickFilters({
  filters,
  showGames,
  nearby,
  nearbyDisabled = false,
  resultCount,
  onChange,
  onToggleGames,
  onToggleNearby,
  onReset,
  className,
}: QuickFilterProps) {
  const hasCourtFilters = Boolean(
    filters.surface || filters.condition || filters.hasLighting,
  );

  return (
    <div
      className={cn(
        "map-quick-filters flex items-center gap-2 overflow-x-auto pb-1",
        className,
      )}
      aria-label="Быстрые фильтры карты"
    >
      <button
        type="button"
        aria-pressed={nearby}
        disabled={nearbyDisabled}
        onClick={onToggleNearby}
        className={cn(
          chipClass,
          nearby
            ? "border-orange bg-orange text-white"
            : "border-line bg-surface text-ink hover:border-orange hover:text-orange",
          "disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        <LocateFixed size={15} />
        Рядом
      </button>
      <button
        type="button"
        aria-pressed={showGames}
        onClick={onToggleGames}
        className={cn(
          chipClass,
          showGames
            ? "border-dark bg-dark text-white"
            : "border-line bg-surface text-ink hover:border-orange hover:text-orange",
        )}
      >
        <Trophy size={15} />
        Игры
      </button>
      <button
        type="button"
        aria-pressed={filters.hasLighting}
        onClick={() => onChange({ hasLighting: !filters.hasLighting })}
        className={cn(
          chipClass,
          filters.hasLighting
            ? "border-warning bg-warning text-dark"
            : "border-line bg-surface text-ink hover:border-warning",
        )}
      >
        <Lightbulb size={15} />
        Со светом
      </button>
      <button
        type="button"
        aria-pressed={filters.condition === "good"}
        onClick={() =>
          onChange({ condition: filters.condition === "good" ? "" : "good" })
        }
        className={cn(
          chipClass,
          filters.condition === "good"
            ? "border-success bg-success text-white"
            : "border-line bg-surface text-ink hover:border-success hover:text-success",
        )}
      >
        <Sparkles size={15} />
        Хорошие
      </button>
      <button
        type="button"
        aria-pressed={filters.surface === "rubber"}
        onClick={() =>
          onChange({ surface: filters.surface === "rubber" ? "" : "rubber" })
        }
        className={cn(
          chipClass,
          filters.surface === "rubber"
            ? "border-orange bg-orange/10 text-orange"
            : "border-line bg-surface text-ink hover:border-orange hover:text-orange",
        )}
      >
        <CircleDot size={15} />
        Резина
      </button>
      {hasCourtFilters && (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            chipClass,
            "border-line bg-surface text-muted hover:text-danger",
          )}
        >
          <RotateCcw size={14} />
          Сбросить
        </button>
      )}
      {resultCount != null && (
        <span className="ml-auto shrink-0 rounded-full bg-surface/95 px-3 py-2 text-[11px] font-extrabold text-muted shadow-sm">
          {resultCount} площадок
        </span>
      )}
    </div>
  );
}
