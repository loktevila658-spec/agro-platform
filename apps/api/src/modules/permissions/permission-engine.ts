import { Injectable } from '@nestjs/common';

export type PermissionScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'tenant'; readonly tenantId: unknown };

export interface PermissionCheck {
  readonly action: string;
  readonly registeredActions: ReadonlySet<string>;
  readonly configuredActions: readonly string[];
  readonly scope: PermissionScope;
  readonly configuredTenantScopes: readonly string[];
}

@Injectable()
export class PermissionEngine {
  isAllowed(check: PermissionCheck): boolean {
    if (typeof check.action !== 'string' || check.action.length === 0) return false;
    if (!(check.registeredActions instanceof Set) || !check.registeredActions.has(check.action)) return false;
    if (!Array.isArray(check.configuredActions) || !check.configuredActions.includes(check.action)) return false;
    if (!check.scope || typeof check.scope !== 'object') return false;
    if (check.scope.kind === 'global') return true;
    if (check.scope.kind !== 'tenant' || typeof check.scope.tenantId !== 'string' || check.scope.tenantId.length === 0) return false;
    if (!Array.isArray(check.configuredTenantScopes)) return false;
    return check.configuredTenantScopes.includes(check.scope.tenantId);
  }
}
