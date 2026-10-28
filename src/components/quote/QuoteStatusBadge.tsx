import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/quotes";

// "Süresi doldu" saklanan bir durum değil (bkz. isQuoteExpired) — açık bir
// teklifin geçerlilik günü geçmişse rozet onu gösterir.
const TONE: Record<QuoteStatus, string> = {
  TASLAK: "bg-v2-muted text-v2-fg",
  GONDERILDI: "bg-v2-info-bg text-v2-info-fg",
  KABUL: "bg-v2-success-bg text-v2-success-fg",
  RED: "bg-v2-danger-bg text-v2-danger-fg",
  SIPARIS: "bg-v2-primary-soft text-v2-primary",
};

export default function QuoteStatusBadge({ status, expired }: { status: QuoteStatus; expired?: boolean }) {
  const tone = expired ? "bg-v2-warning-bg text-v2-warning-fg" : TONE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${tone}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {expired ? "Süresi Doldu" : QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
