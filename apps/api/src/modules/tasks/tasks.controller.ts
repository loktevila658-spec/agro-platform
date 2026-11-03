import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { SyncService } from '../sync/sync.service';
import { TasksService } from './tasks.service';
import type { TaskRequest } from './tasks.types';
@Controller('v1/tasks')
export class TasksController {
 constructor(private readonly service:TasksService,private readonly sync:SyncService){}
 @Get() async list(@Headers('authorization') auth?:string,@Query('after') after?:string){return {tasks:await this.service.list(await this.sync.actor(auth),after)};}
 @Get(':taskId') async read(@Param('taskId') id:string,@Headers('authorization') auth?:string){return this.service.read(await this.sync.actor(auth),id);}
 @Post() create(@Body() body:TaskRequest,@Headers('authorization') auth?:string){if(body?.command?.type!=='Task.Create')throw new BadRequestException('TASK_INVALID_COMMAND');return this.submit(auth,body);}
 @Post(':taskId/commands/:action') command(@Param('taskId') id:string,@Param('action') action:string,@Body() body:TaskRequest,@Headers('authorization') auth?:string){if(body?.command?.aggregate?.id!==id||body?.command?.type!==`Task.${action}`)throw new BadRequestException('TASK_ROUTE_COMMAND_MISMATCH');return this.submit(auth,body);}
 private async submit(auth:string|undefined,body:TaskRequest){const actor=await this.sync.actor(auth);return this.sync.push(auth,{deviceId:actor.deviceId,scopeVersion:body.scopeVersion,schemaVersion:1,commands:[body.command]});}
}
