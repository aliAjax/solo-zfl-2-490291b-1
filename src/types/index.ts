export type SwitchType = 'linear' | 'tactile' | 'clicky' | 'other';
export type SoundCharacter = 'deep' | 'bright' | 'muffled' | 'neutral';
export type KeycapMaterial = 'ABS' | 'PBT' | 'PC' | '混合' | '其他';
export type KeycapProfile = 'Cherry' | 'SA' | 'DSA' | 'OEM' | 'XDA' | 'KAT' | 'MT3' | '其他';
export type PlateMaterial = '铝' | '铜' | '钢' | 'PC/FR4' | '碳纤维' | '塑料' | '其他';
export type CaseMaterial = '铝合金' | '塑料' | '木头' | '亚克力' | '黄铜' | '不锈钢' | '其他';

/** 资产流转状态：每把键盘同一时刻只能处于其中一种 */
export type AssetStatus = 'in_stock' | 'lent_out' | 'maintenance' | 'retired';

/** 归还时登记的成色 */
export type AssetCondition = 'new' | 'good' | 'worn' | 'damaged';

/** 流转动作类型 */
export type CirculationAction =
  | 'checkout'
  | 'return'
  | 'maintenance_start'
  | 'maintenance_complete'
  | 'retire';

/** 一条资产流转记录（时间线条目） */
export interface CirculationEvent {
  id: string;
  action: CirculationAction;
  /** 事件发生日期 YYYY-MM-DD */
  date: string;
  /** ISO 时间戳，用于时间线排序 */
  createdAt: string;
  /** 借用人（checkout） */
  borrower?: string;
  /** 预计归还日 YYYY-MM-DD（checkout） */
  dueDate?: string;
  /** 实际归还日 YYYY-MM-DD（return） */
  returnDate?: string;
  /** 归还成色（return） */
  condition?: AssetCondition;
  /** 保养原因/内容（maintenance_start / maintenance_complete） */
  note?: string;
  /** 退役原因（retire） */
  reason?: string;
  operator?: string;
}

export interface KeyboardLog {
  id: string;
  name: string;
  brand: string;
  model: string;
  purchaseDate: string;
  overallRating: number;
  switchName: string;
  switchType: SwitchType;
  switchLubed: string;
  keycapMaterial: KeycapMaterial;
  keycapProfile: KeycapProfile;
  keycapProcess: string;
  plateMaterial: PlateMaterial;
  plateThickness: string;
  fillMaterial: string;
  caseMaterial: CaseMaterial;
  soundCharacter: SoundCharacter;
  soundTags: string[];
  reboundRating: number;
  tactilityRating: number;
  fatigueRating: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** 资产状态；旧数据缺省时归一化为在库 */
  status?: AssetStatus;
  /** 流转时间线，按时间先后排列 */
  circulation?: CirculationEvent[];
}

export interface FilterState {
  switchType: SwitchType | 'all';
  soundCharacter: SoundCharacter | 'all';
  minRating: number;
  searchKeyword: string;
}

export type ViewMode = 'list' | 'compare' | 'stats' | 'assets';

export interface AssetActionModalState {
  open: boolean;
  logId: string | null;
  action: CirculationAction | null;
}

export interface UIState {
  viewMode: ViewMode;
  selectedForCompare: string[];
  formModalOpen: boolean;
  editingLog: KeyboardLog | null;
  detailLog: KeyboardLog | null;
  importExportModalOpen: boolean;
  assetModal: AssetActionModalState;
}

export const SWITCH_TYPE_LABELS: Record<SwitchType, string> = {
  linear: '线性轴',
  tactile: '段落轴',
  clicky: '点击轴',
  other: '其他',
};

export const SOUND_CHARACTER_LABELS: Record<SoundCharacter, string> = {
  deep: '低沉',
  bright: '清脆',
  muffled: '闷响',
  neutral: '中性',
};

export const SWITCH_TYPES: SwitchType[] = ['linear', 'tactile', 'clicky', 'other'];
export const SOUND_CHARACTERS: SoundCharacter[] = ['deep', 'bright', 'muffled', 'neutral'];
export const KEYCAP_MATERIALS: KeycapMaterial[] = ['ABS', 'PBT', 'PC', '混合', '其他'];
export const KEYCAP_PROFILES: KeycapProfile[] = ['Cherry', 'SA', 'DSA', 'OEM', 'XDA', 'KAT', 'MT3', '其他'];
export const PLATE_MATERIALS: PlateMaterial[] = ['铝', '铜', '钢', 'PC/FR4', '碳纤维', '塑料', '其他'];
export const CASE_MATERIALS: CaseMaterial[] = ['铝合金', '塑料', '木头', '亚克力', '黄铜', '不锈钢', '其他'];

export const PRESET_SOUND_TAGS = [
  '沙脆', '麻将音', '雨滴声', '低频闷', '高频亮',
  '回响声', '塑料感', '金属感', '木头声', '软弹',
  '硬朗', '细腻', '厚重', '空灵', '干净',
];

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  in_stock: '在库',
  lent_out: '外借',
  maintenance: '保养中',
  retired: '退役',
};

export const ASSET_STATUS_ORDER: AssetStatus[] = ['in_stock', 'lent_out', 'maintenance', 'retired'];

export const CONDITION_LABELS: Record<AssetCondition, string> = {
  new: '全新',
  good: '良好',
  worn: '有磨损',
  damaged: '有损坏',
};

export const ASSET_CONDITIONS: AssetCondition[] = ['new', 'good', 'worn', 'damaged'];

export const CIRCULATION_ACTION_LABELS: Record<CirculationAction, string> = {
  checkout: '借出登记',
  return: '归还入库',
  maintenance_start: '开始保养',
  maintenance_complete: '保养完成',
  retire: '退役',
};
