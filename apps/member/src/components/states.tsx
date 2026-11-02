import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { LinkButton } from "./link-button";

type Action = { label: string; href: string };

function Bar({ className }: { className: string }) {
  return <View className={`rounded-md bg-surface-2 ${className}`} />;
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  const { t } = useLanguage();
  return (
    <View role="status" aria-label={t.loading} aria-busy className="gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} testID="skeleton-row" className="flex-row items-center gap-3">
          <View className="h-10 w-10 rounded-full bg-surface-2" />
          <View className="flex-1 gap-2">
            <Bar className="h-3.5 w-2/5" />
            <Bar className="h-3 w-3/4" />
          </View>
        </View>
      ))}
    </View>
  );
}

function StatePanel({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="items-center gap-2 rounded-card border border-line bg-surface px-6 py-10">
      <Text
        role="heading"
        aria-level={2}
        className="text-center font-figtree-semibold text-base text-ink"
      >
        {title}
      </Text>
      <Text className="max-w-sm text-center font-figtree text-sm text-ink-2">{message}</Text>
      {children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}

function ActionLink({ action }: { action: Action }) {
  return (
    <LinkButton href={action.href} className="rounded-lg bg-blue px-4 py-2.5">
      <Text className="font-figtree-semibold text-sm text-blue-ink">{action.label}</Text>
    </LinkButton>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: Action;
}) {
  return (
    <StatePanel title={title} message={message}>
      {action ? <ActionLink action={action} /> : null}
    </StatePanel>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <View
      role="alert"
      className="items-center gap-3 rounded-card border border-line bg-bad-soft px-6 py-8"
    >
      <Text className="text-center font-figtree text-sm text-ink">{message}</Text>
      <Pressable
        role="button"
        aria-label={t.tryAgain}
        onPress={onRetry}
        className="rounded-lg border border-line bg-surface px-4 py-2.5"
      >
        <Text className="font-figtree-semibold text-sm text-ink">{t.tryAgain}</Text>
      </Pressable>
    </View>
  );
}

export function LockedState({
  screenName,
  reason,
  action,
}: {
  screenName: string;
  reason: string;
  action: Action;
}) {
  return (
    <StatePanel title={screenName} message={reason}>
      <ActionLink action={action} />
    </StatePanel>
  );
}

export function SlowConnectionBanner({ slow }: { slow: boolean }) {
  const { t } = useLanguage();
  if (!slow) return null;
  return (
    <View role="status" className="rounded-md bg-warn-soft px-3 py-1.5">
      <Text className="font-figtree-medium text-xs text-warn">{t.slowConnection}</Text>
    </View>
  );
}
