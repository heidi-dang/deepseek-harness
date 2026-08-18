/** Single-sample LAN-trust resolution for the /api browser-trust fence (`resolveLanTrust`). */

import { describe, expect, it, vi } from 'vitest'
import { resolveLanTrust } from '../src/index.ts'

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

describe('resolveLanTrust', () => {
  it('samples non-internal IPv4 addresses once for an all-interfaces bind: trust and display share them', () => {
    const { lanAddresses, trustedHosts } = resolveLanTrust('0.0.0.0', ['harness.internal:3080'])
    expect(lanAddresses).toEqual(['192.168.1.5', '10.0.0.7'])
    expect(trustedHosts).toEqual(['192.168.1.5', '10.0.0.7', 'harness.internal:3080'])
  })

  it('derives nothing for a loopback bind — extras alone stand, no LAN URL to print', () => {
    expect(resolveLanTrust('127.0.0.1', [])).toEqual({ lanAddresses: [], trustedHosts: [], privilegedTrustedHosts: [] })
    expect(resolveLanTrust('127.0.0.1', ['lab.internal']))
      .toEqual({ lanAddresses: [], trustedHosts: ['lab.internal'], privilegedTrustedHosts: [] })
  })

  it('passes an explicit privileged list through unchanged, never derived from the bind', () => {
    expect(resolveLanTrust('127.0.0.1', [], ['lab.internal']))
      .toEqual({ lanAddresses: [], trustedHosts: [], privilegedTrustedHosts: ['lab.internal'] })
    // The all-interfaces bind derives LAN literals into the fence list only;
    // the privileged grant stays exactly the explicit values.
    expect(resolveLanTrust('0.0.0.0', [], ['lab.internal'])).toEqual({
      lanAddresses: ['192.168.1.5', '10.0.0.7'],
      trustedHosts: ['192.168.1.5', '10.0.0.7'],
      privilegedTrustedHosts: ['lab.internal'],
    })
  })
})
