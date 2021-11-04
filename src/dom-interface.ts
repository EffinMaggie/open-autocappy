/** @format */

import { ONodeQueryUpdater } from './dom-manipulation.js';

export const Status = {
  lastError: new ONodeQueryUpdater('#status-last-error'),
  lastErrorMessage: new ONodeQueryUpdater('#status-last-error-message'),
  lastErrorTime: new ONodeQueryUpdater(
    '#status-last-error, #status-last-error-message',
    'data-when',
    '-1'
  ),
  serviceURI: new ONodeQueryUpdater('#status-service'),

  ticks: new ONodeQueryUpdater('#status-ticks', 'data-ticks', '0'),
  tickVisual: new ONodeQueryUpdater('#status-ticks'),

  captioning: new ONodeQueryUpdater('#status-captioning', 'class', 'inactive'),
  audio: new ONodeQueryUpdater('#status-audio', 'class', 'inactive'),
  sound: new ONodeQueryUpdater('#status-sound', 'class', 'inactive'),
  speech: new ONodeQueryUpdater('#status-speech', 'class', 'inactive'),

  lastFinal: new ONodeQueryUpdater('#last-final'),
  lastLine: new ONodeQueryUpdater('#last-line'),
};

export const Settings = {
  language: new ONodeQueryUpdater('html', 'lang', 'en'),
  continuous: new ONodeQueryUpdater('meta[name="continuous"]', 'content', 'false'),
  interim: new ONodeQueryUpdater('meta[name="interim-results"]', 'content', 'false'),
  alternatives: new ONodeQueryUpdater('meta[name="max-alternatives"]', 'content', '1'),
};
