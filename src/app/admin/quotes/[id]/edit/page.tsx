"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useViewGuard, usePermission, useAuth } from "../../../AuthContext";
import QuoteForm, { type QuoteFormInitial } from "@/components/quote/QuoteForm";
import { isQuoteLocked, type QuoteStatus } from "@/lib/quotes";

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const allowed = useViewGuard("quotes");
  const { loading } = useAuth();
  const canEdit = usePermission("quotes.edit");
  const [quote, setQuote] = useState<(QuoteFormInitial & { status: QuoteStatus; can_view_cost: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/quotes/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Teklif yüklenemedi.");
        setQuote(data);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (!allowed || loading) return null;

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <Link href={`/admin/quotes/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-v2-fg-subtle hover:text-v2-fg">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
          Teklif {quote?.quote_no ?? ""}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-v2-fg">Teklif {quote?.quote_no ?? ""} — Düzenle</h1>
      </header>
      {error ? (
        <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">{error}</div>
      ) : !quote ? (
        <div className="text-center text-v2-fg-muted py-12">Yükleniyor...</div>
      ) : !canEdit ? (
        <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">Teklif düzenleme yetkiniz yok.</div>
      ) : isQuoteLocked(quote.status) ? (
        <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">Siparişe dönüştürülmüş teklif değiştirilemez.</div>
      ) : (
        <QuoteForm initial={quote} canViewCost={quote.can_view_cost} />
      )}
    </div>
  );
}
