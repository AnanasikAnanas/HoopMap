import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bootstrap = readFileSync("../supabase/bootstrap.sql", "utf8");
const apiRoute = readFileSync("src/app/api/v1/[[...path]]/route.ts", "utf8");
const chat = readFileSync("src/components/game-chat.tsx", "utf8");
const realtime = readFileSync("src/lib/game-chat-realtime.ts", "utf8");

describe("game chat security", () => {
  it("limits database reads to authenticated game members", () => {
    expect(bootstrap).toContain(
      "alter table public.game_messages enable row level security",
    );
    expect(bootstrap).toContain('create policy "game members read chat"');
    expect(bootstrap).toMatch(
      /revoke all on table public\.game_messages from anon, authenticated;/,
    );
    expect(bootstrap).toMatch(
      /grant select on table public\.game_messages to authenticated;/,
    );
    expect(bootstrap).not.toMatch(
      /grant (?:insert|update|delete|all)[^;]*public\.game_messages[^;]*authenticated/i,
    );
  });

  it("uses the signed user token for filtered realtime updates", () => {
    expect(realtime).toContain("client.realtime.setAuth(accessToken)");
    expect(realtime).toContain('table: "game_messages"');
    expect(realtime).toContain("filter: `game_id=eq.${gameId}`");
    expect(bootstrap).toContain(
      "alter publication supabase_realtime add table public.game_messages",
    );
  });

  it("validates, rate limits, and authorizes chat mutations on the server", () => {
    expect(apiRoute).toMatch(
      /async function gameChatAccess[\s\S]*identity\(request, true\)/,
    );
    expect(apiRoute).toMatch(
      /async function sendGameMessage[\s\S]*"game-chat-send"[\s\S]*\.max\(1000\)/,
    );
    expect(apiRoute).toMatch(
      /async function deleteGameMessage[\s\S]*Number\(message\.author_id\)[\s\S]*access\.canModerate/,
    );
    expect(apiRoute).toMatch(
      /async function pinGameMessage[\s\S]*if \(!access\.canModerate\)/,
    );
  });

  it("renders message bodies as React text instead of raw HTML", () => {
    expect(chat).toContain(
      '{item.is_deleted ? "Сообщение удалено" : item.body}',
    );
    expect(chat).not.toContain("dangerouslySetInnerHTML");
  });
});
