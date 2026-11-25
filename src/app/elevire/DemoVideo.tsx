"use client";

import { useRef, useState, type MouseEvent } from "react";

const VIDEO_ID = "nCuwnhov0Hs";
const VIDEO_TITLE = "Elevire: 1 dakikada tanıtım";

// "1 dakikalık demoyu izle" — video sayfadan çıkmadan pencerede açılır. Oynatıcı
// yalnızca tıklanınca yüklenir (önce YouTube'a hiç istek gitmez) ve çerezsiz
// alan adından gelir (CSP frame-src, bkz. next.config.js). Yeni sekmede açma
// (ctrl/cmd/orta tık) ve JS'siz tarayıcıda düz YouTube bağlantısı çalışır.
export default function DemoVideo() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function show(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !dialogRef.current?.showModal) return;
    e.preventDefault();
    setOpen(true);
    dialogRef.current.showModal();
  }

  return (
    <>
      <a className="btn btn-light" href={`https://youtu.be/${VIDEO_ID}`} target="_blank" rel="noopener noreferrer" onClick={show}>
        1 dakikalık demoyu izle
      </a>
      {/* Pencere kapanınca iframe kaldırılır, video durur. */}
      <dialog
        ref={dialogRef}
        className="video-dialog"
        aria-label={VIDEO_TITLE}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <div className="video-box">
          <button type="button" className="video-close" aria-label="Videoyu kapat" onClick={() => dialogRef.current?.close()}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
          <div className="video-frame">
            {open && (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&playsinline=1&hl=tr`}
                title={VIDEO_TITLE}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
