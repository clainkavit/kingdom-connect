import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const LOW_DATA_KEY = "kc.lowData.v1";

export type LowDataState = { lowData: boolean; setLowData: (on: boolean) => void };

const LowDataContext = createContext<LowDataState>({ lowData: false, setLowData: () => {} });

/** Low-data mode (PRD section 15, Data usage): photos are not downloaded on this device. */
export const useLowData = () => useContext(LowDataContext);

/** Kept on the device, not on the account: the choice is about this phone's data plan. */
export function LowDataProvider({ children }: { children: React.ReactNode }) {
  const [lowData, setState] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(LOW_DATA_KEY)
      .then((saved) => setState(saved === "1"))
      .catch(() => undefined);
  }, []);
  const setLowData = useCallback((on: boolean) => {
    setState(on);
    AsyncStorage.setItem(LOW_DATA_KEY, on ? "1" : "0").catch(() => undefined);
  }, []);
  return (
    <LowDataContext.Provider value={{ lowData, setLowData }}>{children}</LowDataContext.Provider>
  );
}
