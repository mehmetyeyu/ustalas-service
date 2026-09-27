"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import { buildMonthGrid, monthGridRange, type CalendarDay } from "@/lib/calendarGrid";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";

interface Appointment {
  id: number;
  plate: string;
  customer_name: string | null;
  requested_at: string;
  status: string;
  service_name: string | null;
}
interface CalendarNote {
  id: number;
  note_date: string;
  title: string;
  body: string | null;
  created_by_username: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  BEKLEMEDE: "Beklemede",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
  GELMEDI: "Gelmedi",
};
const STATUS_BADGE: Record<string, string> = {
  BEKLEMEDE: "bg-yellow-100 text-yellow-700",
  ONAYLANDI: "bg-blue-100 text-blue-700",
  REDDEDILDI: "bg-gray-100 text-gray-500",
  TAMAMLANDI: "bg-green-100 text-green-700",
  IPTAL: "bg-gray-100 text-gray-500",
  GELMEDI: "bg-red-100 text-red-700",
};

const WEEKDAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const now = new Date();

// Her hücre render'ında yeniden kurulması (42 hücre × randevu sayısı kadar)
// gereksiz maliyetli — Intl.DateTimeFormat inşası ucuz değildir. Tek, modül
// seviyeli bir instance her yerde paylaşılır.
const istanbulDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" });
function apptDateStr(a: { requested_at: string }): string {
  // requested_at TIMESTAMPTZ — Istanbul yerel gününe göre gruplanır (bkz.
  // formatDate'in aynı Europe/Istanbul kullanımı), ham UTC güne göre değil.
  return istanbulDayFormatter.format(new Date(a.requested_at));
}

export default function TakvimPage() {
  const allowed = useViewGuard("calendar");
  const canCreate = usePermission("calendar.create");
  const canEdit = usePermission("calendar.edit");
  const canDelete = usePermission("calendar.delete");
  const toast = useToast();
  const confirm = useConfirm();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  // grid/from/to sadece ay değişince değişir — noteTitle gibi her tuş
  // vuruşunda güncellenen bir state aynı component'te olduğundan, bunlar
  // memoize edilmezse her tuşta 42 hücrelik ızgara + tarih aritmetiği
  // gereksiz yere yeniden hesaplanırdı.
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const { from, to } = useMemo(() => monthGridRange(year, month), [year, month]);

  // appointments/notes ayda birkaç düzine satır olsa bile, 42 hücrenin HER
  // BİRİNDE tam listeyi .filter() ile taraması (+ önceden her çağrıda yeni bir
  // Intl.DateTimeFormat kurması) her render'da O(42×N) iş demekti. Bunun
  // yerine veri her değiştiğinde (fetch sonrası) BİR KEZ tarihe göre
  // Map'lenir, hücre render'ı sadece O(1) bir lookup yapar.
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = apptDateStr(a);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [appointments]);
  const notesByDate = useMemo(() => {
    const map = new Map<string, CalendarNote[]>();
    for (const n of notes) {
      const list = map.get(n.note_date) ?? [];
      list.push(n);
      map.set(n.note_date, list);
    }
    return map;
  }, [notes]);

  function load() {
    setLoading(true);
    Promise.all([
      fetch(`/api/appointments?from=${from}&to=${to}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/calendar/notes?from=${from}&to=${to}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([apptData, noteData]) => {
        if (Array.isArray(apptData)) setAppointments(apptData);
        if (Array.isArray(noteData)) setNotes(noteData);
      })
      .catch(() => toast.error("Takvim verileri yüklenemedi."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  function appointmentsFor(date: string): Appointment[] {
    return appointmentsByDate.get(date) ?? [];
  }
  function notesFor(date: string): CalendarNote[] {
    return notesByDate.get(date) ?? [];
  }

  function goPrevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1);
  }
  function goNextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1);
  }
  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  }

  function openDay(date: string) {
    setSelectedDate(date);
    resetNoteForm();
  }

  function resetNoteForm() {
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteBody("");
  }

  function startEditNote(n: CalendarNote) {
    setEditingNoteId(n.id);
    setNoteTitle(n.title);
    setNoteBody(n.body ?? "");
  }

  async function saveNote() {
    if (!selectedDate || !noteTitle.trim()) {
      toast.error("Başlık zorunludur.");
      return;
    }
    setSavingNote(true);
    try {
      const payload = { note_date: selectedDate, title: noteTitle.trim(), body: noteBody.trim() || null };
      const res = editingNoteId
        ? await fetch(`/api/calendar/notes/${editingNoteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/calendar/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error();
      resetNoteForm();
      load();
    } catch {
      toast.error("Not kaydedilemedi.");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(id: number) {
    const ok = await confirm({ title: "Notu Sil", message: "Bu notu silmek istediğinize emin misiniz?", confirmText: "Sil", variant: "danger" });
    if (!ok) return;
    try {
      const res = await fetch(`/api/calendar/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast.error("Not silinemedi.");
    }
  }

  if (!allowed) return null;

  const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];

  const selectedDay = grid.find((d) => d.date === selectedDate);
  const selectedAppointments = selectedDate ? appointmentsFor(selectedDate) : [];
  const selectedNotes = selectedDate ? notesFor(selectedDate) : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Takvim</h1>
        <div className="flex items-center gap-2">
          <button onClick={goPrevMonth} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100" aria-label="Önceki ay">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-medium text-gray-700 w-32 text-center">{months[month - 1]} {year}</span>
          <button onClick={goNextMonth} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100" aria-label="Sonraki ay">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button onClick={goToday} className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 text-sm font-medium text-gray-600">
            Bugün
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="px-2 py-2 text-center text-xs font-medium text-gray-500">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((d: CalendarDay) => {
              const dayAppts = appointmentsFor(d.date);
              const dayNotes = notesFor(d.date);
              return (
                <button
                  key={d.date}
                  onClick={() => openDay(d.date)}
                  className={`min-h-[90px] sm:min-h-[110px] border-b border-r border-gray-100 p-1.5 text-left align-top hover:bg-gray-50 transition-colors ${
                    d.inCurrentMonth ? "bg-white" : "bg-gray-50/50"
                  }`}
                >
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    d.isToday ? "bg-blue-600 text-white" : d.inCurrentMonth ? "text-gray-700" : "text-gray-300"
                  }`}>
                    {d.day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayAppts.slice(0, 2).map((a) => (
                      <div key={a.id} className={`text-[10px] px-1 py-0.5 rounded truncate ${STATUS_BADGE[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {a.customer_name || a.plate}
                      </div>
                    ))}
                    {dayNotes.slice(0, 2 - Math.min(dayAppts.length, 2)).map((n) => (
                      <div key={n.id} className="text-[10px] px-1 py-0.5 rounded truncate bg-purple-50 text-purple-700">
                        {n.title}
                      </div>
                    ))}
                    {dayAppts.length + dayNotes.length > 2 && (
                      <div className="text-[10px] text-gray-400 px-1">+{dayAppts.length + dayNotes.length - 2} daha</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedDate && selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDate(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })}
              </h2>
              <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Randevular</h3>
                {selectedAppointments.length === 0 ? (
                  <p className="text-sm text-gray-400">Bu güne ait randevu yok.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedAppointments.map((a) => (
                      <div key={a.id} className="border border-gray-100 rounded-lg p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{a.customer_name || "—"} · {a.plate}</p>
                          <p className="text-xs text-gray-400">{formatDate(a.requested_at)}{a.service_name ? ` · ${a.service_name}` : ""}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[a.status] ?? a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Notlar</h3>
                {selectedNotes.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-3">Bu güne ait not yok.</p>
                ) : (
                  <div className="space-y-2 mb-3">
                    {selectedNotes.map((n) => (
                      <div key={n.id} className="border border-gray-100 rounded-lg p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800">{n.title}</p>
                            {n.body && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{n.body}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {canEdit && (
                              <button onClick={() => startEditNote(n)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Düzenle</button>
                            )}
                            {canDelete && (
                              <button onClick={() => deleteNote(n.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Sil</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {canCreate && (
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Not başlığı"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Ayrıntı (isteğe bağlı)"
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex justify-end gap-2">
                      {editingNoteId != null && (
                        <button onClick={resetNoteForm} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg">
                          Vazgeç
                        </button>
                      )}
                      <button
                        onClick={saveNote}
                        disabled={savingNote}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
                      >
                        {editingNoteId != null ? "Güncelle" : "Not Ekle"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
