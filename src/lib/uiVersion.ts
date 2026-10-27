// Panel görünüm sürümleri — TEK kaynak. "use client" değil: sunucu (auth,
// /api/auth/*), açılış betiği (uiThemeBoot.ts) ve istemci aynı tanımı okur.
//
// Yaşam döngüsü (bkz. database/schema.sql ui_version notu):
//   1. Yeni sürüm yazılırken NEXT_UI_VERSION'a konur; yalnızca
//      users.ui_beta_version'ı o sürüm olan kullanıcılar seçebilir (kademeli
//      açılış — önce birkaç müşteri, Profil › Görünüm'den geçer/döner).
//   2. Herkese açılınca CURRENT_UI_VERSION olur, NEXT_UI_VERSION null'a döner.
//      Eski sürüm seçilemez hale gelir: veritabanında hâlâ kayıtlı olsa bile
//      resolveUiVersion onu güncel sürüme çevirir — toplu UPDATE gerekmez.
//   3. Emekli sürümün kodu (v1 için: v1-chrome, `v2:` varyantları, isV2
//      dalları) ayrı bir temizlikle silinir.
//
// 2026-10-27: v2 tüm firmalar için kalıcı (yeni kayıtlar dahil), v1 emekli.
export const UI_VERSIONS = ["v1", "v2"] as const;
export type UiVersion = (typeof UI_VERSIONS)[number];

export const CURRENT_UI_VERSION: UiVersion = "v2";
export const NEXT_UI_VERSION: UiVersion | null = null;

const isUiVersion = (v: unknown): v is UiVersion => typeof v === "string" && (UI_VERSIONS as readonly string[]).includes(v);

// Kullanıcının önizleyebileceği sonraki sürüm (users.ui_beta_version):
// yalnızca tanımlı bir NEXT_UI_VERSION'a eşitse geçerli — eski bir betaya
// kalmış işaret sonraki sürüme kendiliğinden erişim vermez.
export function resolveBetaVersion(stored: unknown): UiVersion | null {
  return NEXT_UI_VERSION && stored === NEXT_UI_VERSION ? NEXT_UI_VERSION : null;
}

// Kayıtlı tercihten kullanıcının gerçekte gördüğü sürüm: güncel sürüm ya da
// (erişimi varsa) beta sürüm; emekli/bilinmeyen her değer güncel sürüme düşer.
export function resolveUiVersion(stored: unknown, betaVersion: UiVersion | null = null): UiVersion {
  if (betaVersion && stored === betaVersion) return betaVersion;
  return isUiVersion(stored) && stored === CURRENT_UI_VERSION ? stored : CURRENT_UI_VERSION;
}

// Profil › Görünüm'de seçilebilecek sürümler — tek seçenek varsa seçici hiç
// gösterilmez.
export function selectableUiVersions(betaVersion: UiVersion | null): UiVersion[] {
  return betaVersion ? [CURRENT_UI_VERSION, betaVersion] : [CURRENT_UI_VERSION];
}

export const UI_VERSION_LABELS: Record<UiVersion, string> = { v1: "Eski görünüm", v2: "Güncel görünüm" };
