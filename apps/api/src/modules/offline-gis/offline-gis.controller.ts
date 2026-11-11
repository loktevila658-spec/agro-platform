import {BadRequestException,Body,Controller,Get,Headers,HttpCode,Param,Post,Query} from '@nestjs/common';
import {SyncService} from '../sync/sync.service';
import {OfflineGisService} from './offline-gis.service';
import type {SubmitRequest} from './offline-gis.types';
@Controller('v1/offline-gis')
export class OfflineGisController {
 constructor(private readonly service:OfflineGisService,private readonly sync:SyncService){}
 @Get('sources') async sources(@Headers('authorization') auth?:string){return {sources:await this.service.registry.sources(await this.sync.registeredActor(auth))};}
 @Get('fields') async fields(@Headers('authorization') auth?:string,@Query('after') after?:string){return this.service.candidates(await this.sync.registeredActor(auth),after);}
 @Get('packages/:packageId') async read(@Param('packageId') id:string,@Headers('authorization') auth?:string){return this.service.read(await this.sync.registeredActor(auth),id);}
 @Post('packages/:packageId/commands/:action') @HttpCode(200) async command(@Param('packageId') id:string,@Param('action') action:string,@Body() body:SubmitRequest,@Headers('authorization') auth?:string){const actor=await this.sync.registeredActor(auth);if(id!==actor.deviceId||body?.command?.aggregate?.type!=='OfflineGisPackage'||body?.command?.aggregate?.id!==id||!['select','refresh'].includes(action)||body?.command?.type!==`OfflineGis.${action==='select'?'Select':'Refresh'}`)throw new BadRequestException('OFFLINE_GIS_ROUTE_COMMAND_MISMATCH');return this.sync.push(auth,{deviceId:actor.deviceId,scopeVersion:body.scopeVersion,schemaVersion:1,commands:[body.command]});}
}
