import {
  fillLegalText,
  formatDate,
  isDraftVersion,
  legalBlocks,
  type LegalKind,
} from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image } from "react-native";
import logo from "../../assets/brand/logo.jpg";
import { useLanguage } from "../lib/language";
import type { PublicLegalText } from "../lib/legal";
import { useLoad } from "./events";
import { legalTitleKeys } from "./legal";
import "./landing.css";
import "./legal-page.css";

type Reader = (kind: LegalKind) => Promise<{ text: PublicLegalText | null; entityName: string }>;

export function LegalPage({ kind, read }: { kind: LegalKind; read: Reader }) {
  const { t, language, platformName } = useLanguage();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState<"en" | "sw" | null>(null);
  const loaded = useLoad(() => read(kind), attempt);
  const lang = shown ?? language;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/welcome"));
  const text = loaded.state === "ready" ? loaded.value.text : null;

  return (
    <div className="kc-welcome kc-legal">
      <header className="kc-welcome-header">
        <Image
          source={logo}
          accessibilityLabel={platformName || undefined}
          style={{ width: 52, height: 48, borderRadius: 12 }}
        />
        <div className="kc-welcome-languages" role="group" aria-label={t.legalLanguage}>
          {(
            [
              ["en", t.legalEnglish],
              ["sw", t.legalKiswahili],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => setShown(code)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <main className="kc-legal-main">
        <button type="button" className="kc-entry-back" onClick={back}>
          {t.back}
        </button>
        <h1>{t[legalTitleKeys[kind]] as string}</h1>
        {loaded.state === "loading" ? (
          <div role="status">
            <span className="sr-only">{t.loading}</span>
            <div className="kc-legal-skeleton" aria-hidden="true">
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
          </div>
        ) : loaded.state === "ready" && text ? (
          <>
            <p className="kc-legal-version">
              {(isDraftVersion(text.version, text.approved_at)
                ? t.legalDraftChip
                : t.legalVersionChip)(
                text.version,
                formatDate(new Date(text.effective_at), language),
              )}
            </p>
            <article lang={lang} className="kc-legal-document">
              <DocumentBody
                body={lang === "sw" ? text.body_sw : text.body_en}
                platformName={platformName}
                entityName={loaded.value.entityName || platformName}
              />
            </article>
          </>
        ) : (
          <div className="kc-legal-error">
            <p role="alert">{t.legalLoadFailed}</p>
            <button
              type="button"
              className="kc-entry-back"
              onClick={() => setAttempt((a) => a + 1)}
            >
              {t.tryAgain}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function DocumentBody({
  body,
  platformName,
  entityName,
}: {
  body: string;
  platformName: string;
  entityName: string;
}) {
  const blocks = legalBlocks(
    fillLegalText(body.replace(/^\s*#\s[^\n]*\n+/, ""), {
      entity_name: entityName,
      platform_name: platformName,
    }),
  );
  const content: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.kind === "bullet") {
      const start = i;
      const items = [<li key={i}>{block.text}</li>];
      while (blocks[i + 1]?.kind === "bullet") {
        i += 1;
        items.push(<li key={i}>{blocks[i].text}</li>);
      }
      content.push(<ul key={start}>{items}</ul>);
    } else if (block.kind === "heading") {
      content.push(<h2 key={i}>{block.text}</h2>);
    } else {
      content.push(<p key={i}>{block.text}</p>);
    }
  }
  return content;
}
