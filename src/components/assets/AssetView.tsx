import { useMemo, useState } from 'react';
import {
  Package,
  ArrowRightLeft,
  Wrench,
  Archive,
  AlertOctagon,
  CalendarClock,
  Search,
  X,
  SlidersHorizontal,
  Keyboard,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_ORDER,
  type AssetStatus,
  type KeyboardLog,
} from '@/types';
import {
  compareRealDates,
  getActiveBorrowers,
  getActiveLoan,
  getAssetStats,
  getLoanUrgency,
  isValidGregorianDate,
  todayStr,
  type LoanUrgency,
} from '@/utils/assets';
import AssetRow from './AssetRow';

type StatusFilter = 'all' | AssetStatus;
type AlertFilter = 'all' | 'overdue' | 'due_soon' | 'maintenance';
type DateScope = 'due' | 'checkout' | 'return' | 'any';

function StatCard({
  label,
  value,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 sm:p-4 text-left transition-all ${tone} ${
        active ? 'ring-2 ring-brass-300/70' : 'hover:-translate-y-0.5'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider opacity-80">{label}</span>
        {icon}
      </div>
      <div className="font-mono text-2xl font-bold mt-1.5">{value}</div>
    </button>
  );
}

function dateInRange(date: string | undefined, from: string, to: string): boolean {
  if (!date || !isValidGregorianDate(date)) return false;
  if (from && compareRealDates(date, from) === -1) return false;
  if (to && compareRealDates(date, to) === 1) return false;
  return true;
}

function matchDateScope(log: KeyboardLog, scope: DateScope, from: string, to: string): boolean {
  if (!from && !to) return true;
  const events = log.circulation ?? [];
  switch (scope) {
    case 'due': {
      const loan = getActiveLoan(log);
      return dateInRange(loan?.dueDate, from, to);
    }
    case 'checkout':
      return events.some((e) => e.action === 'checkout' && dateInRange(e.date, from, to));
    case 'return':
      return events.some((e) => e.action === 'return' && dateInRange(e.returnDate ?? e.date, from, to));
    case 'any':
      return events.some((e) => dateInRange(e.date, from, to));
  }
}

const URGENCY_RANK: Record<LoanUrgency, number> = { overdue: 0, due_soon: 1, normal: 2 };

export default function AssetView() {
  const logs = useAppStore((s) => s.logs);
  const today = todayStr();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [borrowerFilter, setBorrowerFilter] = useState('all');
  const [dateScope, setDateScope] = useState<DateScope>('due');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [keyword, setKeyword] = useState('');

  const stats = useMemo(() => getAssetStats(logs, today), [logs, today]);
  const borrowers = useMemo(() => getActiveBorrowers(logs), [logs]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return logs
      .filter((log) => {
        const status: AssetStatus = log.status ?? 'in_stock';
        if (statusFilter !== 'all' && status !== statusFilter) return false;

        const urgency = getLoanUrgency(log, today);
        if (alertFilter === 'overdue' && urgency !== 'overdue') return false;
        if (alertFilter === 'due_soon' && urgency !== 'due_soon') return false;
        if (alertFilter === 'maintenance' && status !== 'maintenance') return false;

        if (borrowerFilter !== 'all') {
          const loan = getActiveLoan(log);
          if (!loan || loan.borrower !== borrowerFilter) return false;
        }

        if (!matchDateScope(log, dateScope, dateFrom, dateTo)) return false;

        if (kw) {
          const hay = [log.name, log.brand, log.model, ...(log.circulation ?? []).flatMap((e) => [e.borrower ?? '', e.note ?? '', e.reason ?? ''])]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // 逾期 > 即将到期 > 保养中 > 其他，外借排在库前
        const ua = getLoanUrgency(a, today);
        const ub = getLoanUrgency(b, today);
        const ra = ua ? URGENCY_RANK[ua] : a.status === 'maintenance' ? 1 : 3;
        const rb = ub ? URGENCY_RANK[ub] : b.status === 'maintenance' ? 1 : 3;
        if (ra !== rb) return ra - rb;
        const sa = a.status === 'lent_out' ? 0 : a.status === 'in_stock' ? 1 : 2;
        const sb = b.status === 'lent_out' ? 0 : b.status === 'in_stock' ? 1 : 2;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
  }, [logs, statusFilter, alertFilter, borrowerFilter, dateScope, dateFrom, dateTo, keyword, today]);

  const hasFilter =
    statusFilter !== 'all' ||
    alertFilter !== 'all' ||
    borrowerFilter !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    keyword !== '';

  const resetFilters = () => {
    setStatusFilter('all');
    setAlertFilter('all');
    setBorrowerFilter('all');
    setDateFrom('');
    setDateTo('');
    setKeyword('');
  };

  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    ...ASSET_STATUS_ORDER.map((s) => ({ key: s as StatusFilter, label: ASSET_STATUS_LABELS[s] })),
  ];

  const alertChips: { key: AlertFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'overdue', label: '逾期' },
    { key: 'due_soon', label: '即将到期' },
    { key: 'maintenance', label: '保养中' },
  ];

  return (
    <div className="space-y-5">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label="在库"
          value={stats.inStock}
          icon={<Package className="h-4 w-4 opacity-70" />}
          tone="bg-moss-500/10 border-moss-500/30 text-moss-400"
          active={statusFilter === 'in_stock'}
          onClick={() => setStatusFilter(statusFilter === 'in_stock' ? 'all' : 'in_stock')}
        />
        <StatCard
          label="外借"
          value={stats.lentOut}
          icon={<ArrowRightLeft className="h-4 w-4 opacity-70" />}
          tone="bg-slateblue-500/10 border-slateblue-500/30 text-slateblue-300"
          active={statusFilter === 'lent_out'}
          onClick={() => setStatusFilter(statusFilter === 'lent_out' ? 'all' : 'lent_out')}
        />
        <StatCard
          label="保养中"
          value={stats.maintenance}
          icon={<Wrench className="h-4 w-4 opacity-70" />}
          tone="bg-brass-300/10 border-brass-300/30 text-brass-200"
          active={statusFilter === 'maintenance'}
          onClick={() => setStatusFilter(statusFilter === 'maintenance' ? 'all' : 'maintenance')}
        />
        <StatCard
          label="退役"
          value={stats.retired}
          icon={<Archive className="h-4 w-4 opacity-70" />}
          tone="bg-ink-700/30 border-ink-600/40 text-ink-400"
          active={statusFilter === 'retired'}
          onClick={() => setStatusFilter(statusFilter === 'retired' ? 'all' : 'retired')}
        />
        <StatCard
          label="逾期"
          value={stats.overdue}
          icon={<AlertOctagon className="h-4 w-4 opacity-70" />}
          tone={
            stats.overdue > 0
              ? 'bg-wine-500/15 border-wine-500/40 text-wine-400 animate-pulseGlow'
              : 'bg-wine-500/5 border-wine-500/20 text-wine-400/70'
          }
          active={alertFilter === 'overdue'}
          onClick={() => setAlertFilter(alertFilter === 'overdue' ? 'all' : 'overdue')}
        />
        <StatCard
          label="即将到期"
          value={stats.dueSoon}
          icon={<CalendarClock className="h-4 w-4 opacity-70" />}
          tone="bg-brass-300/8 border-brass-300/25 text-brass-200"
          active={alertFilter === 'due_soon'}
          onClick={() => setAlertFilter(alertFilter === 'due_soon' ? 'all' : 'due_soon')}
        />
      </div>

      {/* 筛选 */}
      <div className="card-surface p-4 sm:p-5 space-y-4 animate-fadeIn">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-brass-300" />
            <h3 className="text-sm font-semibold text-ink-200 font-mono">资产筛选</h3>
            {hasFilter && (
              <button onClick={resetFilters} className="chip chip-inactive !py-0.5 !text-[11px]">
                <X className="h-3 w-3" />
                清除筛选
              </button>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索键盘或借用人..."
              className="input-field pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
              状态
            </label>
            <div className="flex flex-wrap gap-1.5">
              {statusChips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setStatusFilter(c.key)}
                  className={`chip ${statusFilter === c.key ? 'chip-active' : 'chip-inactive'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
              提醒
            </label>
            <div className="flex flex-wrap gap-1.5">
              {alertChips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setAlertFilter(c.key)}
                  className={`chip ${alertFilter === c.key ? 'chip-active' : 'chip-inactive'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
              借用人
            </label>
            <select
              value={borrowerFilter}
              onChange={(e) => setBorrowerFilter(e.target.value)}
              className="input-field appearance-none cursor-pointer"
            >
              <option value="all">全部人员</option>
              {borrowers.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
              日期类型
            </label>
            <select
              value={dateScope}
              onChange={(e) => setDateScope(e.target.value as DateScope)}
              className="input-field appearance-none cursor-pointer"
            >
              <option value="due">预计归还日</option>
              <option value="checkout">借出日期</option>
              <option value="return">实际归还日</option>
              <option value="any">全部流转日期</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
              起始日期
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-2">
              截止日期
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-mono text-ink-500">
          显示 <span className="text-brass-300">{filtered.length}</span> / {logs.length} 把键盘
        </p>
        <p className="text-[11px] font-mono text-ink-600">
          {stats.overdue > 0 && (
            <span className="text-wine-400 mr-3">{stats.overdue} 把已逾期，请尽快催还</span>
          )}
          数据保存在本地浏览器
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="keycap !h-14 !w-14 !min-w-[56px] !rounded-xl !text-xl mb-4 opacity-60">
            <Keyboard className="h-6 w-6" />
          </div>
          <h3 className="font-mono text-base font-semibold text-ink-200 mb-2">
            {logs.length === 0 ? '还没有键盘资产' : '没有匹配的键盘'}
          </h3>
          <p className="text-sm text-ink-500 max-w-sm">
            {logs.length === 0
              ? '先在「列表」中新建键盘记录，然后回到这里登记借出与保养。'
              : hasFilter
                ? '试试清除或调整筛选条件。'
                : ''}
          </p>
          {hasFilter && (
            <button onClick={resetFilters} className="btn-ghost mt-4">
              清除筛选
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log, i) => (
            <AssetRow key={log.id} log={log} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
