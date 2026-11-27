import { Link } from "expo-router";
import { languages } from "@kingdom-connect/shared";
import { Image } from "react-native";
import hands from "../../assets/brand/joined-hands.jpg";
import logo from "../../assets/brand/logo.jpg";
import { useLanguage } from "../lib/language";
import "./landing.css";

export function Landing() {
  const { language, t, platformName, setLanguage } = useLanguage();

  return (
    <div className="kc-welcome">
      <header className="kc-welcome-header">
        <Image
          source={logo}
          accessibilityLabel={platformName || undefined}
          style={{ width: 52, height: 48, borderRadius: 12 }}
        />
        <div className="kc-welcome-languages" role="group" aria-label={t.language}>
          {languages.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-label={name}
              aria-pressed={language === code}
              onClick={() => setLanguage(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <main className="kc-welcome-main">
        <div className="kc-welcome-copy">
          <p className="kc-welcome-tagline">{t.authTagline}</p>
          <h1>{t.landingTitle}</h1>
          <p className="kc-welcome-description">{t.landingBody}</p>
          <div className="kc-welcome-actions">
            <Link href="/sign-up">{t.createAccount}</Link>
            <Link href="/login">{t.logIn}</Link>
          </div>
        </div>
        <div className="kc-welcome-photo" aria-hidden="true">
          <Image source={hands} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
        </div>
      </main>
      <footer className="kc-welcome-footer">
        <Link href="/terms">{t.legalTerms}</Link>
        <Link href="/privacy">{t.legalPrivacy}</Link>
      </footer>
    </div>
  );
}
