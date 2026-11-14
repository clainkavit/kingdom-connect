import "../global.css";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond";
import { Slot } from "expo-router";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";
import { LanguageProvider } from "../src/lib/language";
import { LowDataProvider } from "../src/lib/low-data";
import { startMonitoring } from "../src/lib/monitoring";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    CormorantGaramond_600SemiBold,
  });
  useEffect(startMonitoring, []);
  if (!fontsLoaded && Platform.OS !== "web") return null;
  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-bg">
        <StatusBar style="auto" />
        <AuthProvider>
          <LanguageProvider>
            <LowDataProvider>
              <Slot />
            </LowDataProvider>
          </LanguageProvider>
        </AuthProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
