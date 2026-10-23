/**
 * 把书名转成安全的文件名。
 *
 * Windows 不允许 \ / : * ? " < > | 与控制字符，且结尾的点和空格会被系统吞掉；
 * 全角标点（：、？、《》）是合法的，保持原样。连续下划线与首尾下划线一并收敛，
 * 避免"书名全是非法字符"时得到一个只有下划线的文件名。
 */
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

export function sanitizeFileName(input: string, fallback = '未命名'): string {
  const cleaned = input
    .replace(ILLEGAL, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_.\s]+|[_.\s]+$/g, '');

  const limited = Array.from(cleaned)
    .slice(0, 80)
    .join('')
    .replace(/[_.\s]+$/g, '');
  return limited || fallback;
}
