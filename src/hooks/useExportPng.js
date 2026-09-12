import { useState, useCallback } from "react";
import { toPng } from "html-to-image";

/**
 * Hook that provides a `downloadPng` function and a `downloading` boolean.
 *
 * @param {React.RefObject} exportRef  - ref attached to the DOM node to capture
 * @param {string} [filename]          - downloaded file name (default: "kiekko-ahma-pelimainos.png")
 * @param {object} [options]
 * @param {number} [options.pixelRatio] - force an exact output scale (1 = node's CSS size).
 *   Omit to keep html-to-image's default, which follows the screen's devicePixelRatio and
 *   therefore exports a different size on every machine.
 * @param {string[]} [options.fonts]   - font shorthands ("400 166px 'Bebas Neue'") that must
 *   be loaded before capture, or the export silently falls back to a different typeface.
 */
export function useExportPng(exportRef, filename = "kiekko-ahma-pelimainos.png", options = {}) {
  const [downloading, setDownloading] = useState(false);
  const { pixelRatio, fonts } = options;

  const downloadPng = useCallback(async () => {
    if (!exportRef.current || downloading) return;

    const node = exportRef.current;
    setDownloading(true);

    const isAppleWebKit =
      /AppleWebKit/i.test(navigator.userAgent) && !/EdgA|EdgiOS/i.test(navigator.userAgent);

    try {
      // Webfonts first. document.fonts.check() is false until EVERY matching subset has
      // loaded, so a cold export can capture the fallback face; load() forces the issue.
      if (fonts?.length && document.fonts) {
        try {
          await Promise.all(fonts.map((f) => document.fonts.load(f)));
          await document.fonts.ready;
        } catch {}
      }

      // Wait for every <img> inside the canvas to be fully decoded by the browser
      // before any toPng call starts. html-to-image fetches images concurrently
      // with cache-busted URLs; if a slow request loses the race both slots can
      // end up with whichever image arrived first (the "wrong logo" bug).
      const imgs = Array.from(node.querySelectorAll("img"));
      await Promise.all(
        imgs.map(async (img) => {
          if (!img.complete) {
            await new Promise((res) => {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
            });
          }
          try {
            if (img.decode) await img.decode();
          } catch {}
        })
      );

      // Extra wait specifically for the background image + paint (WebKit can be late).
      // The background img is marked with data-export-bg="1".
      const bgImg = node.querySelector('img[data-export-bg="1"]');
      if (bgImg) {
        if (!bgImg.complete) {
          await new Promise((res) => {
            bgImg.addEventListener("load", res, { once: true });
            bgImg.addEventListener("error", res, { once: true });
          });
        }
        try {
          if (bgImg.decode) await bgImg.decode();
        } catch {}

        // Let layout/paint settle
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        // Small Safari/WebKit fallback delay (much better than a blind 1000 ms)
        if (isAppleWebKit) await new Promise((r) => setTimeout(r, 250));
      } else {
        // Still allow one paint before capture
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }

      const opts = { cacheBust: true, ...(pixelRatio ? { pixelRatio } : null) };
      // Warmup call — loads all resources into html-to-image's internal cache
      await toPng(node, opts);
      // Real export
      const dataUrl = await toPng(node, opts);

      // Convert dataURL → Blob → File
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: blob.type || "image/png" });

      // Mobile share sheet (iOS + Android modern browsers)
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title: "Kiekko-Ahma pelimainos" });
          return; // user handled it
        } catch {
          // user cancelled or share failed → fall through to download
        }
      }

      // Desktop / fallback download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("PNG export error:", err);
    } finally {
      setDownloading(false);
    }
  }, [exportRef, downloading, filename, pixelRatio, fonts]);

  return { downloading, downloadPng };
}
