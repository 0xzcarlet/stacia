export function replyFor(text: string): string | undefined {
  switch (text.trim().toLowerCase()) {
    case ".ping":
      return "Pong! Bot WhatsApp aktif.";
    case ".help":
      return "Kirim video dengan caption .s atau balas video dengan .s.\nVideo harus memiliki audio; default maksimal input 20 MiB dan hasil 5 detik.\n.limit — kuota\n.ping — cek koneksi\n.help — bantuan\nStiker bersuara masih dalam uji kompatibilitas perangkat. Media diproses oleh bot dan file sementara dihapus setelah proses selesai.";
    default:
      return undefined;
  }
}
