import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapCourtSheet } from "@/components/map-court-sheet";
import type { Court } from "@/lib/types";

const court: Court = {
  id: 1,
  name: "Парк Победы",
  slug: "park",
  description: "",
  address: "Спортивная, 1",
  city: "Тольятти",
  country: "Россия",
  location: { lat: 53.5, lon: 49.4 },
  court_type: "outdoor",
  access_type: "free",
  surface: "rubber",
  hoops_count: 2,
  has_lighting: true,
  has_marking: true,
  has_nets: true,
  condition: "good",
  status: "published",
  photos: [],
  average_rating: 4.7,
  verifications_count: 3,
  last_verified_at: null,
  verified_at: null,
  distance_m: 420,
  is_favorite: false,
  created_by: null,
};

describe("MapCourtSheet", () => {
  it("shows primary court actions and facts", () => {
    render(<MapCourtSheet court={court} />);

    expect(screen.getByText("Парк Победы")).toBeInTheDocument();
    expect(screen.getByText("420 м")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Маршрут" })).toHaveAttribute(
      "href",
      expect.stringContaining("yandex.ru/maps"),
    );
    expect(screen.getByRole("link", { name: /Подробнее/ })).toHaveAttribute(
      "href",
      "/courts/park",
    );
  });
});
