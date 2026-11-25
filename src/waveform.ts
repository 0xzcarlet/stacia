/** 64 normalized RMS samples for WhatsApp's audio preview (mono signed 16-bit PCM). */
export function waveformFromPcm(pcm: Buffer): Uint8Array {
  const samples = Math.floor(pcm.length / 2);
  const levels = Array.from({ length: 64 }, (_, bucket) => {
    const start = Math.floor((bucket * samples) / 64);
    const end = Math.floor(((bucket + 1) * samples) / 64);
    let energy = 0;
    for (let sample = start; sample < end; sample++) {
      const value = pcm.readInt16LE(sample * 2) / 32768;
      energy += value * value;
    }
    return end > start ? Math.sqrt(energy / (end - start)) : 0;
  });
  const peak = Math.max(...levels);
  return Uint8Array.from(levels, (value) =>
    peak ? Math.round((100 * value) / peak) : 0,
  );
}
