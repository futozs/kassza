import * as root from '../dist/index.js'
import * as journal from '../dist/journal/index.js'
import * as money from '../dist/money/index.js'
import * as observe from '../dist/observe/index.js'
import * as reports from '../dist/reports/index.js'
import * as stores from '../dist/stores/index.js'
import * as testing from '../dist/testing/index.js'
import { runSmoke } from './smoke-core.mjs'

export default {
  async fetch() {
    try {
      const checks = await runSmoke({ root, testing, reports, journal, stores, money, observe })
      return Response.json({ ok: true, checks })
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        },
        { status: 500 },
      )
    }
  },
}
