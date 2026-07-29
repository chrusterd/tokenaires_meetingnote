import { describe, it, expect } from 'vitest'
import { encodeWav, splitIntoWavChunks, TARGET_SAMPLE_RATE, CHUNK_SECONDS } from '../src/audio'

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)

const u16 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true)

describe('encodeWav', () => {
  const wav = encodeWav(new Float32Array(1000))

  it('RIFF/WAVE/fmt/data 헤더를 쓴다', () => {
    expect(ascii(wav, 0, 4)).toBe('RIFF')
    expect(ascii(wav, 8, 4)).toBe('WAVE')
    expect(ascii(wav, 12, 4)).toBe('fmt ')
    expect(ascii(wav, 36, 4)).toBe('data')
  })

  it('16kHz 모노 16비트 PCM으로 선언한다', () => {
    expect(u16(wav, 20)).toBe(1)                      // PCM
    expect(u16(wav, 22)).toBe(1)                      // 채널
    expect(u32(wav, 24)).toBe(TARGET_SAMPLE_RATE)
    expect(u32(wav, 28)).toBe(TARGET_SAMPLE_RATE * 2) // 초당 바이트
    expect(u16(wav, 34)).toBe(16)                     // 비트 심도
  })

  it('선언한 길이가 실제 바이트 수와 맞는다', () => {
    expect(u32(wav, 40)).toBe(1000 * 2)
    expect(u32(wav, 4)).toBe(wav.byteLength - 8)
  })

  it('샘플을 16비트로 변환하고 범위를 넘는 값은 자른다', () => {
    const clipped = encodeWav(new Float32Array([0, 1, -1, 2, -2]))
    const view = new DataView(clipped.buffer)
    expect(view.getInt16(44, true)).toBe(0)
    expect(view.getInt16(46, true)).toBe(32767)
    expect(view.getInt16(48, true)).toBe(-32767)
    expect(view.getInt16(50, true)).toBe(32767)
    expect(view.getInt16(52, true)).toBe(-32767)
  })
})

describe('splitIntoWavChunks', () => {
  it('청크 하나가 Netlify 함수 본문 상한(6MB) 아래다', () => {
    const twoMinutes = new Float32Array(TARGET_SAMPLE_RATE * CHUNK_SECONDS)
    const [chunk] = splitIntoWavChunks(twoMinutes)
    expect(chunk.byteLength).toBeLessThan(6 * 1024 * 1024)
  })

  it('경계에서 정확히 나누고 마지막 조각만 짧다', () => {
    const samples = new Float32Array(TARGET_SAMPLE_RATE * (CHUNK_SECONDS * 2 + 30))
    const chunks = splitIntoWavChunks(samples)
    expect(chunks).toHaveLength(3)
    expect(u32(chunks[0], 40)).toBe(TARGET_SAMPLE_RATE * CHUNK_SECONDS * 2)
    expect(u32(chunks[2], 40)).toBe(TARGET_SAMPLE_RATE * 30 * 2)
  })

  it('모든 샘플이 어느 한 조각에는 들어간다', () => {
    const samples = new Float32Array(TARGET_SAMPLE_RATE * 250)
    const total = splitIntoWavChunks(samples).reduce((sum, c) => sum + u32(c, 40) / 2, 0)
    expect(total).toBe(samples.length)
  })

  it('빈 입력은 조각을 만들지 않는다', () => {
    expect(splitIntoWavChunks(new Float32Array(0))).toHaveLength(0)
  })
})
