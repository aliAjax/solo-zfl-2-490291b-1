import { useState } from 'react';
import {
  ArrowRightFromLine,
  ArrowRightToLine,
  Wrench,
  CheckCircle2,
  Archive,
  ChevronDown,
  History,
  User,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react';
import type { AssetStatus, CirculationAction, KeyboardLog } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { formatDate } from '@/utils/helpers';
import {
  getActiveLoan,
  getActiveMaintenance,
  getLoanUrgency,
  todayStr,
} from '@/utils/assets';
import AssetStatusBadge from './AssetStatusBadge';
import Timeline from './Timeline';

interface Props {
  log: KeyboardLog;
  index: number;
}

interface ActionDef {
  action: CirculationAction;
  label: string;
  icon: typeof Wrench;
  variant: 'primary' | 'ghost' | 'danger';
}

const ACTIONS_BY_STATUS: Record<AssetStatus, ActionDef[]> = {
  in_stock: [
    { action: 'checkout', label: '借出', icon: ArrowRightFromLine, variant: 'primary' },
    { action: 'maintenance_start', label: '保养', icon: Wrench, variant: 'ghost' },
    { action: 'retire', label: '退役', icon: Archive, variant: 'danger' },
  ],
  lent_out: [
    { action: 'return', label: '归还', icon: ArrowRightToLine, variant: 'primary' },
  ],
  maintenance: [
    { action: 'maintenance_complete', label: '完成保养', icon: CheckCircle2, variant: 'primary' },
  ],
  retired: [],
};

export default function AssetRow({ log, index }: Props) {
  const { openAssetModal, openDetail } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const status: AssetStatus = log.status ?? 'in_stock';
  const today = todayStr();
  const urgency = getLoanUrgency(log, today);
  const loan = getActiveLoan(log);
  const maintenance = getActiveMaintenance(log);
  const actions = ACTIONS_BY_STATUS[status];
  const hasEvents = (log.circulation?.length ?? 0) > 0;

  const overdueDays =
    urgency === 'overdue' && loan
      ? (() => {
          const d = Math.round(
            (new Date(today + 'T00:00:00').getTime() -
              new Date(loan.dueDate + 'T00:00:00').getTime()) /
              86400000,
          );
          return d > 0 ? d : 0;
        })()
      : 0;

  const rowRing =
    urgency === 'overdue'
      ? 'border-wine-500/50 shadow-[0_0_20px_-6px_rgba(166,82,82,0.45)]'
      : urgency === 'due_soon'
        ? 'border-brass-300/45'
        : status === 'maintenance'
          ? 'border-brass-300/35'
          : '';

  return (
    <article
      style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}
      className={`card-surface overflow-hidden animate-fadeIn ${rowRing}`}
    >
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openDetail(log)}>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-mono text-base font-bold text-ink-100">{log.name}</h3>
              <AssetStatusBadge status={status} size="sm" />
              {urgency === 'overdue' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-wine-500/20 text-wine-400 border border-wine-500/45 animate-pulse">
                  <AlertTriangle className="h-3 w-3" />
                  已逾期 {overdueDays} 天
                </span>
              )}
              {urgency === 'due_soon' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brass-300/15 text-brass-200 border border-brass-300/40">
                  <CalendarClock className="h-3 w-3" />
                  即将到期
                </span>
              )}
            </div>
            <p className="text-xs text-ink-500 mt-1">
              {log.brand} {log.model}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {actions.map((a) => {
              const Icon = a.icon;
              const cls =
                a.variant === 'primary'
                  ? 'btn-primary !px-3 !py-1.5 !text-xs'
                  : a.variant === 'danger'
                    ? 'btn-danger !px-3 !py-1.5 !text-xs'
                    : 'btn-ghost !px-3 !py-1.5 !text-xs';
              return (
                <button
                  key={a.action}
                  onClick={() => openAssetModal(log.id, a.action)}
                  className={cls}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {a.label}
                </button>
              );
            })}
            {hasEvents && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                title="流转时间线"
              >
                <History className="h-3.5 w-3.5" />
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
        </div>

        {/* 状态明细条 */}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {status === 'lent_out' && loan && (
            <>
              <span className="inline-flex items-center gap-1.5 text-ink-300">
                <User className="h-3.5 w-3.5 text-slateblue-400" />
                借用人：<span className="font-medium text-slateblue-300">{loan.borrower || '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-300">
                <CalendarClock className="h-3.5 w-3.5 text-slateblue-400" />
                借出 {formatDate(loan.event.date)} · 预计 {formatDate(loan.dueDate)}
              </span>
              <span
                className={`font-mono font-semibold ${
                  urgency === 'overdue'
                    ? 'text-wine-400'
                    : urgency === 'due_soon'
                      ? 'text-brass-200'
                      : 'text-ink-400'
                }`}
              >
                {urgency === 'overdue'
                  ? `逾期 ${overdueDays} 天`
                  : urgency === 'due_soon'
                    ? '3 天内到期'
                    : '归还期限内'}
              </span>
            </>
          )}
          {status === 'maintenance' && maintenance && (
            <span className="inline-flex items-center gap-1.5 text-brass-200">
              <Wrench className="h-3.5 w-3.5" />
              自 {formatDate(maintenance.date)} 起保养中
              {maintenance.note ? ` · ${maintenance.note}` : ''}
            </span>
          )}
          {status === 'in_stock' && (
            <span className="text-ink-500">在库可借出 · 共 {log.circulation?.length ?? 0} 条流转记录</span>
          )}
          {status === 'retired' && <span className="text-ink-500">已退役，流转已封存</span>}
        </div>
      </div>

      {expanded && hasEvents && (
        <div className="border-t border-ink-700/60 bg-ink-950/30 p-4 animate-fadeIn">
          <Timeline log={log} />
        </div>
      )}
    </article>
  );
}
