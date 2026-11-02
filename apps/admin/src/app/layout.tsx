import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/language";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  description: "People, Opportunities, Growth. Administration console.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <LanguageProvider>
          <Suspense>
            <AuthProvider>{children}</AuthProvider>
          </Suspense>
        </LanguageProvider>
      </body>
    </html>
  );
}
