'use client';
import { uploadToPresignedUrl } from '@nexvolt/api-client';
import type { DocumentType } from '@nexvolt/shared';
import { api } from './api';

export const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Presigned upload → server-side size + magic-byte verification. */
export async function uploadDocument(file: File, docType: DocumentType, chargerId?: string) {
  if (!DOC_MIME.includes(file.type)) throw new Error('Upload a PDF, JPEG or PNG file');
  if (file.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller');
  const { document, upload } = await api.documents.createUpload({
    docType,
    chargerId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  await uploadToPresignedUrl(upload, file);
  return api.documents.complete(document.id);
}

export async function uploadPhoto(file: File, chargerId: string) {
  if (!PHOTO_MIME.includes(file.type)) throw new Error('Upload a JPEG, PNG or WebP image');
  if (file.size > 8 * 1024 * 1024) throw new Error('Photos must be 8 MB or smaller');
  const { photoId, upload } = await api.chargers.photoUpload(chargerId, file.type, file.size);
  await uploadToPresignedUrl(upload, file);
  return api.chargers.photoComplete(chargerId, photoId);
}
