"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

type MaybeAsync = () => Promise<void> | void;

interface FullscreenLikeElement {
  requestFullscreen?: MaybeAsync;
  webkitRequestFullscreen?: MaybeAsync;
}

interface FullscreenLikeDocument {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: MaybeAsync;
  webkitExitFullscreen?: MaybeAsync;
}

/**
 * Wraps the Fullscreen API with cross-browser support and synced state.
 * Safari (desktop) exposes the API under `webkit`-prefixed names — iOS Safari
 * does not support fullscreen on arbitrary elements at all, only on <video>.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function sync() {
      const doc = document as unknown as FullscreenLikeDocument;
      const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setIsFullscreen(active === ref.current);
    }
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [ref]);

  const enter = useCallback(async () => {
    const el = ref.current as unknown as FullscreenLikeElement | null;
    if (!el) return;
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  }, [ref]);

  const exit = useCallback(async () => {
    const doc = document as unknown as FullscreenLikeDocument;
    if (doc.exitFullscreen) return doc.exitFullscreen();
    if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
  }, []);

  const toggle = useCallback(async () => {
    if (isFullscreen) return exit();
    return enter();
  }, [isFullscreen, enter, exit]);

  return { isFullscreen, toggle, enter, exit };
}
