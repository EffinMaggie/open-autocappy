/** @format */

// Type definitions for Web Speech API - 18 August 2020 Draft
// Project: https://wicg.github.io/speech-api/#api_description
// Definitions by: Maggie Danger https://github.com/EffinMaggie
/*~ This types the APIs exposed by some browsers as part of the Web Speech API
 *~ suite, comprised of SpeechRecognition, SpeechGrammar and SpeechSynthesis
 *~ objects.
 */
/*~ Note: as an API Draft targeting Browsers, the high-level exported interface
 *~ simply modifies the global window namespace, and the only way to detect
 *~ support is by checking properties for existence. Therefore, entry points to
 *~ the API are all marked as optional, despite being mandatory in the API
 *~ documentation, to allow feature detection.
 *~
 *~ In addition, the documentation is largely pulled from the 18 August 2020
 *~ Draft Report found at wicg.github.io/speech-api. However, I've added extra
 *~ commentary and notes in places to document surprising or painful browser
 *~ specific behaviour that is not described in the report, and which may be
 *~ confusing to users of the API.
 */
declare global {
  /*~ Here, declare things that go in the global namespace, or augment
   *~ existing declarations in the global namespace
   */
  interface Window {
    /** Central interface for Speech Recognition tasks.
     */
    SpeechRecognition?: SpeechRecognitionConstructor;

    /** Chrome-specific prefixed variant for SpeechRecognition.
     *
     * Note: when trying to use the API, you should always check the prefix
     * version as well as the generic variant. Current versions of Chrome and
     * Edge do not support window.SpeechRecognition. The interface for both
     * is fortunately identical.
     */
    webkitSpeechRecognition?: SpeechRecognitionConstructor;

    /** Central interface for Speech Synthesis tasks.
     *
     * This appears to be predefined in Typescript - unlike the recognition
     * interface, so I won't be redeclaring these interfaces
     */
    SpeechSynthesis: SpeechSynthesis;
  }
}

export type SpeechRecognitionConstructor = new () => SpeechRecognition;

export interface SpeechRecognition extends EventTarget {
  constructor();

  /** Any grammars to be used during voice recognition.
   *
   * @see https://wicg.github.io/speech-api/#speechreco-attributes
   */
  grammars: SpeechGrammarList;

  /** BCP 47 language tag that the user is speaking in.
   *
   * @see https://wicg.github.io/speech-api/#speechreco-attributes
   *
   * Defaults to the language of the document's root element; the default value
   * is established upon connection to the speech recognition service - i.e.
   * when calling start();
   *
   * @note When not set explicitly, the computed default value is not available
   *       to read from this property.
   */
  lang: string;

  /** Enable continuous recognition mode.
   *
   * @see https://wicg.github.io/speech-api/#speechreco-attributes
   *
   * @default false
   *
   * When false, upon start()'ing the implementation will at most return one
   * SpeechRecognitionResult, and will stop() recognition afterwards, or if the
   * user is not speaking, or speech cannot be recongised.
   *
   * Set to true to instead run continously, until stop() is called by the API
   * user.
   *
   * @note Chrome has A Weird, where this flag may be ignored at times. This
   *       seems to be somewhat arbitrary, and connected to long processing
   *       delays in the result event handler. Chrome may get stuck in a state
   *       where the API is ostensibly running, but no results will be returned
   *       or results are delayed by over a minute and then sent in bulk.
   *
   * @note The 'no-speech' Error may still be raised in continuous mode, depend
   *       on the implementation. Similarly, the 'nomatch' handler may also
   *       be invoked, potentially with partial results, but terminating the
   *       speech recognition.
   *
   * It may be necessary to implement a watchdog for event continuity if
   * continuous speech recognition is required by an API user. Setting this
   * to false and then automatically starting upon stopping may also be
   * viable strategy, and may clean up recognition results to be easier to
   * parse, however, some browsers, e.g. Edge, may hang for a few seconds
   * when *stopping* voice recognition, meaning on those browsers this
   * strategy may lead to lost parts of a transcript.
   */
  continuous: boolean;

  /** Request partial progress results during recogntion.
   *
   * @see https://wicg.github.io/speech-api/#speechreco-attributes
   *
   * When true, the `result` event handler will not only be called when
   * a full sentence/line/phrase is parsed in full, but also during the
   * recognition, every time a new word or phrase is recognised, or even
   * only considered.
   *
   * When false, the `result` event will only be triggered when a full
   * sentence/line/fragment/paragraph has been recognised by the API.
   *
   * @note Applications that aim to allow the user to dictate text, or
   *       those that attempt to caption the user's voice as they speak
   *       should set this to `true`, and show partial results to the
   *       user as they speak, since otherwise there may not be any
   *       meaningful feedback to users if their voice is being
   *       understood by the API in an intuitive way.
   *
   * @note Different browser implementations have differing behaviour
   *       and give different levels of feedback with this set. See the
   *       `result` event's description for more details about what
   *       to expect.
   */
  interimResults: boolean;

  /** Maximum number of SpeechRecognitionAlternatives per result.
   *
   * @see https://wicg.github.io/speech-api/#speechreco-attributes
   *
   * For API implementations that support the `confidence` value concept, the
   * speech recognition may report several potential matches with differing
   * confidence values, e.g. homonyms and words that sound alike. Setting this
   * to a value over 1 allows an application to see more results than just the
   * "best guess" - alternatively, when using multiple grammars, more than
   * one of them may match a phrase, and an application may not only want the
   * one with the highest weight.
   *
   * @note Chrome supports confidence values, but when this attribute is used
   *       may also report some alternatives that have extremely low confidence
   *       which may be confusing to show to users.
   *
   * @note Edge does not support confidence values, and will only return one
   *       alternative per result, no matter the setting, all of which will have
   *       a confidence value of 0.0.
   */
  maxAlternatives: number;

  readonly serviceURI?: string;

  start();
  stop();
  abort();

  onaudiostart: EventListenerOrEventListenerObject;
  onsoundstart: EventListenerOrEventListenerObject;
  onspeechstart: EventListenerOrEventListenerObject;
  onspeechend: EventListenerOrEventListenerObject;
  onsoundend: EventListenerOrEventListenerObject;
  onaudioend: EventListenerOrEventListenerObject;
  onresult: EventListenerOrEventListenerObject;
  onnomatch: EventListenerOrEventListenerObject;
  onerror: EventListenerOrEventListenerObject;
  onstart: EventListenerOrEventListenerObject;
  onend: EventListenerOrEventListenerObject;
}

export enum SpeechRecognitionErrorCode {
  'no-speech',
  'aborted',
  'audio-capture',
  'network',
  'not-allowed',
  'service-not-allowed',
  'bad-grammar',
  'language-not-supported',
}

export interface SpeechRecognitionErrorEvent extends Event {
  constructor(type: string, eventInitDict: SpeechRecognitionErrorEventInit);
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

export interface SpeechRecognitionErrorEventInit extends EventInit {
  error: SpeechRecognitionErrorCode;
  message: string;
}

export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  constructor(type: string, eventInitDict: SpeechRecognitionEventInit);

  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionEventInit extends EventInit {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechGrammar {
  src: string;
  weight: number;
}

export interface SpeechGrammarList {
  constructor();

  readonly length: number;
  item(index: number): SpeechGrammar;

  addFromURI(src: string, weight?: number);
  addFromString(string: string, weight?: number);
}
