import { describe, it, expect } from 'vitest'
import {
  resolveRoute,
  buildGeminiGenerateBody,
  buildGeminiChatBody,
  buildGeminiTtsBody,
  parseGeminiText,
  parseGeminiAudio,
  sampleRateFromMime,
  pcmToWav,
  GEMINI_DEFAULTS,
  SettingReader
} from '../aiProvider'

function settings(values: Record<string, string>): SettingReader {
  return (key) => values[key] ?? null
}

describe('resolveRoute — provider switching', () => {
  it('defaults every role to the local provider', () => {
    const get = settings({})
    expect(resolveRoute('analysis', get)).toEqual({ provider: 'local', model: 'qwen3.6:27b' })
    expect(resolveRoute('translate', get)).toEqual({ provider: 'local', model: 'scb10x/typhoon-translate1.5-4b' })
    expect(resolveRoute('tts', get)).toEqual({ provider: 'local', model: 'legraphista/Orpheus:latest' })
  })

  it('uses the configured local model names when set', () => {
    const get = settings({
      analysis_model: 'qwen3.5:9b',
      interactive_translate_model: 'translategemma:4b'
    })
    expect(resolveRoute('analysis', get).model).toBe('qwen3.5:9b')
    expect(resolveRoute('translate', get).model).toBe('translategemma:4b')
  })

  it('switches analysis to Gemini when provider=gemini and an API key exists', () => {
    const get = settings({
      analysis_provider: 'gemini',
      gemini_api_key: 'AIza-test',
      analysis_model: 'qwen3.5:9b'
    })
    expect(resolveRoute('analysis', get)).toEqual({
      provider: 'gemini',
      model: GEMINI_DEFAULTS.analysis
    })
  })

  it('switches translate and tts independently of analysis', () => {
    const get = settings({
      gemini_api_key: 'AIza-test',
      translate_provider: 'gemini',
      tts_provider: 'gemini'
    })
    expect(resolveRoute('analysis', get).provider).toBe('local')
    expect(resolveRoute('translate', get)).toEqual({ provider: 'gemini', model: GEMINI_DEFAULTS.translate })
    expect(resolveRoute('tts', get)).toEqual({ provider: 'gemini', model: GEMINI_DEFAULTS.tts })
  })

  it('respects custom Gemini model names', () => {
    const get = settings({
      gemini_api_key: 'AIza-test',
      analysis_provider: 'gemini',
      gemini_analysis_model: 'gemini-3.1-pro'
    })
    expect(resolveRoute('analysis', get).model).toBe('gemini-3.1-pro')
  })

  it('falls back to local when gemini is selected but the API key is missing or blank', () => {
    expect(resolveRoute('analysis', settings({ analysis_provider: 'gemini' })).provider).toBe('local')
    expect(
      resolveRoute('tts', settings({ tts_provider: 'gemini', gemini_api_key: '   ' })).provider
    ).toBe('local')
  })
})

describe('Gemini request bodies', () => {
  it('builds a generateContent body with temperature', () => {
    expect(buildGeminiGenerateBody('hello', { temperature: 0.7 })).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generationConfig: { temperature: 0.7 }
    })
  })

  it('maps chat roles: system → systemInstruction, assistant → model', () => {
    const body = buildGeminiChatBody([
      { role: 'system', content: 'You are a tutor' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello!' },
      { role: 'user', content: 'teach me' }
    ]) as {
      contents: { role: string; parts: { text: string }[] }[]
      systemInstruction?: { parts: { text: string }[] }
    }
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a tutor' }] })
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(body.contents[1].parts[0].text).toBe('hello!')
  })

  it('builds a TTS body requesting audio with the chosen voice', () => {
    const body = buildGeminiTtsBody('Good morning', 'Puck') as {
      generationConfig: {
        responseModalities: string[]
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } }
      }
    }
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck')
  })
})

describe('Gemini response parsing', () => {
  it('extracts text from candidates', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'สวัสดี' }, { text: 'ครับ' }] } }] }
    expect(parseGeminiText(json)).toBe('สวัสดีครับ')
  })

  it('throws on an API error payload', () => {
    expect(() => parseGeminiText({ error: { message: 'API key not valid' } })).toThrow(/API key not valid/)
  })

  it('throws when there is no text', () => {
    expect(() => parseGeminiText({ candidates: [] })).toThrow(/no text/)
  })

  it('extracts inline audio data and mime type', () => {
    const json = {
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: 'AAECAw==' } }] } }
      ]
    }
    expect(parseGeminiAudio(json)).toEqual({ base64: 'AAECAw==', mimeType: 'audio/L16;codec=pcm;rate=24000' })
  })

  it('reads the sample rate from the mime type with a 24kHz default', () => {
    expect(sampleRateFromMime('audio/L16;codec=pcm;rate=16000')).toBe(16000)
    expect(sampleRateFromMime('audio/pcm')).toBe(24000)
  })
})

describe('pcmToWav', () => {
  it('wraps PCM in a valid 44-byte RIFF/WAVE header', () => {
    const pcm = Buffer.alloc(2400, 7)
    const wav = pcmToWav(pcm, 24000)
    expect(wav.length).toBe(44 + pcm.length)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt32LE(24)).toBe(24000) // sample rate
    expect(wav.readUInt16LE(22)).toBe(1) // mono
    expect(wav.readUInt32LE(40)).toBe(pcm.length) // data length
    expect(wav.subarray(44).equals(pcm)).toBe(true)
  })
})
