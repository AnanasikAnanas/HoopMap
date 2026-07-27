import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapQuickFilters } from "@/components/map-quick-filters";

describe("MapQuickFilters", () => {
  it("toggles court filters from compact chips", () => {
    const onChange = vi.fn();

    render(
      <MapQuickFilters
        filters={{ surface: "", condition: "", hasLighting: false }}
        showGames
        nearby={false}
        onChange={onChange}
        onToggleGames={vi.fn()}
        onToggleNearby={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Со светом" }));
    fireEvent.click(screen.getByRole("button", { name: "Хорошие" }));
    fireEvent.click(screen.getByRole("button", { name: "Резина" }));

    expect(onChange).toHaveBeenNthCalledWith(1, { hasLighting: true });
    expect(onChange).toHaveBeenNthCalledWith(2, { condition: "good" });
    expect(onChange).toHaveBeenNthCalledWith(3, { surface: "rubber" });
  });

  it("keeps games and nearby as independent actions", () => {
    const onToggleGames = vi.fn();
    const onToggleNearby = vi.fn();

    render(
      <MapQuickFilters
        filters={{ surface: "", condition: "", hasLighting: false }}
        showGames={false}
        nearby={false}
        onChange={vi.fn()}
        onToggleGames={onToggleGames}
        onToggleNearby={onToggleNearby}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Игры" }));
    fireEvent.click(screen.getByRole("button", { name: "Рядом" }));

    expect(onToggleGames).toHaveBeenCalledOnce();
    expect(onToggleNearby).toHaveBeenCalledOnce();
  });
});
