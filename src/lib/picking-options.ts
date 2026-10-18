export const pickingOptions = {
  pickingTypes: [
    { value: "SQUEEZE", label: "Memencet jerawat" },
    { value: "PEEL", label: "Mengelupas koreng atau kulit yang sedang sembuh" },
    {
      value: "TOUCH_FIDGET",
      label: "Meraba atau mengutak-atik kulit tanpa sengaja melukai",
    },
  ],
  triggers: [
    { value: "TEXTURE_FEEL", label: "Merasa ada benjolan atau tekstur kulit" },
    { value: "MIRROR", label: "Melihat kulit di cermin" },
    { value: "DRY_SCAB", label: "Melihat atau merasakan koreng yang kering" },
    { value: "STRESS", label: "Stres atau cemas" },
    { value: "BOREDOM", label: "Bosan atau tidak ada kegiatan" },
    { value: "AUTOMATIC_HAND", label: "Tangan bergerak otomatis tanpa sadar" },
    { value: "SEEK_RELIEF", label: "Ingin merasakan kepuasan atau kelegaan" },
    { value: "OTHER", label: "Pemicu lainnya" },
  ],
  emotions: [
    { value: "ANXIOUS", label: "Cemas atau gelisah" },
    { value: "STRESSED", label: "Stres atau tertekan" },
    { value: "BORED", label: "Bosan" },
    { value: "FRUSTRATED", label: "Kesal atau frustrasi" },
    { value: "NUMB", label: "Kosong atau tidak merasakan apa-apa" },
    { value: "CURIOUS", label: "Penasaran atau ingin merasa puas" },
    { value: "SEEK_RELIEF", label: "Ingin merasa lega" },
    { value: "NEUTRAL", label: "Netral atau biasa saja" },
    { value: "OTHER", label: "Emosi lainnya" },
  ],
  reasons: [
    {
      value: "REMOVE_TEXTURE",
      label: "Ingin menghilangkan benjolan atau tekstur yang terasa mengganggu",
    },
    {
      value: "PEEL_DRY_SKIN",
      label: "Ingin mengelupas kulit atau koreng yang kering",
    },
    {
      value: "SEEK_SATISFACTION",
      label: "Mencari rasa puas saat memencet atau mengelupas",
    },
    { value: "RELIEVE_URGE", label: "Mencari kelegaan dari dorongan" },
    {
      value: "WANT_SMOOTH_SKIN",
      label: "Ingin kulit terasa lebih halus atau terlihat lebih bersih",
    },
    {
      value: "AUTOMATIC_UNCONSCIOUS",
      label: "Melakukannya tanpa sadar atau tanpa alasan yang jelas",
    },
    { value: "OTHER", label: "Alasan lainnya" },
  ],
  impacts: [
    { value: "RED_IRRITATION", label: "Kulit menjadi merah atau iritasi" },
    { value: "BLEEDING_WOUND", label: "Kulit terluka atau berdarah" },
    { value: "NEW_SCAB", label: "Terbentuk koreng baru" },
    { value: "STINGING_PAIN", label: "Terasa perih atau sakit" },
    { value: "MARKS_SCARS", label: "Meninggalkan bekas pada kulit" },
    { value: "TEMPORARY_RELIEF", label: "Merasa lega atau puas sementara" },
    { value: "REGRET_DISAPPOINTED", label: "Merasa menyesal atau kecewa" },
  ],
  durationRanges: [
    { value: "UNDER_1_MIN", label: "Kurang dari 1 menit" },
    { value: "FROM_1_TO_5_MIN", label: "1–5 menit" },
    { value: "FROM_6_TO_15_MIN", label: "6–15 menit" },
    { value: "FROM_16_TO_30_MIN", label: "16–30 menit" },
    { value: "OVER_30_MIN", label: "Lebih dari 30 menit" },
  ],
  contexts: [
    { value: "ALONE_IN_ROOM", label: "Sendirian di kamar" },
    { value: "IN_FRONT_OF_MIRROR", label: "Di depan cermin atau kamar mandi" },
    { value: "USING_PHONE_WATCHING", label: "Saat menggunakan HP atau menonton" },
    { value: "STUDYING_WORKING", label: "Saat belajar atau bekerja" },
    { value: "BEFORE_SLEEP", label: "Sebelum tidur" },
    { value: "OTHER_ACTIVITY", label: "Saat melakukan aktivitas lain" },
    { value: "OTHER", label: "Konteks lainnya" },
  ],
  urgeStrengths: [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
  ],
} as const;

export function getPickingOptionLabel(value: string | number): string {
  const strVal = String(value);
  for (const options of Object.values(pickingOptions)) {
    const option = (options as readonly { value: unknown; label: string }[]).find(
      (candidate) => String(candidate.value) === strVal
    );
    if (option) return option.label;
  }
  return strVal;
}
