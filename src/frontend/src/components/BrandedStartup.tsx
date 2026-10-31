import styles from './BrandedStartup.module.css';

interface BrandedStartupProps {
  announce?: boolean;
  label?: string;
}

/** Presentation for existing loading branches only; owns no timer or startup state. */
export function BrandedStartup({ announce = true, label = 'Đang kiểm tra phiên đăng nhập…' }: BrandedStartupProps) {
  return (
    <div className={styles.screen} aria-busy="true">
      <img className={styles.art} src="/branding/nutrisnap-startup.png"
        alt="NutriSnap — Chụp phát biết liền, ăn ngon bớt phiền" />
      {announce && <p role="status" className={styles.status}>{label}</p>}
    </div>
  );
}
