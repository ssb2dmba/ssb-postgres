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

    async function selectMessage(pool, key) {
        const text = "select * from message where message->>'key' = ($1)";
        return await pool.query(text, [key]);
    }


    db.get = async function (key, cb) {

        if (typeof key === 'object') {
            meta = key.meta
            key = key.id
        }

        try {
            let data = await selectMessage(db.pool, key);
            if (data.rowCount == 1) {
                cb(null, data.rows[0].message.value)
            } else {
                cb(null, {})
            }
        } catch (e) {
            cb(e, null)
        }
    }


    return db;

}
