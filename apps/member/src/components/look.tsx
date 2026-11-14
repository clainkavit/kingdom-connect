import { lookAllows, type ApplicationStatus, type Strings } from "@kingdom-connect/shared";
import { usePathname, useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { DashboardWidgetsApi } from "../lib/dashboard-widgets";
import { useLanguage } from "../lib/language";
import { LatestItems } from "./dashboard-widgets";
import { Button } from "./form";
import { LinkButton } from "./link-button";
import { Sheet } from "./sheet";
import { LockedState } from "./states";

/** What someone who is not verified tried to do (R27, PRD section 3). */
export type LookAction = "apply" | "interest" | "save" | "register" | "alert";

const VERIFY_HREF = "/registration";

const askFor = (t: Strings, action: LookAction): string =>
  ({
    apply: t.lookAskApply,
    interest: t.lookAskInterest,
    save: t.lookAskSave,
    register: t.lookAskRegister,
    alert: t.lookAskAlert,
  })[action];

type Look = { looking: boolean; ask: (action: LookAction) => void };

const LookContext = createContext<Look>({ looking: false, ask: () => {} });

export const useLook = () => useContext(LookContext);

/** Runs an action, or asks someone who is not verified to verify first. The server refuses it either way. */
export function useAct() {
  const { looking, ask } = useLook();
  return (action: LookAction, run: () => unknown) => {
    if (looking) ask(action);
    else run();
  };
}

export function LookProvider({
  looking,
  children,
}: {
  looking: boolean;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [asked, setAsked] = useState<LookAction | null>(null);
  return (
    <LookContext.Provider value={{ looking, ask: setAsked }}>
      {children}
      <Sheet
        open={asked !== null}
        title={asked ? askFor(t, asked) : ""}
        onClose={() => setAsked(null)}
      >
        <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">{t.lookAskBody}</Text>
        <Button
          label={t.lookContinue}
          onPress={() => {
            setAsked(null);
            router.push(VERIFY_HREF);
          }}
        />
        <Button secondary label={t.lookNotNow} onPress={() => setAsked(null)} />
      </Sheet>
    </LookContext.Provider>
  );
}

/** Shows only the read-only pages to someone who is not verified; the rest say why they are locked. */
export function LookGate({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { looking } = useLook();
  if (!looking || lookAllows(pathname)) return <>{children}</>;
  return (
    <LockedState
      screenName={t.lookLockedTitle}
      reason={t.lookLockedBody}
      action={{ label: t.lookContinue, href: VERIFY_HREF }}
    />
  );
}

function VerifyBanner({ status }: { status: ApplicationStatus["kind"] | null }) {
  const { t } = useLanguage();
  const checking = status === "under_review";
  const sent = checking || status === "rejected";
  const title = checking
    ? t.lookCheckingTitle
    : status === "rejected"
      ? t.rejectedStatus
      : t.lookBannerTitle;
  const body = checking ? t.lookCheckingBody : t.lookBannerBody;
  const action = sent ? t.lookSeeStatus : t.lookContinue;
  return (
    <View className="gap-3 rounded-card bg-navy p-5">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-lg text-white">
        {title}
      </Text>
      {status === "rejected" ? null : (
        <Text className="font-figtree text-sm leading-5 text-navy-ink">{body}</Text>
      )}
      <LinkButton
        href={VERIFY_HREF}
        label={action}
        className="self-start rounded-full bg-blue-soft px-5 py-3"
      >
        <Text className="font-figtree-bold text-[15px] text-navy">{action}</Text>
      </LinkButton>
    </View>
  );
}

/** S08 before verification: what is open, what waits, and the way to verify or see the application. */
export function LookHome({
  widgets,
  status,
}: {
  widgets: DashboardWidgetsApi;
  status: () => Promise<ApplicationStatus>;
}) {
  const { t } = useLanguage();
  const [kind, setKind] = useState<ApplicationStatus["kind"] | null>(null);
  useEffect(() => {
    let live = true;
    status().then(
      (s) => live && setKind(s.kind),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [status]);
  return (
    <View className="gap-5">
      <View className="self-start rounded-full bg-warn-soft px-3 py-1">
        <Text className="font-figtree-bold text-xs text-warn-text">{t.lookNotVerified}</Text>
      </View>
      <VerifyBanner status={kind} />
      <LatestItems api={widgets} />
      <View className="gap-2 rounded-card border border-line bg-surface p-5">
        <Text role="heading" aria-level={2} className="font-figtree-bold text-base text-ink">
          {t.lookPeopleTitle}
        </Text>
        <Text className="font-figtree text-sm leading-5 text-ink-2">{t.lookPeopleBody}</Text>
      </View>
    </View>
  );
}
