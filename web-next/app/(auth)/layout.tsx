'use client';

import { BarChart3, Sparkles } from 'lucide-react';
import { motion, type Variants } from 'motion/react';
import { useEffect, useState } from 'react';

import { SdCredit } from '@/components/ui/sd-credit';
import { durations, springs } from '@/lib/motion/transitions';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const shown = useShown();

  return (
    <div className="relative grid min-h-screen w-full bg-background lg:grid-cols-[1fr_minmax(0,460px)_1fr_1fr]">
      <BackgroundField shown={shown} />

      <main className="relative z-10 col-span-full flex items-center justify-center px-6 py-10 lg:col-span-2 lg:col-start-2 lg:px-10">
        <motion.div
          initial={false}
          animate={shown ? 'visible' : 'hidden'}
          variants={fadeUpVariants(12, 0.05)}
          className="w-full max-w-sm"
        >
          <Brand />
          {children}
          <Footer />
        </motion.div>
      </main>

      <DecorativePanel shown={shown} />
    </div>
  );
}

function useShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
  }, []);
  return shown;
}

function fadeUpVariants(offset: number, delay = 0): Variants {
  return {
    hidden: { opacity: 0, y: offset },
    visible: {
      opacity: 1,
      y: 0,
      transition: { ...springs.gentle, delay },
    },
  };
}

const fadeVariants = (delay = 0): Variants => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.slow, delay } },
});

const barVariants: Variants = {
  hidden: { scaleY: 0 },
  visible: (i: number) => ({
    scaleY: 1,
    transition: { ...springs.list, delay: 0.45 + i * 0.05 },
  }),
};

function Brand() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground ring-1 ring-primary/20 shadow-sm">
        <BarChart3 className="size-4.5" strokeWidth={2.25} />
      </div>
      <div className="leading-tight">
        <div className="font-heading text-[15px] font-semibold tracking-tight text-foreground">Central BI</div>
        <div className="text-[11px] font-medium text-muted-foreground">Condor · Business Intelligence</div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-10 flex flex-col items-center gap-2">
      <p className="text-center text-[11px] text-muted-foreground">
        &copy; {new Date().getFullYear()} Condor &middot; Acesso restrito a usuários autorizados.
      </p>
      <SdCredit />
    </div>
  );
}

function BackgroundField({ shown }: { shown: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 40%, transparent 90%)',
        }}
      />
      <motion.div
        aria-hidden
        initial={false}
        animate={shown ? 'visible' : 'hidden'}
        variants={fadeVariants()}
        className="absolute -top-32 left-1/2 size-[640px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle at center, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
    </div>
  );
}

function DecorativePanel({ shown }: { shown: boolean }) {
  const bars = [62, 88, 44, 96, 70, 52, 80];
  const animate = shown ? 'visible' : 'hidden';

  return (
    <aside className="relative z-10 col-start-4 hidden overflow-hidden border-l border-border/60 bg-gradient-to-br from-muted/40 via-background to-background lg:block">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,color-mix(in_oklab,var(--primary)_24%,transparent),transparent_55%)]" />

      <div className="relative flex h-full flex-col justify-between p-10">
        <motion.div
          initial={false}
          animate={animate}
          variants={fadeUpVariants(8, 0.15)}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm"
        >
          <Sparkles className="size-3 text-primary" strokeWidth={2.5} />
          v2 &middot; Painel renovado
        </motion.div>

        <div className="space-y-8">
          <motion.div initial={false} animate={animate} variants={fadeUpVariants(12, 0.2)}>
            <h2 className="font-heading text-3xl leading-[1.15] tracking-tight text-foreground">
              Visualize seus dados.
              <br />
              <span className="text-muted-foreground">Decida com clareza.</span>
            </h2>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Relatórios Power BI consolidados, governança por workspace e auditoria de acesso em um único lugar.
            </p>
          </motion.div>

          <motion.div
            initial={false}
            animate={animate}
            variants={fadeUpVariants(12, 0.3)}
            className="rounded-xl border border-border/80 bg-card/70 p-5 backdrop-blur-sm"
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Acessos esta semana
                </div>
                <div className="mt-1 font-heading text-2xl font-semibold tabular-nums">4.218</div>
              </div>
              <div className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">+12,4%</div>
            </div>

            <div className="mt-4 flex h-20 items-end gap-1.5">
              {bars.map((h, i) => (
                <motion.div
                  key={i}
                  custom={i}
                  initial={false}
                  animate={animate}
                  variants={barVariants}
                  style={{ height: `${h}%`, transformOrigin: 'bottom' }}
                  className="flex-1 rounded-sm bg-gradient-to-t from-primary/70 to-primary"
                />
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={false}
          animate={animate}
          variants={fadeVariants(0.5)}
          className="flex items-center gap-3 text-[11px] text-muted-foreground"
        >
          <div className="flex -space-x-1.5">
            {['#3b82f6', '#22c55e', '#f59e0b'].map((c) => (
              <div key={c} className="size-5 rounded-full ring-2 ring-background" style={{ background: c }} />
            ))}
          </div>
          <span>Confiável por equipes de dados</span>
        </motion.div>
      </div>
    </aside>
  );
}
