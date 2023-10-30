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
const create = require('./create')
const valid = require('./lib/validators');
const version = require('./package.json').version;

const manifest = {
    add: 'async',
    publish: 'async',
    createHistoryStream: 'source',
    get: 'async',
    //getVectorClock: 'async',
    //add: 'async',
    //createFeedStream: 'source',
    //createLogStream: 'source',
    //createRawLogStream: 'source',
    //createSequenceStream: 'source',
    //createUserStream: 'source',
    //createWriteStream: 'sink',
    //del: 'async',
    //messagesByType: 'source',
    //getLatest: 'async',
    //status: 'sync',
    //version: 'sync',
};

module.exports = {
    manifest: manifest,
    permissions: {
        master: {allow: ['publish', 'invite,create','invite,use'], deny: null},
        anonymous: {allow: ['publish', 'invite,use', 'createHistoryStream']}
    },
    init: function (api, opts) {

        // main interface
        const ssb = create(opts.path, opts, opts.keys);

        //treat the main feed as remote, because it's likely handled like that by others.
        const feed = ssb.createFeed(opts.keys, {remote: true});

        return self = {
            keys: opts.keys,
            id: opts.keys.id,
            whoami: () => {
                return {id: opts.keys.id}
            },
            version: () => version,
            ready: () => ssb.ready.value,
            publish: valid.async(feed.add, 'string|msgContent'),
            add: valid.async(ssb.add, 'string|msgContent'),
            createHistoryStream: valid.source(ssb.createHistoryStream, ['createHistoryStreamOpts'], ['feedId', 'number?', 'boolean?']),
            get: valid.async(ssb.get, 'msgLink|number|object'),
            isFollowing: ssb.isFollowing,
            addBoxer: ssb.addBoxer, // used by ssb-private
            addUnboxer: ssb.addUnboxer,
            pool: ssb.pool, // kindly expose pg pool API
            createFeed: ssb.createFeed, // for the server to publish itself & tests
            post: ssb.post,
            last: {
                get: ssb.last.get
            },
            did: {
                get: ssb.did.get
            },
            friends: { // for compat with ssb-invite
                isFollowing: ssb.isFollowing
            }

        }
    }
}
