/**
 * src/frontend/src/export/saveNativeFile.ts
 * Lưu file xuất báo cáo trong app Android/iOS và mở bảng chia sẻ của hệ điều hành
 * để người dùng chọn nơi lưu (Files, Drive, Zalo, Gmail...).
 *
 * WebView không xử lý <a download> và window.print(), nên trên app phải ghi file qua
 * @capacitor/filesystem. File ghi tạm vào thư mục Cache riêng của app (không cần quyền bộ nhớ),
 * không gửi đi đâu cho tới khi người dùng tự chọn trong bảng chia sẻ, và bị xóa ngay sau đó.
 */

import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được dữ liệu file.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Ghi file rồi mở bảng chia sẻ. Trả về false nếu người dùng đóng bảng chia sẻ mà không chọn. */
export async function saveAndShareNativeFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });

  try {
    await Share.share({ title, files: [uri], dialogTitle: 'Lưu hoặc chia sẻ báo cáo' });
    return true;
  } catch (err) {
    // Người dùng đóng bảng chia sẻ: không phải lỗi
    if (err instanceof Error && /cancel/i.test(err.message)) return false;
    throw err;
  } finally {
    // ADR-W6-06: báo cáo là dữ liệu sức khỏe, không giữ bản sao trong app sau khi đã chia sẻ/lưu
    await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => undefined);
  }
}
