import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Connector, Envelope } from '../../../../../packages/connectors/src/index.cjs';
export interface IntegrationActor { tenantId:string; subjectId:string; }
export type IntegrationAction = 'CONFIGURE'|'STAGE'|'EXECUTE'|'REPLAY'|'READ';
/** Trusted composition root installs a policy backed by current server permissions. Default deny. */
export type IntegrationPolicy = (actor:IntegrationActor,action:IntegrationAction,profileId:string)=>Promise<boolean>;
export interface OwnerCommand {
 operation:string;
 /** Must check current owner permission and domain/state/version rules on this transaction. */
 validate(tx:PoolClient,actor:IntegrationActor,envelope:Envelope,mapped:Record<string,unknown>):Promise<void>;
 /** Owner application command: atomic canonical effect, owner audit and owner outbox. */
 execute(tx:PoolClient,actor:IntegrationActor,envelope:Envelope,mapped:Record<string,unknown>):Promise<Record<string,unknown>>;
}
@Injectable()
export class IntegrationsRegistry {
 private readonly adapters=new Map<string,Connector>();
 private readonly commands=new Map<string,OwnerCommand>();
 private policy:IntegrationPolicy=async()=>false;
 private policyInstalled=false;
 active():boolean { return this.adapters.size>0; }
 installPolicy(policy:IntegrationPolicy):void {
  if(this.policyInstalled) throw Error('Duplicate integration policy');
  this.policy=policy; this.policyInstalled=true;
 }
 async authorize(actor:IntegrationActor,action:IntegrationAction,profileId:string):Promise<void> {
  if(!actor?.tenantId||!actor.subjectId||!(await this.policy(actor,action,profileId))) throw Error('INTEGRATION_FORBIDDEN');
 }
 registerAdapter(adapter:Connector):void {
  if(!adapter.code||this.adapters.has(adapter.code)) throw Error('Duplicate connector');
  this.adapters.set(adapter.code,adapter);
 }
 adapter(code:string):Connector { const value=this.adapters.get(code); if(!value) throw Error('CONNECTOR_NOT_REGISTERED'); return value; }
 registerCommand(command:OwnerCommand):void {
  if(!command.operation||this.commands.has(command.operation)) throw Error('Duplicate owner command');
  this.commands.set(command.operation,command);
 }
 command(operation:string):OwnerCommand { const value=this.commands.get(operation); if(!value) throw Error('OWNER_COMMAND_NOT_REGISTERED'); return value; }
}
