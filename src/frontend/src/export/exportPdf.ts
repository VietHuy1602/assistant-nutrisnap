/**
 * src/frontend/src/export/exportPdf.ts
 * Tạo file PDF (A4 dọc) từ canvas báo cáo, hoàn toàn trên máy và KHÔNG dùng thư viện bên thứ ba
 * (ADR-W6-05, Safety Guard S3). Dùng cho app Android/iOS, nơi WebView không hỗ trợ window.print().
 *
 * Mỗi trang là một ảnh JPEG nhúng trực tiếp (bộ lọc DCTDecode của chuẩn PDF 1.4), nên chỉ cần
 * ghi cấu trúc PDF tối thiểu: Catalog, Pages, Page, nội dung vẽ ảnh và bảng xref.
 */

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_PT = 28;
const JPEG_QUALITY = 0.92;

function jpegBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cắt canvas dài thành các trang vừa khổ A4 khi ảnh giãn hết bề ngang. */
function sliceIntoPages(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const contentWidth = A4_WIDTH_PT - MARGIN_PT * 2;
  const contentHeight = A4_HEIGHT_PT - MARGIN_PT * 2;
  const pxPerPage = Math.floor((canvas.width * contentHeight) / contentWidth);
  const pages: HTMLCanvasElement[] = [];
  for (let top = 0; top < canvas.height; top += pxPerPage) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(pxPerPage, canvas.height - top);
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Không tạo được trang PDF.');
    ctx.fillStyle = '#ffffff'; // JPEG không có nền trong suốt
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    pages.push(slice);
  }
  return pages;
}

export async function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const pages = sliceIntoPages(canvas);
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObject = (id: number) => {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
  };

  // Đánh số đối tượng: 1 Catalog, 2 Pages, sau đó mỗi trang dùng 3 đối tượng (Page, Content, Image)
  const pageIds = pages.map((_, i) => 3 + i * 3);
  const totalObjects = 2 + pages.length * 3;

  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  beginObject(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  beginObject(2);
  write(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const drawWidth = A4_WIDTH_PT - MARGIN_PT * 2;
    const drawHeight = (page.height * drawWidth) / page.width;
    const y = A4_HEIGHT_PT - MARGIN_PT - drawHeight;

    beginObject(pageId);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}] ` +
        `/Resources << /XObject << /Im${i} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );

    const content = `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${MARGIN_PT} ${y.toFixed(2)} cm /Im${i} Do Q`;
    beginObject(contentId);
    write(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`);

    const jpeg = jpegBytes(page);
    beginObject(imageId);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    write(jpeg);
    write('\nendstream\nendobj\n');
  });

  const xrefOffset = length;
  write(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjects; id++) {
    write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}
