"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "@/lib/format";
import { RESOURCE_ACTIONS } from "@/lib/permissions";

const MENU_WIDTH = 192; // w-48
const MENU_MAX_HEIGHT = 260;

interface User {
  id: number;
  username: string;
  role: string;
  permissions: string[];
  is_primary_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  is_active: boolean;
  locked_until: string | null;
  failed_attempts: number;
}

const ROLES = [
  { value: "admin", label: "Yönetici" },
  { value: "staff", label: "Karşılama Görevlisi" },
];

const RESOURCE_LABELS: Record<string, string> = {
  orders: "Siparişler",
  reports: "Raporlar",
  services: "Hizmetler",
  storage: "Depolama",
  products: "Ürünler",
  customers: "Müşteriler",
  suppliers: "Tedarikçiler",
  expenses: "Masraflar",
};

const ACTION_LABELS: Record<string, string> = {
  view: "Görüntüle",
  create: "Ekle",
  edit: "Düzenle",
  delete: "Sil",
  approve: "Onayla",
};

function isLocked(u: User): boolean {
  return !!u.locked_until && new Date(u.locked_until) > new Date();
}

// Karşılama Görevlisi'ne (staff) hangi admin sayfalarını/aksiyonlarını
// görebileceğini seçmek için — bkz. src/lib/permissions.ts (aynı taksonomi
// hem burada hem middleware/API route'larda kullanılıyor). Kullanıcılar ve
// Genel Ayarlar bilinçli olarak bu listede yok (hep sadece gerçek admin).
function PermissionMatrix({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  }
  return (
    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
      {Object.entries(RESOURCE_ACTIONS).map(([resource, actions]) => (
        <div key={resource} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
          <span className="w-24 shrink-0 text-sm font-medium text-gray-700">{RESOURCE_LABELS[resource]}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {actions.map((action) => {
              const key = `${resource}.${action}`;
              return (
                <label key={key} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.includes(key)}
                    onChange={() => toggle(key)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  {ACTION_LABELS[action]}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUsername, setCurrentUsername] = useState("");
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [permTarget, setPermTarget] = useState<User | null>(null);
  const [permValue, setPermValue] = useState<string[]>([]);
  const [permSaving, setPermSaving] = useState(false);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  const [renameTarget, setRenameTarget] = useState<User | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const [busyAction, setBusyAction] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number | null; bottom: number | null }>({ left: 0, top: null, bottom: null });

  // 3 noktalı menü (mobil) — tablo overflow-x-auto ile sarmalı olduğundan
  // (bkz. Sipariş Listesi'ndeki MultiSelectDropdown) absolute konumlandırma
  // satır sınırında kırpılır; document.body'e portal ile taşınıp konumu
  // butonun ekran koordinatlarına göre hesaplanır.
  useEffect(() => {
    if (!openMenuId || !menuAnchor) return;
    function updatePos() {
      if (!menuAnchor) return;
      const r = menuAnchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openUp = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow;
      setMenuPos({
        left: r.right - MENU_WIDTH,
        top: openUp ? null : r.bottom + 4,
        bottom: openUp ? window.innerHeight - r.top + 4 : null,
      });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [openMenuId, menuAnchor]);

  function closeMenu() {
    setOpenMenuId(null);
    setMenuAnchor(null);
  }

  async function fetchUsers() {
    const res = await fetch("/api/users", { cache: "no-store" });
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setCurrentUsername(data.username || ""));
  }, []);

  function openNew() {
    setUsername("");
    setPassword("");
    setRole("staff");
    setPermissions([]);
    setError("");
    setShowForm(true);
  }

  async function handleCreate() {
    setError("");
    if (!username.trim()) {
      setError("Kullanıcı adı zorunludur.");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, role, permissions }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setShowForm(false);
      await fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(u: User, newRole: string) {
    if (newRole === u.role) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncelleme başarısız.");
      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Hata oluştu.");
    }
  }

  async function handleDelete(u: User) {
    if (!confirm(`"${u.username}" kullanıcısını silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silme başarısız.");
      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Hata oluştu.");
    }
  }

  async function patchUser(u: User, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusyAction(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncelleme başarısız.");
      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setBusyAction(null);
    }
  }

  function handleUnlock(u: User) {
    patchUser(u, { unlock: true });
  }

  function handleForceLogout(u: User) {
    patchUser(
      u,
      { forceLogout: true },
      `"${u.username}" kullanıcısının tüm cihazlardaki oturumu sonlandırılacak. Devam edilsin mi?`
    );
  }

  function handleToggleActive(u: User) {
    if (u.is_active) {
      patchUser(
        u,
        { isActive: false },
        `"${u.username}" kullanıcısı devre dışı bırakılacak, giriş yapamayacak. Devam edilsin mi?`
      );
    } else {
      patchUser(u, { isActive: true });
    }
  }

  function openRename(u: User) {
    setRenameTarget(u);
    setRenameValue(u.username);
    setRenameError("");
  }

  async function handleRename() {
    if (!renameTarget) return;
    setRenameError("");
    if (!renameValue.trim()) {
      setRenameError("Kullanıcı adı zorunludur.");
      return;
    }
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/users/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: renameValue.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncelleme başarısız.");
      setRenameTarget(null);
      await fetchUsers();
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setRenameSaving(false);
    }
  }

  function openReset(u: User) {
    setResetTarget(u);
    setResetPassword("");
    setResetError("");
  }

  function openPerm(u: User) {
    setPermTarget(u);
    setPermValue(u.permissions ?? []);
  }

  async function handleSavePermissions() {
    if (!permTarget) return;
    setPermSaving(true);
    try {
      const res = await fetch(`/api/users/${permTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permValue }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncelleme başarısız.");
      setPermTarget(null);
      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setPermSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError("");
    if (resetPassword.length < 6) {
      setResetError("Şifre en az 6 karakter olmalıdır.");
      return;
    }
    setResetSaving(true);
    try {
      const res = await fetch(`/api/users/${resetTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Şifre güncellenemedi.");
      setResetTarget(null);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setResetSaving(false);
    }
  }

  return (
    <div onClick={closeMenu}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Kullanıcılar</h1>
        <button
          onClick={openNew}
          className="self-start sm:self-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Kullanıcı
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Kullanıcı bulunamadı.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kullanıcı Adı</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Durum</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kayıt Tarihi</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Son Giriş</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const self = u.username === currentUsername;
                const locked = isLocked(u);
                // Ana admin — kendisi dışında hiç kimse bu satırda hiçbir
                // şeyi değiştiremez (bkz. PATCH/DELETE /api/users/:id).
                const protectedAdmin = u.is_primary_admin && !self;
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                      {u.username}
                      {u.is_primary_admin && (
                        <span className="ml-2 text-xs text-amber-600 font-normal" title="Ana admin — başka kimse tarafından değiştirilemez/silinemez">
                          🔐 Ana Admin
                        </span>
                      )}
                      {self && <span className="ml-2 text-xs text-gray-400 font-normal">(siz)</span>}
                      {!self && !protectedAdmin && (
                        <button
                          onClick={() => openRename(u)}
                          className="ml-2 text-gray-400 hover:text-blue-600 text-xs"
                          title="Yeniden adlandır"
                        >
                          ✎
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {self || protectedAdmin ? (
                        <span className="text-gray-500" title={protectedAdmin ? "Ana admin hesabının rolü değiştirilemez." : "Kendi rolünüzü değiştiremezsiniz."}>
                          {ROLES.find((r) => r.value === u.role)?.label || u.role}
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            u.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {u.is_active ? "Aktif" : "Pasif"}
                        </span>
                        {locked && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600"
                            title={`Kilit bitiş: ${formatDate(u.locked_until as string)}`}
                          >
                            🔒 Kilitli
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-500 whitespace-nowrap">
                      {u.last_login_at ? formatDate(u.last_login_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Desktop */}
                      <div className="hidden sm:flex justify-end gap-3 flex-wrap">
                        {locked && !protectedAdmin && (
                          <button
                            onClick={() => handleUnlock(u)}
                            disabled={busyAction === u.id}
                            className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                          >
                            Kilidi Aç
                          </button>
                        )}
                        {!protectedAdmin && (
                          <button
                            onClick={() => openReset(u)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            Şifre Sıfırla
                          </button>
                        )}
                        {!self && u.role === "staff" && (
                          <button
                            onClick={() => openPerm(u)}
                            className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                          >
                            İzinler
                          </button>
                        )}
                        {!self && !protectedAdmin && (
                          <button
                            onClick={() => handleForceLogout(u)}
                            disabled={busyAction === u.id}
                            className="text-orange-600 hover:text-orange-800 text-xs font-medium"
                          >
                            Oturumu Sonlandır
                          </button>
                        )}
                        {!self && !protectedAdmin && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={busyAction === u.id}
                            className="text-gray-600 hover:text-gray-800 text-xs font-medium"
                          >
                            {u.is_active ? "Devre Dışı Bırak" : "Aktifleştir"}
                          </button>
                        )}
                        {!self && !protectedAdmin && (
                          <button
                            onClick={() => handleDelete(u)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            Sil
                          </button>
                        )}
                      </div>
                      {/* Mobile */}
                      <div className="relative sm:hidden inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuId === u.id) { closeMenu(); return; }
                            setOpenMenuId(u.id);
                            setMenuAnchor(e.currentTarget);
                          }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <circle cx="10" cy="4" r="1.5" />
                            <circle cx="10" cy="10" r="1.5" />
                            <circle cx="10" cy="16" r="1.5" />
                          </svg>
                        </button>
                        {openMenuId === u.id && menuAnchor && typeof document !== "undefined" && createPortal(
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: "fixed", left: menuPos.left, width: MENU_WIDTH,
                              top: menuPos.top ?? undefined, bottom: menuPos.bottom ?? undefined,
                            }}
                            className="z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1"
                          >
                            {locked && !protectedAdmin && (
                              <button
                                onClick={() => { closeMenu(); handleUnlock(u); }}
                                disabled={busyAction === u.id}
                                className="block w-full text-left px-4 py-2.5 text-sm text-amber-600 hover:bg-gray-50 disabled:opacity-40"
                              >
                                Kilidi Aç
                              </button>
                            )}
                            {!protectedAdmin && (
                              <button
                                onClick={() => { closeMenu(); openReset(u); }}
                                className="block w-full text-left px-4 py-2.5 text-sm text-blue-600 hover:bg-gray-50"
                              >
                                Şifre Sıfırla
                              </button>
                            )}
                            {!self && u.role === "staff" && (
                              <button
                                onClick={() => { closeMenu(); openPerm(u); }}
                                className="block w-full text-left px-4 py-2.5 text-sm text-purple-600 hover:bg-gray-50"
                              >
                                İzinler
                              </button>
                            )}
                            {!self && !protectedAdmin && (
                              <button
                                onClick={() => { closeMenu(); handleForceLogout(u); }}
                                disabled={busyAction === u.id}
                                className="block w-full text-left px-4 py-2.5 text-sm text-orange-600 hover:bg-gray-50 disabled:opacity-40"
                              >
                                Oturumu Sonlandır
                              </button>
                            )}
                            {!self && !protectedAdmin && (
                              <button
                                onClick={() => { closeMenu(); handleToggleActive(u); }}
                                disabled={busyAction === u.id}
                                className="block w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                              >
                                {u.is_active ? "Devre Dışı Bırak" : "Aktifleştir"}
                              </button>
                            )}
                            {!self && !protectedAdmin && (
                              <>
                                <div className="border-t border-gray-100 my-1" />
                                <button
                                  onClick={() => { closeMenu(); handleDelete(u); }}
                                  className="block w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-gray-50"
                                >
                                  Sil
                                </button>
                              </>
                            )}
                          </div>,
                          document.body
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto flex flex-col">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Yeni Kullanıcı Ekle</h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {role === "staff" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Erişim İzinleri <span className="text-gray-400 font-normal">(hiçbiri seçilmezse sadece sipariş oluşturma ekranını görür)</span>
                    </label>
                    <PermissionMatrix value={permissions} onChange={setPermissions} />
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              &quot;{resetTarget.username}&quot; Şifresini Sıfırla
            </h2>

            {resetError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {resetError}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setResetTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {resetSaving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              &quot;{renameTarget.username}&quot; Kullanıcı Adını Değiştir
            </h2>

            {renameError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {renameError}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Kullanıcı Adı</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRenameTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleRename}
                disabled={renameSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {renameSaving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {permTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-gray-800 mb-1">
              &quot;{permTarget.username}&quot; Erişim İzinleri
            </h2>
            <p className="text-xs text-gray-400 mb-4">Hiçbiri seçilmezse sadece sipariş oluşturma ekranını görür.</p>

            <div className="mb-5">
              <PermissionMatrix value={permValue} onChange={setPermValue} />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPermTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={permSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {permSaving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
