"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { PushNotificationToggle } from "../PushNotificationToggle";

interface TicketListItem {
  id: number;
  subject: string;
  status: "ACIK" | "KAPALI";
  created_at: string;
  updated_at: string;
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
  ticket: TicketListItem;
  messages: TicketMessage[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// "Sıra sizde" — son mesajı süper admin yazdıysa ve talep hâlâ açıksa,
// tenant'ın görüp cevaplaması bekleniyor demektir.
function needsAttention(t: TicketListItem): boolean {
  return t.status === "ACIK" && t.last_message_is_super_admin_reply === true;
}

export default function DestekPage() {
  const toast = useToast();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  function loadTickets() {
    fetch("/api/support-tickets", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTickets(data); })
      .catch(() => toast.error("Destek talepleri yüklenemedi."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTickets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openTicket(id: number) {
    setSelectedId(id);
    setDetailLoading(true);
    fetch(`/api/support-tickets/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => toast.error("Talep yüklenemedi."))
      .finally(() => setDetailLoading(false));
  }

  async function handleCreate() {
    if (!newSubject.trim() || !newMessage.trim()) {
      toast.error("Konu ve mesaj zorunludur.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: newSubject.trim(), message: newMessage.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShowNewModal(false);
      setNewSubject("");
      setNewMessage("");
      loadTickets();
      openTicket(data.id);
      toast.success("Destek talebiniz oluşturuldu.");
    } catch {
      toast.error("Talep oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  }

  async function handleReply() {
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support-tickets/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (!res.ok) throw new Error();
      setReplyText("");
      openTicket(selectedId);
      loadTickets();
    } catch {
      toast.error("Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  async function handleToggleStatus(status: "ACIK" | "KAPALI") {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/support-tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      openTicket(selectedId);
      loadTickets();
    } catch {
      toast.error("Durum güncellenemedi.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Destek</h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          + Yeni Talep
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <PushNotificationToggle
          title="Destek Bildirimleri"
          description="Talebinize cevap geldiğinde bu tarayıcıya bildirim gönderilsin (sadece bu cihaz için geçerli)."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Talep listesi */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">Yükleniyor...</div>
          ) : tickets.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm px-4">
              Henüz bir destek talebiniz yok. Sorunuz olduğunda WhatsApp yerine buradan bize ulaşabilirsiniz.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedId === t.id ? "bg-blue-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{t.subject}</span>
                    {needsAttention(t) && <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" title="Sıra sizde" />}
                  </div>
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

        {/* Konuşma */}
        <div className="bg-white rounded-xl shadow-sm p-5 min-h-[400px] flex flex-col">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Görüntülemek için soldan bir talep seçin.
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Yükleniyor...</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{detail.ticket.subject}</h2>
                <button
                  onClick={() => handleToggleStatus(detail.ticket.status === "ACIK" ? "KAPALI" : "ACIK")}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5"
                >
                  {detail.ticket.status === "ACIK" ? "Talebi Kapat" : "Yeniden Aç"}
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-3 mb-4 overflow-y-auto max-h-[420px]">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.is_super_admin_reply ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${m.is_super_admin_reply ? "bg-gray-100 text-gray-800" : "bg-blue-600 text-white"}`}>
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${m.is_super_admin_reply ? "text-gray-400" : "text-blue-100"}`}>
                        {m.is_super_admin_reply ? "Destek Ekibi" : "Siz"} · {formatDateTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Mesajınızı yazın..."
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

      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Yeni Destek Talebi</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Konu</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Örn: Fatura kesimiyle ilgili bir sorum var"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mesajınız</label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Vazgeç
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {creating ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
