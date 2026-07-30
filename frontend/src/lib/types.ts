export type Location = { lat: number; lon: number };
export type Photo = {
  id: number;
  image: string;
  thumbnail: string;
  status: string;
};
export type PublicUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
  role: "user" | "moderator" | "admin";
  reputation: number;
};
export type User = PublicUser & {
  telegram_id: number | null;
  email: string | null;
  auth_providers: string[];
  map_home: (Location & { consented_at: string }) | null;
};
export type Court = {
  id: number;
  name: string;
  slug: string;
  description: string;
  address: string;
  city: string;
  country: string;
  location: Location;
  court_type: string;
  access_type: string;
  surface: string;
  hoops_count: number;
  has_lighting: boolean;
  has_marking: boolean;
  has_nets: boolean;
  condition: string;
  status: string;
  photos: Photo[];
  average_rating: number | null;
  verifications_count: number;
  last_verified_at: string | null;
  verified_at: string | null;
  distance_m: number | null;
  is_favorite: boolean;
  created_by: PublicUser | null;
};
export type GameParticipant = PublicUser & {
  joined_at: string;
};
export type Game = {
  id: number;
  court_details: Court;
  creator: PublicUser;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  skill_level: string;
  max_players: number;
  status: string;
  players_count: number;
  is_joined: boolean;
  is_owner: boolean;
  can_join: boolean;
  participants: GameParticipant[];
};
export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type NotificationSettings = {
  game_updates: boolean;
  game_reminders: boolean;
  reminder_24h: boolean;
  reminder_2h: boolean;
  subscriptions_count: number;
  server_configured: boolean;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type FriendConnection = {
  id: number;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing";
  user: PublicUser;
  created_at: string;
  updated_at: string;
};

export type TeamMember = {
  user: PublicUser;
  role: "owner" | "admin" | "member";
  status: "invited" | "active";
  joined_at: string | null;
};

export type Team = {
  id: number;
  name: string;
  description: string;
  owner: PublicUser;
  my_role: "owner" | "admin" | "member";
  my_status: "invited" | "active";
  members_count: number;
  members: TeamMember[];
  created_at: string;
};

export type GameInvitation = {
  id: number;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  game: {
    id: number;
    title: string;
    starts_at: string;
    court_name: string;
  };
  inviter: PublicUser;
  team: { id: number; name: string } | null;
};

export type RecentPlayer = PublicUser & {
  last_played_at: string;
  games_together: number;
  friendship_status: "none" | "incoming" | "outgoing" | "accepted";
};

export type SocialOverview = {
  friends: FriendConnection[];
  incoming_requests: FriendConnection[];
  outgoing_requests: FriendConnection[];
  teams: Team[];
  game_invitations: GameInvitation[];
  recent_players: RecentPlayer[];
};

export type SocialSearchResult = PublicUser & {
  friendship_status: "none" | "incoming" | "outgoing" | "accepted";
};
