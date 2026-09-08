import { HealthWorkspace } from "@/components/health-workspace";
import { getAISettingsStatus } from "@/services/ai/configuration";

export const dynamic = "force-dynamic";
export const metadata = { title: "家庭健康 · 栖家" };
export default function HealthPage() {
  return <HealthWorkspace aiConfigured={getAISettingsStatus().configured} />;
}
