/** @format */

import { readFile, writeFile } from 'fs';
import { default as prettier } from 'prettier';
import { format } from './lint.config.js';
import { diffLines } from 'diff';
import esMain from 'es-main';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv)).argv;

let args = argv['_'];
let wantFormatted = format;
if (args.length > 0) {
  wantFormatted = Promise.resolve(args);
}

interface chunk {
  added?: boolean;
  removed?: boolean;
  value: any;
}

interface common {
  file: string;
  pass: boolean;
}

interface update extends common {
  pass: true;
  clean: true | null;
  source: string;
  pretty: string;
}

interface diff extends common {
  pass: true;
  clean: false;
  changes: Array<chunk>;
}

interface reason extends common {
  pass: false;
  reason: object;
}

export type result = update | diff | reason;

export function prettify(file) {
  return new Promise((resolve, reject) => {
    readFile(file, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }

      prettier.resolveConfig(file).then(
        (options: object): void => {
          options['filepath'] = file;
          var pretty = prettier.format(data, options);

          resolve({
            file: file,
            pass: true,
            clean: data === pretty ? true : undefined,
            source: data,
            pretty: pretty,
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

function diff(update: update): diff {
  let d = diffLines(update.source, update.pretty);

  return {
    file: update.file,
    pass: true,
    clean: false,
    changes: d,
  };
}

function formatFiles(write: boolean, files: Array<string>): Array<Promise<result>> {
  let ps = [];

  for (const file of files) {
    ps.push(
      prettify(file).then(
        (u: update): update | diff => {
          if (u.clean === true) {
            return u;
          } else if (write) {
            writeFile(file, u.pretty, (err) => {
              if (err) {
                console.error(err);
                throw err;
              }
            });
            u.clean = true;
            return u;
          }
          return diff(u);
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
  return ps;
}

export function reformat(write: boolean): Promise<Array<result>> {
  return new Promise((resolve, reject): void => {
    wantFormatted.then((files: Array<string>) => {
      let ps = formatFiles(write, files);

      Promise.all(ps).then(
        (results: Array<result>): void => {
          resolve(results);
        },
        (reason: reason): void => {
          console.warn(reason);

          reject(reason);
        }
      );
    });
  });
}

function show(dirty: Array<result>, output: (s: boolean, r: string) => void): void {
  for (const result of dirty) {
    if (result.pass && result.clean === false) {
      output(
        true,
        chalk.magenta.bold('LINT') +
          ' ' +
          chalk.dim(result.file) +
          ': formatting different to "' +
          chalk.underline('prettier') +
          '" formatting; run "' +
          chalk.underline('npm run fix') +
          '" before commit'
      );

      for (const chunk of result.changes) {
        let val = chunk.value.replace(/^\s+|\s$/g, '');
        if (val.length > 0) {
          if (chunk.added) {
            output(false, chalk.blue.underline(val));
          } else if (chunk.removed) {
            output(false, chalk.dim.strikethrough(val));
          } else {
            output(false, '[ ... ]');
          }
        }
      }
    }
  }
}

export function summary(result: Array<result>): Array<result> {
  let dirty = result.filter((e: result): boolean => {
    return !e.pass || !e.clean;
  });

  show(dirty, (warning: boolean, message: string): void => {
    if (warning) {
      console.warn(message);
    } else {
      console.log(message);
    }
  });

  process.exitCode = dirty.length;
  return dirty;
}

if (esMain(import.meta)) {
  reformat(false).then(summary);
}
