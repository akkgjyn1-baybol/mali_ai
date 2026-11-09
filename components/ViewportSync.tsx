"use client";

import { useEffect } from "react";

export function ViewportSync() {
  useEffect(() => {
    const sync = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--vvh", `${height}px`);
    };
    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);
  return null;
}
