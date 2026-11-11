import {Injectable} from '@nestjs/common';
import type {PoolClient} from 'pg';
import type {DomainEvent,EventHandler} from '../events/events.types';
import {OfflineGisService} from './offline-gis.service';
@Injectable()
export class OfflineGisEvents implements EventHandler {
 readonly name='offline-gis-delivery-v1';
 constructor(private readonly service:OfflineGisService){}
 async handle(tx:PoolClient,event:DomainEvent):Promise<void>{await this.service.consume(tx,event);}
}
