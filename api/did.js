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


    async function selectDid(pool, name) {
        const sql = `
        select 
            m1.*
        from message m1 
        where 
            m1.message->'value'->'content'->>'type' = 'about' 
            and m1.message->'value'->'content'->>'name' = ($1) 
            and m1.message->>'key' = (
                select m2.message->>'key' 
                from message m2 
                where m2.message->'value'->'content'->>'type' = 'about' 
                and m1.message->'value'->>'author' = m2.message->'value'->>'author' 
                order by message->'value'->>'sequence' desc limit 1  
                );
            `;
        return await pool.query(sql, [name]);
    }

    db.did = {}
    db.did.get = async function (name, cb) {
        try {
            let data = await selectDid(db.pool, name);
            if (data.rowCount > 0) {
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
