import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActionSuccess,
  BasketballLoader,
} from "@/components/basketball-feedback";
import { ToastProvider, useToast } from "@/components/toast";
import {
  hapticImpact,
  hapticNotification,
  hapticSelection,
} from "@/lib/haptics";

function ToastTrigger() {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => showToast("Площадка сохранена", { tone: "success" })}
    >
      Показать
    </button>
  );
}

describe("user feedback", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "Telegram");
    vi.restoreAllMocks();
  });

  it("shows accessible toast notifications", () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать" }));
    expect(screen.getByRole("status")).toHaveTextContent("Площадка сохранена");
    expect(
      screen.getByRole("button", { name: "Закрыть уведомление" }),
    ).toBeInTheDocument();
  });

  it("uses Telegram haptics when the Mini App provides them", () => {
    const impactOccurred = vi.fn();
    const notificationOccurred = vi.fn();
    const selectionChanged = vi.fn();
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: {
        WebApp: {
          HapticFeedback: {
            impactOccurred,
            notificationOccurred,
            selectionChanged,
          },
        },
      },
    });

    hapticImpact("soft");
    hapticNotification("success");
    hapticSelection();

    expect(impactOccurred).toHaveBeenCalledWith("soft");
    expect(notificationOccurred).toHaveBeenCalledWith("success");
    expect(selectionChanged).toHaveBeenCalledOnce();
  });

  it("renders accessible loading and success states", () => {
    const { rerender } = render(
      <BasketballLoader label="Ищем площадки" />,
    );
    expect(
      screen.getByRole("status", { name: "Ищем площадки" }),
    ).toBeInTheDocument();

    rerender(
      <ActionSuccess
        title="Точный бросок!"
        description="Площадка отправлена"
      />,
    );
    expect(screen.getByText("Точный бросок!")).toBeInTheDocument();
    expect(screen.getByText("Площадка отправлена")).toBeInTheDocument();
  });
});
