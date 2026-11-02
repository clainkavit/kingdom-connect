"use client";

import { languages } from "@kingdom-connect/shared";
import { Fragment } from "react";
import { useLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";

export function LanguageSwitch({ onNavy }: { onNavy?: boolean }) {
  const { language, t, setLanguage } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t.language}
      className={cn("flex items-center text-sm", onNavy ? "text-navy-ink" : "text-ink-2")}
    >
      {languages.map((option, i) => (
        <Fragment key={option.code}>
          {i > 0 ? <span aria-hidden>·</span> : null}
          <button
            type="button"
            aria-pressed={option.code === language}
            onClick={() => setLanguage(option.code)}
            className={cn(
              "min-h-[44px] px-2",
              option.code === language && "font-bold",
              option.code === language && (onNavy ? "text-white" : "text-primary"),
            )}
          >
            {option.name}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
