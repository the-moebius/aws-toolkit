
import { OutputLogEvents } from 'aws-sdk/clients/cloudwatchlogs';
import process from 'process';

import { LogsWriter } from './logs-writer';


export interface ConsoleLogsWriterOptions {
  outputStream?: NodeJS.WriteStream,
}


export class ConsoleLogsWriter implements LogsWriter {

  constructor(private readonly options?: ConsoleLogsWriterOptions) {
  }


  public write(events: OutputLogEvents) {

    const {
      outputStream = process.stdout,

    } = (this.options || {});

    for (const event of events) {
      outputStream.write(
        (event.message || '') + '\n'
      );
    }

  }

}
