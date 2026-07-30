import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bootstrap = readFileSync("../supabase/bootstrap.sql", "utf8");
const apiRoute = readFileSync("src/app/api/v1/[[...path]]/route.ts", "utf8");

describe("social feature security", () => {
  it("keeps social tables behind RLS and the server role", () => {
    for (const table of [
      "friendships",
      "teams",
      "team_members",
      "game_invitations",
    ]) {
      expect(bootstrap).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(bootstrap).toMatch(
      /revoke all on table\s+public\.friendships, public\.teams, public\.team_members, public\.game_invitations\s+from anon, authenticated;/,
    );
    expect(bootstrap).toMatch(
      /grant all on table\s+public\.friendships, public\.teams, public\.team_members, public\.game_invitations\s+to service_role;/,
    );
  });

  it("prevents duplicate reverse friendships and self invitations", () => {
    expect(bootstrap).toContain("friendships_unique_pair_idx");
    expect(bootstrap).toContain("least(requester_id, addressee_id)");
    expect(bootstrap).toContain("check (requester_id <> addressee_id)");
    expect(bootstrap).toContain("check (inviter_id <> invitee_id)");
  });

  it("requires identity and rate limits social mutations", () => {
    expect(apiRoute).toMatch(
      /async function requestFriendship[\s\S]*identity\(request, true\)/,
    );
    expect(apiRoute).toMatch(
      /async function inviteToTeam[\s\S]*rateLimit\(request, "team-invite"/,
    );
    expect(apiRoute).toMatch(
      /async function inviteToGame[\s\S]*rateLimit\(request, "game-invite"/,
    );
  });
});
