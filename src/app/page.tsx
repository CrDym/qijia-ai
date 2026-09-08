import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { getAISettingsStatus } from "@/services/ai/configuration";

export const dynamic = "force-dynamic";

export default function Home() {
  return <KnowledgeWorkspace aiConfigured={getAISettingsStatus().configured} />;
}
