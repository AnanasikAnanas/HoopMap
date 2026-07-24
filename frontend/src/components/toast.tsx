"use client";

import {
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastTone = "success" | "error" | "info";
type ToastOptions = {
  tone?: ToastTone;
  duration?: number;
};
type ToastRecord = {
  id: number;
  message: string;
  tone: ToastTone;
  duration: number;
  closing: boolean;
};
type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<
  ToastTone,
  { Icon: LucideIcon; iconClassName: string }
> = {
  success: { Icon: CheckCircle2, iconClassName: "text-success" },
  error: { Icon: AlertCircle, iconClassName: "text-danger" },
  info: { Icon: Info, iconClassName: "text-orange" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, closing: true } : toast,
      ),
    );
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 180);
  }, []);

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current.slice(-2),
        {
          id,
          message: message.slice(0, 240),
          tone: options.tone ?? "info",
          duration: Math.min(10_000, Math.max(1_500, options.duration ?? 3_500)),
          closing: false,
        },
      ]);
      return id;
    },
    [],
  );

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[100] flex flex-col items-end gap-2 md:bottom-6 md:left-auto md:right-6 md:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  const { Icon, iconClassName } = toneStyles[toast.tone];
  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      toast.duration,
    );
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-line bg-surface/95 p-4 text-ink shadow-2xl backdrop-blur ${
        toast.closing ? "toast-out" : "toast-in"
      }`}
    >
      <Icon className={`shrink-0 ${iconClassName}`} size={21} />
      <p className="flex-1 text-sm font-bold leading-5">{toast.message}</p>
      <button
        type="button"
        aria-label="Закрыть уведомление"
        onClick={() => onDismiss(toast.id)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
