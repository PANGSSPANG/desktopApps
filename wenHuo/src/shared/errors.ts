export const ERROR_CODES = [
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'DB_WRITE_FAILED',
  'DB_MIGRATION_FAILED',
  'CONFLICT_STALE_CONTENT',
  'CHAPTER_LOCKED',
  'EXPORT_FAILED',
  'IMPORT_FAILED',
  'BACKUP_FAILED',
  'NATIVE_MODULE_LOAD_FAILED',
  'UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** 面向用户的中文文案：说清发生了什么、用户能做什么。 */
const USER_MESSAGES: Record<ErrorCode, string> = {
  INVALID_ARGUMENT: '参数不合法，操作已取消。',
  NOT_FOUND: '目标内容不存在，可能已被删除。',
  DB_WRITE_FAILED: '保存失败，已保留草稿，请检查磁盘空间后重试。',
  DB_MIGRATION_FAILED: '数据库升级失败，已保留旧数据，请重启应用或联系我们。',
  CONFLICT_STALE_CONTENT: '这一章已在别处更新，请重新打开后再编辑。',
  CHAPTER_LOCKED: '这一章已标记为完成，需先改回草稿才能修改。',
  EXPORT_FAILED: '导出失败，请检查保存位置是否可写。',
  IMPORT_FAILED: '导入失败，请检查文件格式后重试。',
  BACKUP_FAILED: '备份失败，请检查磁盘空间与目标目录权限。',
  NATIVE_MODULE_LOAD_FAILED: '数据库组件加载失败，请重新安装应用。',
  UNKNOWN: '出现了意外错误，操作未完成。',
};

export function userMessage(code: ErrorCode): string {
  return USER_MESSAGES[code];
}

/** 主进程内部抛出的可识别错误；日志记录细节，界面只展示 message。 */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? userMessage(code));
    this.name = 'AppError';
    this.code = code;
  }
}

export function toErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  return 'UNKNOWN';
}

export function toResultMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return userMessage('UNKNOWN');
}
