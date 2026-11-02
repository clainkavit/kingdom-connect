"use client";

import { passwordProblem, routePaths } from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { Field } from "./field";

export type SetPasswordApi = {
  verify: (tokenHash: string) => Promise<boolean>;
  setPassword: (password: string) => Promise<boolean>;
};

type Stage = "checking" | "invalid" | "form" | "done";

/** The page a staff invite link opens: set a password, then log in normally. */
export function SetPassword({ api, tokenHash }: { api: SetPasswordApi; tokenHash: string | null }) {
  const { t } = useLanguage();
  const [stage, setStage] = useState<Stage>(tokenHash ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenHash) return;
    let live = true;
    api.verify(tokenHash).then((ok) => live && setStage(ok ? "form" : "invalid"));
    return () => {
      live = false;
    };
  }, [api, tokenHash]);

  const save = async () => {
    if (passwordProblem(password)) return setProblem(t.problemPassword);
    const ok = await api.setPassword(password);
    if (ok) setStage("done");
    else setProblem(t.saveFailed);
  };

  if (stage === "checking") return null;
  if (stage === "invalid")
    return (
      <p role="alert" className="text-sm text-bad-text">
        {t.inviteLinkInvalid}
      </p>
    );
  if (stage === "done")
    return (
      <>
        <p role="status" className="text-sm text-foreground">
          {t.passwordSet}
        </p>
        <Link href={routePaths.login} className={buttonVariants({ variant: "default" })}>
          {t.goToLogin}
        </Link>
      </>
    );
  return (
    <>
      <p className="text-sm leading-[1.45] text-ink-2">{t.setPasswordIntro}</p>
      <Field
        id="new-password"
        label={t.newPassword}
        value={password}
        onChange={setPassword}
        type="password"
      />
      {problem ? (
        <p role="alert" className="text-sm text-bad-text">
          {problem}
        </p>
      ) : null}
      <button type="button" onClick={save} className={buttonVariants({ variant: "default" })}>
        {t.setPassword}
      </button>
    </>
  );
}
