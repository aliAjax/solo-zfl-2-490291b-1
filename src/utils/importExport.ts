import type {
  AssetStatus,
  AssetCondition,
  CirculationAction,
  CirculationEvent,
  KeyboardLog,
} from '@/types';
import {
  SWITCH_TYPES,
  SOUND_CHARACTERS,
  KEYCAP_MATERIALS,
  KEYCAP_PROFILES,
  PLATE_MATERIALS,
  CASE_MATERIALS,
  ASSET_CONDITIONS,
} from '@/types';

export const EXPORT_FORMAT_VERSION = 2;
export const EXPORT_FORMAT_MAGIC = 'keyfeeling-export';

export type DuplicateStrategy = 'skip' | 'overwrite' | 'regenerate';

export interface ExportEnvelope {
  format: string;
  version: number;
  exportedAt: string;
  recordCount: number;
  data: KeyboardLog[];
}

export interface ImportParseResult {
  fileValidLogs: KeyboardLog[];
  fileInvalidItems: Array<{ index: number; reason: string; raw: unknown }>;
  fileInternalDuplicates: Array<{ index: number; id: string; raw: unknown }>;
  /** 按状态机重建时间线时被丢弃的流转事件（含键盘名、动作、日期、原因） */
  droppedCirculation: DroppedCirculation[];
  /** 文件中所有键盘记录里出现的流转项原始数量 */
  totalCirculationItems: number;
  /** 清洗 + 状态机重建后最终保留的流转项数量 */
  keptCirculationItems: number;
  totalParsed: number;
  envelope?: ExportEnvelope;
}

export interface ImportApplyResult {
  toAdd: KeyboardLog[];
  toOverwrite: KeyboardLog[];
  toRegenerate: KeyboardLog[];
  skipped: KeyboardLog[];
  finalLogs: KeyboardLog[];
  stats: {
    added: number;
    overwritten: number;
    regenerated: number;
    skipped: number;
  };
}

export interface ValidatedLog {
  log: KeyboardLog;
  isDuplicateExisting: boolean;
}

const REQUIRED_STRING_FIELDS: (keyof KeyboardLog)[] = [
  'id',
  'name',
  'brand',
  'model',
  'purchaseDate',
  'switchName',
  'switchType',
  'switchLubed',
  'keycapMaterial',
  'keycapProfile',
  'keycapProcess',
  'plateMaterial',
  'plateThickness',
  'fillMaterial',
  'caseMaterial',
  'soundCharacter',
  'notes',
  'createdAt',
  'updatedAt',
];

const REQUIRED_NUMBER_FIELDS: (keyof KeyboardLog)[] = [
  'overallRating',
  'reboundRating',
  'tactilityRating',
  'fatigueRating',
];

function isValidSwitchType(v: unknown): v is KeyboardLog['switchType'] {
  return typeof v === 'string' && SWITCH_TYPES.includes(v as never);
}

function isValidSoundCharacter(v: unknown): v is KeyboardLog['soundCharacter'] {
  return typeof v === 'string' && SOUND_CHARACTERS.includes(v as never);
}

function isValidKeycapMaterial(v: unknown): v is KeyboardLog['keycapMaterial'] {
  return typeof v === 'string' && KEYCAP_MATERIALS.includes(v as never);
}

function isValidKeycapProfile(v: unknown): v is KeyboardLog['keycapProfile'] {
  return typeof v === 'string' && KEYCAP_PROFILES.includes(v as never);
}

function isValidPlateMaterial(v: unknown): v is KeyboardLog['plateMaterial'] {
  return typeof v === 'string' && PLATE_MATERIALS.includes(v as never);
}

function isValidCaseMaterial(v: unknown): v is KeyboardLog['caseMaterial'] {
  return typeof v === 'string' && CASE_MATERIALS.includes(v as never);
}

import { genNewId } from './id';
import {
  rebuildCirculationTimeline,
  compareEventTime,
  isValidGregorianDate,
  isValidISODateTime,
  type DroppedCirculation,
} from './assets';

export { genNewId };

const VALID_ASSET_STATUSES: AssetStatus[] = ['in_stock', 'lent_out', 'maintenance', 'retired'];
const VALID_CIRCULATION_ACTIONS: CirculationAction[] = [
  'checkout',
  'return',
  'maintenance_start',
  'maintenance_complete',
  'retire',
];

const DATE_FIELD_HINT = '（需为真实存在的公历日期 YYYY-MM-DD）';

/**
 * 清洗单条键盘记录的流转列表。
 * 任何无法成为合法 CirculationEvent 的原始项都会通过 onDrop 上报
 * （键盘、动作、日期、原因），保证：原始项数 = 保留项 + 丢弃项。
 */
export function normalizeCirculation(
  raw: unknown,
  onDrop?: (dropped: DroppedCirculation) => void,
  ctx?: { keyboardId: string; keyboardName: string },
): CirculationEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: CirculationEvent[] = [];
  const keyboardId = ctx?.keyboardId ?? '';
  const keyboardName = ctx?.keyboardName ?? '';

  const report = (
    item: unknown,
    code: string,
    reason: string,
    fields?: { action?: unknown; date?: unknown; value?: unknown },
  ) => {
    const o =
      typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : undefined;
    const rawAction = fields?.action ?? o?.action;
    const rawDate = fields?.date ?? o?.date;
    const rawValue = fields?.value;
    onDrop?.({
      keyboardId,
      keyboardName,
      action: typeof rawAction === 'string' ? rawAction : '(未知动作)',
      date: typeof rawDate === 'string' ? rawDate : undefined,
      reason,
      code,
      value:
        typeof rawValue === 'string'
          ? rawValue
          : rawValue === undefined
            ? undefined
            : String(rawValue),
    });
  };

  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      report(item, 'not_an_object', '流转项不是有效的对象');
      continue;
    }
    const o = item as Record<string, unknown>;

    if (typeof o.id !== 'string' || !o.id) {
      report(item, 'missing_id', '缺少有效编号（id）');
      continue;
    }
    if (typeof o.action !== 'string' ||
      !VALID_CIRCULATION_ACTIONS.includes(o.action as CirculationAction)) {
      report(
        item,
        'invalid_action',
        `动作类型无效：${o.action === undefined ? '缺失' : String(o.action)}`,
        { value: o.action },
      );
      continue;
    }
    if (!isValidGregorianDate(o.date)) {
      report(
        item,
        'invalid_event_date',
        `事件日期无效${DATE_FIELD_HINT}：${o.date === undefined ? '缺失' : String(o.date)}`,
        { value: o.date },
      );
      continue;
    }
    if (!isValidISODateTime(o.createdAt)) {
      report(
        item,
        'invalid_created_at',
        `创建时间不是可解析且真实存在的 ISO 8601 日期时间（如 2026-09-12T10:00:00Z）：${
          o.createdAt === undefined ? '缺失' : String(o.createdAt)
        }`,
        { value: o.createdAt },
      );
      continue;
    }

    // 预计归还日：出现时必须是真实公历日期（借出时还会在状态机重建阶段校验非空）
    if (o.dueDate !== undefined && !isValidGregorianDate(o.dueDate)) {
      report(item, 'invalid_due_date', `预计归还日不合法${DATE_FIELD_HINT}：${String(o.dueDate)}`, {
        value: o.dueDate,
      });
      continue;
    }
    // 实际归还日：出现时必须是真实公历日期（归还时还会在状态机重建阶段校验非空）
    if (o.returnDate !== undefined && !isValidGregorianDate(o.returnDate)) {
      report(item, 'invalid_return_date', `实际归还日不合法${DATE_FIELD_HINT}：${String(o.returnDate)}`, {
        value: o.returnDate,
      });
      continue;
    }
    // 成色：出现时必须在合法枚举内（归还时还会在状态机重建阶段校验非空）
    if (
      o.condition !== undefined &&
      (typeof o.condition !== 'string' ||
        !ASSET_CONDITIONS.includes(o.condition as AssetCondition))
    ) {
      report(item, 'invalid_condition', `成色取值不合法：${String(o.condition)}`, {
        value: o.condition,
      });
      continue;
    }

    const ev: CirculationEvent = {
      id: o.id,
      action: o.action as CirculationAction,
      date: o.date,
      createdAt: o.createdAt,
    };
    if (typeof o.borrower === 'string') ev.borrower = o.borrower;
    if (typeof o.dueDate === 'string') ev.dueDate = o.dueDate;
    if (typeof o.returnDate === 'string') ev.returnDate = o.returnDate;
    if (typeof o.condition === 'string') ev.condition = o.condition as AssetCondition;
    if (typeof o.note === 'string') ev.note = o.note;
    if (typeof o.reason === 'string') ev.reason = o.reason;
    if (typeof o.operator === 'string') ev.operator = o.operator;
    out.push(ev);
  }
  out.sort(compareEventTime);
  return out;
}

/**
 * 归一化一条已通过基础校验的记录：
 * 旧数据（无 status/circulation）默认在库、空时间线；
 * 有流转记录时先做结构清洗、再按合法状态机逐条 replay 重建。
 * 两个阶段被丢弃的流转项都通过 onDropped 上报，满足
 * 「原始流转项数 = 最终保留项 + 丢弃项」。
 */
export function normalizeLog(
  log: KeyboardLog,
  onDropped?: (dropped: DroppedCirculation[]) => void,
): KeyboardLog {
  const ctx = { keyboardId: log.id, keyboardName: log.name };
  const collected: DroppedCirculation[] = [];
  const report = (d: DroppedCirculation) => collected.push(d);

  const rawCirculation = (log as Partial<KeyboardLog>).circulation;

  // 非数组（但存在）的流转字段：整体计为一项被丢弃的数据
  if (rawCirculation !== undefined && !Array.isArray(rawCirculation)) {
    report({
      ...ctx,
      action: '(未知动作)',
      reason: '流转记录不是数组，整段无法解析',
      code: 'not_an_array',
    });
  }

  const cleaned = normalizeCirculation(rawCirculation, report, ctx);

  if (cleaned.length === 0) {
    let status: AssetStatus = 'in_stock';
    if (
      typeof log.status === 'string' &&
      VALID_ASSET_STATUSES.includes(log.status as AssetStatus)
    ) {
      status = log.status as AssetStatus;
    }
    if (collected.length > 0) onDropped?.(collected);
    return { ...log, status, circulation: [] };
  }

  const rebuilt = rebuildCirculationTimeline(cleaned, log.id, log.name);
  if (rebuilt.dropped.length > 0) collected.push(...rebuilt.dropped);
  if (collected.length > 0) onDropped?.(collected);
  return { ...log, status: rebuilt.status, circulation: rebuilt.circulation };
}

// ---------------------------------------------------------------------------

function validateLog(raw: unknown): { valid: boolean; reason?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, reason: '不是有效的对象' };
  }

  const obj = raw as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof obj[field] !== 'string') {
      return { valid: false, reason: `缺少或无效的字段: ${String(field)}` };
    }
  }

  for (const field of REQUIRED_NUMBER_FIELDS) {
    if (typeof obj[field] !== 'number' || isNaN(obj[field] as number)) {
      return { valid: false, reason: `缺少或无效的字段: ${String(field)}` };
    }
  }

  if (!Array.isArray(obj.soundTags) || !obj.soundTags.every((t) => typeof t === 'string')) {
    return { valid: false, reason: 'soundTags 必须是字符串数组' };
  }

  if (!isValidSwitchType(obj.switchType)) {
    return { valid: false, reason: `无效的轴体类型: ${String(obj.switchType)}` };
  }
  if (!isValidSoundCharacter(obj.soundCharacter)) {
    return { valid: false, reason: `无效的声音倾向: ${String(obj.soundCharacter)}` };
  }
  if (!isValidKeycapMaterial(obj.keycapMaterial)) {
    return { valid: false, reason: `无效的键帽材质: ${String(obj.keycapMaterial)}` };
  }
  if (!isValidKeycapProfile(obj.keycapProfile)) {
    return { valid: false, reason: `无效的键帽高度: ${String(obj.keycapProfile)}` };
  }
  if (!isValidPlateMaterial(obj.plateMaterial)) {
    return { valid: false, reason: `无效的定位板材质: ${String(obj.plateMaterial)}` };
  }
  if (!isValidCaseMaterial(obj.caseMaterial)) {
    return { valid: false, reason: `无效的外壳材质: ${String(obj.caseMaterial)}` };
  }

  return { valid: true };
}

export function extractLogsFromJson(rawJson: string): KeyboardLog[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed
      .filter((item): item is KeyboardLog => validateLog(item).valid)
      .map((l) => normalizeLog(l));
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'format' in parsed &&
    (parsed as { format?: unknown }).format === EXPORT_FORMAT_MAGIC &&
    'data' in parsed &&
    Array.isArray((parsed as { data: unknown }).data)
  ) {
    return (parsed as { data: unknown[] }).data
      .filter((item): item is KeyboardLog => validateLog(item).valid)
      .map((l) => normalizeLog(l));
  }

  return [];
}

export function parseImportData(rawJson: string, existingIds: string[]): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new Error('JSON 解析失败：' + (e instanceof Error ? e.message : String(e)));
  }

  let envelope: ExportEnvelope | undefined;
  let rawArray: unknown[];

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    'format' in parsed &&
    (parsed as { format?: unknown }).format === EXPORT_FORMAT_MAGIC &&
    'data' in parsed &&
    Array.isArray((parsed as { data: unknown }).data)
  ) {
    envelope = parsed as ExportEnvelope;
    rawArray = envelope.data;
  } else if (Array.isArray(parsed)) {
    rawArray = parsed;
  } else {
    throw new Error('JSON 根节点必须是数组或有效的 KeyFeeling 导出格式');
  }

  const fileValidLogs: KeyboardLog[] = [];
  const fileInvalidItems: Array<{ index: number; reason: string; raw: unknown }> = [];
  const fileInternalDuplicates: Array<{ index: number; id: string; raw: unknown }> = [];
  const droppedCirculation: DroppedCirculation[] = [];
  let totalCirculationItems = 0;
  let keptCirculationItems = 0;
  const seenIds = new Set<string>();

  rawArray.forEach((item, index) => {
    const result = validateLog(item);
    if (!result.valid) {
      fileInvalidItems.push({ index, reason: result.reason || '未知错误', raw: item });
      return;
    }

    const candidate = item as KeyboardLog;

    // 文件内重复整条跳过（其流转项不重复计入）
    if (seenIds.has(candidate.id)) {
      fileInternalDuplicates.push({ index, id: candidate.id, raw: item });
      return;
    }
    seenIds.add(candidate.id);

    const rawCirc = (candidate as Partial<KeyboardLog>).circulation;
    if (Array.isArray(rawCirc)) {
      totalCirculationItems += rawCirc.length;
    } else if (rawCirc !== undefined) {
      totalCirculationItems += 1; // 非数组整段按 1 项计
    }

    const log = normalizeLog(candidate, (dropped) => droppedCirculation.push(...dropped));
    keptCirculationItems += log.circulation?.length ?? 0;

    fileValidLogs.push(log);
  });

  void existingIds;

  return {
    fileValidLogs,
    fileInvalidItems,
    fileInternalDuplicates,
    droppedCirculation,
    totalCirculationItems,
    keptCirculationItems,
    totalParsed: rawArray.length,
    envelope,
  };
}

export function buildValidatedLogs(
  fileValidLogs: KeyboardLog[],
  existingLogs: KeyboardLog[],
): {
  newLogs: ValidatedLog[];
  duplicateWithExisting: ValidatedLog[];
} {
  const existingIdSet = new Set(existingLogs.map((l) => l.id));
  const newLogs: ValidatedLog[] = [];
  const duplicateWithExisting: ValidatedLog[] = [];

  for (const log of fileValidLogs) {
    const entry: ValidatedLog = {
      log,
      isDuplicateExisting: existingIdSet.has(log.id),
    };
    if (entry.isDuplicateExisting) {
      duplicateWithExisting.push(entry);
    } else {
      newLogs.push(entry);
    }
  }

  return { newLogs, duplicateWithExisting };
}

export function applyImport(
  existingLogs: KeyboardLog[],
  selectedForImport: string[],
  fileValidLogs: KeyboardLog[],
  duplicateWithExisting: ValidatedLog[],
  strategy: DuplicateStrategy,
): ImportApplyResult {
  const selectedSet = new Set(selectedForImport);

  const selectedNew = fileValidLogs
    .filter((log) => {
      if (!selectedSet.has(log.id)) return false;
      const dup = duplicateWithExisting.find((d) => d.log.id === log.id);
      return !dup;
    });

  const selectedDup = duplicateWithExisting
    .filter((d) => selectedSet.has(d.log.id));

  const toAdd: KeyboardLog[] = [];
  const toOverwrite: KeyboardLog[] = [];
  const toRegenerate: KeyboardLog[] = [];
  const skipped: KeyboardLog[] = [];

  for (const log of selectedNew) {
    toAdd.push(log);
  }

  for (const dup of selectedDup) {
    switch (strategy) {
      case 'skip':
        skipped.push(dup.log);
        break;
      case 'overwrite':
        toOverwrite.push({
          ...dup.log,
          updatedAt: new Date().toISOString(),
        });
        break;
      case 'regenerate': {
        let newId = genNewId();
        const allIds = new Set([
          ...existingLogs.map((l) => l.id),
          ...toAdd.map((l) => l.id),
          ...toRegenerate.map((l) => l.id),
        ]);
        while (allIds.has(newId)) {
          newId = genNewId();
        }
        toRegenerate.push({
          ...dup.log,
          id: newId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        break;
      }
    }
  }

  let finalLogs = [...existingLogs];

  for (const ow of toOverwrite) {
    const idx = finalLogs.findIndex((l) => l.id === ow.id);
    if (idx >= 0) {
      finalLogs[idx] = ow;
    } else {
      finalLogs.unshift(ow);
    }
  }

  finalLogs = [...toAdd, ...toRegenerate, ...finalLogs];

  return {
    toAdd,
    toOverwrite,
    toRegenerate,
    skipped,
    finalLogs,
    stats: {
      added: toAdd.length,
      overwritten: toOverwrite.length,
      regenerated: toRegenerate.length,
      skipped: skipped.length,
    },
  };
}

export function buildExportEnvelope(logs: KeyboardLog[]): ExportEnvelope {
  return {
    format: EXPORT_FORMAT_MAGIC,
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    recordCount: logs.length,
    data: logs,
  };
}

export function exportToJson(logs: KeyboardLog[]): string {
  return JSON.stringify(buildExportEnvelope(logs), null, 2);
}

export function downloadJsonFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateExportFilename(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `keyfeeling-export-${dateStr}.json`;
}
