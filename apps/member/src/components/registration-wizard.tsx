import {
  type FieldProblem,
  type IdType,
  type RegistrationDraft,
  type SaveIdentityResult,
  stepProblems,
  type SubmitResult,
  type TextKey,
  WIZARD_STEPS,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { LegalText, Option, SavedDraft } from "../lib/registration";
import { Button, Message } from "./form";
import {
  CategoryStep,
  DetailsStep,
  IdentityStep,
  LegalStep,
  PersonalStep,
  ReviewStep,
} from "./wizard-steps";

export type WizardApi = {
  saveDraft: (step: number, draft: RegistrationDraft) => Promise<void>;
  saveIdentity: (identity: {
    idType: IdType;
    idNumber: string;
    idExpiresOn?: string;
  }) => Promise<SaveIdentityResult>;
  pickAndUploadPhoto: (kind: "face" | "id") => Promise<boolean>;
  submit: () => Promise<SubmitResult>;
  regions: () => Promise<Option[]>;
  districts: (regionId: string) => Promise<Option[]>;
  sectors: () => Promise<Option[]>;
  legalTexts: () => Promise<LegalText[]>;
};

const stepTitles: TextKey[] = [
  "stepPersonal",
  "stepCategory",
  "stepCategoryDetails",
  "stepIdentity",
  "stepLegal",
  "stepReview",
];

/** The six registration steps (S05). Each step is saved before moving on. */
export function RegistrationWizard({
  initial,
  api,
  entityName,
  onSubmitted,
}: {
  initial: SavedDraft;
  api: WizardApi;
  entityName: string;
  onSubmitted: () => void;
}) {
  const { t } = useLanguage();
  const [step, setStep] = useState(initial.step);
  const [draft, setDraft] = useState<RegistrationDraft>(initial.data);
  const [problems, setProblems] = useState<Record<string, FieldProblem>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idMessage, setIdMessage] = useState<string | null>(null);
  const [idProblem, setIdProblem] = useState<FieldProblem | null>(null);
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);
  const [texts, setTexts] = useState<LegalText[]>([]);

  useEffect(() => {
    api.regions().then(setRegions);
    api.sectors().then(setSectors);
    api.legalTexts().then(setTexts);
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
    if (Object.keys(found).length === 0) go(step + 1);
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

  const pickPhoto = async (kind: "face" | "id") => {
    setBusy(true);
    try {
      if (await api.pickAndUploadPhoto(kind)) {
        const next = { ...draft, [kind === "face" ? "facePhoto" : "idPhoto"]: true };
        setDraft(next);
        await api.saveDraft(step, next);
      }
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
      setStep(result.step);
      setProblems(stepProblems(result.step, draft));
      return;
    }
    setMessage(t.network);
  };

  const labelOf = (kind: "region" | "district" | "sector", id: string | undefined) =>
    ({ region: regions, district: districts, sector: sectors })[kind].find((o) => o.value === id)
      ?.label;

  const props = { draft, update, problems };
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="font-figtree-semibold text-xs text-blue">
          {t.stepOf(step, WIZARD_STEPS)}
        </Text>
        <Text role="heading" aria-level={2} className="font-figtree-extrabold text-lg text-ink">
          {t[stepTitles[step - 1]!]}
        </Text>
        <Text className="font-figtree text-[13px] text-ink-2">{t.savedProgress}</Text>
      </View>

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
      {step === 5 ? <LegalStep {...props} texts={texts} entityName={entityName} /> : null}
      {step === 6 ? <ReviewStep draft={draft} labelOf={labelOf} onEdit={(n) => go(n)} /> : null}

      <Message text={message} />
      <View className="flex-row gap-3">
        {step > 1 ? (
          <View className="flex-1">
            <Button secondary label={t.back} onPress={() => go(step - 1)} disabled={busy} />
          </View>
        ) : null}
        <View className="flex-1">
          {step < WIZARD_STEPS ? (
            <Button label={t.next} onPress={nextStep} disabled={busy} />
          ) : (
            <Button label={t.submitApplication} onPress={submit} disabled={busy} />
          )}
        </View>
      </View>
    </View>
  );
}
