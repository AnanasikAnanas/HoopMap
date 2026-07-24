import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapFilterPanel } from "@/components/map-filter-panel";

describe("MapFilterPanel", () => {
  it("reports every changed filter", () => {
    const onChange = vi.fn();

    render(
      <MapFilterPanel
        id="filters"
        filters={{ surface: "", condition: "", hasLighting: false }}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Покрытие"), {
      target: { value: "rubber" },
    });
    fireEvent.change(screen.getByLabelText("Состояние"), {
      target: { value: "good" },
    });
    fireEvent.click(screen.getByLabelText("Только с освещением"));

    expect(onChange).toHaveBeenNthCalledWith(1, { surface: "rubber" });
    expect(onChange).toHaveBeenNthCalledWith(2, { condition: "good" });
    expect(onChange).toHaveBeenNthCalledWith(3, { hasLighting: true });
  });

  it("allows active filters to be reset", () => {
    const onReset = vi.fn();

    render(
      <MapFilterPanel
        id="filters"
        filters={{
          surface: "asphalt",
          condition: "poor",
          hasLighting: true,
        }}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
