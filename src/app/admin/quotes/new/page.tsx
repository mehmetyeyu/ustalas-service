"use client";

import Link from "next/link";
import { useViewGuard, usePermission, useAuth } from "../../AuthContext";
import QuoteForm from "@/components/quote/QuoteForm";

export default function NewQuotePage() {
  const allowed = useViewGuard("quotes");
  const { loading } = useAuth();
  const canCreate = usePermission("quotes.create");
  const canViewCost = usePermission("quotes.view_cost");

  if (!allowed || loading) return null;

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <Link href="/admin/quotes" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-v2-fg-subtle hover:text-v2-fg">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
          Teklifler
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-v2-fg">Yeni Teklif</h1>
      </header>
      {canCreate ? (
        <QuoteForm canViewCost={canViewCost} />
      ) : (
        <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">Teklif oluşturma yetkiniz yok.</div>
      )}
    </div>
  );
}
