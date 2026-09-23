"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

// Kapanış bölümündeki el sallama ikonu — Figma'daki statik görseli
// canlandırır: bölüm ekrana girince bir kez elle sallar (IntersectionObserver),
// üzerindeyken de fare X konumuna göre hafifçe eğilir (kullanıcı isteği:
// "O section'a geldiğinde mouse hareketinde o görselde hareket etse").
// prefers-reduced-motion'da hiçbir animasyon çalışmaz.
export default function WaveHand() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const section = wrap.closest(".closing") as HTMLElement | null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          inner.classList.add("is-waving");
        } else {
          inner.classList.remove("is-waving");
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(wrap);

    function handleMouseMove(e: MouseEvent) {
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      inner!.style.setProperty("--mouse-tilt", `${relX * 22}deg`);
    }
    section?.addEventListener("mousemove", handleMouseMove);

    function clearTilt() {
      inner!.style.setProperty("--mouse-tilt", "0deg");
    }
    section?.addEventListener("mouseleave", clearTilt);

    return () => {
      observer.disconnect();
      section?.removeEventListener("mousemove", handleMouseMove);
      section?.removeEventListener("mouseleave", clearTilt);
    };
  }, []);

  return (
    <div ref={wrapRef} className="wave-hand">
      <div ref={innerRef} className="wave-hand-inner">
        <Image src="/elevire/wave-hand.png" alt="" width={110} height={127} priority={false} />
      </div>
    </div>
  );
}
