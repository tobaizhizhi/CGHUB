/** 生成业务支付 id（进 paymentIdHash 对账锚点）。最小实现，时间戳串。 */
export function newPaymentId(prefix = 'pay'): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${d}-${Math.random().toString(36).slice(2, 8)}`;
}
