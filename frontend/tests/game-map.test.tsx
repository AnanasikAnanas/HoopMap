import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapGameCard } from "@/components/map-game-card";
import { MapGamesToggle } from "@/components/map-games-toggle";
import { groupGamesByCourt } from "@/lib/game-map";
import type { Court, Game, PublicUser } from "@/lib/types";

const creator: PublicUser = {
  id: 7,
  username: "captain",
  first_name: "Антон",
  last_name: "",
  avatar_url: "",
  role: "user",
  reputation: 10,
};

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
  average_rating: null,
  verifications_count: 0,
  last_verified_at: null,
  verified_at: null,
  distance_m: null,
  is_favorite: false,
  created_by: creator,
};

function game(id: number, startsAt: string): Game {
  return {
    id,
    court_details: court,
    creator,
    title: `Игра ${id}`,
    description: "",
    starts_at: startsAt,
    ends_at: "2030-08-10T20:00:00.000Z",
    skill_level: "beginner",
    max_players: 10,
    status: "scheduled",
    players_count: 6,
    is_joined: false,
  };
}

describe("map games", () => {
  it("groups games at one court and selects the earliest one", () => {
    const groups = groupGamesByCourt([
      game(2, "2030-08-10T18:00:00.000Z"),
      game(1, "2030-08-10T16:00:00.000Z"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].games).toHaveLength(2);
    expect(groups[0].primary.id).toBe(1);
  });

  it("shows time, court and available places in the map card", () => {
    render(<MapGameCard game={game(1, "2030-08-10T16:00:00.000Z")} />);

    expect(screen.getByText("Игра 1")).toBeInTheDocument();
    expect(screen.getByText("Парк Победы")).toBeInTheDocument();
    expect(screen.getByText("Свободно 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть игру" })).toHaveAttribute(
      "href",
      "/games/1",
    );
  });

  it("toggles the active game layer", () => {
    const onToggle = vi.fn();
    render(
      <MapGamesToggle active count={3} loading={false} onToggle={onToggle} />,
    );

    const toggle = screen.getByRole("button", { name: "Игры 3" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
