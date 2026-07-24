import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapFilters } from "@/store/map";

const selectClassName =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/15";

export function MapFilterPanel({
  id,
  filters,
  onChange,
  onReset,
  className,
}: {
  id: string;
  filters: MapFilters;
  onChange: (filters: Partial<MapFilters>) => void;
  onReset: () => void;
  className?: string;
}) {
  const hasActiveFilters = Boolean(
    filters.surface || filters.condition || filters.hasLighting,
  );

  return (
    <div
      id={id}
      className={cn(
        "rounded-2xl border border-line bg-surface p-4 text-ink shadow-xl",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-extrabold">Фильтры площадок</p>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilters}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-muted transition hover:bg-canvas hover:text-orange disabled:cursor-default disabled:opacity-40"
        >
          <RotateCcw size={14} />
          Сбросить
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
        <label className="grid gap-1.5 text-xs font-bold text-muted">
          Покрытие
          <select
            aria-label="Покрытие"
            className={selectClassName}
            value={filters.surface}
            onChange={(event) => onChange({ surface: event.target.value })}
          >
            <option value="">Любое</option>
            <option value="asphalt">Асфальт</option>
            <option value="rubber">Резина</option>
            <option value="concrete">Бетон</option>
            <option value="parquet">Паркет</option>
            <option value="other">Другое</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-bold text-muted">
          Состояние
          <select
            aria-label="Состояние"
            className={selectClassName}
            value={filters.condition}
            onChange={(event) => onChange({ condition: event.target.value })}
          >
            <option value="">Любое</option>
            <option value="excellent">Отличное</option>
            <option value="good">Хорошее</option>
            <option value="fair">Удовлетворительное</option>
            <option value="poor">Плохое</option>
            <option value="unknown">Неизвестно</option>
          </select>
        </label>
      </div>

      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-canvas px-3 text-sm font-bold">
        <input
          type="checkbox"
          className="h-4 w-4 accent-orange"
          checked={filters.hasLighting}
          onChange={(event) =>
            onChange({ hasLighting: event.target.checked })
          }
        />
        Только с освещением
      </label>

      <p className="mt-3 text-xs leading-5 text-muted">
        Результаты на карте обновляются сразу.
      </p>
    </div>
  );
}
