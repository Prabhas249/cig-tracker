import type { ClientEvent } from "./types";

export type User = {
  id: string;
  name: string;
  username: string;
  inviteCode: string;
  timezone: string;
  city: string;
  cigBaseline: number;
  drinkBaseline: number;
  dailyLimit: number;
  defaultPrice: number;
  sharing: "summary" | "activity" | "private";
  priceOverrides: Record<string, number>;
  favoriteIds: string[];
  createdAt: string;
};

export type SocialEvent = ClientEvent & { note?: string; requestId?: string };

export type FriendActivityEntry = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  loggedAt: string;
  localDate: string;
  localTime: string;
};

export type FriendSummary = {
  id: string;
  name: string;
  username: string;
  sharing: User["sharing"];
  connectedAt: string;
  stats: {
    todayCigs: number;
    weekCigs: number;
    weekSpend: number;
    lastLoggedAt: string | null;
    dailyLimit: number;
    weeklyCounts: number[];
  } | null;
  activity: {
    today: FriendActivityEntry[];
    timezone: string;
    truncated: boolean;
  } | null;
};

export type FriendRequest = {
  id: string;
  fromId: string;
  toId: string;
  name: string;
  username: string;
  createdAt: string;
};

export type TrackerState = {
  /** Opaque version of this account's permitted snapshot, including shared summaries. */
  revision?: string;
  user: User | null;
  events: SocialEvent[];
  friends: FriendSummary[];
  requests: FriendRequest[];
  sentRequests: FriendRequest[];
};

export type SocialPayload = TrackerState;
