import type { EventRow } from "./schema";

export type ClientEvent = Omit<EventRow, "loggedAt" | "createdAt" | "localDate"> & {
  loggedAt: string;
  createdAt: string;
  localDate: string;
};

export type TrackerPayload = {
  events: ClientEvent[];
  favorites: string[];
  drinkFavorites: string[];
  cigBaseline: number;
  drinkBaseline: number;
  timezone: string;
  city: string;
};
