import { formatDate } from "@kingdom-connect/shared";
import { createElement, useState } from "react";
import { Platform, Text, View } from "react-native";
import type { IdeaAccessApi } from "../lib/idea-access";
import {
  IDEA_FILE_TYPES,
  IDEA_FILES_MAX_BYTES,
  type IdeaDetails,
  type IdeaDetailsApi,
  type IdeaFile,
} from "../lib/idea-details";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Button, ConfirmButton, Message } from "./form";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/** The viewer's name and the date, faint and repeated over the details, so a screenshot carries them. */
function Watermark({ line }: { line: string }) {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="absolute inset-0 overflow-hidden"
      style={{ zIndex: 1 }}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <Text
          key={i}
          className="font-figtree-bold text-[18px] text-ink"
          style={{
            position: "absolute",
            top: i * 110 + 20,
            left: i % 2 === 0 ? -20 : 60,
            opacity: 0.07,
            transform: [{ rotate: "-24deg" }],
          }}
        >
          {`${line}   ${line}`}
        </Text>
      ))}
    </View>
  );
}

/** A stamped PDF shown inside the platform, without the browser's download toolbar. */
function FileViewer({ src, title }: { src: string; title: string }) {
  const { t } = useLanguage();
  if (Platform.OS !== "web") return <Message tone="info" text={t.ideaFilesOnWeb} />;
  return createElement("iframe", {
    src: `${src}#toolbar=0&navpanes=0`,
    title,
    style: { width: "100%", height: 560, border: 0, borderRadius: 12, background: "#fff" },
  });
}

function FileRow({
  file,
  api,
  isOwner,
  onRemoved,
}: {
  file: IdeaFile;
  api: IdeaDetailsApi;
  isOwner: boolean;
  onRemoved: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-3">
      <Text className="font-figtree-semibold text-[15px] text-ink">{file.fileName}</Text>
      <Text className="font-figtree text-[13px] text-ink-2">
        {t.ideaFileSize(megabytes(file.size))}
      </Text>
      <Message text={problem} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          secondary
          label={open ? t.ideaFileClose : t.ideaFileOpen}
          disabled={busy}
          onPress={async () => {
            if (open) return setOpen(null);
            setBusy(true);
            setProblem(null);
            const url = await api.openFile(file.id).catch(() => null);
            setBusy(false);
            if (url) setOpen(url);
            else setProblem(t.ideaFileFailed);
          }}
        />
        {isOwner ? (
          <ConfirmButton
            label={t.ideaFileRemove}
            question={t.ideaFileRemoveConfirm}
            confirmLabel={t.ideaFileRemove}
            onConfirm={async () => {
              const removed = await api.removeFile(file.id).catch(() => false);
              if (removed) onRemoved();
              else setProblem(t.ideaFileFailed);
            }}
          />
        ) : null}
      </View>
      {open ? <FileViewer src={open} title={file.fileName} /> : null}
    </View>
  );
}

function Files({
  api,
  ideaId,
  isOwner,
}: {
  api: IdeaDetailsApi;
  ideaId: string;
  isOwner: boolean;
}) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.files(ideaId), attempt);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => setAttempt((a) => a + 1);

  const add = async () => {
    setProblem(null);
    const picked = await api.pickFile().catch(() => null);
    if (!picked) return;
    const used = loaded.state === "ready" ? loaded.value.reduce((n, f) => n + f.size, 0) : 0;
    if (!IDEA_FILE_TYPES.includes(picked.mime)) return setProblem(t.ideaFileWrongType);
    if (used + picked.size > IDEA_FILES_MAX_BYTES) return setProblem(t.ideaFileTooLarge);
    setBusy(true);
    const result = await api.addFile(ideaId, picked).catch(() => "error");
    setBusy(false);
    if (result === "ok") reload();
    else setProblem(result === "too_large" ? t.ideaFileTooLarge : t.ideaFileFailed);
  };

  return (
    <Section title={t.ideaFilesHeading}>
      {loaded.state === "failed" ? (
        <ErrorState message={t.ideaFileFailed} onRetry={reload} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={1} />
      ) : loaded.value.length === 0 ? (
        <Text className="font-figtree text-sm text-ink-2">{t.ideaFilesEmpty}</Text>
      ) : (
        loaded.value.map((file) => (
          <FileRow key={file.id} file={file} api={api} isOwner={isOwner} onRemoved={reload} />
        ))
      )}
      <Message text={problem} />
      {isOwner ? (
        <>
          <Text className="font-figtree text-[13px] text-ink-2">{t.ideaFilesHint}</Text>
          <Button secondary label={t.ideaFileAdd} disabled={busy} onPress={add} />
        </>
      ) : null}
    </Section>
  );
}

function Body({ details }: { details: IdeaDetails }) {
  const { t } = useLanguage();
  const parts: [string, string][] = [
    [t.ideaDescriptionLabel, details.description],
    [t.ideaModelLabel, details.businessModel],
    [t.ideaMarketLabel, details.market],
    [t.ideaFinancialsLabel, details.financials],
    [t.ideaTeamLabel, details.team],
  ];
  return (
    <View className="gap-3">
      {parts.map(([label, text]) =>
        text ? (
          <View key={label} className="gap-1">
            <Text className="font-figtree-bold text-[15px] text-ink">
              {label.replace(/\s*\(.*\)$/, "")}
            </Text>
            <Text className="font-figtree text-[15px] leading-6 text-ink">{text}</Text>
          </View>
        ) : null,
      )}
    </View>
  );
}

/** S26: the confidential details and files, stamped with the viewer's name and date, every open logged (I05). */
export function IdeaDetailsScreen({
  api,
  access,
  ideaId,
}: {
  api: IdeaDetailsApi;
  access: IdeaAccessApi;
  ideaId: string;
}) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(async () => {
    const details = await api.open(ideaId);
    if (details) return { details, revoked: false };
    const mine = await access.myRequest(ideaId).catch(() => null);
    return { details: null, revoked: mine?.status === "revoked" };
  }, attempt);

  if (loaded.state === "failed") {
    return <ErrorState message={t.ideaFileFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  const { details, revoked } = loaded.value;
  if (!details) {
    return (
      <EmptyState
        title={revoked ? t.interestRevoked : t.ideaDetailsClosed}
        message=""
        action={{ label: t.ideaBackToIdea, href: `/ideas/${ideaId}` }}
      />
    );
  }
  const line = `${details.viewerName} · ${formatDate(new Date(details.openedAt), language)} · ${t.ideaConfidential}`;

  return (
    <View className="gap-4">
      <ScreenTitle>{details.title}</ScreenTitle>
      <Message tone="info" text={t.ideaOpenedBy(line)} />
      <View className="relative overflow-hidden rounded-card border border-line bg-surface p-4">
        <Body details={details} />
        <Watermark line={line} />
      </View>
      <Files api={api} ideaId={ideaId} isOwner={details.isOwner} />
    </View>
  );
}
