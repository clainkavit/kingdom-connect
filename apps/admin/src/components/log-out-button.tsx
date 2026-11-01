"use client";

import { useAuth } from "@/lib/auth";
import { strings } from "@/strings";

export function LogOutButton() {
  const { signOut } = useAuth();
  return (
    <button type="button" onClick={signOut} className="mt-4 text-sm font-medium text-primary">
      {strings.logOut}
    </button>
  );
}
