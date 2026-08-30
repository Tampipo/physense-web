// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ArrowRight, BookOpen, SlidersHorizontal, Play } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { Wordmark } from "@/components/ui/Wordmark";
import { QM_MODULES } from "@/lib/qm-modules";
import { STATPHYS_MODULES } from "@/lib/statphys-modules";

const STEPS = [
  { key: "read", Icon: BookOpen },
  { key: "tune", Icon: SlidersHorizontal },
  { key: "watch", Icon: Play },
] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const qm = await getTranslations("qm.modules");
  const statphys = await getTranslations("statphys.modules");

  return (
    <div className="space-y-24">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="animate-rise space-y-7">
        <div className="flex justify-center">
          <Wordmark size={96} />
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium text-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          {t("eyebrow")}
        </span>

        <h1 className="max-w-3xl font-serif text-4xl font-medium leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          <span className="text-gradient">{t("heading")}</span>
        </h1>

        <p className="max-w-xl text-lg leading-relaxed text-muted">
          {t("intro")}
        </p>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
          <Link
            href="/qm"
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-background shadow-glow transition duration-200 hover:bg-accent/90"
          >
            {t("exploreQm")}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
          <Link
            href="/qm/harmonic"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors duration-200 hover:border-border-strong hover:bg-surface-2/60"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        {STEPS.map(({ key, Icon }, i) => (
          <div key={key} className="flex flex-col gap-3 bg-surface/40 p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <span className="font-mono text-xs tabular-nums text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {t(`steps.${key}.title`)}
            </h3>
            <p className="text-sm leading-relaxed text-muted">
              {t(`steps.${key}.desc`)}
            </p>
          </div>
        ))}
      </section>

      {/* ── Modules ──────────────────────────────────────────────────── */}
      {/* One section per subject. The heading carries the subject name now
          that there is more than one, so a reader landing here can tell which
          catalogue they are looking at without following the link. */}
      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            {t("modulesKicker")}
          </h2>
          <Link
            href="/qm"
            className="text-sm text-muted transition-colors hover:text-accent"
          >
            {t("exploreQm")} →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QM_MODULES.map((slug, i) => (
            <ModuleCard
              key={slug}
              href={`/qm/${slug}`}
              index={i + 1}
              title={qm(`${slug}.title`)}
              summary={qm(`${slug}.summary`)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            {t("modulesKickerStatphys")}
          </h2>
          <Link
            href="/statphys"
            className="text-sm text-muted transition-colors hover:text-accent"
          >
            {t("exploreStatphys")} →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATPHYS_MODULES.map((slug, i) => (
            <ModuleCard
              key={slug}
              href={`/statphys/${slug}`}
              index={i + 1}
              title={statphys(`${slug}.title`)}
              summary={statphys(`${slug}.summary`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
