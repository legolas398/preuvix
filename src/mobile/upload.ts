import type { CaseDetail } from '../../shared/cases';
import type { Proof } from '../../shared/types';
import { sha256File } from '../file-hash';
import { mobileApi } from './api';
import { saveDraft, type Draft } from './drafts';

export async function sendDraft(draft: Draft) {
  if (draft.kind === 'case') {
    const result = await mobileApi<CaseDetail>('/api/cases', {
      method: 'POST',
      body: JSON.stringify({ requestKey: draft.id, dossier: draft.dossier }),
    });
    await saveDraft({ ...draft, completed: true, caseId: result.manifest.id });
    return result;
  }
  let proof = draft.proof;
  if (!proof) {
    if (!draft.file || !draft.evidence) throw new Error('Brouillon incomplet.');
    if (
      !draft.captureId ||
      draft.evidence.origin !== 'in_app_camera' ||
      draft.evidence.location.status !== 'recorded'
    )
      throw new Error(
        'Ce brouillon ne provient pas d’une capture en direct avec localisation. Recommencez la capture.',
      );
    const file = new File([draft.file], draft.fileName!, { type: draft.file.type });
    const body = new FormData();
    body.append('file', file);
    body.append('title', draft.title);
    body.append('description', draft.description);
    body.append('requestKey', draft.id);
    body.append('clientSha256', await sha256File(file));
    body.append('source', 'camera');
    body.append('captureId', draft.captureId);
    body.append('mobileEvidence', JSON.stringify(draft.evidence));
    proof = await mobileApi<Proof>('/api/mobile/proofs', { method: 'POST', body });
    // Persist server acknowledgement before attaching; a lost response reuses the same requestKey.
    await saveDraft({ ...draft, proof });
  }
  const path = `/api/cases/${draft.caseId}`;
  let current = await mobileApi<CaseDetail>(path);
  if (!current.manifest.files.some((file) => file.proofId === proof.id)) {
    current = await mobileApi<CaseDetail>(path + '/files', {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: current.manifest.version, proofId: proof.id }),
    });
  }
  await saveDraft({ ...draft, proof, completed: true });
  return current;
}
