import { describe, it, expect } from "vitest";
import { shouldShowOnboardingTour } from "./onboardingTour";

const baseUser = {
  role: "admin",
  isPrimaryAdmin: true,
  trialEndsAt: "2026-01-01T00:00:00.000Z",
  onboardingTourCompletedAt: null,
};

describe("shouldShowOnboardingTour", () => {
  it("kendi kendine kayıt olmuş, henüz turu görmemiş birincil Yönetici için true döner", () => {
    expect(shouldShowOnboardingTour(baseUser)).toBe(true);
  });

  it("staff rolü için false döner", () => {
    expect(shouldShowOnboardingTour({ ...baseUser, role: "staff" })).toBe(false);
  });

  it("birincil admin olmayan (sonradan eklenmiş) kullanıcı için false döner", () => {
    expect(shouldShowOnboardingTour({ ...baseUser, isPrimaryAdmin: false })).toBe(false);
  });

  it("elle provizyon edilmiş (trial_ends_at hiç olmamış) firmalar için false döner", () => {
    expect(shouldShowOnboardingTour({ ...baseUser, trialEndsAt: null })).toBe(false);
  });

  it("tur daha önce tamamlanmış/atlanmışsa false döner", () => {
    expect(shouldShowOnboardingTour({ ...baseUser, onboardingTourCompletedAt: "2026-01-02T00:00:00.000Z" })).toBe(false);
  });

  it("billing_status zamanla değişse bile trial_ends_at hâlâ doluysa true döner", () => {
    // trial_ends_at geçmiş bir tarih olsa (deneme bitmiş) ya da abonelik
    // 'active'e geçmiş olsa da fark etmez — bu fonksiyon billing_status'e
    // hiç bakmaz, yalnızca "kendi kendine kayıt oldu mu" sinyaline bakar.
    expect(shouldShowOnboardingTour({ ...baseUser, trialEndsAt: "2020-01-01T00:00:00.000Z" })).toBe(true);
  });
});
