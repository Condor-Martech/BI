"use client";

import { Maximize, Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
}

export function FullscreenButton({ isFullscreen, onToggle }: FullscreenButtonProps) {
  const Icon = isFullscreen ? Minimize : Maximize;
  const label = isFullscreen ? "Sair da tela cheia" : "Tela cheia";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className="gap-1.5"
      aria-pressed={isFullscreen}
      aria-label={label}
      title={label}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}
