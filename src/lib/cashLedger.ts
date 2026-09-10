export class InvalidCashLedgerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCashLedgerInputError";
  }
}

export interface ManualCashLedgerInput {
  direction: 1 | -1;
  amount: number;
  entryDate: string | null;
  description: string | null;
}

// POST ve PUT /api/kasa/entries'in TEK ortak doğrulama noktası — bkz.
// src/lib/customerLedger.ts'teki validateManualLedgerInput'un aynı deseni,
// burada ödeme şekli dallanması yok (cash_ledger_entries'teki her satır
// zaten Nakit'tir).
export function validateManualCashLedgerInput(body: {
  direction?: unknown; amount?: unknown; entry_date?: unknown; description?: unknown;
}): ManualCashLedgerInput {
  const direction = Number(body.direction);
  const amount = Number(body.amount);
  const entryDate = body.entry_date ? String(body.entry_date).trim() : null;
  const description = body.description ? String(body.description).trim() : null;

  if (direction !== 1 && direction !== -1) {
    throw new InvalidCashLedgerInputError("Geçersiz yön.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvalidCashLedgerInputError("Geçersiz tutar.");
  }
  return { direction: direction as 1 | -1, amount, entryDate, description };
}
