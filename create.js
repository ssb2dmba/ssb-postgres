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

'use strict'

var join = require('path').join
var createDB = require('./db')

module.exports = function create(path, opts, keys) {
    let db = createDB(keys, opts);
    db.opts = opts
    // wrap with a use api/* function ...
    db = require('./pool.js')(db)
    db = require('./api/createHistoryStream.js')(db)
    db = require('./api/publish.js')(db)
    db = require('./api/get.js')(db)
    db = require('./api/last.js')(db)
    db = require('./api/friends.js')(db)
    db = require('./api/did.js')(db)
    
    db.createFeed = function (keys) {
        if (!keys) throw Error()

        //if (!keys) keys = ssbKeys.generate()
        function add(content, cb) {
            // LEGACY: hacks to support add as a continuable
            if (!cb) {
                return function (cb) {
                    add(content, cb)
                }
            }
            db.append({content: content, keys: keys}, (err, message) => {
                setImmediate(() => {
                    cb(err, message)
                })
            })
        }

        return {
            add: add,
            publish: add,
            id: keys.id,
            keys: keys
        }
    }

    return db
}
