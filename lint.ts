/** @format */

import { readFile } from 'fs';
import { default as prettier } from 'prettier';
import { format } from './lint.config.js';

interface common {
  file: string;
  pass: boolean;
}

interface update extends common {
  pass: true;
  source: string;
  pretty: string;
  check: boolean;
  updated: boolean;
}

interface reason extends common {
  pass: false;
  reason: object;
}

export type result = update | reason;

export function prettify(file) {
  return new Promise((resolve, reject) => {
    readFile(file, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      prettier.resolveConfig(file).then(
        (options: object): void => {
          options['filepath'] = file;

          resolve({
            file: file,
            pass: true,
            source: data,
            pretty: prettier.format(data, options),
            check: prettier.check(data, options),
            updated: false,
          });
        },
        (err: object): void => {
          reject({
            file: file,
            pass: false,
            reason: err,
          });
        }
      );
    });
  });
}

export function reformat(write: boolean): Promise<Array<result>> {
  return new Promise((resolve, reject): void => {
    format.then((files) => {
      let ps = [];

      for (const file of files) {
        ps.push(
          prettify(file).then(
            (processed: update): update => {
              if (!processed.check) {
                processed.file = file;
              }
              return processed;
            },
            (reason: reason): reason => {
              return {
                file: file,
                pass: false,
                reason: reason.reason,
              };
            }
          )
        );
      }

      Promise.all(ps).then(
        (results: Array<result>): void => {
          resolve(results);
        },
        (reason: reason): void => {
          console.warn(reason);

          reject({
            reason: reason,
          });
        }
      );
    });
  });
}

reformat(false).then((result: Array<result>) => {
  let results = result.filter((e: result) => {
    return !e.pass || (!e.check && !e.updated);
  });

  console.warn(results);

  process.exit(results.length);
});
