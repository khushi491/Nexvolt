import { Injectable } from '@nestjs/common';
import { MAX_DOCUMENT_BYTES, type DocumentDto, type DocumentType } from '@nexvolt/shared';
import type { VerificationDocument } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HostsService } from '../hosts/hosts.service';
import { StorageService } from '../storage/storage.service';

export function toDocumentDto(d: VerificationDocument): DocumentDto {
  return {
    id: d.id,
    docType: d.docType,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    chargerId: d.chargerId,
    reviewNotes: d.reviewNotes,
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

const CHARGER_DOCS: DocumentType[] = ['PROPERTY_AUTHORIZATION', 'SOCIETY_NOC', 'ELECTRICAL_SAFETY_CERT', 'INSTALLATION_CERT', 'METER_CALIBRATION_CERT'];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly hosts: HostsService,
  ) {}

  async createUpload(
    user: AuthUser,
    input: { docType: DocumentType; chargerId?: string; fileName: string; mimeType: string; sizeBytes: number },
  ) {
    const host = await this.hosts.requireHost(user);
    if (CHARGER_DOCS.includes(input.docType) && !input.chargerId) {
      throw AppError.unprocessable('CHARGER_REQUIRED', 'This document type must be attached to a charger');
    }
    if (input.chargerId) {
      const c = await this.prisma.charger.findFirst({ where: { id: input.chargerId, hostId: host.id } });
      if (!c) throw AppError.notFound('Charger');
    }
    const key = this.storage.newKey(`documents/${host.id}`, input.mimeType);
    const upload = await this.storage.presignUpload(key, input.mimeType, input.sizeBytes);
    const doc = await this.prisma.verificationDocument.create({
      data: {
        ownerUserId: user.id,
        hostId: host.id,
        chargerId: input.chargerId ?? null,
        docType: input.docType,
        // Keep only a safe display name; storage key is server-generated.
        fileName: input.fileName.replace(/[^\w.\- ]+/g, '_').slice(0, 120),
        storageKey: key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      },
    });
    return { document: toDocumentDto(doc), upload: { ...upload, key: undefined } };
  }

  async completeUpload(user: AuthUser, id: string): Promise<DocumentDto> {
    const doc = await this.prisma.verificationDocument.findFirst({ where: { id, ownerUserId: user.id } });
    if (!doc) throw AppError.notFound('Document');
    if (doc.status !== 'PENDING_UPLOAD') return toDocumentDto(doc);
    const check = await this.storage.verifyUpload(doc.storageKey, doc.mimeType, MAX_DOCUMENT_BYTES);
    const updated = await this.prisma.verificationDocument.update({
      where: { id },
      data: check.ok
        ? { status: 'PENDING_REVIEW', sizeBytes: check.sizeBytes }
        : { status: 'REJECTED', reviewNotes: `Automatic check failed: ${check.reason}` },
    });
    if (!check.ok) throw AppError.unprocessable('UPLOAD_REJECTED', check.reason ?? 'Upload rejected');
    return toDocumentDto(updated);
  }

  async list(user: AuthUser, chargerId?: string): Promise<DocumentDto[]> {
    const rows = await this.prisma.verificationDocument.findMany({
      where: { ownerUserId: user.id, ...(chargerId ? { chargerId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDocumentDto);
  }

  async downloadUrl(user: AuthUser, id: string): Promise<{ url: string | null }> {
    const doc = await this.prisma.verificationDocument.findUnique({ where: { id } });
    if (!doc || (doc.ownerUserId !== user.id && !user.isStaff)) throw AppError.notFound('Document');
    if (doc.status === 'PENDING_UPLOAD' || doc.status === 'REJECTED') throw AppError.unprocessable('NOT_AVAILABLE', 'This document is not available');
    return { url: await this.storage.presignDownload(doc.storageKey) };
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const doc = await this.prisma.verificationDocument.findFirst({ where: { id, ownerUserId: user.id } });
    if (!doc) throw AppError.notFound('Document');
    if (doc.status === 'ACCEPTED') throw AppError.unprocessable('DOCUMENT_LOCKED', 'Accepted documents cannot be deleted. Contact support.');
    await this.prisma.verificationDocument.delete({ where: { id } });
  }
}
