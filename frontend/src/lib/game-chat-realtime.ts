import { createClient } from "@supabase/supabase-js";

export async function subscribeToGameChat(
  gameId: number,
  accessToken: string,
  onChange: () => void,
): Promise<() => Promise<void>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return async () => undefined;

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  await client.realtime.setAuth(accessToken);
  const channel = client
    .channel(`game-chat-${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_messages",
        filter: `game_id=eq.${gameId}`,
      },
      onChange,
    )
    .subscribe();

  return async () => {
    await client.removeChannel(channel);
    client.realtime.disconnect();
  };
}
