"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/i18n-context";

export function LocaleToggle() {
  const { locale, setLocale, t } = useT();

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={locale === "en" ? "default" : "outline"}
        onClick={() => setLocale("en")}
      >
        EN
      </Button>
      <Button
        size="sm"
        variant={locale === "mn" ? "default" : "outline"}
        onClick={() => setLocale("mn")}
      >
        MN
      </Button>
      <span className="text-sm text-muted-foreground">
        {t("shell.dashboardFallback", "Dashboard")}
      </span>
    </div>
  );
}
