import type { Metadata } from "next";
import { Cormorant_Garamond, Figtree } from "next/font/google";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/language";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const serif = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  description: "People, Opportunities, Growth. Administration console.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${serif.variable}`}>
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
