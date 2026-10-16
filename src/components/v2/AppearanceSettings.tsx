"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/admin/AuthContext";
import type { UiTheme, UiVersion } from "@/lib/uiTheme";
import { SettingsSection } from "./SettingsLayout";

// Profil › Görünüm: panel görünümü (yeni/eski) ve yeni görünümün teması.
// Kullanıcı başına sunucuda saklanır (bkz. /api/auth/preferences), her
// cihazda geçerli olur. Yalnızca yeni görünüme erişimi açılmış ya da zaten
// yeni görünümde olan kullanıcıya gösterilir (bkz. profile/page.tsx).

const THEMES: { value: UiTheme; label: string }[] = [
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
  { value: "system", label: "Sistem" },
];

function ThemePreview({ theme }: { theme: UiTheme }) {
  const light = (
    <div className="flex flex-1 bg-[#F4F6F9]">
      <div className="w-3.5 bg-[#0E1A2B]" />
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="h-2 w-3/4 rounded bg-[#CBD3DE]" />
        <div className="flex-1 rounded border border-[#E3E7ED] bg-white" />
      </div>
    </div>
  );
  const dark = (
    <div className="flex flex-1 bg-[#0A0F16]">
      <div className="w-3.5 border-r border-[#172131] bg-[#070B11]" />
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="h-2 w-3/4 rounded bg-[#2A374B]" />
        <div className="flex-1 rounded border border-[#1F2B3D] bg-[#111823]" />
      </div>
    </div>
  );
  return (
    <div aria-hidden="true" className="flex h-20 overflow-hidden rounded-md border border-gray-200">
      {theme === "light" ? light : theme === "dark" ? dark : <>{light}{dark}</>}
    </div>
  );
}

export default function AppearanceSettings() {
  const { user, setUiPreferences } = useAuth();
  // Seçim yerel durumda anında güncellenir — store (TanStack önbelleği) bir
  // sonraki tick'te güncellendiğinden, sadece ona bağlı kontrollü radio
  // tıklamada bir an eski değere dönüp geri geliyordu.
  const [version, setVersion] = useState<UiVersion>(user?.uiVersion ?? "v1");
  const [theme, setTheme] = useState<UiTheme>(user?.uiTheme ?? "system");
  useEffect(() => { if (user) setVersion(user.uiVersion); }, [user?.uiVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) setTheme(user.uiTheme); }, [user?.uiTheme]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;
  const v2 = version === "v2";

  return (
    <SettingsSection title="Görünüm" description="Seçiminiz bu kullanıcı için kaydedilir ve tüm cihazlarınızda geçerli olur.">

      <fieldset className="mb-5">
        <legend className="block text-sm font-medium text-gray-700 mb-2">Panel görünümü</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "v2" as const, label: "Yeni görünüm" },
            { value: "v1" as const, label: "Eski görünüm" },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                version === opt.value ? "border-v2-primary bg-v2-primary-soft text-v2-link" : "border-v2-line-strong text-v2-fg hover:bg-v2-muted"
              }`}
            >
              <input
                type="radio"
                name="ui_version"
                value={opt.value}
                checked={version === opt.value}
                disabled={opt.value === "v2" && !user.uiV2Available}
                onChange={() => { setVersion(opt.value); void setUiPreferences({ ui_version: opt.value }); }}
                className="h-4 w-4"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {v2 && (
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">Tema</legend>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((t) => (
              <label
                key={t.value}
                className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-2.5 transition-colors ${
                  theme === t.value ? "border-v2-primary bg-v2-primary-soft ring-1 ring-v2-primary" : "border-v2-line hover:bg-v2-muted"
                }`}
              >
                <ThemePreview theme={t.value} />
                <span className="flex items-center gap-2 text-sm font-medium text-v2-fg">
                  <input
                    type="radio"
                    name="ui_theme"
                    value={t.value}
                    checked={theme === t.value}
                    onChange={() => { setTheme(t.value); void setUiPreferences({ ui_theme: t.value }); }}
                    className="h-4 w-4"
                  />
                  {t.label}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">“Sistem” seçiliyken panel, cihazınızın açık/koyu ayarını otomatik takip eder.</p>
        </fieldset>
      )}
    </SettingsSection>
  );
}
