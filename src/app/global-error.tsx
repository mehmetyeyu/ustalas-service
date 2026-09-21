"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="tr">
      <body className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-xl font-semibold text-gray-900">Bir şeyler ters gitti</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sayfa beklenmedik bir hatayla karşılaştı. Ekibimiz bilgilendirildi.
          </p>
        </div>
      </body>
    </html>
  );
}
