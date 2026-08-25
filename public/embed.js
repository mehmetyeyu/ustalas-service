/*
 * Online Randevu gömme script'i — Shadow DOM tabanlı.
 *
 * Kullanım (firmanın kendi sitesine):
 *   <script src="https://<bu-siteni-domaini>/embed.js" data-slug="ustalas"></script>
 *
 * İsteğe bağlı öznitelik:
 *   data-target="my-div"  — belirli bir kapsayıcının içine yerleştir (id); verilmezse
 *                           script etiketinin hemen yanına eklenir.
 *
 * NASIL ÇALIŞIR: Önceki sürüm bir <iframe> oluşturup bizim /randevu/[slug]
 * Next.js sayfamızı içine yüklüyordu — tamamen izole bir belge/origin,
 * host sitenin CSS'i hiç dokunamıyordu. Bu sürüm bunun yerine formu
 * DOĞRUDAN host sayfanın DOM'una, bir Shadow DOM köküne render ediyor:
 * - Host sitenin genel CSS'i (ör. yanlışlıkla `button{...}` gibi kapsayıcı
 *   kurallar) shadow ağacının İÇİNE SIZAMAZ — form kazara bozulmaz.
 * - Buna karşılık host site CSS DEĞİŞKENLERİYLE (--accent) ve `::part()`
 *   ile işaretlenmiş noktalardan (bkz. aşağıdaki `part=` öznitelikleri:
 *   container, title, description, field, submit, slot, slot-selected)
 *   kontrollü şekilde stil verebilir, ör:
 *     #host-div::part(submit) { border-radius: 999px; }
 * - Gerçek bir <iframe> istiyorsanız (tam izolasyon, host CSS'i hiç
 *   etkilemesin/etkilenmesin), bu script yerine doğrudan Randevu
 *   Ayarları'ndaki "iframe ile göm" kod parçasını kullanın — o hâlâ
 *   gerçek bir <iframe>'dir, değişmedi.
 *
 * API'ler artık host'un kendi origin'inden çağrıldığından (bkz.
 * src/lib/publicCors.ts) CORS gerekiyor — /api/public/randevu/* buna göre
 * yapılandırıldı.
 */
(function () {
  "use strict";
  var currentScript = document.currentScript;
  if (!currentScript) return;

  var slug = currentScript.getAttribute("data-slug");
  if (!slug) {
    console.error('[embed.js] data-slug zorunludur, ör: <script src="..." data-slug="ustalas">');
    return;
  }

  var origin = new URL(currentScript.src).origin;
  var targetId = currentScript.getAttribute("data-target");

  var host = document.createElement("div");
  host.setAttribute("data-ustalas-randevu", slug);

  var target = targetId ? document.getElementById(targetId) : null;
  if (target) {
    target.appendChild(host);
  } else if (currentScript.parentNode) {
    currentScript.parentNode.insertBefore(host, currentScript.nextSibling);
  }

  var shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = '<div class="uw-loading">Yükleniyor...</div>';

  fetch(origin + "/api/public/randevu/" + encodeURIComponent(slug) + "/meta")
    .then(function (res) {
      if (!res.ok) throw new Error("not-found");
      return res.json();
    })
    .then(function (meta) {
      mountWidget(shadow, host, origin, slug, meta);
    })
    .catch(function () {
      shadow.innerHTML = '<div class="uw-loading">Sayfa bulunamadı.</div>';
    });

  // --- Türkiye sabit UTC+3 yardımcıları (bkz. src/app/randevu/[slug]/page.tsx
  // içindeki aynı adlı fonksiyonlar — bu widget'ın React karşılığı) ---
  function toIstanbulDateStr(date) {
    return new Date(date.getTime() + 3 * 60 * 60000).toISOString().slice(0, 10);
  }
  function todayStr() {
    return toIstanbulDateStr(new Date());
  }
  function formatSlotTime(iso) {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  }
  function formatDateLabel(dateStr) {
    var parts = dateStr.split("-").map(Number);
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 9, 0, 0));
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" });
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") e.textContent = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function buildCss(style) {
    var tabletCols = style.columnsTablet === 2 ? 2 : 1;
    var desktopCols = style.columnsDesktop >= 1 && style.columnsDesktop <= 3 ? style.columnsDesktop : 1;
    var tabletMaxW = style.columnsTablet === 2 ? "672px" : "512px";
    var desktopMaxW = { 1: "576px", 2: "768px", 3: "896px" }[desktopCols];
    var slotsSpanTablet = tabletCols;
    var slotsSpanDesktop = desktopCols < 3 ? desktopCols : 1;
    var presetCss =
      style.preset === "seamless"
        ? ".uw-card{background:transparent;padding:20px;}"
        : style.preset === "outlined"
        ? ".uw-card{background:#fff;border-radius:6px;border:1px solid #d1d5db;padding:20px;}"
        : ".uw-card{background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06);border:1px solid #e5e7eb;padding:20px;}";

    return "" +
      "*,*::before,*::after{box-sizing:border-box;}" +
      // font-family SEÇİCİ ile değil KALITIM (inheritance) ile geliyor —
      // Shadow DOM sadece seçicilerin sınırı geçmesini engeller, kalıtımı
      // engellemez. Host sayfada `* { font-family: X !important }` gibi
      // agresif/genel bir kural varsa (gerçek bir kullanıcı testinde
      // bulundu), bu değer host elemanına da uygulanıp normal kalıtımla
      // shadow ağacına sızar — !important olmadan bizim :host kuralımız
      // kaybeder. Bu yüzden burada da !important gerekiyor.
      ":host{all:initial!important;display:block!important;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif!important;}" +
      ".uw-wrap{max-width:448px;margin:0 auto;}" +
      ".uw-loading{color:#9ca3af;font-size:14px;padding:24px;text-align:center;font-family:ui-sans-serif,system-ui,sans-serif;}" +
      ".uw-title{font-size:20px;line-height:1.3;font-weight:700;color:#1f2937;margin:0 0 4px;}" +
      ".uw-desc{font-size:14px;color:#6b7280;margin:0 0 24px;}" +
      presetCss +
      ".uw-field{margin-bottom:16px;}" +
      ".uw-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px;}" +
      ".uw-label{font-size:12px;font-weight:500;color:#4b5563;}" +
      ".uw-required{color:#ef4444;}" +
      ".uw-hint{font-size:12px;color:#9ca3af;}" +
      ".uw-input,.uw-select{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:14px;font-family:inherit;color:#111827;background:#fff;}" +
      ".uw-input:focus,.uw-select:focus{outline:none;box-shadow:0 0 0 2px var(--accent,#2563eb);}" +
      ".uw-input.uw-mono{font-family:ui-monospace,monospace;text-transform:uppercase;}" +
      ".uw-date-hint{margin-top:4px;font-size:12px;color:#9ca3af;}" +
      ".uw-grid{display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:16px;}" +
      ".uw-slots-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:192px;overflow-y:auto;}" +
      ".uw-slot{text-align:center;padding:8px 4px;border-radius:8px;font-size:14px;border:1px solid #d1d5db;color:#374151;background:#fff;cursor:pointer;font-family:inherit;}" +
      ".uw-slot:hover{background:#f9fafb;}" +
      ".uw-slot.selected{background:var(--accent,#2563eb);border-color:var(--accent,#2563eb);color:#fff;font-weight:500;}" +
      ".uw-submit{width:100%;background:var(--accent,#2563eb);color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:500;font-family:inherit;cursor:pointer;}" +
      ".uw-submit:hover{filter:brightness(0.9);}" +
      ".uw-submit:disabled{opacity:.5;cursor:default;}" +
      ".uw-consent{font-size:12px;color:#9ca3af;text-align:center;margin-top:12px;}" +
      ".uw-error{font-size:14px;color:#dc2626;margin-bottom:12px;}" +
      ".uw-result{max-width:384px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06);border:1px solid #e5e7eb;padding:24px;text-align:center;}" +
      ".uw-result-icon{font-size:36px;margin-bottom:12px;}" +
      ".uw-result-title{font-size:16px;font-weight:700;color:#1f2937;margin:0 0 8px;}" +
      ".uw-result-desc{font-size:14px;color:#6b7280;margin:0;}" +
      ".uw-hidden{display:none !important;}" +
      "@media (min-width:640px){.uw-wrap{max-width:" + tabletMaxW + ";}.uw-grid{grid-template-columns:repeat(" + tabletCols + ",1fr);}.uw-slots-item{grid-column:span " + slotsSpanTablet + ";}}" +
      "@media (min-width:1024px){.uw-wrap{max-width:" + desktopMaxW + ";}.uw-grid{grid-template-columns:repeat(" + desktopCols + ",1fr);}.uw-slots-item{grid-column:span " + slotsSpanDesktop + ";}}";
  }

  function mountWidget(root, hostEl, origin, slug, meta) {
    hostEl.style.setProperty("--accent", meta.style.accentColor || "#2563eb");
    root.innerHTML = "";
    root.appendChild(el("style", { html: buildCss(meta.style) }));

    var wrap = el("div", { class: "uw-wrap", part: "container" });
    root.appendChild(wrap);

    var showHeading = !!meta.style.showHeadingInEmbed;
    if (showHeading) {
      wrap.appendChild(el("h1", { class: "uw-title", part: "title", text: meta.style.title || meta.tenant.name }));
      wrap.appendChild(el("p", { class: "uw-desc", part: "description", text: meta.style.description || "Online Randevu" }));
    }

    if (!meta.services || meta.services.length === 0) {
      wrap.appendChild(el("div", { class: "uw-card", text: "Şu an online randevu alınamıyor." }));
      return;
    }

    // ---- durum ----
    var state = {
      serviceId: meta.services.length === 1 ? meta.services[0].id : null,
      date: todayStr(),
      slots: [],
      loadingSlots: false,
      selectedSlot: null,
      plate: "",
      customerName: "",
      customerPhone: "",
      website: "",
      submitting: false,
      submitError: "",
    };

    var card = el("div", { class: "uw-card" });
    wrap.appendChild(card);

    var honeypot = el("input", { type: "text", tabindex: "-1", autocomplete: "off", class: "uw-hidden", "aria-hidden": "true" });
    honeypot.addEventListener("input", function () { state.website = honeypot.value; });
    card.appendChild(honeypot);

    var grid = el("div", { class: "uw-grid" });
    card.appendChild(grid);

    // Hizmet
    var serviceField = el("div", {});
    serviceField.appendChild(el("label", { class: "uw-label", html: 'Hizmet <span class="uw-required">*</span>' }));
    var serviceSelect = el("select", { class: "uw-select", part: "field", required: "required" });
    serviceSelect.appendChild(el("option", { value: "", text: "Seçiniz..." }));
    meta.services.forEach(function (s) {
      var opt = el("option", { value: String(s.id), text: s.name });
      if (state.serviceId === s.id) opt.selected = true;
      serviceSelect.appendChild(opt);
    });
    serviceSelect.addEventListener("change", function () {
      state.serviceId = serviceSelect.value ? Number(serviceSelect.value) : null;
      state.selectedSlot = null;
      refreshSlots();
      updateContactVisibility();
    });
    serviceField.appendChild(serviceSelect);
    grid.appendChild(serviceField);

    // Tarih
    var dateField = el("div", {});
    var dateRow = el("div", { class: "uw-row" });
    dateRow.appendChild(el("label", { class: "uw-label", html: 'Tarih <span class="uw-required">*</span>' }));
    var dateLabelSpan = el("span", { class: "uw-hint" });
    dateRow.appendChild(dateLabelSpan);
    dateField.appendChild(dateRow);
    var dateInput = el("input", { type: "date", class: "uw-input", part: "field", required: "required" });
    dateInput.value = state.date;
    dateInput.min = todayStr();
    dateInput.max = toIstanbulDateStr(new Date(Date.now() + meta.maxDaysAhead * 24 * 60 * 60000));
    dateInput.addEventListener("change", function () {
      state.date = dateInput.value;
      state.selectedSlot = null;
      updateDateLabel();
      refreshSlots();
      updateContactVisibility();
    });
    dateField.appendChild(dateInput);
    grid.appendChild(dateField);
    function updateDateLabel() {
      dateLabelSpan.textContent = state.date ? formatDateLabel(state.date) : "";
    }
    updateDateLabel();

    // Müsait Saatler
    var slotsField = el("div", { class: "uw-slots-item" });
    slotsField.appendChild(el("label", { class: "uw-label", html: 'Müsait Saatler <span class="uw-required">*</span>' }));
    var slotsBody = el("div", {});
    slotsField.appendChild(slotsBody);
    grid.appendChild(slotsField);
    slotsField.classList.add("uw-hidden");

    function renderSlots() {
      slotsBody.innerHTML = "";
      if (state.loadingSlots) {
        slotsBody.appendChild(el("p", { class: "uw-hint", text: "Müsaitlik kontrol ediliyor..." }));
        return;
      }
      if (state.slots.length === 0) {
        slotsBody.appendChild(el("p", { class: "uw-hint", text: "Bu tarihte müsait saat yok, başka bir tarih deneyin." }));
        return;
      }
      var slotsGrid = el("div", { class: "uw-slots-grid" });
      state.slots.forEach(function (s) {
        var selected = state.selectedSlot === s;
        var btn = el("button", {
          type: "button",
          class: "uw-slot" + (selected ? " selected" : ""),
          part: "slot" + (selected ? " slot-selected" : ""),
          text: formatSlotTime(s),
        });
        btn.addEventListener("click", function () {
          state.selectedSlot = s;
          renderSlots();
          updateContactVisibility();
        });
        slotsGrid.appendChild(btn);
      });
      slotsBody.appendChild(slotsGrid);
    }

    function refreshSlots() {
      state.slots = [];
      renderSlots();
      if (!state.serviceId || !state.date) {
        slotsField.classList.add("uw-hidden");
        return;
      }
      slotsField.classList.remove("uw-hidden");
      state.loadingSlots = true;
      renderSlots();
      var reqDate = state.date, reqService = state.serviceId;
      fetch(origin + "/api/public/randevu/" + encodeURIComponent(slug) + "/slots?date=" + reqDate + "&service_id=" + reqService)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (reqDate !== state.date || reqService !== state.serviceId) return; // eski istek, artık geçersiz
          state.slots = Array.isArray(data.slots) ? data.slots : [];
        })
        .catch(function () { state.slots = []; })
        .finally(function () {
          if (reqDate !== state.date || reqService !== state.serviceId) return;
          state.loadingSlots = false;
          renderSlots();
        });
    }

    // İletişim alanları — seçili saat olunca görünür (bkz. React sürümündeki
    // aynı davranış). Yazılan metnin kaybolmaması için bu bölüm SADECE
    // gizlenir/gösterilir, her state değişiminde yeniden oluşturulmaz.
    var contactSection = el("div", {});
    card.appendChild(contactSection);

    var nameField = el("div", { class: "uw-field" });
    nameField.appendChild(el("label", { class: "uw-label", html: 'Ad Soyad <span class="uw-required">*</span>' }));
    var nameInput = el("input", { type: "text", class: "uw-input", part: "field", required: "required" });
    nameInput.addEventListener("input", function () { state.customerName = nameInput.value; });
    nameField.appendChild(nameInput);
    contactSection.appendChild(nameField);

    var plateField = el("div", { class: "uw-field" });
    plateField.appendChild(el("label", { class: "uw-label", html: 'Araç Plakası <span class="uw-required">*</span>' }));
    var plateInput = el("input", { type: "text", class: "uw-input uw-mono", part: "field", required: "required", placeholder: "34 ABC 123" });
    plateInput.addEventListener("input", function () {
      plateInput.value = plateInput.value.replace(/\s+/g, "");
      state.plate = plateInput.value;
    });
    plateField.appendChild(plateInput);
    contactSection.appendChild(plateField);

    var phoneField = el("div", { class: "uw-field" });
    phoneField.appendChild(el("label", { class: "uw-label", html: 'Telefon <span class="uw-required">*</span>' }));
    var phoneInput = el("input", { type: "tel", class: "uw-input", part: "field", required: "required", placeholder: "05XX XXX XX XX" });
    phoneInput.addEventListener("input", function () { state.customerPhone = phoneInput.value; });
    phoneField.appendChild(phoneInput);
    contactSection.appendChild(phoneField);

    var errorBox = el("p", { class: "uw-error uw-hidden" });
    contactSection.appendChild(errorBox);

    var submitBtn = el("button", { type: "button", class: "uw-submit", part: "submit", text: "Randevu Talebi Gönder" });
    submitBtn.addEventListener("click", handleSubmit);
    contactSection.appendChild(submitBtn);

    contactSection.appendChild(
      el("p", {
        class: "uw-consent",
        html: 'Bu formu göndererek kişisel verilerinizin randevu talebinizin işlenmesi amacıyla kullanılmasını kabul edersiniz. <a href="#" style="text-decoration:underline;color:inherit;">Aydınlatma Metni</a>',
      })
    );

    function updateContactVisibility() {
      if (state.selectedSlot) contactSection.classList.remove("uw-hidden");
      else contactSection.classList.add("uw-hidden");
    }
    contactSection.classList.add("uw-hidden");

    function handleSubmit() {
      if (!state.selectedSlot || state.submitting) return;
      errorBox.classList.add("uw-hidden");
      state.submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Gönderiliyor...";

      fetch(origin + "/api/public/randevu/" + encodeURIComponent(slug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: state.plate.replace(/\s+/g, "").toUpperCase(),
          customer_name: state.customerName.trim() || null,
          customer_phone: state.customerPhone.trim(),
          service_id: state.serviceId,
          requested_at: state.selectedSlot,
          website: state.website,
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "Talep gönderilemedi.");
            showResult(data.status);
          });
        })
        .catch(function (err) {
          errorBox.textContent = err instanceof Error ? err.message : "Bir hata oluştu.";
          errorBox.classList.remove("uw-hidden");
        })
        .finally(function () {
          state.submitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = "Randevu Talebi Gönder";
        });
    }

    function showResult(status) {
      wrap.innerHTML = "";
      var approved = status === "ONAYLANDI";
      var resultBox = el("div", { class: "uw-result" });
      resultBox.appendChild(el("div", { class: "uw-result-icon", text: approved ? "✅" : "🕐" }));
      resultBox.appendChild(el("h1", { class: "uw-result-title", text: approved ? "Randevunuz onaylandı" : "Talebiniz alındı" }));
      resultBox.appendChild(
        el("p", {
          class: "uw-result-desc",
          text: approved
            ? meta.tenant.name + " sizi bekliyor."
            : meta.tenant.name + " talebinizi onayladığında bilgilendirileceksiniz.",
        })
      );
      wrap.appendChild(resultBox);
      reportHeight();
    }

    // Gömülü modda içerik boyu değişince (saat listesi genişleyip daralınca,
    // iletişim alanları açılınca vb.) host sayfaya haber ver — ama artık
    // iframe olmadığından yükseklik ayarına gerek YOK (form doğrudan sayfanın
    // akışında), sadece varsa dinleyen bir üst çerçeveye (örn. Randevu
    // Görünümü'ndeki iframe tabanlı önizleme) bilgi vermek için tutuluyor.
    function reportHeight() {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "ustalas-randevu-resize", height: root.host.scrollHeight }, "*");
      }
    }
    var resizeObserver = new ResizeObserver(reportHeight);
    resizeObserver.observe(hostEl);

    refreshSlots();
  }
})();
