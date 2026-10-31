/**
 * src/frontend/src/utils/nativeCamera.ts
 * Chụp ảnh bằng ứng dụng camera gốc của Android/iOS qua @capacitor/camera.
 *
 * Trong app Android, WebView chạy ở origin http:// (chế độ LAN debug) không được phép dùng
 * getUserMedia, nên camera WebRTC không bật được. Camera gốc hoạt động với cả HTTP lẫn HTTPS.
 * Trên trình duyệt web vẫn dùng camera WebRTC như cũ.
 */

import { Capacitor } from '@capacitor/core';

export type NativePhotoResult =
  | { status: 'ok'; blob: Blob }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export function isNativeCameraAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function takeNativePhoto(): Promise<NativePhotoResult> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 85,
      width: 1600,
      correctOrientation: true,
      saveToGallery: false,
    });
    if (!photo.webPath) return { status: 'cancelled' };
    const blob = await (await fetch(photo.webPath)).blob();
    return { status: 'ok', blob };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Người dùng bấm quay lại / hủy trong app camera
    if (/cancel/i.test(message)) return { status: 'cancelled' };
    if (/denied|permission/i.test(message)) {
      return { status: 'error', message: 'Ứng dụng chưa được cấp quyền Camera. Hãy cho phép trong Cài đặt rồi thử lại.' };
    }
    return { status: 'error', message: 'Không mở được camera. Bạn có thể chọn ảnh từ thư viện.' };
  }
}
