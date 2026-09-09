import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { getAISettingsStatus } from "@/services/ai/configuration";
export const dynamic = "force-dynamic";
export default function Library() {
  return <KnowledgeWorkspace aiConfigured={getAISettingsStatus().configured} />;
}
