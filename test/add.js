'use strict'

// require('leaked-handles').set({
//   fullStack: true, // use full stack traces
//   timeout: 3000, // run every 30 seconds instead of 5.
//   debugSockets: true // pretty print tcp thrown exceptions.
// });

var tape = require('tape')
var util = require('util')
var poolModule = require('../pool')

var createSSB = require('./util/create-ssb')


function run(opts) {

    var ssb = createSSB('test-ssb-add', {})
    var pool = poolModule(ssb).pool


    async function cleanup(pool) {
        //var client = await pool.connect()
        const text = "delete from message"
        return await pool.query(text, []);
    }

    async function selectMessage(pool, key) {
        var client = await pool.connect()
        const text = "select message from message where message->>'key'= ($1)"
        return pool.query(text, [key]);
    }


    tape('before all', async function (t) {
        await cleanup(ssb.pool)
    });

    /** */
    tape('relays clients can publish valid messages', function (t) {
        var msgok = {
            previous: null,
            sequence: 1,
            author: '@KCVI8M94yVsMkHyLoYiihNWUHwXGFXOsIzRjxXz6maI=.ed25519',
            timestamp: 1680885935203,
            hash: 'sha256',
            content: {text: 'Yyjh', type: 'post'},
            signature: 'Nrykw5EFQSFbWzZqHKv1hlhEG/DbDbcWGLl+wfxn83Br4yMi5ITmfhjVbHKBd0fki3g7ej4Rddudk7EcO/1nDA==.sig.ed25519'
        }

        ssb.add(msgok, async function (err, msg) {
            if (err) t.error()
            let result = await selectMessage(pool, "%vEJYxLbRXclTzW6mEiEXga/h4rYSuKJIsUKryxSVZcA=.sha256")
            t.equal(result.rowCount, 1, "must have one and only one message")
            t.deepEqual(result.rows[0].message.value, msgok, "message must be the same")
            t.end()
        })
    })


    tape('relays clients cannot publish messages with invalid signature', function (t) {
        var msgok = {
            previous: null,
            sequence: 1,
            author: '@KCVI8M94yVsMkHyLoYiihNWUHwXGFXOsIzRjxXz6maI=.ed25519',
            timestamp: 1680885935203,
            hash: 'sha256',
            content: {text: 'cause invalid signature', type: 'post'},
            signature: 'Nrykw5EFQSFbWzZqHKv1hlhEG/DbDbcWGLl+wfxn83Br4yMi5ITmfhjVbHKBd0fki3g7ej4Rddudk7EcO/1nDA==.sig.ed25519'
        }

        ssb.add(msgok, async function (err, msg) {
            if (err) t.error()
            t.equals("invalid signature", err.message)
            t.end()
        })
    })


    tape("something", function (t) {
        ssb.publish({
            type: 'contact',
            contact: '@KCVI8M94yVsMkHyLoYiihNWUHwXGFXOsIzRjxXz6maI=.ed25519',
            following: true,
            pub: true,
            note: undefined
        }, async function (err, msg, key) {
            if (err) t.err(err)
            t.end()
            //t.fail()
        });
    });


    tape('add (invalid message)', function (t) {
        ssb.add({}, function (err) {
            t.ok(err)
            t.end()
        })
    })

    tape('add (null message)', function (t) {
        ssb.add(null, function (err) {
            t.ok(err)
            t.end()
        })
    })


    tape('add okay message', function (t) {
        ssb.publish({type: 'okay'}, function (err, msg) {
            if (err) throw err
            setImmediate(() => {
                ssb.get(msg.key, function (err, _msg) {
                    if (err) throw err
                    t.deepEqual(_msg, msg.value)

                    ssb.get({id: msg.key, meta: true}, function (_, _msg2) {
                        t.deepEqual(_msg2, msg.value)
                        ssb.publish({type: 'wtf'}, function (err, msg) {
                            if (err) throw err
                            setImmediate(() => {
                                ssb.get(msg.key, function (err, _msg) {
                                    if (err) throw err
                                    t.deepEqual(_msg, msg.value)
                                    t.end()
                                })
                            })
                        })
                    })
                })
            })

        })
    })


    tape('publish does not store invalid messages', function (t) {
        var msgok = {
            "previous": "%11J4JcYTzJy6a5Tlk9ZKxiCMQEupNuNs747Ktemo2d0=.sha256",
            "sequence": 1,
            "author": "@YpSbE5/7oWuf7k6zhU/wwbm28EffUggYEwVpDkOAdIg=.ed25519",
            "timestamp": 1673170497023,
            "hash": "sha256",
            "content": {
                "text": "NEWTEST 2",
                "type": "post"
            },
            "signature": "KlEVtD4E221mJibhXuZCQ15BrsnNNHruepucHqvYnJVvw8UJgl5sL1QPGMATnP7KlkzM3SirUf4/19DkT+4sDQ==.sig.ed25519"
        }

        ssb.publish(msgok, async function (err, msg, key) {
            if (err) t.error()
            let result = await selectMessage(pool, "%fH6ZETSgkMAvxbMO8aAz1h8rNLO4lKoWMTtmxZZag/A=.sha256")
            t.equal(result.rowCount, 0, "must store message with invalid signature")
            t.end()
        })
    })


    tape('get works with promisify', function (t) {
        ssb.publish({type: 'okay'}, function (err, msg) {
            t.error(err)
            console.log(msg.key)
            t.equal(msg.value.content.type, 'okay')
            setTimeout(() => {
                util.promisify(ssb.get)(msg.key).then(msgVal => {
                    t.deepEqual(msgVal, msg.value)
                    t.end()
                })
            }, 0)

        })
    })


    tape.onFinish(function () {
        pool.end()
    })
}

run()
