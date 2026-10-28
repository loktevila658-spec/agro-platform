import { Body, Controller, Get, Headers, HttpCode, Post, Put, Param, Req, BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncFiles } from './sync.files';
import { AttachmentIntent, PushRequest } from './sync.types';
@Controller('v1/sync')
export class SyncController {
 constructor(readonly sync:SyncService) {}
 @Post('devices/register') @HttpCode(200)
 register(@Headers('authorization') auth:string|undefined,@Body() body:{deviceId:string;installationId:string;schemaVersion:number}) { return this.sync.register(auth,body); }
 @Post('bootstrap') @HttpCode(200)
 bootstrap(@Headers('authorization') auth:string|undefined,@Body() body:{deviceId:string;schemaVersion:number}) { return this.sync.bootstrap(auth,body); }
 @Post('push') @HttpCode(200)
 push(@Headers('authorization') auth:string|undefined,@Body() body:PushRequest) { return this.sync.push(auth,body); }
 @Post('pull') @HttpCode(200)
 pull(@Headers('authorization') auth:string|undefined,@Body() body:{deviceId:string;scopeVersion:number;cursor:string;limit?:number}) { return this.sync.pull(auth,body); }
 @Post('ack') @HttpCode(200)
 ack(@Headers('authorization') auth:string|undefined,@Body() body:{deviceId:string;scopeVersion:number;cursor:string}) { return this.sync.ack(auth,body); }
 @Get('health')
 health(@Headers('authorization') auth?:string) { return this.sync.health(auth); }
}
@Controller('v1/attachments')
export class SyncAttachmentsController {
 constructor(readonly files:SyncFiles) {}
 @Post('init') @HttpCode(200)
 init(@Headers('authorization') auth:string|undefined,@Body() body:AttachmentIntent) { return this.files.init(auth,body); }
 @Put(':localId/parts/:number') @HttpCode(200)
 part(@Headers('authorization') auth:string|undefined,@Headers('x-remote-id') remote:string,@Headers('x-part-sha256') checksum:string,@Param('localId') localId:string,@Param('number') number:string,@Req() req:AsyncIterable<Buffer>) {
   return this.readPart(req).then(bytes=>this.files.part(auth,localId,remote,Number(number),checksum,bytes));
 }
 private async readPart(req:AsyncIterable<Buffer>):Promise<Buffer> {
   const chunks:Buffer[]=[];let length=0;
   for await(const chunk of req) { length+=chunk.length; if(length>5*1024*1024) throw new BadRequestException('Attachment part limit'); chunks.push(chunk); }
   return Buffer.concat(chunks);
 }
 @Post(':localId/complete') @HttpCode(200)
 complete(@Headers('authorization') auth:string|undefined,@Param('localId') localId:string,@Body() body:{remoteId:string}) { return this.files.complete(auth,localId,body.remoteId); }
}
