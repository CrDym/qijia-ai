import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "栖家 · 家庭资料库",
  description: "把家里的重要信息与生活经验，安放在一个随时找得到的地方。",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
