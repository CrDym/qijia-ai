import { HomeWorkspace } from "@/components/home-workspace";
import { homeToday } from "@/lib/dates";
import { getAISettingsStatus } from "@/services/ai/configuration";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <HomeWorkspace
      aiConfigured={getAISettingsStatus().configured}
      initialToday={homeToday()}
    />
  );
}
