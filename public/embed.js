/*
 * Online Randevu gömme script'i.
 *
 * Kullanım (firmanın kendi sitesine):
 *   <script src="https://<bu-siteni-domaini>/embed.js" data-slug="ustalas"></script>
 *
 * İsteğe bağlı öznitelikler:
 *   data-height="700"     — iframe yüklenene kadar gösterilecek başlangıç yüksekliği (px)
 *   data-target="my-div"  — belirli bir kapsayıcının içine yerleştir (id); verilmezse
 *                           script etiketinin hemen yanına eklenir
 *   data-max-width="720"  — iframe'in azami genişliği (px). Randevu Görünümü
 *                           ayarlarında "İki Kolon" düzeni seçildiyse formun
 *                           gerçekten iki kolon gösterebilmesi için varsayılan
 *                           480px'ten daha geniş bir alan gerekir.
 *
 * Nasıl çalışır: script kendi <script> etiketini bulur (document.currentScript),
 * gerçek randevu sayfasına (aynı domain'den /randevu/<slug>) işaret eden bir
 * <iframe> oluşturur. İçerik yüklendikçe randevu sayfası kendi boyunu
 * postMessage ile bildirir, bu script de iframe'in yüksekliğini buna göre
 * otomatik ayarlar — kaydırma çubuğu görünmez, taşma olmaz.
 */
(function () {
  "use strict";
  var currentScript = document.currentScript;
  if (!currentScript) return;

  var slug = currentScript.getAttribute("data-slug");
  if (!slug) {
    console.error("[embed.js] data-slug zorunludur, ör: <script src=\"...\" data-slug=\"ustalas\">");
    return;
  }

  var origin = new URL(currentScript.src).origin;
  var initialHeight = currentScript.getAttribute("data-height") || "700";
  var targetId = currentScript.getAttribute("data-target");
  var maxWidth = currentScript.getAttribute("data-max-width") || "480";

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/randevu/" + encodeURIComponent(slug) + "?embed=1";
  iframe.style.width = "100%";
  iframe.style.maxWidth = maxWidth + "px";
  iframe.style.border = "none";
  iframe.style.display = "block";
  iframe.style.height = initialHeight + "px";
  iframe.setAttribute("title", "Online Randevu");

  var target = targetId ? document.getElementById(targetId) : null;
  if (target) {
    target.appendChild(iframe);
  } else if (currentScript.parentNode) {
    currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (data && data.type === "ustalas-randevu-resize" && typeof data.height === "number") {
      iframe.style.height = data.height + "px";
    }
  });
})();
