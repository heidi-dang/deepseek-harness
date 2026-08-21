/** Single-sample LAN-trust resolution for the /api browser-trust fence (`resolveLanTrust`). */

import { describe, expect, it, vi } from 'vitest'
import { resolveLanTrust } from '../src/index.ts'

const mockExec = vi.hoisted(() => vi.fn())

vi.mock('node:os', () => ({
  networkInterfaces: () => ({
    lo0: [
      { family: 'IPv4', internal: true, address: '127.0.0.1' },
    ],
    en0: [
      { family: 'IPv6', internal: false, address: 'fe80::1' },
      { family: 'IPv4', internal: false, address: '192.168.1.5' },
    ],
    en1: [
      { family: 'IPv4', internal: false, address: '10.0.0.7' },
    ],
    utun0: undefined,
  }),
}))

vi.mock('node:child_process', () => ({ execFileSync: mockExec }))

describe('resolveLanTrust', () => {
  it('samples non-internal IPv4 addresses once for an all-interfaces bind: trust and display share them', () => {
    mockExec.mockReturnValue('')
    const { lanAddresses, trustedHosts } = resolveLanTrust('0.0.0.0', ['harness.internal:3080'])
    expect(lanAddresses).toEqual(['192.168.1.5', '10.0.0.7'])
    expect(trustedHosts).toEqual(['192.168.1.5', '10.0.0.7', 'harness.internal:3080'])
  })

  it('auto-trusts Tailscale authorities for an all-interfaces bind so a remote device reaches the GUI', () => {
    mockExec.mockReturnValue(JSON.stringify({
      Self: {
        TailscaleIPs: ['100.64.0.4', 'fd7a:115c:a1e0:ab12:4843:cd96:626b:1a2b'],
        DNSName: 'box.ts.net.',
      },
    }))
    const { lanAddresses, trustedHosts } = resolveLanTrust('0.0.0.0', [])
    // IPv6 is bracketed, the FQDN trailing dot is stripped, all enter the fence.
    expect(lanAddresses).toEqual([
      '192.168.1.5',
      '10.0.0.7',
      '100.64.0.4',
      '[fd7a:115c:a1e0:ab12:4843:cd96:626b:1a2b]',
      'box.ts.net',
    ])
    expect(trustedHosts).toEqual(lanAddresses)
  })

  it('opens the privileged-method pin to Tailscale authorities but not LAN literals, on every bind', () => {
    mockExec.mockReturnValue(JSON.stringify({
      Self: {
        TailscaleIPs: ['100.64.0.4'],
        DNSName: 'box.ts.net.',
      },
    }))
    const allInterfaces = resolveLanTrust('0.0.0.0', [])
    expect(allInterfaces.privilegedTrustedHosts).toEqual(['100.64.0.4', 'box.ts.net'])
    const loopback = resolveLanTrust('127.0.0.1', [])
    expect(loopback.privilegedTrustedHosts).toEqual(['100.64.0.4', 'box.ts.net'])
    // LAN literals never reach the privileged plane, whichever bind host.
    expect(allInterfaces.privilegedTrustedHosts).not.toContain('192.168.1.5')
    expect(loopback.privilegedTrustedHosts).not.toContain('192.168.1.5')
  })

  it('skips a malformed Tailscale authority rather than failing the load', () => {
    mockExec.mockReturnValue(JSON.stringify({
      Self: { TailscaleIPs: ['100.64.0.4'], DNSName: 'not a host' },
    }))
    const { trustedHosts } = resolveLanTrust('0.0.0.0', [])
    expect(trustedHosts).toEqual(['192.168.1.5', '10.0.0.7', '100.64.0.4'])
  })

  it('falls back to nothing when Tailscale is absent, not running, or unreachable', () => {
    mockExec.mockImplementation(() => { throw new Error('no tailscale') })
    expect(resolveLanTrust('0.0.0.0', ['lab.internal']).trustedHosts)
      .toEqual(['192.168.1.5', '10.0.0.7', 'lab.internal'])
  })

  it('falls back to nothing when the Tailscale status is not JSON', () => {
    mockExec.mockReturnValue('not json')
    expect(resolveLanTrust('0.0.0.0', []).trustedHosts)
      .toEqual(['192.168.1.5', '10.0.0.7'])
  })

  it('falls back to nothing when Tailscale reports no usable Self identity', () => {
    mockExec.mockReturnValue(JSON.stringify({ Self: 1 }))
    expect(resolveLanTrust('0.0.0.0', []).trustedHosts)
      .toEqual(['192.168.1.5', '10.0.0.7'])
  })

  it('auto-trusts Tailscale authorities for a loopback bind: overlay reachability, no LAN literals', () => {
    mockExec.mockReturnValue(JSON.stringify({
      Self: {
        TailscaleIPs: ['100.64.0.4', 'fd7a:115c:a1e0:ab12:4843:cd96:626b:1a2b'],
        DNSName: 'box.ts.net.',
      },
    }))
    const { lanAddresses, trustedHosts } = resolveLanTrust('127.0.0.1', [])
    // The overlay name/IP is reachable even on a loopback-bound server, so it
    // enters the fence; LAN interfaces are not (only an all-interfaces bind exposes them).
    expect(lanAddresses).toEqual(['100.64.0.4', '[fd7a:115c:a1e0:ab12:4843:cd96:626b:1a2b]', 'box.ts.net'])
    expect(trustedHosts).toEqual(lanAddresses)
  })

  it('derives no LAN literals for a loopback bind — extras alone stand beside Tailscale', () => {
    mockExec.mockReturnValue('')
    expect(resolveLanTrust('127.0.0.1', [])).toEqual({ lanAddresses: [], trustedHosts: [], privilegedTrustedHosts: [] })
    expect(resolveLanTrust('127.0.0.1', ['lab.internal']))
      .toEqual({ lanAddresses: [], trustedHosts: ['lab.internal'], privilegedTrustedHosts: [] })
  })

  it('passes an explicit privileged list through alongside Tailscale, never derived from LAN', () => {
    mockExec.mockReturnValue(JSON.stringify({
      Self: { TailscaleIPs: ['100.64.0.4'], DNSName: 'box.ts.net.' },
    }))
    expect(resolveLanTrust('127.0.0.1', [], ['lab.internal']))
      .toEqual({
        lanAddresses: ['100.64.0.4', 'box.ts.net'],
        trustedHosts: ['100.64.0.4', 'box.ts.net'],
        privilegedTrustedHosts: ['100.64.0.4', 'box.ts.net', 'lab.internal'],
      })
    // The all-interfaces bind derives LAN literals into the basic fence only;
    // the privileged plane still excludes LAN and keeps Tailscale + explicit.
    expect(resolveLanTrust('0.0.0.0', [], ['lab.internal'])).toEqual({
      lanAddresses: ['192.168.1.5', '10.0.0.7', '100.64.0.4', 'box.ts.net'],
      trustedHosts: ['192.168.1.5', '10.0.0.7', '100.64.0.4', 'box.ts.net'],
      privilegedTrustedHosts: ['100.64.0.4', 'box.ts.net', 'lab.internal'],
    })
  })
})
