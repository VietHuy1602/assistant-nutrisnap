import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, ScanLine, Check, ArrowRight, X } from 'lucide-react';
import type { MealType, NutritionAPI, Portion } from './types';
import { errorText } from './api';
import { Notice, Field } from './UI';
import { PortionEditor } from './PortionEditor';
import styles from './MealLogging.module.css';
import { VoiceNoteUI } from './VoiceNoteUI';

export function MealCaptureFlow({ api, demo, initialMode = 'photo', onSaved, onClose }: {
  api: NutritionAPI; demo: boolean; initialMode?: 'photo' | 'manual'; onSaved?: () => void; onClose?: () => void;
}) {
  const [draftNote, setDraftNote] = useState('');
  const [meal, setMeal] = useState<MealType>('lunch');
  const [image, setImage] = useState('');
  const [items, setItems] = useState<Portion[] | null>(initialMode === 'manual' ? [] : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const generation = useRef(0);
  const fileGeneration = useRef(0);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (video.current && stream) {
      video.current.srcObject = stream;
      void video.current.play().catch(() => setError('Chưa thể mở video. Hãy chọn ảnh từ thiết bị.'));
    }
    return () => { stream?.getTracks().forEach(track => track.stop()); };
  }, [stream]);
  useEffect(() => () => { generation.current++; fileGeneration.current++; }, []);
  useEffect(() => { if (confirmClose) keepRef.current?.focus(); }, [confirmClose]);
  const stop = () => {
    generation.current++; stream?.getTracks().forEach(track => track.stop()); setStream(null); setCamera(false);
  };
  const openCamera = async () => {
    const token = ++generation.current; setError(''); setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Unavailable');
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (token !== generation.current) { nextStream.getTracks().forEach(track => track.stop()); return; }
      setStream(nextStream); setCamera(true);
    } catch { if (token === generation.current) setError('Không mở được camera. Bạn có thể cấp quyền trong trình duyệt, tải ảnh hoặc chọn món thủ công.'); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const capture = () => {
    const currentVideo = video.current;
    if (!currentVideo?.videoWidth) return;
    const canvas = document.createElement('canvas'); canvas.width = currentVideo.videoWidth; canvas.height = currentVideo.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { setError('Không chụp được ảnh. Vui lòng tải ảnh từ thiết bị.'); return; }
    context.drawImage(currentVideo, 0, 0); setImage(canvas.toDataURL('image/jpeg', 0.88)); stop();
  };
  const readFile = (selected?: File) => {
    setError(''); if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024) {
      setError('Chọn ảnh JPG, PNG hoặc WebP, tối đa 8 MB.'); return;
    }
    const token = ++fileGeneration.current; const reader = new FileReader();
    reader.onload = () => { if (token === fileGeneration.current) { setImage(String(reader.result)); stop(); } };
    reader.onerror = () => { if (token === fileGeneration.current) setError('Không đọc được ảnh. Vui lòng chọn lại.'); };
    reader.readAsDataURL(selected);
  };
  const recognize = async () => {
    if (!image || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await api.preview(image, meal);
      if (result.status === 'unrecognized' || !result.detected_items.length || result.detected_items.some(item => !Number.isFinite(item.confidence) || item.confidence < 0.5 || !Number.isFinite(item.estimated_gram) || item.estimated_gram <= 0 || ![item.estimated_calories, item.protein_g, item.carbs_g, item.fat_g].every(Number.isFinite))) {
        setError('Chưa nhận diện rõ món ăn. Bạn có thể chụp lại hoặc chọn món thủ công.'); return;
      }
      setItems(result.detected_items.map(item => ({
        key: crypto.randomUUID(), food_id: item.food_id, food_name: item.food_name, grams: String(item.estimated_gram),
        per100: [item.estimated_calories, item.protein_g, item.carbs_g, item.fat_g].map(value => value / item.estimated_gram * 100) as Portion['per100'],
      })));
    } catch (err) { setError(errorText(err)); }
    finally { locked.current = false; setBusy(false); }
  };
  const requestClose = () => {
    if (busy || editorBusy) return;
    if (saved === null && (image || items !== null || draftNote.trim())) setConfirmClose(true);
    else { stop(); onClose?.(); }
  };

  return <div className={styles.flow} aria-busy={busy || editorBusy}>
    <div className="section-top"><div className="page-heading"><p>NHẬT KÝ BỮA ĂN</p><h2>{saved !== null ? 'Đã ghi nhận bữa ăn.' : items ? 'Bữa ăn của bạn, bạn quyết định.' : 'Thêm một bữa ăn.'}</h2><p>Kiểm tra món và khẩu phần trước khi xác nhận.</p></div>
      {onClose && <button type="button" className="secondary" disabled={busy || editorBusy} onClick={requestClose}><X size={18} aria-hidden="true" />Đóng ghi bữa ăn</button>}</div>
    {confirmClose && <div role="alert" className="discard-notice"><div><p>Bản nháp chưa được lưu. Bạn có muốn bỏ bản nháp?</p><div className="capture-actions">
      <button ref={keepRef} type="button" className="secondary" onClick={() => setConfirmClose(false)}>Tiếp tục chỉnh sửa</button>
      <button type="button" className="secondary" onClick={() => { stop(); onClose?.(); }}>Bỏ bản nháp</button>
    </div></div></div>}
    {saved !== null ? <section className="card saved-state" role="status"><Check className="success-icon" aria-hidden="true" /><h2>{demo ? 'Đã hoàn tất mô phỏng' : 'Đã lưu vào nhật ký'}</h2><p>{Math.round(saved)} kcal ước tính · {demo ? 'Không ghi dữ liệu thật.' : 'Đã nhận xác nhận từ hệ thống.'}</p><Notice />
      <button type="button" className="primary" onClick={() => { setSaved(null); setDraftNote(''); setConfirmClose(false); setItems(initialMode === 'manual' ? [] : null); setImage(''); }}>Thêm bữa ăn khác <ArrowRight size={18} aria-hidden="true" /></button>
    </section> : items ? <><Field label="Bữa ăn"><select disabled={editorBusy} value={meal} onChange={event => setMeal(event.target.value as MealType)}><option value="breakfast">Bữa sáng</option><option value="lunch">Bữa trưa</option><option value="dinner">Bữa tối</option><option value="snack">Bữa phụ</option></select></Field>
      <PortionEditor draftNote={draftNote} onDraftNoteChange={setDraftNote} api={api} initial={items} meal={meal} image={image} demo={demo} onBusyChange={setEditorBusy} onBack={() => { setItems(null); setDraftNote(''); setConfirmClose(false); }} onSaved={calories => { setSaved(calories); setConfirmClose(false); onSaved?.(); }} /></>
      : <div className="capture-layout"><section className="card capture-card"><div className="section-top"><h2>Ảnh bữa ăn</h2><span className="status-pill">BƯỚC 1 / 2</span></div>
        <Field label="Bữa ăn"><select disabled={busy} value={meal} onChange={event => setMeal(event.target.value as MealType)}><option value="breakfast">Bữa sáng</option><option value="lunch">Bữa trưa</option><option value="dinner">Bữa tối</option><option value="snack">Bữa phụ</option></select></Field>
        <div className={`camera-stage ${image ? 'has-image' : ''}`}>
          {camera ? <><video ref={video} playsInline muted aria-label="Xem trước camera" /><button type="button" className="camera-close icon-button" onClick={stop} aria-label="Tắt camera"><X aria-hidden="true" /></button></> : image ? <img src={image} alt="Ảnh bữa ăn đã chọn" /> : <><ScanLine size={44} strokeWidth={1.3} aria-hidden="true" /><h3>Đặt trọn bữa ăn trong khung</h3><p>Ánh sáng rõ giúp bạn kiểm tra kết quả dễ hơn.</p></>}
        </div>
        <input className="sr-only" ref={file} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh bữa ăn" onChange={event => { readFile(event.target.files?.[0]); event.target.value = ''; }} />
        <div className="capture-actions">{camera ? <button type="button" className="primary" onClick={capture}><Camera size={18} aria-hidden="true" />Chụp ảnh</button> : <button type="button" className="primary" disabled={busy} onClick={() => void openCamera()}><Camera size={18} aria-hidden="true" />Mở camera</button>}
          <button type="button" className="secondary" disabled={busy} onClick={() => file.current?.click()}><Upload size={18} aria-hidden="true" />{image ? 'Đổi ảnh' : 'Tải ảnh lên'}</button></div>
        <p className="subtle">JPG, PNG, WebP · Tối đa 8 MB</p><VoiceNoteUI note={draftNote} onChange={setDraftNote} disabled={busy} />
        {error && <p className="error" role="alert">{error}</p>}{busy && <p role="status" className="subtle">Đang xử lý… Bạn sẽ kiểm tra kết quả trước khi lưu.</p>}
        {image && <button type="button" className="primary" disabled={busy || camera} onClick={() => void recognize()}>{busy ? 'Đang nhận diện…' : 'Nhận diện món ăn'}<ArrowRight size={18} aria-hidden="true" /></button>}
        <button type="button" className="text-button" disabled={busy} onClick={() => { stop(); setError(''); setItems([]); }}>Chọn món thủ công <ArrowRight size={16} aria-hidden="true" /></button>
      </section><aside className="capture-aside"><span className="eyebrow">CHỤP RÕ HƠN, SỬA DỄ HƠN</span><h2>Một tấm ảnh.<br />Bạn kiểm tra phần còn lại.</h2><ol className="tips"><li><strong>Chụp từ phía trên</strong><p>Để toàn bộ đĩa hoặc bát nằm trong ảnh.</p></li><li><strong>Kiểm tra từng món</strong><p>Sửa tên món và số gam trước khi lưu.</p></li><li><strong>Chọn món thủ công khi cần</strong><p>Nếu nhận diện chưa rõ, bạn vẫn có thể tìm món trong danh sách.</p></li></ol><Notice /><p className="subtle">Ảnh chỉ được gửi để phân tích khi bạn bấm “Nhận diện món ăn”.</p></aside></div>}
  </div>;
}
