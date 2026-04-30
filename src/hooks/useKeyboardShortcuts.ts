import { useEffect } from "react";
import { openSettings } from "@/components/modals/SettingsModal";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("open-new-item"));
      }
      if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("open-inbox"));
      }
      if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openSettings();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
