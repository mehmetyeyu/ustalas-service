"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

interface AuditLogEntry {
  id: number;
  username: string;
  action: string;
  table_name: string;
  record_id: number | null;
  detail: string | null;
  created_at: string;
}

// bkz. src/lib/auditLog.ts logAudit çağrılarındaki action değerleri — burada
// TEK yerden Türkçe etikete çevrilir, yeni bir action eklenince sadece
// burası güncellenir.
const ACTION_LABELS: Record<string, string> = {
  "order.create": "Sipariş Oluşturuldu",
  "order.update": "Sipariş Düzenlendi",
  "order.delete": "Sipariş Silindi",
  "order.payment": "Ödeme Alındı",
  "customer.ledger_add": "Cari Hareket Eklendi",
  "customer.ledger_update": "Cari Hareket Düzenlendi",
  "customer.ledger_delete": "Cari Hareket Silindi",
  "user.update": "Kullanıcı Güncellendi",
  "user.delete": "Kullanıcı Silindi",
};

const LIMIT = 30;

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/audit-log?page=${page}&limit=${LIMIT}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Aktivite Geçmişi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sipariş, cari ve kullanıcı işlemlerinde kimin ne değiştirdiğinin kaydı.
        </p>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Henüz bir kayıt yok.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kullanıcı</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">İşlem</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(entry.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{entry.username}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-900"
              >
                ← Önceki
              </button>
              <span className="text-sm text-gray-500">Sayfa {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-900"
              >
                Sonraki →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
