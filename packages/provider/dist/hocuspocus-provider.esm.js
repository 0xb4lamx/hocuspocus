import { WsReadyStates, readAuthMessage, writeAuthentication, awarenessStatesToArray } from '@hocuspocus/common';
import * as Y from 'yjs';
import { retry } from '@lifeomic/attempt';

/**
 * Common Math expressions.
 *
 * @module math
 */

const floor = Math.floor;

/**
 * @function
 * @param {number} a
 * @param {number} b
 * @return {number} The smaller element of a and b
 */
const min = (a, b) => a < b ? a : b;

/**
 * @function
 * @param {number} a
 * @param {number} b
 * @return {number} The bigger element of a and b
 */
const max = (a, b) => a > b ? a : b;

/* eslint-env browser */

const BIT7 = 64;
const BIT8 = 128;
const BITS6 = 63;
const BITS7 = 127;

/**
 * Utility helpers for working with numbers.
 *
 * @module number
 */


const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

/**
 * Utility module to work with sets.
 *
 * @module set
 */

const create$2 = () => new Set();

/**
 * Utility module to work with Arrays.
 *
 * @module array
 */


/**
 * Transforms something array-like to an actual Array.
 *
 * @function
 * @template T
 * @param {ArrayLike<T>|Iterable<T>} arraylike
 * @return {T}
 */
const from = Array.from;

/**
 * @param {string} str
 * @return {Uint8Array}
 */
const _encodeUtf8Polyfill = str => {
  const encodedString = unescape(encodeURIComponent(str));
  const len = encodedString.length;
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buf[i] = /** @type {number} */ (encodedString.codePointAt(i));
  }
  return buf
};

/* c8 ignore next */
const utf8TextEncoder = /** @type {TextEncoder} */ (typeof TextEncoder !== 'undefined' ? new TextEncoder() : null);

/**
 * @param {string} str
 * @return {Uint8Array}
 */
const _encodeUtf8Native = str => utf8TextEncoder.encode(str);

/**
 * @param {string} str
 * @return {Uint8Array}
 */
/* c8 ignore next */
const encodeUtf8 = utf8TextEncoder ? _encodeUtf8Native : _encodeUtf8Polyfill;

/* c8 ignore next */
let utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/* c8 ignore start */
if (utf8TextDecoder && utf8TextDecoder.decode(new Uint8Array()).length === 1) {
  // Safari doesn't handle BOM correctly.
  // This fixes a bug in Safari 13.0.5 where it produces a BOM the first time it is called.
  // utf8TextDecoder.decode(new Uint8Array()).length === 1 on the first call and
  // utf8TextDecoder.decode(new Uint8Array()).length === 1 on the second call
  // Another issue is that from then on no BOM chars are recognized anymore
  /* c8 ignore next */
  utf8TextDecoder = null;
}

/**
 * Efficient schema-less binary encoding with support for variable length encoding.
 *
 * Use [lib0/encoding] with [lib0/decoding]. Every encoding function has a corresponding decoding function.
 *
 * Encodes numbers in little-endian order (least to most significant byte order)
 * and is compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
 * which is also used in Protocol Buffers.
 *
 * ```js
 * // encoding step
 * const encoder = encoding.createEncoder()
 * encoding.writeVarUint(encoder, 256)
 * encoding.writeVarString(encoder, 'Hello world!')
 * const buf = encoding.toUint8Array(encoder)
 * ```
 *
 * ```js
 * // decoding step
 * const decoder = decoding.createDecoder(buf)
 * decoding.readVarUint(decoder) // => 256
 * decoding.readVarString(decoder) // => 'Hello world!'
 * decoding.hasContent(decoder) // => false - all data is read
 * ```
 *
 * @module encoding
 */


/**
 * A BinaryEncoder handles the encoding to an Uint8Array.
 */
class Encoder {
  constructor () {
    this.cpos = 0;
    this.cbuf = new Uint8Array(100);
    /**
     * @type {Array<Uint8Array>}
     */
    this.bufs = [];
  }
}

/**
 * @function
 * @return {Encoder}
 */
const createEncoder = () => new Encoder();

/**
 * The current length of the encoded data.
 *
 * @function
 * @param {Encoder} encoder
 * @return {number}
 */
const length$1 = encoder => {
  let len = encoder.cpos;
  for (let i = 0; i < encoder.bufs.length; i++) {
    len += encoder.bufs[i].length;
  }
  return len
};

/**
 * Transform to Uint8Array.
 *
 * @function
 * @param {Encoder} encoder
 * @return {Uint8Array} The created ArrayBuffer.
 */
const toUint8Array = encoder => {
  const uint8arr = new Uint8Array(length$1(encoder));
  let curPos = 0;
  for (let i = 0; i < encoder.bufs.length; i++) {
    const d = encoder.bufs[i];
    uint8arr.set(d, curPos);
    curPos += d.length;
  }
  uint8arr.set(new Uint8Array(encoder.cbuf.buffer, 0, encoder.cpos), curPos);
  return uint8arr
};

/**
 * Write one byte to the encoder.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} num The byte that is to be encoded.
 */
const write = (encoder, num) => {
  const bufferLen = encoder.cbuf.length;
  if (encoder.cpos === bufferLen) {
    encoder.bufs.push(encoder.cbuf);
    encoder.cbuf = new Uint8Array(bufferLen * 2);
    encoder.cpos = 0;
  }
  encoder.cbuf[encoder.cpos++] = num;
};

/**
 * Write a variable length unsigned integer. Max encodable integer is 2^53.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} num The number that is to be encoded.
 */
const writeVarUint = (encoder, num) => {
  while (num > BITS7) {
    write(encoder, BIT8 | (BITS7 & num));
    num = floor(num / 128); // shift >>> 7
  }
  write(encoder, BITS7 & num);
};

/**
 * A cache to store strings temporarily
 */
const _strBuffer = new Uint8Array(30000);
const _maxStrBSize = _strBuffer.length / 3;

/**
 * Write a variable length string.
 *
 * @function
 * @param {Encoder} encoder
 * @param {String} str The string that is to be encoded.
 */
const _writeVarStringNative = (encoder, str) => {
  if (str.length < _maxStrBSize) {
    // We can encode the string into the existing buffer
    /* c8 ignore next */
    const written = utf8TextEncoder.encodeInto(str, _strBuffer).written || 0;
    writeVarUint(encoder, written);
    for (let i = 0; i < written; i++) {
      write(encoder, _strBuffer[i]);
    }
  } else {
    writeVarUint8Array(encoder, encodeUtf8(str));
  }
};

/**
 * Write a variable length string.
 *
 * @function
 * @param {Encoder} encoder
 * @param {String} str The string that is to be encoded.
 */
const _writeVarStringPolyfill = (encoder, str) => {
  const encodedString = unescape(encodeURIComponent(str));
  const len = encodedString.length;
  writeVarUint(encoder, len);
  for (let i = 0; i < len; i++) {
    write(encoder, /** @type {number} */ (encodedString.codePointAt(i)));
  }
};

/**
 * Write a variable length string.
 *
 * @function
 * @param {Encoder} encoder
 * @param {String} str The string that is to be encoded.
 */
/* c8 ignore next */
const writeVarString = (utf8TextEncoder && /** @type {any} */ (utf8TextEncoder).encodeInto) ? _writeVarStringNative : _writeVarStringPolyfill;

/**
 * Append fixed-length Uint8Array to the encoder.
 *
 * @function
 * @param {Encoder} encoder
 * @param {Uint8Array} uint8Array
 */
const writeUint8Array = (encoder, uint8Array) => {
  const bufferLen = encoder.cbuf.length;
  const cpos = encoder.cpos;
  const leftCopyLen = min(bufferLen - cpos, uint8Array.length);
  const rightCopyLen = uint8Array.length - leftCopyLen;
  encoder.cbuf.set(uint8Array.subarray(0, leftCopyLen), cpos);
  encoder.cpos += leftCopyLen;
  if (rightCopyLen > 0) {
    // Still something to write, write right half..
    // Append new buffer
    encoder.bufs.push(encoder.cbuf);
    // must have at least size of remaining buffer
    encoder.cbuf = new Uint8Array(max(bufferLen * 2, rightCopyLen));
    // copy array
    encoder.cbuf.set(uint8Array.subarray(leftCopyLen));
    encoder.cpos = rightCopyLen;
  }
};

/**
 * Append an Uint8Array to Encoder.
 *
 * @function
 * @param {Encoder} encoder
 * @param {Uint8Array} uint8Array
 */
const writeVarUint8Array = (encoder, uint8Array) => {
  writeVarUint(encoder, uint8Array.byteLength);
  writeUint8Array(encoder, uint8Array);
};

/**
 * Error helpers.
 *
 * @module error
 */

/**
 * @param {string} s
 * @return {Error}
 */
/* c8 ignore next */
const create$1 = s => new Error(s);

/**
 * Efficient schema-less binary decoding with support for variable length encoding.
 *
 * Use [lib0/decoding] with [lib0/encoding]. Every encoding function has a corresponding decoding function.
 *
 * Encodes numbers in little-endian order (least to most significant byte order)
 * and is compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
 * which is also used in Protocol Buffers.
 *
 * ```js
 * // encoding step
 * const encoder = encoding.createEncoder()
 * encoding.writeVarUint(encoder, 256)
 * encoding.writeVarString(encoder, 'Hello world!')
 * const buf = encoding.toUint8Array(encoder)
 * ```
 *
 * ```js
 * // decoding step
 * const decoder = decoding.createDecoder(buf)
 * decoding.readVarUint(decoder) // => 256
 * decoding.readVarString(decoder) // => 'Hello world!'
 * decoding.hasContent(decoder) // => false - all data is read
 * ```
 *
 * @module decoding
 */


const errorUnexpectedEndOfArray = create$1('Unexpected end of array');
const errorIntegerOutOfRange = create$1('Integer out of Range');

/**
 * A Decoder handles the decoding of an Uint8Array.
 */
class Decoder {
  /**
   * @param {Uint8Array} uint8Array Binary data to decode
   */
  constructor (uint8Array) {
    /**
     * Decoding target.
     *
     * @type {Uint8Array}
     */
    this.arr = uint8Array;
    /**
     * Current decoding position.
     *
     * @type {number}
     */
    this.pos = 0;
  }
}

/**
 * @function
 * @param {Uint8Array} uint8Array
 * @return {Decoder}
 */
const createDecoder = uint8Array => new Decoder(uint8Array);

/**
 * Create an Uint8Array view of the next `len` bytes and advance the position by `len`.
 *
 * Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
 *            Use `buffer.copyUint8Array` to copy the result into a new Uint8Array.
 *
 * @function
 * @param {Decoder} decoder The decoder instance
 * @param {number} len The length of bytes to read
 * @return {Uint8Array}
 */
const readUint8Array = (decoder, len) => {
  const view = new Uint8Array(decoder.arr.buffer, decoder.pos + decoder.arr.byteOffset, len);
  decoder.pos += len;
  return view
};

/**
 * Read variable length Uint8Array.
 *
 * Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
 *            Use `buffer.copyUint8Array` to copy the result into a new Uint8Array.
 *
 * @function
 * @param {Decoder} decoder
 * @return {Uint8Array}
 */
const readVarUint8Array = decoder => readUint8Array(decoder, readVarUint(decoder));

/**
 * Read one byte as unsigned integer.
 * @function
 * @param {Decoder} decoder The decoder instance
 * @return {number} Unsigned 8-bit integer
 */
const readUint8 = decoder => decoder.arr[decoder.pos++];

/**
 * Read unsigned integer (32bit) with variable length.
 * 1/8th of the storage is used as encoding overhead.
 *  * numbers < 2^7 is stored in one bytlength
 *  * numbers < 2^14 is stored in two bylength
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.length
 */
const readVarUint = decoder => {
  let num = 0;
  let mult = 1;
  const len = decoder.arr.length;
  while (decoder.pos < len) {
    const r = decoder.arr[decoder.pos++];
    // num = num | ((r & binary.BITS7) << len)
    num = num + (r & BITS7) * mult; // shift $r << (7*#iterations) and add it to num
    mult *= 128; // next iteration, shift 7 "more" to the left
    if (r < BIT8) {
      return num
    }
    /* c8 ignore start */
    if (num > MAX_SAFE_INTEGER) {
      throw errorIntegerOutOfRange
    }
    /* c8 ignore stop */
  }
  throw errorUnexpectedEndOfArray
};

/**
 * Read signed integer (32bit) with variable length.
 * 1/8th of the storage is used as encoding overhead.
 *  * numbers < 2^7 is stored in one bytlength
 *  * numbers < 2^14 is stored in two bylength
 * @todo This should probably create the inverse ~num if number is negative - but this would be a breaking change.
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.length
 */
const readVarInt = decoder => {
  let r = decoder.arr[decoder.pos++];
  let num = r & BITS6;
  let mult = 64;
  const sign = (r & BIT7) > 0 ? -1 : 1;
  if ((r & BIT8) === 0) {
    // don't continue reading
    return sign * num
  }
  const len = decoder.arr.length;
  while (decoder.pos < len) {
    r = decoder.arr[decoder.pos++];
    // num = num | ((r & binary.BITS7) << len)
    num = num + (r & BITS7) * mult;
    mult *= 128;
    if (r < BIT8) {
      return sign * num
    }
    /* c8 ignore start */
    if (num > MAX_SAFE_INTEGER) {
      throw errorIntegerOutOfRange
    }
    /* c8 ignore stop */
  }
  throw errorUnexpectedEndOfArray
};

/**
 * We don't test this function anymore as we use native decoding/encoding by default now.
 * Better not modify this anymore..
 *
 * Transforming utf8 to a string is pretty expensive. The code performs 10x better
 * when String.fromCodePoint is fed with all characters as arguments.
 * But most environments have a maximum number of arguments per functions.
 * For effiency reasons we apply a maximum of 10000 characters at once.
 *
 * @function
 * @param {Decoder} decoder
 * @return {String} The read String.
 */
/* c8 ignore start */
const _readVarStringPolyfill = decoder => {
  let remainingLen = readVarUint(decoder);
  if (remainingLen === 0) {
    return ''
  } else {
    let encodedString = String.fromCodePoint(readUint8(decoder)); // remember to decrease remainingLen
    if (--remainingLen < 100) { // do not create a Uint8Array for small strings
      while (remainingLen--) {
        encodedString += String.fromCodePoint(readUint8(decoder));
      }
    } else {
      while (remainingLen > 0) {
        const nextLen = remainingLen < 10000 ? remainingLen : 10000;
        // this is dangerous, we create a fresh array view from the existing buffer
        const bytes = decoder.arr.subarray(decoder.pos, decoder.pos + nextLen);
        decoder.pos += nextLen;
        // Starting with ES5.1 we can supply a generic array-like object as arguments
        encodedString += String.fromCodePoint.apply(null, /** @type {any} */ (bytes));
        remainingLen -= nextLen;
      }
    }
    return decodeURIComponent(escape(encodedString))
  }
};
/* c8 ignore stop */

/**
 * @function
 * @param {Decoder} decoder
 * @return {String} The read String
 */
const _readVarStringNative = decoder =>
  /** @type any */ (utf8TextDecoder).decode(readVarUint8Array(decoder));

/**
 * Read string of variable length
 * * varUint is used to store the length of the string
 *
 * @function
 * @param {Decoder} decoder
 * @return {String} The read String
 *
 */
/* c8 ignore next */
const readVarString = utf8TextDecoder ? _readVarStringNative : _readVarStringPolyfill;

/**
 * Look ahead and read varString without incrementing position
 *
 * @function
 * @param {Decoder} decoder
 * @return {string}
 */
const peekVarString = decoder => {
  const pos = decoder.pos;
  const s = readVarString(decoder);
  decoder.pos = pos;
  return s
};

/**
 * Utility module to work with time.
 *
 * @module time
 */


/**
 * Return current unix time.
 *
 * @return {number}
 */
const getUnixTime = Date.now;

/**
 * Utility module to work with key-value stores.
 *
 * @module map
 */

/**
 * Creates a new Map instance.
 *
 * @function
 * @return {Map<any, any>}
 *
 * @function
 */
const create = () => new Map();

/**
 * Get map property. Create T if property is undefined and set T on map.
 *
 * ```js
 * const listeners = map.setIfUndefined(events, 'eventName', set.create)
 * listeners.add(listener)
 * ```
 *
 * @function
 * @template {Map<any, any>} MAP
 * @template {MAP extends Map<any,infer V> ? function():V : unknown} CF
 * @param {MAP} map
 * @param {MAP extends Map<infer K,any> ? K : unknown} key
 * @param {CF} createT
 * @return {ReturnType<CF>}
 */
const setIfUndefined = (map, key, createT) => {
  let set = map.get(key);
  if (set === undefined) {
    map.set(key, set = createT());
  }
  return set
};

/**
 * Observable class prototype.
 *
 * @module observable
 */


/* c8 ignore start */
/**
 * Handles named events.
 *
 * @deprecated
 * @template N
 */
class Observable {
  constructor () {
    /**
     * Some desc.
     * @type {Map<N, any>}
     */
    this._observers = create();
  }

  /**
   * @param {N} name
   * @param {function} f
   */
  on (name, f) {
    setIfUndefined(this._observers, name, create$2).add(f);
  }

  /**
   * @param {N} name
   * @param {function} f
   */
  once (name, f) {
    /**
     * @param  {...any} args
     */
    const _f = (...args) => {
      this.off(name, _f);
      f(...args);
    };
    this.on(name, _f);
  }

  /**
   * @param {N} name
   * @param {function} f
   */
  off (name, f) {
    const observers = this._observers.get(name);
    if (observers !== undefined) {
      observers.delete(f);
      if (observers.size === 0) {
        this._observers.delete(name);
      }
    }
  }

  /**
   * Emit a named event. All registered event listeners that listen to the
   * specified name will receive the event.
   *
   * @todo This should catch exceptions
   *
   * @param {N} name The event name.
   * @param {Array<any>} args The arguments that are applied to the event listener.
   */
  emit (name, args) {
    // copy all listeners to an array first to make sure that no event is emitted to listeners that are subscribed while the event handler is called.
    return from((this._observers.get(name) || create()).values()).forEach(f => f(...args))
  }

  destroy () {
    this._observers = create();
  }
}
/* c8 ignore end */

/**
 * Utility functions for working with EcmaScript objects.
 *
 * @module object
 */


/**
 * @param {Object<string,any>} obj
 */
const keys = Object.keys;

/**
 * @deprecated use object.size instead
 * @param {Object<string,any>} obj
 * @return {number}
 */
const length = obj => keys(obj).length;

/**
 * Calls `Object.prototype.hasOwnProperty`.
 *
 * @param {any} obj
 * @param {string|symbol} key
 * @return {boolean}
 */
const hasProperty = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Common functions and function call helpers.
 *
 * @module function
 */


/**
 * @template T
 *
 * @param {T} a
 * @param {T} b
 * @return {boolean}
 */
const equalityStrict = (a, b) => a === b;

/* c8 ignore start */

/**
 * @param {any} a
 * @param {any} b
 * @return {boolean}
 */
const equalityDeep = (a, b) => {
  if (a == null || b == null) {
    return equalityStrict(a, b)
  }
  if (a.constructor !== b.constructor) {
    return false
  }
  if (a === b) {
    return true
  }
  switch (a.constructor) {
    case ArrayBuffer:
      a = new Uint8Array(a);
      b = new Uint8Array(b);
    // eslint-disable-next-line no-fallthrough
    case Uint8Array: {
      if (a.byteLength !== b.byteLength) {
        return false
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return false
        }
      }
      break
    }
    case Set: {
      if (a.size !== b.size) {
        return false
      }
      for (const value of a) {
        if (!b.has(value)) {
          return false
        }
      }
      break
    }
    case Map: {
      if (a.size !== b.size) {
        return false
      }
      for (const key of a.keys()) {
        if (!b.has(key) || !equalityDeep(a.get(key), b.get(key))) {
          return false
        }
      }
      break
    }
    case Object:
      if (length(a) !== length(b)) {
        return false
      }
      for (const key in a) {
        if (!hasProperty(a, key) || !equalityDeep(a[key], b[key])) {
          return false
        }
      }
      break
    case Array:
      if (a.length !== b.length) {
        return false
      }
      for (let i = 0; i < a.length; i++) {
        if (!equalityDeep(a[i], b[i])) {
          return false
        }
      }
      break
    default:
      return false
  }
  return true
};

/**
 * @module awareness-protocol
 */


const outdatedTimeout = 30000;

/**
 * @typedef {Object} MetaClientState
 * @property {number} MetaClientState.clock
 * @property {number} MetaClientState.lastUpdated unix timestamp
 */

/**
 * The Awareness class implements a simple shared state protocol that can be used for non-persistent data like awareness information
 * (cursor, username, status, ..). Each client can update its own local state and listen to state changes of
 * remote clients. Every client may set a state of a remote peer to `null` to mark the client as offline.
 *
 * Each client is identified by a unique client id (something we borrow from `doc.clientID`). A client can override
 * its own state by propagating a message with an increasing timestamp (`clock`). If such a message is received, it is
 * applied if the known state of that client is older than the new state (`clock < newClock`). If a client thinks that
 * a remote client is offline, it may propagate a message with
 * `{ clock: currentClientClock, state: null, client: remoteClient }`. If such a
 * message is received, and the known clock of that client equals the received clock, it will override the state with `null`.
 *
 * Before a client disconnects, it should propagate a `null` state with an updated clock.
 *
 * Awareness states must be updated every 30 seconds. Otherwise the Awareness instance will delete the client state.
 *
 * @extends {Observable<string>}
 */
class Awareness extends Observable {
  /**
   * @param {Y.Doc} doc
   */
  constructor (doc) {
    super();
    this.doc = doc;
    /**
     * @type {number}
     */
    this.clientID = doc.clientID;
    /**
     * Maps from client id to client state
     * @type {Map<number, Object<string, any>>}
     */
    this.states = new Map();
    /**
     * @type {Map<number, MetaClientState>}
     */
    this.meta = new Map();
    this._checkInterval = /** @type {any} */ (setInterval(() => {
      const now = getUnixTime();
      if (this.getLocalState() !== null && (outdatedTimeout / 2 <= now - /** @type {{lastUpdated:number}} */ (this.meta.get(this.clientID)).lastUpdated)) {
        // renew local clock
        this.setLocalState(this.getLocalState());
      }
      /**
       * @type {Array<number>}
       */
      const remove = [];
      this.meta.forEach((meta, clientid) => {
        if (clientid !== this.clientID && outdatedTimeout <= now - meta.lastUpdated && this.states.has(clientid)) {
          remove.push(clientid);
        }
      });
      if (remove.length > 0) {
        removeAwarenessStates(this, remove, 'timeout');
      }
    }, floor(outdatedTimeout / 10)));
    doc.on('destroy', () => {
      this.destroy();
    });
    this.setLocalState({});
  }

  destroy () {
    this.emit('destroy', [this]);
    this.setLocalState(null);
    super.destroy();
    clearInterval(this._checkInterval);
  }

  /**
   * @return {Object<string,any>|null}
   */
  getLocalState () {
    return this.states.get(this.clientID) || null
  }

  /**
   * @param {Object<string,any>|null} state
   */
  setLocalState (state) {
    const clientID = this.clientID;
    const currLocalMeta = this.meta.get(clientID);
    const clock = currLocalMeta === undefined ? 0 : currLocalMeta.clock + 1;
    const prevState = this.states.get(clientID);
    if (state === null) {
      this.states.delete(clientID);
    } else {
      this.states.set(clientID, state);
    }
    this.meta.set(clientID, {
      clock,
      lastUpdated: getUnixTime()
    });
    const added = [];
    const updated = [];
    const filteredUpdated = [];
    const removed = [];
    if (state === null) {
      removed.push(clientID);
    } else if (prevState == null) {
      if (state != null) {
        added.push(clientID);
      }
    } else {
      updated.push(clientID);
      if (!equalityDeep(prevState, state)) {
        filteredUpdated.push(clientID);
      }
    }
    if (added.length > 0 || filteredUpdated.length > 0 || removed.length > 0) {
      this.emit('change', [{ added, updated: filteredUpdated, removed }, 'local']);
    }
    this.emit('update', [{ added, updated, removed }, 'local']);
  }

  /**
   * @param {string} field
   * @param {any} value
   */
  setLocalStateField (field, value) {
    const state = this.getLocalState();
    if (state !== null) {
      this.setLocalState({
        ...state,
        [field]: value
      });
    }
  }

  /**
   * @return {Map<number,Object<string,any>>}
   */
  getStates () {
    return this.states
  }
}

/**
 * Mark (remote) clients as inactive and remove them from the list of active peers.
 * This change will be propagated to remote clients.
 *
 * @param {Awareness} awareness
 * @param {Array<number>} clients
 * @param {any} origin
 */
const removeAwarenessStates = (awareness, clients, origin) => {
  const removed = [];
  for (let i = 0; i < clients.length; i++) {
    const clientID = clients[i];
    if (awareness.states.has(clientID)) {
      awareness.states.delete(clientID);
      if (clientID === awareness.clientID) {
        const curMeta = /** @type {MetaClientState} */ (awareness.meta.get(clientID));
        awareness.meta.set(clientID, {
          clock: curMeta.clock + 1,
          lastUpdated: getUnixTime()
        });
      }
      removed.push(clientID);
    }
  }
  if (removed.length > 0) {
    awareness.emit('change', [{ added: [], updated: [], removed }, origin]);
    awareness.emit('update', [{ added: [], updated: [], removed }, origin]);
  }
};

/**
 * @param {Awareness} awareness
 * @param {Array<number>} clients
 * @return {Uint8Array}
 */
const encodeAwarenessUpdate = (awareness, clients, states = awareness.states) => {
  const len = clients.length;
  const encoder = createEncoder();
  writeVarUint(encoder, len);
  for (let i = 0; i < len; i++) {
    const clientID = clients[i];
    const state = states.get(clientID) || null;
    const clock = /** @type {MetaClientState} */ (awareness.meta.get(clientID)).clock;
    writeVarUint(encoder, clientID);
    writeVarUint(encoder, clock);
    writeVarString(encoder, JSON.stringify(state));
  }
  return toUint8Array(encoder)
};

/**
 * @param {Awareness} awareness
 * @param {Uint8Array} update
 * @param {any} origin This will be added to the emitted change event
 */
const applyAwarenessUpdate = (awareness, update, origin) => {
  const decoder = createDecoder(update);
  const timestamp = getUnixTime();
  const added = [];
  const updated = [];
  const filteredUpdated = [];
  const removed = [];
  const len = readVarUint(decoder);
  for (let i = 0; i < len; i++) {
    const clientID = readVarUint(decoder);
    let clock = readVarUint(decoder);
    const state = JSON.parse(readVarString(decoder));
    const clientMeta = awareness.meta.get(clientID);
    const prevState = awareness.states.get(clientID);
    const currClock = clientMeta === undefined ? 0 : clientMeta.clock;
    if (currClock < clock || (currClock === clock && state === null && awareness.states.has(clientID))) {
      if (state === null) {
        // never let a remote client remove this local state
        if (clientID === awareness.clientID && awareness.getLocalState() != null) {
          // remote client removed the local state. Do not remote state. Broadcast a message indicating
          // that this client still exists by increasing the clock
          clock++;
        } else {
          awareness.states.delete(clientID);
        }
      } else {
        awareness.states.set(clientID, state);
      }
      awareness.meta.set(clientID, {
        clock,
        lastUpdated: timestamp
      });
      if (clientMeta === undefined && state !== null) {
        added.push(clientID);
      } else if (clientMeta !== undefined && state === null) {
        removed.push(clientID);
      } else if (state !== null) {
        if (!equalityDeep(state, prevState)) {
          filteredUpdated.push(clientID);
        }
        updated.push(clientID);
      }
    }
  }
  if (added.length > 0 || filteredUpdated.length > 0 || removed.length > 0) {
    awareness.emit('change', [{
      added, updated: filteredUpdated, removed
    }, origin]);
  }
  if (added.length > 0 || updated.length > 0 || removed.length > 0) {
    awareness.emit('update', [{
      added, updated, removed
    }, origin]);
  }
};

class EventEmitter {
    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        this.callbacks = {};
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    on(event, fn) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(fn);
        return this;
    }
    emit(event, ...args) {
        const callbacks = this.callbacks[event];
        if (callbacks) {
            callbacks.forEach((callback) => callback.apply(this, args));
        }
        return this;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    off(event, fn) {
        const callbacks = this.callbacks[event];
        if (callbacks) {
            if (fn) {
                this.callbacks[event] = callbacks.filter((callback) => callback !== fn);
            }
            else {
                delete this.callbacks[event];
            }
        }
        return this;
    }
    removeAllListeners() {
        this.callbacks = {};
    }
}

class IncomingMessage {
    constructor(data) {
        this.data = data;
        this.encoder = createEncoder();
        this.decoder = createDecoder(new Uint8Array(this.data));
    }
    peekVarString() {
        return peekVarString(this.decoder);
    }
    readVarUint() {
        return readVarUint(this.decoder);
    }
    readVarString() {
        return readVarString(this.decoder);
    }
    readVarUint8Array() {
        return readVarUint8Array(this.decoder);
    }
    writeVarUint(type) {
        return writeVarUint(this.encoder, type);
    }
    writeVarString(string) {
        return writeVarString(this.encoder, string);
    }
    writeVarUint8Array(data) {
        return writeVarUint8Array(this.encoder, data);
    }
    length() {
        return length$1(this.encoder);
    }
}

var MessageType;
(function (MessageType) {
    MessageType[MessageType["Sync"] = 0] = "Sync";
    MessageType[MessageType["Awareness"] = 1] = "Awareness";
    MessageType[MessageType["Auth"] = 2] = "Auth";
    MessageType[MessageType["QueryAwareness"] = 3] = "QueryAwareness";
    MessageType[MessageType["Stateless"] = 5] = "Stateless";
    MessageType[MessageType["CLOSE"] = 7] = "CLOSE";
    MessageType[MessageType["SyncStatus"] = 8] = "SyncStatus";
})(MessageType || (MessageType = {}));
var WebSocketStatus;
(function (WebSocketStatus) {
    WebSocketStatus["Connecting"] = "connecting";
    WebSocketStatus["Connected"] = "connected";
    WebSocketStatus["Disconnected"] = "disconnected";
})(WebSocketStatus || (WebSocketStatus = {}));

class OutgoingMessage {
    constructor() {
        this.encoder = createEncoder();
    }
    get(args) {
        return args.encoder;
    }
    toUint8Array() {
        return toUint8Array(this.encoder);
    }
}

class CloseMessage extends OutgoingMessage {
    constructor() {
        super(...arguments);
        this.type = MessageType.CLOSE;
        this.description = "Ask the server to close the connection";
    }
    get(args) {
        writeVarString(this.encoder, args.documentName);
        writeVarUint(this.encoder, this.type);
        return this.encoder;
    }
}

class HocuspocusProviderWebsocket extends EventEmitter {
    constructor(configuration) {
        super();
        this.messageQueue = [];
        this.configuration = {
            url: "",
            autoConnect: true,
            // @ts-ignore
            document: undefined,
            WebSocketPolyfill: undefined,
            // TODO: this should depend on awareness.outdatedTime
            messageReconnectTimeout: 30000,
            // 1 second
            delay: 1000,
            // instant
            initialDelay: 0,
            // double the delay each time
            factor: 2,
            // unlimited retries
            maxAttempts: 0,
            // wait at least 1 second
            minDelay: 1000,
            // at least every 30 seconds
            maxDelay: 30000,
            // randomize
            jitter: true,
            // retry forever
            timeout: 0,
            onOpen: () => null,
            onConnect: () => null,
            onMessage: () => null,
            onOutgoingMessage: () => null,
            onStatus: () => null,
            onDisconnect: () => null,
            onClose: () => null,
            onDestroy: () => null,
            onAwarenessUpdate: () => null,
            onAwarenessChange: () => null,
            handleTimeout: null,
            providerMap: new Map(),
        };
        this.webSocket = null;
        this.webSocketHandlers = {};
        this.shouldConnect = true;
        this.status = WebSocketStatus.Disconnected;
        this.lastMessageReceived = 0;
        this.identifier = 0;
        this.intervals = {
            connectionChecker: null,
        };
        this.connectionAttempt = null;
        this.receivedOnOpenPayload = undefined;
        this.closeTries = 0;
        this.setConfiguration(configuration);
        this.configuration.WebSocketPolyfill = configuration.WebSocketPolyfill
            ? configuration.WebSocketPolyfill
            : WebSocket;
        this.on("open", this.configuration.onOpen);
        this.on("open", this.onOpen.bind(this));
        this.on("connect", this.configuration.onConnect);
        this.on("message", this.configuration.onMessage);
        this.on("outgoingMessage", this.configuration.onOutgoingMessage);
        this.on("status", this.configuration.onStatus);
        this.on("disconnect", this.configuration.onDisconnect);
        this.on("close", this.configuration.onClose);
        this.on("destroy", this.configuration.onDestroy);
        this.on("awarenessUpdate", this.configuration.onAwarenessUpdate);
        this.on("awarenessChange", this.configuration.onAwarenessChange);
        this.on("close", this.onClose.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.intervals.connectionChecker = setInterval(this.checkConnection.bind(this), this.configuration.messageReconnectTimeout / 10);
        if (this.shouldConnect) {
            this.connect();
        }
    }
    async onOpen(event) {
        this.status = WebSocketStatus.Connected;
        this.emit("status", { status: WebSocketStatus.Connected });
        this.cancelWebsocketRetry = undefined;
        this.receivedOnOpenPayload = event;
    }
    attach(provider) {
        this.configuration.providerMap.set(provider.configuration.name, provider);
        if (this.status === WebSocketStatus.Disconnected && this.shouldConnect) {
            this.connect();
        }
        if (this.receivedOnOpenPayload &&
            this.status === WebSocketStatus.Connected) {
            provider.onOpen(this.receivedOnOpenPayload);
        }
    }
    detach(provider) {
        if (this.configuration.providerMap.has(provider.configuration.name)) {
            provider.send(CloseMessage, {
                documentName: provider.configuration.name,
            });
            this.configuration.providerMap.delete(provider.configuration.name);
        }
    }
    setConfiguration(configuration = {}) {
        this.configuration = { ...this.configuration, ...configuration };
        if (!this.configuration.autoConnect) {
            this.shouldConnect = false;
        }
    }
    async connect() {
        if (this.status === WebSocketStatus.Connected) {
            return;
        }
        // Always cancel any previously initiated connection retryer instances
        if (this.cancelWebsocketRetry) {
            this.cancelWebsocketRetry();
            this.cancelWebsocketRetry = undefined;
        }
        this.receivedOnOpenPayload = undefined;
        this.shouldConnect = true;
        const abortableRetry = () => {
            let cancelAttempt = false;
            const retryPromise = retry(this.createWebSocketConnection.bind(this), {
                delay: this.configuration.delay,
                initialDelay: this.configuration.initialDelay,
                factor: this.configuration.factor,
                maxAttempts: this.configuration.maxAttempts,
                minDelay: this.configuration.minDelay,
                maxDelay: this.configuration.maxDelay,
                jitter: this.configuration.jitter,
                timeout: this.configuration.timeout,
                handleTimeout: this.configuration.handleTimeout,
                beforeAttempt: (context) => {
                    if (!this.shouldConnect || cancelAttempt) {
                        context.abort();
                    }
                },
            }).catch((error) => {
                // If we aborted the connection attempt then don’t throw an error
                // ref: https://github.com/lifeomic/attempt/blob/master/src/index.ts#L136
                if (error && error.code !== "ATTEMPT_ABORTED") {
                    throw error;
                }
            });
            return {
                retryPromise,
                cancelFunc: () => {
                    cancelAttempt = true;
                },
            };
        };
        const { retryPromise, cancelFunc } = abortableRetry();
        this.cancelWebsocketRetry = cancelFunc;
        return retryPromise;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    attachWebSocketListeners(ws, reject) {
        const { identifier } = ws;
        const onMessageHandler = (payload) => this.emit("message", payload);
        const onCloseHandler = (payload) => this.emit("close", { event: payload });
        const onOpenHandler = (payload) => this.emit("open", payload);
        const onErrorHandler = (err) => {
            reject(err);
        };
        this.webSocketHandlers[identifier] = {
            message: onMessageHandler,
            close: onCloseHandler,
            open: onOpenHandler,
            error: onErrorHandler,
        };
        const handlers = this.webSocketHandlers[ws.identifier];
        Object.keys(handlers).forEach((name) => {
            ws.addEventListener(name, handlers[name]);
        });
    }
    cleanupWebSocket() {
        if (!this.webSocket) {
            return;
        }
        const { identifier } = this.webSocket;
        const handlers = this.webSocketHandlers[identifier];
        Object.keys(handlers).forEach((name) => {
            var _a;
            (_a = this.webSocket) === null || _a === void 0 ? void 0 : _a.removeEventListener(name, handlers[name]);
            delete this.webSocketHandlers[identifier];
        });
        this.webSocket.close();
        this.webSocket = null;
    }
    createWebSocketConnection() {
        return new Promise((resolve, reject) => {
            if (this.webSocket) {
                this.messageQueue = [];
                this.cleanupWebSocket();
            }
            this.lastMessageReceived = 0;
            this.identifier += 1;
            // Init the WebSocket connection
            const ws = new this.configuration.WebSocketPolyfill(this.url);
            ws.binaryType = "arraybuffer";
            ws.identifier = this.identifier;
            this.attachWebSocketListeners(ws, reject);
            this.webSocket = ws;
            // Reset the status
            this.status = WebSocketStatus.Connecting;
            this.emit("status", { status: WebSocketStatus.Connecting });
            // Store resolve/reject for later use
            this.connectionAttempt = {
                resolve,
                reject,
            };
        });
    }
    onMessage(event) {
        var _a;
        this.resolveConnectionAttempt();
        this.lastMessageReceived = getUnixTime();
        const message = new IncomingMessage(event.data);
        const documentName = message.peekVarString();
        (_a = this.configuration.providerMap.get(documentName)) === null || _a === void 0 ? void 0 : _a.onMessage(event);
    }
    resolveConnectionAttempt() {
        if (this.connectionAttempt) {
            this.connectionAttempt.resolve();
            this.connectionAttempt = null;
            this.status = WebSocketStatus.Connected;
            this.emit("status", { status: WebSocketStatus.Connected });
            this.emit("connect");
            this.messageQueue.forEach((message) => this.send(message));
            this.messageQueue = [];
        }
    }
    stopConnectionAttempt() {
        this.connectionAttempt = null;
    }
    rejectConnectionAttempt() {
        var _a;
        (_a = this.connectionAttempt) === null || _a === void 0 ? void 0 : _a.reject();
        this.connectionAttempt = null;
    }
    checkConnection() {
        var _a;
        // Don’t check the connection when it’s not even established
        if (this.status !== WebSocketStatus.Connected) {
            return;
        }
        // Don’t close the connection while waiting for the first message
        if (!this.lastMessageReceived) {
            return;
        }
        // Don’t close the connection when a message was received recently
        if (this.configuration.messageReconnectTimeout >=
            getUnixTime() - this.lastMessageReceived) {
            return;
        }
        // No message received in a long time, not even your own
        // Awareness updates, which are updated every 15 seconds
        // if awareness is enabled.
        this.closeTries += 1;
        // https://bugs.webkit.org/show_bug.cgi?id=247943
        if (this.closeTries > 2) {
            this.onClose({
                event: {
                    code: 4408,
                    reason: "forced",
                },
            });
            this.closeTries = 0;
        }
        else {
            (_a = this.webSocket) === null || _a === void 0 ? void 0 : _a.close();
            this.messageQueue = [];
        }
    }
    // Ensure that the URL never ends with /
    get serverUrl() {
        while (this.configuration.url[this.configuration.url.length - 1] === "/") {
            return this.configuration.url.slice(0, this.configuration.url.length - 1);
        }
        return this.configuration.url;
    }
    get url() {
        return this.serverUrl;
    }
    disconnect() {
        this.shouldConnect = false;
        if (this.webSocket === null) {
            return;
        }
        try {
            this.webSocket.close();
            this.messageQueue = [];
        }
        catch (e) {
            console.error(e);
        }
    }
    send(message) {
        var _a;
        if (((_a = this.webSocket) === null || _a === void 0 ? void 0 : _a.readyState) === WsReadyStates.Open) {
            this.webSocket.send(message);
        }
        else {
            this.messageQueue.push(message);
        }
    }
    onClose({ event }) {
        this.closeTries = 0;
        this.cleanupWebSocket();
        if (this.connectionAttempt) {
            // That connection attempt failed.
            this.rejectConnectionAttempt();
        }
        // Let’s update the connection status.
        this.status = WebSocketStatus.Disconnected;
        this.emit("status", { status: WebSocketStatus.Disconnected });
        this.emit("disconnect", { event });
        // trigger connect if no retry is running and we want to have a connection
        if (!this.cancelWebsocketRetry && this.shouldConnect) {
            setTimeout(() => {
                this.connect();
            }, this.configuration.delay);
        }
    }
    destroy() {
        this.emit("destroy");
        clearInterval(this.intervals.connectionChecker);
        // If there is still a connection attempt outstanding then we should stop
        // it before calling disconnect, otherwise it will be rejected in the onClose
        // handler and trigger a retry
        this.stopConnectionAttempt();
        this.disconnect();
        this.removeAllListeners();
        this.cleanupWebSocket();
    }
}

/**
 * @module sync-protocol
 */


/**
 * @typedef {Map<number, number>} StateMap
 */

/**
 * Core Yjs defines two message types:
 * • YjsSyncStep1: Includes the State Set of the sending client. When received, the client should reply with YjsSyncStep2.
 * • YjsSyncStep2: Includes all missing structs and the complete delete set. When received, the client is assured that it
 *   received all information from the remote client.
 *
 * In a peer-to-peer network, you may want to introduce a SyncDone message type. Both parties should initiate the connection
 * with SyncStep1. When a client received SyncStep2, it should reply with SyncDone. When the local client received both
 * SyncStep2 and SyncDone, it is assured that it is synced to the remote client.
 *
 * In a client-server model, you want to handle this differently: The client should initiate the connection with SyncStep1.
 * When the server receives SyncStep1, it should reply with SyncStep2 immediately followed by SyncStep1. The client replies
 * with SyncStep2 when it receives SyncStep1. Optionally the server may send a SyncDone after it received SyncStep2, so the
 * client knows that the sync is finished.  There are two reasons for this more elaborated sync model: 1. This protocol can
 * easily be implemented on top of http and websockets. 2. The server should only reply to requests, and not initiate them.
 * Therefore it is necessary that the client initiates the sync.
 *
 * Construction of a message:
 * [messageType : varUint, message definition..]
 *
 * Note: A message does not include information about the room name. This must to be handled by the upper layer protocol!
 *
 * stringify[messageType] stringifies a message definition (messageType is already read from the bufffer)
 */

const messageYjsSyncStep1 = 0;
const messageYjsSyncStep2 = 1;
const messageYjsUpdate = 2;

/**
 * Create a sync step 1 message based on the state of the current shared document.
 *
 * @param {encoding.Encoder} encoder
 * @param {Y.Doc} doc
 */
const writeSyncStep1 = (encoder, doc) => {
  writeVarUint(encoder, messageYjsSyncStep1);
  const sv = Y.encodeStateVector(doc);
  writeVarUint8Array(encoder, sv);
};

/**
 * @param {encoding.Encoder} encoder
 * @param {Y.Doc} doc
 * @param {Uint8Array} [encodedStateVector]
 */
const writeSyncStep2 = (encoder, doc, encodedStateVector) => {
  writeVarUint(encoder, messageYjsSyncStep2);
  writeVarUint8Array(encoder, Y.encodeStateAsUpdate(doc, encodedStateVector));
};

/**
 * Read SyncStep1 message and reply with SyncStep2.
 *
 * @param {decoding.Decoder} decoder The reply to the received message
 * @param {encoding.Encoder} encoder The received message
 * @param {Y.Doc} doc
 */
const readSyncStep1 = (decoder, encoder, doc) =>
  writeSyncStep2(encoder, doc, readVarUint8Array(decoder));

/**
 * Read and apply Structs and then DeleteStore to a y instance.
 *
 * @param {decoding.Decoder} decoder
 * @param {Y.Doc} doc
 * @param {any} transactionOrigin
 */
const readSyncStep2 = (decoder, doc, transactionOrigin) => {
  try {
    Y.applyUpdate(doc, readVarUint8Array(decoder), transactionOrigin);
  } catch (error) {
    // This catches errors that are thrown by event handlers
    console.error('Caught error while handling a Yjs update', error);
  }
};

/**
 * @param {encoding.Encoder} encoder
 * @param {Uint8Array} update
 */
const writeUpdate = (encoder, update) => {
  writeVarUint(encoder, messageYjsUpdate);
  writeVarUint8Array(encoder, update);
};

/**
 * Read and apply Structs and then DeleteStore to a y instance.
 *
 * @param {decoding.Decoder} decoder
 * @param {Y.Doc} doc
 * @param {any} transactionOrigin
 */
const readUpdate = readSyncStep2;

/**
 * @param {decoding.Decoder} decoder A message received from another client
 * @param {encoding.Encoder} encoder The reply message. Does not need to be sent if empty.
 * @param {Y.Doc} doc
 * @param {any} transactionOrigin
 */
const readSyncMessage = (decoder, encoder, doc, transactionOrigin) => {
  const messageType = readVarUint(decoder);
  switch (messageType) {
    case messageYjsSyncStep1:
      readSyncStep1(decoder, encoder, doc);
      break
    case messageYjsSyncStep2:
      readSyncStep2(decoder, doc, transactionOrigin);
      break
    case messageYjsUpdate:
      readUpdate(decoder, doc, transactionOrigin);
      break
    default:
      throw new Error('Unknown message type')
  }
  return messageType
};

class MessageReceiver {
    constructor(message) {
        this.message = message;
    }
    apply(provider, emitSynced) {
        const { message } = this;
        const type = message.readVarUint();
        const emptyMessageLength = message.length();
        switch (type) {
            case MessageType.Sync:
                this.applySyncMessage(provider, emitSynced);
                break;
            case MessageType.Awareness:
                this.applyAwarenessMessage(provider);
                break;
            case MessageType.Auth:
                this.applyAuthMessage(provider);
                break;
            case MessageType.QueryAwareness:
                this.applyQueryAwarenessMessage(provider);
                break;
            case MessageType.Stateless:
                provider.receiveStateless(readVarString(message.decoder));
                break;
            case MessageType.SyncStatus:
                this.applySyncStatusMessage(provider, readVarInt(message.decoder) === 1);
                break;
            case MessageType.CLOSE:
                // eslint-disable-next-line no-case-declarations
                const event = {
                    code: 1000,
                    reason: readVarString(message.decoder),
                    // @ts-ignore
                    target: provider.configuration.websocketProvider.webSocket,
                    type: "close",
                };
                provider.onClose();
                provider.configuration.onClose({ event });
                provider.forwardClose(event);
                break;
            default:
                throw new Error(`Can’t apply message of unknown type: ${type}`);
        }
        // Reply
        if (message.length() > emptyMessageLength + 1) {
            // length of documentName (considered in emptyMessageLength plus length of yjs sync type, set in applySyncMessage)
            // @ts-ignore
            provider.send(OutgoingMessage, { encoder: message.encoder });
        }
    }
    applySyncMessage(provider, emitSynced) {
        const { message } = this;
        message.writeVarUint(MessageType.Sync);
        // Apply update
        const syncMessageType = readSyncMessage(message.decoder, message.encoder, provider.document, provider);
        // Synced once we receive Step2
        if (emitSynced && syncMessageType === messageYjsSyncStep2) {
            provider.synced = true;
        }
    }
    applySyncStatusMessage(provider, applied) {
        if (applied) {
            provider.decrementUnsyncedChanges();
        }
    }
    applyAwarenessMessage(provider) {
        if (!provider.awareness)
            return;
        const { message } = this;
        applyAwarenessUpdate(provider.awareness, message.readVarUint8Array(), provider);
    }
    applyAuthMessage(provider) {
        const { message } = this;
        readAuthMessage(message.decoder, provider.sendToken.bind(provider), provider.permissionDeniedHandler.bind(provider), provider.authenticatedHandler.bind(provider));
    }
    applyQueryAwarenessMessage(provider) {
        if (!provider.awareness)
            return;
        const { message } = this;
        message.writeVarUint(MessageType.Awareness);
        message.writeVarUint8Array(encodeAwarenessUpdate(provider.awareness, Array.from(provider.awareness.getStates().keys())));
    }
}

class MessageSender {
    constructor(Message, args = {}) {
        this.message = new Message();
        this.encoder = this.message.get(args);
    }
    create() {
        return toUint8Array(this.encoder);
    }
    send(webSocket) {
        webSocket === null || webSocket === void 0 ? void 0 : webSocket.send(this.create());
    }
}

class AuthenticationMessage extends OutgoingMessage {
    constructor() {
        super(...arguments);
        this.type = MessageType.Auth;
        this.description = "Authentication";
    }
    get(args) {
        if (typeof args.token === "undefined") {
            throw new Error("The authentication message requires `token` as an argument.");
        }
        writeVarString(this.encoder, args.documentName);
        writeVarUint(this.encoder, this.type);
        writeAuthentication(this.encoder, args.token);
        return this.encoder;
    }
}

class AwarenessMessage extends OutgoingMessage {
    constructor() {
        super(...arguments);
        this.type = MessageType.Awareness;
        this.description = "Awareness states update";
    }
    get(args) {
        if (typeof args.awareness === "undefined") {
            throw new Error("The awareness message requires awareness as an argument");
        }
        if (typeof args.clients === "undefined") {
            throw new Error("The awareness message requires clients as an argument");
        }
        writeVarString(this.encoder, args.documentName);
        writeVarUint(this.encoder, this.type);
        let awarenessUpdate;
        if (args.states === undefined) {
            awarenessUpdate = encodeAwarenessUpdate(args.awareness, args.clients);
        }
        else {
            awarenessUpdate = encodeAwarenessUpdate(args.awareness, args.clients, args.states);
        }
        writeVarUint8Array(this.encoder, awarenessUpdate);
        return this.encoder;
    }
}

class StatelessMessage extends OutgoingMessage {
    constructor() {
        super(...arguments);
        this.type = MessageType.Stateless;
        this.description = "A stateless message";
    }
    get(args) {
        var _a;
        writeVarString(this.encoder, args.documentName);
        writeVarUint(this.encoder, this.type);
        writeVarString(this.encoder, (_a = args.payload) !== null && _a !== void 0 ? _a : "");
        return this.encoder;
    }
}

class SyncStepOneMessage extends OutgoingMessage {
    constructor() {
        super(...arguments);
        this.type = MessageType.Sync;
        this.description = "First sync step";
    }
    get(args) {
        if (typeof args.document === "undefined") {
            throw new Error("The sync step one message requires document as an argument");
        }
        writeVarString(this.encoder, args.documentName);
        writeVarUint(this.encoder, this.type);
        writeSyncStep1(this.encoder, args.document);
        return this.encoder;
    }
}

class UpdateMessage extends OutgoingMessage {
    constructor() {
        super(...arguments);
        this.type = MessageType.Sync;
        this.description = "A document update";
    }
    get(args) {
        writeVarString(this.encoder, args.documentName);
        writeVarUint(this.encoder, this.type);
        writeUpdate(this.encoder, args.update);
        return this.encoder;
    }
}

class AwarenessError extends Error {
    constructor() {
        super(...arguments);
        this.code = 1001;
    }
}
class HocuspocusProvider extends EventEmitter {
    constructor(configuration) {
        var _a, _b, _c;
        super();
        this.configuration = {
            name: "",
            // @ts-ignore
            document: undefined,
            // @ts-ignore
            awareness: undefined,
            token: null,
            forceSyncInterval: false,
            onAuthenticated: () => null,
            onAuthenticationFailed: () => null,
            onOpen: () => null,
            onConnect: () => null,
            onMessage: () => null,
            onOutgoingMessage: () => null,
            onSynced: () => null,
            onStatus: () => null,
            onDisconnect: () => null,
            onClose: () => null,
            onDestroy: () => null,
            onAwarenessUpdate: () => null,
            onAwarenessChange: () => null,
            onStateless: () => null,
            onUnsyncedChanges: () => null,
        };
        this.isSynced = false;
        this.unsyncedChanges = 0;
        this.isAuthenticated = false;
        this.authorizedScope = undefined;
        // @internal
        this.manageSocket = false;
        this._isAttached = false;
        this.intervals = {
            forceSync: null,
        };
        this.boundDocumentUpdateHandler = this.documentUpdateHandler.bind(this);
        this.boundAwarenessUpdateHandler = this.awarenessUpdateHandler.bind(this);
        this.boundPageHide = this.pageHide.bind(this);
        this.boundOnOpen = this.onOpen.bind(this);
        this.boundOnClose = this.onClose.bind(this);
        this.forwardConnect = () => this.emit("connect");
        this.forwardStatus = (e) => this.emit("status", e);
        this.forwardClose = (e) => this.emit("close", e);
        this.forwardDisconnect = (e) => this.emit("disconnect", e);
        this.forwardDestroy = () => this.emit("destroy");
        this.setConfiguration(configuration);
        this.configuration.document = configuration.document
            ? configuration.document
            : new Y.Doc();
        this.configuration.awareness =
            configuration.awareness !== undefined
                ? configuration.awareness
                : new Awareness(this.document);
        this.on("open", this.configuration.onOpen);
        this.on("message", this.configuration.onMessage);
        this.on("outgoingMessage", this.configuration.onOutgoingMessage);
        this.on("synced", this.configuration.onSynced);
        this.on("destroy", this.configuration.onDestroy);
        this.on("awarenessUpdate", this.configuration.onAwarenessUpdate);
        this.on("awarenessChange", this.configuration.onAwarenessChange);
        this.on("stateless", this.configuration.onStateless);
        this.on("unsyncedChanges", this.configuration.onUnsyncedChanges);
        this.on("authenticated", this.configuration.onAuthenticated);
        this.on("authenticationFailed", this.configuration.onAuthenticationFailed);
        (_a = this.awareness) === null || _a === void 0 ? void 0 : _a.on("update", () => {
            this.emit("awarenessUpdate", {
                states: awarenessStatesToArray(this.awareness.getStates()),
            });
        });
        (_b = this.awareness) === null || _b === void 0 ? void 0 : _b.on("change", () => {
            this.emit("awarenessChange", {
                states: awarenessStatesToArray(this.awareness.getStates()),
            });
        });
        this.document.on("update", this.boundDocumentUpdateHandler);
        (_c = this.awareness) === null || _c === void 0 ? void 0 : _c.on("update", this.boundAwarenessUpdateHandler);
        this.registerEventListeners();
        if (this.configuration.forceSyncInterval &&
            typeof this.configuration.forceSyncInterval === "number") {
            this.intervals.forceSync = setInterval(this.forceSync.bind(this), this.configuration.forceSyncInterval);
        }
        if (this.manageSocket) {
            this.attach();
        }
    }
    setConfiguration(configuration = {}) {
        if (!configuration.websocketProvider) {
            const websocketProviderConfig = configuration;
            this.manageSocket = true;
            this.configuration.websocketProvider = new HocuspocusProviderWebsocket({
                url: websocketProviderConfig.url,
            });
        }
        this.configuration = { ...this.configuration, ...configuration };
    }
    get document() {
        return this.configuration.document;
    }
    get isAttached() {
        return this._isAttached;
    }
    get awareness() {
        return this.configuration.awareness;
    }
    get hasUnsyncedChanges() {
        return this.unsyncedChanges > 0;
    }
    resetUnsyncedChanges() {
        this.unsyncedChanges = 1;
        this.emit("unsyncedChanges", { number: this.unsyncedChanges });
    }
    incrementUnsyncedChanges() {
        this.unsyncedChanges += 1;
        this.emit("unsyncedChanges", { number: this.unsyncedChanges });
    }
    decrementUnsyncedChanges() {
        if (this.unsyncedChanges > 0) {
            this.unsyncedChanges -= 1;
        }
        if (this.unsyncedChanges === 0) {
            this.synced = true;
        }
        this.emit("unsyncedChanges", { number: this.unsyncedChanges });
    }
    forceSync() {
        this.resetUnsyncedChanges();
        this.send(SyncStepOneMessage, {
            document: this.document,
            documentName: this.configuration.name,
        });
    }
    pageHide() {
        if (this.awareness) {
            removeAwarenessStates(this.awareness, [this.document.clientID], "page hide");
        }
    }
    registerEventListeners() {
        if (typeof window === "undefined" || !("addEventListener" in window)) {
            return;
        }
        window.addEventListener("pagehide", this.boundPageHide);
    }
    sendStateless(payload) {
        this.send(StatelessMessage, {
            documentName: this.configuration.name,
            payload,
        });
    }
    async sendToken() {
        let token;
        try {
            token = await this.getToken();
        }
        catch (error) {
            this.permissionDeniedHandler(`Failed to get token during sendToken(): ${error}`);
            return;
        }
        this.send(AuthenticationMessage, {
            token: token !== null && token !== void 0 ? token : "",
            documentName: this.configuration.name,
        });
    }
    documentUpdateHandler(update, origin) {
        if (origin === this) {
            return;
        }
        this.incrementUnsyncedChanges();
        this.send(UpdateMessage, { update, documentName: this.configuration.name });
    }
    awarenessUpdateHandler({ added, updated, removed }, origin) {
        const changedClients = added.concat(updated).concat(removed);
        this.send(AwarenessMessage, {
            awareness: this.awareness,
            clients: changedClients,
            documentName: this.configuration.name,
        });
    }
    /**
     * Indicates whether a first handshake with the server has been established
     *
     * Note: this does not mean all updates from the client have been persisted to the backend. For this,
     * use `hasUnsyncedChanges`.
     */
    get synced() {
        return this.isSynced;
    }
    set synced(state) {
        if (this.isSynced === state) {
            return;
        }
        this.isSynced = state;
        if (state) {
            this.emit("synced", { state });
        }
    }
    receiveStateless(payload) {
        this.emit("stateless", { payload });
    }
    // not needed, but provides backward compatibility with e.g. lexical/yjs
    async connect() {
        if (this.manageSocket) {
            return this.configuration.websocketProvider.connect();
        }
        console.warn("HocuspocusProvider::connect() is deprecated and does not do anything. Please connect/disconnect on the websocketProvider, or attach/deattach providers.");
    }
    disconnect() {
        if (this.manageSocket) {
            return this.configuration.websocketProvider.disconnect();
        }
        console.warn("HocuspocusProvider::disconnect() is deprecated and does not do anything. Please connect/disconnect on the websocketProvider, or attach/deattach providers.");
    }
    async onOpen(event) {
        this.isAuthenticated = false;
        this.emit("open", { event });
        await this.sendToken();
        this.startSync();
    }
    async getToken() {
        if (typeof this.configuration.token === "function") {
            const token = await this.configuration.token();
            return token;
        }
        return this.configuration.token;
    }
    startSync() {
        this.resetUnsyncedChanges();
        this.send(SyncStepOneMessage, {
            document: this.document,
            documentName: this.configuration.name,
        });
        if (this.awareness && this.awareness.getLocalState() !== null) {
            this.send(AwarenessMessage, {
                awareness: this.awareness,
                clients: [this.document.clientID],
                documentName: this.configuration.name,
            });
        }
    }
    send(message, args) {
        if (!this._isAttached)
            return;
        const messageSender = new MessageSender(message, args);
        this.emit("outgoingMessage", { message: messageSender.message });
        messageSender.send(this.configuration.websocketProvider);
    }
    onMessage(event) {
        const message = new IncomingMessage(event.data);
        const documentName = message.readVarString();
        message.writeVarString(documentName);
        this.emit("message", { event, message: new IncomingMessage(event.data) });
        new MessageReceiver(message).apply(this, true);
    }
    onClose() {
        this.isAuthenticated = false;
        this.synced = false;
        // update awareness (all users except local left)
        if (this.awareness) {
            removeAwarenessStates(this.awareness, Array.from(this.awareness.getStates().keys()).filter((client) => client !== this.document.clientID), this);
        }
    }
    destroy() {
        this.emit("destroy");
        if (this.intervals.forceSync) {
            clearInterval(this.intervals.forceSync);
        }
        if (this.awareness) {
            removeAwarenessStates(this.awareness, [this.document.clientID], "provider destroy");
            this.awareness.off("update", this.boundAwarenessUpdateHandler);
            this.awareness.destroy();
        }
        this.document.off("update", this.boundDocumentUpdateHandler);
        this.removeAllListeners();
        this.detach();
        if (this.manageSocket) {
            this.configuration.websocketProvider.destroy();
        }
        if (typeof window === "undefined" || !("removeEventListener" in window)) {
            return;
        }
        window.removeEventListener("pagehide", this.boundPageHide);
    }
    detach() {
        this.configuration.websocketProvider.off("connect", this.configuration.onConnect);
        this.configuration.websocketProvider.off("connect", this.forwardConnect);
        this.configuration.websocketProvider.off("status", this.forwardStatus);
        this.configuration.websocketProvider.off("status", this.configuration.onStatus);
        this.configuration.websocketProvider.off("open", this.boundOnOpen);
        this.configuration.websocketProvider.off("close", this.boundOnClose);
        this.configuration.websocketProvider.off("close", this.configuration.onClose);
        this.configuration.websocketProvider.off("close", this.forwardClose);
        this.configuration.websocketProvider.off("disconnect", this.configuration.onDisconnect);
        this.configuration.websocketProvider.off("disconnect", this.forwardDisconnect);
        this.configuration.websocketProvider.off("destroy", this.configuration.onDestroy);
        this.configuration.websocketProvider.off("destroy", this.forwardDestroy);
        this.configuration.websocketProvider.detach(this);
        this._isAttached = false;
    }
    attach() {
        if (this._isAttached)
            return;
        this.configuration.websocketProvider.on("connect", this.configuration.onConnect);
        this.configuration.websocketProvider.on("connect", this.forwardConnect);
        this.configuration.websocketProvider.on("status", this.configuration.onStatus);
        this.configuration.websocketProvider.on("status", this.forwardStatus);
        this.configuration.websocketProvider.on("open", this.boundOnOpen);
        this.configuration.websocketProvider.on("close", this.boundOnClose);
        this.configuration.websocketProvider.on("close", this.configuration.onClose);
        this.configuration.websocketProvider.on("close", this.forwardClose);
        this.configuration.websocketProvider.on("disconnect", this.configuration.onDisconnect);
        this.configuration.websocketProvider.on("disconnect", this.forwardDisconnect);
        this.configuration.websocketProvider.on("destroy", this.configuration.onDestroy);
        this.configuration.websocketProvider.on("destroy", this.forwardDestroy);
        this.configuration.websocketProvider.attach(this);
        this._isAttached = true;
    }
    permissionDeniedHandler(reason) {
        this.emit("authenticationFailed", { reason });
        this.isAuthenticated = false;
    }
    authenticatedHandler(scope) {
        this.isAuthenticated = true;
        this.authorizedScope = scope;
        this.emit("authenticated", { scope });
    }
    setAwarenessField(key, value) {
        if (!this.awareness) {
            throw new AwarenessError(`Cannot set awareness field "${key}" to ${JSON.stringify(value)}. You have disabled Awareness for this provider by explicitly passing awareness: null in the provider configuration.`);
        }
        this.awareness.setLocalStateField(key, value);
    }
}

export { AwarenessError, HocuspocusProvider, HocuspocusProviderWebsocket, MessageType, WebSocketStatus };
//# sourceMappingURL=hocuspocus-provider.esm.js.map
