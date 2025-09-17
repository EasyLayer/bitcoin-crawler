import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { UnhandledExceptionBus, IEvent } from '@easylayer/common/cqrs';

interface UnhandledExceptionEvent {
  cause: IEvent;
  exception: any;
}

@Injectable()
export class ReadStateExceptionHandlerService implements OnModuleInit, OnModuleDestroy {
  log = new Logger(ReadStateExceptionHandlerService.name);
  private subscription!: Subscription;

  constructor(private readonly unhandledExceptionBus: UnhandledExceptionBus) {}

  onModuleInit() {
    this.subscription = this.unhandledExceptionBus.stream$.subscribe((error: UnhandledExceptionEvent) => {
      this.log.error('Read State Unhandled Exception:', '', 'onModuleInit');

      // IMPORTANT: At the moment, if there is an error in the EventHandler (read state update),
      // we throw an unhandled error to crash the application.
      // This is done so that the application crashes, and so that the docker restarts it,
      // and after the start we will restart the latest idenpotent events and repeat the updates.
      // Thus, we want to ensure that there will be no situations where the data has not been updated in the read db.
      // throw error.exception;
      setImmediate(() => {
        throw error.exception instanceof Error ? error.exception : new Error(String(error.exception));
      });
    });
  }

  onModuleDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
