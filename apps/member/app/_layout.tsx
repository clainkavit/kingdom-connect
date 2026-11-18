import "../global.css";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";
import { LanguageProvider } from "../src/lib/language";
import { startMonitoring } from "../src/lib/monitoring";

/** Figtree and Cormorant Garamond cut down to Latin letters and punctuation (assets/fonts, SIL OFL). */
const fonts = {
  Figtree_400Regular: require("../assets/fonts/Figtree_400Regular.ttf"),
  Figtree_500Medium: require("../assets/fonts/Figtree_500Medium.ttf"),
  Figtree_600SemiBold: require("../assets/fonts/Figtree_600SemiBold.ttf"),
  Figtree_700Bold: require("../assets/fonts/Figtree_700Bold.ttf"),
  Figtree_800ExtraBold: require("../assets/fonts/Figtree_800ExtraBold.ttf"),
  CormorantGaramond_600SemiBold: require("../assets/fonts/CormorantGaramond_600SemiBold.ttf"),
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fonts);
  useEffect(startMonitoring, []);
  if (!fontsLoaded && Platform.OS !== "web") return null;
  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-bg">
        <StatusBar style="auto" />
        <AuthProvider>
          <LanguageProvider>
            <Slot />
          </LanguageProvider>
        </AuthProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
