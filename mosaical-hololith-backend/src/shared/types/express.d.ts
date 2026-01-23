declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      membership?: { id: string; role: 'PRODUCER' | 'TENANT_ADMIN' };
    }
  }
}
export {};
