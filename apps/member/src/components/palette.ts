import { colors } from "@kingdom-connect/shared";
import { useColorScheme } from "react-native";

export function usePalette() {
  return colors[useColorScheme() === "dark" ? "dark" : "light"];
}
