/**
 * Failure effects drawn over a screen canvas after its normal frame:
 * torn scanlines, colour fringing and static, or a dead panel.
 */
export function glitch(canvas: HTMLCanvasElement, amount: number) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  // Torn horizontal bands slide sideways.
  const bands = Math.ceil(amount * 9);
  for (let i = 0; i < bands; i++) {
    const y = Math.random() * h;
    const bh = 6 + Math.random() * h * 0.08 * amount;
    const dx = (Math.random() - 0.5) * w * 0.25 * amount;
    ctx.drawImage(canvas, 0, y, w, bh, dx, y, w, bh);
  }
  // Colour fringe: a tinted copy offset to one side.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.25 * amount;
  ctx.drawImage(canvas, 6 * amount, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  staticNoise(ctx, w, h, 0.35 * amount);
}

export function dead(canvas: HTMLCanvasElement, flickerOn: boolean) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = '#020202';
  ctx.fillRect(0, 0, w, h);
  if (flickerOn) staticNoise(ctx, w, h, 0.12);
}

const noiseTiles: HTMLCanvasElement[] = [];
function staticNoise(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  if (!noiseTiles.length) {
    for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 160;
      const x = c.getContext('2d')!;
      const img = x.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      noiseTiles.push(c);
    }
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(noiseTiles[Math.floor(Math.random() * noiseTiles.length)], 0, 0, w, h);
  ctx.globalAlpha = 1;
}
