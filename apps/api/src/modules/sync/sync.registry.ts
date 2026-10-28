import { Global, Injectable, Module } from '@nestjs/common';
import type { FileAuthorizationRequest } from '../files/files.types';
import type { SyncActor, SyncHandler } from './sync.types';
@Injectable()
export class SyncRegistry {
  private readonly handlers = new Map<string, SyncHandler>();
  private readonly readPolicies = new Map<string, (actor:SyncActor, entityId:string) => Promise<boolean>>();
  registerProjectionPolicy(entityType:string, policy:(actor:SyncActor,entityId:string)=>Promise<boolean>):void {
    if(this.readPolicies.has(entityType))throw Error('Duplicate projection policy');
    this.readPolicies.set(entityType,policy);
  }
  async canRead(actor:SyncActor,entityType:string,entityId:string):Promise<boolean> { return await this.readPolicies.get(entityType)?.(actor,entityId) ?? false; }
  private readonly filePolicies = new Map<string, (request: FileAuthorizationRequest) => Promise<boolean>>();
  register(handler: SyncHandler): void {
    if (this.handlers.has(handler.commandType)) throw Error('Duplicate sync handler');
    if (handler.requiresVersion && (!handler.assertVersion || !handler.currentState)) throw Error('Atomic version guard required');
    this.handlers.set(handler.commandType, handler);
  }
  get(type: string): SyncHandler | undefined { return this.handlers.get(type); }
  all(): SyncHandler[] { return [...this.handlers.values()]; }
  registerFilePolicy(ownerType: string, policy: (request: FileAuthorizationRequest) => Promise<boolean>): void {
    if (this.filePolicies.has(ownerType)) throw Error('Duplicate file policy');
    this.filePolicies.set(ownerType, policy);
  }
  async authorize(request: FileAuthorizationRequest): Promise<boolean> {
    return await this.filePolicies.get(request.ownerRef.split(':')[0]!)?.(request) ?? false;
  }
}
@Global()
@Module({ providers: [SyncRegistry], exports: [SyncRegistry] })
export class SyncPolicyModule {}
