import { useState } from 'react';
import { Mic } from 'lucide-react';
export function VoiceNoteUI({ note, onChange, disabled = false, availability = 'demo' }: { note: string; onChange: (text: string) => void; disabled?: boolean; availability?: 'demo' | 'permission-denied' | 'unsupported' }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'stopped' | 'cancelled'>('idle');
  return <section className="card" aria-label="Ghi chú gia vị"><h3>Ghi chú gia vị</h3>
    <p className="subtle">UI demo · Không mở microphone, không thu âm, không chuyển giọng nói thành chữ. Hãy nhập ghi chú bên dưới; chưa xử lý bằng AI hoặc lưu vào nhật ký.</p>
    <div className="capture-actions"><button type="button" className="secondary" disabled={disabled || availability !== 'demo' || phase === 'recording'} onClick={() => setPhase('recording')}><Mic size={18} aria-hidden="true" />Thử giao diện ghi âm (demo)</button>
      {phase === 'recording' && <><button type="button" className="secondary" disabled={disabled} onClick={() => setPhase('stopped')}>Dừng demo</button><button type="button" className="secondary" disabled={disabled} onClick={() => setPhase('cancelled')}>Hủy demo</button></>}
    </div>
    <p role="status">{availability === 'permission-denied' ? 'Mô phỏng quyền microphone bị từ chối. Bạn vẫn có thể nhập ghi chú.' : availability === 'unsupported' ? 'Thu âm chưa được hỗ trợ. Bạn vẫn có thể nhập ghi chú.' : { idle: 'Sẵn sàng nhập ghi chú.', recording: 'Đang mô phỏng ghi âm · Không thu âm thật.', stopped: 'Đã dừng demo. Không có bản chép lời tự động.', cancelled: 'Đã hủy demo. Ghi chú đã nhập được giữ lại.' }[phase]}</p>
    <label className="field">Ghi chú gia vị (bản nháp)<textarea disabled={disabled} maxLength={1000} value={note} onChange={e => onChange(e.target.value)} placeholder="Ví dụ: ít dầu, nước chấm để riêng…" /></label>
  </section>;
}
