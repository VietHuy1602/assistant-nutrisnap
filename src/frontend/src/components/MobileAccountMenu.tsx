import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, FileText, LogOut, Target } from 'lucide-react';

interface Props {
  username?: string;
  onLogout: () => Promise<void>;
}

export function MobileAccountMenu({ username, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const { pathname } = useLocation();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const initial = username?.charAt(0).toUpperCase() || 'U';
  const itemClass = 'flex min-h-12 min-w-12 items-center gap-3 rounded-2xl px-3 py-2.5 text-base font-medium text-nutri-ink hover:bg-nutri-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';

  return (
    <div ref={containerRef} className="relative" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <button ref={triggerRef} type="button" aria-label="Tài khoản" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className="flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900 via-indigo-800 to-purple-700 py-1 pl-1 pr-2.5 text-white shadow-[0_0_14px_rgba(99,102,241,0.55)] ring-2 ring-cyan-300/70 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2">
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-sky-500 text-sm font-bold text-white ring-2 ring-white/30">{initial}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 text-white transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <nav id={panelId} aria-label="Tài khoản" className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-1 rounded-3xl border border-slate-100 bg-white p-2.5 shadow-2xl shadow-indigo-900/15">
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-100 via-violet-100 to-pink-100 px-3 py-3.5">
          {/* Viền cầu vồng quanh ảnh đại diện */}
          <span aria-hidden="true" className="shrink-0 rounded-full bg-gradient-to-br from-emerald-400 via-sky-400 to-fuchsia-500 p-[3px]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-violet-500 to-sky-500 text-lg font-bold text-white">{initial}</span>
          </span>
          <div className="min-w-0">
            <p className="break-words text-base font-bold text-nutri-ink">{username || 'Tài khoản'}</p>
            <p className="text-xs text-slate-600">Thành viên NutriSnap <span aria-hidden="true">✨</span></p>
          </div>
        </div>
        <Link to="/goal-setup" className={`${itemClass} bg-emerald-50/80 hover:bg-emerald-100`} onClick={() => setOpen(false)}>
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-400 to-emerald-400 text-white"><Target className="h-5 w-5" /></span>
          Mục tiêu
        </Link>
        <Link to="/monthly-report" className={itemClass} onClick={() => setOpen(false)}>
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 text-white"><FileText className="h-5 w-5" /></span>
          Báo cáo tháng
        </Link>
        <div className="mx-2 my-1 border-t border-slate-200" />
        <button type="button" onClick={() => { setOpen(false); void onLogout(); }} className={`${itemClass} w-full border border-rose-300 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-600 hover:from-rose-100 hover:to-orange-100`}>
          <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />Đăng xuất
        </button>
      </nav>}
    </div>
  );
}
