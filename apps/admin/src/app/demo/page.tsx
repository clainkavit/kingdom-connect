"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Notice } from "@/components/cards";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { demoLinks, supabase } from "@/lib/supabase";

/** One-time demo sign-in that waits for a click, so a link preview cannot use the link up. */
export default function DemoPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!demoLinks) return null;

  const open = async () => {
    setBusy(true);
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
    setBusy(false);
    if (error) return setFailed(true);
    router.replace("/");
  };

  return (
    <AuthCard title={t.demoTitle}>
      <p className="text-sm text-ink-2">{t.demoIntro}</p>
      <Notice tone="bad" text={failed ? t.demoFailed : null} />
      <button
        type="button"
        disabled={busy}
        onClick={open}
        className={buttonVariants({ variant: "default" })}
      >
        {t.demoOpen}
      </button>
    </AuthCard>
  );
}
