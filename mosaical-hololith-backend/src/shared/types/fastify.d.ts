import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    id?: string;
    tenantId?: string;
    membership?: { id: string; role: 'PRODUCER' | 'TENANT_ADMIN' };
  }
}

