import {
  categoryFields,
  type CategoryDetails,
  type FieldProblem,
  idTypes,
  type IdType,
  memberCategories,
  type MemberCategory,
  type RegistrationDraft,
  type Strings,
  type TextKey,
} from "@kingdom-connect/shared";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { LegalText, Option } from "../lib/registration";
import { Button, Checkbox, ChoiceList, Chips, Field, Message, problemText } from "./form";
import { LegalTextView } from "./legal";

export type StepProps = {
  draft: RegistrationDraft;
  update: (change: Partial<RegistrationDraft>) => void;
  problems: Record<string, FieldProblem>;
};

const categoryLabel: Record<MemberCategory, TextKey> = {
  professional: "categoryProfessional",
  businessperson: "categoryBusinessperson",
  entrepreneur: "categoryEntrepreneur",
  other: "categoryOther",
};

const idTypeLabel: Record<IdType, TextKey> = {
  nida: "idNida",
  passport: "idPassport",
  driving_licence: "idDrivingLicence",
  voters_id: "idVotersId",
};

const detailLabel: Record<keyof CategoryDetails, TextKey> = {
  profession: "profession",
  certifications: "certificationsLabel",
  businessName: "businessName",
  sectorId: "sector",
  building: "building",
  description: "describeYourself",
};

const say = (t: Strings, problems: Record<string, FieldProblem>, field: string) =>
  problemText(t, problems[field]);

export function PersonalStep({
  draft,
  update,
  problems,
  regions,
  districts,
}: StepProps & { regions: Option[]; districts: Option[] }) {
  const { t } = useLanguage();
  const study = draft.study ?? {};
  return (
    <View className="gap-3">
      <Field
        label={t.fullName}
        value={draft.fullName ?? ""}
        onChange={(fullName) => update({ fullName })}
        problem={say(t, problems, "fullName")}
      />
      <ChoiceList
        label={t.region}
        options={regions}
        value={draft.regionId}
        onChange={(regionId) => update({ regionId, districtId: undefined })}
        problem={say(t, problems, "regionId")}
      />
      <ChoiceList
        label={t.district}
        options={districts}
        value={draft.districtId}
        onChange={(districtId) => update({ districtId })}
        disabled={!draft.regionId}
        problem={say(t, problems, "districtId")}
      />
      <Field
        label={t.addressLabel}
        value={draft.address ?? ""}
        onChange={(address) => update({ address })}
        problem={say(t, problems, "address")}
      />
      <Text className="mt-2 font-figtree-bold text-sm text-ink">{t.studyOptional}</Text>
      <Field
        label={t.studyInstitution}
        value={study.institution ?? ""}
        onChange={(institution) => update({ study: { ...study, institution } })}
        problem={say(t, problems, "study.institution")}
      />
      <Field
        label={t.studyCourse}
        value={study.course ?? ""}
        onChange={(course) => update({ study: { ...study, course } })}
      />
      <Field
        label={t.studyYear}
        value={study.year ? String(study.year) : ""}
        keyboardType="number-pad"
        onChange={(year) =>
          update({ study: { ...study, year: year.trim() ? Number(year) : undefined } })
        }
        problem={say(t, problems, "study.year")}
      />
    </View>
  );
}

export function CategoryStep({ draft, update, problems }: StepProps) {
  const { t } = useLanguage();
  return (
    <Chips
      label={t.stepCategory}
      options={memberCategories.map((value) => ({ value, label: t[categoryLabel[value]] }))}
      value={draft.category}
      onChange={(category) => update({ category, categoryDetails: {} })}
      problem={say(t, problems, "category")}
    />
  );
}

export function DetailsStep({
  draft,
  update,
  problems,
  sectors,
}: StepProps & { sectors: Option[] }) {
  const { t } = useLanguage();
  if (!draft.category) return <Message text={t.problemRequired} />;
  const details = draft.categoryDetails ?? {};
  return (
    <View className="gap-3">
      {categoryFields[draft.category].map(({ field }) =>
        field === "sectorId" ? (
          <ChoiceList
            key={field}
            label={t.sector}
            options={sectors}
            value={details.sectorId}
            onChange={(sectorId) => update({ categoryDetails: { ...details, sectorId } })}
            problem={say(t, problems, `categoryDetails.${field}`)}
          />
        ) : (
          <Field
            key={field}
            label={t[detailLabel[field]]}
            value={details[field] ?? ""}
            multiline={field === "description" || field === "building"}
            hint={field === "certifications" ? t.certificationsHint : undefined}
            onChange={(value) => update({ categoryDetails: { ...details, [field]: value } })}
            problem={say(t, problems, `categoryDetails.${field}`)}
          />
        ),
      )}
    </View>
  );
}

function PhotoPicker({
  label,
  added,
  busy,
  onPick,
  problem,
}: {
  label: string;
  added: boolean;
  busy: boolean;
  onPick: () => void;
  problem?: string | null;
}) {
  const { t } = useLanguage();
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-figtree-semibold text-sm text-ink">{label}</Text>
        {added ? (
          <Text className="font-figtree-semibold text-[13px] text-good-text">{t.photoAdded}</Text>
        ) : null}
      </View>
      <Button
        secondary
        label={added ? t.replacePhoto : t.choosePhoto}
        onPress={onPick}
        disabled={busy}
      />
      {problem ? <Text className="font-figtree text-[13px] text-bad-text">{problem}</Text> : null}
    </View>
  );
}

export function IdentityStep({
  draft,
  update,
  problems,
  onSaveId,
  onPickPhoto,
  busy,
  idMessage,
  idProblem,
}: StepProps & {
  onSaveId: (idNumber: string) => void;
  onPickPhoto: (kind: "face" | "id") => void;
  busy: boolean;
  idMessage: string | null;
  idProblem: FieldProblem | null;
}) {
  const { t } = useLanguage();
  const [idNumber, setIdNumber] = useState("");
  return (
    <View className="gap-3">
      <Chips
        label={t.idType}
        options={idTypes.map((value) => ({ value, label: t[idTypeLabel[value]] }))}
        value={draft.idType}
        onChange={(idType) => update({ idType, identitySaved: false })}
        problem={say(t, problems, "idType")}
      />
      <Field
        label={t.idNumber}
        value={idNumber}
        onChange={setIdNumber}
        hint={draft.identitySaved ? t.idSaved : undefined}
        problem={problemText(t, idProblem ?? undefined) ?? say(t, problems, "idNumber")}
      />
      <Field
        label={t.idExpiresOn}
        value={draft.idExpiresOn ?? ""}
        onChange={(idExpiresOn) => update({ idExpiresOn, identitySaved: false })}
      />
      <Message text={idMessage} />
      <Button
        secondary
        label={t.saveId}
        onPress={() => onSaveId(idNumber)}
        disabled={busy || !draft.idType || !idNumber.trim()}
      />
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.photosPrivate}</Text>
      <PhotoPicker
        label={t.facePhoto}
        added={Boolean(draft.facePhoto)}
        busy={busy}
        onPick={() => onPickPhoto("face")}
        problem={say(t, problems, "facePhoto")}
      />
      <PhotoPicker
        label={t.idPhoto}
        added={Boolean(draft.idPhoto)}
        busy={busy}
        onPick={() => onPickPhoto("id")}
        problem={say(t, problems, "idPhoto")}
      />
    </View>
  );
}

function ReadMore({ text, entityName }: { text: LegalText | undefined; entityName: string }) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <View className="gap-2">
      <Pressable
        role="button"
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        className="min-h-[44px] justify-center self-start"
      >
        <Text className="font-figtree-semibold text-sm text-blue">{t.readText}</Text>
      </Pressable>
      {open ? (
        <View className="max-h-72 rounded-card border border-line p-3">
          <LegalTextView
            body={language === "sw" ? text.body_sw : text.body_en}
            entityName={entityName}
          />
        </View>
      ) : null}
    </View>
  );
}

export function LegalStep({
  draft,
  update,
  problems,
  texts,
  entityName,
}: StepProps & { texts: LegalText[]; entityName: string }) {
  const { t } = useLanguage();
  const text = (kind: LegalText["kind"]) => texts.find((x) => x.kind === kind);
  return (
    <View className="gap-3">
      <View className="gap-1 rounded-card border border-line p-3">
        <Checkbox
          label={t.acceptTermsLabel}
          checked={Boolean(draft.acceptTerms)}
          onChange={(acceptTerms) => update({ acceptTerms })}
          problem={say(t, problems, "acceptTerms")}
        />
        <ReadMore text={text("terms")} entityName={entityName} />
      </View>
      <View className="gap-1 rounded-card border border-line p-3">
        <Checkbox
          label={t.acceptPrivacyLabel}
          checked={Boolean(draft.acceptPrivacy)}
          onChange={(acceptPrivacy) => update({ acceptPrivacy })}
          problem={say(t, problems, "acceptPrivacy")}
        />
        <ReadMore text={text("privacy")} entityName={entityName} />
      </View>
      <Text className="font-figtree text-xs text-ink-2">{t.englishGoverns}</Text>
    </View>
  );
}

export function ReviewStep({
  draft,
  labelOf,
  onEdit,
}: {
  draft: RegistrationDraft;
  labelOf: (kind: "region" | "district" | "sector", id: string | undefined) => string | undefined;
  onEdit: (step: number) => void;
}) {
  const { t } = useLanguage();
  const rows: { step: number; label: string; value: string | undefined }[] = [
    { step: 1, label: t.fullName, value: draft.fullName },
    { step: 1, label: t.region, value: labelOf("region", draft.regionId) },
    { step: 1, label: t.district, value: labelOf("district", draft.districtId) },
    { step: 1, label: t.addressLabel, value: draft.address },
    { step: 2, label: t.stepCategory, value: draft.category && t[categoryLabel[draft.category]] },
    { step: 4, label: t.idType, value: draft.idType && t[idTypeLabel[draft.idType]] },
    { step: 4, label: t.facePhoto, value: draft.facePhoto ? t.photoAdded : undefined },
    { step: 4, label: t.idPhoto, value: draft.idPhoto ? t.photoAdded : undefined },
  ];
  return (
    <View className="gap-3">
      <Text className="font-figtree text-sm leading-5 text-ink-2">{t.reviewIntro}</Text>
      <View className="rounded-card border border-line">
        {rows.map((row, i) => (
          <View
            key={`${row.label}-${i}`}
            className={`min-h-[48px] flex-row items-center gap-3 px-3 ${i < rows.length - 1 ? "border-b border-line" : ""}`}
          >
            <View className="flex-1 py-2">
              <Text className="font-figtree text-xs text-ink-2">{row.label}</Text>
              <Text className="font-figtree-semibold text-sm text-ink">
                {row.value || t.notGiven}
              </Text>
            </View>
            <Pressable
              role="button"
              aria-label={`${t.edit}: ${row.label}`}
              onPress={() => onEdit(row.step)}
              className="min-h-[44px] justify-center px-2"
            >
              <Text className="font-figtree-semibold text-sm text-blue">{t.edit}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
