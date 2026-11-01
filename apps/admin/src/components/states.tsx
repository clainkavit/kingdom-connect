import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/strings";

type Action = { label: string; href: string };

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label={strings.loading} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-testid="skeleton-row" className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
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
    <section className="flex flex-col items-center gap-2 rounded-lg border bg-card px-6 py-10 text-center shadow-card">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function ActionLink({ action }: { action: Action }) {
  return (
    <Link href={action.href} className={buttonVariants({ variant: "default" })}>
      {action.label}
    </Link>
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
  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-bad-soft px-6 py-8 text-center"
    >
      <p className="text-sm text-foreground">{message}</p>
      <button type="button" onClick={onRetry} className={buttonVariants({ variant: "outline" })}>
        {strings.tryAgain}
      </button>
    </section>
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
  if (!slow) return null;
  return (
    <div
      role="status"
      className="rounded-md bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn"
    >
      {strings.slowConnection}
    </div>
  );
}
