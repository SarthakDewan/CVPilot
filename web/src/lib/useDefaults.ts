import { useEffect, useState } from "react";
import { api } from "./api";
import type { Profile } from "./types";

/** Role/location suggestions from the user's saved profile (empty strings if none). */
export function useProfileDefaults() {
  const [d, setD] = useState({ role: "", location: "" });
  useEffect(() => {
    api<{ profile: Profile }>("/profile")
      .then((r) => setD({ role: r.profile.preferredRoles?.[0] ?? "", location: r.profile.location ?? "" }))
      .catch(() => {});
  }, []);
  return d;
}
