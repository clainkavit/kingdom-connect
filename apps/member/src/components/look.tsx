import {
  formatShortDate,
  lookAllows,
  VERIFY_STEPS,
  type ApplicationStatus,
  type Strings,
} from "@kingdom-connect/shared";
import { usePathname, useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { DashboardWidgetsApi, LatestItem } from "../lib/dashboard-widgets";
import { useLanguage } from "../lib/language";
import { hrefOf, kindLine } from "./dashboard-widgets";
import { usePalette } from "./palette";
import Lock from "lucide-react-native/icons/lock";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { Button } from "./form";
import { LinkButton } from "./link-button";
import { usePhoneHeader } from "./phone-header";
import { Sheet, usePhone } from "./sheet";
import { LoadingRows, LockedState } from "./states";

/** What someone who is not verified tried to do (R27, PRD section 3). */
export type LookAction = "apply" | "interest" | "save" | "register" | "alert";

const VERIFY_HREF = "/profile/verify";

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

function VerifyBanner({
  status,
  done,
}: {
  status: ApplicationStatus["kind"] | null;
  done: number | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const checking = status === "under_review";
  const sent = checking || status === "rejected";
  const title = checking
    ? t.lookCheckingTitle
    : status === "rejected"
      ? t.rejectedStatus
      : t.lookBannerTitle;
  const body = checking ? t.lookCheckingBody : t.lookBannerBody;
  const action = sent ? t.lookSeeStatus : t.lookContinue;
  const total = VERIFY_STEPS.length;
  return (
    <View
      className={`gap-4 rounded-card bg-navy px-6 py-6 ${phone ? "" : "flex-row items-center"}`}
    >
      {phone ? null : (
        <View className="h-12 w-12 items-center justify-center rounded-[14px] bg-navy-2">
          <ShieldCheck size={22} color={palette.gold} aria-hidden />
        </View>
      )}
      <View className="min-w-0 flex-1 gap-1.5">
        <Text
          role="heading"
          aria-level={2}
          className="font-figtree-extrabold text-[20px] text-white"
        >
          {title}
        </Text>
        {status === "rejected" ? null : (
          <Text className="font-figtree text-sm leading-5 text-navy-ink">{body}</Text>
        )}
        {!sent && done !== null ? (
          <View className="mt-1 flex-row items-center gap-3">
            <View className="h-2 w-[220px] max-w-full overflow-hidden rounded-full bg-navy-2">
              <View
                className="h-full rounded-full bg-gold"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </View>
            <Text className="font-figtree-bold text-[13px] text-gold">
              {t.lookProgress(done, total)}
            </Text>
          </View>
        ) : null}
      </View>
      <LinkButton
        href={VERIFY_HREF}
        label={action}
        className="self-start rounded-full bg-gold px-6 py-3.5"
      >
        <Text className="font-figtree-bold text-[15px] text-gold-ink">{action}</Text>
      </LinkButton>
    </View>
  );
}

function LookOpportunities({ items }: { items: LatestItem[] }) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  return (
    <View className="gap-3">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[18px] text-ink">
        {t.lookLatestOpportunities}
      </Text>
      {items.map((item) => (
        <LinkButton
          key={item.id}
          href={hrefOf(item)}
          label={item.title}
          className="gap-1.5 rounded-card border border-line bg-surface px-5 py-4"
        >
          <View className="flex-row flex-wrap gap-1.5">
            <Text className="rounded-full bg-warn-soft px-2.5 py-0.5 font-figtree-bold text-[12px] text-warn-text">
              {kindLine(t, item)}
            </Text>
            <View className="flex-row items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5">
              <Lock size={12} color={palette.ink2} aria-hidden />
              <Text className="font-figtree-bold text-[12px] text-ink-2">
                {t.lookVerifyToApply}
              </Text>
            </View>
          </View>
          <Text className="font-figtree-bold text-[16px] text-ink">{item.title}</Text>
          <Text className="font-figtree text-[13px] text-ink-2">
            {[
              item.sector ? (language === "sw" ? item.sector.sw : item.sector.en) : null,
              item.publishedAt ? formatShortDate(item.publishedAt, language) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </LinkButton>
      ))}
      <LinkButton
        href="/opportunities"
        label={t.lookSeeAllOpportunities}
        className="min-h-[48px] items-center justify-center rounded-full border border-line-2 bg-surface px-5"
      >
        <Text className="font-figtree-semibold text-[15px] text-ink">
          {t.lookSeeAllOpportunities}
        </Text>
      </LinkButton>
    </View>
  );
}

/** S08 before verification: what is open, what waits, and the way to verify or see the application. */
export function LookHome({
  widgets,
  status,
  progress,
}: {
  widgets: DashboardWidgetsApi;
  status: () => Promise<ApplicationStatus>;
  progress: () => Promise<number>;
}) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [kind, setKind] = useState<ApplicationStatus["kind"] | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [latest, setLatest] = useState<LatestItem[] | null>(null);
  useEffect(() => {
    let live = true;
    status().then(
      (s) => live && setKind(s.kind),
      () => undefined,
    );
    progress().then(
      (n) => live && setDone(n),
      () => undefined,
    );
    widgets.latest("all").then(
      (items) => live && setLatest(items),
      () => live && setLatest([]),
    );
    return () => {
      live = false;
    };
  }, [status, progress, widgets]);
  const inBand = usePhoneHeader({ home: true, title: t.lookWelcome, subtitle: t.lookIntro }, phone);
  const opportunities = (latest ?? []).filter((i) => i.kind === "opportunity").slice(0, 3);
  const others = (latest ?? []).filter((i) => i.kind !== "opportunity").slice(0, 3);

  return (
    <View className="w-full max-w-[1200px] gap-5 self-center">
      {inBand ? (
        <View className="self-start rounded-full bg-warn-soft px-3 py-1">
          <Text className="font-figtree-bold text-xs text-warn-text">{t.lookNotVerified}</Text>
        </View>
      ) : (
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-3">
            <Text
              role="heading"
              aria-level={1}
              className={`font-figtree-extrabold text-navy ${phone ? "text-[24px]" : "text-[32px]"}`}
            >
              {t.lookWelcome}
            </Text>
            <View className="rounded-full bg-warn-soft px-3 py-1">
              <Text className="font-figtree-bold text-xs text-warn-text">{t.lookNotVerified}</Text>
            </View>
          </View>
          <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">{t.lookIntro}</Text>
        </View>
      )}
      <VerifyBanner status={kind} done={done} />
      <View className={phone ? "gap-5" : "flex-row items-start gap-5"}>
        <View className="min-w-0 flex-1">
          {latest === null ? <LoadingRows rows={3} /> : <LookOpportunities items={opportunities} />}
        </View>
        <View className="min-w-0 flex-1 gap-4">
          <View className="gap-3 rounded-card border border-line bg-surface px-5 py-5">
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-[12px] bg-warn-soft">
                <Lock size={18} color={palette.navy} aria-hidden />
              </View>
              <Text
                role="heading"
                aria-level={2}
                className="flex-1 font-figtree-bold text-[18px] text-ink"
              >
                {t.lookPeopleTitle}
              </Text>
            </View>
            <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">
              {t.lookPeopleBody}
            </Text>
          </View>
          {others.length ? (
            <View className="gap-1 rounded-card border border-line bg-surface px-5 py-5">
              <Text
                role="heading"
                aria-level={2}
                className="pb-2 font-figtree-bold text-[18px] text-ink"
              >
                {t.lookCanLookAt}
              </Text>
              {others.map((item) => (
                <LinkButton
                  key={item.id}
                  href={hrefOf(item)}
                  label={item.title}
                  className="gap-0.5 border-t border-line py-3"
                >
                  <Text className="font-figtree-bold text-[15px] text-ink">{item.title}</Text>
                  <Text className="font-figtree text-[13px] text-ink-2">
                    {[
                      kindLine(t, item),
                      item.sector ? (language === "sw" ? item.sector.sw : item.sector.en) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </LinkButton>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
