import type { TrackerState } from "./social-types";

export type StoreInput = Record<string, unknown>;
export type MutationResult = { state: TrackerState; sessionToken?: string; clearSession?: boolean };
export interface AsyncTrackerStore {
  state(token?: string): Promise<TrackerState>;
  syncRevision(token?: string): Promise<string | null>;
  mutate(input: StoreInput, token?: string): Promise<MutationResult>;
}
