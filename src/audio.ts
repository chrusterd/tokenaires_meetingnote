// 오디오를 Netlify 함수가 받을 수 있는 크기로 잘라 보내기 위한 유틸.
// 동기 함수 요청 본문 상한이 약 6MB라, 16kHz 모노 16비트(=1.92MB/분)로 낮춘 뒤
// 2분씩 끊으면 청크당 3.84MB로 여유가 남는다.

export const TARGET_SAMPLE_RATE = 16000
export const CHUNK_SECONDS = 120
/** 디코드 후 길이 상한. 넘으면 전사 요청 수가 감당이 안 된다. */
export const MAX_DURATION_SECONDS = 2 * 60 * 60
/** 디코드 전 크기 상한. decodeAudioData는 PCM을 통째로 메모리에 올린다. */
export const MAX_INPUT_BYTES = 300 * 1024 * 1024

const WAV_HEADER_BYTES = 44

export function encodeWav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)          // fmt 청크 길이
  view.setUint16(20, 1, true)           // PCM
  view.setUint16(22, 1, true)           // 모노
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // 초당 바이트
  view.setUint16(32, 2, true)           // 블록 정렬
  view.setUint16(34, 16, true)          // 비트 심도
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(WAV_HEADER_BYTES + index * 2, Math.round(clamped * 32767), true)
  }

  return new Uint8Array(buffer)
}

export function splitIntoWavChunks(
  samples: Float32Array,
  sampleRate = TARGET_SAMPLE_RATE,
  seconds = CHUNK_SECONDS,
): Uint8Array[] {
  const samplesPerChunk = sampleRate * seconds
  const chunks: Uint8Array[] = []
  for (let start = 0; start < samples.length; start += samplesPerChunk) {
    chunks.push(encodeWav(samples.subarray(start, start + samplesPerChunk), sampleRate))
  }
  return chunks
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  const mono = new Float32Array(buffer.length)
  for (let index = 0; index < buffer.length; index += 1) {
    let sum = 0
    for (const channel of channels) sum += channel[index]
    mono[index] = sum / channels.length
  }
  return mono
}

/**
 * 컨텍스트 샘플레이트로 디코딩하면 브라우저가 리샘플링까지 해준다.
 * OfflineAudioContext를 쓰는 이유: 출력 장치를 열지 않고, 기본값이 아닌
 * 샘플레이트에서 AudioContext가 NotSupportedError를 내는 하드웨어를 피한다.
 */
export async function decodeToMono(blob: Blob, sampleRate = TARGET_SAMPLE_RATE): Promise<Float32Array> {
  if (blob.size > MAX_INPUT_BYTES) {
    throw new Error(`오디오 파일이 너무 큽니다 (${Math.round(blob.size / 1024 / 1024)}MB).`)
  }

  // OfflineAudioContext는 close()가 없다 — 참조가 끊기면 GC가 회수한다.
  const context = new OfflineAudioContext(1, 1, sampleRate)
  const decoded = await context.decodeAudioData(await blob.arrayBuffer())
  if (decoded.duration > MAX_DURATION_SECONDS) {
    throw new Error(`오디오가 너무 깁니다 (${Math.round(decoded.duration / 60)}분). 2시간 이내로 나눠서 올려주세요.`)
  }
  return mixToMono(decoded)
}
