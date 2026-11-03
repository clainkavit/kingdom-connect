"use client";

import { useLanguage } from "@/lib/language";

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd className="break-words text-foreground">{value}</dd>
    </div>
  );
}

export function Photo({ label, url }: { label: string; url: string | null }) {
  const { t } = useLanguage();
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold text-foreground">{label}</figcaption>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label}
          className="aspect-[4/3] w-full rounded-lg border bg-surface-2 object-contain"
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border bg-surface-2 text-sm text-ink-2">
          {t.photoMissing}
        </div>
      )}
    </figure>
  );
}

export function Notice({ tone, text }: { tone: "good" | "warn" | "bad"; text: string | null }) {
  if (!text) return null;
  const colours = {
    good: "bg-good-soft text-good-text",
    warn: "bg-warn-soft text-warn-text",
    bad: "bg-bad-soft text-bad-text",
  }[tone];
  return (
    <div
      role={tone === "good" ? "status" : "alert"}
      className={`rounded-lg px-4 py-3 text-sm font-medium ${colours}`}
    >
      {text}
    </div>
  );
}
