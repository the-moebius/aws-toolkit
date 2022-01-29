
import {
  streamLogs

} from '@moebius/aws-cw-log-streamer';


(async () => {

  const streamHandle = streamLogs({
    logGroupName: 'log-group-name',
    logStreamName: 'prefix/container/task-id',
    batchSize: 50,
  });

  setTimeout(() => {

    console.log('*** STOPPING THE STREAMING ***');
    streamHandle.stop();

  }, 10000);

})();
