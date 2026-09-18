import type { WorkerMessage, WorkerRequest } from './runtime/protocol'
import { runSandboxCode } from './runtime/run'
import { serialize } from './runtime/serialize'

const scope = self as unknown as {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void
  addEventListener(
    type: 'unhandledrejection',
    listener: (event: PromiseRejectionEvent) => void,
  ): void
}

let activeRunId = 0

scope.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
  scope.postMessage({
    type: 'console',
    runId: activeRunId,
    entry: {
      level: 'error',
      args: [{ t: 'string', v: 'Kezeletlen Promise hiba:' }, serialize(event.reason)],
      time: 0,
    },
  })
})

scope.addEventListener('message', async (event) => {
  const request = event.data
  if (request.type !== 'run') return
  activeRunId = request.runId
  let counter = 0
  const result = await runSandboxCode(
    request.code,
    {
      onConsole: (entry) => scope.postMessage({ type: 'console', runId: request.runId, entry }),
      onCall: (call) => scope.postMessage({ type: 'call', runId: request.runId, call }),
    },
    {
      latencyMs: [90, 260],
      onBytes: (bytes) => {
        counter += 1
        const ref = `pdf-${request.runId}-${counter}`
        const copy = bytes.slice()
        scope.postMessage({ type: 'bytes', runId: request.runId, ref, buffer: copy.buffer }, [
          copy.buffer,
        ])
        return ref
      },
    },
  )
  scope.postMessage({ type: 'done', runId: request.runId, result })
})

scope.postMessage({ type: 'ready' })
