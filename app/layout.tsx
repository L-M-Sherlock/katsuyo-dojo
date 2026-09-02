import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: "活用道場 · 日语动词活用练习",
    description: "通过短小、清晰的练习，把日语活用规则练成直觉。",
    openGraph: {
      title: "活用道場",
      description: "把日语动词活用规则练成直觉。",
      images: [{ url: socialImage, width: 1680, height: 941, alt: "活用道場日语动词练习" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "活用道場",
      description: "把日语动词活用规则练成直觉。",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
