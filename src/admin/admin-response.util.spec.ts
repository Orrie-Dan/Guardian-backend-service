import { Prisma } from '@prisma/client';
import { mapDocumentMetadata, mapLocation } from './admin-response.util';

describe('admin-response.util', () => {
  it('mapDocumentMetadata converts sizeBytes to string', () => {
    const mapped = mapDocumentMetadata({
      id: '00000000-0000-4000-8000-000000000001',
      mimeType: 'application/pdf',
      storageKey: 'org/tin.pdf',
      sizeBytes: BigInt(12_345),
      encrypted: true,
      uploadedBy: null,
      createdAt: new Date('2024-01-01'),
    });

    expect(mapped.sizeBytes).toBe('12345');
    expect(() => JSON.stringify(mapped)).not.toThrow();
  });

  it('mapLocation converts coordinates to strings', () => {
    const mapped = mapLocation({
      id: 'loc-1',
      latitude: new Prisma.Decimal('-1.9441'),
      longitude: new Prisma.Decimal('30.0619'),
    });

    expect(mapped.latitude).toBe('-1.9441');
    expect(mapped.longitude).toBe('30.0619');
    expect(() => JSON.stringify(mapped)).not.toThrow();
  });
});
