import { loadTracker } from "./actions";
import Tracker from "@/components/Tracker";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadTracker();
  return <Tracker initial={data} />;
}
