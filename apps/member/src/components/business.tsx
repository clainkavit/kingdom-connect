import { daysUntil, type Language, type TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import Check from "lucide-react-native/icons/check";
import Lock from "lucide-react-native/icons/lock";
import SquarePlus from "lucide-react-native/icons/square-plus";
import { Pressable, Text, View } from "react-native";
import {
  BUSINESS_SIZES,
  DOCUMENT_KINDS,
  PROOF_KINDS,
  type BusinessApi,
  type BusinessForm,
  type BusinessStatus,
  type DocumentKind,
  type PosterFiles,
  type PosterForm,
  type PosterResult,
  type PosterStatus,
  type ProofKind,
  type RenewalForm,
  type RenewalResult,
  type RenewalStatus,
  type SubmitResult,
} from "../lib/business";
import { useLanguage } from "../lib/language";
import type { PickedFile } from "../lib/messages";
import type { Option } from "../lib/registration";
import { Button, ChoiceList, Field, Message } from "./form";
import { Section } from "./profile";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { PageHeader } from "./screens";
import { usePhone as usePhoneLayout } from "./sheet";
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

const proofLabel: Record<ProofKind, TextKey> = {
  directorship: "proofDirectorship",
  authorisation_letter: "proofAuthorisation",
};

const posterRefusalText: Record<Exclude<PosterResult, "ok">, TextKey> = {
  level2_required: "posterLevel2Required",
  already_pending: "posterAlreadyPending",
  already_approved: "posterAlreadyApproved",
  invalid_proof_kind: "posterInvalidProofKind",
  invalid_address: "posterInvalidAddress",
  contact_details: "posterHasContact",
  invalid_region: "posterInvalidRegion",
  documents_missing: "posterDocumentsMissing",
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

/** One level as a numbered step, as on the canvas (U05): what it unlocks and where it stands. */
/** A field in the canvas three-column form grid. */
function Cell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const phone = usePhoneLayout();
  return (
    <View className={wide || phone ? "w-full" : "w-[31.8%] min-w-[200px] flex-grow-0"}>
      {children}
    </View>
  );
}

/** The canvas document tile: a dashed box to choose a file, green with a tick once chosen. */
function DocTile({
  label,
  hint,
  file,
  onPress,
}: {
  label: string;
  hint?: string;
  file: string | null;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <Pressable
      role="button"
      aria-label={`${label}: ${file ?? t.chooseFile}`}
      onPress={onPress}
      className={`min-h-[64px] min-w-[200px] flex-1 basis-[30%] flex-row items-center gap-3 rounded-[14px] border px-3.5 py-3 ${file ? "border-good bg-good-soft" : "border-dashed border-line-2 bg-surface"}`}
    >
      {file ? (
        <Check size={18} color={palette.good} aria-hidden />
      ) : (
        <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-blue-soft">
          <SquarePlus size={18} color={palette.navy} aria-hidden />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text className="font-figtree-bold text-[14px] text-ink">{label}</Text>
        <Text numberOfLines={1} className="font-figtree text-[12px] text-ink-2">
          {file ?? hint ?? ""}
        </Text>
      </View>
      <Text className="font-figtree-semibold text-[13px] text-navy underline">
        {file ? t.replaceFile : t.chooseFile}
      </Text>
    </Pressable>
  );
}

/** One level as its own card, as on the canvas board Biz-Verify. */
function LevelCard({
  step,
  title,
  unlocks,
  status,
  state,
  children,
}: {
  step: number;
  title: string;
  unlocks: string;
  status: string;
  state: "done" | "active" | "waiting" | "locked";
  children?: React.ReactNode;
}) {
  const palette = usePalette();
  const chip = {
    done: "bg-good-soft text-good-text",
    active: "bg-surface-2 text-ink-2",
    waiting: "bg-warn-soft text-warn-text",
    locked: "bg-surface-2 text-ink-2",
  }[state].split(" ");
  return (
    <View
      className={`gap-4 rounded-card bg-surface px-[22px] py-5 ${state === "active" ? "border-2 border-navy" : "border border-line"}`}
    >
      <View className="flex-row items-center gap-3.5">
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${state === "done" ? "bg-good" : "border-2 border-line-2 bg-surface"}`}
        >
          {state === "done" ? (
            <Check size={18} color="#ffffff" aria-hidden />
          ) : state === "locked" ? (
            <Lock size={16} color={palette.ink2} aria-hidden />
          ) : (
            <Text className="font-figtree-bold text-[15px] text-ink">{step}</Text>
          )}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
            {title}
          </Text>
          <Text className="font-figtree text-[14px] text-ink-2">{unlocks}</Text>
        </View>
        <View className={`rounded-full px-2.5 py-1 ${chip[0]}`}>
          <Text className={`font-figtree-bold text-[12px] ${chip[1]}`}>{status}</Text>
        </View>
      </View>
      {children}
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
    <View className="gap-4 border-t border-line pt-4">
      <View className="flex-row flex-wrap gap-3">
        <Cell>
          <Field label={t.businessName} value={form.name} onChange={(v) => set("name", v)} />
        </Cell>
        <Cell>
          <ChoiceList
            label={t.businessSector}
            options={sectors}
            value={form.sectorId || undefined}
            onChange={(v) => set("sectorId", v)}
          />
        </Cell>
        <Cell>
          <ChoiceList
            label={t.businessSize}
            options={BUSINESS_SIZES.map((s) => ({ value: s, label: t[sizeLabel[s]] as string }))}
            value={form.size || undefined}
            onChange={(v) => set("size", v as BusinessForm["size"])}
          />
        </Cell>
        <Cell wide>
          <Field
            label={t.businessDescription}
            value={form.description}
            onChange={(v) => set("description", v)}
            multiline
          />
        </Cell>
        <Cell>
          <Field label={t.brelaNumber} value={form.brelaNo} onChange={(v) => set("brelaNo", v)} />
        </Cell>
        <Cell>
          <Field
            label={t.tinNumber}
            value={form.tin}
            onChange={(v) => set("tin", v)}
            keyboardType="number-pad"
          />
        </Cell>
        <Cell>
          <Field
            label={t.licenceNumber}
            value={form.licenceNo}
            onChange={(v) => set("licenceNo", v)}
          />
        </Cell>
        <Cell>
          <Field
            label={t.licenceExpiry}
            value={form.licenceExpiresOn}
            onChange={(v) => set("licenceExpiresOn", v)}
            hint={t.licenceExpiryHint}
          />
        </Cell>
      </View>
      <Text className="font-figtree-bold text-[14px] text-ink">{t.documentsHint}</Text>
      <View className="flex-row flex-wrap gap-3">
        {DOCUMENT_KINDS.map((kind) => (
          <DocTile
            key={kind}
            label={t[documentLabel[kind]] as string}
            file={files[kind]?.name ?? null}
            onPress={() => choose(kind)}
          />
        ))}
      </View>
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.businessCheckNote}</Text>
      <Message text={problem} />
      <View className="items-start">
        <Button label={t.businessSend} onPress={send} disabled={busy} />
      </View>
    </View>
  );
}

function PosterFormView({
  api,
  initial,
  language,
  onSent,
}: {
  api: BusinessApi;
  initial: PosterForm;
  language: Language;
  onSent: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<PosterForm>(initial);
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [files, setFiles] = useState<Partial<PosterFiles>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.regions(language).then(setRegions, () => undefined);
  }, [api, language]);

  useEffect(() => {
    if (!form.regionId) return setDistricts([]);
    api.districts(form.regionId, language).then(setDistricts, () => undefined);
  }, [api, form.regionId, language]);

  const set = <K extends keyof PosterForm>(key: K, value: PosterForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const choose = async (key: keyof PosterFiles) => {
    const picked = await api.pickFile().catch(() => null);
    if (picked) setFiles((f) => ({ ...f, [key]: picked }));
  };

  const send = async () => {
    const complete =
      form.proofKind &&
      form.address.trim() &&
      form.regionId &&
      form.districtId &&
      files.proof &&
      files.addressProof;
    if (!complete) return setProblem(t.posterIncomplete);
    setProblem(null);
    setBusy(true);
    const result = await api
      .submitPoster({ ...form, address: form.address.trim() }, files as PosterFiles)
      .catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") return onSent();
    setProblem(t[posterRefusalText[result]] as string);
  };

  return (
    <View className="gap-4 border-t border-line pt-4">
      <Text className="font-figtree text-[14px] text-ink-2">{t.posterIntro}</Text>
      <View className="flex-row flex-wrap gap-3">
        <Cell>
          <ChoiceList
            label={t.proofKind}
            options={PROOF_KINDS.map((k) => ({ value: k, label: t[proofLabel[k]] as string }))}
            value={form.proofKind || undefined}
            onChange={(v) => set("proofKind", v as ProofKind)}
          />
        </Cell>
        <Cell>
          <Field
            label={t.businessAddress}
            value={form.address}
            onChange={(v) => set("address", v)}
          />
        </Cell>
        <Cell>
          <ChoiceList
            label={t.region}
            options={regions}
            value={form.regionId || undefined}
            onChange={(v) => setForm((f) => ({ ...f, regionId: v, districtId: "" }))}
          />
        </Cell>
        <Cell>
          <ChoiceList
            label={t.district}
            options={districts}
            value={form.districtId || undefined}
            onChange={(v) => set("districtId", v)}
            disabled={!form.regionId}
          />
        </Cell>
      </View>
      <View className="flex-row flex-wrap gap-3">
        <DocTile
          label={t.docProof}
          file={files.proof?.name ?? null}
          onPress={() => choose("proof")}
        />
        <DocTile
          label={t.docAddressProof}
          hint={t.addressProofHint}
          file={files.addressProof?.name ?? null}
          onPress={() => choose("addressProof")}
        />
      </View>
      <Message text={problem} />
      <View className="items-start">
        <Button label={t.posterSend} onPress={send} disabled={busy} />
      </View>
    </View>
  );
}

const emptyPoster: PosterForm = { proofKind: "", address: "", regionId: "", districtId: "" };

const renewalRefusalText: Record<Exclude<RenewalResult, "ok">, TextKey> = {
  not_verified: "renewNotVerified",
  already_pending: "renewAlreadyPending",
  not_due: "renewNotDue",
  invalid_number: "businessInvalidNumber",
  licence_expired: "businessLicenceExpired",
  invalid_date: "renewInvalidDate",
  documents_missing: "renewDocumentMissing",
  file_too_large: "businessFileTooLarge",
  file_wrong_type: "businessFileWrongType",
  failed: "businessSendFailed",
};

/** S41: the new licence, sent within 30 days of the end date or after it (B04). */
function RenewalFormView({
  api,
  initial,
  intro,
  onSent,
}: {
  api: BusinessApi;
  initial: RenewalForm;
  intro: string;
  onSent: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<RenewalForm>(initial);
  const [licence, setLicence] = useState<PickedFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    const picked = await api.pickFile().catch(() => null);
    if (picked) setLicence(picked);
  };

  const send = async () => {
    const date = form.licenceExpiresOn.trim();
    if (!form.licenceNo.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !licence)
      return setProblem(t.renewIncomplete);
    setProblem(null);
    setBusy(true);
    const result = await api
      .submitRenewal({ licenceNo: form.licenceNo.trim(), licenceExpiresOn: date }, licence)
      .catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") return onSent();
    setProblem(t[renewalRefusalText[result]] as string);
  };

  return (
    <Section title={t.renewTitle}>
      <Text className="font-figtree text-sm text-ink-2">{intro}</Text>
      <Field
        label={t.newLicenceNumber}
        value={form.licenceNo}
        onChange={(v) => setForm((f) => ({ ...f, licenceNo: v }))}
      />
      <Field
        label={t.newLicenceExpiry}
        value={form.licenceExpiresOn}
        onChange={(v) => setForm((f) => ({ ...f, licenceExpiresOn: v }))}
        hint={t.licenceExpiryHint}
      />
      <Button
        secondary
        label={`${t.docNewLicence}: ${licence?.name ?? t.chooseFile}`}
        onPress={choose}
      />
      <Message text={problem} />
      <Button label={t.renewSend} onPress={send} disabled={busy} />
    </Section>
  );
}

/** S40 and S41: each level's status, the Level 2 (B01) and Level 3 (B02) documents, and licence renewal (B04). */
export function BusinessScreen({ api }: { api: BusinessApi }) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const phone = usePhoneLayout();
  const [status, setStatus] = useState<BusinessStatus | null | undefined>(undefined);
  const [poster, setPoster] = useState<PosterStatus | null>(null);
  const [renewal, setRenewal] = useState<RenewalStatus | null>(null);
  const [renewalSent, setRenewalSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [posterSent, setPosterSent] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([api.load(), api.loadPoster(), api.loadRenewal()]).then(
      ([loaded, loadedPoster, loadedRenewal]) => {
        if (!live) return;
        setPoster(loadedPoster);
        setRenewal(loadedRenewal);
        setStatus(loaded);
      },
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
  const level2Approved = approved && status?.businessStatus === "approved";
  const posterRequest = poster?.requestStatus ?? null;
  const posterPending = posterRequest === "pending" || posterSent;
  const posterApproved = posterRequest === "approved";
  const posterText =
    expired && posterApproved
      ? t.statusExpired
      : !level2Approved
        ? t.statusLocked
        : posterPending
          ? t.statusPending
          : posterApproved
            ? t.statusApproved
            : posterRequest === "rejected"
              ? t.statusRejected
              : t.statusNotStarted;
  const renewalRequest = renewal?.requestStatus ?? null;
  const renewalDue =
    approved &&
    !!status &&
    (expired || (status.businessStatus === "approved" && daysUntil(status.licenceExpiresOn) <= 30));
  const statusText = expired
    ? t.statusExpired
    : pending
      ? t.statusPending
      : approved
        ? t.statusApproved
        : request === "rejected"
          ? t.statusRejected
          : t.statusNotStarted;

  const level2State = level2Approved
    ? "done"
    : pending
      ? "waiting"
      : approved
        ? "waiting"
        : "active";
  const level3State = !level2Approved
    ? "locked"
    : posterApproved && !expired
      ? "done"
      : posterPending
        ? "waiting"
        : "active";

  const level2Form =
    !pending && !approved ? (
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
    ) : null;
  const level3Form =
    level2Approved && !posterPending && !posterApproved ? (
      <PosterFormView
        api={api}
        language={language}
        initial={
          poster
            ? {
                proofKind: poster.proofKind,
                address: poster.address,
                regionId: poster.regionId,
                districtId: poster.districtId,
              }
            : emptyPoster
        }
        onSent={() => setPosterSent(true)}
      />
    ) : null;

  const side = (
    <View className={phone ? "gap-4" : "w-[448px] gap-4"}>
      <Section title={t.levelsExplainTitle}>
        <Text className="font-figtree text-[14px] leading-[21px] text-ink">
          {t.levelsExplainStatus}
        </Text>
        <Text className="font-figtree text-[14px] leading-[21px] text-ink">
          {t.levelsExplainPending}
        </Text>
      </Section>
      <View className="flex-row items-start gap-2 px-1">
        <Lock size={14} color={palette.ink2} aria-hidden />
        <Text className="flex-1 font-figtree text-[13px] leading-5 text-ink-2">
          {t.levelsExplainPrivate}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="gap-5">
      <PageHeader
        back={{ label: t.backToDashboard, href: "/" }}
        title={t.businessTitle}
        subtitle={status?.name ? t.businessSubtitleNamed(status.name) : t.businessSubtitle}
      />
      <View className={phone ? "gap-4" : "flex-row items-start gap-4"}>
        <View className="min-w-0 flex-1 gap-4">
          <LevelCard
            step={1}
            title={t.levelMemberCard}
            unlocks={t.levelMemberUnlocks}
            status={t.statusApproved}
            state="done"
          />
          <LevelCard
            step={2}
            title={t.levelBusinessCard}
            unlocks={t.levelBusinessUnlocks}
            status={statusText}
            state={level2State}
          >
            {sent ? <Message tone="info" text={t.businessSent} /> : null}
            {request === "pending" && !sent ? (
              <Message tone="info" text={t.businessPendingNote} />
            ) : null}
            {request === "rejected" ? (
              <Message text={t.businessRejectedReason(status?.reason ?? "")} />
            ) : null}
            {approved && !expired && status ? (
              <Message tone="info" text={t.businessApprovedNote(status.licenceExpiresOn)} />
            ) : null}
            {level2Form}
          </LevelCard>
          <LevelCard
            step={3}
            title={t.levelPosterCard}
            unlocks={t.levelPosterUnlocks}
            status={posterText}
            state={level3State}
          >
            {!level2Approved ? (
              <View className="gap-2">
                {[t.posterNeedDirector, t.posterNeedAddress, t.posterNeedProof].map((line) => (
                  <View key={line} className="flex-row gap-2">
                    <Text className="font-figtree text-[14px] text-ink">•</Text>
                    <Text className="flex-1 font-figtree text-[14px] text-ink">{line}</Text>
                  </View>
                ))}
                <Text className="font-figtree text-[13px] text-ink-2">{t.posterLocked}</Text>
              </View>
            ) : null}
            {posterSent ? <Message tone="info" text={t.posterSent} /> : null}
            {level2Approved && posterRequest === "pending" && !posterSent ? (
              <Message tone="info" text={t.posterPendingNote} />
            ) : null}
            {level2Approved && posterRequest === "rejected" && !posterSent ? (
              <Message text={t.posterRejectedReason(poster?.reason ?? "")} />
            ) : null}
            {level2Approved && posterApproved ? (
              <Message tone="info" text={t.posterApprovedNote} />
            ) : null}
            {level3Form}
          </LevelCard>
          {renewalSent ? <Message tone="info" text={t.renewSent} /> : null}
          {renewalDue && renewalRequest === "pending" && !renewalSent ? (
            <Message tone="info" text={t.renewPendingNote} />
          ) : null}
          {renewalDue && renewalRequest === "rejected" && !renewalSent ? (
            <Message text={t.renewRejectedReason(renewal?.reason ?? "")} />
          ) : null}
          {renewalDue && status && renewalRequest !== "pending" && !renewalSent ? (
            <RenewalFormView
              api={api}
              intro={
                expired
                  ? t.renewExpiredIntro(status.level ?? 2)
                  : t.renewDueIntro(status.licenceExpiresOn)
              }
              initial={
                renewalRequest === "rejected" && renewal
                  ? { licenceNo: renewal.licenceNo, licenceExpiresOn: renewal.licenceExpiresOn }
                  : { licenceNo: "", licenceExpiresOn: "" }
              }
              onSent={() => setRenewalSent(true)}
            />
          ) : null}
          <LinkButton
            href="/ideas/investor"
            label={t.investApplyTitle}
            className="flex-row items-center gap-3.5 rounded-card border border-dashed border-line-2 bg-surface-2 px-5 py-4"
          >
            <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-surface">
              <Lock size={16} color={palette.ink2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-figtree-bold text-[16px] text-ink">{t.investApplyTitle}</Text>
              <Text className="font-figtree text-[13px] text-ink-2">{t.investApplyHint}</Text>
            </View>
          </LinkButton>
        </View>
        {side}
      </View>
    </View>
  );
}
