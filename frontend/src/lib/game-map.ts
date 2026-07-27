import type { Court, Game } from "@/lib/types";

export type GameMapGroup = {
  court: Court;
  games: Game[];
  primary: Game;
};

export function groupGamesByCourt(games: Game[]): GameMapGroup[] {
  const grouped = new Map<number, Game[]>();

  for (const game of games) {
    const courtId = game.court_details.id;
    grouped.set(courtId, [...(grouped.get(courtId) ?? []), game]);
  }

  return Array.from(grouped.values()).map((courtGames) => {
    const sorted = [...courtGames].sort(
      (first, second) =>
        Date.parse(first.starts_at) - Date.parse(second.starts_at),
    );
    return {
      court: sorted[0].court_details,
      games: sorted,
      primary: sorted[0],
    };
  });
}
