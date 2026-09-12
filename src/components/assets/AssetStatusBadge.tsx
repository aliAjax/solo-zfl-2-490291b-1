import type { AssetStatus } from '@/types';
import { ASSET_STATUS_LABELS } from '@/types';
import { STATUS_STYLES, STATUS_ICONS } from './statusUi';

export default function AssetStatusBadge({
  status,
  size = 'md',
}: {
  status: AssetStatus;
  size?: 'sm' | 'md';
}) {
  const Icon = STATUS_ICONS[status];
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[10px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${pad} ${STATUS_STYLES[status]}`}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}
