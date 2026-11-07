import { notificationCopy } from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { LinkButton } from "../../../src/components/link-button";
import { NotificationList } from "../../../src/components/notifications";
import { ScreenTitle } from "../../../src/components/screens";
import { ErrorState, LoadingRows } from "../../../src/components/states";
import { useLanguage } from "../../../src/lib/language";
import {
  fetchNotifications,
  markRead,
  type StoredNotification,
} from "../../../src/lib/notifications";

export default function NotificationsScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [items, setItems] = useState<StoredNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetchNotifications()
      .then((next) => {
        setFailed(false);
        setItems(next);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const open = async (item: StoredNotification) => {
    await markRead(item.id);
    const eventId = item.payload.event_id;
    const trainingId = item.payload.training_id;
    router.push(
      (typeof eventId === "string"
        ? `/events/${eventId}`
        : typeof trainingId === "string"
          ? `/training/${trainingId}`
          : typeof item.payload.idea_id === "string"
            ? item.kind === "O6"
              ? "/ideas/mine"
              : `/ideas/${item.payload.idea_id}`
            : notificationCopy[item.kind].opens) as never,
    );
  };

  return (
    <>
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <ScreenTitle>{t.notificationsTitle}</ScreenTitle>
        <LinkButton href="/notifications/settings" className="min-h-[44px] justify-center">
          <Text className="font-figtree-semibold text-sm text-blue">
            {t.notificationSettingsTitle}
          </Text>
        </LinkButton>
      </View>
      {failed ? (
        <ErrorState message={t.network} onRetry={load} />
      ) : items === null ? (
        <LoadingRows />
      ) : (
        <NotificationList items={items} onOpen={open} />
      )}
    </>
  );
}
