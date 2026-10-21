"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Yatay taşan tablolar için ekranın altına yapışan kaydırma çubuğu. Tablo
// sayfadan uzunsa asıl (tarayıcının) yatay çubuğu tablonun en altında, ekran
// dışında kalıyor — fare kullanan kişi sağa sola kaydırmak için sayfanın
// sonuna inmek zorunda kalıyordu (tekerlek yalnızca dikey hareket üretir;
// touchpad/Magic Mouse yatayı doğrudan gönderdiği için onlarda sorun yoktu).
// Tablo ekrandayken ama alt kenarı ekranın altındayken ekranın dibinde bir
// kopya çubuk gösterilir, tabloyla iki yönlü eşlenir; alt kenar ekrana
// girince kopya gizlenir ve asıl çubuk devralır. Dokunmatik cihazlarda
// (pointer: coarse) hiç gösterilmez.
//
// Kopya çubuk 0 yükseklikli sticky bir kutunun içinde durur, sayfaya yer
// eklemez. Sticky'nin ekrana göre çalışması için bu bileşeni saran
// kartlarda overflow-hidden yerine overflow-clip kullanılmalı
// (overflow-hidden kaydırma kabı sayılır, sticky'yi kendine bağlar).
export function StickyScrollX({ children, className = "" }: { children: ReactNode; className?: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ show: false, width: 0 });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const fine = window.matchMedia("(pointer: fine)");
    let frame = 0;

    const measure = () => {
      frame = 0;
      const overflowing = scroller.scrollWidth > scroller.clientWidth + 1;
      const rect = scroller.getBoundingClientRect();
      // Asıl çubuk ekranın altında kalıyor ve tablonun bir kısmı görünüyor.
      const bottomHidden = rect.bottom > window.innerHeight && rect.top < window.innerHeight - 40;
      const show = fine.matches && overflowing && bottomHidden;
      setState((s) => (s.show === show && s.width === scroller.scrollWidth ? s : { show, width: scroller.scrollWidth }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    fine.addEventListener("change", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      fine.removeEventListener("change", schedule);
      ro.disconnect();
    };
  }, []);

  // Görünür olduğunda kopyayı tablonun o anki konumuna getir.
  useEffect(() => {
    if (state.show && barRef.current && scrollerRef.current) barRef.current.scrollLeft = scrollerRef.current.scrollLeft;
  }, [state.show, state.width]);

  // İki yönlü eşleme; karşı tarafın scroll olayı geri yansımasın diye
  // yalnızca değer farklıysa yazılır.
  const syncFrom = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  return (
    <>
      <div ref={scrollerRef} className={`overflow-x-auto ${className}`} onScroll={() => syncFrom(scrollerRef.current, barRef.current)}>
        {children}
      </div>
      <div className="sticky bottom-0 z-20 h-0" aria-hidden="true">
        <div
          ref={barRef}
          className={`sticky-scroll-x absolute inset-x-0 bottom-0 overflow-x-auto overflow-y-hidden ${state.show ? "" : "hidden"}`}
          onScroll={() => syncFrom(barRef.current, scrollerRef.current)}
        >
          <div style={{ width: state.width, height: 1 }} />
        </div>
      </div>
    </>
  );
}
