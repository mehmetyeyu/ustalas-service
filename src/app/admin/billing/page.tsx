"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { trialDaysLeft } from "@/lib/billing";
import { formatTry2, USD_REFERENCE_PRICING } from "@/lib/exchangeRate";

interface PlanInfo {
  referenceCode: string;
  name: string;
  price: string;
  currencyCode: string;
  paymentInterval: "MONTHLY" | "YEARLY";
}

// USD_REFERENCE_PRICING artık src/lib/exchangeRate.ts'te — landing (/elevire)
// ile paylaşılan TEK kaynak (iki dosyada birbirinden habersiz iki sabit
// olma riski ortadan kalktı). Gerçek tahsilat ise TRY'dir (yerli kartlar
// dövizle ödeme yapamıyor, bkz. iyzico-setup.mjs notu) — iyzico'daki plan
// fiyatı (plans[key].price/currencyCode) "Kartınızdan ... tahsil
// edilecek" satırında ayrıca gösterilir. İkisi kasıtlı olarak ayrı:
// üstteki $ vitrin fiyatı sabit, alttaki gerçek tahsilat tutarı
// iyzico'daki plan güncellenince değişir.
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", TRY: "₺", EUR: "€" };

function formatPlanPrice(amount: number, currencyCode: string): string {
  if (currencyCode === "TRY") return `₺${formatTry2(amount)}`;
  const symbol = CURRENCY_SYMBOLS[currencyCode];
  return symbol ? `${symbol}${amount}` : `${amount} ${currencyCode}`;
}

const STATUS_LABELS: Record<string, string> = {
  trialing: "Deneme Sürümü",
  active: "Aktif",
  past_due: "Ödeme Sorunu",
  canceled: "İptal Edildi",
  exempt: "Muaf",
};

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400 py-12">Yükleniyor...</div>}>
      <BillingPageContent />
    </Suspense>
  );
}

function BillingPageContent() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<{ monthly: PlanInfo; yearly: PlanInfo; usdTryRate: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"monthly" | "yearly" | "cancel" | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // iyzico CF, sayfaya gömülü (responsive) render için #iyzipay-checkout-form
  // id'li bir div'in DOM'da ÖNCEDEN var olmasını bekliyor (bkz. docs.iyzico.com
  // odeme-metotlari/odeme-formu/cf-entegrasyonu) — script'leri enjekte etmeden
  // önce bu container'ın render edilmiş olması gerektiğinden state+effect ile
  // sıralanıyor (aşağıya bkz.).
  const [pendingFormContent, setPendingFormContent] = useState<string | null>(null);

  useEffect(() => {
    const result = searchParams.get("result");
    if (result === "success") toast.success("Aboneliğiniz başarıyla başlatıldı.");
    else if (result === "failed") toast.error("Ödeme tamamlanamadı, lütfen tekrar deneyin.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPlans(data))
      .catch(() => setPlans(null))
      .finally(() => setLoading(false));
  }, []);

  // iyzico Checkout Form initialize'ının dönen içeriğinin tam şekli
  // (yönlendirme URL'i mi, embed edilecek script mi) sandbox'ta ilk gerçek
  // çağrıyla teyit edilecek (bkz. plan) — burada ikisi de destekleniyor.
  function handleCheckoutResult(result: { paymentPageUrl?: string; checkoutFormContent?: string; error?: string }) {
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.paymentPageUrl) {
      window.location.href = result.paymentPageUrl;
      return;
    }
    if (result.checkoutFormContent) {
      // Script enjeksiyonu bir sonraki effect'e bırakılıyor — #iyzipay-
      // checkout-form container'ı (bkz. aşağıdaki JSX) bu state'e bağlı
      // olarak koşullu render edildiğinden, script'ler çalışıp container'ı
      // ARADIĞINDA DOM'da zaten var olması garanti edilmiş oluyor.
      setPendingFormContent(result.checkoutFormContent);
      return;
    }
    toast.error("Ödeme sayfası başlatılamadı.");
  }

  useEffect(() => {
    if (!pendingFormContent) return;
    // iyzico'nun checkoutFormContent'i tamamen <script> etiketlerinden
    // oluşuyor (iyziInit/iyziUcsInit/iyziSubscriptionInit tanımlayıp
    // bundle.js'i enjekte ediyorlar) — ama innerHTML ile eklenen
    // <script>'ler tarayıcı tarafından ÇALIŞTIRILMAZ (güvenlik kısıtı),
    // bu yüzden form hiç render olmuyordu (gerçek bir denemede saptandı).
    // Her script'i document.createElement ile YENİDEN oluşturup DOM'a
    // ekleyerek gerçekten çalışmasını sağlıyoruz — sıra önemli
    // (iyziUcsInit/iyziSubscriptionInit "typeof iyziInit" kontrolü yapıyor).
    // Script'lerin kendisi DOM'da nereye eklendiğinden bağımsız (sadece
    // çalışmaları yeterli) — asıl render hedefi #iyzipay-checkout-form'dur
    // (bkz. docs.iyzico.com odeme-metotlari/odeme-formu/cf-entegrasyonu,
    // "responsive" modu).
    const scriptsHost = document.createElement("div");
    scriptsHost.innerHTML = pendingFormContent;
    document.body.appendChild(scriptsHost);
    for (const oldScript of Array.from(scriptsHost.querySelectorAll("script"))) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFormContent]);

  async function startCheckout(plan: "monthly" | "yearly") {
    if (!acceptedTerms) {
      toast.error("Devam etmek için Mesafeli Satış Sözleşmesi'ni kabul etmeniz gerekiyor.");
      return;
    }
    setSubmitting(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, acceptedTerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata oluştu.");
      handleCheckoutResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSubmitting(null);
    }
  }

  async function switchPlan(plan: "monthly" | "yearly") {
    if (!acceptedTerms) {
      toast.error("Devam etmek için Mesafeli Satış Sözleşmesi'ni kabul etmeniz gerekiyor.");
      return;
    }
    const ok = await confirm({
      message: `Planınızı ${plan === "monthly" ? "Aylık" : "Yıllık"} olarak değiştirmek istediğinize emin misiniz? Mevcut aboneliğiniz iptal edilip yeni plan tam fiyattan başlar.`,
      confirmText: "Planı Değiştir",
    });
    if (!ok) return;
    setSubmitting(plan);
    try {
      const res = await fetch("/api/billing/switch-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, acceptedTerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata oluştu.");
      handleCheckoutResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSubmitting(null);
    }
  }

  async function cancelSubscription() {
    const ok = await confirm({
      message: "Aboneliğinizi iptal etmek istediğinize emin misiniz? İptal sonrası erişiminiz kısıtlanır.",
      confirmText: "Aboneliği İptal Et",
      variant: "danger",
    });
    if (!ok) return;
    setSubmitting("cancel");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata oluştu.");
      toast.success("Aboneliğiniz iptal edildi.");
      window.location.reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSubmitting(null);
    }
  }

  if (authLoading) return <div className="text-center text-gray-400 py-12">Yükleniyor...</div>;

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm p-8 text-center">
        <h1 className="text-lg font-bold text-gray-800 mb-2">Abonelik</h1>
        <p className="text-sm text-gray-500">
          Bu firmanın aboneliği güncel değil. Erişimin devam etmesi için lütfen firma yöneticinizle iletişime geçin.
        </p>
      </div>
    );
  }

  const billingStatus = user?.billingStatus ?? null;
  const isActive = billingStatus === "active";
  const cancelAtPeriodEnd = isActive && !!user?.billingCancelAtPeriodEnd;
  const periodEndsAt = user?.billingPeriodEndsAt ? new Date(user.billingPeriodEndsAt) : null;
  // billing_status hiçbir yerde koddan 'canceled'a yazılmıyor — dönem
  // sonu geçmiş iptal edilmiş bir abonelik (isBillingLocked zaten
  // fonksiyonel olarak kilitler) ekranda hâlâ "Aktif" görünürdü. Ayrı bir
  // arka plan görevi eklemek yerine görüntülenen etiket burada türetiliyor.
  const cancelPeriodEnded = cancelAtPeriodEnd && periodEndsAt != null && periodEndsAt.getTime() <= Date.now();
  const displayStatus = cancelPeriodEnded ? "canceled" : billingStatus;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-1">Abonelik</h1>
      <p className="text-sm text-gray-500 mb-6">Elevire aboneliğinizi buradan yönetin.</p>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-medium text-gray-700">Durum</div>
            <div className="text-lg font-bold text-gray-800">{displayStatus ? STATUS_LABELS[displayStatus] ?? displayStatus : "—"}</div>
            {billingStatus === "trialing" && (
              <p className="text-xs text-gray-400 mt-1">Deneme sürenizin bitmesine {trialDaysLeft(user?.trialEndsAt ?? null)} gün kaldı.</p>
            )}
            {billingStatus === "past_due" && (
              <p className="text-xs text-red-500 mt-1">
                Son ödeme alınamadı{user?.billingLastPaymentError ? ` (${user.billingLastPaymentError})` : ""}, erişiminiz kısıtlandı. Devam etmek için yeniden abone olun.
              </p>
            )}
            {(billingStatus === "canceled" || cancelPeriodEnded) && (
              <p className="text-xs text-gray-400 mt-1">Aboneliğiniz iptal edildi. Devam etmek için yeniden abone olun.</p>
            )}
            {cancelAtPeriodEnd && !cancelPeriodEnded && periodEndsAt && (
              <p className="text-xs text-amber-600 mt-1">
                Aboneliğiniz iptal edildi, bir daha tahsilat yapılmayacak. Erişiminiz {periodEndsAt.toLocaleDateString("tr-TR")} tarihine kadar sürecek.
              </p>
            )}
            {isActive && !cancelAtPeriodEnd && periodEndsAt && (
              <p className="text-xs text-gray-400 mt-1">
                Sonraki yenileme tarihi: {periodEndsAt.toLocaleDateString("tr-TR")}
              </p>
            )}
          </div>
          {isActive && !cancelAtPeriodEnd && (
            <button
              onClick={cancelSubscription}
              disabled={submitting !== null}
              className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {submitting === "cancel" ? "İptal ediliyor..." : "Aboneliği İptal Et"}
            </button>
          )}
        </div>
      </div>

      {pendingFormContent && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div id="iyzipay-checkout-form" className="responsive"></div>
        </div>
      )}

      {pendingFormContent ? null : loading ? (
        <div className="text-center text-gray-400 py-8">Planlar yükleniyor...</div>
      ) : !plans ? (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-sm text-gray-500">
          Abonelik planları şu anda yüklenemedi, lütfen daha sonra tekrar deneyin.
        </div>
      ) : (
        <>
          <label className="flex items-start gap-2.5 text-sm text-gray-600 mb-4">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <a href="/elevire/legal/mesafeli-satis-sozlesmesi" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                Mesafeli Satış Sözleşmesi
              </a>
              &apos;ni okudum, kabul ediyorum; dijital hizmetin ödeme onayıyla birlikte hemen ifa edileceğini ve bu nedenle cayma hakkımın bulunmadığını biliyorum.
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["monthly", "yearly"] as const).map((key) => {
            const plan = plans[key];
            const isCurrentPlan = isActive && user?.plan === key;
            const usdPrice = USD_REFERENCE_PRICING[key];
            const discountPct = key === "yearly"
              ? Math.round((1 - USD_REFERENCE_PRICING.yearly / (USD_REFERENCE_PRICING.monthly * 12)) * 100)
              : 0;
            return (
              <div key={key} className={`relative bg-white rounded-xl shadow-sm p-6 flex flex-col ${key === "yearly" ? "ring-2 ring-blue-500" : ""}`}>
                {discountPct > 0 && (
                  <span className="absolute -top-2.5 right-4 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    %{discountPct} İNDİRİM
                  </span>
                )}
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{key === "monthly" ? "Aylık" : "Yıllık"}</h2>
                <div className="text-2xl font-bold text-gray-800 mt-1">
                  {key === "yearly" && discountPct > 0 && (
                    <span className="text-base font-normal text-gray-400 line-through mr-1.5">
                      ${USD_REFERENCE_PRICING.monthly * 12}
                    </span>
                  )}
                  ${usdPrice}
                  <span className="text-sm font-normal text-gray-400"> / {key === "monthly" ? "ay" : "yıl"}</span>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  Kartınızdan {formatPlanPrice(Number(plan.price), plan.currencyCode)} tahsil edilecek
                </p>
                <div className="mt-auto">
                  {isCurrentPlan ? (
                    <div className="text-center text-sm font-medium text-emerald-600 py-2.5">Mevcut Planınız</div>
                  ) : isActive ? (
                    <button
                      onClick={() => switchPlan(key)}
                      disabled={submitting !== null || !acceptedTerms}
                      className="w-full border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {submitting === key ? "İşleniyor..." : "Bu Plana Geç"}
                    </button>
                  ) : (
                    <button
                      onClick={() => startCheckout(key)}
                      disabled={submitting !== null || !acceptedTerms}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
                    >
                      {submitting === key ? "Yönlendiriliyor..." : "Abone Ol"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}
