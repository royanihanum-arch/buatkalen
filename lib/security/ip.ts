import { isIP } from 'node:net'

const V4_BLOCKED: Array<[number, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].map(([base, bits]) => [v4ToInt(base as string), bits as number])

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

function isBlockedV4(ip: string): boolean {
  const value = v4ToInt(ip)
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (value & mask) === (base & mask)
  })
}

function expandV6(ip: string): number[] | null {
  let address = ip.toLowerCase().split('%')[0]
  const v4Tail = address.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4Tail) {
    const n = v4ToInt(v4Tail[1])
    address = address.replace(v4Tail[1], `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`)
  }
  const [head, tail] = address.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail !== undefined && tail !== '' ? tail.split(':') : []
  const missing = 8 - headParts.length - tailParts.length
  if (address.includes('::') ? missing < 0 : headParts.length !== 8) return null
  const parts = [...headParts, ...Array(address.includes('::') ? missing : 0).fill('0'), ...tailParts]
  return parts.map((p) => parseInt(p || '0', 16))
}

function isBlockedV6(ip: string): boolean {
  const g = expandV6(ip)
  if (!g) return true
  if (g.every((x) => x === 0)) return true
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true
  // IPv4-mapped / translated / 6to4 / Teredo can smuggle private v4 targets.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isBlockedV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`)
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return true
  if (g[0] === 0x2002) return true
  if (g[0] === 0x2001 && g[1] === 0) return true
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true
  if ((g[0] & 0xfe00) === 0xfc00) return true
  if ((g[0] & 0xffc0) === 0xfe80) return true
  if ((g[0] & 0xff00) === 0xff00) return true
  return false
}

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return !isBlockedV4(ip)
  if (family === 6) return !isBlockedV6(ip)
  return false
}
