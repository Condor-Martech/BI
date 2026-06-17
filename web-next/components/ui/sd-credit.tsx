import { cn } from '@/lib/utils';

const LOGO_BLACK = 'https://s3.cndr.me/solucoes-digitais/logo/PNG/logo_sd_b.png';
const LOGO_WHITE = 'https://s3.cndr.me/solucoes-digitais/logo/PNG/logo_sd_w.png';

interface SdCreditProps {
  variant?: 'inline' | 'iconOnly';
  className?: string;
}

export function SdCredit({ variant = 'inline', className }: SdCreditProps) {
  if (variant === 'iconOnly') {
    return (
      <div
        className={cn('flex items-center justify-center opacity-60', className)}
        aria-label="Desenvolvido por Soluções Digitais"
        title="Desenvolvido por Soluções Digitais"
      >
        <Logo className="h-4 w-auto" />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70', className)}>
      <span>Desenvolvido por</span>
      <Logo className="h-4 w-auto" />
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <>
      <img
        src={LOGO_BLACK}
        alt="Soluções Digitais"
        loading="lazy"
        decoding="async"
        className={cn('block dark:hidden', className)}
      />
      <img
        src={LOGO_WHITE}
        alt="Soluções Digitais"
        loading="lazy"
        decoding="async"
        className={cn('hidden dark:block', className)}
      />
    </>
  );
}
