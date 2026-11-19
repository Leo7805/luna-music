/**
 * Extracts a dominant, vibrant ambient color from an image URL using an offscreen canvas.
 * Returns an RGBA string suitable for backdrop glows.
 */
export async function extractDominantColor(imageUrl: string): Promise<{ primary: string; glow: string } | null> {
  if (!imageUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        // Downsample to 32x32 for fast processing
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let countedPixels = 0;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          // Skip transparent or near-black/near-white pixels for richer vibrancy
          if (a < 128) continue;
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 20 || brightness > 235) continue;

          rSum += r;
          gSum += g;
          bSum += b;
          countedPixels++;
        }

        if (countedPixels === 0) {
          resolve(null);
          return;
        }

        const avgR = Math.round(rSum / countedPixels);
        const avgG = Math.round(gSum / countedPixels);
        const avgB = Math.round(bSum / countedPixels);

        resolve({
          primary: `rgba(${avgR}, ${avgG}, ${avgB}, 0.22)`,
          glow: `rgba(${Math.min(255, avgR + 30)}, ${Math.min(255, avgG + 20)}, ${Math.min(255, avgB + 40)}, 0.15)`,
        });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
