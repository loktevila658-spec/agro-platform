import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IdentityService } from '../identity/identity.service';
import { AgronomyService } from './agronomy.service';
@Controller('v1/agronomy/plans')
export class AgronomyController {
 constructor(private readonly service:AgronomyService,private readonly identity:IdentityService){}
 private async actor(auth?:string){const a=await this.identity.authenticate(auth);return {tenantId:a.tenantId,subjectId:a.userId};}
 @Get() async list(@Headers('authorization') auth?:string,@Query('organizationId') org?:string,@Query('after') after?:string){return {items:await this.service.list(await this.actor(auth),org??'',after)};}
 @Get(':id') async read(@Param('id') id:string,@Headers('authorization') auth?:string){return this.service.read(await this.actor(auth),id);}
 @Get(':id/history') async history(@Param('id') id:string,@Headers('authorization') auth?:string){return {revisions:await this.service.history(await this.actor(auth),id)};}
 @Get(':id/resources/:revisionId') async resources(@Param('id') id:string,@Param('revisionId') rev:string,@Headers('authorization') auth?:string){return {resources:await this.service.resources(await this.actor(auth),id,rev)};}
 @Post() @HttpCode(200) async create(@Body() body:unknown,@Headers('authorization') auth?:string,@Headers('idempotency-key') key?:string,@Headers('x-correlation-id') correlation?:string){return this.service.create(await this.actor(auth),body,{idempotencyKey:key??'',correlationId:correlation??randomUUID(),causationId:key??''});}
 @Post(':id/commands/:action') @HttpCode(200) async command(@Param('id') id:string,@Param('action') action:string,@Body() body:unknown,@Headers('authorization') auth?:string,@Headers('idempotency-key') key?:string,@Headers('x-correlation-id') correlation?:string){return this.service.command(await this.actor(auth),id,action,body,{idempotencyKey:key??'',correlationId:correlation??randomUUID(),causationId:key??''});}
 @Post(':id/task-draft') @HttpCode(200) async taskDraft(@Param('id') id:string,@Body() body:unknown,@Headers('authorization') auth?:string){return this.service.taskDraft(await this.actor(auth),id,body);}
}
