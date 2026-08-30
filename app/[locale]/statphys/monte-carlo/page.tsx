// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { moduleMetadata } from "@/lib/metadata";

export default async function MonteCarloPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  try {
    const { default: Content } = await import(
      `@/content/${locale}/statphys/monte-carlo.mdx`
    );
    return (
      <article className="prose">
        <Content />
      </article>
    );
  } catch {
    notFound();
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return moduleMetadata(locale, "monte-carlo", "statphys");
}
