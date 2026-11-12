"use client";

import { formatDate, type Strings, type TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import type { FeatureResult, FeaturedApi, FeaturedRow } from "@/lib/featured";
import { useLanguage } from "@/lib/language";
import { Notice } from "./cards";
import { Field } from "./field";
import { typeText } from "./opportunity-moderation";
import { ErrorState, LoadingRows } from "./states";
import { buttonVariants } from "./ui/button";

type Loaded = { used: number; limit: number; featured: FeaturedRow[] };

function featureMessage(t: Strings, result: Exclude<FeatureResult, "ok">): string {
  return {
    not_staff: t.featureNotStaff,
    not_found: t.featureGone,
    not_published: t.featureGone,
    already_featured: t.featureAlready,
    slots_full: t.featureFull,
    not_featured: t.featureGone,
    failed: t.saveFailed,
  }[result];
}

function PostLine({ post, children }: { post: FeaturedRow; children: React.ReactNode }) {
  const { t, language } = useLanguage();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold text-foreground">{post.title}</span>
        <span className="text-[13px] text-ink-2">
          {[
            t[typeText[post.type as keyof typeof typeText] ?? ("typeJob" as TextKey)] as string,
            post.posterName,
            t.oppCloses(formatDate(new Date(`${post.closingAt}T12:00:00+03:00`), language)),
          ].join(" · ")}
        </span>
      </span>
      {children}
    </li>
  );
}

/** A12 (O05): up to the slot limit of featured opportunities; remove one, or find an open post to feature. */
export function FeaturedManager({ api }: { api: FeaturedApi }) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FeaturedRow[] | null>(null);
  const [outcome, setOutcome] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.slots(), api.featured()]).then(
      ([slots, featured]) => live && setLoaded({ ...slots, featured }),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  const reload = () => {
    setFailed(false);
    setAttempt((a) => a + 1);
  };

  const search = async () => {
    const rows = await api.featurable(query).catch(() => null);
    if (rows) setFound(rows);
    else setOutcome({ tone: "bad", text: t.saveFailed });
  };

  const change = async (post: FeaturedRow, featured: boolean) => {
    const result = await api.setFeatured(post.id, featured).catch(() => "failed" as const);
    if (result !== "ok") return setOutcome({ tone: "bad", text: featureMessage(t, result) });
    setOutcome({ tone: "good", text: featured ? t.featureAdded : t.featureRemoved });
    if (featured) setFound((rows) => rows?.filter((r) => r.id !== post.id) ?? null);
    reload();
  };

  const full = loaded !== null && loaded.used >= loaded.limit;

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{t.featureTitle}</h2>
        {loaded ? (
          <span className="text-sm font-semibold text-ink-2">
            {t.featureSlots(loaded.used, loaded.limit)}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-ink-2">{t.featureHint}</p>
      {failed ? (
        <ErrorState message={t.saveFailed} onRetry={reload} />
      ) : !loaded ? (
        <LoadingRows rows={2} />
      ) : loaded.featured.length === 0 ? (
        <p className="text-sm text-ink-2">{t.featureNone}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {loaded.featured.map((post) => (
            <PostLine key={post.id} post={post}>
              <button
                type="button"
                aria-label={t.featureRemoveLabel(post.title)}
                onClick={() => change(post, false)}
                className={buttonVariants({ variant: "outline" })}
              >
                {t.featureRemove}
              </button>
            </PostLine>
          ))}
        </ul>
      )}
      <Notice tone={outcome?.tone ?? "good"} text={outcome?.text ?? null} />
      {full ? <Notice tone="warn" text={t.featureFull} /> : null}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="min-w-[240px] flex-1">
          <Field id="featured-query" label={t.featureSearch} value={query} onChange={setQuery} />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          {t.featureFind}
        </button>
      </form>
      {found === null ? null : found.length === 0 ? (
        <p className="text-sm text-ink-2">{t.featureNoneFound}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {found.map((post) => (
            <PostLine key={post.id} post={post}>
              <button
                type="button"
                aria-label={t.featureAddLabel(post.title)}
                disabled={full}
                onClick={() => change(post, true)}
                className={buttonVariants({ variant: "default" })}
              >
                {t.featureAdd}
              </button>
            </PostLine>
          ))}
        </ul>
      )}
    </section>
  );
}
