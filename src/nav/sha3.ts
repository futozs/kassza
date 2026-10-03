import { bytesToHex } from '../core/crypto'

const RATE_BYTES = 72
const OUTPUT_BYTES = 64
const LANE_BYTES = 8
const LANES = 25
const ROUNDS = 24
const DOMAIN_SUFFIX = 0x06
const FINAL_BIT = 0x80
const MASK_64 = (1n << 64n) - 1n

const ROUND_CONSTANTS: readonly bigint[] = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
]

const ROTATIONS: readonly number[] = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
]

function lane(lanes: readonly bigint[], index: number): bigint {
  return lanes[index] ?? 0n
}

function rotateLeft(value: bigint, shift: number): bigint {
  if (shift === 0) return value
  const amount = BigInt(shift)
  return ((value << amount) | (value >> (64n - amount))) & MASK_64
}

function keccakF1600(state: bigint[]): void {
  const columns: bigint[] = new Array(5).fill(0n)
  const rotated: bigint[] = new Array(LANES).fill(0n)
  for (let round = 0; round < ROUNDS; round++) {
    for (let x = 0; x < 5; x++) {
      columns[x] =
        lane(state, x) ^
        lane(state, x + 5) ^
        lane(state, x + 10) ^
        lane(state, x + 15) ^
        lane(state, x + 20)
    }
    for (let x = 0; x < 5; x++) {
      const delta = lane(columns, (x + 4) % 5) ^ rotateLeft(lane(columns, (x + 1) % 5), 1)
      for (let y = 0; y < LANES; y += 5) state[x + y] = lane(state, x + y) ^ delta
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const source = x + 5 * y
        rotated[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft(
          lane(state, source),
          ROTATIONS[source] ?? 0,
        )
      }
    }
    for (let y = 0; y < LANES; y += 5) {
      for (let x = 0; x < 5; x++) {
        const current = lane(rotated, x + y)
        const next = lane(rotated, ((x + 1) % 5) + y)
        const afterNext = lane(rotated, ((x + 2) % 5) + y)
        state[x + y] = (current ^ (~next & afterNext)) & MASK_64
      }
    }
    state[0] = lane(state, 0) ^ (ROUND_CONSTANTS[round] ?? 0n)
  }
}

function pad(data: Uint8Array): Uint8Array {
  const blocks = Math.floor(data.length / RATE_BYTES) + 1
  const padded = new Uint8Array(blocks * RATE_BYTES)
  padded.set(data)
  padded[data.length] = (padded[data.length] ?? 0) ^ DOMAIN_SUFFIX
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) ^ FINAL_BIT
  return padded
}

export function sha3_512(data: Uint8Array): Uint8Array {
  const state: bigint[] = new Array(LANES).fill(0n)
  const padded = pad(data)
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength)
  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let index = 0; index < RATE_BYTES / LANE_BYTES; index++) {
      state[index] = lane(state, index) ^ view.getBigUint64(offset + index * LANE_BYTES, true)
    }
    keccakF1600(state)
  }
  const output = new Uint8Array(OUTPUT_BYTES)
  const outputView = new DataView(output.buffer)
  for (let index = 0; index < OUTPUT_BYTES / LANE_BYTES; index++) {
    outputView.setBigUint64(index * LANE_BYTES, lane(state, index), true)
  }
  return output
}

const encoder = new TextEncoder()

export function sha3_512Hex(input: string | Uint8Array): string {
  return bytesToHex(sha3_512(typeof input === 'string' ? encoder.encode(input) : input))
}
