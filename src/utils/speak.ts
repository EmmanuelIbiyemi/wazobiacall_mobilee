// speak.ts: turn translated text into voice ON THE PHONE (no audio hop through your server).
//
// Install:  npx expo install expo-file-system expo-audio
// (uses the new File API, so no base64 package is needed)
import { File, Paths } from 'expo-file-system';

const TTS_URL = 'https://api.9jalingo.org';

// Speaker IDs from the 9jaLingo docs. Change after listening to a few voices.
const VOICES: Record<string, string> = {
  yo: 'adeola_yo',
  ig: 'adaeze_ig',
  pcm: 'ada_pcm',
  ha: 'aisha_ha',
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pollMs = (v: unknown) => Math.min(Math.max(Number(v) || 5, 2), 10) * 1000;

async function getAudio(text: string, lang: string): Promise<ArrayBuffer> {
  const voice = VOICES[lang];
  if (!voice) throw new Error('No voice for language: ' + lang);

  // `process.env.EXPO_PUBLIC_NAIJALINGO_KEY` is `string | undefined`, so read it
  // once and fail loudly here. After this guard the header value is always a string.
  const apiKey = process.env.EXPO_PUBLIC_NAIJALINGO_KEY;
  if (!apiKey) {
    throw new Error('Missing EXPO_PUBLIC_NAIJALINGO_KEY. Set it in your .env file.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    // Same header the official SDK sends: if the engine was asleep, the server
    // answers 202 + a job id instead of making the request hang.
    Prefer: 'respond-async-on-cold-start',
  };

  const res = await fetch(`${TTS_URL}/v1/audio/speech`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: text,
      voice,
      lang,
      model: '9jalingo-tts-1',
      response_format: 'wav',
    }),
  });

  if (res.status === 202) {
    // Engine was cold: poll the job until the audio is ready.
    const queued = await res.json();
    const id = encodeURIComponent(String(queued.job_id));
    const deadline = Date.now() + 5 * 60 * 1000;
    let wait = pollMs(queued.retry_after);
    while (Date.now() < deadline) {
      await sleep(wait);
      const s = await (await fetch(`${TTS_URL}/v1/jobs/${id}`, { headers })).json();
      const state = String(s.status || '').toLowerCase();
      if (state === 'completed') {
        const a = await fetch(`${TTS_URL}/v1/jobs/${id}/audio`, { headers });
        if (!a.ok) throw new Error('Audio download failed: ' + a.status);
        return a.arrayBuffer();
      }
      if (state === 'failed') throw new Error(String(s.error || 'TTS job failed'));
      wait = pollMs(s.retry_after);
    }
    throw new Error('TTS timed out');
  }

  if (!res.ok) {
    // Surface the server's own reason (e.g. "Starter plan limit reached") in the
    // thrown error so the console log is useful. The UI never shows this text.
    let detail = '';
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
        detail = String((parsed as { detail: unknown }).detail);
      }
    } catch {
      // No JSON body; fall through with just the status.
    }
    throw new Error(detail ? `TTS error ${res.status}: ${detail}` : `TTS error ${res.status}`);
  }
  if ((res.headers.get('content-type') || '').includes('json')) {
    throw new Error('TTS returned JSON instead of audio');
  }
  return res.arrayBuffer();
}

let lastFile: File | null = null;

const remove = (f: File | null) => {
  try {
    f?.delete();
  } catch {
    // already gone, nothing to do
  }
};

/** Generate the voice and start playing it. `player` comes from useAudioPlayer (expo-audio). */
export async function speak(text: string, lang: string, player: any): Promise<void> {
  const buf = await getAudio(text, lang);
  // The player needs a file to read from. It is a temp file in the cache: only ONE
  // exists at a time, because the previous one is deleted as soon as the next starts.
  const file = new File(Paths.cache, `tts-${Date.now()}.wav`);
  await file.write(new Uint8Array(buf));
  const previous = lastFile;
  lastFile = file;
  player.replace({ uri: file.uri });
  player.play();
  remove(previous);
}

/** Call when playback finishes (in the didJustFinish listener) to delete the last temp file. */
export function cleanupTts(): void {
  remove(lastFile);
  lastFile = null;
}

let warmedUp = false;

/** Call once when the app opens (and again before your demo) so the first real sentence isn't slow. */
export function warmUpTts(): void {
  // The Starter plan allows only 5 TTS requests per hour, so never warm up
  // more than once per app session (mounting the call screen repeatedly, and
  // React StrictMode's double-mount, must not burn the quota).
  if (warmedUp) return;
  warmedUp = true;
  getAudio('Ok', 'yo').catch(() => {});
}