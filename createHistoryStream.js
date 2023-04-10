/*
 * This file is part of the ssb-postgres distribution (https://github.com/ssb2dmba/ssb-postgres).
 * Copyright (c) 2023 DMBA Emmanuel Florent.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

const u = require('./util');
const QueryStream = require('pg-query-stream')
const pull = require('pull-stream');

module.exports = function implementation(db) {


    const clients = [];

    function _connect(pool, cb) {
        pool.connect().then((client) => {
            clients.push(client)
            if (cb) cb(client)
        })
    }

    _connect(db.pool)


    const _createHistoryStream = function (streamOpts, client, done) {


        function _connect(pool) {
            return new Promise((resolve, reject) => {
                pool.connect().then((client) => {
                    resolve(client)
                })
                    .catch(err => {
                        reject(err)
                    })
            });
        }
        var suspendable = async function defn(params) {
            return await _connect(db.pool)
        }

        const opts = u.options(streamOpts)
        const id = opts.id;
        const seq = opts.sequence || opts.seq || 0;
        const limit = opts.limit || 100;
        const keys = opts.keys;
        const values = opts.values;

        // stream state
        let buffer = [], cbs = [], ended, paused = false;

        const query = `
      SELECT 
        message 
      FROM 
        message 
      WHERE 
        message->'value'->>'author' = ($1) 
        AND  (message->'value'->>'sequence')::int > ($2)
        ORDER BY message->'value'->'sequence' ASC 
        LIMIT ($3)
      `;

        const queryStream = new QueryStream(query, [id, seq, limit], {
            batchSize: 3,
        });

        const stream = client.query(queryStream);

        // Drain buffer and unpause stream
        function drain() {
            while ((buffer.length || ended) && cbs.length) {
                let b = buffer.shift();
                cbs.shift()(buffer.length ? null : ended, b)
            }
            if (!buffer.length && (paused)) {
                paused = false
                stream.resume()
            }
        }

        // stream hooks
        stream.on('error', (error) => {
            ended = error
            drain()
            done();
        });

        stream.on('end', () => {
            ended = true
            drain()
            done();
        });
        stream.on('close', () => {
            ended = true
            drain()
            if (!ended) done();
        });
        stream.on('data', async (row) => {
            buffer.push(row.message)
            drain()
            if (buffer.length && stream.pause) {
                paused = true
                stream.pause()
            }
        });

        const createSource = async (abort, cb) => {
            if (!cb) throw new Error('*must* provide cb')
            if (abort) {
                function onAbort() {
                    while (cbs.length) cbs.shift()(abort)
                    cb(abort)
                }

                //if the stream happens to have already ended, then we don't need to abort.
                if (ended) return onAbort()
                stream.once('close', onAbort)
                // there have been no result in stream,
                // ended gonna be called...
            } else {
                cbs.push(cb)
                drain()
            }
        };

        return pull(
            createSource,
            u.Format(keys, values, false)
        )
    };

    db.createHistoryStream = (streamOpts) => {
        _connect(db.pool)
        let client = clients.shift()
        return _createHistoryStream(streamOpts, client, () => {
            try {
                client.release()
            } catch (e) {
                console.log(e.message) // client already released
            }
        })
    }
    return db;
}
