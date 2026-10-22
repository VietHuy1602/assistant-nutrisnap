import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
export function Notice({children}:{children?:ReactNode}) { return <div className="notice"><Info size={18} aria-hidden="true"/><p>{children || 'Số liệu dinh dưỡng chỉ mang tính chất ước tính tham khảo, không thay thế tư vấn y khoa.'}</p></div>; }
export function PageHeading({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}) { return <header className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{children}</p></header>; }
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) { return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>; }
