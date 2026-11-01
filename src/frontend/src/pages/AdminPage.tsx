/**
 * src/frontend/src/pages/AdminPage.tsx
 * Trang Quản trị: thống kê người dùng, tìm kiếm, khoá/mở khoá, cấp quyền và xoá tài khoản.
 * Chỉ hiển thị cho tài khoản is_admin; backend vẫn kiểm tra quyền ở mọi API.
 */

import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, Search, ShieldCheck, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { adminApi, AdminStats, AdminStatusFilter, AdminUser, AdminUserList } from '../api/adminApi';

const PAGE_SIZE = 20;
const STATUS_TABS: Array<{ value: AdminStatusFilter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'locked', label: 'Đã khoá' },
  { value: 'admin', label: 'Quản trị viên' },
];

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

function errorMessage(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : 'Không thực hiện được. Vui lòng thử lại.';
}

export default function AdminPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [list, setList] = useState<AdminUserList | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [status, setStatus] = useState<AdminStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([
        adminApi.getStats(),
        adminApi.listUsers({ q: submittedQuery || undefined, status, page, page_size: PAGE_SIZE }),
      ]);
      setStats(s);
      setList(l);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [submittedQuery, status, page]);

  useEffect(() => {
    if (user?.is_admin) void load();
  }, [load, user?.is_admin]);

  if (user && !user.is_admin) return <Navigate to="/" replace />;

  const act = async (target: AdminUser, action: 'lock' | 'unlock' | 'grant' | 'revoke' | 'delete') => {
    if (action === 'delete') {
      const ok = window.confirm(
        `Xoá vĩnh viễn tài khoản "${target.username}" cùng toàn bộ bữa ăn, cân nặng, mục tiêu và lịch sử chat? Không thể hoàn tác.`,
      );
      if (!ok) return;
    }
    setBusyId(target.id);
    setError(null);
    try {
      if (action === 'delete') await adminApi.deleteUser(target.id);
      else if (action === 'lock' || action === 'unlock') await adminApi.updateUser(target.id, { is_active: action === 'unlock' });
      else await adminApi.updateUser(target.id, { is_admin: action === 'grant' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const statCards = stats
    ? [
        { label: 'Tổng người dùng', value: stats.total_users, tone: 'from-sky-400 to-violet-500' },
        { label: 'Mới 7 ngày', value: stats.new_users_7d, tone: 'from-emerald-400 to-teal-500' },
        { label: 'Ghi bữa ăn 7 ngày', value: stats.active_loggers_7d, tone: 'from-amber-400 to-orange-500' },
        { label: 'Bữa ăn 7 ngày', value: stats.meals_7d, tone: 'from-pink-400 to-fuchsia-500' },
        { label: 'Đã đặt mục tiêu', value: stats.users_with_goal, tone: 'from-lime-400 to-emerald-500' },
        { label: 'Đã khoá', value: stats.locked_users, tone: 'from-slate-400 to-slate-600' },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản trị người dùng</h1>
          <p className="text-sm text-slate-500">Chỉ hiển thị số liệu tổng hợp – không xem nội dung bữa ăn hay tin nhắn của người dùng.</p>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      <section aria-label="Thống kê" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-1 bg-gradient-to-r ${card.tone} bg-clip-text text-2xl font-extrabold text-transparent`}>
              {card.value.toLocaleString('vi-VN')}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmittedQuery(query.trim());
          }}
        >
          <label className="relative flex-1">
            <span className="sr-only">Tìm người dùng</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên đăng nhập, email, họ tên"
              className="nutri-input w-full pl-9"
              maxLength={100}
            />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
            Tìm
          </button>
        </form>

        <div role="tablist" aria-label="Lọc trạng thái" className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                status === tab.value ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && !list ? (
          <p className="py-6 text-center text-sm text-slate-500">Đang tải…</p>
        ) : list && list.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Không có người dùng phù hợp.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list?.items.map((u) => {
              const isSelf = u.id === user?.id;
              const busy = busyId === u.id;
              return (
                <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      <span className="truncate">{u.username}</span>
                      {u.is_admin && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">Admin</span>}
                      {!u.is_active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">Đã khoá</span>}
                      {isSelf && <span className="text-[11px] font-medium text-slate-400">(bạn)</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}{u.full_name ? ` · ${u.full_name}` : ''}</p>
                    <p className="text-xs text-slate-500">
                      Đăng ký {fmtDate(u.created_at)} · {u.meal_count} bữa ăn · Bữa gần nhất {fmtDate(u.last_meal_at)} ·{' '}
                      {u.has_goal ? 'Có mục tiêu' : 'Chưa đặt mục tiêu'}
                    </p>
                  </div>
                  {!isSelf && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(u, u.is_active ? 'lock' : 'unlock')}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {u.is_active ? <Lock aria-hidden="true" className="h-4 w-4" /> : <Unlock aria-hidden="true" className="h-4 w-4" />}
                        {u.is_active ? 'Khoá' : 'Mở khoá'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(u, u.is_admin ? 'revoke' : 'grant')}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                        {u.is_admin ? 'Gỡ admin' : 'Cấp admin'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(u, 'delete')}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        Xoá
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {list && list.total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg px-3 py-1.5 font-semibold text-emerald-700 disabled:opacity-40">
              ← Trước
            </button>
            <span className="text-slate-500">
              Trang {page}/{totalPages} · {list.total} người dùng
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg px-3 py-1.5 font-semibold text-emerald-700 disabled:opacity-40">
              Sau →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
