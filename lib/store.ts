import type { TrackerState } from "./social-types";
import type { MutationResult } from "./store-types";

export { StoreError } from "./store-common";

type TrackerStore = {
  state(token?: string): TrackerState | Promise<TrackerState>;
  syncRevision(token?: string): string | null | Promise<string | null>;
  mutate(input: Record<string, unknown>, token?: string): Promise<MutationResult>;
};

/** Hosted requests always use durable storage; SQLite stays a local option. */
export async function getTrackerStore(): Promise<TrackerStore> {
  const storage = process.env.ASHTRAY_STORAGE;
  if (storage && storage !== "neon" && storage !== "sqlite") throw new Error("Unsupported tracker storage configuration.");
  if (process.env.VERCEL === "1" || storage === "neon") {
    const { getCloudStore } = await import("./cloud-store");
    return getCloudStore();
  }
  const { getLocalStore } = await import("./local-store");
  return getLocalStore();
}
