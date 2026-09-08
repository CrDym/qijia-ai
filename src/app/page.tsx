import { KnowledgeWorkspace } from "@/components/knowledge-workspace";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <KnowledgeWorkspace
      aiConfigured={Boolean(process.env.OPENAI_API_KEY?.trim())}
    />
  );
}
