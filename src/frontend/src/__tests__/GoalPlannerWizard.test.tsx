import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GoalPlannerWizard } from '../pages/GoalPlannerWizard';
import { goalApi } from '../api/goalApi';
import { ApiError } from '../utils/apiError';
import { GoalData } from '../types/api';

vi.mock('../api/goalApi');

const mockSetHasGoal = vi.fn();
let mockHasGoal = false;

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    hasGoal: mockHasGoal,
    setHasGoal: mockSetHasGoal,
  }),
}));

const mockSavedGoalResponse: GoalData = {
  id: 10,
  user_id: 99,
  target_weight: 62,
  bmr_calories: 1540.5,
  tdee_calories: 2120.0,
  target_calories: 1720.0,
  target_protein_g: 130.0,
  target_carbs_g: 180.0,
  target_fat_g: 45.0,
  daily_budget_vnd: 60000,
  disclaimer: 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.',
};

describe('GoalPlannerWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasGoal = false;
  });

  it('1. Chặn Next khi thông số bước 1 lỗi (ví dụ: tuổi < 10)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    const ageInput = screen.getByLabelText(/Tuổi \(năm\)/i);
    await user.clear(ageInput);
    await user.type(ageInput, '5'); // không hợp lệ (min 10)

    const nextBtn = screen.getByRole('button', { name: /Tiếp tục/i });
    await user.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText('Tuổi tối thiểu là 10')).toBeInTheDocument();
    });

    expect(ageInput).toHaveAttribute('aria-invalid', 'true');
    expect(ageInput).toHaveAccessibleDescription('Tuổi tối thiểu là 10');

    // Vẫn ở bước 1, không thấy tiêu đề bước 2
    expect(screen.queryByText('Mục tiêu vóc dáng & Sức khỏe')).not.toBeInTheDocument();
  });

  it('supports keyboard selection in the body-step radio groups and retains choices on return', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    expect(screen.getByRole('group', { name: /Giới tính sinh học/i })).toBeInTheDocument();
    screen.getByRole('radio', { name: 'Nam' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Nữ' })).toBeChecked();

    expect(screen.getByRole('group', { name: /Mức độ vận động hàng ngày/i })).toBeInTheDocument();
    const moderate = screen.getByRole('radio', { name: 'Vận động vừa phải' });
    expect(moderate).toHaveAccessibleDescription('Tập thể dục đều đặn 3–5 ngày/tuần');
    moderate.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Vận động nhiều' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Quay lại/i }));
    expect(screen.getByRole('radio', { name: 'Nữ' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Vận động nhiều' })).toBeChecked();
  });

  it('2. Bước 2: Chọn maintain ẩn ô nhập cân nặng mục tiêu', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    // Chuyển sang bước 2
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    await waitFor(() => {
      expect(screen.getByText('Mục tiêu vóc dáng & Sức khỏe')).toBeInTheDocument();
    });

    // Ban đầu là lose_weight, có ô nhập target
    expect(screen.getByLabelText(/Cân nặng mục tiêu/i)).toBeInTheDocument();

    // Chọn "Duy trì vóc dáng"
    const maintainBtn = screen.getByRole('button', { name: /Duy trì vóc dáng/i });
    await user.click(maintainBtn);

    await waitFor(() => {
      expect(screen.getByText(/Duy trì cân nặng hiện tại/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Cân nặng mục tiêu \(kg\)/i)).not.toBeInTheDocument();
    });
  });

  it('3. Đổi goal_type tự động đặt lại weekly_pace_kg an toàn', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    // Bước 1 -> Bước 2
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));

    // Chọn Tăng cơ
    await user.click(screen.getByRole('button', { name: /Tăng cơ/i }));

    // Sang bước 3
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));

    // Pace của tăng cơ mặc định là 0.25 kg/tuần
    expect(screen.getByText('0.25')).toBeInTheDocument();
  });

  it('4. Payload submit ở bước 4 đúng 9 field và KHÔNG chứa user_id (Zero-Trust)', async () => {
    vi.mocked(goalApi.saveGoal).mockResolvedValueOnce(mockSavedGoalResponse);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    // Đi tuần tự từ Bước 1 -> 2 -> 3 -> 4
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Mục tiêu vóc dáng & Sức khỏe'));

    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Kiểm tra an toàn & Ngân sách'));

    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await waitFor(() => screen.getByText('Xác nhận thông tin mục tiêu'));

    // Submit form
    const saveBtn = screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(goalApi.saveGoal).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(goalApi.saveGoal).mock.calls[0][0];

    // Kiểm tra đúng 9 fields
    expect(payload).toHaveProperty('gender');
    expect(payload).toHaveProperty('age');
    expect(payload).toHaveProperty('height_cm');
    expect(payload).toHaveProperty('current_weight_kg');
    expect(payload).toHaveProperty('target_weight_kg');
    expect(payload).toHaveProperty('activity_level');
    expect(payload).toHaveProperty('goal_type');
    expect(payload).toHaveProperty('weekly_pace_kg');
    expect(payload).toHaveProperty('daily_budget_vnd');

    // BẢO MẬT ZERO-TRUST: KHÔNG ĐƯỢC CHỨA user_id
    expect(payload).not.toHaveProperty('user_id');
  });

  it('5. Hiển thị đủ TDEE, BMR, Protein, Carbs, Fat sau khi lưu thành công', async () => {
    vi.mocked(goalApi.saveGoal).mockResolvedValueOnce(mockSavedGoalResponse);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    // Đến bước 4 và submit
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    const saveBtn = screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i });
    await user.click(saveBtn);

    // Kiểm tra các chỉ số xuất hiện trên GoalResultPanel
    await waitFor(() => {
      expect(screen.getByText('2.120')).toBeInTheDocument(); // TDEE
      expect(screen.getByText('1.540,5')).toBeInTheDocument(); // BMR
      expect(screen.getByText('1.720')).toBeInTheDocument(); // Target Calo
      expect(screen.getByText('130')).toBeInTheDocument(); // Protein
      expect(screen.getByText('180')).toBeInTheDocument(); // Carbs
      expect(screen.getByText('45')).toBeInTheDocument(); // Fat
    });
  });

  it('6. Hiển thị nhãn "Ước tính" và khuyến cáo y khoa M5', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    // Đến bước 3
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    await waitFor(() => {
      // Khuyến cáo y khoa bắt buộc M5
      expect(
        screen.getByText(
          'Đây là công cụ ước tính lộ trình tham khảo, không thay thế chỉ định y khoa.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('7. Hiển thị cảnh báo đặc biệt nếu server trả về disclaimer mở rộng', async () => {
    const specialDisclaimerGoal = {
      ...mockSavedGoalResponse,
      disclaimer: 'Lưu ý: Hạn mức calo khuyến nghị dưới 1.200 kcal/ngày cần có sự theo dõi của chuyên gia dinh dưỡng.',
    };
    vi.mocked(goalApi.saveGoal).mockResolvedValueOnce(specialDisclaimerGoal);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    await user.click(screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i }));

    await waitFor(() => {
      expect(screen.getByRole('note')).toHaveTextContent(
        'Lưu ý: Hạn mức calo khuyến nghị dưới 1.200 kcal/ngày',
      );
    });
  });

  it('8. Lỗi API: Hiển thị lỗi cấp form và giữ nguyên dữ liệu', async () => {
    vi.mocked(goalApi.saveGoal).mockRejectedValueOnce(
      new ApiError('Hệ thống đang bận. Vui lòng thử lại sau.', { status: 500 }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GoalPlannerWizard />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    await user.click(screen.getByRole('button', { name: /Lưu mục tiêu dinh dưỡng/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Hệ thống đang bận. Vui lòng thử lại sau.',
      );
    });

    // Form không bị mất hoặc reset
    expect(screen.getByText('Xác nhận thông tin mục tiêu')).toBeInTheDocument();
  });
});
