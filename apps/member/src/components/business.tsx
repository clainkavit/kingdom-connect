import type { Language, TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  BUSINESS_SIZES,
  DOCUMENT_KINDS,
  type BusinessApi,
  type BusinessForm,
  type BusinessStatus,
  type DocumentKind,
  type SubmitResult,
} from "../lib/business";
import { useLanguage } from "../lib/language";
import type { PickedFile } from "../lib/messages";
import type { Option } from "../lib/registration";
import { Button, ChoiceList, Field, Message } from "./form";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { ErrorState, LoadingRows } from "./states";

const sizeLabel: Record<(typeof BUSINESS_SIZES)[number], TextKey> = {
  micro: "sizeMicro",
  small: "sizeSmall",
  medium: "sizeMedium",
  large: "sizeLarge",
};

const documentLabel: Record<DocumentKind, TextKey> = {
  brela: "docBrela",
  tin: "docTin",
  licence: "docLicence",
};

const refusalText: Record<Exclude<SubmitResult, "ok">, TextKey> = {
  invalid_name: "businessInvalidName",
  invalid_sector: "businessInvalidSector",
  invalid_size: "businessInvalidSize",
  too_long: "businessTooLong",
  contact_details: "businessHasContact",
  invalid_number: "businessInvalidNumber",
  invalid_tin: "businessInvalidTin",
  licence_expired: "businessLicenceExpired",
  invalid_date: "businessInvalidDate",
  documents_missing: "businessDocumentsMissing",
  already_pending: "businessAlreadyPending",
  already_approved: "businessAlreadyApproved",
  file_too_large: "businessFileTooLarge",
  file_wrong_type: "businessFileWrongType",
  failed: "businessSendFailed",
};

const emptyForm: BusinessForm = {
  name: "",
  sectorId: "",
  size: "",
  description: "",
  brelaNo: "",
  tin: "",
  licenceNo: "",
  licenceExpiresOn: "",
};

function LevelRow({ title, status }: { title: string; status: string }) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-line py-2.5">
      <Text className="flex-1 font-figtree-semibold text-[15px] text-ink">{title}</Text>
      <Text className="font-figtree text-sm text-ink-2">{status}</Text>
    </View>
  );
}

function BusinessFormView({
  api,
  initial,
  language,
  onSent,
}: {
  api: BusinessApi;
  initial: BusinessForm;
  language: Language;
  onSent: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<BusinessForm>(initial);
  const [sectors, setSectors] = useState<Option[]>([]);
  const [files, setFiles] = useState<Partial<Record<DocumentKind, PickedFile>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.sectors(language).then(setSectors, () => undefined);
  }, [api, language]);

  const set = <K extends keyof BusinessForm>(key: K, value: BusinessForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const choose = async (kind: DocumentKind) => {
    const picked = await api.pickFile().catch(() => null);
    if (picked) setFiles((f) => ({ ...f, [kind]: picked }));
  };

  const send = async () => {
    const complete =
      form.name.trim() &&
      form.sectorId &&
      form.size &&
      form.brelaNo.trim() &&
      form.tin.trim() &&
      form.licenceNo.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(form.licenceExpiresOn.trim()) &&
      DOCUMENT_KINDS.every((k) => files[k]);
    if (!complete) return setProblem(t.businessIncomplete);
    setProblem(null);
    setBusy(true);
    const result = await api
      .submit(
        { ...form, licenceExpiresOn: form.licenceExpiresOn.trim() },
        files as Record<DocumentKind, PickedFile>,
      )
      .catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") return onSent();
    setProblem(t[refusalText[result]] as string);
  };

  return (
    <Section title={t.businessDetails}>
      <Field label={t.businessName} value={form.name} onChange={(v) => set("name", v)} />
      <ChoiceList
        label={t.businessSector}
        options={sectors}
        value={form.sectorId || undefined}
        onChange={(v) => set("sectorId", v)}
      />
      <ChoiceList
        label={t.businessSize}
        options={BUSINESS_SIZES.map((s) => ({ value: s, label: t[sizeLabel[s]] as string }))}
        value={form.size || undefined}
        onChange={(v) => set("size", v as BusinessForm["size"])}
      />
      <Field
        label={t.businessDescription}
        value={form.description}
        onChange={(v) => set("description", v)}
        multiline
      />
      <Field label={t.brelaNumber} value={form.brelaNo} onChange={(v) => set("brelaNo", v)} />
      <Field
        label={t.tinNumber}
        value={form.tin}
        onChange={(v) => set("tin", v)}
        keyboardType="number-pad"
      />
      <Field label={t.licenceNumber} value={form.licenceNo} onChange={(v) => set("licenceNo", v)} />
      <Field
        label={t.licenceExpiry}
        value={form.licenceExpiresOn}
        onChange={(v) => set("licenceExpiresOn", v)}
        hint={t.licenceExpiryHint}
      />
      <Text className="font-figtree text-sm text-ink-2">{t.documentsHint}</Text>
      {DOCUMENT_KINDS.map((kind) => (
        <Button
          key={kind}
          secondary
          label={`${t[documentLabel[kind]] as string}: ${files[kind]?.name ?? t.chooseFile}`}
          onPress={() => choose(kind)}
        />
      ))}
      <Message text={problem} />
      <Button label={t.businessSend} onPress={send} disabled={busy} />
    </Section>
  );
}

/** S40: the status of each level, and the Level 2 documents (R-B01). */
export function BusinessScreen({ api }: { api: BusinessApi }) {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState<BusinessStatus | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.load().then(
      (loaded) => live && setStatus(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  if (failed)
    return (
      <ErrorState
        message={t.businessLoadFailed}
        onRetry={() => {
          setFailed(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (status === undefined) return <LoadingRows />;

  const request = status?.requestStatus ?? null;
  const pending = request === "pending" || sent;
  const approved = request === "approved";
  const expired = status?.businessStatus === "expired";
  const statusText = expired
    ? t.statusExpired
    : pending
      ? t.statusPending
      : approved
        ? t.statusApproved
        : request === "rejected"
          ? t.statusRejected
          : t.statusNotStarted;

  return (
    <View className="gap-4">
      <ScreenTitle>{t.businessTitle}</ScreenTitle>
      <Section title={t.levelsTitle}>
        <LevelRow title={t.levelMember} status={t.statusApproved} />
        <LevelRow title={t.levelBusiness} status={statusText} />
        <LevelRow title={t.levelPoster} status={approved ? t.statusNotStarted : t.statusLocked} />
        {!approved ? (
          <Text className="font-figtree text-sm text-ink-2">{t.posterLocked}</Text>
        ) : null}
      </Section>
      {sent ? <Message tone="info" text={t.businessSent} /> : null}
      {request === "pending" && !sent ? <Message tone="info" text={t.businessPendingNote} /> : null}
      {request === "rejected" ? (
        <Message text={t.businessRejectedReason(status?.reason ?? "")} />
      ) : null}
      {approved && status ? (
        <Message tone="info" text={t.businessApprovedNote(status.licenceExpiresOn)} />
      ) : null}
      {!pending && !approved ? (
        <BusinessFormView
          api={api}
          language={language}
          initial={
            status
              ? {
                  name: status.name,
                  sectorId: status.sectorId,
                  size: status.size,
                  description: status.description,
                  brelaNo: status.brelaNo,
                  tin: status.tin,
                  licenceNo: status.licenceNo,
                  licenceExpiresOn: status.licenceExpiresOn,
                }
              : emptyForm
          }
          onSent={() => setSent(true)}
        />
      ) : null}
    </View>
  );
}
