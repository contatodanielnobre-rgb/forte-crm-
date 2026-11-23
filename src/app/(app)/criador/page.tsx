import { requirePage } from "@/lib/auth";
import { CreatorFrame } from "./creator-frame";

export const dynamic = "force-dynamic";

export default async function CriadorPage() {
  await requirePage("creator.use");
  return <CreatorFrame />;
}
