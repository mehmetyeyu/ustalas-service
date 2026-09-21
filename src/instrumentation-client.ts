import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  // Session Replay kasıtlı olarak kapalı: admin panelinde gerçek müşteri
  // verisi (Cari bakiye, ödeme bilgisi, telefon/adres) ekranda görünüyor —
  // ekran kaydı bu verilerin Sentry'ye gönderilmesi anlamına gelirdi.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
