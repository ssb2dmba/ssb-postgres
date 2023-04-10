'use strict'


var tape = require('tape')
var pull = require('pull-stream')
var crypto = require('crypto')
var util = require('util')
var poolModule = require('../pool')

var createSSB = require('./util/create-ssb')
const {promisify} = require("util");


function run(opts) {

    var ssb = createSSB('test-ssb-add', {})
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    tape('before', async function (t) {
        await sleep(1000)
    })


    tape('append (bulk)', (t) => {

        // We write 7919 messages, which should be bigger than any cache. It's also a
        // prime number and shouldn't line up perfectly with any batch sizes.
        const messages = 7919

        const assertsPerMessage = 4
        const plan = messages * assertsPerMessage
        var pass = 0

        function testEqual(a, b) {
            if (a !== b) {
                process.stdout.write('\n')
                t.equal(a, b)
                return
            }
            pass += 1
        }

        Promise.all([...new Array(messages)].map(async (_, i) => {
            const entry = await promisify(ssb.publish)({type: 'test'})
            process.stdout.write('.')

            testEqual(typeof entry, 'object')
            testEqual(typeof entry.key, 'string')
            testEqual(typeof entry.value, 'object')
            testEqual(entry.value.sequence, i + 1)
        })).then(() => {
            process.stdout.write('\n')
            t.equal(pass, plan, 'passed all tests')
            t.end()
            ssb.close()
        })
    })


    tape('before', async function (t) {
        await sleep(1000)
    })

    tape('append (read back)', function (t) {
        let seq = -1
        let i = 0
        //console.log(ssb.id)
        //ssb.id = "@GADT/XIHJBTQD64OADoxVd6RJjz+OFbHNO9fkllH/1A=.ed25519"
        pull(
            ssb.createHistoryStream({id: ssb.id}),
            pull.drain(function (msg) {
                if (msg.value.sequence < seq) {
                    t.fail('messages out of order ' + msg.value.sequence + " " + seq)
                }
                seq = msg.value.sequence
                i++;
                console.log(i, seq)
            }, function (err) {
                if (err) throw err
                t.equals(i,100)
                t.end()
            })
        )
        //t.end()
    })

}

run()
