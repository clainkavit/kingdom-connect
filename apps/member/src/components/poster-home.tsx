import { formatDate, type TextKey } from "@kingdom-connect/shared";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { MyPost } from "../lib/opportunities";
import type { PostResponse, ResponsesApi, ResponseStatus } from "../lib/responses";
import { Donut } from "./donut";
import { useLoad } from "./events";
import { Button, Message } from "./form";
import { LinkButton } from "./link-button";
import { typeLabel } from "./opportunity-form";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";

type PosterApi = {
  posts: () => Promise<MyPost[]>;
  responses: Pick<ResponsesApi, "forPost" | "setStatus">;
};

type Loaded = { posts: MyPost[]; responses: Map<string, PostResponse[]> };

const postStatusKey: Record<MyPost["status"], TextKey> = {
  draft: "postStatusDraft",
  pending_review: "postStatusPending",
  published: "postStatusPublished",
  closed: "postStatusClosed",
  expired: "postStatusExpired",
  hidden: "postStatusHidden",
  removed: "postStatusRemoved",
};

const RING: ResponseStatus[] = ["new", "shortlisted", "declined", "withdrawn", "hired"];

/** The Level 3 owner's home (Business-Dashboard): responses by status, my posts, and new responses. */
export function PosterHome({ api }: { api: PosterApi }) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const loaded = useLoad(async (): Promise<Loaded> => {
    const posts = await api.posts();
    const answered = posts.filter((p) => p.status !== "draft" && p.status !== "pending_review");
    const lists = await Promise.all(answered.map((p) => api.responses.forPost(p.id)));
    return { posts, responses: new Map(answered.map((p, i) => [p.id, lists[i]!])) };
  }, attempt);
  if (loaded.state !== "ready" || loaded.value.posts.length === 0) return null;
  const { posts, responses } = loaded.value;
  const all = [...responses.values()].flat();
  const published = posts.filter((p) => p.status === "published").length;
  const most = Math.max(1, ...posts.map((p) => responses.get(p.id)?.length ?? 0));
  const colour: Record<ResponseStatus, string> = {
    new: palette.crimson,
    shortlisted: palette.goldDeep,
    declined: palette.teal,
    withdrawn: palette.violet,
    hired: palette.good,
  };
  const fresh = posts
    .flatMap((p) =>
      (responses.get(p.id) ?? [])
        .filter((r) => r.status === "new")
        .map((r) => ({ post: p, response: r })),
    )
    .sort((a, b) => b.response.sentAt.getTime() - a.response.sentAt.getTime())
    .slice(0, 3);

  const card = (
    title: string,
    action: { label: string; href: string } | null,
    body: React.ReactNode,
  ) => (
    <View className="gap-3 rounded-card border border-line bg-surface px-5 py-5">
      <View className="flex-row items-center justify-between gap-2">
        <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
          {title}
        </Text>
        {action ? (
          <LinkButton
            href={action.href}
            label={action.label}
            className="flex-row items-center gap-1"
          >
            <Text className="font-figtree-semibold text-[13px] text-navy">{action.label}</Text>
            <ChevronRight size={14} color={palette.navy} aria-hidden />
          </LinkButton>
        ) : null}
      </View>
      {body}
    </View>
  );

  const ring = card(
    t.homeResponsesTitle,
    { label: t.homeSeeAll, href: "/opportunities/mine" },
    <>
      <Donut
        unit={t.homeResponsesUnit}
        parts={RING.filter((s) => s !== "hired" || all.some((r) => r.status === "hired")).map(
          (status) => ({
            label: t.homeResponseStatus(status),
            value: all.filter((r) => r.status === status).length,
            color: colour[status],
          }),
        )}
      />
      <Text className="font-figtree text-[13px] text-ink-2">{t.homeAcrossPosts(published)}</Text>
    </>,
  );

  const closing = (p: MyPost) =>
    p.status === "draft"
      ? t.homePostNotPosted
      : p.status === "pending_review"
        ? t.homePostWaitingStaff
        : p.closingAt
          ? t.homePostCloses(formatDate(new Date(p.closingAt), language))
          : "";

  const myPosts = card(
    t.myPostsTitle,
    { label: t.homeSeeAllPosts, href: "/opportunities/mine" },
    <View>
      {posts.slice(0, 4).map((p) => {
        const count = responses.get(p.id)?.length ?? 0;
        return (
          <LinkButton
            key={p.id}
            href={`/opportunities/${p.id}/responses`}
            label={p.title}
            className="flex-row flex-wrap items-center gap-3 border-t border-line py-3"
          >
            <View className="min-w-[200px] flex-1 gap-1">
              <View className="flex-row gap-1.5">
                <Text className="rounded-full bg-warn-soft px-2 py-0.5 font-figtree-bold text-[11px] text-warn-text">
                  {t[typeLabel[p.type]] as string}
                </Text>
                <Text
                  className={`rounded-full px-2 py-0.5 font-figtree-bold text-[11px] ${p.status === "published" ? "bg-good-soft text-good-text" : "bg-surface-2 text-ink-2"}`}
                >
                  {t[postStatusKey[p.status]] as string}
                </Text>
              </View>
              <Text numberOfLines={1} className="font-figtree-bold text-[14px] text-ink">
                {p.title}
              </Text>
              <Text className="font-figtree text-[12px] text-ink-2">{closing(p)}</Text>
            </View>
            <View className={`flex-row items-center gap-3 ${phone ? "w-full" : "w-[300px]"}`}>
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <View
                  className="h-full rounded-full bg-crimson"
                  style={{ width: `${(count / most) * 100}%` }}
                />
              </View>
              <Text className="font-figtree text-[12px] text-ink-2">
                <Text className="font-figtree-bold text-[14px] text-ink">{count}</Text>{" "}
                {t.homeResponsesUnit}
              </Text>
              <ChevronRight size={14} color={palette.ink2} aria-hidden />
            </View>
          </LinkButton>
        );
      })}
      <View className="flex-row items-center gap-2 border-t border-line pt-3">
        <ShieldCheck size={14} color={palette.ink2} aria-hidden />
        <Text className="flex-1 font-figtree text-[12px] text-ink-2">{t.homePostsChecked}</Text>
      </View>
    </View>,
  );

  const decide = async (id: string, status: "shortlisted" | "declined") => {
    setFailed(false);
    if (await api.responses.setStatus(id, status).catch(() => false)) setAttempt((a) => a + 1);
    else setFailed(true);
  };

  const newResponses = card(
    t.homeNewResponses,
    { label: t.homeSeeAll, href: "/opportunities/mine" },
    <View className="gap-1">
      <Text className="font-figtree text-[13px] text-ink-2">{t.homeNewResponsesNote}</Text>
      <Message text={failed ? t.actionFailed : null} />
      {fresh.length === 0 ? (
        <Text className="py-2 font-figtree text-[14px] text-ink-2">{t.homeNoNewResponses}</Text>
      ) : (
        fresh.map(({ post, response }) => (
          <View
            key={response.id}
            className="flex-row flex-wrap items-center gap-3 border-t border-line py-3"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-warn-soft">
              <Text className="font-figtree-bold text-[13px] text-navy">
                {response.memberName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]!.toUpperCase())
                  .join("")}
              </Text>
            </View>
            <View className="min-w-[160px] flex-1">
              <Text className="font-figtree-bold text-[14px] text-ink">{response.memberName}</Text>
              <Text numberOfLines={1} className="font-figtree text-[12px] text-ink-2">
                {response.kind === "application"
                  ? t.homeAppliedTo(post.title)
                  : t.homeInterestedIn(post.title)}
              </Text>
              <Text className="font-figtree text-[12px] text-ink-2">
                {[
                  response.attachmentPath
                    ? t.homeCvAttached
                    : response.note
                      ? t.homeNoteAttached
                      : null,
                  formatDate(response.sentAt, language),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Button label={t.respShortlist} onPress={() => decide(response.id, "shortlisted")} />
              <Button secondary label={t.decline} onPress={() => decide(response.id, "declined")} />
            </View>
          </View>
        ))
      )}
    </View>,
  );

  return (
    <View className="gap-4">
      <View className={phone ? "gap-4" : "flex-row items-start gap-4"}>
        <View className={phone ? "" : "w-[400px]"}>{ring}</View>
        <View className={phone ? "" : "min-w-0 flex-1"}>{newResponses}</View>
      </View>
      {myPosts}
    </View>
  );
}
