import { formatDate, type TextKey } from "@kingdom-connect/shared";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { MyPost, OpportunitiesApi, PostStatus } from "../lib/opportunities";
import { ConfirmButton, Message } from "./form";
import { LinkButton } from "./link-button";
import { typeLabel } from "./opportunity-form";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const statusLabel: Record<PostStatus, TextKey> = {
  draft: "postStatusDraft",
  pending_review: "postStatusPending",
  published: "postStatusPublished",
  closed: "postStatusClosed",
  expired: "postStatusExpired",
  hidden: "postStatusHidden",
  removed: "postStatusRemoved",
};

function PostRow({
  post,
  api,
  onChanged,
}: {
  post: MyPost;
  api: OpportunitiesApi;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-4">
      <Text className="font-figtree-bold text-[16px] text-ink">{post.title}</Text>
      <Text className="font-figtree-semibold text-[13px] text-ink-2">
        {[
          t[typeLabel[post.type]] as string,
          t[statusLabel[post.status]] as string,
          post.closingAt
            ? t.postClosesOn(formatDate(new Date(`${post.closingAt}T12:00:00+03:00`), language))
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {post.reason && post.status === "draft" ? (
        <Text className="font-figtree text-sm text-ink">{t.postSentBack(post.reason)}</Text>
      ) : null}
      {post.reason && post.status === "removed" ? (
        <Text className="font-figtree text-sm text-ink">{t.postRemovedReason(post.reason)}</Text>
      ) : null}
      {post.status === "hidden" ? <Message tone="info" text={t.postHiddenNotice} /> : null}
      <Message text={problem} />
      <View className="flex-row flex-wrap gap-2">
        {post.status === "draft" ? (
          <LinkButton
            href={`/opportunities/${post.id}/edit`}
            label={t.editPost}
            className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
          >
            <Text className="font-figtree-semibold text-sm text-ink-2">{t.editPost}</Text>
          </LinkButton>
        ) : null}
        {post.status === "published" || post.status === "closed" || post.status === "expired" ? (
          <LinkButton
            href={`/opportunities/${post.id}/responses`}
            label={t.respResponses}
            className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
          >
            <Text className="font-figtree-semibold text-sm text-ink-2">{t.respResponses}</Text>
          </LinkButton>
        ) : null}
        {post.status === "published" ? (
          <ConfirmButton
            label={t.closePost}
            question={t.closePostConfirm}
            confirmLabel={t.closePost}
            onConfirm={async () => {
              const result = await api.close(post.id).catch(() => "failed" as const);
              if (result === "ok") onChanged();
              else setProblem(t.postFailed);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** S21: the poster's own opportunities with their status (O01) and a way to their responses (O03). */
export function MyPosts({ api }: { api: OpportunitiesApi }) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState<
    { state: "loading" } | { state: "failed" } | { state: "ready"; value: MyPost[] }
  >({ state: "loading" });
  const reload = useCallback(() => {
    api.mine().then(
      (value) => setLoaded({ state: "ready", value }),
      () => setLoaded({ state: "failed" }),
    );
  }, [api]);
  useEffect(reload, [reload]);

  return (
    <View className="gap-3">
      <ScreenTitle>{t.myPostsTitle}</ScreenTitle>
      <LinkButton
        href="/opportunities/new"
        label={t.postTitle}
        className="min-h-[48px] items-center justify-center rounded-[10px] bg-blue px-4"
      >
        <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.postTitle}</Text>
      </LinkButton>
      {loaded.state === "failed" ? (
        <ErrorState message={t.postsLoadFailed} onRetry={reload} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.myPostsEmpty} message={t.myPostsEmptyMessage} />
      ) : (
        loaded.value.map((post) => (
          <PostRow key={post.id} post={post} api={api} onChanged={reload} />
        ))
      )}
    </View>
  );
}
