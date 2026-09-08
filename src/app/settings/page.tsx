import { AISettingsWorkspace } from "@/components/ai-settings-workspace";
import { getAISettingsStatus } from "@/services/ai/configuration";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI 设置 · 栖家" };

export default function SettingsPage() {
  return <AISettingsWorkspace initialStatus={getAISettingsStatus()} />;
}
