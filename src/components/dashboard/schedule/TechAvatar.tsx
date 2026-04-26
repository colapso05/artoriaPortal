import { type Technician } from "./types";

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLS: Record<AvatarSize, string> = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-[12px]',
  lg: 'w-12 h-12 text-sm',
};

interface Props {
  tech: Pick<Technician, 'name' | 'color' | 'photo_url'>;
  size?: AvatarSize;
  className?: string;
}

export default function TechAvatar({ tech, size = 'sm', className = '' }: Props) {
  const cls = SIZE_CLS[size];

  if (tech.photo_url) {
    return (
      <img
        src={tech.photo_url}
        alt={tech.name}
        className={`${cls} rounded-full object-cover flex-shrink-0 ring-2 ring-offset-1 ring-offset-background ${className}`}
        style={{ ringColor: tech.color } as React.CSSProperties}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      className={`${cls} rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold select-none ${className}`}
      style={{ background: `linear-gradient(135deg, ${tech.color}, ${tech.color}99)` }}
    >
      {tech.name.slice(0, 2).toUpperCase()}
    </div>
  );
}
