import type {
  AssetStatus,
  CirculationAction,
  CirculationEvent,
  KeyboardLog,
} from '@/types';
import { genNewId } from '@/utils/id';

/** 即将到期阈值（天） */
export const DUE_SOON_DAYS = 3;

export function todayStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 是否为真实存在的公历日期（YYYY-MM-DD）。
 * 拒绝格式错误以及格式正确但不存在的日期：02-30、09-99、非闰年的 02-29 等。
 */
export function isValidGregorianDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  // 重建后反查，由引擎处理大小月和闰年，不一致说明日期被规整过（不存在）
  const dt = new Date(y, mo - 1, da);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === da;
}

/** 按真实日历比较两个 YYYY-MM-DD 日期；任一非法返回 null */
export function compareRealDates(a: string, b: string): -1 | 0 | 1 | null {
  if (!isValidGregorianDate(a) || !isValidGregorianDate(b)) return null;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// ISO 8601 日期时间：YYYY-MM-DD[ T]HH:mm(:ss(.fff))?(Z|±HH:mm)?（时区可省略）
const ISO_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|(?:[+-](\d{2}):?(\d{2})))?$/;

/**
 * 是否为可解析的 ISO 8601 日期时间，并且日期（含闰年/大小月）与时刻
 * （时 0-23、分秒 0-59）真实存在。拒绝 02-30、非闰年 02-29、非法月份、
 * 25:00、60 分/秒、只有日期没有时间、超出 ±14:00 的时区偏移，以及非 ISO 格式。
 */
export function isValidISODateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATETIME_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = m[6] === undefined ? 0 : Number(m[6]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  if (hh > 23 || mi > 59 || ss > 59) return false;
  if (m[8] !== undefined) {
    const offH = Number(m[9]);
    const offM = Number(m[10]);
    if (offM > 59 || offH > 14 || (offH === 14 && offM > 0)) return false;
  }
  // 用 UTC 重建反查：引擎按真实公历规整，不一致说明日期不存在
  const dt = new Date(Date.UTC(y, mo - 1, da, hh, mi, ss));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === da &&
    dt.getUTCHours() === hh &&
    dt.getUTCMinutes() === mi &&
    dt.getUTCSeconds() === ss &&
    !isNaN(dt.getTime())
  );
}

/** 时间线排序：按创建时间真实时刻，同刻按 id 确定次序 */
export function compareEventTime(a: CirculationEvent, b: CirculationEvent): -1 | 0 | 1 {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (!isNaN(ta) && !isNaN(tb)) {
    if (ta < tb) return -1;
    if (ta > tb) return 1;
  } else if (a.createdAt < b.createdAt) return -1;
  else if (a.createdAt > b.createdAt) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface ActiveLoan {
  event: CirculationEvent;
  borrower: string;
  dueDate: string;
}

/** 取最近一次未配对归还的借出事件 */
export function getActiveLoan(log: KeyboardLog): ActiveLoan | null {
  const events = log.circulation ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.action === 'checkout') {
      return {
        event: ev,
        borrower: ev.borrower ?? '',
        dueDate: ev.dueDate ?? '',
      };
    }
    if (ev.action === 'return') return null;
  }
  return null;
}

/** 取未完成的保养开始事件 */
export function getActiveMaintenance(log: KeyboardLog): CirculationEvent | null {
  const events = log.circulation ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.action === 'maintenance_start') return ev;
    if (ev.action === 'maintenance_complete') return null;
  }
  return null;
}

export function daysBetween(fromISO: string, toISO: string): number | null {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export type LoanUrgency = 'overdue' | 'due_soon' | 'normal';

export function getLoanUrgency(log: KeyboardLog, today: string): LoanUrgency | null {
  const loan = getActiveLoan(log);
  if (!loan || !loan.dueDate) return null;
  const diff = daysBetween(today, loan.dueDate);
  if (diff === null) return null;
  if (diff < 0) return 'overdue';
  if (diff <= DUE_SOON_DAYS) return 'due_soon';
  return 'normal';
}

export function isOverdue(log: KeyboardLog, today: string): boolean {
  return getLoanUrgency(log, today) === 'overdue';
}

export interface AssetStats {
  total: number;
  inStock: number;
  lentOut: number;
  maintenance: number;
  retired: number;
  overdue: number;
  dueSoon: number;
}

export function getAssetStats(logs: KeyboardLog[], today: string): AssetStats {
  const stats: AssetStats = {
    total: logs.length,
    inStock: 0,
    lentOut: 0,
    maintenance: 0,
    retired: 0,
    overdue: 0,
    dueSoon: 0,
  };
  for (const log of logs) {
    switch (log.status ?? 'in_stock') {
      case 'in_stock':
        stats.inStock++;
        break;
      case 'lent_out':
        stats.lentOut++;
        break;
      case 'maintenance':
        stats.maintenance++;
        break;
      case 'retired':
        stats.retired++;
        break;
    }
    const urgency = getLoanUrgency(log, today);
    if (urgency === 'overdue') stats.overdue++;
    else if (urgency === 'due_soon') stats.dueSoon++;
  }
  return stats;
}

/** 当前所有在外借用人（去重，用于人员筛选） */
export function getActiveBorrowers(logs: KeyboardLog[]): string[] {
  const set = new Set<string>();
  for (const log of logs) {
    const loan = getActiveLoan(log);
    if (loan && loan.borrower.trim()) set.add(loan.borrower.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

/**
 * 校验状态切换是否合法。
 * 规则：
 *  - 外借、保养、退役互不并行（状态机同时只允许一种）
 *  - 借出 / 保养 / 退役只能从在库发起
 *  - 归还只能从外借发起
 *  - 完成保养只能从保养中发起
 *  - 退役为终态，退役后不可再操作
 */
export function canTransition(
  status: AssetStatus,
  action: CirculationAction,
): { ok: boolean; reason?: string } {
  switch (action) {
    case 'checkout':
      if (status === 'lent_out')
        return { ok: false, reason: '该键盘已在外借中，请先办理归还后再借出' };
      if (status === 'maintenance')
        return { ok: false, reason: '该键盘正在保养中，保养完成回到在库后才能借出' };
      if (status === 'retired')
        return { ok: false, reason: '该键盘已退役，退役资产不能再借出' };
      return { ok: true };
    case 'return':
      if (status === 'in_stock')
        return { ok: false, reason: '该键盘当前在库，没有进行中的借出记录' };
      if (status === 'maintenance')
        return { ok: false, reason: '该键盘正在保养中，不能直接归还（请先完成保养）' };
      if (status === 'retired')
        return { ok: false, reason: '该键盘已退役，不能办理归还' };
      return { ok: true };
    case 'maintenance_start':
      if (status === 'lent_out')
        return { ok: false, reason: '该键盘已外借，请先收回并归还入库后再送保养' };
      if (status === 'maintenance')
        return { ok: false, reason: '该键盘已在保养中，保养不能重复登记' };
      if (status === 'retired')
        return { ok: false, reason: '该键盘已退役，不能再发起保养' };
      return { ok: true };
    case 'maintenance_complete':
      if (status === 'in_stock')
        return { ok: false, reason: '该键盘当前在库，没有进行中的保养记录' };
      if (status === 'lent_out')
        return { ok: false, reason: '该键盘已外借，不能完成保养' };
      if (status === 'retired')
        return { ok: false, reason: '该键盘已退役，不能完成保养' };
      return { ok: true };
    case 'retire':
      if (status === 'lent_out')
        return { ok: false, reason: '该键盘已外借，请先收回归还后再办理退役' };
      if (status === 'maintenance')
        return { ok: false, reason: '该键盘正在保养中，请等保养完成回到在库后再退役' };
      if (status === 'retired') return { ok: false, reason: '该键盘已经是退役状态' };
      return { ok: true };
  }
}

export function nextStatus(action: CirculationAction): AssetStatus {
  switch (action) {
    case 'checkout':
      return 'lent_out';
    case 'return':
    case 'maintenance_complete':
      return 'in_stock';
    case 'maintenance_start':
      return 'maintenance';
    case 'retire':
      return 'retired';
  }
}

export interface CheckoutInput {
  date: string;
  borrower: string;
  dueDate: string;
  note?: string;
}
export interface ReturnInput {
  date: string;
  returnDate: string;
  condition: NonNullable<CirculationEvent['condition']>;
  note?: string;
}
export interface MaintenanceStartInput {
  date: string;
  note?: string;
}
export interface MaintenanceCompleteInput {
  date: string;
  note?: string;
}
export interface RetireInput {
  date: string;
  reason?: string;
}
export type AssetActionInput =
  | ({ action: 'checkout' } & CheckoutInput)
  | ({ action: 'return' } & ReturnInput)
  | ({ action: 'maintenance_start' } & MaintenanceStartInput)
  | ({ action: 'maintenance_complete' } & MaintenanceCompleteInput)
  | ({ action: 'retire' } & RetireInput);

/** 业务字段校验（在状态机校验通过之后），返回错误信息（key -> message） */
export function validateActionInput(input: AssetActionInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const badDate = (label: string, v?: string) =>
    v ? `${label} ${v} 不是真实存在的公历日期` : `请选择${label}`;
  switch (input.action) {
    case 'checkout':
      if (!input.borrower.trim()) errors.borrower = '请填写借用人';
      if (!input.date) errors.date = '请选择借出日期';
      else if (!isValidGregorianDate(input.date)) errors.date = badDate('借出日期', input.date);
      if (!input.dueDate) {
        errors.dueDate = '请选择预计归还日';
      } else if (!isValidGregorianDate(input.dueDate)) {
        errors.dueDate = badDate('预计归还日', input.dueDate);
      } else if (
        isValidGregorianDate(input.date) &&
        compareRealDates(input.dueDate, input.date) === -1
      ) {
        errors.dueDate = '预计归还日不能早于借出日期';
      }
      break;
    case 'return':
      if (!input.returnDate) {
        errors.returnDate = '请填写实际归还日期';
      } else if (!isValidGregorianDate(input.returnDate)) {
        errors.returnDate = badDate('实际归还日期', input.returnDate);
      }
      if (!input.condition) errors.condition = '请选择归还成色';
      break;
    case 'maintenance_start':
    case 'maintenance_complete':
      if (!input.date) {
        errors.date = '请选择日期';
      } else if (!isValidGregorianDate(input.date)) {
        errors.date = badDate('保养日期', input.date);
      }
      break;
    case 'retire':
      if (!input.date) {
        errors.date = '请选择退役日期';
      } else if (!isValidGregorianDate(input.date)) {
        errors.date = badDate('退役日期', input.date);
      }
      break;
  }
  return errors;
}

/**
 * 校验事件相对当前时间线的日期先后：
 *  - 归还日期不能早于对应借出日期
 *  - 保养完成日期不能早于保养开始日期
 * 返回 { field, message }，无问题返回 null。
 */
export function timelineOrderError(
  log: KeyboardLog,
  input: AssetActionInput,
): { field: string; message: string } | null {
  if (input.action === 'return') {
    const loan = getActiveLoan(log);
    if (
      loan &&
      isValidGregorianDate(input.returnDate) &&
      isValidGregorianDate(loan.event.date) &&
      compareRealDates(input.returnDate, loan.event.date) === -1
    ) {
      return {
        field: 'returnDate',
        message: `实际归还日期（${input.returnDate}）不能早于借出日期（${loan.event.date}）`,
      };
    }
  }
  if (input.action === 'maintenance_complete') {
    const mt = getActiveMaintenance(log);
    if (
      mt &&
      isValidGregorianDate(input.date) &&
      isValidGregorianDate(mt.date) &&
      compareRealDates(input.date, mt.date) === -1
    ) {
      return {
        field: 'date',
        message: `保养完成日期（${input.date}）不能早于保养开始日期（${mt.date}）`,
      };
    }
  }
  return null;
}

/** 表单提交前的完整业务校验：必填字段 + 日期顺序 */
export function validateCirculationAction(
  log: KeyboardLog,
  input: AssetActionInput,
): Record<string, string> {
  const errors = validateActionInput(input);
  const order = timelineOrderError(log, input);
  if (order && !errors[order.field]) errors[order.field] = order.message;
  return errors;
}

// ---------------------------------------------------------------------------
// 导入重建：按合法状态机逐条 replay 时间线
// ---------------------------------------------------------------------------

export interface DroppedCirculation {
  keyboardId: string;
  keyboardName: string;
  /** 动作类型；脏数据可能是不在合法枚举里的原始字符串 */
  action: CirculationAction | string;
  /** 事件日期；清洗阶段被丢弃时可能是不合规的原始值 */
  date?: string;
  /** 含具体值的完整原因，用于展示 */
  reason: string;
  /** 稳定的原因类别代码，用于界面按原因分组（不含具体日期/值） */
  code: string;
  /** 触发丢弃的原始非法值（如坏的创建时间、日期字符串） */
  value?: string;
}

export interface RebuiltCirculation {
  status: AssetStatus;
  circulation: CirculationEvent[];
  dropped: DroppedCirculation[];
}

/** 非法切换在 replay 场景下的原因（code 用于分组，reason 含中文说明） */
function replayTransitionReason(
  status: AssetStatus,
  action: CirculationAction,
): { code: string; reason: string } | null {
  const guard = canTransition(status, action);
  if (guard.ok) return null;
  const table: Partial<Record<`${AssetStatus}:${CirculationAction}`, { code: string; reason: string }>> = {
    'lent_out:checkout': { code: 'duplicate_checkout', reason: '重复借出（上一笔借出尚未归还）' },
    'maintenance:checkout': { code: 'illegal_transition', reason: '保养中不能借出' },
    'retired:checkout': { code: 'illegal_transition', reason: '已退役的键盘不能再借出' },
    'in_stock:return': { code: 'return_without_checkout', reason: '未借出就归还（找不到对应的借出记录）' },
    'maintenance:return': { code: 'illegal_transition', reason: '保养中的键盘不能直接归还' },
    'retired:return': { code: 'illegal_transition', reason: '已退役的键盘不能归还' },
    'lent_out:maintenance_start': { code: 'illegal_transition', reason: '外借中的键盘不能开始保养' },
    'maintenance:maintenance_start': { code: 'duplicate_maintenance', reason: '保养已在进行中，不能重复开始' },
    'retired:maintenance_start': { code: 'illegal_transition', reason: '已退役的键盘不能开始保养' },
    'in_stock:maintenance_complete': { code: 'maintenance_without_start', reason: '未开始保养就完成（找不到保养开始记录）' },
    'lent_out:maintenance_complete': { code: 'illegal_transition', reason: '外借中的键盘不能完成保养' },
    'retired:maintenance_complete': { code: 'illegal_transition', reason: '已退役的键盘不能完成保养' },
    'lent_out:retire': { code: 'illegal_transition', reason: '外借中的键盘不能退役，请先归还' },
    'maintenance:retire': { code: 'illegal_transition', reason: '保养中的键盘不能退役，请先完成保养' },
    'retired:retire': { code: 'duplicate_retire', reason: '重复退役' },
  };
  return table[`${status}:${action}`] ?? { code: 'illegal_transition', reason: guard.reason ?? '当前状态不允许该操作' };
}

/**
 * 按时间顺序逐条 replay 流转事件，丢弃所有不合法事件：
 * 状态切换非法、缺少必填（借用人/预计归还日/归还日期/成色）、日期倒挂。
 */
export function rebuildCirculationTimeline(
  events: CirculationEvent[],
  keyboardId: string,
  keyboardName: string,
): RebuiltCirculation {
  const dropped: DroppedCirculation[] = [];
  const accepted: CirculationEvent[] = [];
  let status: AssetStatus = 'in_stock';
  let activeCheckout: CirculationEvent | null = null;
  let activeMaintenance: CirculationEvent | null = null;

  const sorted = [...events].sort(compareEventTime);

  for (const ev of sorted) {
    const drop = (code: string, reason: string, value?: string) =>
      dropped.push({
        keyboardId,
        keyboardName,
        action: ev.action,
        date: ev.date,
        reason,
        code,
        value,
      });

    // 1) 必填字段
    if (ev.action === 'checkout') {
      if (!ev.borrower?.trim()) {
        drop('missing_borrower', '借出记录缺少借用人');
        continue;
      }
      if (!ev.dueDate) {
        drop('missing_due_date', '借出记录缺少预计归还日');
        continue;
      }
    }
    if (ev.action === 'return') {
      if (!ev.returnDate) {
        drop('missing_return_date', '归还记录缺少实际归还日期');
        continue;
      }
      if (!ev.condition) {
        drop('missing_condition', '归还记录缺少成色');
        continue;
      }
    }

    // 2) 状态机
    const guardResult = replayTransitionReason(status, ev.action);
    if (guardResult) {
      drop(guardResult.code, guardResult.reason);
      continue;
    }

    // 3) 日期先后（按真实公历日期）
    if (ev.action === 'return') {
      if (
        activeCheckout &&
        compareRealDates(ev.returnDate!, activeCheckout.date) === -1
      ) {
        drop(
          'return_before_checkout',
          `归还日期（${ev.returnDate}）早于借出日期（${activeCheckout.date}）`,
        );
        continue;
      }
    }
    if (ev.action === 'maintenance_complete') {
      if (activeMaintenance && compareRealDates(ev.date, activeMaintenance.date) === -1) {
        drop(
          'maintenance_complete_before_start',
          `保养完成日期（${ev.date}）早于保养开始日期（${activeMaintenance.date}）`,
        );
        continue;
      }
    }
    if (
      ev.action === 'checkout' &&
      ev.dueDate &&
      compareRealDates(ev.dueDate, ev.date) === -1
    ) {
      drop(
        'due_before_checkout',
        `预计归还日（${ev.dueDate}）早于借出日期（${ev.date}）`,
      );
      continue;
    }

    accepted.push(ev);
    switch (ev.action) {
      case 'checkout':
        activeCheckout = ev;
        break;
      case 'return':
        activeCheckout = null;
        break;
      case 'maintenance_start':
        activeMaintenance = ev;
        break;
      case 'maintenance_complete':
        activeMaintenance = null;
        break;
    }
    status = nextStatus(ev.action);
  }

  return { status, circulation: accepted, dropped };
}

/** 追加一条流转事件并推进状态；非法切换抛出带中文原因的错误 */
export function applyCirculation(
  log: KeyboardLog,
  input: AssetActionInput,
  nowISO: string,
): KeyboardLog {
  const status: AssetStatus = log.status ?? 'in_stock';
  const guard = canTransition(status, input.action);
  if (!guard.ok) {
    throw new Error(guard.reason ?? '非法的状态切换');
  }
  const fieldErrors = validateCirculationAction(log, input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new Error(Object.values(fieldErrors)[0]);
  }

  const base = {
    id: genNewId(),
    createdAt: nowISO,
  };

  let event: CirculationEvent;
  switch (input.action) {
    case 'checkout':
      event = {
        ...base,
        action: 'checkout',
        date: input.date,
        borrower: input.borrower.trim(),
        dueDate: input.dueDate,
        note: input.note?.trim() || undefined,
      };
      break;
    case 'return': {
      const loan = getActiveLoan(log);
      event = {
        ...base,
        action: 'return',
        date: input.date || input.returnDate,
        returnDate: input.returnDate,
        condition: input.condition,
        borrower: loan?.borrower,
        note: input.note?.trim() || undefined,
      };
      break;
    }
    case 'maintenance_start':
      event = {
        ...base,
        action: 'maintenance_start',
        date: input.date,
        note: input.note?.trim() || undefined,
      };
      break;
    case 'maintenance_complete':
      event = {
        ...base,
        action: 'maintenance_complete',
        date: input.date,
        note: input.note?.trim() || undefined,
      };
      break;
    case 'retire':
      event = {
        ...base,
        action: 'retire',
        date: input.date,
        reason: input.reason?.trim() || undefined,
      };
      break;
  }

  return {
    ...log,
    status: nextStatus(input.action),
    circulation: [...(log.circulation ?? []), event],
  };
}
