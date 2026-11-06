/**
 * src/frontend/src/pages/OnboardingSurvey.tsx
 * Bộ 11 câu hỏi chỉ xuất hiện một lần, ngay sau khi tạo tài khoản (lần đầu vào app). Câu trả lời được AI tổng hợp thành hồ sơ ăn uống,
 * lưu vào database và dùng cho Thực đơn gợi ý và AI Coach.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { Mascot, type MascotPose } from '../components/common/Mascot';
import { preferenceApi, type Choice, type PreferenceAnswers, type Preferences } from '../api/preferenceApi';
import { useAuth } from '../context/AuthContext';

type ChoiceKey = Exclude<keyof PreferenceAnswers, 'allergies' | 'daily_budget_vnd'>;
interface ChoiceQuestion {
  kind: 'choice';
  key: ChoiceKey;
  title: string;
  pose: MascotPose;
  options: Array<[string, string]>;
}
interface TextQuestion { kind: 'allergies' | 'budget'; title: string; pose: MascotPose }
type Question = ChoiceQuestion | TextQuestion;

const LETTERS: Choice[] = ['A', 'B', 'C', 'D'];
export const QUESTIONS: Question[] = [
  { kind: 'choice', key: 'age_group', pose: 'wave', title: 'Độ tuổi hiện tại của bạn nằm trong khoảng nào?', options: [
    ['Dưới 18 tuổi', 'Độ tuổi đang phát triển thể chất, cần năng lượng cao.'],
    ['Từ 18 – 24 tuổi', 'Tốc độ trao đổi chất nhanh, lịch sinh hoạt năng động.'],
    ['Từ 25 – 34 tuổi', 'Cần duy trì vóc dáng và kiểm soát năng lượng ổn định.'],
    ['Từ 35 tuổi trở lên', 'Ưu tiên bảo toàn cơ bắp và sức khỏe chuyển hóa.'],
  ] },
  { kind: 'choice', key: 'activity', pose: 'running', title: 'Mức độ vận động hàng ngày của bạn là gì?', options: [
    ['Ít vận động', 'Làm việc văn phòng, ít hoặc không tập thể dục.'],
    ['Vận động nhẹ', 'Tập thể dục nhẹ nhàng 1–3 ngày/tuần.'],
    ['Vận động vừa phải', 'Tập thể dục đều đặn 3–5 ngày/tuần.'],
    ['Vận động nhiều', 'Tập cường độ cao 6–7 ngày/tuần hoặc vận động viên.'],
  ] },
  { kind: 'choice', key: 'goal', pose: 'workout', title: 'Mục tiêu vóc dáng và sức khỏe hiện tại của bạn là gì?', options: [
    ['Giảm cân', 'Thâm hụt calo lành mạnh, bảo toàn khối cơ.'],
    ['Duy trì vóc dáng', 'Cân bằng năng lượng nạp vào và tiêu hao.'],
    ['Tăng cơ', 'Dư thừa calo nhẹ kết hợp lượng đạm tối ưu.'],
    ['Ăn uống lành mạnh hơn', 'Tối ưu sức khỏe chung, không áp lực cân nặng.'],
  ] },
  { kind: 'choice', key: 'pace', pose: 'thinking', title: 'Tốc độ thay đổi cân nặng bạn mong muốn mỗi tuần là bao nhiêu?', options: [
    ['Chậm mà chắc', '0,25 kg/tuần – dễ duy trì, thoải mái ăn uống.'],
    ['Tiêu chuẩn', '0,50 kg/tuần – cân bằng giữa hiệu quả và sức khỏe.'],
    ['Tối đa an toàn', '0,75 kg/tuần – cần kỷ luật ăn uống và tập luyện cao.'],
    ['Giữ nguyên cân nặng', '0 kg/tuần.'],
  ] },
  { kind: 'choice', key: 'diet', pose: 'eating', title: 'Bạn muốn theo đuổi chế độ ăn uống nào nhất?', options: [
    ['Cơm nhà truyền thống', 'Đủ cơm, thịt, cá, canh rau quen thuộc.'],
    ['Eat Clean', 'Ưu tiên đồ luộc, hấp, áp chảo, hạn chế tối đa dầu mỡ.'],
    ['Low-Carb', 'Giảm tinh bột như cơm, bún, phở; tăng đạm và rau xanh.'],
    ['Ăn chay / Thực vật', 'Ưu tiên đậu hũ, nấm, các loại đậu, trứng và sữa.'],
  ] },
  { kind: 'choice', key: 'taste', pose: 'eating', title: 'Khẩu vị chế biến món ăn bạn yêu thích là gì?', options: [
    ['Thanh đạm, ít gia vị', 'Giữ vị ngọt tự nhiên của nguyên liệu.'],
    ['Đậm đà, cay nồng', 'Thích các món kho, xào có vị cay kích thích.'],
    ['Ngọt dịu, hài hòa', 'Thích các món canh hầm, rim hoặc trộn sốt.'],
    ['Linh hoạt, dễ ăn', 'Phù hợp với mọi phong cách nêm nếm.'],
  ] },
  { kind: 'choice', key: 'protein', pose: 'workout', title: 'Nguồn chất đạm nào bạn ưu tiên nhất trong bữa ăn?', options: [
    ['Gia cầm và trứng', 'Ức gà, thịt gà, vịt, trứng các loại.'],
    ['Thịt đỏ', 'Thịt heo nạc, thịt bò.'],
    ['Thủy hải sản', 'Cá, tôm, mực, nghêu, sò.'],
    ['Đạm thực vật', 'Đậu hũ, nấm, sữa hạt, các loại đậu.'],
  ] },
  { kind: 'allergies', pose: 'thinking', title: 'Bạn có bị dị ứng hoặc muốn tránh thực phẩm nào không?' },
  { kind: 'choice', key: 'cooking', pose: 'snap', title: 'Bạn thường chuẩn bị bữa ăn hàng ngày theo hình thức nào?', options: [
    ['Tự nấu tại nhà', 'Cần gợi ý món kèm định lượng nguyên liệu dễ chế biến.'],
    ['Ăn hàng quán / Cơm văn phòng', 'Cần gợi ý các món Việt phổ biến dễ gọi.'],
    ['Kết hợp', 'Tự nấu bữa sáng/tối và ăn ngoài vào buổi trưa.'],
    ['Mua đồ ăn nhanh gọn', 'Tại siêu thị hoặc cửa hàng tiện lợi.'],
  ] },
  { kind: 'choice', key: 'meals', pose: 'eating', title: 'Thói quen phân bổ số bữa ăn trong ngày của bạn như thế nào?', options: [
    ['3 bữa chính cố định', 'Sáng, trưa, tối – không ăn vặt.'],
    ['3 bữa chính + 1–2 bữa phụ', 'Thêm trái cây, sữa chua, hạt vào xế chiều.'],
    ['2 bữa chính', 'Thường nhịn ăn gián đoạn 16:8 hoặc bỏ bữa sáng.'],
    ['Chia nhỏ 4–5 bữa', 'Phục vụ lịch tập luyện.'],
  ] },
  { kind: 'budget', pose: 'celebrate', title: 'Ngân sách dự kiến cho việc ăn uống mỗi ngày của bạn là bao nhiêu?' },
];

const NO_ALLERGY = 'Không dị ứng gì';
const BUDGET_CHIPS = [50000, 80000, 120000, 200000];
const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

export const OnboardingSurvey: React.FC = () => {
  const navigate = useNavigate();
  const { hasGoal } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<PreferenceAnswers>>({});
  const [budgetText, setBudgetText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Preferences | null>(null);

  // Khảo sát chỉ dành cho tài khoản vừa tạo: ai đã làm rồi thì vào thẳng app
  useEffect(() => {
    preferenceApi.get().then((p) => { if (p) navigate(hasGoal ? '/' : '/goal-setup', { replace: true }); }).catch(() => undefined);
  }, [navigate, hasGoal]);

  const q = QUESTIONS[step];
  const total = QUESTIONS.length;
  const budget = Number(budgetText.replace(/\D/g, '')) || 0;
  const canNext = q.kind === 'choice' ? !!answers[q.key] : q.kind === 'allergies' ? (answers.allergies ?? '').trim().length > 0 : budget >= 10000;

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const allergies = (answers.allergies ?? '').trim();
      const saved = await preferenceApi.save({ ...(answers as PreferenceAnswers), allergies: allergies === NO_ALLERGY ? '' : allergies, daily_budget_vnd: budget });
      setResult(saved);
    } catch {
      setError('Chưa lưu được câu trả lời. Kiểm tra kết nối và thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!canNext) return;
    if (step < total - 1) setStep(step + 1);
    else void finish();
  };

  const choose = (key: ChoiceKey, value: Choice) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    window.setTimeout(() => setStep((s) => Math.min(s + 1, total - 1)), 220); // tự sang câu tiếp
  };

  if (result) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 bg-[#F8FAFC] px-4 py-10 text-center">
        <Mascot pose="celebrate" size={140} />
        <h1 className="text-2xl font-bold text-slate-900">Hồ sơ ăn uống của bạn đã sẵn sàng!</h1>
        <div className="w-full rounded-3xl border border-emerald-100 bg-white p-5 text-left shadow-sm">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> {result.summary_source === 'ai' ? 'AI NutriSnap tổng hợp' : 'Tóm tắt hồ sơ'}
          </p>
          <p className="text-sm leading-6 text-slate-700">{result.summary}</p>
        </div>
        <p className="text-sm text-slate-500">Thực đơn gợi ý và AI Coach sẽ ghi nhớ hồ sơ này, đặc biệt là các thực phẩm bạn cần tránh.</p>
        <button
          type="button"
          onClick={() => navigate(hasGoal ? '/meal-plan' : '/goal-setup', { replace: true })}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-lime-500 text-sm font-bold text-white shadow-md shadow-emerald-500/30"
        >
          {hasGoal ? 'Xem thực đơn gợi ý' : 'Tiếp tục thiết lập mục tiêu'} <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-[#F8FAFC] px-4 pb-6 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Câu trước"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 disabled:opacity-30"
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={total} aria-label="Tiến độ khảo sát">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-300 motion-reduce:transition-none" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <span className="w-12 text-right text-xs font-bold text-slate-500">{step + 1}/{total}</span>
      </div>

      <div className="mt-5 flex items-end gap-3">
        <Mascot pose={q.pose} size={84} className="shrink-0" />
        <div className="relative mb-3 flex-1 rounded-3xl rounded-bl-md bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Câu {step + 1}{q.kind === 'choice' ? '' : ' · Tự trả lời'}</p>
          <h1 className="mt-1 text-lg font-bold leading-snug text-slate-900">{q.title}</h1>
        </div>
      </div>

      <div className="mt-4 flex-1">
        {q.kind === 'choice' && (
          <div role="radiogroup" aria-label={q.title} className="space-y-2.5">
            {q.options.map(([label, desc], i) => {
              const v = LETTERS[i];
              const on = answers[q.key] === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => choose(q.key, v)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3.5 text-left transition-all ${on ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10' : 'border-transparent shadow-sm ring-1 ring-slate-200 hover:ring-emerald-300'}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${on ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {on ? <Check aria-hidden="true" className="h-5 w-5" strokeWidth={3} /> : v}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{label}</span>
                    <span className="block text-xs leading-5 text-slate-500">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {q.kind === 'allergies' && (
          <div className="space-y-3">
            <textarea
              aria-label="Thực phẩm dị ứng hoặc cần tránh"
              value={answers.allergies === NO_ALLERGY ? '' : answers.allergies ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, allergies: e.target.value }))}
              maxLength={300}
              rows={4}
              placeholder='Ví dụ: "Dị ứng tôm cua, đậu phộng, không ăn được hành lá và đồ cay"'
              className="w-full rounded-2xl border-0 bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              aria-pressed={answers.allergies === NO_ALLERGY}
              onClick={() => { setAnswers((a) => ({ ...a, allergies: NO_ALLERGY })); window.setTimeout(() => setStep(step + 1), 220); }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${answers.allergies === NO_ALLERGY ? 'bg-emerald-500 text-white' : 'bg-white text-emerald-700 ring-1 ring-emerald-200'}`}
            >
              <Check aria-hidden="true" className="h-4 w-4" /> {NO_ALLERGY}
            </button>
          </div>
        )}

        {q.kind === 'budget' && (
          <div className="space-y-3">
            <label className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="text-xs font-semibold text-slate-500">Số tiền mỗi ngày (VNĐ)</span>
              <span className="mt-1 flex items-baseline gap-2">
                <input
                  aria-label="Ngân sách mỗi ngày"
                  inputMode="numeric"
                  value={budgetText}
                  onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '').slice(0, 8)); setBudgetText(n ? n.toLocaleString('vi-VN') : ''); }}
                  placeholder="60.000"
                  className="w-full border-0 bg-transparent p-0 text-3xl font-bold text-slate-900 focus:outline-none focus:ring-0"
                />
                <span className="text-xl font-bold text-slate-400">đ</span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BUDGET_CHIPS.map((n) => (
                <button key={n} type="button" onClick={() => setBudgetText(n.toLocaleString('vi-VN'))}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold ${budget === n ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                  {vnd(n)}
                </button>
              ))}
            </div>
            {budget > 0 && budget < 10000 && <p className="text-xs text-amber-700">Nhập tối thiểu 10.000 đ.</p>}
          </div>
        )}
      </div>

      {error && <p role="alert" className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

      {(q.kind !== 'choice' || step === total - 1 || answers[q.key]) && (
        <button
          type="button"
          onClick={next}
          disabled={!canNext || saving}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-lime-500 text-sm font-bold text-white shadow-md shadow-emerald-500/30 disabled:opacity-50"
        >
          {saving ? (<><Sparkles aria-hidden="true" className="h-4 w-4 animate-pulse" /> AI đang tổng hợp hồ sơ…</>) : step === total - 1 ? 'Hoàn tất' : (<>Tiếp tục <ArrowRight aria-hidden="true" className="h-4 w-4" /></>)}
        </button>
      )}
    </main>
  );
};

export default OnboardingSurvey;
