import {
  CHECK_AND_SEND,
  type RegistrationDraft,
  stepProblems,
  type TextKey,
  VERIFY_STEPS,
} from "@kingdom-connect/shared";
import Check from "lucide-react-native/icons/check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import User from "lucide-react-native/icons/user";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { initialsOf } from "./profile-link";
import { usePhone } from "./sheet";

export const verifyStepTitles: Record<number, TextKey> = {
  1: "stepPersonal",
  2: "stepCategory",
  3: "stepCategoryDetails",
  4: "stepIdentity",
  6: "stepReview",
};

const stepHints: Record<number, TextKey> = {
  1: "verifyHintPersonal",
  2: "verifyHintCategory",
  3: "verifyHintDetails",
  4: "verifyHintIdentity",
  6: "verifyHintReview",
};

const MINUTES_PER_STEP = 3;

const isDone = (step: number, draft: RegistrationDraft) =>
  step !== CHECK_AND_SEND && Object.keys(stepProblems(step, draft)).length === 0;

/** The Verify your identity start (S05): how far the member got, and one Continue on the step to do next. */
export function VerifyOverview({
  draft,
  current,
  onOpen,
}: {
  draft: RegistrationDraft;
  current: number;
  onOpen: (step: number) => void;
}) {
  const { t } = useLanguage();
  const phone = usePhone();
  const done = VERIFY_STEPS.filter((s) => isDone(s, draft)).length;
  const left = VERIFY_STEPS.length - done;
  return (
    <View className="gap-4">
      {phone ? null : (
        <Text className="font-figtree text-[15px] leading-[23px] text-ink-2">{t.verifyIntro}</Text>
      )}
      <View className="gap-2 rounded-card border border-line bg-surface px-6 py-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text
            role="heading"
            aria-level={2}
            className="font-figtree-extrabold text-[18px] text-ink"
          >
            {t.verifyStepsDone(done, VERIFY_STEPS.length)}
          </Text>
          <Text className="rounded-full bg-surface-2 px-2.5 py-1 font-figtree-bold text-[12px] text-ink">
            {t.verifyMinutesLeft(Math.max(2, left * MINUTES_PER_STEP))}
          </Text>
        </View>
        <View
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={VERIFY_STEPS.length}
          aria-valuenow={done}
          className="my-2 h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <View
            className="h-full rounded-full bg-navy"
            style={{ width: `${(done / VERIFY_STEPS.length) * 100}%` }}
          />
        </View>
        {VERIFY_STEPS.map((step, i) => {
          const here = step === current;
          const finished = isDone(step, draft) && !here;
          const title = t[verifyStepTitles[step]!] as string;
          const action = here ? (
            <Pressable
              role="button"
              aria-label={`${t.verifyContinue}: ${title}`}
              onPress={() => onOpen(step)}
              className={`min-h-[44px] items-center justify-center rounded-full bg-navy px-5 ${phone ? "self-start" : ""}`}
            >
              <Text className="font-figtree-bold text-[15px] text-white">{t.verifyContinue}</Text>
            </Pressable>
          ) : null;
          return (
            <View
              key={step}
              className={`gap-3 py-4 ${i < VERIFY_STEPS.length - 1 ? "border-b border-line" : ""}`}
            >
              <View className="flex-row items-center gap-3.5">
                {finished ? (
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-good">
                    <Check size={16} color="#ffffff" aria-hidden />
                  </View>
                ) : (
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${here ? "bg-navy" : "border border-line-2 bg-surface"}`}
                  >
                    <Text
                      className={`font-figtree-bold text-[14px] ${here ? "text-white" : "text-ink-2"}`}
                    >
                      {i + 1}
                    </Text>
                  </View>
                )}
                <Pressable
                  role="button"
                  aria-label={title}
                  onPress={() => onOpen(step)}
                  className="min-w-0 flex-1 gap-0.5"
                >
                  <Text className="font-figtree-bold text-[16px] text-ink">{title}</Text>
                  <Text className="font-figtree text-[13px] leading-[19px] text-ink-2">
                    {t[stepHints[step]!] as string}
                  </Text>
                </Pressable>
                {finished ? (
                  <Text className="rounded-full bg-good-soft px-2.5 py-1 font-figtree-bold text-[12px] text-good">
                    {t.verifyDone}
                  </Text>
                ) : null}
                {here && !phone ? action : null}
              </View>
              {here && phone ? <View className="pl-[46px]">{action}</View> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The profile card beside Verify your identity on a computer, as on the canvas. */
export function VerifySideCard({
  name,
  underReview,
}: {
  name: string | null | undefined;
  underReview: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const shown = name?.trim() ?? "";
  const links: { label: string; href: string; on?: boolean }[] = [
    { label: t.verifyTitle, href: "/profile/verify", on: true },
    { label: t.editProfile, href: "/profile" },
    { label: t.navSettings, href: "/settings" },
  ];
  return (
    <View className="w-[280px] gap-3 rounded-card border border-line bg-surface px-5 pb-3 pt-5">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-warn-soft">
        {shown ? (
          <Text className="font-figtree-extrabold text-[22px] text-navy">{initialsOf(shown)}</Text>
        ) : (
          <User size={26} color={palette.navy} aria-hidden />
        )}
      </View>
      {shown ? <Text className="font-figtree-bold text-[18px] text-ink">{shown}</Text> : null}
      <Text className="self-start rounded-full bg-warn-soft px-2.5 py-1 font-figtree-bold text-[12px] text-warn-text">
        {underReview ? t.verifyUnderReview : t.verifyNotYet}
      </Text>
      <View className="mt-1">
        {links.map((link) => (
          <LinkButton
            key={link.href}
            href={link.href}
            label={link.label}
            className="min-h-[54px] flex-row items-center justify-between border-t border-line"
          >
            <Text
              className={`text-[15px] text-ink ${link.on ? "font-figtree-bold" : "font-figtree"}`}
            >
              {link.label}
            </Text>
            <ChevronRight size={16} color={palette.ink} aria-hidden />
          </LinkButton>
        ))}
      </View>
    </View>
  );
}
