import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/utils/api";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vibe OS",
  description: "Next.js app with Claude Code integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Extensions (password managers, AI agent add-ons, etc.) inject attributes
    // onto <html> and <body> before React hydrates, which React reports as a
    // mismatch it "won't patch up". suppressHydrationWarning is one level deep,
    // so this silences the attribute noise on these two elements only — real
    // mismatches inside the app still surface.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
