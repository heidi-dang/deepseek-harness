/**
 * @deepseek-ai/dsh-web-app — the browser-surface bundle's runtime glue plugin
 * plus the bundle patch (`cordis.patch.yml`, declared by the `dsh.bundle.patch`
 * manifest field). The plugin owns the browser-surface glue: it resolves
 * the built frontend dist (workspace knowledge of this bundle, never user
 * config), mounts the `frontend-static` fallback owner over it, registers the
 * harness-source and web-surface prompt sections, the bash-visible web runtime
 * variable, the URL line, and the default-browser handoff. App command-line
 * values arrive through the `webStartup` service expressions in the bundle
 * patch.
 * @module @deepseek-ai/dsh-web-app
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { addHarnessSourceSection } from '@deepseek-ai/dsh-app-boot'
import { assertTrustedAuthority } from '@deepseek-ai/dsh-client-connection'
import * as FrontendStatic from '@deepseek-ai/dsh-host-frontend-static'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-shell-env'

/** Bound time for one best-effort Tailscale discovery probe. */
const TAILSCALE_DISCOVERY_TIMEOUT_MS = 500

/** Stable Cordis plugin name. */
export const name = 'web-app'

/** This dsh installation's root, from either this package's source or built entry. */
const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/** Runtime service that releases Web rows after bind-dependent values resolve. */
const WEB_RUNTIME_SERVICE = 'webRuntime'

/** Services required before the web runtime can mount. */
export const inject = ['webServer']

/** Plugin config: composed deployment settings plus per-invocation command-line values. */
export interface Config {
  /** Permit default-browser handoff after the Loader tree settles; an SSH launch suppresses it. */
  openBrowser: boolean
  /** Print the URL line on activation; a non-interactive layer can turn it off. */
  printUrl: boolean
  /**
   * Register the model-visible surface context (the `app:web-surface` prompt
   * section and the `DSH_WEB_URL` bash variable). A one-shot non-interactive
   * layer can turn it off when its user is not in the GUI, so the
   * orientation text would be false.
   */
  surfaceContext: boolean
  /** Explicit `--trusted-host` authorities from this invocation. */
  trustedHosts: string[]
  /** Explicit `--trusted-config-host` authorities allowed past the privileged-method pin. */
  privilegedTrustedHosts: string[]
}

export const Config: z<Config> = z.object({
  openBrowser: z.boolean().default(true),
  printUrl: z.boolean().default(true),
  surfaceContext: z.boolean().default(true),
  trustedHosts: z.array(String).default([]),
  privilegedTrustedHosts: z.array(String).default([]),
})

/** Bind-dependent Web values shared by the trust fence and URL display. */
export interface WebRuntimeValues {
  /** Non-loopback LAN IPv4 literals plus auto-discovered Tailscale authorities, sampled once at bind. */
  lanAddresses: string[]
  /** LAN literals and Tailscale authorities followed by explicit invocation authorities. */
  trustedHosts: string[]
  /** Auto-discovered Tailscale authorities plus explicit `--trusted-config-host` grants, allowed past the privileged-method pin. */
  privilegedTrustedHosts: string[]
}

/** Environment variable naming the canonical local URL of this Web GUI. */
const DSH_WEB_URL = 'DSH_WEB_URL' as const

// Display-only mirror of the webserver schema's loopback host: the address the
// local URL always prints. Not a source of truth — the schema is.
const LOOPBACK_HOST = '127.0.0.1'
/** The webserver schema's all-interfaces bind literal. */
const ALL_INTERFACES_HOST = '0.0.0.0'

/** Whether this process was launched through SSH, including a forwarded-port session. */
function launchedThroughSsh(ctx: Context): boolean {
  const environment = launchEnvironmentOf(ctx)
  return ['SSH_CONNECTION', 'SSH_TTY'].some((name) => {
    const value = environment.getFrom(name, ['process'])?.value
    return value !== undefined && value !== ''
  })
}

const BROWSER_OPENER_MODULE = import.meta.resolve('open')

const BROWSER_OPENER_PROGRAM = `
try {
  const { default: open } = await import(${JSON.stringify(BROWSER_OPENER_MODULE)})
  const launcher = await open(process.argv[1])
  if (process.platform === 'win32') {
    // open resolves at PowerShell spawn; keep it referenced until that launcher hands the URL to Windows.
    const code = launcher.exitCode ?? await new Promise((resolve, reject) => {
      function onError(error) {
        launcher.off('close', onClose)
        reject(error)
      }
      function onClose(code) {
        launcher.off('error', onError)
        resolve(code)
      }
      launcher.ref()
      launcher.once('error', onError)
      launcher.once('close', onClose)
    })
    if (code !== 0) throw new Error('browser operating-system launcher exited with code ' + String(code))
  }
  process.exitCode = 0
} catch (error) {
  // The parent turns this exit into the manual-URL warning.
  console.error(error)
  process.exitCode = 1
}
`

/**
 * Bare web-transport authorities for this machine's Tailscale identity,
 * sampled from the live Tailscale daemon. A browser reaching `dsh web` from
 * another tailnet device — by the device's `100.x` address or its
 * `<device>.ts.net` magic-DNS name, whether the server is bound to loopback
 * (reached through `tailscale serve`/`funnel`) or to all interfaces — then
 * passes the `/api` browser-trust fence without a manual `--trusted-host`.
 * Tailscale is an overlay network, so these authorities are sampled
 * independently of the webserver bind host; a `127.0.0.1`-bound server is
 * still reachable at its Tailscale name, and a host left untaken at sample
 * time is otherwise refused (HTTP 403, surfaced client-side as a transport
 * error).
 *
 * Best-effort: when Tailscale is absent, not running, or unreachable, returns
 * []. Every candidate is canonicalized (IPv6 bracketed, trailing FQDN dot
 * stripped) and validated through the same `assertTrustedAuthority` the fence
 * uses, so an unexpected shape can never reach the fence and fail the plugin
 * load; it is skipped instead.
 * @returns bare host or host:port authorities.
 */
function sampleTailscaleAuthorities(): string[] {
  let raw: string
  try {
    raw = execFileSync('tailscale', ['status', '--json'], {
      timeout: TAILSCALE_DISCOVERY_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
  } catch {
    return []
  }
  let status: { Self?: unknown }
  try {
    status = JSON.parse(raw) as { Self?: unknown }
  } catch {
    return []
  }
  const self = status.Self
  if (!isPlainObject(self)) return []
  const authorities = new Set<string>()
  if (Array.isArray(self.TailscaleIPs)) {
    for (const ip of self.TailscaleIPs) {
      if (typeof ip !== 'string') continue
      authorities.add(ip.includes(':') ? `[${ip}]` : ip)
    }
  }
  if (typeof self.DNSName === 'string' && self.DNSName.length > 0) {
    authorities.add(self.DNSName.replace(/\.$/u, ''))
  }
  const accepted: string[] = []
  for (const authority of authorities) {
    try {
      assertTrustedAuthority(authority)
      accepted.push(authority)
    } catch {
      // An unexpected Tailscale authority shape must not reach the fence and
      // fail the plugin load; skip rather than trust or crash.
    }
  }
  return accepted
}

/**
 * Resolve one LAN-trust snapshot from the active server bind.
 *
 * Derived entries are port-less IP literals and DNS names: DNS rebinding needs
 * an attacker-controlled name, while an IP-literal Host is safe on any port
 * and an OS-assigned port is unknowable before bind. Tailscale authorities are
 * appended (sampled from the live daemon regardless of bind host) so a browser
 * on another Tailscale device reaches the GUI without a manual `--trusted-host`.
 * @param bindHost - the active webserver bind host.
 * @param extra - explicit `--trusted-host` values, in argument order.
 * @param privileged - explicit authorities granted configuration-plane access; passed through, never derived.
 * @returns the LAN display addresses and invocation-derived fence authorities.
 */
export function resolveLanTrust(bindHost: string, extra: readonly string[], privileged: readonly string[] = []): WebRuntimeValues {
  const lanInterfaces = bindHost === ALL_INTERFACES_HOST
    ? Object.values(networkInterfaces()).flat()
      .filter((iface): iface is NonNullable<typeof iface> => iface !== undefined && iface.family === 'IPv4' && !iface.internal)
      .map(iface => iface.address)
    : []
  // Tailscale is an overlay network: reachable even on a loopback-bound server
  // (via `tailscale serve`/`funnel`), so sample it independent of the bind host.
  const tailscale = sampleTailscaleAuthorities()
  const lanAddresses = [...lanInterfaces, ...tailscale]
  // The basic `/api` fence trusts every derived authority. The privileged-method
  // pin opens only to the authenticated tailnet plus explicit grants: a LAN
  // client may read the model catalog but never manage settings, credentials,
  // or presets, while a device on the same tailnet may.
  return {
    lanAddresses,
    trustedHosts: [...lanAddresses, ...extra],
    privilegedTrustedHosts: [...tailscale, ...privileged],
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === null || prototype === Object.prototype
}

/** Model-visible orientation and acceptance boundary for sessions created through `dsh web`. */
function webSurfacePrompt(webUrl: string): string {
  const updateContract = 'The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while '
    + '`pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. '
    + 'Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh. '
  return `You are interacting with the user through the DeepSeek Harness Web GUI at ${webUrl}. `
    + 'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. '
    + 'The browser provides no implicit DOM, route, or screenshot context. '
    + updateContract
    + 'Starting another server does not update this GUI. '
    + 'The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__. '
    + 'Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.'
}

/** Resolve the canonical loopback URL from the active Web server. */
function localWebUrl(ctx: Context): string {
  const port = ctx.get('webServer')?.port
  if (port === undefined) throw new Error('web-app: webServer service missing while resolving Web runtime')
  return `http://${LOOPBACK_HOST}:${String(port)}`
}

/** Dist location is workspace knowledge of this bundle: resolved through the frontend package exports, not configured. */
function resolveDistIndex(): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html')
  } catch {
    /* v8 ignore next 2 -- reachable only on a checkout without a built dist; the test tree builds it */
    throw new Error('web-app: frontend dist not built; run pnpm run build from the repository root first')
  }
}

/** Start the maintained platform opener without forwarding Harness credentials. */
function spawnBrowserLauncher(url: string): ChildProcess {
  return spawn(process.execPath, [
    '--input-type=module',
    '--eval', BROWSER_OPENER_PROGRAM,
    '--', url,
  ], {
    env: scrubbedParentEnv(),
    stdio: ['ignore', 'inherit', 'pipe'],
  })
}

/** Hand one URL to the operating system's default browser. */
async function openBrowser(url: string): Promise<void> {
  const launcher = spawnBrowserLauncher(url)
  let launcherStderr = ''
  launcher.stderr?.setEncoding('utf8')
  launcher.stderr?.on('data', (chunk: string) => { launcherStderr += chunk })
  await new Promise<void>((resolve, reject) => {
    function onError(error: Error): void {
      launcher.off('close', onClose)
      reject(error)
    }
    function onClose(code: number | null): void {
      launcher.off('error', onError)
      if (code !== 0) {
        const firstLine = launcherStderr.trim().split(/\r?\n/u)[0]
        const reason = firstLine === undefined || firstLine === ''
          ? `browser launcher exited with code ${String(code)}`
          : firstLine.replace(/^(?:[A-Za-z]*Error):\s*/u, '')
        reject(new Error(reason))
        return
      }
      if (launcherStderr !== '') process.stderr.write(launcherStderr)
      resolve()
    }
    launcher.once('error', onError)
    launcher.once('close', onClose)
  })
}

/** Test hooks for the built dist and native browser handoff; production never mutates them. */
export const internals: {
  resolveDistIndex: () => string
  openBrowser: (url: string) => Promise<void>
} = { resolveDistIndex, openBrowser }

/**
 * Mount the Web runtime: dist serving, surface prompt, the bash runtime
 * variable, the URL line, and the default-browser handoff.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const runtime = resolveLanTrust(ctx.webServer.host, config.trustedHosts, config.privilegedTrustedHosts)
  // The loopback URL belongs to this host. Under SSH, the operator reaches it
  // through a local forwarding address that this process cannot derive.
  const handoffBrowser = config.openBrowser && !launchedThroughSsh(ctx)
  // Release dependent rows only after bind-dependent trust has been sampled once.
  ctx.provide(WEB_RUNTIME_SERVICE, runtime)
  ctx.plugin(FrontendStatic, { distIndex: internals.resolveDistIndex() })
  if (config.surfaceContext) {
    ctx.inject(['systemPrompt'], (promptCtx) => {
      addHarnessSourceSection(promptCtx, SOURCE_ROOT)
      promptCtx.systemPrompt.section({
        name: 'app:web-surface',
        order: -98,
        text: () => webSurfacePrompt(localWebUrl(promptCtx)),
      })
    })
    ctx.inject(['shellEnv'], (runtimeCtx) => {
      runtimeCtx.shellEnv.register({
        name: 'web-runtime',
        variables: {
          [DSH_WEB_URL]: { description: 'Canonical local URL of the DeepSeek Harness Web GUI serving this session.' },
        },
        resolve: () => ({ [DSH_WEB_URL]: localWebUrl(runtimeCtx) }),
      })
    })
  }
  if (config.printUrl || handoffBrowser) {
    // The URL line and browser handoff are readiness signals: supervisors RPC
    // as soon as they observe the line, while a browser requests the page as
    // soon as it opens. Neither may run while sibling rows such as the /api
    // route owner are still mounting. Await Loader settlement first; a
    // hand-built tree without a Loader is already the complete tree.
    const announceReady = (): void => {
      const webUrl = localWebUrl(ctx)
      // Reuse the exact LAN snapshot provided to the /api trust fence.
      const lanCandidate = runtime.lanAddresses[0]
      const port = ctx.webServer.port
      if (config.printUrl) {
        console.log(`dsh web: ${webUrl}${lanCandidate === undefined ? '' : ` (LAN: http://${lanCandidate}:${String(port)})`}`)
      }
      if (handoffBrowser) {
        console.log('dsh web: opening the default browser; pass --no-open to disable')
        void internals.openBrowser(webUrl).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error)
          console.error(`web-app: could not open the default browser because ${reason}; visit ${webUrl} manually`)
        })
      }
    }
    // This row's own activation can precede a sibling failure. The app owns
    // readiness by waiting for its Loader tree, or announces at once in a
    // hand-built context without Loader.
    const settled = ctx.get('loader')?.await()
    if (settled === undefined) announceReady()
    else {
      void settled.then(() => {
        // The tree can be disposed while the boot was in flight (early
        // SIGTERM); a URL line or browser tab for a dead server would only
        // mislead, and reading the torn-down port would turn a clean shutdown
        // into a crash.
        if (ctx.get('webServer') !== undefined) announceReady()
      // Loader reports a failed boot; this row only stays quiet.
      }, () => {})
    }
  }
}
