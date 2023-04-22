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

module.exports = function implementation(db) {

    db.isFollowing = async function (params, cb) {

        var suspendable = async function defn(params) {
            const queryParams = [params.source, params.dest]
            const query = `
            SELECT 
                message 
            FROM 
                message 
            WHERE 
                message->'value'->>'author' = $1 
                AND message->'value'->'content'->>'contact' = $2 
                AND message->'value'->'content'->>'type' = 'contact' 
                ORDER by message->'sequence' desc 
                LIMIT 1
            `
            return await db.pool.query(query, queryParams)
        };
        let result
        let error = null
        try {
            // todo await ?
            result = await suspendable(params)
            if (result.rowCount > 0) {
                if (result.rows[0].message.value.content.following == true) {
                    return cb(null, true)
                }
            }
            return cb(null, false)
        } catch (e) {
            error = e
        }
        return cb(error, false)
    }

    return db;

}
