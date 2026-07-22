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
};
export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
