import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function BasketballLoader({
  label = "Загружаем…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 rounded-3xl bg-surface/90 px-6 py-5 text-ink shadow-xl backdrop-blur",
        className,
      )}
      role="status"
      aria-label={label}
    >
      <div className="hoop-loader" aria-hidden="true">
        <span className="hoop-loader__board" />
        <span className="hoop-loader__rim" />
        <span className="hoop-loader__net" />
        <span className="hoop-loader__ball" />
      </div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
        {label}
      </p>
    </div>
  );
}

export function ActionSuccess({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      className="success-overlay fixed inset-0 z-[110] grid place-items-center bg-dark/70 p-5 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
    >
      <div className="success-card w-full max-w-sm rounded-[2rem] border border-white/10 bg-surface p-8 text-center text-ink shadow-2xl">
        <div className="success-ball mx-auto grid h-20 w-20 place-items-center rounded-full bg-orange text-white shadow-lg shadow-orange/30">
          <Check size={36} strokeWidth={3} />
        </div>
        <h2 className="display mt-6 text-2xl">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}
