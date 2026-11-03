import type { TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { ConnectionsApi } from "../lib/connections";
import { useLanguage } from "../lib/language";
import {
  MAX_REPORT_NOTE,
  MAX_REPORTS_PER_DAY,
  MAX_SCREENSHOT_BYTES,
  REPORT_REASONS,
  screenshotProblem,
  type MyReport,
  type ReportReason,
  type ReportResult,
  type ReportsApi,
  type ReportTarget,
  type Screenshot,
} from "../lib/reports";
import { Button, ChoiceList, ConfirmButton, Field, Message } from "./form";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const reasonLabel: Record<ReportReason, TextKey> = {
  asked_for_money: "reasonAskedForMoney",
  fake_job_or_business: "reasonFakeJobOrBusiness",
  harassment: "reasonHarassment",
  impersonation: "reasonImpersonation",
  spam: "reasonSpam",
  other: "reasonOther",
};

const outcomeLabel: Record<MyReport["outcome"], TextKey> = {
  open: "outcomeOpen",
  action_taken: "outcomeActionTaken",
  no_action: "outcomeNoAction",
};

/** S42: report a profile or a thread. The member behind it can be blocked from the success screen. */
export function ReportForm({
  api,
  target,
  memberId,
  connections,
}: {
  api: ReportsApi;
  target: ReportTarget;
  memberId: string | null;
  connections: ConnectionsApi;
}) {
  const { t } = useLanguage();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [blocked, setBlocked] = useState(false);

  if (result && "reference" in result)
    return (
      <View className="gap-4">
        <ScreenTitle>{t.reportFormTitle}</ScreenTitle>
        <Message tone="info" text={result.kind === "sent" ? t.reportSent : t.alreadyReported} />
        <Text className="font-figtree-bold text-base text-ink">
          {t.reportReference(result.reference)}
        </Text>
        {memberId && !blocked ? (
          <ConfirmButton
            label={t.blockAfterReport}
            question={t.confirmBlockAfterReport}
            confirmLabel={t.confirmBlockButton}
            onConfirm={async () => {
              if (await connections.block(memberId).catch(() => false)) setBlocked(true);
              else setProblem(t.actionFailed);
            }}
          />
        ) : null}
        {blocked ? <Message tone="info" text={t.memberBlocked} /> : null}
        <Message text={problem} />
      </View>
    );

  const screenshotMessage = (problem: "screenshot_too_large" | "screenshot_wrong_type") =>
    problem === "screenshot_too_large"
      ? t.screenshotTooLarge(MAX_SCREENSHOT_BYTES / 1024 / 1024)
      : t.screenshotWrongType;
  const noteTooLong = [...note.trim()].length > MAX_REPORT_NOTE;

  const choose = async () => {
    setProblem(null);
    const picked = await api.pickScreenshot().catch(() => null);
    if (!picked) return;
    const wrong = screenshotProblem(picked);
    if (wrong) return setProblem(screenshotMessage(wrong));
    setShot(picked);
  };

  const send = async () => {
    if (!reason) return setProblem(t.chooseReason);
    setProblem(null);
    setBusy(true);
    const sent = await api
      .send(target, reason, note, shot)
      .catch(() => ({ kind: "failed" as const }));
    setBusy(false);
    if ("reference" in sent) return setResult(sent);
    setProblem(
      sent.kind === "failed"
        ? t.reportFailed
        : sent.kind === "daily_limit"
          ? t.reportDailyLimit(MAX_REPORTS_PER_DAY)
          : screenshotMessage(sent.kind),
    );
  };

  return (
    <View className="gap-4">
      <ScreenTitle>{t.reportFormTitle}</ScreenTitle>
      <Section title={t.reportReasonLabel}>
        <ChoiceList
          label={t.reportReasonLabel}
          options={REPORT_REASONS.map((r) => ({ value: r, label: t[reasonLabel[r]] as string }))}
          value={reason ?? undefined}
          onChange={(value) => setReason(value as ReportReason)}
        />
        <Field
          label={t.reportNoteLabel}
          value={note}
          onChange={setNote}
          multiline
          hint={t.reportNoteHint(MAX_REPORT_NOTE)}
          problem={
            [...note.trim()].length > MAX_REPORT_NOTE ? t.tooLongField(MAX_REPORT_NOTE) : null
          }
        />
        {shot ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-figtree text-sm text-ink">{t.screenshotAdded}</Text>
            <Button secondary label={t.removeScreenshot} onPress={() => setShot(null)} />
          </View>
        ) : (
          <Button secondary label={t.addScreenshot} onPress={choose} />
        )}
      </Section>
      <Message text={problem} />
      <Button label={t.sendReport} onPress={send} disabled={busy || noteTooLong} />
    </View>
  );
}

/** S43: each report with its reference and outcome only. */
export function MyReports({ api }: { api: ReportsApi }) {
  const { t, language } = useLanguage();
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    api.mine().then(
      (loaded) => live && setReports(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, reloads]);

  if (failed)
    return (
      <ErrorState
        message={t.reportsLoadFailed}
        onRetry={() => {
          setFailed(false);
          setReloads((r) => r + 1);
        }}
      />
    );
  if (!reports) return <LoadingRows />;

  return (
    <View className="gap-4">
      <ScreenTitle>{t.myReportsTitle}</ScreenTitle>
      {reports.length === 0 ? (
        <EmptyState title={t.noReports} message={t.noReportsMessage} />
      ) : (
        <View className="rounded-card border border-line bg-surface">
          {reports.map((r, i) => (
            <View
              key={r.reference}
              className={`flex-row flex-wrap items-center justify-between gap-2 px-4 py-3 ${i < reports.length - 1 ? "border-b border-line" : ""}`}
            >
              <View className="gap-0.5">
                <Text className="font-figtree-bold text-[15px] text-ink">{r.reference}</Text>
                <Text className="font-figtree text-[13px] text-ink-2">
                  {new Date(r.reportedAt).toLocaleDateString(language === "sw" ? "sw-TZ" : "en-GB")}
                </Text>
              </View>
              <Text className="font-figtree-semibold text-sm text-ink">
                {t[outcomeLabel[r.outcome]] as string}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
