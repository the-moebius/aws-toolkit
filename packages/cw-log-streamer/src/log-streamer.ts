
import AWS from 'aws-sdk';
import { GetLogEventsRequest } from 'aws-sdk/clients/cloudwatchlogs';

import { ConsoleLogsWriter } from './logs-writer/console-logs-writer';
import { LogsWriter } from './logs-writer/logs-writer';
import { wait } from './utils';


export interface LogStreamerOptions {

  /**
   * The name of the CloudWatch log group.
   */
  logGroupName: string;

  /**
   * The name of the stream in the log group.
   */
  logStreamName: string;

  /**
   * Unix timestamp to start streaming logs from.
   * Logs will be streamed from the beginning if omitted.
   */
  startTime?: number;

  /**
   * Custom writer instance to use. By default, the
   * console writer is used.
   */
  writer?: LogsWriter;

  /**
   * Amount of time to wait between calls when waiting
   * for new log events. 3 seconds by default.
   */
  pollingInterval?: number;

  /**
   * AWS region where log group is located.
   */
  region?: string;

  /**
   * Number of log events to request in one
   * API call to CloudWatch. Maximum values
   * is used by default.
   */
  batchSize?: number;

}

export interface LogStreamerHandle {
  stop: () => void;
}


export function streamLogs(
  options: LogStreamerOptions

): LogStreamerHandle {

  const {
    logGroupName,
    logStreamName,
    startTime,
    writer = new ConsoleLogsWriter(),
    pollingInterval = 3000,
    region,
    batchSize,

  } = options;

  const cloudWatchLogs = new AWS.CloudWatchLogs({
    apiVersion: '2014-03-28',
    region,
  });

  let isRunning = true;
  let nextToken: string;

  // Starting to poll for logs
  (async () => {
    while (isRunning) {
      const eventsCount = await fetchLogs();
      if (eventsCount === 0) {
        await wait(pollingInterval);
      }
    }
  })();

  return {
    stop,
  };


  function stop() {
    isRunning = false;
  }

  async function fetchLogs(): Promise<number> {

    const request: GetLogEventsRequest = {
      logGroupName,
      logStreamName,
    };

    if (startTime) {
      request.startTime = startTime;

    } else {
      request.startFromHead = true;

    }

    if (batchSize) {
      request.limit = batchSize;
    }

    if (nextToken) {
      request.nextToken = nextToken;
    }

    const result = await (cloudWatchLogs
      .getLogEvents(request)
      .promise()
    );

    const eventsCount = (result.events?.length || 0);

    if (eventsCount > 0) {
      writer.write(result.events!);
    }

    if (result.nextForwardToken) {
      nextToken = result.nextForwardToken;

    } else {
      throw new Error(
        `Missing forward token from CloudWatch response`
      );

    }

    return eventsCount;

  }

}
