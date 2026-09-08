import { HealthWorkspace } from "@/components/health-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "家庭健康 · 栖家" };
export default function HealthPage() {
  return (
    <HealthWorkspace
      aiConfigured={Boolean(process.env.OPENAI_API_KEY?.trim())}
    />
  );
}
