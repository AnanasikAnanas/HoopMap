import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourtCard } from "@/components/court-card";
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
  surface: "asphalt",
  hoops_count: 2,
  has_lighting: true,
  has_marking: true,
  has_nets: true,
  condition: "good",
  status: "published",
  photos: [],
  average_rating: 4.5,
  verifications_count: 3,
  last_verified_at: null,
  verified_at: null,
  distance_m: 420,
  is_favorite: false,
  created_by: null,
};

describe("CourtCard", () => {
  it("shows the useful court facts", () => {
    render(<CourtCard court={court} />);
    expect(screen.getByText("Парк Победы")).toBeInTheDocument();
    expect(screen.getByText("420 м")).toBeInTheDocument();
    expect(screen.getByText(/2 кольца/)).toBeInTheDocument();
    expect(screen.getByText(/свет/)).toBeInTheDocument();
  });
});
