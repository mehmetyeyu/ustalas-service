// Ödeme şekli "Nakit" seçildiğinde, hangi fiziksel kasadan/kasaya
// olduğunu seçtiren opsiyonel bir dropdown — bkz. src/app/admin/kasa/page.tsx
// dosya başı yorumu. Tenant hiç kasa tanımlamamışsa (kasaOptions boş) hiçbir
// şey render etmez, davranış özellik hiç yokmuş gibi kalır.
export function KasaSelect({
  value, onChange, kasaOptions, className,
}: {
  value: number | null;
  onChange: (kasaId: number | null) => void;
  kasaOptions: { id: number; name: string }[];
  className: string;
}) {
  if (kasaOptions.length === 0) return null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={className}
    >
      <option value="">Kasa seç...</option>
      {kasaOptions.map((k) => (
        <option key={k.id} value={k.id}>{k.name}</option>
      ))}
    </select>
  );
}
