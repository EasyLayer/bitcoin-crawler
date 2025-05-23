import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { UnhandledExceptionBus, IEvent } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';

interface UnhandledExceptionEvent {
  cause: IEvent;
  exception: any;
}

@Injectable()
export class ReadStateExceptionHandlerService implements OnModuleInit, OnModuleDestroy {
  private subscription!: Subscription;

  constructor(
    private readonly log: AppLogger,
    private readonly unhandledExceptionBus: UnhandledExceptionBus
  ) {}

  onModuleInit() {
    this.subscription = this.unhandledExceptionBus.subscribe((error: UnhandledExceptionEvent) => {
      // this.log.error('Read State Unhandled Exception:', { cause: error.cause }, this.constructor.name);

      // IMPORTANT: At the moment, if there is an error in the EventHandler (read state update),
      // we throw an unhandled error to crash the application.
      // This is done so that the application crashes, and so that the docker restarts it,
      // and after the start we will restart the latest idenpotent events and repeat the updates.
      // Thus, we want to ensure that there will be no situations where the data has not been updated in the read db.
      throw error.exception;
    });
  }

  onModuleDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
