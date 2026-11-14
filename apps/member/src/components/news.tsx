import { formatDate } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { useLowData } from "../lib/low-data";
import type { MemberNewsApi, MemberNewsItem } from "../lib/news";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

function NewsCard({ item }: { item: MemberNewsItem }) {
  const { t, language } = useLanguage();
  const { lowData } = useLowData();
  return (
    <View role="article" className="gap-2 rounded-card border border-line bg-surface p-4">
      {item.imageUrl && !lowData ? (
        <Image
          source={{ uri: item.imageUrl }}
          accessibilityIgnoresInvertColors
          className="h-44 w-full rounded-lg"
          resizeMode="cover"
        />
      ) : null}
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
        {item.title}
      </Text>
      <Text className="font-figtree text-[13px] text-ink-2">
        {item.pinned ? `${t.newsPinnedBadge} · ` : ""}
        {t.newsPublishedOn(formatDate(new Date(item.publishedAt), language))}
      </Text>
      <Text className="font-figtree text-[15px] leading-6 text-ink">{item.body}</Text>
    </View>
  );
}

/** S39: news and updates from the platform, pinned items first (T04). */
export function News({ api }: { api: MemberNewsApi }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<MemberNewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

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

  return (
    <View>
      <ScreenTitle>{t.newsTitle}</ScreenTitle>
      {failed ? (
        <ErrorState
          message={t.newsLoadFailed}
          onRetry={() => {
            setFailed(false);
            setItems(null);
            setAttempt((a) => a + 1);
          }}
        />
      ) : !items ? (
        <LoadingRows />
      ) : items.length === 0 ? (
        <EmptyState title={t.newsEmptyTitle} message={t.newsEmptyMemberMessage} />
      ) : (
        <View className="gap-3">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}
