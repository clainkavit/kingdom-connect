import { Redirect } from "expo-router";

/** Sends /registration links to Verify your identity in the profile (R28). */
export default function RegistrationRedirect() {
  return <Redirect href="/profile/verify" />;
}
