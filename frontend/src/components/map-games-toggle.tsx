import { LoaderCircle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export function MapGamesToggle({
  active,
  count,
  loading,
  onToggle,
  compact = false,
  className,
}: {
  active: boolean;
  count: number;
  loading?: boolean;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-extrabold shadow-lg transition hover:-translate-y-0.5 active:scale-[0.98]",
        active
          ? "border-orange bg-orange text-white"
          : "border-line bg-surface text-ink",
        compact && "min-h-10 px-3 text-xs",
        className,
      )}
    >
      {loading ? (
        <LoaderCircle size={16} className="animate-spin" />
      ) : (
        <Radio size={16} />
      )}
      Игры
      {active && !loading && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/20 px-1 text-[11px]">
          {count}
        </span>
      )}
    </button>
  );
}
