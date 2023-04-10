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

'use strict'
var V = require('ssb-validate')
var timestamp = require('monotonic-timestamp')
var Obv = require('obv')
var u = require('./util')
var {box, unbox: _unbox} = require('./autobox')
const {Pool} = require("pg");

module.exports = function (keys, opts) {
    var caps = (opts && opts.caps) || {}
    var hmacKey = caps.sign

    var state = V.initial()

    // lets monkey patch ssb-validate for our relay needs:
    // no sequence validation !
    // no previous check !
    var ref = require('ssb-ref')
    V.checkInvalidCheap = function (state, msg) {
        //the message is just invalid
        if (!ref.isFeedId(msg.author))
            return new Error('invalid message: must have author')
        if (!V.isSigMatchesCurve(msg))
            return new Error('invalid message: signature type must match author type')
        return V.isInvalidShape(msg)
    }

    var flush = new u.AsyncJobQueue() // doesn't currenlty use async-done

    var boxers = []
    var unboxers = []
    var unbox = _unbox.withCache()
    // NOTE unbox.withCache needs to be instantiated *inside* this scope
    // otherwise the cache is shared across instances!

    var setup = {
        validators: new u.AsyncJobQueue(),
        unboxers: new u.AsyncJobQueue(),
        boxers: new u.AsyncJobQueue()
    }

    function waitForValidators(fn) {
        return function (...args) {
            setup.validators.runAll(() => fn(...args))
        }
    }

    function waitForUnboxers(fn) {
        return function (...args) {
            setup.unboxers.runAll(() => fn(...args))
        }
    }

    function waitForBoxers(fn) {
        return function (...args) {
            setup.boxers.runAll(() => fn(...args))
        }
    }

    const unboxerMap = waitForUnboxers((msg, cb) => {
        try {
            cb(null, unbox(msg, null, unboxers))
        } catch (err) {
            cb(err)
        }
    })
    const maps = [unboxerMap]
    const chainMaps = (val, cb) => {
        // assumes `maps.length >= 1`
        if (maps.length === 1) {
            maps[0](val, cb)
        } else {
            let idx = -1 // haven't entered the chain yet
            const next = (err, val) => {
                idx += 1
                if (err || idx === maps.length) {
                    cb(err, val)
                } else {
                    maps[idx](val, next)
                }
            }
            next(null, val)
        }
    }


    var db = {}

//  var append = db.rawAppend = db.append

    db.post = Obv()

    let writing = false

    const credentials = {
        user: "ssb",
        host: "localhost",
        database: "ssb",
        password: "ssb",
        port: 5432,
    };

    db.pool = new Pool(credentials);

    async function insertMessage(pool, message) {
        const text = `
      INSERT INTO message (message)
      VALUES ($1) ON CONFLICT DO NOTHING
    `;

        let result;
        var client = await pool.connect()
        try {
            result = await client.query(text, [message]);
        } finally {
            client.release()

        }
        return result;
    }

    //var append = db.rawAppend = db.insertMessage

    const write = () => {
        writing = true
        // Very defensive: Is this necessary? I don't know whether it's possible
        // for another function to `state.queue.push()` between these two lines.
        const batch = state.queue.slice()
        state.queue = state.queue.slice(batch.length)

        //append(batch, function (err) {
        // Previously this error wasn't being caught anywhere. :(
        // New behavior: if a write fails, crash loudly and throw an error.
        //if (err) throw err

        // If we have new messages in the queue, write them!
        // Otherwise, run all callbacks added via `flush.add()`
        if (state.queue.length) {
            write()
        } else {
            writing = false
            flush.runAll()
        }

        // Update the observable
        batch.forEach(async function (data) {
            insertMessage(db.pool, data)
            db.post.set(u.originalData(data))
        })
        //})
    }

    const queue = (message, cb) => {
        try {
            // SSB-Validate mutates `state` internally.
            V.append(state, hmacKey, message)
            cb(null, state.queue[state.queue.length - 1])
            if (writing === false) {
                write()
            }
        } catch (e) {
            cb(e)
        }
    }

    db.queue = waitForValidators(queue)

    const getFeedState = (feedId) => {
        const feedState = state.feeds[feedId]
        if (!feedState) return {id: null, sequence: 0}
        // NOTE this covers the case where you have a brand new feed (or new createFeed)

        // Remove vestigial properties like 'timestamp'
        return {
            id: feedState.id,
            sequence: feedState.sequence
        }
    }
    db.getFeedState = waitForValidators((feedId, cb) => {
        cb(null, getFeedState(feedId))
    })

    db.append = waitForBoxers(waitForValidators(function dbAppend(opts, cb) {
        try {
            const feedState = getFeedState(opts.keys.id)
            const content = box(opts.content, boxers, feedState)
            var msg = V.create(
                state.feeds[opts.keys.id],
                opts.keys,
                opts.hmacKey || hmacKey,
                content,
                timestamp()
            )
        } catch (err) {
            return cb(err)
        }

        queue(msg, function (err, message) {
            if (err) return cb(err)
            flush.add(() => cb(null, message))
        })
    }))

    db.flush = function dbFlush(cb) {
        if (state.queue.length === 0 && writing === false) cb()
        else flush.add(() => cb())
    }

    db.addMap = function (fn) {
        maps.push(fn)
    }

    db.addBoxer = function addBoxer(boxer) {
        if (typeof boxer === 'function') return db.addBoxer({value: boxer})
        if (typeof boxer.value !== 'function') throw new Error('invalid boxer')

        if (boxer.init) {
            setup.boxers.add(boxer.init)
            setup.boxers.runAll()
        }

        boxers.push(boxer.value)
    }

    db.addUnboxer = function addUnboxer(unboxer) {
        if (typeof unboxer === 'function') {
            unboxers.push(unboxer)
            return
        }

        if (typeof unboxer.key !== 'function') throw new Error('invalid unboxer')
        if (typeof unboxer.value !== 'function') throw new Error('invalid unboxer')
        if (unboxer.init && typeof unboxer.value !== 'function') throw new Error('invalid unboxer')

        if (unboxer.init) {
            setup.unboxers.add(unboxer.init)
            setup.unboxers.runAll()
        }
        unboxers.push(unboxer)
    }

    db._unbox = function dbUnbox(msg, msgKey) {
        return unbox(msg, msgKey, unboxers)
    }

    setup.validators.runAll()

    return db
}