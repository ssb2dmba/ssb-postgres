const ssbKeys = require("ssb-keys");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const secretStack = require('secret-stack')

const caps = {shs: crypto.randomBytes(32).toString('base64')}


const randomName = () => crypto.randomBytes(16).toString("hex");

module.exports = function createSSB(name = randomName(), opts = {}, plugins) {
    const ssbDb = require('../../');
    const stack = secretStack({caps}).use(ssbDb)
    const dir = path.join(os.tmpdir(), name);

    if (plugins) {
        console.log(plugins)
        plugins.forEach((plugin) => stack.use(plugin))
    }

    opts.keys = opts.keys || ssbKeys.generate()
    if (opts.caps) {
        opts.caps = {shs: opts.caps.shs || caps.shs, sign: opts.caps.sign || null}
    }

    return stack({...opts, path: dir})
};
