import {BadRequestException,Body,Controller,Get,Headers,HttpCode,Param,Post,Query} from '@nestjs/common';import {SyncService} from '../sync/sync.service';import type {TaskRequest} from '../tasks/tasks.types';import {ActualOperationService} from './actual-operation.service';import {ACTUAL_COMMANDS} from './actual-operation.types';
@Controller('v1/agronomy/operations') export class ActualOperationController{
 constructor(private readonly service:ActualOperationService,private readonly sync:SyncService){}
 @Get('capture-contexts')async contexts(@Headers('authorization')auth?:string){return {items:await this.service.contexts(await this.sync.registeredActor(auth))};}
 @Get()async list(@Headers('authorization')auth?:string,@Query('organizationId')org?:string,@Query('after')after?:string){return {items:await this.service.list(await this.sync.actor(auth),org??'',after)};}
 @Get(':id')async read(@Param('id')id:string,@Headers('authorization')auth?:string){return this.service.read(await this.sync.actor(auth),id);}
 @Get(':id/history')async history(@Param('id')id:string,@Headers('authorization')auth?:string){return {revisions:await this.service.history(await this.sync.actor(auth),id)};}
 @Post()@HttpCode(200)async capture(@Body()body:TaskRequest,@Headers('authorization')auth?:string){if(body?.command?.type!=='ActualOperation.Capture')throw new BadRequestException('ACTUAL_INVALID_CAPTURE');return this.submit(auth,body);}
 @Post(':id/commands/:action')@HttpCode(200)async command(@Param('id')id:string,@Param('action')action:string,@Body()body:TaskRequest,@Headers('authorization')auth?:string){if(action==='capture'||body?.command?.aggregate?.id!==id||body.command.type!==`ActualOperation.${ACTUAL_COMMANDS.find(a=>a.toLowerCase()===action)}`)throw new BadRequestException('ACTUAL_ROUTE_MISMATCH');return this.submit(auth,body);}
 private async submit(auth:string|undefined,body:TaskRequest){const a=await this.sync.actor(auth);return this.sync.push(auth,{deviceId:a.deviceId,scopeVersion:body.scopeVersion,schemaVersion:1,commands:[body.command]});}
}
