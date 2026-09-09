"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System theme", icon: Laptop },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

export function ThemeSwitch() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readTheme,
    () => "system",
  );

  function cycleTheme() {
    const index = themes.findIndex((item) => item.value === theme);
    const next = themes[(index + 1) % themes.length]?.value ?? "system";
    if (next === "system") {
      delete document.documentElement.dataset.theme;
      window.localStorage.removeItem("pinvites-theme");
    } else {
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("pinvites-theme", next);
    }
    window.dispatchEvent(new Event("pinvites-theme-change"));
  }

  const current = themes.find((item) => item.value === theme) ?? themes[0]!;
  const Icon = current.icon;

  return (
    <button
      type="button"
      className="grid size-10 place-items-center rounded-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--selection)] hover:text-[var(--ink)]"
      onClick={cycleTheme}
      aria-label={`${current.label}; activate to change`}
      title={current.label}
    >
      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
    </button>
  );
}

function readTheme(): Theme {
  const saved = window.localStorage.getItem("pinvites-theme");
  return saved === "light" || saved === "dark" ? saved : "system";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("pinvites-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("pinvites-theme-change", callback);
  };
}
