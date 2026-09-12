import type { AssetStatus } from '@/types';
import { Package, ArrowRightLeft, Wrench, Archive } from 'lucide-react';

export const STATUS_STYLES: Record<AssetStatus, string> = {
  in_stock: 'bg-moss-500/15 text-moss-400 border-moss-500/35',
  lent_out: 'bg-slateblue-500/15 text-slateblue-300 border-slateblue-500/35',
  maintenance: 'bg-brass-300/15 text-brass-200 border-brass-300/40',
  retired: 'bg-ink-600/30 text-ink-400 border-ink-600/50',
};

export const STATUS_ICONS = {
  in_stock: Package,
  lent_out: ArrowRightLeft,
  maintenance: Wrench,
  retired: Archive,
} as const;
