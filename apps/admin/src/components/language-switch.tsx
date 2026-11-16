"use client";

import { languages } from "@kingdom-connect/shared";
import { Fragment } from "react";
import { useLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";

export function LanguageSwitch({ onNavy, pill }: { onNavy?: boolean; pill?: boolean }) {
  const { language, t, setLanguage } = useLanguage();
  if (pill)
    return (
      <div
        role="group"
        aria-label={t.language}
        className={cn(
          "flex items-center rounded-full p-1",
          onNavy ? "bg-white/10" : "border border-line bg-card",
        )}
      >
        {languages.map((option) => {
          const on = option.code === language;
          return (
            <button
              key={option.code}
              type="button"
              aria-label={option.name}
              aria-pressed={on}
              onClick={() => setLanguage(option.code)}
              className={cn(
                "h-9 min-w-[44px] rounded-full px-3 text-[13px] font-bold",
                on
                  ? onNavy
                    ? "bg-card text-primary"
                    : "bg-primary text-primary-foreground"
                  : onNavy
                    ? "text-navy-ink"
                    : "text-ink-2",
              )}
            >
              {option.code.toUpperCase()}
            </button>
          );
        })}
      </div>
    );
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
