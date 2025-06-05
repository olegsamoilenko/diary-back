export function offsetToTimezoneStr(offset: number): string {
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`;
}
