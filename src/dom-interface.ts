/** @format */

import { ONodeQueryUpdater } from './dom-manipulation.js';

export const Status = {
  lastError: new ONodeQueryUpdater('#status-last-error'),
  lastErrorMessage: new ONodeQueryUpdater('#status-last-error-message'),
  serviceURI: new ONodeQueryUpdater('#status-service'),
  ticks: new ONodeQueryUpdater('#status-ticks'),
};
