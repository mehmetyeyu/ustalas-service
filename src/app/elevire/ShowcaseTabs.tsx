"use client";

import { useState } from "react";

const TABS = [
  { id: "orders-form", label: "Sipariş Formu", path: "elevire.app/orders/new" },
  { id: "orders-list", label: "Sipariş Listesi", path: "elevire.app/admin/orders" },
  { id: "storage", label: "Depolama", path: "elevire.app/admin/storage" },
  { id: "expenses", label: "Masraflar", path: "elevire.app/admin/expenses" },
  { id: "reports", label: "Raporlama", path: "elevire.app/admin/reports" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const REVENUE_BY_MONTH = [
  { label: "Mar", value: 62 },
  { label: "Nis", value: 74 },
  { label: "May", value: 68 },
  { label: "Haz", value: 89 },
  { label: "Tem", value: 96 },
  { label: "Ağu", value: 100 },
];

export default function ShowcaseTabs() {
  const [active, setActive] = useState<TabId>("orders-form");
  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <div className="showcase-body">
      <div className="showcase-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`showcase-tab${active === tab.id ? " is-active" : ""}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="showcase-frame">
        <div className="showcase-chrome">
          <span className="showcase-dot" data-c="1"></span>
          <span className="showcase-dot" data-c="2"></span>
          <span className="showcase-dot" data-c="3"></span>
          <span className="showcase-addr">{activeTab.path}</span>
        </div>
        <div className="showcase-screen">
          {active === "orders-form" && <OrdersFormMock />}
          {active === "orders-list" && <OrdersListMock />}
          {active === "storage" && <StorageMock />}
          {active === "expenses" && <ExpensesMock />}
          {active === "reports" && <ReportsMock />}
        </div>
      </div>
    </div>
  );
}

function OrdersFormMock() {
  return (
    <div className="mock-form">
      <div className="mock-field-row">
        <div className="mock-field">
          <span className="mock-label">Araç Plakası</span>
          <span className="mock-input mock-input-plate">34 ABC 123</span>
        </div>
        <div className="mock-field">
          <span className="mock-label">Müşteri Adı</span>
          <span className="mock-input">Ahmet Yılmaz</span>
        </div>
        <div className="mock-field">
          <span className="mock-label">Telefon</span>
          <span className="mock-input">0555 123 45 67</span>
        </div>
      </div>

      <table className="mock-table">
        <thead>
          <tr>
            <th>Yapılan İşlem</th>
            <th>Tedarikçi</th>
            <th className="num">Adet</th>
            <th className="num">Tutar</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lastik Değişimi</td>
            <td>Servis İşçiliği</td>
            <td className="num">4</td>
            <td className="num">800 ₺</td>
          </tr>
          <tr>
            <td>Rot Ayarı</td>
            <td>Servis İşçiliği</td>
            <td className="num">1</td>
            <td className="num">350 ₺</td>
          </tr>
        </tbody>
      </table>

      <div className="mock-form-footer">
        <span>Toplam Tutar</span>
        <strong>1.150 ₺</strong>
      </div>
      <span className="mock-btn">Sipariş Oluştur</span>
    </div>
  );
}

function OrdersListMock() {
  const rows = [
    { plate: "34 ABC 123", name: "Ahmet Yılmaz", amount: "1.150 ₺", pay: "Nakit", done: true, date: "12.08.2026" },
    { plate: "06 XYZ 45", name: "Merve Kaya", amount: "2.400 ₺", pay: "POS", done: true, date: "12.08.2026" },
    { plate: "35 DEF 789", name: "Can Demir", amount: "650 ₺", pay: "Cari", done: false, date: "11.08.2026" },
    { plate: "16 KLM 12", name: "Zeynep Aksoy", amount: "980 ₺", pay: "Nakit", done: true, date: "10.08.2026" },
  ];
  return (
    <div className="mock-list">
      <div className="mock-chips">
        <span className="mock-chip">Durum: Tümü</span>
        <span className="mock-chip">Tedarikçi</span>
        <span className="mock-chip">Ödeme Şekli</span>
      </div>
      <table className="mock-table">
        <thead>
          <tr>
            <th>Plaka</th>
            <th>Müşteri</th>
            <th className="num">Tutar</th>
            <th>Ödeme</th>
            <th>Durum</th>
            <th>Tarih</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.plate}>
              <td className="mono">{r.plate}</td>
              <td>{r.name}</td>
              <td className="num">{r.amount}</td>
              <td>{r.pay}</td>
              <td>
                <span className={`mock-status${r.done ? " is-done" : ""}`}>
                  <i></i>
                  {r.done ? "Tamamlandı" : "Bekliyor"}
                </span>
              </td>
              <td>{r.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StorageMock() {
  const rows = [
    { no: 12, plate: "34 ABC 123", name: "Ahmet Yılmaz", ebat: "205/55R16", mevsim: "Kışlık", date: "03.11.2025", overdue: true },
    { no: 13, plate: "06 XYZ 45", name: "Merve Kaya", ebat: "215/60R16", mevsim: "Yazlık", date: "15.03.2026", overdue: false },
    { no: 14, plate: "35 DEF 789", name: "Can Demir", ebat: "195/65R15", mevsim: "Kışlık", date: "22.11.2025", overdue: true },
  ];
  return (
    <div className="mock-list">
      <table className="mock-table">
        <thead>
          <tr>
            <th>Depo No</th>
            <th>Plaka</th>
            <th>Müşteri</th>
            <th>Ebat</th>
            <th>Mevsim</th>
            <th>İşlem Tarihi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.no}>
              <td className="mono">#{r.no}</td>
              <td className="mono">{r.plate}</td>
              <td>{r.name}</td>
              <td>{r.ebat}</td>
              <td>{r.mevsim}</td>
              <td>
                {r.date}
                {r.overdue && <span className="mock-badge-overdue">Gecikmiş</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpensesMock() {
  const rows = [
    { date: "01.08.2026", category: "Kira", desc: "Dükkan kirası", pay: "Havale/EFT", amount: "18.000 ₺", fixed: true },
    { date: "03.08.2026", category: "Elektrik", desc: "Ağustos faturası", pay: "Havale/EFT", amount: "2.150 ₺", fixed: true },
    { date: "05.08.2026", category: "Personel Maaşı", desc: "—", pay: "Havale/EFT", amount: "24.000 ₺", fixed: true },
    { date: "10.08.2026", category: "Araç Yakıtı", desc: "Servis aracı", pay: "Nakit", amount: "850 ₺", fixed: false },
  ];
  return (
    <div className="mock-list">
      <div className="mock-chips">
        <span className="mock-chip">Ay: Ağustos 2026</span>
        <span className="mock-chip">Kategori</span>
        <span className="mock-chip">Sabit Giderler</span>
      </div>
      <table className="mock-table">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Kategori</th>
            <th>Açıklama</th>
            <th>Ödeme Şekli</th>
            <th className="num">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.date}</td>
              <td>
                {r.category}
                {r.fixed && <span className="mock-badge-overdue" style={{ background: "var(--accent-2)" }}>Sabit</span>}
              </td>
              <td>{r.desc}</td>
              <td>{r.pay}</td>
              <td className="num">{r.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mock-form-footer">
        <span>Bu Ay Toplam Gider</span>
        <strong>45.000 ₺</strong>
      </div>
    </div>
  );
}

function ReportsMock() {
  const max = Math.max(...REVENUE_BY_MONTH.map((m) => m.value));
  return (
    <div className="mock-reports">
      <div className="mock-stats">
        <div className="mock-stat">
          <span className="mock-stat-label">Toplam Gelir</span>
          <span className="mock-stat-value">128.450 ₺</span>
        </div>
        <div className="mock-stat">
          <span className="mock-stat-label">Sipariş Sayısı</span>
          <span className="mock-stat-value">342</span>
        </div>
        <div className="mock-stat">
          <span className="mock-stat-label">Ortalama Sepet</span>
          <span className="mock-stat-value">375 ₺</span>
        </div>
      </div>
      <div className="mock-chart">
        <span className="mock-chart-title">Aylık Gelir</span>
        <div className="mock-bars">
          {REVENUE_BY_MONTH.map((m, i) => (
            <div className="mock-bar-col" key={m.label}>
              {i === REVENUE_BY_MONTH.length - 1 && (
                <span className="mock-bar-value">{m.value}k ₺</span>
              )}
              <div className="mock-bar" style={{ height: `${(m.value / max) * 100}%` }}></div>
              <span className="mock-bar-label">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
