export function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="check">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="7.5" fill="#ffcf3d" fillOpacity=".14" />
        <path d="m5.7 9.2 2.2 2.2 4.4-4.6" stroke="#ffcf3d" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </li>
  );
}
