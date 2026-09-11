import type { Metadata } from "next";
import "./globals.css";
import "./home.css";
import "./confirmation.css";
import { ConfirmationProvider } from "@/components/confirmation-provider";

export const metadata: Metadata = {
  title: "栖家 · 家庭 AI 平台",
  description: "发来文字、图片或文件，让 AI 帮你整理家庭资料、待办与生活清单。",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <ConfirmationProvider>{children}</ConfirmationProvider>
      </body>
    </html>
  );
}
