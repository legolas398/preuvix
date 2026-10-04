import { useEffect, useRef, useState } from 'react';
import { CHAIN_LABEL, type CaptureSession } from '../shared/capture';
import { VIRTUAL_CAMERA } from '../shared/certification-policy';
import { sha256File, sha256Hex } from './file-hash';
import './capture.css';

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Session indisponible.');
  return result;
}
// Seconds between progressive checkpoints while a video records.
const CHECKPOINT_EVERY = 3;
type Device = { label: string; width?: number; height?: number; frameRate?: number };
function describeDevice(media: MediaStream): Device {
  const track = media.getVideoTracks()[0];
  const settings = track?.getSettings?.() ?? {};
  return {
    label: (track?.label ?? '').slice(0, 200),
    ...(settings.width ? { width: Math.round(settings.width) } : {}),
    ...(settings.height ? { height: Math.round(settings.height) } : {}),
    ...(settings.frameRate ? { frameRate: Math.round(settings.frameRate * 100) / 100 } : {}),
  };
}

export default function CapturePanel({
  onCapture,
  close,
}: {
  onCapture: (file: File, captureId: string) => void;
  close: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [device, setDevice] = useState<Device | null>(null);
  const [checkpoints, setCheckpoints] = useState(0);
  const virtual = Boolean(device?.label && VIRTUAL_CAMERA.test(device.label));
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const remaining = session?.challenge
    ? Math.max(
        0,
        Math.round(
          (Date.parse(session.issuedAt) + session.challenge.maxSeconds * 1000 - now) / 1000,
        ),
      )
    : 0;
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setReady(false);
    setSession(null);
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.crypto?.subtle) {
      setError(
        'Capture disponible uniquement en HTTPS ou sur localhost. Sur le réseau local, utilisez une adresse HTTPS approuvée par votre appareil.',
      );
      return;
    }
    (async () => {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio,
      });
      if (cancelled) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      setDevice(describeDevice(media));
      if (video.current) video.current.srcObject = media;
      const issued = await post<CaptureSession>('/api/captures', {});
      if (!cancelled) setSession(issued);
    })().catch(() => {
      if (!cancelled) {
        stream.current?.getTracks().forEach((track) => track.stop());
        setError(
          'Caméra, microphone ou session indisponible. Vérifiez vos permissions puis réessayez.',
        );
      }
    });
    return () => {
      cancelled = true;
      alive.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audio, attempt]);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);
  async function finish(
    file: File,
    kind: 'photo' | 'video',
    startedAt: string,
    endedAt: string,
    segments?: number[],
  ) {
    if (!session || !alive.current) return;
    setBusy(true);
    setError('');
    try {
      const sha256 = await sha256File(file);
      if (!alive.current) return;
      await post(`/api/captures/${session.id}/commit`, {
        sha256,
        kind,
        startedAt,
        endedAt,
        ...(device ? { device } : {}),
        ...(segments ? { segments } : {}),
      });
      if (alive.current) onCapture(file, session.id);
    } catch (e) {
      if (alive.current)
        setError((e as Error).message + ' Recommencez une session avant une nouvelle capture.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function photo() {
    if (!video.current?.videoWidth) return;
    setBusy(true);
    const startedAt = new Date().toISOString();
    const canvas = document.createElement('canvas');
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext('2d')!.drawImage(video.current, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!alive.current) return;
        if (blob)
          void finish(
            new File([blob], 'capture-photo.jpg', { type: 'image/jpeg' }),
            'photo',
            startedAt,
            new Date().toISOString(),
          );
        else {
          setBusy(false);
          setError('La capture a échoué. Réessayez.');
        }
      },
      'image/jpeg',
      0.95,
    );
  }
  function startVideo() {
    if (!stream.current || typeof MediaRecorder === 'undefined') {
      setError('Enregistrement vidéo non pris en charge par ce navigateur.');
      return;
    }
    const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mime) {
      setError('Aucun format vidéo compatible. Utilisez un autre navigateur.');
      return;
    }
    try {
      const active = new MediaRecorder(stream.current, {
        mimeType: mime,
        videoBitsPerSecond: 2500000,
      });
      recorder.current = active;
      const chunks: Blob[] = [];
      let length = 0;
      let invalid = false;
      const startedAt = new Date().toISOString();
      // Progressive commitment: a hash chain over the chunks, sent to the server while recording.
      const sessionId = session!.id;
      let chain = sha256Hex(`${CHAIN_LABEL}:${session!.nonce}`);
      let lastCheckpoint = Date.now();
      let sent = Promise.resolve();
      setCheckpoints(0);
      active.ondataavailable = (event) => {
        if (!event.data.size) return;
        length += event.data.size;
        if (length > 50 * 1024 * 1024) {
          invalid = true;
          if (active.state === 'recording') active.stop();
          return;
        }
        chunks.push(event.data);
        const data = event.data;
        const count = chunks.length;
        const offset = length;
        chain = chain.then(async (previous) =>
          sha256Hex(previous + (await sha256Hex(await data.arrayBuffer()))),
        );
        if (Date.now() - lastCheckpoint >= CHECKPOINT_EVERY * 1000) {
          lastCheckpoint = Date.now();
          const value = chain;
          sent = sent.then(async () => {
            try {
              await post(`/api/captures/${sessionId}/checkpoint`, {
                chunks: count,
                offset,
                chain: await value,
              });
              if (alive.current) setCheckpoints((n) => n + 1);
            } catch {
              /* A missing checkpoint weakens the proof but never blocks the capture. */
            }
          });
        }
      };
      active.onerror = () => {
        invalid = true;
        setError('Enregistrement interrompu. Aucun fichier engagé.');
        if (active.state === 'recording') active.stop();
      };
      active.onstop = () => {
        clearTimeout(timer.current);
        if (!alive.current) return;
        setRecording(false);
        if (invalid) {
          setError('Vidéo interrompue ou trop volumineuse. Recommencez.');
          return;
        }
        const type = mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
        const endedAt = new Date().toISOString();
        // The last chunk arrives with stop: seal it, then wait for every checkpoint.
        const value = chain;
        sent = sent.then(async () => {
          try {
            await post(`/api/captures/${sessionId}/checkpoint`, {
              chunks: chunks.length,
              offset: length,
              chain: await value,
            });
            if (alive.current) setCheckpoints((n) => n + 1);
          } catch {
            /* Already sent with the last chunk, or session closed. */
          }
        });
        void sent.then(() =>
          finish(
            new File(chunks, type === 'video/mp4' ? 'capture-video.mp4' : 'capture-video.webm', {
              type,
            }),
            'video',
            startedAt,
            endedAt,
            chunks.map((chunk) => chunk.size),
          ),
        );
      };
      active.start(250);
      setSeconds(0);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (active.state === 'recording') active.stop();
      }, 60000);
    } catch {
      setError('Impossible de démarrer la vidéo.');
    }
  }
  return (
    <div className="capture-protocol">
      <span className="eyebrow">CAPTURE DOCUMENTÉE · PHOTO / VIDÉO</span>
      <ol>
        <li>Écrivez le code du défi sur un papier et préparez le geste demandé.</li>
        <li>Cadrez les faits avec le papier et le geste visibles, sans filtre.</li>
        <li>Photographiez ou filmez (60 s maximum) avant la fin du compte à rebours.</li>
        <li>
          En vidéo, une empreinte partielle est engagée toutes les {CHECKPOINT_EVERY} secondes : le
          serveur constate que la vidéo se construit en temps réel.
        </li>
        <li>
          L’empreinte finale est engagée auprès du serveur, puis vous décrivez et déposez le
          fichier.
        </li>
      </ol>
      <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} />
      <label className="capture-check">
        <input
          type="checkbox"
          checked={audio}
          disabled={recording || busy}
          onChange={(e) => setAudio(e.target.checked)}
        />{' '}
        Inclure le son (permission microphone)
      </label>
      {session?.challenge && (
        <section className="capture-challenge" aria-label="Défi en direct">
          <span>DÉFI EN DIRECT · à montrer dans l’image</span>
          <strong>{session.challenge.code}</strong>
          <span>{session.challenge.gesture}</span>
          <span>
            {remaining > 0
              ? `Temps restant : ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
              : 'Délai dépassé : le défi ne sera pas reconnu. Recommencez la session.'}
          </span>
        </section>
      )}
      {session && (
        <p className="capture-session">
          Session ouverte : {new Date(session.issuedAt).toLocaleTimeString('fr-FR')} · défi{' '}
          <code>{session.nonce.slice(0, 12)}</code>
          <br />
          L’engagement doit intervenir dans les 10 minutes.
        </p>
      )}
      <p>
        Le navigateur encode le média. Une caméra virtuelle ou une scène mise en scène restent
        possibles ; ce protocole ne certifie pas « sans IA ».
      </p>
      {device && (
        <p className={`capture-device ${virtual ? 'virtual' : ''}`}>
          {virtual
            ? `Caméra logicielle détectée (« ${device.label} ») : le dossier exigera un examen. Utilisez la caméra physique de l’appareil.`
            : `Caméra : ${device.label || 'nom non communiqué par le navigateur'}${device.width ? ` · ${device.width} × ${device.height}` : ''}`}
        </p>
      )}
      {recording && (
        <p role="status">
          Enregistrement · {seconds} / 60 s · {checkpoints} engagement
          {checkpoints > 1 ? 's' : ''} progressif{checkpoints > 1 ? 's' : ''}
        </p>
      )}
      {busy && <p role="status">Calcul SHA-256 et engagement serveur…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        <button className="button secondary" onClick={close}>
          Annuler
        </button>
        {!recording && (
          <>
            <button
              className="button primary"
              disabled={!ready || !session || busy || !!error}
              onClick={photo}
            >
              Prendre la photo
            </button>
            <button
              className="button primary"
              disabled={!ready || !session || busy || !!error}
              onClick={startVideo}
            >
              Filmer une vidéo
            </button>
          </>
        )}
        {recording && (
          <button className="button primary" onClick={() => recorder.current?.stop()}>
            Terminer la vidéo
          </button>
        )}
        {(error || (session?.challenge && remaining === 0)) && (
          <button
            className="button secondary"
            disabled={busy || recording}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Recommencer la session
          </button>
        )}
      </div>
    </div>
  );
}
