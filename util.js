/**

 Copyright (c) 2014 Dominic Tarr

 Permission is hereby granted, free of charge,
 to any person obtaining a copy of this software and
 associated documentation files (the "Software"), to
 deal in the Software without restriction, including
 without limitation the rights to use, copy, modify,
 merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom
 the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice
 shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
 ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */
var Map = require('pull-stream/throughs/map')
const cloneDeep = require('lodash.clonedeep')

// opts standardized to work like levelup api
function stdopts(opts) {
    opts = opts || {}
    opts.keys = opts.keys !== false // default keys to true
    opts.values = opts.values !== false // default values to true
    return opts
}

function msgFmt(keys, values, obj) {
    if (keys && values) {
        return obj
    }
    if (keys) {
        return obj.key
    }
    if (values) {
        return obj.value
    }
    return null // i guess?
}

exports.options = stdopts
exports.format = msgFmt

exports.lo = null
exports.hi = undefined

exports.wait = function () {
    var waiting = []
    var value
    return {
        get: function () {
            return value
        },
        set: function (_value) {
            value = _value

            var l = waiting.length
            for (var i = 0; i < l; ++i) {
                waiting[i](null, value)
            }
            waiting = waiting.slice(l)
        },
        wait: function (cb) {
            if (value !== undefined) cb(null, value)
            else waiting.push(cb)
        }
    }
}

/**
 * The magic behind `originalData()` and `originalValue()`, this function
 * mutates the actual data and **will cause problems** unless you pass a copy
 * of your message to this function. Anything you pass to this function will be
 * mutated. Do not reuse the message after passing it here!
 *
 * This method exists because it would have been wasteful to have both
 * `originalData()` and `originalValue()` make copies of the object, since the
 * `originalData()` function used to pass directly to `originalValue()`.
 *
 * @param {object} value - a copy of your 'value', not the original
 *
 * @returns {object} the original message value
 */
const mutateValue = function (value) {
    var copy = {}
    for (let key in value) {
        if (key !== 'meta' && key !== 'cyphertext' && key !== 'private' && key !== 'unbox') {
            copy[key] = value[key]
        }
    }

    if (value.meta && value.meta.original) {
        for (let key in value.meta.original) {
            copy[key] = value.meta.original[key]
        }
    }
    return copy
}

/**
 * Remove metadata from a message value and replace it with the original
 * content (if any) found in `value.meta.original`. This also deletes the
 * deprecated `value.private` and such, which still exists for backward-compat.
 *
 * @param {object} data - `value` property from message object
 *
 * @todo Delete unboxer metadata, which exists for backward-compatibility.
 *
 * @returns {object} the original message value, extracted from `value.meta.original`
 */
const originalValue = exports.originalValue = function (value) {
    return mutateValue(cloneDeep(value))
}

/**
 * Remove metadata from messages and return *only* the original message, ready
 * for replication or cryptographic verification.
 *
 * @param {object} data - message object with `key` and `value` properties
 *
 * @returns {object} the original data, extracted from `data.value.meta.original`
 */
var originalData = exports.originalData = function (data) {
    const clone = cloneDeep(data)
    clone.value = mutateValue(clone.value)
    return clone
}

/**
 * Used to make modifications to values during streams, which is dependent on
 * the `isOriginal` param. If `isOriginal` is truthy, then it passes each `msg`
 * to `originalData()` and each `msg.value` to `originalValue()`.
 *
 * Usually `isOriginal` will be falsy, but if you need to hash or replicate the
 * value from the stream then you should make sure that `isOriginal` is set to
 * true. For example, most of the time you want private messages to be unboxed
 * (decrypted), but if you're replicating those values to another peer then
 * it's important to make sure that `isOriginal` is truthy.
 *
 * @param {boolean} keys       - whether keys will be passed through the stream
 * @param {boolean} values     - whether values will be passed through the stream
 * @param {boolean} isOriginal - whether you want *only* the original data
 *
 * @returns {function} a function that can be used to map over a stream
 */
exports.Format = exports.formatStream = function (keys, values, isPrivate) {
    let extract

    if (isPrivate === true) {
        extract = data => {
            return keys && values
                ? data.value
                : keys
                    ? data.value.key
                    : data.value.value
        }
    } else {
        extract = data => {
            return data
        }
    }

    return Map(function (data) {
        if (data.sync) return data
        return extract(data)
    })
}

/**
 * Backs up a value from `msg.value` to `msg.value.meta.original` in a simple
 * and idiomatic way. This works regardless of whether `msg.value.meta` exists
 * and should be used any time values are modified with `addMap()`.
 *
 * @param {object} msgValue - the `value` property of a message (usually `msg.value`)
 * @param {string} property - name property that should be backed up
 *
 * @example
 * metaBackup({ type: 'post', content: 'hello world', 'content')
 * // => { meta: { original: { content: 'hello world' } } }
 *
 * @example
 * var msg = { value: { type: 'post', content: 'bar' } }
 * msg.value.meta = metaBackup(msg.value, 'content')
 * msg.value.content = 'foo was here'
 * msg.value.meta.original.content // => 'bar'
 *
 * @return {object}  a `meta` object with the property backed up.
 */
exports.metaBackup = (msgValue, property) => {
    const original = {[property]: msgValue[property]}

    if (!msgValue.meta) {
        msgValue.meta = {original}
    } else if (!msgValue.meta.original) {
        msgValue.meta.original = original
    } else if (!msgValue.meta.original[property]) {
        msgValue.meta.original[property] = original[property]
    }

    return msgValue.meta
}

exports.AsyncJobQueue = class AsyncJobQueue {
    constructor() {
        this.queue = []
        this.running = 0
        this.callbacks = []
    }

    add(fn) {
        if (typeof fn !== 'function') throw new Error('JobQueue#add expects a function')
        this.queue.push(fn)
        return this
    }

    runAll(done = noop) {
        if (this.isEmpty()) return done()
        if (typeof done !== 'function') throw new Error('AsyncJobQueue extpents "done" callback function')

        const batch = this.queue
        this.queue = []

        this.callbacks.push(done)

        for (var job of batch) {
            this.running++
            job(() => {
                this.running--
                this._runCallbacks()
            })
        }
    }

    _runCallbacks() {
        if (this.running) return

        var n = this.callbacks.length

        for (var i = 0; i < n; i++) {
            this.callbacks[i]()
        }
        this.callbacks = this.callbacks.slice(n)
    }

    isEmpty() {
        return this.queue.length === 0 && this.running === 0
    }
}

function noop() {
}
