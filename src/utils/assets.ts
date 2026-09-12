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
  switch (input.action) {
    case 'checkout':
      if (!input.borrower.trim()) errors.borrower = '请填写借用人';
      if (!input.date) errors.date = '请选择借出日期';
      if (!input.dueDate) {
        errors.dueDate = '请选择预计归还日';
      } else if (input.date && input.dueDate < input.date) {
        errors.dueDate = '预计归还日不能早于借出日期';
      }
      break;
    case 'return':
      if (!input.returnDate) errors.returnDate = '请填写实际归还日期';
      if (!input.condition) errors.condition = '请选择归还成色';
      break;
    case 'maintenance_start':
    case 'maintenance_complete':
      if (!input.date) errors.date = '请选择日期';
      break;
    case 'retire':
      if (!input.date) errors.date = '请选择退役日期';
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
    if (loan && input.returnDate && loan.event.date && input.returnDate < loan.event.date) {
      return {
        field: 'returnDate',
        message: `实际归还日期（${input.returnDate}）不能早于借出日期（${loan.event.date}）`,
      };
    }
  }
  if (input.action === 'maintenance_complete') {
    const mt = getActiveMaintenance(log);
    if (mt && input.date && mt.date && input.date < mt.date) {
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
  action: CirculationAction;
  date?: string;
  reason: string;
}

export interface RebuiltCirculation {
  status: AssetStatus;
  circulation: CirculationEvent[];
  dropped: DroppedCirculation[];
}

/** 非法切换在 replay 场景下的原因 */
function replayTransitionReason(
  status: AssetStatus,
  action: CirculationAction,
): string | null {
  const guard = canTransition(status, action);
  if (guard.ok) return null;
  switch (action) {
    case 'checkout':
      if (status === 'lent_out') return '重复借出（上一笔借出尚未归还）';
      if (status === 'maintenance') return '保养中不能借出';
      if (status === 'retired') return '已退役的键盘不能再借出';
      break;
    case 'return':
      if (status === 'in_stock') return '未借出就归还（找不到对应的借出记录）';
      if (status === 'maintenance') return '保养中的键盘不能直接归还';
      if (status === 'retired') return '已退役的键盘不能归还';
      break;
    case 'maintenance_start':
      if (status === 'lent_out') return '外借中的键盘不能开始保养';
      if (status === 'maintenance') return '保养已在进行中，不能重复开始';
      if (status === 'retired') return '已退役的键盘不能开始保养';
      break;
    case 'maintenance_complete':
      if (status === 'in_stock') return '未开始保养就完成（找不到保养开始记录）';
      if (status === 'lent_out') return '外借中的键盘不能完成保养';
      if (status === 'retired') return '已退役的键盘不能完成保养';
      break;
    case 'retire':
      if (status === 'lent_out') return '外借中的键盘不能退役，请先归还';
      if (status === 'maintenance') return '保养中的键盘不能退役，请先完成保养';
      if (status === 'retired') return '重复退役';
      break;
  }
  return guard.reason ?? '当前状态不允许该操作';
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

  const sorted = [...events].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );

  for (const ev of sorted) {
    const drop = (reason: string) =>
      dropped.push({ keyboardId, keyboardName, action: ev.action, date: ev.date, reason });

    // 1) 必填字段
    if (ev.action === 'checkout') {
      if (!ev.borrower?.trim()) {
        drop('借出记录缺少借用人');
        continue;
      }
      if (!ev.dueDate) {
        drop('借出记录缺少预计归还日');
        continue;
      }
    }
    if (ev.action === 'return') {
      if (!ev.returnDate) {
        drop('归还记录缺少实际归还日期');
        continue;
      }
      if (!ev.condition) {
        drop('归还记录缺少成色');
        continue;
      }
    }

    // 2) 状态机
    const reason = replayTransitionReason(status, ev.action);
    if (reason) {
      drop(reason);
      continue;
    }

    // 3) 日期先后
    if (ev.action === 'return') {
      if (activeCheckout && ev.returnDate! < activeCheckout.date) {
        drop(`归还日期（${ev.returnDate}）早于借出日期（${activeCheckout.date}）`);
        continue;
      }
    }
    if (ev.action === 'maintenance_complete') {
      if (activeMaintenance && ev.date < activeMaintenance.date) {
        drop(`保养完成日期（${ev.date}）早于保养开始日期（${activeMaintenance.date}）`);
        continue;
      }
    }
    if (ev.action === 'checkout' && ev.dueDate && ev.dueDate < ev.date) {
      drop(`预计归还日（${ev.dueDate}）早于借出日期（${ev.date}）`);
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
