"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";

interface Tenant {
  id: number;
  name: string;
  code: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export default function SuperAdminPage() {
  const toast = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  // Yeni firma oluşturulunca dönen kod/kullanıcı adı — müşteriye iletilecek
  // bilgi olduğundan, modal kapansa bile kaybolmasın diye ayrı tutulur.
  const [createdInfo, setCreatedInfo] = useState<{ code: string; username: string } | null>(null);

  async function fetchTenants() {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/tenants", { cache: "no-store" });
      const data = await res.json();
      setTenants(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTenants();
  }, []);

  async function handleToggleActive(t: Tenant) {
    const action = t.is_active ? "pasif" : "aktif";
    if (!confirm(`${t.name} firmasını ${action} yapmak istediğinize emin misiniz?`)) return;
    setTogglingId(t.id);
    try {
      const res = await fetch(`/api/super-admin/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "İşlem başarısız.");
      await fetchTenants();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setTogglingId(null);
    }
  }

  function openAddModal() {
    setTenantName("");
    setAdminUsername("");
    setAdminPassword("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setCreatedInfo(null);
    setShowAddModal(true);
  }

  async function handleAddTenant() {
    if (!tenantName.trim() || !adminUsername.trim() || !adminPassword) {
      toast.error("Firma adı, kullanıcı adı ve şifre zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: tenantName.trim(),
          adminUsername: adminUsername.trim(),
          adminPassword,
          contactName: contactName.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydetme başarısız.");
      setCreatedInfo({ code: data.code, username: adminUsername.trim() });
      await fetchTenants();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Firmalar</h2>
        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Firma Ekle
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : tenants.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Henüz firma yok.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Firma Adı</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">İletişim</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Firma Kodu</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kayıt Tarihi</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Durum</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{t.name}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {t.contact_name || t.contact_email || t.contact_phone ? (
                        <div className="text-xs">
                          {t.contact_name && <div className="text-gray-700">{t.contact_name}</div>}
                          {t.contact_email && <div>{t.contact_email}</div>}
                          {t.contact_phone && <div>{t.contact_phone}</div>}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono whitespace-nowrap">{t.code}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${t.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                        <i className={`w-1.5 h-1.5 rounded-full ${t.is_active ? "bg-green-600" : "bg-gray-500"}`}></i>
                        {t.is_active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(t)}
                        disabled={togglingId === t.id}
                        className={`text-xs font-medium disabled:opacity-40 ${t.is_active ? "text-red-500 hover:text-red-700" : "text-green-600 hover:text-green-800"}`}
                      >
                        {togglingId === t.id ? "İşleniyor..." : t.is_active ? "Pasif Yap" : "Aktif Yap"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Yeni Firma Ekle</h2>

            {createdInfo ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                  <p className="font-medium mb-2">Firma oluşturuldu. Müşteriye şu bilgileri iletin:</p>
                  <p>Firma Kodu: <span className="font-mono font-semibold">{createdInfo.code}</span></p>
                  <p>Kullanıcı Adı: <span className="font-semibold">{createdInfo.username}</span></p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  Kapat
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Firma Adı</label>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Ör. Yılmaz Lastik"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Yönetici Kullanıcı Adı</label>
                    <input
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Yönetici Şifresi</label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-400 mb-3">İletişim bilgisi (opsiyonel)</p>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Yetkili Ad Soyad"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="E-posta"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="Telefon"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleAddTenant}
                    disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    {saving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
