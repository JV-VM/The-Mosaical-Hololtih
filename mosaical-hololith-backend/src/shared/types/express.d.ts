declare global {
  namespace Express {
    interface Request {
      id?: string;
      tenantId?: string;
      membership?: { id: string; role: 'PRODUCER' | 'TENANT_ADMIN' };
    }
  }
}
export {};
