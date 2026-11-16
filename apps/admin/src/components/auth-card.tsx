"use client";

import { CircleCheck, Flag, Lock, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { LanguageSwitch } from "./language-switch";

/**
 * The staff sign-in screens, as on the canvas board Admin-Login: on a computer a column with the logo,
 * the language toggle, a serif title and the form, beside a maroon panel about the console; on a phone
 * the column alone.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t, platformName } = useLanguage();
  const points = [
    { icon: ShieldCheck, text: t.staffPointIdentity },
    { icon: CircleCheck, text: t.staffPointPosts },
    { icon: Flag, text: t.staffPointReports },
  ];
  return (
    <div className="flex min-h-dvh gap-12 bg-background p-6 max-[880px]:p-0">
      <div className="flex w-full flex-col px-4 py-4 min-[881px]:w-[412px] min-[881px]:shrink-0">
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.jpg"
              alt={platformName}
              width={44}
              height={40}
              className="rounded-[10px]"
            />
            <span className="text-xs font-extrabold tracking-[0.08em] text-primary uppercase">
              {t.adminLabel}
            </span>
          </span>
          <LanguageSwitch pill />
        </header>
        <main className="flex flex-1 flex-col justify-center gap-4 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-[40px] leading-[44px] font-semibold text-primary">
              {title}
            </h1>
            {subtitle ? <p className="text-[15px] leading-[22px] text-ink-2">{subtitle}</p> : null}
          </div>
          {children}
        </main>
        <p className="text-[13px] leading-[18px] text-ink-2">{t.staffNote}</p>
      </div>
      <aside className="hidden flex-1 flex-col justify-between rounded-[28px] bg-sidebar p-14 min-[881px]:flex">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.jpg"
            alt=""
            width={72}
            height={64}
            className="rounded-[14px] border border-white/20"
          />
          <span className="text-[13px] font-extrabold tracking-[0.08em] text-gold uppercase">
            {t.staffConsoleTag}
          </span>
        </div>
        <div className="flex max-w-[520px] flex-col gap-6">
          <p className="font-serif text-[52px] leading-[56px] font-semibold text-white">
            {t.staffPanelTitle(platformName)}
          </p>
          <ul className="flex flex-col gap-3.5">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3.5 text-[17px] text-navy-ink">
                <span className="grid size-10 place-items-center rounded-[12px] bg-white/10 text-gold">
                  <Icon size={18} aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-sm text-navy-ink">
          <Lock size={14} aria-hidden />
          {t.staffAuditNote}
        </p>
      </aside>
    </div>
  );
}
