import type { NotificationCategory } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { EmailSwitches } from "../../../src/components/notifications";
import { ScreenTitle } from "../../../src/components/screens";
import { ErrorState } from "../../../src/components/states";
import { useLanguage } from "../../../src/lib/language";
import { fetchEmailSwitches, setEmailSwitch } from "../../../src/lib/notifications";

export default function NotificationSettingsScreen() {
  const { t } = useLanguage();
  const [values, setValues] = useState<Partial<Record<NotificationCategory, boolean>>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchEmailSwitches()
      .then(setValues)
      .catch(() => setFailed(true));
  }, []);

  const change = (category: NotificationCategory, email: boolean) => {
    const before = values;
    setValues({ ...values, [category]: email });
    setEmailSwitch(category, email)
      .then(() => setFailed(false))
      .catch(() => {
        setValues(before);
        setFailed(true);
      });
  };

  return (
    <>
      <ScreenTitle>{t.notificationSettingsTitle}</ScreenTitle>
      {failed ? <ErrorState message={t.network} onRetry={() => setFailed(false)} /> : null}
      <EmailSwitches values={values} onChange={change} />
    </>
  );
}
