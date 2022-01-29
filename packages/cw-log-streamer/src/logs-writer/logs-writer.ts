
import { OutputLogEvents } from 'aws-sdk/clients/cloudwatchlogs';


export interface LogsWriter {

  write(events: OutputLogEvents): void;

}
