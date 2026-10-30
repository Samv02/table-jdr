import { useEffect, useState } from "react";

export const PINNED_FEED_EVENT = "dice:pinned";
export const pinnedFeedKey = (userId: string) => `table:feed-pinned:${userId}`;

export function usePinnedFeed(userId: string | null) {
  const [preference, setPreference] = useState({ userId, pinned: false });
  useEffect(() => {
    const read = () => {
      let pinned = false;
      try {
        pinned = !!userId && localStorage.getItem(pinnedFeedKey(userId)) === "true";
      } catch {
        /* Storage may be unavailable. */
      }
      setPreference({ userId, pinned });
    };
    read();
    window.addEventListener(PINNED_FEED_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PINNED_FEED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [userId]);
  const pinned = preference.userId === userId && preference.pinned;
  const setPinned = (value: boolean) => {
    if (!userId) return;
    try {
      localStorage.setItem(pinnedFeedKey(userId), String(value));
    } catch {
      /* Keep the local choice functional. */
    }
    window.dispatchEvent(new Event(PINNED_FEED_EVENT));
    setPreference({ userId, pinned: value });
  };
  return { pinned, setPinned };
}
