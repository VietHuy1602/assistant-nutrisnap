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
  const itemClass = 'flex min-h-12 min-w-12 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-nutri-ink hover:bg-nutri-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2';

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
        className="flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-full border border-nutri-border bg-white py-1 pl-1 pr-2 text-nutri-ink shadow-sm hover:bg-nutri-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus focus-visible:ring-offset-2">
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-sky-500 text-sm font-bold text-white">{initial}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <nav id={panelId} aria-label="Tài khoản" className="absolute right-0 top-full z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-nutri-border bg-nutri-panel p-2 shadow-lg">
        <div className="mb-1 flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-50 to-sky-50 px-3 py-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-sky-500 text-base font-bold text-white">{initial}</span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-nutri-ink">{username || 'Tài khoản'}</p>
            <p className="text-xs text-nutri-muted">Thành viên NutriSnap</p>
          </div>
        </div>
        <Link to="/goal-setup" className={itemClass} onClick={() => setOpen(false)}><Target aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-600" />Mục tiêu</Link>
        <Link to="/monthly-report" className={itemClass} onClick={() => setOpen(false)}><FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-sky-600" />Báo cáo tháng</Link>
        <div className="my-1 border-t border-nutri-border/60" />
        <button type="button" onClick={() => { setOpen(false); void onLogout(); }} className={`${itemClass} w-full text-amber-800 hover:bg-amber-50`}><LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />Đăng xuất</button>
      </nav>}
    </div>
  );
}
