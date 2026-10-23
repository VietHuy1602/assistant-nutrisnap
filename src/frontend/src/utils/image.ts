/**
 * src/frontend/src/utils/image.ts
 * Image processing utilities adhering to ADR-W3-05 (Privacy & Zero EXIF / GPS leakage).
 * Nén và thu nhỏ ảnh về cạnh dài tối đa 1280px và JPEG 0.8 để xóa sạch metadata cá nhân (EXIF/GPS).
 */

export const MAX_RAW_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Kiểm tra tính hợp lệ của tệp ảnh trước khi đưa vào luồng nhận diện.
 */
export function validateImageFile(file: File | Blob): ImageValidationResult {
  if (!file) {
    return { valid: false, error: 'Vui lòng chọn một tệp hình ảnh.' };
  }

  // Nếu là File có thuộc tính type
  if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Định dạng ảnh không được hỗ trợ. Vui lòng chọn tệp JPEG, PNG hoặc WebP.',
    };
  }

  if (file.size > MAX_RAW_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: 'Dung lượng ảnh vượt quá 10MB. Vui lòng chọn ảnh có kích thước nhỏ hơn.',
    };
  }

  return { valid: true };
}

export interface PrepareImageOptions {
  maxDimension?: number;
  quality?: number;
}

/**
 * Thu nhỏ ảnh và vẽ lại qua Canvas để loại bỏ hoàn toàn metadata EXIF/GPS,
 * xuất ra Blob JPEG chất lượng 0.8 để upload an toàn lên Backend.
 */
export async function prepareImageForUpload(
  source: Blob | File | HTMLCanvasElement,
  options: PrepareImageOptions = {},
): Promise<{ blob: Blob; sizeBytes: number }> {
  const maxDimension = options.maxDimension ?? 1280;
  const quality = options.quality ?? 0.8;

  // Nếu đầu vào đã là HTMLCanvasElement
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return canvasToBlob(source, quality);
  }

  // Môi trường Node / Test không có Image / canvas đầy đủ: trả về blob gốc nếu không hỗ trợ
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const rawBlob = source as Blob;
    return { blob: rawBlob, sizeBytes: rawBlob.size };
  }

  // Tạo URL tạm thời từ Blob
  const blobSource = source as Blob;
  const objectUrl = URL.createObjectURL(blobSource);

  try {
    const img = await loadImage(objectUrl);
    const { width, height } = calculateDownscaledDimensions(img.naturalWidth, img.naturalHeight, maxDimension);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Fallback nếu không lấy được 2d context
      return { blob: blobSource, sizeBytes: blobSource.size };
    }

    ctx.drawImage(img, 0, 0, width, height);
    return await canvasToBlob(canvas, quality);
  } catch {
    // Nếu có lỗi khi giải mã ảnh bằng Image, trả về blob ban đầu
    return { blob: blobSource, sizeBytes: blobSource.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Tính toán kích thước mới đảm bảo cạnh dài nhất không vượt quá maxDimension
 */
export function calculateDownscaledDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  if (origWidth <= 0 || origHeight <= 0) {
    return { width: Math.max(1, maxDimension), height: Math.max(1, maxDimension) };
  }

  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: origWidth, height: origHeight };
  }

  if (origWidth >= origHeight) {
    const width = maxDimension;
    const height = Math.round((origHeight * maxDimension) / origWidth);
    return { width, height: Math.max(1, height) };
  } else {
    const height = maxDimension;
    const width = Math.round((origWidth * maxDimension) / origHeight);
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<{ blob: Blob; sizeBytes: number }> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, sizeBytes: blob.size });
          } else {
            // Fallback nếu toBlob trả null
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const fallbackBlob = dataUriToBlob(dataUrl);
            resolve({ blob: fallbackBlob, sizeBytes: fallbackBlob.size });
          }
        },
        'image/jpeg',
        quality,
      );
    } else {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const fallbackBlob = dataUriToBlob(dataUrl);
      resolve({ blob: fallbackBlob, sizeBytes: fallbackBlob.size });
    }
  });
}

function dataUriToBlob(dataUri: string): Blob {
  const byteString = atob(dataUri.split(',')[1]);
  const mimeString = dataUri.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}
