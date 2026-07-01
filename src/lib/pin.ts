// PIN 해시 (가벼운 잠금 — 캐주얼한 훔쳐보기 방지용)
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('moa-pin::' + pin)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
