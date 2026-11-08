import { degrees, PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

/**
 * A PDF of the file with the stamp on every page: large and faint across the middle, and small along the
 * bottom. An image becomes a one-page PDF first, so every file a viewer opens carries the stamp.
 */
export async function stampFile(
  bytes: Uint8Array,
  mime: string,
  line: string,
): Promise<Uint8Array> {
  let pdf: PDFDocument;
  if (mime === "application/pdf") {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } else {
    pdf = await PDFDocument.create();
    const image = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const scale = Math.min(1, 1500 / Math.max(image.width, image.height));
    const page = pdf.addPage([image.width * scale, image.height * scale]);
    page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const big = Math.max(12, Math.min(width, height) / 22);
    const across = font.widthOfTextAtSize(line, big);
    const angle = Math.atan2(height, width);
    page.drawText(line, {
      x: width / 2 - (across / 2) * Math.cos(angle),
      y: height / 2 - (across / 2) * Math.sin(angle),
      size: big,
      font,
      color: rgb(0.55, 0.55, 0.6),
      opacity: 0.28,
      rotate: degrees((angle * 180) / Math.PI),
    });
    page.drawText(line, { x: 18, y: 12, size: 8, font, color: rgb(0.35, 0.35, 0.4), opacity: 0.9 });
  }
  return await pdf.save();
}
