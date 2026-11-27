import {
  type FieldProblem,
  type IdType,
  nextVerifyStep,
  type PhotoProblem,
  previousVerifyStep,
  VERIFY_STEPS,
  shownStepNumber,
  CHECK_AND_SEND,
  type RegistrationDraft,
  type SaveIdentityResult,
  stepProblems,
  type SubmitResult,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { Option, SavedDraft } from "../lib/registration";
import { Button, Message } from "./form";
import { usePhoneHeader } from "./phone-header";
import { usePhone } from "./sheet";
import { VerifyOverview, verifyStepTitles } from "./verify-overview";
import { CategoryStep, DetailsStep, IdentityStep, PersonalStep, ReviewStep } from "./wizard-steps";

export type PhotoResult = "uploaded" | "cancelled" | PhotoProblem | "unreadable" | "network";

export type WizardApi = {
  saveDraft: (step: number, draft: RegistrationDraft) => Promise<void>;
  saveIdentity: (identity: {
    idType: IdType;
    idNumber: string;
    idExpiresOn?: string;
  }) => Promise<SaveIdentityResult>;
  pickAndUploadPhoto: (kind: "face" | "id") => Promise<PhotoResult>;
  submit: () => Promise<SubmitResult>;
  regions: () => Promise<Option[]>;
  districts: (regionId: string) => Promise<Option[]>;
  sectors: () => Promise<Option[]>;
};

/** A draft saved on a step that is not shown, such as the terms, opens on Check and send. */
const shownStep = (step: number) => (verifyStepTitles[step] ? step : CHECK_AND_SEND);

/** Verify your identity (S05, R28): five steps in the profile, each saved before moving on. */
export function RegistrationWizard({
  initial,
  api,
  onSubmitted,
}: {
  initial: SavedDraft;
  api: WizardApi;
  onSubmitted: () => void;
}) {
  const { t } = useLanguage();
  const phone = usePhone();
  const [overview, setOverview] = useState(true);
  const [step, setStep] = useState(shownStep(initial.step));
  const [draft, setDraft] = useState<RegistrationDraft>(initial.data);
  const [problems, setProblems] = useState<Record<string, FieldProblem>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idMessage, setIdMessage] = useState<string | null>(null);
  const [idProblem, setIdProblem] = useState<FieldProblem | null>(null);
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);

  useEffect(() => {
    api.regions().then(setRegions);
    api.sectors().then(setSectors);
  }, [api]);

  useEffect(() => {
    if (draft.regionId) api.districts(draft.regionId).then(setDistricts);
  }, [api, draft.regionId]);

  const update = (change: Partial<RegistrationDraft>) => setDraft({ ...draft, ...change });

  const go = async (next: number, data: RegistrationDraft = draft) => {
    setBusy(true);
    setMessage(null);
    try {
      await api.saveDraft(next, data);
      setStep(next);
      setProblems({});
    } catch {
      setMessage(t.network);
    } finally {
      setBusy(false);
    }
  };

  const nextStep = () => {
    const found = stepProblems(step, draft);
    setProblems(found);
    if (Object.keys(found).length === 0) go(nextVerifyStep(step));
  };

  const saveId = async (idNumber: string) => {
    if (!draft.idType) return;
    setBusy(true);
    setIdMessage(null);
    setIdProblem(null);
    const result = await api.saveIdentity({
      idType: draft.idType,
      idNumber,
      ...(draft.idExpiresOn ? { idExpiresOn: draft.idExpiresOn } : {}),
    });
    setBusy(false);
    if (result.kind === "saved") {
      const next = { ...draft, identitySaved: true };
      setDraft(next);
      await api.saveDraft(step, next).catch(() => setMessage(t.network));
    } else if (result.kind === "duplicate") setIdMessage(t.idDuplicate);
    else if (result.kind === "too_many") setIdMessage(t.idTooManyTries);
    else if (result.kind === "invalid") setIdProblem(result.problem);
    else setIdMessage(t.network);
  };

  const photoMessages: Record<Exclude<PhotoResult, "uploaded" | "cancelled">, string> = {
    photo_type: t.photoWrongType,
    photo_size: t.photoTooBig,
    unreadable: t.photoUnreadable,
    network: t.network,
  };

  const pickPhoto = async (kind: "face" | "id") => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.pickAndUploadPhoto(kind);
      if (result === "uploaded") {
        const next = { ...draft, [kind === "face" ? "facePhoto" : "idPhoto"]: true };
        setDraft(next);
        await api.saveDraft(step, next);
      } else if (result !== "cancelled") setMessage(photoMessages[result]);
    } catch {
      setMessage(t.network);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const result = await api.submit();
    setBusy(false);
    if (result.kind === "submitted") return onSubmitted();
    if (result.kind === "incomplete") {
      setOverview(false);
      setStep(shownStep(result.step));
      setProblems(stepProblems(result.step, draft));
      return;
    }
    setMessage(t.network);
  };

  const labelOf = (kind: "region" | "district" | "sector", id: string | undefined) =>
    ({ region: regions, district: districts, sector: sectors })[kind].find((o) => o.value === id)
      ?.label;

  const props = { draft, update, problems };
  const inBand = usePhoneHeader(
    overview
      ? null
      : {
          back: { label: t.back, href: "/profile/verify", onPress: back },
          title: t[verifyStepTitles[step]!] as string,
          subtitle: t.stepOf(shownStepNumber(step), VERIFY_STEPS.length),
        },
    phone,
  );
  const titleClass = `font-figtree-extrabold text-navy ${phone ? "text-[24px] leading-[29px]" : "text-[32px] leading-[37px]"}`;

  if (overview)
    return (
      <View className="gap-4">
        <Text role="heading" aria-level={1} className={titleClass}>
          {t.verifyTitle}
        </Text>
        <VerifyOverview
          draft={draft}
          current={step}
          onOpen={(next) => {
            setStep(next);
            setProblems({});
            setOverview(false);
          }}
        />
      </View>
    );

  function back() {
    if (step === VERIFY_STEPS[0]) {
      setMessage(null);
      setOverview(true);
      return;
    }
    go(previousVerifyStep(step));
  }

  return (
    <View className="gap-4">
      {inBand ? null : (
        <View className="items-start gap-2">
          <Text className="rounded-full bg-surface-2 px-2.5 py-1 font-figtree-bold text-[12px] text-ink">
            {t.stepOf(shownStepNumber(step), VERIFY_STEPS.length)}
          </Text>
          <Text role="heading" aria-level={1} className={titleClass}>
            {t[verifyStepTitles[step]!] as string}
          </Text>
        </View>
      )}

      <View className="gap-4 rounded-card border border-line bg-surface px-6 py-6">
        {step === 1 ? <PersonalStep {...props} regions={regions} districts={districts} /> : null}
        {step === 2 ? <CategoryStep {...props} /> : null}
        {step === 3 ? <DetailsStep {...props} sectors={sectors} /> : null}
        {step === 4 ? (
          <IdentityStep
            {...props}
            busy={busy}
            onSaveId={saveId}
            onPickPhoto={pickPhoto}
            idMessage={idMessage}
            idProblem={idProblem}
          />
        ) : null}
        {step === 6 ? <ReviewStep draft={draft} labelOf={labelOf} onEdit={(n) => go(n)} /> : null}

        <Message text={message} />
        <View className="flex-row flex-wrap gap-2.5">
          <Button secondary label={t.back} onPress={back} disabled={busy} />
          {step < CHECK_AND_SEND ? (
            <Button label={t.verifySaveContinue} onPress={nextStep} disabled={busy} />
          ) : (
            <Button label={t.submitApplication} onPress={submit} disabled={busy} />
          )}
        </View>
      </View>
    </View>
  );
}
