import { useEffect, useRef, useState } from 'react';
import type { CaptureRecord, CaptureSession, LocationSample } from '../shared/capture';
import { readCaptureLocation } from './capture-location';
import { sha256File } from './file-hash';
import './capture.css';

const browserPosition = () => readCaptureLocation(true);
function withDeadline<T>(operation: Promise<T>, message: string, delay = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), delay);
    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}
const locationError =
  'Localisation obligatoire. Autorisez la position dans votre navigateur puis recommencez la session.';

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Session indisponible.');
  return result;
}
export default function CapturePanel({
  onCapture,
  close,
  request = post,
  readPosition = browserPosition,
  photosOnly = false,
}: {
  onCapture: (file: File, captureId: string, record: CaptureRecord) => void;
  close: () => void;
  request?: <T>(url: string, body: unknown) => Promise<T>;
  readPosition?: () => Promise<LocationSample>;
  photosOnly?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const alive = useRef(true);
  const position = useRef<LocationSample | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<File | null>(null);
  const [recoveryUrl, setRecoveryUrl] = useState('');
  useEffect(() => {
    if (!recovery) {
      setRecoveryUrl('');
      return;
    }
    const url = URL.createObjectURL(recovery);
    setRecoveryUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recovery]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const remaining = session
    ? Math.max(
        0,
        Math.round(
          (Math.min(Date.parse(session.expiresAt), Date.parse(session.issuedAt) + 180000) - now) /
            1000,
        ),
      )
    : 0;
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setReady(false);
    setSession(null);
    setError('');
    setBusy(false);
    position.current = null;
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.crypto?.subtle) {
      setError(
        'Capture disponible uniquement en HTTPS ou sur localhost. Sur le réseau local, utilisez une adresse HTTPS approuvée par votre appareil.',
      );
      return;
    }
    (async () => {
      setProgress('Autorisez la localisation : recherche de votre position…');
      const location = await withDeadline(readPosition(), locationError);
      if (cancelled) return;
      if (location.status !== 'recorded') throw new Error(locationError);
      position.current = location;
      setProgress('Localisation autorisée. Autorisez la caméra pour cadrer votre photo…');
      const mediaRequest = navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio,
      });
      let cameraTimedOut = false;
      void mediaRequest.then(
        (media) => {
          if (cancelled || cameraTimedOut) media.getTracks().forEach((track) => track.stop());
        },
        () => {},
      );
      const media = await withDeadline(
        mediaRequest,
        'Caméra indisponible ou autorisation en attente. Réessayez.',
      ).catch((error) => {
        cameraTimedOut = true;
        throw error;
      });
      if (cancelled) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      media.getVideoTracks().forEach((track) =>
        track.addEventListener(
          'ended',
          () => {
            if (cancelled) return;
            setReady(false);
            setError(
              'La caméra a été interrompue. Recommencez la session après avoir déverrouillé le téléphone.',
            );
            if (recorder.current?.state === 'recording') recorder.current.stop();
          },
          { once: true },
        ),
      );
      if (video.current) video.current.srcObject = media;
      setProgress('Ouverture de la session de capture…');
      const issued = await withDeadline(
        request<CaptureSession>('/api/captures', {}),
        'Le serveur ne répond pas. Recommencez la session.',
      );
      if (!cancelled) {
        setSession(issued);
        setProgress('');
      }
    })().catch((error) => {
      if (!cancelled) {
        stream.current?.getTracks().forEach((track) => track.stop());
        setProgress('');
        setError(
          error instanceof Error ? error.message : 'Caméra ou session indisponible. Réessayez.',
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
  }, [audio, attempt, request, readPosition]);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);
  async function capturePosition() {
    setProgress('Vérification de la position…');
    const previous = position.current;
    const sample =
      previous?.status === 'recorded' &&
      Math.abs(Date.now() - Date.parse(previous.measuredAt)) < 10000
        ? previous
        : await withDeadline(readPosition(), locationError);
    if (sample.status !== 'recorded') throw new Error(locationError);
    position.current = sample;
    return sample;
  }
  async function finish(
    file: File,
    kind: 'photo' | 'video',
    startedAt: string,
    endedAt: string,
    startLocation: LocationSample,
  ) {
    if (!session || !alive.current) return;
    setRecovery(file);
    setBusy(true);
    setError('');
    try {
      setProgress(kind === 'video' ? 'Relevé de la position de fin…' : 'Préparation de la photo…');
      const endLocation =
        kind === 'video' ? await withDeadline(readPosition(), locationError) : undefined;
      if (endLocation && endLocation.status !== 'recorded')
        throw new Error(
          'Localisation de fin obligatoire. Autorisez la position puis recommencez la vidéo.',
        );
      setProgress('Calcul de l’empreinte de votre capture…');
      const sha256 = await withDeadline(
        sha256File(file),
        'Calcul de l’empreinte interrompu. Réessayez.',
      );
      if (!alive.current) return;
      setProgress('Enregistrement de l’empreinte auprès du serveur…');
      const record = await withDeadline(
        request<CaptureRecord>(`/api/captures/${session.id}/commit`, {
          sha256,
          kind,
          startedAt,
          endedAt,
          nonce: session.nonce,
          location: { start: startLocation, ...(endLocation ? { end: endLocation } : {}) },
        }),
        'Le serveur ne répond pas. Recommencez la session.',
      );
      if (alive.current) onCapture(file, session.id, record);
    } catch (e) {
      if (alive.current)
        setError((e as Error).message + ' Recommencez une session avant une nouvelle capture.');
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress('');
      }
    }
  }
  async function photo() {
    if (busy || !video.current?.videoWidth) return;
    setBusy(true);
    setError('');
    try {
      const startLocation = await capturePosition();
      if (!alive.current) return;
      if (startLocation.status !== 'recorded') {
        setBusy(false);
        setError(
          'Localisation obligatoire. Autorisez la position dans votre navigateur puis recommencez la session.',
        );
        return;
      }
      const startedAt = new Date().toISOString();
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth;
      canvas.height = video.current.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Capture indisponible. Recommencez la session.');
      context.drawImage(video.current, 0, 0);
      setProgress('Préparation de la photo…');
      const blob = await withDeadline(
        new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error('La capture a échoué. Réessayez.')),
            'image/jpeg',
            0.95,
          ),
        ),
        'La préparation de la photo a pris trop de temps. Réessayez.',
      );
      if (!alive.current) return;
      await finish(
        new File([blob], 'capture-photo.jpg', { type: 'image/jpeg' }),
        'photo',
        startedAt,
        new Date().toISOString(),
        startLocation,
      );
    } catch (error) {
      if (alive.current) setError((error as Error).message);
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress('');
      }
    }
  }
  async function startVideo() {
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
      setBusy(true);
      const startLocation = await capturePosition();
      if (!alive.current) return;
      if (startLocation.status !== 'recorded') {
        setBusy(false);
        setError(
          'Localisation obligatoire. Autorisez la position dans votre navigateur puis recommencez la session.',
        );
        return;
      }
      const active = new MediaRecorder(stream.current, {
        mimeType: mime,
        videoBitsPerSecond: 2500000,
      });
      recorder.current = active;
      const chunks: Blob[] = [];
      let length = 0;
      let invalid = false;
      const startedAt = new Date().toISOString();
      active.ondataavailable = (event) => {
        length += event.data.size;
        if (length > 50 * 1024 * 1024) {
          invalid = true;
          if (active.state === 'recording') active.stop();
        } else chunks.push(event.data);
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
        void finish(
          new File(chunks, type === 'video/mp4' ? 'capture-video.mp4' : 'capture-video.webm', {
            type,
          }),
          'video',
          startedAt,
          new Date().toISOString(),
          startLocation,
        );
      };
      active.start(250);
      setSeconds(0);
      setRecording(true);
      setBusy(false);
      setProgress('');
      timer.current = setTimeout(() => {
        if (active.state === 'recording') active.stop();
      }, 60000);
    } catch {
      setBusy(false);
      setProgress('');
      setError('Impossible de démarrer la vidéo.');
    }
  }
  return (
    <div className="capture-protocol">
      <span className="eyebrow">CAPTURE DOCUMENTÉE · {photosOnly ? 'PHOTO' : 'PHOTO / VIDÉO'}</span>
      <ol>
        <li>Autorisez d’abord la localisation, puis la caméra. Cadrez les faits sans filtre.</li>
        <li>
          {photosOnly ? 'Prenez une photo en direct.' : 'Photographiez ou filmez (60 s maximum).'}{' '}
          Aucun import de fichier.
        </li>
        <li>
          L’empreinte est engagée auprès du serveur, puis vous décrivez et déposez le fichier.
        </li>
      </ol>
      <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} />
      <strong>Localisation obligatoire de la prise de vue</strong>
      <p>
        Avec votre autorisation, la position et sa précision sont relevées à la prise de vue (au
        début et à la fin pour une vidéo), puis incluses dans le dossier privé et ses exports. Un
        refus ou une indisponibilité bloque la capture. Aucune localisation en arrière-plan. Ces
        coordonnées déclarées par l’appareil ne prouvent pas le lieu réel de la scène.
      </p>
      {!photosOnly && (
        <label className="capture-check">
          <input
            type="checkbox"
            checked={audio}
            disabled={recording || busy || !session}
            onChange={(e) => setAudio(e.target.checked)}
          />{' '}
          Inclure le son (permission microphone)
        </label>
      )}
      {session && (
        <p className="capture-session">
          Session ouverte : {new Date(session.issuedAt).toLocaleTimeString('fr-FR')}
          <br />
          {remaining > 0
            ? `Session valable encore ${remaining} secondes.`
            : 'Session expirée. Recommencez la capture.'}
        </p>
      )}
      <p>
        Le navigateur encode le média. Une caméra virtuelle ou une scène mise en scène restent
        possibles ; ce protocole ne certifie pas « sans IA ».
      </p>
      {recording && <p role="status">Enregistrement · {seconds} / 60 s</p>}
      {!photosOnly && !recording && remaining > 0 && remaining < 75 && (
        <p>
          Moins de 75 secondes restantes : recommencez la session pour filmer avec le temps
          nécessaire à l’engagement.
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      {error && <p role="alert">{error}</p>}
      {error && recoveryUrl && (
        <p>
          La capture reste disponible dans cette fenêtre.{' '}
          <a href={recoveryUrl} download={recovery?.name}>
            Télécharger la capture de secours
          </a>
          . Son enregistrement sur le serveur n’est pas confirmé.
        </p>
      )}
      <div className="button-row">
        <button className="button secondary" onClick={close}>
          Annuler
        </button>
        {!recording && (
          <>
            <button
              className="button primary"
              disabled={!ready || !session || busy || !!error || remaining === 0}
              onClick={photo}
            >
              Prendre la photo
            </button>
            {!photosOnly && (
              <button
                className="button primary"
                disabled={!ready || !session || busy || !!error || remaining < 75}
                onClick={startVideo}
              >
                Filmer une vidéo
              </button>
            )}
          </>
        )}
        {recording && (
          <button className="button primary" onClick={() => recorder.current?.stop()}>
            Terminer la vidéo
          </button>
        )}
        {(error || (session && remaining < 75)) && (
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
