"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CATALOG, DEFAULT_DRINK_FAVORITES, DEFAULT_FAVORITES } from "@/lib/catalog";
import { getLocalStore, StoreError } from "@/lib/local-store";
import type { ClientEvent, TrackerPayload } from "@/lib/types";

// Compatibility for earlier tracker components. These functions now use exactly
// the same authenticated, owner-scoped local store as /api/tracker.
async function context() {
  const token = (await cookies()).get("ashtray_session")?.value;
  const store = getLocalStore();
  const state = store.state(token);
  if (!state.user) throw new StoreError("Sign in to continue.", 401);
  return { token, store, state, user: state.user };
}

export async function loadTracker(): Promise<TrackerPayload> {
  const { state, user } = await context();
  const cigFavorites = user.favoriteIds.filter((id) => CATALOG.some((product) => product.id === id && product.kind === "cig"));
  const drinkFavorites = user.favoriteIds.filter((id) => CATALOG.some((product) => product.id === id && product.kind === "drink"));
  return {
    events: state.events,
    favorites: cigFavorites.length ? cigFavorites : DEFAULT_FAVORITES,
    drinkFavorites: drinkFavorites.length ? drinkFavorites : DEFAULT_DRINK_FAVORITES,
    cigBaseline: user.cigBaseline, drinkBaseline: user.drinkBaseline,
    timezone: user.timezone, city: user.city,
  };
}

export async function logHit(input: {
  productId: string;
  timezone: string;
  source: "shelf" | "picker" | "bottle";
  city?: string;
}): Promise<ClientEvent> {
  const { token, store, state } = await context();
  const priorIds = new Set(state.events.map((event) => event.id));
  // Profile timezone and city are authoritative; callers cannot impersonate
  // another account or change profile settings through a logging request.
  const result = await store.mutate({ action: "log", productId: input.productId, source: input.source }, token);
  const saved = result.state.events.find((event) => !priorIds.has(event.id));
  if (!saved) throw new Error("Could not load the saved check-in.");
  revalidatePath("/");
  return saved;
}

export async function undoHit(id: string): Promise<void> {
  const { token, store } = await context();
  await store.mutate({ action: "delete", id }, token);
  revalidatePath("/");
}

export async function saveSettings(input: {
  cigBaseline?: number;
  drinkBaseline?: number;
  favoriteIds?: string[];
  drinkFavoriteIds?: string[];
  timezone?: string;
  city?: string;
}): Promise<void> {
  const { token, store, user } = await context();
  const cigFavorites = user.favoriteIds.filter((id) => CATALOG.some((product) => product.id === id && product.kind === "cig"));
  const drinkFavorites = user.favoriteIds.filter((id) => CATALOG.some((product) => product.id === id && product.kind === "drink"));
  const favoritesChanged = input.favoriteIds !== undefined || input.drinkFavoriteIds !== undefined;
  await store.mutate({
    action: "settings", cigBaseline: input.cigBaseline, drinkBaseline: input.drinkBaseline,
    timezone: input.timezone, city: input.city,
    ...(favoritesChanged ? { favoriteIds: [...(input.favoriteIds ?? cigFavorites), ...(input.drinkFavoriteIds ?? drinkFavorites)] } : {}),
  }, token);
  revalidatePath("/");
}
