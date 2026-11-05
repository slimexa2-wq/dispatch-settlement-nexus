import { UserRound } from 'lucide-react';
import type { CSSProperties } from 'react';

export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  return <span className="avatar" style={{ '--avatar-size': `${size}px` } as CSSProperties} aria-label={`${name}头像`}><UserRound /></span>;
}
