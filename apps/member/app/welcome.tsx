import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Intro, useIntroState } from "../src/components/intro";
import { LandingScreen } from "../src/components/landing";
import { Guard } from "../src/lib/auth";

/**
 * S01 Landing at /welcome, where the root sends signed-out visitors. On the first open of this
 * device the intro plays over it; the landing page loads underneath and comes in as the intro lifts.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const [introState, markSeen] = useIntroState();
  const [introOn, setIntroOn] = useState(true);
  const [play, setPlay] = useState(false);
  return (
    <Guard route="login">
      <View className="flex-1">
        <LandingScreen
          play={play}
          hidden={introOn}
          onSignUp={() => router.push("/sign-up")}
          onLogIn={() => router.push("/login")}
          onLegal={(kind) => router.push(`/legal/${kind}`)}
        />
        {introOn ? (
          <Intro
            state={introState}
            onLift={() => setPlay(true)}
            onDone={() => {
              markSeen();
              setIntroOn(false);
            }}
          />
        ) : null}
      </View>
    </Guard>
  );
}
