/**
 * src/frontend/src/export/exportPng.ts
 * Tải canvas về máy người dùng dưới dạng ảnh PNG (ADR-W6-05, ADR-W6-06).
 * RÀNG BUỘC (ISC-11):
 * - Không gửi ảnh đi bất kỳ đâu (0 network requests).
 * - Không lưu ảnh vào localStorage hay bất kỳ kho lưu trữ nào.
 * - Thu hồi Object URL ngay sau khi kích hoạt tải.
 */

import { isNativeApp, saveAndShareNativeFile } from './saveNativeFile';

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể tạo file ảnh PNG từ Canvas.'));
    }, 'image/png');
  });
}

export async function exportCanvasAsPng(
  canvas: HTMLCanvasElement,
  filename = 'NutriSnap_BaoCaoThang.png'
): Promise<void> {
  // App Android/iOS: WebView bỏ qua <a download>, nên ghi file và mở bảng chia sẻ để lưu
  if (isNativeApp()) {
    await saveAndShareNativeFile(await canvasToPngBlob(canvas), filename, 'Báo cáo NutriSnap (PNG)');
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Không thể tạo file ảnh PNG từ Canvas.'));
            return;
          }

          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Thu hồi URL sau 1 giây
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 1000);

          resolve();
        },
        'image/png'
      );
    } catch (err) {
      reject(err);
    }
  });
}
