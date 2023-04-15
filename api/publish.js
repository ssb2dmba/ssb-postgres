module.exports = function implementation(db) {


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

    db.add = function (msg, cb) {
        db.queue(msg, async function (err, data) {
            if (err) {
                cb(err)
            } else {
                insertMessage(db.pool, data);
                setTimeout(() => { // setTimeout help test works ...
                    cb(null, data)
                }, 50)
            }
        })
    }

    return db;

}
