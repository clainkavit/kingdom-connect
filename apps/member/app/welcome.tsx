import { Landing } from "../src/components/landing";
import { Guard } from "../src/lib/auth";

export default function WelcomeScreen() {
  return (
    <Guard route="login">
      <Landing />
    </Guard>
  );
}
