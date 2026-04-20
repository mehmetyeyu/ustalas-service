"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDate, formatCurrency } from "@/lib/format";

interface OrderDetail {
  id: number;
  plate: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  total_amount: number;
  status: "BEKLEMEDE" | "TAMAMLANDI";
  payment_type: string | null;
  payment_date: string | null;
  created_at: string;
  services: { id: number; name: string; unit_price: number }[];
}

const PAYMENT_LABELS: Record<string, string> = {
  NAKIT: "Nakit",
  KREDI_KARTI: "Kredi Kartı",
  HAVALE: "Havale / EFT",
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentType, setPaymentType] = useState("NAKIT");
  const [closing, setClosing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  async function fetchOrder() {
    const res = await fetch(`/api/orders/${id}`);
    if (res.ok) {
      setOrder(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchOrder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleClose() {
    setClosing(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: paymentType }),
      });
      if (!res.ok) throw new Error("İşlem başarısız.");
      setShowModal(false);
      await fetchOrder();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-gray-400">Yükleniyor...</div>;
  }
  if (!order) {
    return <div className="p-12 text-center text-gray-400">Sipariş bulunamadı.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-gray-500 hover:text-gray-800"
      >
        ← Geri
      </button>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold font-mono text-gray-800">{order.plate}</h1>
            <p className="text-gray-500 text-sm mt-1">Sipariş #{order.id}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              order.status === "TAMAMLANDI"
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {order.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}
          </span>
        </div>

        {/* Müşteri Bilgileri */}
        {(order.customer_name || order.customer_phone) && (
          <div className="mb-5 p-4 bg-gray-50 rounded-lg">
            <h2 className="text-xs font-medium text-gray-500 uppercase mb-2">Müşteri</h2>
            {order.customer_name && (
              <p className="font-medium text-gray-800">{order.customer_name}</p>
            )}
            {order.customer_phone && (
              <p className="text-gray-600">{order.customer_phone}</p>
            )}
          </div>
        )}

        {/* Hizmetler */}
        <div className="mb-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase mb-2">Hizmetler</h2>
          <div className="space-y-2">
            {order.services.map((svc) => (
              <div key={svc.id} className="flex justify-between">
                <span className="text-gray-700">{svc.name}</span>
                <span className="font-semibold text-gray-800">
                  {formatCurrency(svc.unit_price)}
                </span>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span>Toplam</span>
              <span className="text-green-600">{formatCurrency(order.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Notlar */}
        {order.notes && (
          <div className="mb-5 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h2 className="text-xs font-medium text-yellow-700 uppercase mb-1">Not</h2>
            <p className="text-gray-700">{order.notes}</p>
          </div>
        )}

        {/* Tarih & Ödeme */}
        <div className="text-sm text-gray-500 space-y-1">
          <p>Oluşturulma: {formatDate(order.created_at)}</p>
          {order.payment_type && (
            <p>
              Ödeme: {PAYMENT_LABELS[order.payment_type]} —{" "}
              {order.payment_date ? formatDate(order.payment_date) : ""}
            </p>
          )}
        </div>

        {/* Ödeme Al butonu */}
        {order.status === "BEKLEMEDE" && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Ödeme Al & Kapat
          </button>
        )}
      </div>

      {/* Ödeme Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Ödeme Al</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <p className="text-gray-600 mb-4">
              Toplam tutar:{" "}
              <span className="font-bold text-green-600 text-lg">
                {formatCurrency(order.total_amount)}
              </span>
            </p>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ödeme Tipi
              </label>
              <div className="space-y-2">
                {Object.entries(PAYMENT_LABELS).map(([val, label]) => (
                  <label
                    key={val}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${
                      paymentType === val
                        ? "border-green-500 bg-green-50"
                        : "border-gray-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={val}
                      checked={paymentType === val}
                      onChange={() => setPaymentType(val)}
                      className="accent-green-500"
                    />
                    <span className="font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {closing ? "İşleniyor..." : "Onayla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
