"use client";

import { useEffect, useState } from "react";

const PHONE = "(max-width: 880px)";

/** True on a phone-width screen, where the admin console shows its phone layout. */
export function usePhoneWidth(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
