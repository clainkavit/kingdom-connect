import "../global.css";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";
import { LanguageProvider } from "../src/lib/language";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  if (!fontsLoaded) return null;
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
