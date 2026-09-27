"use client";

import { useEffect, useState } from "react";
import { PushNotificationToggle } from "../../admin/PushNotificationToggle";

interface TicketListItem {
  id: number;
  subject: string;
  status: "ACIK" | "KAPALI";
  created_at: string;
  updated_at: string;
  tenant_name: string;
  tenant_code: string;
  last_message_body: string | null;
  last_message_is_super_admin_reply: boolean | null;
}
interface TicketMessage {
  id: number;
  body: string;
  is_super_admin_reply: boolean;
  created_at: string;
  sender_username: string | null;
}
interface TicketDetail {
  ticket: TicketListItem & { contact_email: string | null; contact_phone: string | null };
  messages: TicketMessage[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// "Sıra sizde" (süper admin için) — son mesajı tenant yazdıysa (süper admin
// değil) ve talep hâlâ açıksa, süper adminin cevaplaması bekleniyor demektir.
function needsAttention(t: TicketListItem): boolean {
  return t.status === "ACIK" && t.last_message_is_super_admin_reply === false;
}

export default function SuperAdminDestekPage() {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | "ACIK" | "KAPALI">("ACIK");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  function loadTickets(status: "" | "ACIK" | "KAPALI") {
    setLoading(true);
    const qs = status ? `?status=${status}` : "";
    fetch(`/api/super-admin/support-tickets${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTickets(data); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTickets(statusFilter); }, [statusFilter]);

  function openTicket(id: number) {
    setSelectedId(id);
    setDetailLoading(true);
    fetch(`/api/super-admin/support-tickets/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .finally(() => setDetailLoading(false));
  }

  async function handleReply() {
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/super-admin/support-tickets/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (res.ok) {
        setReplyText("");
        openTicket(selectedId);
        loadTickets(statusFilter);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleToggleStatus(status: "ACIK" | "KAPALI") {
    if (!selectedId) return;
    const res = await fetch(`/api/super-admin/support-tickets/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      openTicket(selectedId);
      loadTickets(statusFilter);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Destek Talepleri</h1>
        <div className="flex gap-1">
          {([
            { v: "ACIK", label: "Açık" },
            { v: "KAPALI", label: "Kapalı" },
            { v: "", label: "Hepsi" },
          ] as { v: "" | "ACIK" | "KAPALI"; label: string }[]).map(({ v, label }) => (
            <button
              key={v || "all"}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <PushNotificationToggle
          title="Destek Talebi Bildirimleri"
          description="Yeni bir talep veya mesaj geldiğinde bu tarayıcıya bildirim gönderilsin (sadece bu cihaz için geçerli)."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">Yükleniyor...</div>
          ) : tickets.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm px-4">Bu filtrede talep yok.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedId === t.id ? "bg-blue-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-blue-700 truncate">{t.tenant_name}</span>
                    {needsAttention(t) && <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" title="Sıra sizde" />}
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">{t.subject}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{t.last_message_body || "—"}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${t.status === "ACIK" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {t.status === "ACIK" ? "Açık" : "Kapalı"}
                    </span>
                    <span className="text-[10px] text-gray-400">{formatDateTime(t.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 min-h-[400px] flex flex-col">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Görüntülemek için soldan bir talep seçin.
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Yükleniyor...</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="font-semibold text-gray-800">{detail.ticket.subject}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {detail.ticket.tenant_name} ({detail.ticket.tenant_code})
                    {detail.ticket.contact_email && <> · {detail.ticket.contact_email}</>}
                    {detail.ticket.contact_phone && <> · {detail.ticket.contact_phone}</>}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleStatus(detail.ticket.status === "ACIK" ? "KAPALI" : "ACIK")}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 shrink-0"
                >
                  {detail.ticket.status === "ACIK" ? "Kapat" : "Yeniden Aç"}
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-3 my-4 overflow-y-auto max-h-[420px]">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.is_super_admin_reply ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${m.is_super_admin_reply ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${m.is_super_admin_reply ? "text-blue-100" : "text-gray-400"}`}>
                        {m.is_super_admin_reply ? "Siz" : detail.ticket.tenant_name} · {formatDateTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Cevabınızı yazın..."
                  rows={2}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium self-end"
                >
                  Gönder
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
