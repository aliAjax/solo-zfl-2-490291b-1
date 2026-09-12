import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowRightFromLine,
  ArrowRightToLine,
  Wrench,
  CheckCircle2,
  Archive,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  ASSET_CONDITIONS,
  CONDITION_LABELS,
  CIRCULATION_ACTION_LABELS,
  type AssetCondition,
  type CirculationAction,
} from '@/types';
import {
  canTransition,
  todayStr,
  validateActionInput,
  type AssetActionInput,
} from '@/utils/assets';
import AssetStatusBadge from './AssetStatusBadge';

const ACTION_ICONS = {
  checkout: ArrowRightFromLine,
  return: ArrowRightToLine,
  maintenance_start: Wrench,
  maintenance_complete: CheckCircle2,
  retire: Archive,
} as const;

const ACTION_TITLES: Record<CirculationAction, string> = {
  checkout: '借出登记',
  return: '归还入库',
  maintenance_start: '开始保养',
  maintenance_complete: '完成保养',
  retire: '资产退役',
};

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-[11px] text-wine-400">{msg}</p>;
}

export default function AssetActionModal() {
  const { ui, logs, closeAssetModal, circulate } = useAppStore();
  const { open, logId, action } = ui.assetModal;

  const log = useMemo(() => logs.find((l) => l.id === logId) ?? null, [logs, logId]);

  const today = todayStr();
  const [date, setDate] = useState(today);
  const [borrower, setBorrower] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [returnDate, setReturnDate] = useState(today);
  const [condition, setCondition] = useState<AssetCondition>('good');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open && log && action) {
      const t = todayStr();
      setDate(t);
      setReturnDate(t);
      setBorrower('');
      setDueDate('');
      setCondition('good');
      setNote('');
      setReason('');
      setErrors({});
      setSubmitError(null);
      const status = log.status ?? 'in_stock';
      const guard = canTransition(status, action);
      setBlocked(guard.ok ? null : guard.reason ?? '当前状态不允许此操作');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, logId, action]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) closeAssetModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeAssetModal]);

  if (!open || !action) return null;

  const Icon = ACTION_ICONS[action];

  const buildInput = (): AssetActionInput | null => {
    switch (action) {
      case 'checkout':
        return { action, date, borrower, dueDate, note };
      case 'return':
        return { action, date, returnDate, condition, note };
      case 'maintenance_start':
        return { action, date, note };
      case 'maintenance_complete':
        return { action, date, note };
      case 'retire':
        return { action, date, reason };
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!log || blocked) return;
    const input = buildInput();
    if (!input) return;
    const fieldErrors = validateActionInput(input);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    const result = circulate(log.id, input);
    if (result.ok === false) setSubmitError(result.error);
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && closeAssetModal()}
    >
      <div className="modal-surface max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-700/60 bg-gradient-to-b from-ink-800/98 to-ink-800/90">
          <div>
            <h2 className="font-mono text-lg font-bold text-gradient-brass flex items-center gap-2">
              <Icon className="h-5 w-5 text-brass-300" />
              {ACTION_TITLES[action]}
            </h2>
            {log && (
              <p className="text-xs text-ink-500 mt-1 flex items-center gap-2">
                <span className="text-ink-300">{log.name}</span>
                <span className="text-ink-600">·</span>
                <AssetStatusBadge status={log.status ?? 'in_stock'} size="sm" />
              </p>
            )}
          </div>
          <button
            onClick={closeAssetModal}
            className="p-2 rounded-lg text-ink-500 hover:text-ink-200 hover:bg-ink-700/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {blocked || !log ? (
          <div className="p-6 space-y-4">
            <div className="rounded-xl bg-wine-500/10 border border-wine-500/30 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-wine-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-wine-300 mb-1">无法执行此操作</p>
                <p className="text-xs text-ink-300 leading-relaxed">
                  {blocked ?? '未找到该键盘记录'}
                </p>
              </div>
            </div>
            <button onClick={closeAssetModal} className="w-full btn-ghost justify-center">
              知道了
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            {submitError && (
              <div className="rounded-lg bg-wine-500/10 border border-wine-500/30 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-wine-400 shrink-0 mt-0.5" />
                <p className="text-xs text-wine-300">{submitError}</p>
              </div>
            )}

            {action === 'checkout' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">
                    借用人 <span className="text-wine-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={borrower}
                    onChange={(e) => setBorrower(e.target.value)}
                    placeholder="借给谁？"
                    className={`input-field ${errors.borrower ? 'border-wine-500/60' : ''}`}
                    autoFocus
                  />
                  <FieldError msg={errors.borrower} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-300 mb-1.5">
                      借出日期 <span className="text-wine-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={date}
                      max={today}
                      onChange={(e) => setDate(e.target.value)}
                      className={`input-field ${errors.date ? 'border-wine-500/60' : ''}`}
                    />
                    <FieldError msg={errors.date} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink-300 mb-1.5">
                      预计归还日 <span className="text-wine-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      min={date}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={`input-field ${errors.dueDate ? 'border-wine-500/60' : ''}`}
                    />
                    <FieldError msg={errors.dueDate} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">备注</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="借出事由、联系方式等（可选）"
                    className="input-field"
                  />
                </div>
              </>
            )}

            {action === 'return' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">
                    实际归还日期 <span className="text-wine-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    max={today}
                    onChange={(e) => {
                      setReturnDate(e.target.value);
                      setDate(e.target.value);
                    }}
                    className={`input-field ${errors.returnDate ? 'border-wine-500/60' : ''}`}
                    autoFocus
                  />
                  <FieldError msg={errors.returnDate} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-2">
                    归还成色 <span className="text-wine-400">*</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {ASSET_CONDITIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCondition(c)}
                        className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                          condition === c
                            ? 'bg-moss-500/18 border-moss-500/50 text-moss-400'
                            : 'bg-ink-900/60 border-ink-700/70 text-ink-400 hover:border-moss-500/30'
                        }`}
                      >
                        {CONDITION_LABELS[c]}
                      </button>
                    ))}
                  </div>
                  <FieldError msg={errors.condition} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">归还备注</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="磨损、缺件等情况说明（可选）"
                    className="input-field"
                  />
                </div>
              </>
            )}

            {(action === 'maintenance_start' || action === 'maintenance_complete') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">
                    日期 <span className="text-wine-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    max={action === 'maintenance_complete' ? today : undefined}
                    onChange={(e) => setDate(e.target.value)}
                    className={`input-field ${errors.date ? 'border-wine-500/60' : ''}`}
                    autoFocus
                  />
                  <FieldError msg={errors.date} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">
                    {action === 'maintenance_start' ? '保养内容 / 故障描述' : '保养结果说明'}
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={
                      action === 'maintenance_start'
                        ? '如：换轴、润轴、卫星轴调校…（可选）'
                        : '如：已更换 3 颗误触轴，调校完成…（可选）'
                    }
                    className="input-field resize-y min-h-[72px]"
                  />
                </div>
              </>
            )}

            {action === 'retire' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">
                    退役日期 <span className="text-wine-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value)}
                    className={`input-field ${errors.date ? 'border-wine-500/60' : ''}`}
                    autoFocus
                  />
                  <FieldError msg={errors.date} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5">退役原因</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="出售、报废、丢失、拆件…（可选）"
                    className="input-field resize-y min-h-[72px]"
                  />
                </div>
                <p className="text-[11px] text-ink-500 leading-relaxed">
                  退役为终态操作，退役后该键盘将无法再登记借出或保养。
                </p>
              </>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-ink-700/60 -mx-5 sm:-mx-6 px-5 sm:px-6 py-4">
              <button type="button" onClick={closeAssetModal} className="btn-ghost">
                取消
              </button>
              <button type="submit" className="btn-primary min-w-[120px]">
                <Icon className="h-4 w-4" />
                确认{CIRCULATION_ACTION_LABELS[action]}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
