type ImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type NotificationType = "error" | "success" | "warning";

function feedback() {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp?.HapticFeedback;
}

export function hapticImpact(style: ImpactStyle = "light"): void {
  feedback()?.impactOccurred(style);
}

export function hapticSelection(): void {
  feedback()?.selectionChanged();
}

export function hapticNotification(type: NotificationType): void {
  feedback()?.notificationOccurred(type);
}
