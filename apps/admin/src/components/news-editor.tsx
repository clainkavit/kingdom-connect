"use client";

import { formatDate } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import type { NewsApi, NewsItem } from "@/lib/news";
import { isNewsImage, isValidNews } from "@/lib/news-rules";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";
import { buttonVariants } from "./ui/button";

type Form = {
  id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  imagePath: string | null;
  image: File | null;
};

const blank: Form = { id: null, title: "", body: "", pinned: false, imagePath: null, image: null };

function NewsForm({ api, initial, onDone }: { api: NewsApi; initial: Form; onDone: () => void }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (publish: boolean) => {
    if (!isValidNews(form)) return setProblem(t.newsInvalid);
    if (form.image && !isNewsImage(form.image)) return setProblem(t.newsImageInvalid);
    setBusy(true);
    setProblem(null);
    try {
      await api.save(form.id, {
        title: form.title,
        body: form.body,
        pinned: form.pinned,
        publish,
        imagePath: form.imagePath,
        image: form.image,
      });
      onDone();
    } catch {
      setProblem(t.saveFailed);
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-card"
      onSubmit={(e) => e.preventDefault()}
    >
      <Field
        id="news-title"
        label={t.newsTitleLabel}
        value={form.title}
        onChange={(title) => setForm({ ...form, title })}
      />
      <Field
        id="news-body"
        label={t.newsBodyLabel}
        value={form.body}
        multiline
        onChange={(body) => setForm({ ...form, body })}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="news-image" className="text-sm font-semibold text-foreground">
          {t.newsImageLabel}
        </label>
        <input
          id="news-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setForm({ ...form, image: e.target.files?.[0] ?? null })}
          className="text-sm text-foreground"
        />
        {form.imagePath && !form.image ? (
          <button
            type="button"
            onClick={() => setForm({ ...form, imagePath: null })}
            className="self-start text-sm font-semibold text-primary underline"
          >
            {t.newsImageRemove}
          </button>
        ) : null}
      </div>
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.pinned}
          onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
          className="size-4"
        />
        {t.newsPinLabel}
      </label>
      {problem ? (
        <p role="alert" className="text-sm text-bad-text">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(true)}
          className={buttonVariants({ size: "lg" })}
        >
          {t.newsPublish}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => save(false)}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          {t.newsSaveDraft}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDone}
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function NewsRow({
  item,
  onEdit,
  onDelete,
}: {
  item: NewsItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, language } = useLanguage();
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="size-16 rounded-md object-cover" />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold text-foreground">{item.title}</span>
        <span className="flex flex-wrap gap-2 text-[13px] text-ink-2">
          {item.status === "draft" ? <span>{t.newsDraftBadge}</span> : null}
          {item.publishedAt ? (
            <span>{t.newsPublishedOn(formatDate(new Date(item.publishedAt), language))}</span>
          ) : null}
          {item.pinned ? <span>{t.newsPinnedBadge}</span> : null}
        </span>
      </span>
      <span className="flex gap-2">
        <button type="button" onClick={onEdit} className={buttonVariants({ variant: "outline" })}>
          {t.edit}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={buttonVariants({ variant: "destructive" })}
        >
          {t.newsDelete}
        </button>
      </span>
    </li>
  );
}

/** A11: write news, publish or keep it as a draft, pin it to the top, and delete it (T04). */
export function NewsEditor({ api }: { api: NewsApi }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Form | null>(null);

  useEffect(() => {
    let live = true;
    api.list().then(
      (loaded) => live && setItems(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  const reload = () => {
    setFailed(false);
    setItems(null);
    setEditing(null);
    setAttempt((a) => a + 1);
  };

  const remove = async (item: NewsItem) => {
    if (!window.confirm(t.newsDeleteConfirm)) return;
    try {
      await api.remove(item);
      reload();
    } catch {
      setFailed(true);
    }
  };

  return (
    <>
      <ScreenTitle>{t.adminNavNews}</ScreenTitle>
      <div className="flex flex-col gap-4">
        {editing ? (
          <NewsForm key={editing.id ?? "new"} api={api} initial={editing} onDone={reload} />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(blank)}
            className={`${buttonVariants({ size: "lg" })} self-start`}
          >
            {t.newsNew}
          </button>
        )}
        {failed ? (
          <ErrorState message={t.newsLoadFailed} onRetry={reload} />
        ) : !items ? (
          <LoadingRows />
        ) : items.length === 0 ? (
          <EmptyState title={t.newsEmptyTitle} message={t.newsEmptyAdminMessage} />
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
            {items.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                onEdit={() =>
                  setEditing({
                    id: item.id,
                    title: item.title,
                    body: item.body,
                    pinned: item.pinned,
                    imagePath: item.imagePath,
                    image: null,
                  })
                }
                onDelete={() => remove(item)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
