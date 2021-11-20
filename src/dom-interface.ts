/** @format */

import { ONodeQueryUpdater, Access } from './dom-manipulation.js';

export namespace Status {
  export const lastError = new Access.Storage(new ONodeQueryUpdater('#status-last-error'));
  export const lastErrorMessage = new Access.Storage(
    new ONodeQueryUpdater('#status-last-error-message')
  );

  export const serviceURI = new Access.Storage(new ONodeQueryUpdater('#status-service'));

  export const captioning = new Access.Classes(
    new ONodeQueryUpdater('#status-captioning', 'class', 'predicate')
  );
  export const audio = new Access.Classes(
    new ONodeQueryUpdater('#status-audio', 'class', 'predicate')
  );
  export const sound = new Access.Classes(
    new ONodeQueryUpdater('#status-sound', 'class', 'predicate')
  );
  export const speech = new Access.Classes(
    new ONodeQueryUpdater('#status-speech', 'class', 'predicate')
  );
}

export namespace Settings {
  export const language = new Access.Storage(new ONodeQueryUpdater('html', 'lang', 'en'));
  export const continuous = new Access.Boolean(
    new ONodeQueryUpdater('meta[name="continuous"]', 'content', 'false')
  );
  export const interim = new Access.Boolean(
    new ONodeQueryUpdater('meta[name="interim-results"]', 'content', 'false')
  );
  export const alternatives = new Access.Numeric(
    new ONodeQueryUpdater('meta[name="max-alternatives"]', 'content', '1')
  );
}
