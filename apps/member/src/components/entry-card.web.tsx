import { Link } from "expo-router";
import { Image } from "react-native";
import logo from "../../assets/brand/logo.jpg";
import { useLanguage } from "../lib/language";
import { LanguageSwitch } from "./language-switch";
import "./landing.css";

export function EntryCard({
  title,
  subtitle,
  children,
  footer,
  back,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  back?: { label: string; onPress: () => void };
}) {
  const { t, platformName } = useLanguage();

  return (
    <div className="kc-welcome kc-entry">
      <header className="kc-welcome-header">
        <Link href="/welcome" aria-label={platformName ? t.welcomeTitle(platformName) : t.back}>
          <Image source={logo} aria-hidden style={{ width: 52, height: 48, borderRadius: 12 }} />
        </Link>
        <LanguageSwitch pill />
      </header>
      <main className="kc-entry-main">
        {back ? (
          <button className="kc-entry-back" type="button" onClick={back.onPress}>
            {back.label}
          </button>
        ) : null}
        <h1>{title}</h1>
        {subtitle ? <p className="kc-welcome-description">{subtitle}</p> : null}
        <div className="kc-entry-form">{children}</div>
        {footer ? <div className="kc-entry-account">{footer}</div> : null}
      </main>
      <footer className="kc-welcome-footer">
        <Link href="/terms">{t.legalTerms}</Link>
        <Link href="/privacy">{t.legalPrivacy}</Link>
      </footer>
    </div>
  );
}
