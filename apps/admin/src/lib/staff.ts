import { createStaffClient } from "@kingdom-connect/shared";
import { anonKey, url } from "./supabase";

export const staffClient = createStaffClient({ url, anonKey });
