import type { CirculationEvent, KeyboardLog } from '@/types';
import {
  CIRCULATION_ACTION_LABELS,
  CONDITION_LABELS,
} from '@/types';
import { formatDate } from '@/utils/helpers';
import { compareEventTime } from '@/utils/assets';
import {
  ArrowRightFromLine,
  ArrowRightToLine,
  Wrench,
  CheckCircle2,
  Archive,
} from 'lucide-react';

const ACTION_ICONS = {
  checkout: ArrowRightFromLine,
  return: ArrowRightToLine,
  maintenance_start: Wrench,
  maintenance_complete: CheckCircle2,
  retire: Archive,
} as const;

const ACTION_STYLES: Record<CirculationEvent['action'], string> = {
  checkout: 'bg-slateblue-500/15 text-slateblue-300 border-slateblue-500/40',
  return: 'bg-moss-500/15 text-moss-400 border-moss-500/40',
  maintenance_start: 'bg-brass-300/15 text-brass-200 border-brass-300/40',
  maintenance_complete: 'bg-moss-500/15 text-moss-400 border-moss-500/40',
  retire: 'bg-ink-600/40 text-ink-300 border-ink-600/60',
};

export default function Timeline({ log }: { log: KeyboardLog }) {
  const events = [...(log.circulation ?? [])].sort((a, b) => -compareEventTime(a, b));

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700/70 bg-ink-900/40 px-4 py-6 text-center">
        <p className="text-xs text-ink-500">暂无流转记录，键盘入库后可登记借出、保养与退役</p>
      </div>
    );
  }

  return (
    <ol className="relative ml-2.5 border-l border-ink-700/70 space-y-4">
      {events.map((ev) => {
        const Icon = ACTION_ICONS[ev.action];
        return (
          <li key={ev.id} className="relative pl-5">
            <span
              className={`absolute -left-[13px] top-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full border ${ACTION_STYLES[ev.action]}`}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-ink-100">
                {CIRCULATION_ACTION_LABELS[ev.action]}
              </span>
              <span className="font-mono text-[11px] text-ink-500">{formatDate(ev.date)}</span>
            </div>
            <div className="mt-1 text-xs text-ink-300 space-y-0.5">
              {ev.borrower && ev.action === 'checkout' && (
                <p className="flex flex-wrap gap-x-4">
                  <span>
                    借用人：<span className="text-slateblue-300 font-medium">{ev.borrower}</span>
                  </span>
                  {ev.dueDate && <span className="text-ink-400">预计归还：{formatDate(ev.dueDate)}</span>}
                </p>
              )}
              {ev.action === 'return' && (
                <p>
                  实际归还：{ev.returnDate ? formatDate(ev.returnDate) : '—'}
                  {ev.condition && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-moss-500/12 text-moss-400 border border-moss-500/30 text-[10px]">
                      成色：{CONDITION_LABELS[ev.condition]}
                    </span>
                  )}
                </p>
              )}
              {ev.action === 'maintenance_start' && ev.note && <p>保养内容：{ev.note}</p>}
              {ev.action === 'maintenance_complete' && ev.note && <p>保养结果：{ev.note}</p>}
              {ev.action === 'retire' && (ev.reason || ev.note) && (
                <p>退役原因：{ev.reason ?? ev.note}</p>
              )}
              {ev.action === 'checkout' && ev.note && <p className="text-ink-400">{ev.note}</p>}
              {ev.action === 'return' && ev.note && <p className="text-ink-400">备注：{ev.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
