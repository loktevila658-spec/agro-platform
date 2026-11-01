import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ProvidersService } from './providers.service';

@Module({ imports: [IntegrationsModule], providers: [ProvidersService], exports: [ProvidersService] })
export class ProvidersModule {}
