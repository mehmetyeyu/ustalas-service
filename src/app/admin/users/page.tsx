"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

interface User {
  id: number;
  username: string;
  role: string;
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

function isLocked(u: User): boolean {
  return !!u.locked_until && new Date(u.locked_until) > new Date();
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUsername, setCurrentUsername] = useState("");
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  const [renameTarget, setRenameTarget] = useState<User | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const [busyAction, setBusyAction] = useState<number | null>(null);

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
        body: JSON.stringify({ username: username.trim(), password, role }),
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Kullanıcılar</h1>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
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
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kayıt Tarihi</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Son Giriş</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const self = u.username === currentUsername;
                const locked = isLocked(u);
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                      {u.username}
                      {self && <span className="ml-2 text-xs text-gray-400 font-normal">(siz)</span>}
                      {!self && (
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
                      {self ? (
                        <span className="text-gray-500" title="Kendi rolünüzü değiştiremezsiniz.">
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
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {u.last_login_at ? formatDate(u.last_login_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3 flex-wrap">
                        {locked && (
                          <button
                            onClick={() => handleUnlock(u)}
                            disabled={busyAction === u.id}
                            className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                          >
                            Kilidi Aç
                          </button>
                        )}
                        <button
                          onClick={() => openReset(u)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Şifre Sıfırla
                        </button>
                        {!self && (
                          <button
                            onClick={() => handleForceLogout(u)}
                            disabled={busyAction === u.id}
                            className="text-orange-600 hover:text-orange-800 text-xs font-medium"
                          >
                            Oturumu Sonlandır
                          </button>
                        )}
                        {!self && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={busyAction === u.id}
                            className="text-gray-600 hover:text-gray-800 text-xs font-medium"
                          >
                            {u.is_active ? "Devre Dışı Bırak" : "Aktifleştir"}
                          </button>
                        )}
                        {!self && (
                          <button
                            onClick={() => handleDelete(u)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            Sil
                          </button>
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
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Yeni Kullanıcı Ekle</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-5">
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
            </div>

            <div className="flex gap-3">
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
    </div>
  );
}
